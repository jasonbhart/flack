<script lang="ts">
  let {
    count,
    dividerRef = $bindable<HTMLElement | null>(null),
  }: {
    /** Number of unread messages */
    count: number;
    /** Bindable ref for scroll-to functionality */
    dividerRef?: HTMLElement | null;
  } = $props();

  const label = $derived(count === 1 ? "1 new message" : `${count} new messages`);
</script>

<!--
  Unread divider separator
  - Horizontal line with centered label
  - Red accent for visibility
  - Accessible with role="separator"
-->
<div
  bind:this={dividerRef}
  role="separator"
  aria-label="{label} below"
  class="flex items-center gap-3 py-2 px-2"
>
  <!-- Left line -->
  <div class="flex-1 h-px bg-red-500/50"></div>

  <!-- Label -->
  <span class="text-xs font-medium text-red-500 uppercase tracking-wide shrink-0">
    {label}
  </span>

  <!-- Right line -->
  <div class="flex-1 h-px bg-red-500/50"></div>
</div>
