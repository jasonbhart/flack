<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { useConvexClient } from "convex-svelte";
  import { api } from "../../../../convex/_generated/api";
  import { authStore } from "$lib/stores/auth.svelte";

  const client = useConvexClient();

  let status = $state<"verifying" | "success" | "error">("verifying");
  let errorMessage = $state("");
  let errorGuidance = $state("");
  let errorType = $state<"expired" | "used" | "invalid" | "missing" | "unknown">("unknown");

  // Parse error message to determine type and provide helpful guidance
  function parseError(message: string): { type: typeof errorType; displayMessage: string; guidance: string } {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("expired") || lowerMessage.includes("15 minutes")) {
      return {
        type: "expired",
        displayMessage: "This link has expired",
        guidance: "Magic links are valid for 15 minutes. Please request a new one."
      };
    }

    if (lowerMessage.includes("already been used") || lowerMessage.includes("used")) {
      return {
        type: "used",
        displayMessage: "This link has already been used",
        guidance: "Each magic link can only be used once. Please request a new one."
      };
    }

    if (lowerMessage.includes("invalid") || lowerMessage.includes("not found")) {
      return {
        type: "invalid",
        displayMessage: "Invalid verification link",
        guidance: "This link may be incomplete or corrupted. Please request a new one."
      };
    }

    if (lowerMessage.includes("missing")) {
      return {
        type: "missing",
        displayMessage: "Missing verification token",
        guidance: "The link appears to be incomplete. Please click the full link from your email."
      };
    }

    return {
      type: "unknown",
      displayMessage: "Verification failed",
      guidance: message || "Something went wrong. Please try again."
    };
  }

  // Read token from URL fragment (hash) for security - fragments aren't sent
  // to servers or logged in referrer headers
  $effect(() => {
    if (!browser) return;

    const hash = window.location.hash;
    const token = hash.startsWith("#token=") ? hash.slice(7) : null;

    if (!token) {
      status = "error";
      const parsed = parseError("Missing verification token");
      errorMessage = parsed.displayMessage;
      errorGuidance = parsed.guidance;
      errorType = parsed.type;
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
      const rawMessage = error instanceof Error ? error.message : "Verification failed";
      const parsed = parseError(rawMessage);
      errorMessage = parsed.displayMessage;
      errorGuidance = parsed.guidance;
      errorType = parsed.type;
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
          {#if errorType === "expired"}
            <!-- Clock icon for expired -->
            <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          {:else if errorType === "used"}
            <!-- Check-circle icon for already used -->
            <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          {:else}
            <!-- X icon for other errors -->
            <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          {/if}
        </div>
        <h1 class="text-xl font-bold mb-2">{errorMessage}</h1>
        <p class="text-[var(--text-secondary)] mb-6">{errorGuidance}</p>
        <a
          href="/auth/login"
          class="inline-block px-6 py-2.5 bg-volt text-white rounded font-medium hover:bg-volt/90 transition-colors"
        >
          Request new link
        </a>
      </div>
    {/if}
  </div>
</div>
