<script lang="ts">
  import type { Id } from "../../../convex/_generated/dataModel";

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
</script>

<div class="flex flex-col gap-1">
  {#each channels as channel (channel._id)}
    <button
      onclick={() => onSelect(channel._id)}
      class="text-left py-1 px-2 rounded text-sm transition-colors
        {channel._id === activeChannelId
          ? 'bg-volt/10 font-bold text-volt'
          : 'text-[var(--text-secondary)] hover:bg-ink-700/50'}"
    >
      # {channel.name}
    </button>
  {/each}
</div>
