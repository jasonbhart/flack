<script lang="ts">
  interface Props {
    isQuotaExceeded: boolean;
    isQueueFull: boolean;
    isStorageNearlyFull?: boolean;
  }

  let {
    isQuotaExceeded,
    isQueueFull,
    isStorageNearlyFull = false,
  }: Props = $props();

  // Determine which warning to show (priority order)
  const warningType = $derived.by(() => {
    if (isQuotaExceeded) return "quota";
    if (isQueueFull) return "queue";
    if (isStorageNearlyFull) return "nearlyFull";
    return null;
  });

  const warningMessage = $derived.by(() => {
    switch (warningType) {
      case "quota":
        return {
          title: "Storage full",
          message: "Your device storage is full. Messages will continue to send but won't persist if you refresh.",
          severity: "danger",
        };
      case "queue":
        return {
          title: "Queue full",
          message: "Too many pending messages. Please wait for them to send or check your connection.",
          severity: "danger",
        };
      case "nearlyFull":
        return {
          title: "Storage nearly full",
          message: "Your device storage is almost full. Consider waiting for messages to sync.",
          severity: "warning",
        };
      default:
        return null;
    }
  });
</script>

{#if warningMessage}
  <!-- Live region for warning announcement -->
  <div
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
    class="sr-only"
  >
    {warningMessage.title}: {warningMessage.message}
  </div>

  <div
    class="fixed bottom-4 right-4 z-40 max-w-sm p-4 rounded-lg shadow-lg {warningMessage.severity === 'danger' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}"
  >
    <div class="flex items-start gap-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 flex-shrink-0 mt-0.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
      <div>
        <p class="font-semibold">{warningMessage.title}</p>
        <p class="text-sm opacity-90">{warningMessage.message}</p>
      </div>
    </div>
  </div>
{/if}
