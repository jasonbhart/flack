<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { useConvexClient, useQuery } from "convex-svelte";
  import { api } from "../../../../convex/_generated/api";
  import { authStore } from "$lib/stores/auth.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";

  // Get Convex client
  const client = useConvexClient();

  // Get token from URL
  const token = $derived($page.params.token);

  // State
  let isRedeeming = $state(false);
  let error = $state<string | null>(null);
  let redeemed = $state(false);

  // Check if authenticated
  const sessionQuery = useQuery(
    api.auth.getSession,
    () => ({ sessionToken: authStore.sessionToken ?? undefined })
  );

  // Handle redemption
  async function redeemInvite() {
    if (!authStore.sessionToken || isRedeeming) return;

    isRedeeming = true;
    error = null;

    try {
      const result = await client.mutation(api.channelInvites.redeem, {
        sessionToken: authStore.sessionToken,
        token,
      });

      redeemed = true;

      // Clear any pending invite from localStorage
      if (browser) {
        localStorage.removeItem("pendingInvite");
      }

      // Redirect to the channel
      goto(`/?channel=${result.channelId}`);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to join channel";
      isRedeeming = false;
    }
  }

  // Handle unauthenticated flow
  $effect(() => {
    // Wait for session query to resolve
    if (sessionQuery.data === undefined) return;

    if (sessionQuery.data === null) {
      // Not authenticated - store token and redirect to login
      if (browser) {
        localStorage.setItem("pendingInvite", token);
        goto("/auth/login");
      }
    } else if (!redeemed && !isRedeeming) {
      // Authenticated - redeem the invite
      redeemInvite();
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
  <div class="max-w-md w-full p-8">
    {#if error}
      <div class="text-center">
        <div class="mb-6">
          <svg class="w-16 h-16 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 class="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Unable to join channel
        </h1>
        <p class="text-[var(--text-secondary)] mb-6">
          {error}
        </p>
        <a
          href="/"
          class="inline-block px-6 py-2 bg-volt text-white rounded hover:bg-volt/90 transition-colors"
        >
          Go to Flack
        </a>
      </div>
    {:else}
      <div class="text-center">
        <div class="mb-6">
          <div class="w-16 h-16 mx-auto border-4 border-[var(--text-tertiary)] border-t-volt rounded-full animate-spin"></div>
        </div>
        <h1 class="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Joining channel...
        </h1>
        <p class="text-[var(--text-secondary)]">
          Please wait while we add you to the channel.
        </p>
      </div>
    {/if}
  </div>
</div>
