<script lang="ts">
  let {
    isOpen = false,
    onclick,
  }: {
    /** Whether the menu is open (controls icon state) */
    isOpen: boolean;
    /** Click handler to toggle menu */
    onclick: () => void;
  } = $props();
</script>

<!--
  HamburgerButton Component
  - Toggles between hamburger (closed) and X (open) icons
  - Accessible with aria-label and aria-expanded
  - Animated icon transition
-->
<button
  type="button"
  {onclick}
  aria-label={isOpen ? "Close menu" : "Open menu"}
  aria-expanded={isOpen}
  aria-controls="mobile-nav-drawer"
  class="p-2 rounded-lg text-[var(--text-secondary)]
         hover:bg-ink-700/50 hover:text-[var(--text-primary)]
         focus:outline-none focus:ring-2 focus:ring-volt focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]
         transition-colors"
>
  {#if isOpen}
    <!-- X icon (close) -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  {:else}
    <!-- Hamburger icon (menu) -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  {/if}
</button>
