<script lang="ts">
  import { responsive } from "$lib/utils/responsive.svelte";

  let {
    onSend,
    onTyping,
    disabled = false,
    inputRef = $bindable<HTMLTextAreaElement | undefined>(),
  }: {
    onSend: (message: string) => void;
    /** Optional callback for typing status changes (for presence integration) */
    onTyping?: (isTyping: boolean) => void;
    disabled?: boolean;
    inputRef?: HTMLTextAreaElement;
  } = $props();

  let inputValue = $state("");
  let typingTimeout: ReturnType<typeof setTimeout> | null = $state(null);
  let statusMessage = $state("");

  // Derived state for send button
  const canSend = $derived(inputValue.trim().length > 0 && !disabled);

  function handleKeydown(e: KeyboardEvent) {
    // Enter without Shift sends the message
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    // Shift+Enter allows newline (default behavior)
  }

  function handleInput() {
    // Notify typing status via optional callback
    onTyping?.(true);

    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Set timeout to clear typing after 3s of inactivity
    typingTimeout = setTimeout(() => {
      onTyping?.(false);
      typingTimeout = null;
    }, 3000);
  }

  function send() {
    const trimmed = inputValue.trim();
    if (trimmed && !disabled) {
      // Clear typing state
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
      onTyping?.(false);

      onSend(trimmed);
      inputValue = "";

      // Announce message sent for screen readers
      statusMessage = "Message sent";
      // Clear after announcement
      setTimeout(() => {
        statusMessage = "";
      }, 1000);
    }
  }

  // Calculate rows based on newlines (min 1, max 5)
  let rows = $derived(Math.min(5, Math.max(1, inputValue.split("\n").length)));
</script>

<!-- Live region for message send status -->
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>
  {statusMessage}
</div>

<div class="p-2 border-t border-ink-700/30">
  <label for="chat-input" class="sr-only">Type a message</label>
  <div class="flex gap-2 items-end">
    <textarea
      id="chat-input"
      bind:this={inputRef}
      bind:value={inputValue}
      onkeydown={handleKeydown}
      oninput={handleInput}
      {disabled}
      {rows}
      placeholder="Type a message..."
      aria-label="Message input"
      aria-describedby="chat-input-hint"
      class="flex-1 px-3 py-2 rounded bg-ink-800/50 text-[var(--text-primary)]
             text-base placeholder:text-[var(--text-secondary)] resize-none
             focus:outline-none focus:ring-2 focus:ring-volt
             disabled:opacity-50 disabled:cursor-not-allowed"
    ></textarea>
    <!-- Send button (visible on mobile only) -->
    {#if responsive.isMobile}
      <button
        type="button"
        onclick={send}
        disabled={!canSend}
        aria-label="Send message"
        class="p-2 rounded-lg bg-volt text-white
               hover:bg-volt/90 active:bg-volt/80
               focus:outline-none focus:ring-2 focus:ring-volt focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    {/if}
  </div>
  <span id="chat-input-hint" class="sr-only">
    {responsive.isMobile ? "Tap send button or press Enter to send" : "Press Enter to send, Shift+Enter for new line"}
  </span>
</div>
