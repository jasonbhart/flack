<script lang="ts">
  import type { Snippet } from "svelte";
  import FocusTrap from "./FocusTrap.svelte";

  let {
    isOpen = $bindable(false),
    children,
  }: {
    /** Whether the drawer is open (bindable) */
    isOpen: boolean;
    /** Content to render inside the drawer */
    children: Snippet;
  } = $props();

  function handleBackdropClick() {
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
    }
  }
</script>

<svelte:window onkeydown={isOpen ? handleKeydown : undefined} />

{#if isOpen}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
    class:opacity-100={isOpen}
    onclick={handleBackdropClick}
    aria-label="Close navigation menu"
    tabindex="-1"
  ></button>

  <!-- Drawer -->
  <FocusTrap active={isOpen}>
    <div
      class="fixed top-0 left-0 z-50 h-full w-[17rem] max-w-[85vw] bg-[var(--bg-secondary)] shadow-xl
             transform transition-transform duration-200 ease-out
             {isOpen ? 'translate-x-0' : '-translate-x-full'}"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      <!-- Close button -->
      <button
        type="button"
        onclick={() => (isOpen = false)}
        class="absolute top-3 right-3 p-2 rounded-lg text-[var(--text-secondary)]
               hover:bg-ink-700/50 hover:text-[var(--text-primary)]
               focus:outline-none focus:ring-2 focus:ring-volt"
        aria-label="Close navigation menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
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

      <!-- Drawer content -->
      <div class="h-full overflow-y-auto px-3 py-4 pt-14">
        {@render children()}
      </div>
    </div>
  </FocusTrap>
{/if}
