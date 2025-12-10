<script lang="ts">
  import { formatRelativeTime } from "$lib/utils/time";

  interface Message {
    _id?: string;
    clientMutationId: string;
    authorName: string;
    body: string;
    _creationTime?: number;
    status?: "pending" | "sending" | "confirmed" | "failed";
  }

  let {
    message,
    isGrouped = false,
    onRetry,
  }: {
    message: Message;
    isGrouped?: boolean;
    onRetry?: (clientMutationId: string) => void;
  } = $props();
</script>

<div
  class="px-2 {isGrouped ? 'py-0.5' : 'py-1'}"
  class:opacity-60={message.status === "pending" || message.status === "sending"}
>
  {#if !isGrouped}
    <div class="flex items-baseline gap-2">
      <span class="font-semibold text-sm">{message.authorName}</span>
      <span class="text-xs text-[var(--text-secondary)]">
        {formatRelativeTime(message._creationTime)}
      </span>
    </div>
  {/if}

  <div class="text-sm" class:text-danger={message.status === "failed"}>
    {message.body}
  </div>

  {#if message.status === "failed"}
    <div class="flex items-center gap-2 mt-1">
      <span class="text-xs text-danger">Failed to send</span>
      {#if onRetry}
        <button
          onclick={() => onRetry(message.clientMutationId)}
          class="text-xs text-volt hover:underline"
        >
          Retry
        </button>
      {/if}
    </div>
  {/if}
</div>
