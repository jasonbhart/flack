<script lang="ts">
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
    }
  }

  // Calculate rows based on newlines (min 1, max 5)
  let rows = $derived(Math.min(5, Math.max(1, inputValue.split("\n").length)));
</script>

<div class="p-2 border-t border-ink-700/30">
  <textarea
    bind:this={inputRef}
    bind:value={inputValue}
    onkeydown={handleKeydown}
    oninput={handleInput}
    {disabled}
    {rows}
    placeholder="Type a message..."
    class="w-full px-3 py-2 rounded bg-ink-800/50 text-[var(--text-primary)]
           placeholder:text-[var(--text-secondary)] resize-none
           focus:outline-none focus:ring-2 focus:ring-volt
           disabled:opacity-50 disabled:cursor-not-allowed"
  ></textarea>
</div>
