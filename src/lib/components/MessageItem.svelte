<script lang="ts">
  import { formatRelativeTime, formatFullTimestamp } from "$lib/utils/time";
  import { tokenize } from "$lib/utils/messageParser";
  import MentionSpan from "./MentionSpan.svelte";
  import SpecialMentionSpan from "./SpecialMentionSpan.svelte";
  import UrlLink from "./UrlLink.svelte";
  import InlineCode from "./InlineCode.svelte";
  import CodeBlock from "./CodeBlock.svelte";
  import type { Id } from "../../../convex/_generated/dataModel";

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
    /** Map of username -> userId for resolving mentions */
    mentionMap?: Record<string, string>;
  }

  let {
    message,
    isGrouped = false,
    onRetry,
    currentUserId = null,
  }: {
    message: Message;
    isGrouped?: boolean;
    onRetry?: (clientMutationId: string) => void;
    /** Current user's ID for highlighting self-mentions */
    currentUserId?: Id<"users"> | null;
  } = $props();

  const isFailed = $derived(message.status === "failed");
  const isMaxRetriesReached = $derived(
    isFailed && (message.retryCount ?? 0) >= MAX_RETRIES
  );

  // Tokenize message body for mention rendering, passing mentionMap for userId resolution
  const messageTokens = $derived(tokenize(message.body, message.mentionMap));
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
    {#each messageTokens as token}
      {#if token.type === "text"}
        {token.content}
      {:else if token.type === "mention"}
        <MentionSpan
          username={token.username ?? ""}
          userId={token.userId}
          {currentUserId}
        />
      {:else if token.type === "special-mention" && token.specialType}
        <SpecialMentionSpan type={token.specialType} />
      {:else if token.type === "url" && token.url}
        <UrlLink url={token.url} displayText={token.content} />
      {:else if token.type === "inline-code"}
        <InlineCode code={token.content} />
      {:else if token.type === "code-block"}
        <CodeBlock code={token.content} language={token.language} />
      {/if}
    {/each}
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
