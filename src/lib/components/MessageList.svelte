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
  // 1. New messages are added (count increases)
  // 2. Context switches (e.g., channel change - first message ID changes)
  // Does NOT scroll when existing messages change status (pending → confirmed)
  $effect(() => {
    const currentFirstId = messages[0]?.clientMutationId;
    const isContextSwitch = currentFirstId !== prevFirstMessageId;
    const hasNewMessages = messages.length > prevMessageCount;

    if ((hasNewMessages || isContextSwitch) && containerRef) {
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
