<script lang="ts">
  import type { Id } from "../../../convex/_generated/dataModel";

  interface Channel {
    _id: Id<"channels">;
    name: string;
  }

  interface Props {
    channels: Channel[];
    isOpen: boolean;
    onSelect: (channelId: Id<"channels">) => void;
    onClose: () => void;
  }

  let { channels, isOpen, onSelect, onClose }: Props = $props();

  // Search query
  let query = $state("");

  // Selected index for keyboard navigation
  let selectedIndex = $state(0);

  // Input ref for focus management
  let inputRef: HTMLInputElement | undefined = $state();

  // Filter channels by query (case-insensitive)
  const filteredChannels = $derived(
    query.trim() === ""
      ? channels
      : channels.filter((c) =>
          c.name.toLowerCase().includes(query.toLowerCase())
        )
  );

  // Reset state when modal opens/closes
  $effect(() => {
    if (isOpen) {
      query = "";
      selectedIndex = 0;
      // Focus input when modal opens
      requestAnimationFrame(() => {
        inputRef?.focus();
      });
    }
  });

  // Keep selected index in bounds when filtered list changes
  $effect(() => {
    if (selectedIndex >= filteredChannels.length) {
      selectedIndex = Math.max(0, filteredChannels.length - 1);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredChannels.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case "Enter":
        e.preventDefault();
        if (filteredChannels[selectedIndex]) {
          onSelect(filteredChannels[selectedIndex]._id);
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  function handleSelect(channelId: Id<"channels">) {
    onSelect(channelId);
    onClose();
  }

  // Handle backdrop click
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50"
    onclick={handleBackdropClick}
  >
    <!-- Modal -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick channel switcher"
      class="w-full max-w-md bg-[var(--bg-secondary)] rounded-lg shadow-2xl overflow-hidden"
    >
      <!-- Search input -->
      <div class="p-3 border-b border-[var(--border-default)]">
        <input
          bind:this={inputRef}
          bind:value={query}
          onkeydown={handleKeydown}
          type="text"
          placeholder="Search channels..."
          aria-label="Search channels"
          class="w-full px-3 py-2 bg-[var(--bg-primary)] text-[var(--text-primary)] rounded border border-[var(--border-default)] focus:outline-none focus:ring-2 focus:ring-volt focus:border-transparent"
        />
      </div>

      <!-- Results list -->
      <ul
        role="listbox"
        aria-label="Channels"
        class="max-h-64 overflow-y-auto"
      >
        {#if filteredChannels.length === 0}
          <li class="px-4 py-3 text-sm text-[var(--text-secondary)]">
            No channels found
          </li>
        {:else}
          {#each filteredChannels as channel, index (channel._id)}
            <li
              role="option"
              aria-selected={index === selectedIndex}
              class="px-4 py-2 text-sm cursor-pointer transition-colors
                {index === selectedIndex
                  ? 'bg-volt/20 text-volt'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}"
              onclick={() => handleSelect(channel._id)}
              onmouseenter={() => (selectedIndex = index)}
            >
              # {channel.name}
            </li>
          {/each}
        {/if}
      </ul>

      <!-- Footer with hints -->
      <div class="px-4 py-2 border-t border-[var(--border-default)] text-xs text-[var(--text-tertiary)] flex gap-4">
        <span><kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">↑↓</kbd> Navigate</span>
        <span><kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Enter</kbd> Select</span>
        <span><kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Esc</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}
