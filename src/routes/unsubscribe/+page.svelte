<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { useConvexClient } from "convex-svelte";
  import { api } from "../../../convex/_generated/api";

  const client = useConvexClient();

  let status = $state<"processing" | "success" | "error">("processing");
  let errorMessage = $state("");

  // Read token from URL query params
  $effect(() => {
    if (!browser) return;

    const token = $page.url.searchParams.get("token");

    if (!token) {
      status = "error";
      errorMessage = "Missing unsubscribe token";
      return;
    }

    processUnsubscribe(token);
  });

  async function processUnsubscribe(token: string) {
    try {
      const result = await client.mutation(api.unsubscribe.unsubscribeByToken, {
        token,
      });

      if (result.success) {
        status = "success";
      } else {
        status = "error";
        if (result.error === "invalid_token") {
          errorMessage = "This unsubscribe link is invalid or has expired";
        } else if (result.error === "user_not_found") {
          errorMessage = "User account not found";
        } else {
          errorMessage = "Something went wrong. Please try again.";
        }
      }
    } catch (error) {
      status = "error";
      errorMessage =
        error instanceof Error ? error.message : "Failed to process unsubscribe";
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
  <div class="max-w-md w-full p-8 text-center">
    {#if status === "processing"}
      <div class="animate-pulse">
        <div
          class="w-16 h-16 mx-auto mb-4 rounded-full bg-volt/20 flex items-center justify-center"
        >
          <svg
            class="w-8 h-8 text-volt animate-spin"
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            ></path>
          </svg>
        </div>
        <h1 class="text-xl font-bold mb-2">Processing...</h1>
        <p class="text-[var(--text-secondary)]">
          Please wait while we update your preferences.
        </p>
      </div>
    {:else if status === "success"}
      <div>
        <div
          class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center"
        >
          <svg class="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
            ></path>
          </svg>
        </div>
        <h1 class="text-xl font-bold mb-2">You've been unsubscribed</h1>
        <p class="text-[var(--text-secondary)] mb-6">
          You will no longer receive email notifications for mentions.
        </p>
        <p class="text-[var(--text-secondary)] text-sm">
          You can re-enable notifications anytime in your
          <a href="/" class="text-volt hover:underline">Flack settings</a>.
        </p>
      </div>
    {:else}
      <div>
        <div
          class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center"
        >
          <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </div>
        <h1 class="text-xl font-bold mb-2">Unable to unsubscribe</h1>
        <p class="text-[var(--text-secondary)] mb-6">{errorMessage}</p>
        <a
          href="/"
          class="inline-block px-6 py-2.5 bg-volt text-white rounded font-medium hover:bg-volt/90 transition-colors"
        >
          Go to Flack
        </a>
      </div>
    {/if}
  </div>
</div>
