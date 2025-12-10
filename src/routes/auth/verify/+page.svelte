<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { useConvexClient } from "convex-svelte";
  import { api } from "../../../../convex/_generated/api";
  import { authStore } from "$lib/stores/auth.svelte";

  const client = useConvexClient();

  let status = $state<"verifying" | "success" | "error">("verifying");
  let errorMessage = $state("");

  // Read token from URL fragment (hash) for security - fragments aren't sent
  // to servers or logged in referrer headers
  $effect(() => {
    if (!browser) return;

    const hash = window.location.hash;
    const token = hash.startsWith("#token=") ? hash.slice(7) : null;

    if (!token) {
      status = "error";
      errorMessage = "Missing verification token";
      return;
    }

    verifyToken(token);
  });

  async function verifyToken(token: string) {
    try {
      const result = await client.mutation(api.auth.verifyMagicLink, { token });

      authStore.setSession(result.sessionToken, {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      });

      status = "success";

      // Redirect to home after short delay
      setTimeout(() => {
        goto("/");
      }, 1500);
    } catch (error) {
      status = "error";
      errorMessage =
        error instanceof Error ? error.message : "Verification failed";
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
  <div class="max-w-md w-full p-8 text-center">
    {#if status === "verifying"}
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
        <h1 class="text-xl font-bold mb-2">Verifying...</h1>
        <p class="text-[var(--text-secondary)]">
          Please wait while we sign you in.
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
        <h1 class="text-xl font-bold mb-2">You're in!</h1>
        <p class="text-[var(--text-secondary)]">Redirecting you to Flack...</p>
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
        <h1 class="text-xl font-bold mb-2">Verification failed</h1>
        <p class="text-[var(--text-secondary)] mb-4">{errorMessage}</p>
        <a
          href="/auth/login"
          class="inline-block px-4 py-2 bg-volt text-white rounded hover:bg-volt/90 transition-colors"
        >
          Try again
        </a>
      </div>
    {/if}
  </div>
</div>
