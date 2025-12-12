<script lang="ts">
  import { notificationService } from "$lib/services/NotificationService.svelte";

  interface Props {
    onEnable: () => void;
    onDismiss: () => void;
  }

  let { onEnable, onDismiss }: Props = $props();
  let requesting = $state(false);

  async function handleEnable() {
    requesting = true;
    try {
      const result = await notificationService.requestPermission();
      if (result === "granted") {
        notificationService.setEnabled(true);
      }
      onEnable();
    } finally {
      requesting = false;
    }
  }

  function handleDismiss() {
    notificationService.dismissPrompt();
    onDismiss();
  }
</script>

<!-- Live region for screen readers -->
<div
  role="alert"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>
  Enable notifications to get alerted when new messages arrive.
</div>

<div
  class="fixed bottom-4 right-4 z-50 max-w-sm bg-ink-800 border border-ink-700 rounded-lg shadow-lg p-4"
>
  <div class="flex items-start gap-3">
    <!-- Bell icon -->
    <div class="flex-shrink-0 p-2 bg-volt/10 rounded-full">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 text-volt"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    </div>

    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-medium text-paper-50">
        Enable notifications?
      </h3>
      <p class="mt-1 text-sm text-paper-400">
        Get alerted when new messages arrive, even when you're in another tab.
      </p>

      <div class="mt-3 flex gap-2">
        <button
          onclick={handleEnable}
          disabled={requesting}
          class="px-3 py-1.5 text-sm font-medium bg-volt text-ink-900 rounded hover:bg-volt/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {requesting ? "Enabling..." : "Enable"}
        </button>
        <button
          onclick={handleDismiss}
          disabled={requesting}
          class="px-3 py-1.5 text-sm font-medium text-paper-400 hover:text-paper-200 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>

    <!-- Close button -->
    <button
      onclick={handleDismiss}
      class="flex-shrink-0 p-1 text-paper-500 hover:text-paper-300 rounded transition-colors"
      aria-label="Dismiss notification prompt"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>
</div>
