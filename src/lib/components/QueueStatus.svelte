<script lang="ts">
  let {
    queueCount,
    isSyncing,
  }: {
    queueCount: number;
    isSyncing: boolean;
  } = $props();

  const shouldShow = $derived(queueCount > 0 || isSyncing);
</script>

{#if shouldShow}
  <div
    class="fixed bottom-20 right-4 flex items-center gap-2 bg-ink-800 text-white px-3 py-2 rounded-full text-sm shadow-lg"
  >
    {#if isSyncing}
      <svg
        class="animate-spin h-4 w-4 text-volt"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <span>Syncing...</span>
    {:else if queueCount > 0}
      <span class="bg-volt text-ink-900 rounded-full px-2 py-0.5 text-xs font-bold">
        {queueCount}
      </span>
      <span>pending</span>
    {/if}
  </div>
{/if}
