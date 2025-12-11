<script lang="ts">
  import { useConvexClient } from "convex-svelte";
  import { api } from "../../../convex/_generated/api";
  import type { Id } from "../../../convex/_generated/dataModel";
  import FocusTrap from "./FocusTrap.svelte";

  interface Props {
    isOpen: boolean;
    sessionToken: string;
    onClose: () => void;
    onCreate: (channelId: Id<"channels">) => void;
  }

  let { isOpen, sessionToken, onClose, onCreate }: Props = $props();

  // Get Convex client for mutations
  const client = useConvexClient();

  // Form state
  let channelName = $state("");
  let isCreating = $state(false);
  let error = $state<string | null>(null);

  // Input ref for focus
  let inputRef: HTMLInputElement | undefined = $state();

  // Reset state when modal opens
  $effect(() => {
    if (isOpen) {
      channelName = "";
      error = null;
      isCreating = false;
      requestAnimationFrame(() => {
        inputRef?.focus();
      });
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();

    const trimmedName = channelName.trim();
    if (!trimmedName) {
      error = "Channel name is required";
      return;
    }

    isCreating = true;
    error = null;

    try {
      const result = await client.mutation(api.channels.create, {
        sessionToken,
        name: trimmedName,
      });
      onCreate(result.channelId);
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to create channel";
    } finally {
      isCreating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <FocusTrap active={isOpen}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-channel-title"
        class="w-full max-w-md bg-[var(--bg-secondary)] rounded-lg shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="px-4 py-3 border-b border-[var(--border-default)]">
          <h2 id="new-channel-title" class="text-lg font-semibold text-[var(--text-primary)]">
            Create a channel
          </h2>
          <p class="text-sm text-[var(--text-secondary)] mt-1">
            Channels are where your team communicates
          </p>
        </div>

        <!-- Form -->
        <form onsubmit={handleSubmit} class="p-4">
          <div class="mb-4">
            <label
              for="channel-name"
              class="block text-sm font-medium text-[var(--text-primary)] mb-2"
            >
              Channel name
            </label>
            <div class="flex items-center">
              <span class="text-[var(--text-secondary)] mr-1">#</span>
              <input
                bind:this={inputRef}
                bind:value={channelName}
                id="channel-name"
                type="text"
                placeholder="e.g. project-updates"
                autocomplete="off"
                disabled={isCreating}
                class="flex-1 px-3 py-2 bg-[var(--bg-primary)] text-[var(--text-primary)] rounded border border-[var(--border-default)] focus:outline-none focus:ring-2 focus:ring-volt focus:border-transparent disabled:opacity-50"
              />
            </div>
            {#if error}
              <p class="mt-2 text-sm text-red-400" role="alert">
                {error}
              </p>
            {/if}
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onclick={onClose}
              disabled={isCreating}
              class="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !channelName.trim()}
              class="px-4 py-2 text-sm font-medium bg-volt text-white rounded hover:bg-volt/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </FocusTrap>
  </div>
{/if}
