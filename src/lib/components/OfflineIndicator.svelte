<script lang="ts">
  let { isOnline }: { isOnline: boolean } = $props();
</script>

{#if !isOnline}
  <div
    class="fixed top-0 left-0 right-0 z-50 bg-danger text-white py-2 px-4 text-center text-sm"
  >
    You're offline. Messages will be sent when you reconnect.
  </div>
{/if}
