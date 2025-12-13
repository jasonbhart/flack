<script lang="ts">
  import type { Id } from "../../../convex/_generated/dataModel";
  import { unreadCounts } from "$lib/stores/unreadCounts.svelte";
  import NewChannelModal from "./NewChannelModal.svelte";

  interface Channel {
    _id: Id<"channels">;
    name: string;
    creatorId?: Id<"users">;
    creatorName?: string | null;
    role?: "owner" | "admin" | "member";
  }

  let {
    channels,
    activeChannelId,
    currentUserId,
    sessionToken,
    onSelect,
  }: {
    channels: Channel[];
    activeChannelId: Id<"channels"> | null;
    currentUserId: Id<"users"> | null;
    sessionToken: string;
    onSelect: (channelId: Id<"channels">) => void;
  } = $props();

  // Modal state
  let showNewChannelModal = $state(false);

  // Get unread count with 99+ cap for display
  function getDisplayCount(channelId: string): string | null {
    const count = unreadCounts.getCount(channelId);
    if (count === 0) return null;
    return count > 99 ? "99+" : count.toString();
  }

  // Get mention count with 99+ cap for display
  function getMentionDisplay(channelId: string): string | null {
    const count = unreadCounts.getMentionCount(channelId);
    if (count === 0) return null;
    return count > 99 ? "99+" : count.toString();
  }

  // Get display name for a channel
  // Shows owner's name prefix if not owned by current user
  function getDisplayName(channel: Channel): string {
    // If we don't know the current user or creator, just show the name
    if (!currentUserId || !channel.creatorId) {
      return channel.name;
    }

    // If current user owns this channel, show plain name
    if (channel.creatorId === currentUserId) {
      return channel.name;
    }

    // Show owner's name prefix for others' channels
    const ownerName = channel.creatorName || "Unknown";
    return `${ownerName}'s ${channel.name}`;
  }

  // Track focused index for roving tabindex pattern
  // Note: This stays as $state + $effect (not $derived) because focusedIndex
  // is also modified imperatively by keyboard navigation in handleKeydown
  let focusedIndex = $state(0);

  // Derive initial focused index from active channel
  const activeChannelIndex = $derived.by(() => {
    if (!activeChannelId) return 0;
    const index = channels.findIndex(c => c._id === activeChannelId);
    return index !== -1 ? index : 0;
  });

  // Sync focusedIndex when activeChannelId changes
  $effect(() => {
    focusedIndex = activeChannelIndex;
  });

  function handleKeydown(e: KeyboardEvent, index: number) {
    let newIndex = index;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        newIndex = Math.min(index + 1, channels.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        newIndex = Math.max(index - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = channels.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(channels[index]._id);
        return;
      default:
        return;
    }

    if (newIndex !== index) {
      focusedIndex = newIndex;
      // Focus the new button
      const buttons = (e.currentTarget as HTMLElement)
        .closest('nav')
        ?.querySelectorAll('button[data-channel]');
      (buttons?.[newIndex] as HTMLElement)?.focus();
    }
  }

  function handleNewChannelCreated(channelId: Id<"channels">) {
    onSelect(channelId);
  }
</script>

<div class="flex flex-col gap-3">
  <!-- Channel list -->
  <nav role="navigation" aria-label="Channel list" class="flex flex-col gap-0.5">
    {#each channels as channel, index (channel._id)}
      {@const unreadDisplay = getDisplayCount(channel._id)}
      {@const mentionDisplay = getMentionDisplay(channel._id)}
      {@const displayName = getDisplayName(channel)}
      <button
        data-channel
        onclick={() => onSelect(channel._id)}
        onkeydown={(e) => handleKeydown(e, index)}
        aria-label="Channel {displayName}{mentionDisplay ? `, ${mentionDisplay} mentions` : ''}{unreadDisplay ? `, ${unreadDisplay} unread messages` : ''}"
        aria-current={channel._id === activeChannelId ? "page" : undefined}
        tabindex={index === focusedIndex ? 0 : -1}
        class="flex items-center justify-between text-left py-1.5 px-2.5 rounded-md transition-colors
          focus:outline-none focus:ring-2 focus:ring-volt focus:ring-offset-1
          {channel._id === activeChannelId
            ? 'bg-volt/10 font-bold text-volt'
            : 'text-[var(--text-secondary)] hover:bg-ink-700/50'}"
      >
        <span class="truncate min-w-0 text-[0.9375rem] leading-snug"># {displayName}</span>
        <span class="flex items-center gap-1.5 shrink-0 ml-2">
          {#if mentionDisplay}
            <!-- Mention badge: red with @ prefix for high priority -->
            <span class="min-w-[1.375rem] py-0.5 px-1.5 flex items-center justify-center text-[0.6875rem] font-bold bg-red-500 text-white rounded-full leading-none" title="{mentionDisplay} mentions">
              @{mentionDisplay}
            </span>
          {/if}
          {#if unreadDisplay && !mentionDisplay}
            <!-- Unread badge: only show if no mentions (mentions are more important) -->
            <span class="min-w-[1.375rem] py-0.5 px-1.5 flex items-center justify-center text-[0.6875rem] font-bold bg-volt text-white rounded-full leading-none">
              {unreadDisplay}
            </span>
          {/if}
        </span>
      </button>
    {/each}
  </nav>

  <!-- New Channel button -->
  <button
    onclick={() => showNewChannelModal = true}
    class="flex items-center gap-2 py-1.5 px-2.5 text-[0.9375rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-ink-700/50 rounded-md transition-colors"
    aria-label="Create new channel"
  >
    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
    <span>New Channel</span>
  </button>
</div>

<!-- New Channel Modal -->
<NewChannelModal
  isOpen={showNewChannelModal}
  {sessionToken}
  onClose={() => showNewChannelModal = false}
  onCreate={handleNewChannelCreated}
/>
