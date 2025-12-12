<script lang="ts">
  import MessageItem from "./MessageItem.svelte";
  import EmptyState from "./EmptyState.svelte";
  import ScrollToBottom from "./ScrollToBottom.svelte";
  import UnreadDivider from "./UnreadDivider.svelte";
  import JumpToNewButton from "./JumpToNewButton.svelte";
  import { unreadCounts } from "$lib/stores/unreadCounts.svelte";
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

      // Reset unread count when scrolling back to bottom
      if (!wasNearBottom && isNearBottom) {
        unreadWhileScrolledUp = 0;
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
  const dividerInfo = $derived.by(() => {
    if (!channelId) return null;
    // Convert messages to format expected by getDividerInfo
    const messagesWithTime = messages
      .filter((m) => m._creationTime !== undefined)
      .map((m) => ({ _creationTime: m._creationTime! }));
    return unreadCounts.getDividerInfo(channelId, messagesWithTime);
  });

  // Track divider visibility using IntersectionObserver
  let localDividerRef: HTMLElement | null = $state(null);
  let observer: IntersectionObserver | null = null;

  $effect(() => {
    // Cleanup previous observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Setup new observer if we have a divider
    if (localDividerRef && containerRef) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            isDividerVisible = entry.isIntersecting;
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
