<script lang="ts">
  import { goto } from "$app/navigation";
  import { useConvexClient } from "convex-svelte";
  import { api } from "../../../../convex/_generated/api";
  import { authStore } from "$lib/stores/auth.svelte";

  const client = useConvexClient();

  let email = $state("");
  let code = $state("");
  let status = $state<"idle" | "sending" | "sent" | "verifying" | "error" | "rate-limited">(
    "idle"
  );
  let errorMessage = $state("");
  let rateLimitCountdown = $state(0);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Parse rate limit error from ConvexError data
  function parseRateLimitError(error: unknown): number | null {
    if (error && typeof error === "object" && "data" in error) {
      const data = (error as { data: unknown }).data;
      if (data && typeof data === "object" && "retryAfterSeconds" in data) {
        return (data as { retryAfterSeconds: number }).retryAfterSeconds;
      }
    }
    // Also check error message for "Too many" pattern
    if (error instanceof Error && error.message.toLowerCase().includes("too many")) {
      return 60; // Default to 60 seconds if can't parse
    }
    return null;
  }

  function startRateLimitCountdown(seconds: number) {
    rateLimitCountdown = seconds;
    status = "rate-limited";

    // Clear any existing interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
      rateLimitCountdown--;
      if (rateLimitCountdown <= 0) {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        status = "idle";
        errorMessage = "";
      }
    }, 1000);
  }

  // Redirect if already logged in
  $effect(() => {
    if (authStore.isAuthenticated) {
      goto("/");
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (!email.trim()) {
      status = "error";
      errorMessage = "Please enter your email";
      return;
    }

    status = "sending";
    errorMessage = "";

    try {
      await client.mutation(api.auth.sendMagicLink, { email: email.trim() });
      status = "sent";
    } catch (error) {
      // Check for rate limit error
      const retryAfter = parseRateLimitError(error);
      if (retryAfter !== null) {
        errorMessage = `Too many requests. Please wait ${retryAfter} seconds.`;
        startRateLimitCountdown(retryAfter);
      } else {
        status = "error";
        errorMessage =
          error instanceof Error ? error.message : "Failed to send login link";
      }
    }
  }

  async function handleCodeSubmit(e: Event) {
    e.preventDefault();

    if (!code.trim()) {
      status = "error";
      errorMessage = "Please enter the verification code";
      return;
    }

    status = "verifying";
    errorMessage = "";

    try {
      const result = await client.mutation(api.auth.verifyCode, {
        email: email.trim(),
        code: code.trim(),
      });

      if (!result.success) {
        // Mutation succeeded but verification failed - state changes persisted
        status = "sent"; // Go back to code entry state
        errorMessage = result.error ?? "Verification failed";
        return;
      }

      // Success - result.sessionToken and result.user are guaranteed to exist
      authStore.setSession(result.sessionToken!, {
        id: result.user!.id,
        email: result.user!.email,
        name: result.user!.name,
      });

      goto("/");
    } catch (error) {
      // Network/unexpected errors
      status = "sent"; // Go back to code entry state
      errorMessage =
        error instanceof Error ? error.message : "Verification failed";
    }
  }

  function resetForm() {
    status = "idle";
    email = "";
    code = "";
    errorMessage = "";
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
  <div class="max-w-md w-full p-8">
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-volt mb-2">Flack</h1>
      <p class="text-[var(--text-secondary)]">Instant team communication</p>
    </div>

    {#if status === "sent" || status === "verifying"}
      <div class="space-y-6">
        <div class="text-center">
          <div
            class="w-16 h-16 mx-auto mb-4 rounded-full bg-volt/20 flex items-center justify-center"
          >
            <svg class="w-8 h-8 text-volt" fill="none" viewBox="0 0 24 24">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              ></path>
            </svg>
          </div>
          <h2 class="text-xl font-bold mb-2">Check your email</h2>
          <p class="text-[var(--text-secondary)]">
            We sent a sign-in link to<br />
            <span class="font-medium text-[var(--text-primary)]">{email}</span>
          </p>
        </div>

        <!-- Divider with "or" -->
        <div class="relative py-4">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-[var(--border-default)]"></div>
          </div>
          <div class="relative flex justify-center">
            <span class="px-3 text-sm text-[var(--text-tertiary)] bg-[var(--bg-primary)]">or enter code</span>
          </div>
        </div>

        <form onsubmit={handleCodeSubmit} class="space-y-4">
          <label for="code" class="sr-only">6-digit verification code</label>
          <input
            id="code"
            type="text"
            bind:value={code}
            placeholder="000000"
            maxlength="6"
            inputmode="numeric"
            pattern="[0-9]*"
            disabled={status === "verifying"}
            aria-required="true"
            aria-invalid={errorMessage ? "true" : undefined}
            aria-describedby={errorMessage ? "code-error" : undefined}
            class="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-volt focus:border-transparent disabled:opacity-50"
          />

          {#if errorMessage}
            <p id="code-error" role="alert" class="text-red-500 text-sm text-center">{errorMessage}</p>
          {/if}

          <button
            type="submit"
            disabled={status === "verifying" || code.length !== 6}
            class="w-full py-3 px-4 bg-volt text-white font-medium rounded-lg hover:bg-volt/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {#if status === "verifying"}
              <svg
                class="w-5 h-5 animate-spin"
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
              Verifying...
            {:else}
              Verify Code
            {/if}
          </button>
        </form>

        <button onclick={resetForm} class="w-full text-volt hover:underline text-sm">
          Use a different email
        </button>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label
            for="email"
            class="block text-sm font-medium text-[var(--text-secondary)] mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="you@example.com"
            disabled={status === "sending" || status === "rate-limited"}
            aria-required="true"
            aria-invalid={status === "error" || status === "rate-limited" ? "true" : undefined}
            aria-describedby={status === "error" || status === "rate-limited" ? "email-error" : undefined}
            class="w-full px-4 py-3 text-base rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-volt focus:border-transparent disabled:opacity-50"
          />
        </div>

        {#if status === "error" || status === "rate-limited"}
          <p id="email-error" role="alert" class="text-red-500 text-sm">{errorMessage}</p>
        {/if}

        <button
          type="submit"
          disabled={status === "sending" || status === "rate-limited"}
          class="w-full py-3 px-4 bg-volt text-white font-medium rounded-lg hover:bg-volt/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {#if status === "sending"}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
            Sending...
          {:else if status === "rate-limited"}
            <!-- Clock icon + countdown -->
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            Wait {rateLimitCountdown}s
          {:else}
            Continue with Email
          {/if}
        </button>
      </form>

      <p class="text-center text-sm text-[var(--text-tertiary)] mt-6">
        We'll send you a magic link to sign in.<br />
        No password needed.
      </p>
    {/if}
  </div>
</div>
