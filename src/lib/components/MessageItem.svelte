<script lang="ts">
  import { formatRelativeTime, formatFullTimestamp } from "$lib/utils/time";

  const MAX_RETRIES = 5;

  interface Message {
    _id?: string;
    clientMutationId: string;
    authorName: string;
    body: string;
    _creationTime?: number;
    status?: "pending" | "sending" | "confirmed" | "failed";
    error?: string;
    retryCount?: number;
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

  const isFailed = $derived(message.status === "failed");
  const isMaxRetriesReached = $derived(
    isFailed && (message.retryCount ?? 0) >= MAX_RETRIES
  );
</script>

<div
  class="px-2 {isGrouped ? 'py-0.5' : 'py-1'} {isFailed ? 'bg-danger/10 rounded -mx-1 px-3' : ''}"
  style:opacity={message.status === "pending" || message.status === "sending" ? "var(--pending-opacity)" : undefined}
>
  {#if !isGrouped}
    <div class="flex items-baseline gap-2">
      <span class="font-semibold text-sm">{message.authorName}</span>
      <span
        class="text-xs text-[var(--text-secondary)] cursor-default"
        title={formatFullTimestamp(message._creationTime)}
      >
        {formatRelativeTime(message._creationTime)}
      </span>
    </div>
  {/if}

  <div class="text-sm" class:text-danger={isFailed}>
    {message.body}
  </div>

  {#if isFailed}
    <div class="flex flex-wrap items-center gap-2 mt-1.5">
      <!-- Error icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3.5 w-3.5 text-danger flex-shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>

      <span class="text-xs text-danger font-medium">
        {#if isMaxRetriesReached}
          Auto-retry stopped
        {:else}
          Failed to send
        {/if}
      </span>

      {#if message.error}
        <span class="text-xs text-[var(--text-tertiary)]">
          &ndash; {message.error}
        </span>
      {/if}

      {#if onRetry}
        <button
          onclick={() => onRetry(message.clientMutationId)}
          class="ml-auto px-2 py-0.5 text-xs font-medium bg-volt text-white rounded hover:bg-volt/90 transition-colors"
        >
          Retry
        </button>
      {/if}
    </div>
  {/if}
</div>
