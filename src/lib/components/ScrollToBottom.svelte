<script lang="ts">
  interface Props {
    unreadCount?: number;
    onClick: () => void;
  }

  let { unreadCount = 0, onClick }: Props = $props();

  const displayCount = $derived(unreadCount > 99 ? "99+" : unreadCount.toString());
</script>

<button
  onclick={onClick}
  aria-label={unreadCount > 0 ? `Scroll to bottom, ${unreadCount} new messages` : "Scroll to bottom"}
  class="absolute bottom-4 right-4 z-10 p-2.5 rounded-full bg-volt text-white shadow-lg hover:bg-volt/90 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-volt focus:ring-offset-2"
>
  <!-- Down arrow icon -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="h-5 w-5"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fill-rule="evenodd"
      d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
      clip-rule="evenodd"
    />
  </svg>

  <!-- Unread count badge -->
  {#if unreadCount > 0}
    <span
      class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 flex items-center justify-center px-1 text-xs font-bold bg-danger text-white rounded-full"
    >
      {displayCount}
    </span>
  {/if}
</button>
