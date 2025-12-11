<script lang="ts">
  import type { Id } from "../../../convex/_generated/dataModel";
  import { unreadCounts } from "$lib/stores/unreadCounts.svelte";

  interface Channel {
    _id: Id<"channels">;
    name: string;
  }

  let {
    channels,
    activeChannelId,
    onSelect,
  }: {
    channels: Channel[];
    activeChannelId: Id<"channels"> | null;
    onSelect: (channelId: Id<"channels">) => void;
  } = $props();

  // Get unread count with 99+ cap for display
  function getDisplayCount(channelId: string): string | null {
    const count = unreadCounts.getCount(channelId);
    if (count === 0) return null;
    return count > 99 ? "99+" : count.toString();
  }

  // Track focused index for roving tabindex pattern
  let focusedIndex = $state(0);

  // Update focused index when active channel changes
  $effect(() => {
    if (activeChannelId) {
      const index = channels.findIndex(c => c._id === activeChannelId);
      if (index !== -1) {
        focusedIndex = index;
      }
    }
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
        ?.querySelectorAll('button');
      buttons?.[newIndex]?.focus();
    }
  }
</script>

<nav role="navigation" aria-label="Channel list" class="flex flex-col gap-1">
  {#each channels as channel, index (channel._id)}
    {@const unreadDisplay = getDisplayCount(channel._id)}
    <button
      onclick={() => onSelect(channel._id)}
      onkeydown={(e) => handleKeydown(e, index)}
      aria-label="Channel {channel.name}{unreadDisplay ? `, ${unreadDisplay} unread messages` : ''}"
      aria-current={channel._id === activeChannelId ? "page" : undefined}
      tabindex={index === focusedIndex ? 0 : -1}
      class="flex items-center justify-between text-left py-1 px-2 rounded text-sm transition-colors
        focus:outline-none focus:ring-2 focus:ring-volt focus:ring-offset-1
        {channel._id === activeChannelId
          ? 'bg-volt/10 font-bold text-volt'
          : 'text-[var(--text-secondary)] hover:bg-ink-700/50'}"
    >
      <span># {channel.name}</span>
      {#if unreadDisplay}
        <span class="ml-2 min-w-[1.25rem] h-5 flex items-center justify-center px-1.5 text-xs font-bold bg-volt text-white rounded-full">
          {unreadDisplay}
        </span>
      {/if}
    </button>
  {/each}
</nav>
