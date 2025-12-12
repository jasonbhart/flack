<script lang="ts">
  import MessageItem from "./MessageItem.svelte";
  import EmptyState from "./EmptyState.svelte";
  import ScrollToBottom from "./ScrollToBottom.svelte";
  import UnreadDivider from "./UnreadDivider.svelte";
  import JumpToNewButton from "./JumpToNewButton.svelte";
  import { unreadCounts } from "$lib/stores/unreadCounts.svelte";
  import { presenceManager } from "$lib/stores/presence.svelte";
  import type { Id } from "../../../convex/_generated/dataModel";

  interface Message {
    _id?: string;
    clientMutationId: string;
    authorName: string;
    body: string;
    _creationTime?: number;
    status?: "pending" | "sending" | "confirmed" | "failed";
    /** Map of username -> userId for resolving mentions */
    mentionMap?: Record<string, string>;
  }

  let {
    messages,
    onRetry,
    channelName,
    channelId = null,
    currentUserId = null,
    dividerRef = $bindable<HTMLElement | null>(null),
    isDividerVisible = $bindable(true),
  }: {
    messages: Message[];
    onRetry?: (clientMutationId: string) => void;
    channelName?: string;
    /** Channel ID for calculating divider position */
    channelId?: Id<"channels"> | null;
    /** Current user's ID for highlighting self-mentions */
    currentUserId?: Id<"users"> | null;
    /** Bindable ref to divider element for scroll-to functionality */
    dividerRef?: HTMLElement | null;
    /** Bindable state for divider visibility (for JumpToNew button) */
    isDividerVisible?: boolean;
  } = $props();

  let containerRef: HTMLDivElement;

  // Track previous state to detect new messages vs context switches
  let prevMessageCount = 0;
  let prevChannelId = channelId;

  // Scroll position tracking for ScrollToBottom button
  let isNearBottom = $state(true);
  let unreadWhileScrolledUp = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounced scroll handler
  function handleScroll() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!containerRef) return;
      const distanceFromBottom =
        containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight;
      const wasNearBottom = isNearBottom;
      isNearBottom = distanceFromBottom < 200;

      // When user scrolls back to bottom, mark channel as read and reset unread count
      if (!wasNearBottom && isNearBottom) {
        unreadWhileScrolledUp = 0;
        // Mark as read when reaching the bottom - dismisses unread divider
        if (channelId) {
          unreadCounts.markAsReadIfNewer(channelId, Date.now());
        }
      }
    }, 100);
  }

  // Scroll to bottom with smooth animation
  function scrollToBottom() {
    if (containerRef) {
      containerRef.scrollTo({
        top: containerRef.scrollHeight,
        behavior: "smooth"
      });
      unreadWhileScrolledUp = 0;
    }
  }

  // Track if we should auto-scroll to divider on channel switch
  let hasScrolledToDivider = false;

  // Auto-scroll behavior:
  // 1. On context switch (channel change) - detected via channelId prop:
  //    - If there's an unread divider, scroll to it
  //    - Otherwise scroll to bottom
  // 2. New messages arrive AND user is near bottom: scroll to bottom
  // 3. User scrolled up: don't auto-scroll, track unread count
  $effect(() => {
    if (!containerRef) return;

    // Use channelId for robust context switch detection (handles empty channels)
    const isContextSwitch = channelId !== prevChannelId;
    const hasNewMessages = messages.length > prevMessageCount;

    // Check if user is near the bottom (within 100px)
    const distanceFromBottom =
      containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight;
    const atBottom = distanceFromBottom < 100;

    if (isContextSwitch) {
      // Reset scroll-to-divider flag on channel switch
      hasScrolledToDivider = false;
      unreadWhileScrolledUp = 0;

      // Defer scroll to allow DOM to update with divider
      requestAnimationFrame(() => {
        if (localDividerRef && !hasScrolledToDivider) {
          // Scroll to unread divider
          localDividerRef.scrollIntoView({ behavior: "smooth", block: "center" });
          hasScrolledToDivider = true;
        } else if (containerRef) {
          // No divider - scroll to bottom
          containerRef.scrollTop = containerRef.scrollHeight;
        }
      });
    } else if (hasNewMessages) {
      if (atBottom) {
        containerRef.scrollTop = containerRef.scrollHeight;
      } else {
        // User scrolled up - increment unread count
        unreadWhileScrolledUp += messages.length - prevMessageCount;
      }
    }

    prevMessageCount = messages.length;
    prevChannelId = channelId;
  });

  // Scroll to divider (used by JumpToNewButton)
  function scrollToDivider() {
    if (localDividerRef) {
      localDividerRef.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Determine if message is grouped (same author as previous)
  function isGrouped(index: number): boolean {
    if (index === 0) return false;
    return messages[index - 1]?.authorName === messages[index]?.authorName;
  }

  // Calculate divider info (where to show "X new messages" separator)
  // Filters out current user's pending/sending messages so they don't appear as "unread"
  const dividerInfo = $derived.by(() => {
    if (!channelId) return null;

    // Get current user's name to filter out their pending messages
    const currentUserName = presenceManager.getUserName();

    // Build filtered list with original indices tracked
    // We need to map back to original indices for rendering the divider
    const filteredWithIndices: { _creationTime: number; originalIndex: number }[] = [];

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      // Skip messages without creation time
      if (m._creationTime === undefined) continue;

      // Skip current user's pending/sending messages (they shouldn't count as unread)
      const isOwnPendingMessage =
        m.authorName === currentUserName &&
        m.status !== undefined &&
        m.status !== "confirmed";

      if (!isOwnPendingMessage) {
        filteredWithIndices.push({
          _creationTime: m._creationTime,
          originalIndex: i,
        });
      }
    }

    // Get divider info based on filtered messages
    const result = unreadCounts.getDividerInfo(
      channelId,
      filteredWithIndices.map((m) => ({ _creationTime: m._creationTime }))
    );

    // Map the result's messageIndex back to original message array index
    if (result && filteredWithIndices[result.messageIndex]) {
      return {
        messageIndex: filteredWithIndices[result.messageIndex].originalIndex,
        unreadCount: result.unreadCount,
      };
    }

    return result;
  });

  // Track divider visibility using IntersectionObserver
  let localDividerRef: HTMLElement | null = $state(null);
  let observer: IntersectionObserver | null = null;
  // Track previous visibility to detect when divider exits view
  let wasDividerVisible = true;

  $effect(() => {
    // Cleanup previous observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Setup new observer if we have a divider
    if (localDividerRef && containerRef) {
      // Reset visibility tracking when divider changes
      wasDividerVisible = true;

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const isVisible = entry.isIntersecting;

            // Detect when divider scrolls out of view toward the top
            // (user scrolled down past it to view new messages)
            if (wasDividerVisible && !isVisible) {
              // Check scroll direction: top < 0 means divider scrolled up (user scrolled down)
              const scrolledDownPastDivider = entry.boundingClientRect.top < 0;

              if (scrolledDownPastDivider && channelId) {
                // User has scrolled past the divider (viewed the new messages)
                // Mark the channel as read to dismiss the divider
                unreadCounts.markAsReadIfNewer(channelId, Date.now());
              }
            }

            // Update visibility state
            isDividerVisible = isVisible;
            wasDividerVisible = isVisible;
          }
        },
        {
          root: containerRef,
          threshold: 0,
        }
      );
      observer.observe(localDividerRef);
    } else {
      // No divider = consider it "visible" (don't show jump button)
      isDividerVisible = true;
      wasDividerVisible = true;
    }

    // Cleanup on unmount
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  });

  // Sync local ref to bindable prop
  $effect(() => {
    dividerRef = localDividerRef;
  });
</script>

<div bind:this={containerRef} class="relative flex-1 overflow-y-auto p-2" onscroll={handleScroll}>
  {#each messages as message, i (message.clientMutationId)}
    <!-- Render divider before the first unread message -->
    {#if dividerInfo && i === dividerInfo.messageIndex}
      <UnreadDivider count={dividerInfo.unreadCount} bind:dividerRef={localDividerRef} />
    {/if}
    <MessageItem {message} isGrouped={isGrouped(i)} {onRetry} {currentUserId} />
  {/each}

  {#if messages.length === 0}
    <EmptyState variant="messages" {channelName} />
  {/if}

  <!-- Jump to new messages button - shows when divider exists but is not visible -->
  {#if dividerInfo && !isDividerVisible}
    <JumpToNewButton unreadCount={dividerInfo.unreadCount} onClick={scrollToDivider} />
  {/if}

  <!-- Scroll to bottom button - shows when scrolled up >200px -->
  {#if !isNearBottom && messages.length > 0}
    <ScrollToBottom unreadCount={unreadWhileScrolledUp} onClick={scrollToBottom} />
  {/if}
</div>
