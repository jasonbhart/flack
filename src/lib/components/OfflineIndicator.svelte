<script lang="ts">
  let { isOnline }: { isOnline: boolean } = $props();

  // Track if we've ever been offline this session
  let everWentOffline = $state(false);

  $effect(() => {
    if (!isOnline) everWentOffline = true;
  });

  // Show "back online" message when reconnected after being offline
  const showReconnected = $derived(isOnline && everWentOffline);
</script>

<!-- Live region for offline/online status announcements -->
<div
  role="status"
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
>
  {#if !isOnline}
    You are offline. Messages will be sent when you reconnect.
  {:else if showReconnected}
    You are back online.
  {/if}
</div>

{#if !isOnline}
  <div
    class="fixed top-0 left-0 right-0 z-50 bg-danger text-white py-2 px-4 text-center text-sm"
  >
    You're offline. Messages will be sent when you reconnect.
  </div>
{/if}
