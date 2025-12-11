<script lang="ts">
  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  const shortcuts = [
    { keys: ["Ctrl", "K"], description: "Quick channel switcher" },
    { keys: ["Ctrl", "N"], description: "Focus message input" },
    { keys: ["?"], description: "Show keyboard shortcuts" },
    { keys: ["Esc"], description: "Close modal / Blur input" },
    { keys: ["↑", "↓"], description: "Navigate channel list" },
    { keys: ["Enter"], description: "Select channel / Send message" },
  ];

  // Handle backdrop click
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  // Handle Escape key
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      class="w-full max-w-md bg-[var(--bg-secondary)] rounded-lg shadow-2xl overflow-hidden"
    >
      <!-- Header -->
      <div class="px-4 py-3 border-b border-[var(--border-default)] flex items-center justify-between">
        <h2 id="shortcuts-title" class="text-lg font-semibold">Keyboard Shortcuts</h2>
        <button
          onclick={onClose}
          aria-label="Close"
          class="p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-[var(--text-secondary)]"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <!-- Shortcuts list -->
      <div class="p-4">
        <dl class="space-y-3">
          {#each shortcuts as shortcut}
            <div class="flex items-center justify-between">
              <dt class="text-sm text-[var(--text-secondary)]">{shortcut.description}</dt>
              <dd class="flex gap-1">
                {#each shortcut.keys as key}
                  <kbd class="px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] rounded border border-[var(--border-default)]">
                    {key}
                  </kbd>
                {/each}
              </dd>
            </div>
          {/each}
        </dl>
      </div>

      <!-- Footer -->
      <div class="px-4 py-3 border-t border-[var(--border-default)] text-xs text-[var(--text-tertiary)]">
        Press <kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Esc</kbd> to close
      </div>
    </div>
  </div>
{/if}
