<script lang="ts">
  interface Props {
    unreadCount?: number;
    onClick: () => void;
  }

  let { unreadCount = 0, onClick }: Props = $props();

  const displayCount = $derived(unreadCount > 99 ? "99+" : unreadCount.toString());
</script>

<!--
  Jump to new messages button
  Similar to ScrollToBottom but positioned at top and scrolls UP to unread divider
-->
<button
  onclick={onClick}
  aria-label={`Jump to ${unreadCount} new messages`}
  class="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 flex items-center gap-2 text-sm font-medium"
>
  <!-- Up arrow icon -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fill-rule="evenodd"
      d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
      clip-rule="evenodd"
    />
  </svg>

  <!-- Label with count -->
  <span>{displayCount} new</span>
</button>
