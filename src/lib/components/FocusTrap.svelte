<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    active = true,
    restoreFocus = true,
    children,
  }: {
    /** Whether focus trapping is active (default: true) */
    active?: boolean;
    /** Whether to restore focus to trigger element when deactivated (default: true) */
    restoreFocus?: boolean;
    /** Content to render inside the focus trap */
    children: Snippet;
  } = $props();

  let containerRef: HTMLDivElement | undefined = $state();
  let previousActiveElement: HTMLElement | null = null;

  // Selector for all focusable elements
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  /**
   * Get all focusable elements within the container
   * Queried dynamically to handle element addition/removal
   */
  function getFocusableElements(): HTMLElement[] {
    if (!containerRef) return [];
    return Array.from(containerRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null); // Filter out hidden elements
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!active || e.key !== 'Tab') return;

    const focusables = getFocusableElements();
    if (focusables.length === 0) return;

    const firstElement = focusables[0];
    const lastElement = focusables[focusables.length - 1];
    const activeElement = document.activeElement as HTMLElement;

    if (e.shiftKey) {
      // Shift+Tab: wrap from first to last
      if (activeElement === firstElement || !focusables.includes(activeElement)) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: wrap from last to first
      if (activeElement === lastElement || !focusables.includes(activeElement)) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Handle focus when trap activates/deactivates
  $effect(() => {
    if (active && containerRef) {
      // Store the element that had focus before trap activated
      previousActiveElement = document.activeElement as HTMLElement;

      // Focus first element in trap
      requestAnimationFrame(() => {
        const focusables = getFocusableElements();
        if (focusables.length > 0) {
          focusables[0].focus();
        }
      });
    }
  });

  // Restore focus when trap deactivates
  $effect(() => {
    return () => {
      if (restoreFocus && previousActiveElement && previousActiveElement.focus) {
        previousActiveElement.focus();
      }
    };
  });
</script>

<!--
  FocusTrap Component
  - Traps Tab/Shift+Tab within container when active
  - Auto-focuses first focusable element on mount
  - Restores focus to trigger element on deactivation
  - Dynamically queries focusables to handle DOM changes
  - Does NOT add role/aria attributes - consumer handles semantics
-->
<div
  bind:this={containerRef}
  onkeydown={handleKeydown}
>
  {@render children()}
</div>
