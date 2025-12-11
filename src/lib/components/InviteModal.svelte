<script lang="ts">
  import { useConvexClient, useQuery } from "convex-svelte";
  import { api } from "../../../convex/_generated/api";
  import type { Id } from "../../../convex/_generated/dataModel";
  import FocusTrap from "./FocusTrap.svelte";

  interface Props {
    isOpen: boolean;
    channelId: Id<"channels">;
    channelName: string;
    sessionToken: string;
    onClose: () => void;
  }

  let { isOpen, channelId, channelName, sessionToken, onClose }: Props = $props();

  // Get Convex client for mutations
  const client = useConvexClient();

  // State
  let inviteUrl = $state<string | null>(null);
  let copied = $state(false);
  let isGenerating = $state(false);
  let error = $state<string | null>(null);

  // Query existing invites
  const invitesQuery = useQuery(
    api.channelInvites.list,
    () => isOpen ? { channelId, sessionToken } : "skip"
  );

  // Check for existing invite when query loads
  $effect(() => {
    if (invitesQuery.data && invitesQuery.data.length > 0 && !inviteUrl) {
      // Use the most recent invite
      const existingInvite = invitesQuery.data[0];
      const baseUrl = window.location.origin;
      inviteUrl = `${baseUrl}/invite/${existingInvite.token}`;
    }
  });

  // Reset state when modal opens
  $effect(() => {
    if (isOpen) {
      copied = false;
      error = null;
      isGenerating = false;
    } else {
      // Reset inviteUrl when modal closes so it re-fetches on next open
      inviteUrl = null;
    }
  });

  async function handleGenerateLink() {
    isGenerating = true;
    error = null;

    try {
      const result = await client.mutation(api.channelInvites.create, {
        sessionToken,
        channelId,
      });
      const baseUrl = window.location.origin;
      inviteUrl = `${baseUrl}${result.url}`;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to generate invite link";
    } finally {
      isGenerating = false;
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      copied = true;
      // Reset after 2 seconds
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      error = "Failed to copy to clipboard";
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
        aria-labelledby="invite-title"
        class="w-full max-w-md bg-[var(--bg-secondary)] rounded-lg shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="px-4 py-3 border-b border-[var(--border-default)]">
          <h2 id="invite-title" class="text-lg font-semibold text-[var(--text-primary)]">
            Invite to #{channelName}
          </h2>
          <p class="text-sm text-[var(--text-secondary)] mt-1">
            Share this link to invite people to your channel
          </p>
        </div>

        <!-- Content -->
        <div class="p-4">
          {#if inviteUrl}
            <!-- Show invite URL with copy button -->
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                value={inviteUrl}
                class="flex-1 px-3 py-2 bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm rounded border border-[var(--border-default)] focus:outline-none"
              />
              <button
                onclick={handleCopy}
                class="px-4 py-2 text-sm font-medium bg-volt text-white rounded hover:bg-volt/90 transition-colors min-w-[80px]"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <p class="mt-3 text-xs text-[var(--text-tertiary)]">
              Anyone with this link can join #{channelName}
            </p>

            <!-- Regenerate link option -->
            <div class="mt-4 pt-4 border-t border-[var(--border-default)]">
              <button
                onclick={handleGenerateLink}
                disabled={isGenerating}
                class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              >
                {isGenerating ? "Generating..." : "Generate new link"}
              </button>
              <p class="mt-1 text-xs text-[var(--text-tertiary)]">
                This will invalidate the current link
              </p>
            </div>
          {:else}
            <!-- Generate link button -->
            <button
              onclick={handleGenerateLink}
              disabled={isGenerating}
              class="w-full px-4 py-3 text-sm font-medium bg-volt text-white rounded hover:bg-volt/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? "Generating..." : "Generate Invite Link"}
            </button>
          {/if}

          {#if error}
            <p class="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          {/if}
        </div>

        <!-- Footer -->
        <div class="px-4 py-3 border-t border-[var(--border-default)] flex justify-end">
          <button
            onclick={onClose}
            class="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </FocusTrap>
  </div>
{/if}
