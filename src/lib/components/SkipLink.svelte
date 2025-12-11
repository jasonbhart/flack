<script lang="ts">
  let { href = "#main-content", label = "Skip to main content" }: {
    /** Target element ID to skip to (default: #main-content) */
    href?: string;
    /** Link text for screen readers (default: Skip to main content) */
    label?: string;
  } = $props();
</script>

<!--
  Skip Link Component
  - Hidden by default using sr-only (visually hidden but accessible)
  - Becomes visible on focus with high contrast styling
  - Position absolute so it doesn't affect layout
  - First focusable element on page for keyboard users
-->
<a
  {href}
  class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100]
         focus:px-4 focus:py-2 focus:bg-volt focus:text-white focus:font-medium
         focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white
         focus:ring-offset-2 focus:ring-offset-volt"
>
  {label}
</a>
