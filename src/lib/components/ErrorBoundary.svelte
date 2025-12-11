<script lang="ts">
  interface Props {
    error: Error | string | null;
    onRetry?: () => void;
    context?: string;
  }

  let { error, onRetry, context = "loading" }: Props = $props();

  let isRetrying = $state(false);

  // Get user-friendly error message (hide technical details)
  const errorMessage = $derived.by(() => {
    if (!error) return null;

    const message = typeof error === "string" ? error : error.message;

    // Map common errors to friendly messages
    if (message.includes("network") || message.includes("fetch")) {
      return "Connection problem. Please check your internet and try again.";
    }
    if (message.includes("timeout")) {
      return "Request timed out. Please try again.";
    }
    if (message.includes("unauthorized") || message.includes("401")) {
      return "Your session has expired. Please sign in again.";
    }
    if (message.includes("not found") || message.includes("404")) {
      return "The requested content could not be found.";
    }

    // Generic fallback
    return `Something went wrong while ${context}. Please try again.`;
  });

  async function handleRetry() {
    if (!onRetry || isRetrying) return;

    isRetrying = true;
    try {
      await onRetry();
    } finally {
      isRetrying = false;
    }
  }
</script>

{#if error}
  <div
    role="alert"
    aria-live="assertive"
    class="flex flex-col items-center justify-center p-6 text-center"
  >
    <!-- Error icon -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-12 w-12 text-danger mb-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        clip-rule="evenodd"
      />
    </svg>

    <p class="text-[var(--text-primary)] font-medium mb-2">
      {errorMessage}
    </p>

    {#if onRetry}
      <button
        onclick={handleRetry}
        disabled={isRetrying}
        class="mt-4 px-4 py-2 bg-volt text-white rounded font-medium hover:bg-volt/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {#if isRetrying}
          <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span>Retrying...</span>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clip-rule="evenodd"
            />
          </svg>
          <span>Try Again</span>
        {/if}
      </button>
    {/if}
  </div>
{/if}
