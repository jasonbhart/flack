<script lang="ts">
  import MessageItem from "./MessageItem.svelte";
  import EmptyState from "./EmptyState.svelte";
  import ScrollToBottom from "./ScrollToBottom.svelte";

  interface Message {
    _id?: string;
    clientMutationId: string;
    authorName: string;
    body: string;
    _creationTime?: number;
    status?: "pending" | "sending" | "confirmed" | "failed";
  }

  let {
    messages,
    onRetry,
    channelName,
  }: {
    messages: Message[];
    onRetry?: (clientMutationId: string) => void;
    channelName?: string;
  } = $props();

  let containerRef: HTMLDivElement;

  // Track previous state to detect new messages vs status changes vs context switches
  let prevMessageCount = 0;
  let prevFirstMessageId: string | undefined = undefined;

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

  // Auto-scroll to bottom only when:
  // 1. Context switches (e.g., channel change - first message ID changes)
  // 2. New messages arrive AND user is already near the bottom (within 100px)
  // Does NOT scroll when:
  // - User is scrolled up reading history
  // - Existing messages change status (pending → confirmed)
  $effect(() => {
    if (!containerRef) return;

    const currentFirstId = messages[0]?.clientMutationId;
    const isContextSwitch = currentFirstId !== prevFirstMessageId;
    const hasNewMessages = messages.length > prevMessageCount;

    // Check if user is near the bottom (within 100px)
    const distanceFromBottom =
      containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight;
    const atBottom = distanceFromBottom < 100;

    // Always scroll on context switch (channel change)
    // Only scroll on new messages if user is already near bottom
    if (isContextSwitch) {
      containerRef.scrollTop = containerRef.scrollHeight;
      unreadWhileScrolledUp = 0;
    } else if (hasNewMessages) {
      if (atBottom) {
        containerRef.scrollTop = containerRef.scrollHeight;
      } else {
        // User scrolled up - increment unread count
        unreadWhileScrolledUp += messages.length - prevMessageCount;
      }
    }

    prevMessageCount = messages.length;
    prevFirstMessageId = currentFirstId;
  });

  // Determine if message is grouped (same author as previous)
  function isGrouped(index: number): boolean {
    if (index === 0) return false;
    return messages[index - 1]?.authorName === messages[index]?.authorName;
  }
</script>

<div bind:this={containerRef} class="relative flex-1 overflow-y-auto p-2" onscroll={handleScroll}>
  {#each messages as message, i (message.clientMutationId)}
    <MessageItem {message} isGrouped={isGrouped(i)} {onRetry} />
  {/each}

  {#if messages.length === 0}
    <EmptyState variant="messages" {channelName} />
  {/if}

  <!-- Scroll to bottom button - shows when scrolled up >200px -->
  {#if !isNearBottom && messages.length > 0}
    <ScrollToBottom unreadCount={unreadWhileScrolledUp} onClick={scrollToBottom} />
  {/if}
</div>
