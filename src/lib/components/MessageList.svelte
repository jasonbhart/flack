<script lang="ts">
  import MessageItem from "./MessageItem.svelte";

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
  }: {
    messages: Message[];
    onRetry?: (clientMutationId: string) => void;
  } = $props();

  let containerRef: HTMLDivElement;

  // Track previous state to detect new messages vs status changes vs context switches
  let prevMessageCount = 0;
  let prevFirstMessageId: string | undefined = undefined;

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
    const isNearBottom = distanceFromBottom < 100;

    // Always scroll on context switch (channel change)
    // Only scroll on new messages if user is already near bottom
    if (isContextSwitch || (hasNewMessages && isNearBottom)) {
      containerRef.scrollTop = containerRef.scrollHeight;
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

<div bind:this={containerRef} class="flex-1 overflow-y-auto p-2">
  {#each messages as message, i (message.clientMutationId)}
    <MessageItem {message} isGrouped={isGrouped(i)} {onRetry} />
  {/each}

  {#if messages.length === 0}
    <div class="text-center text-[var(--text-secondary)] py-8">
      No messages yet. Start the conversation!
    </div>
  {/if}
</div>
