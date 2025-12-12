<script lang="ts">
  import { untrack } from "svelte";
  import PresenceIndicator from "./PresenceIndicator.svelte";
  import EmptyState from "./EmptyState.svelte";

  interface OnlineUser {
    userId: string;
    sessionId: string;
    displayName: string;
    updated: number;
    type: string;
  }

  const ONLINE_TIMEOUT = 60000; // 60 seconds
  const EMPTY_DELAY = 200; // ms before showing empty state

  let { onlineUsers, channelId }: {
    onlineUsers: OnlineUser[];
    channelId: string;
  } = $props();

  // Staleness timer
  let now = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => { now = Date.now(); }, 5000);
    return () => clearInterval(interval);
  });

  // Filter stale and deduplicate
  const uniqueUsers = $derived.by(() => {
    const userMap = new Map<string, OnlineUser>();
    for (const user of onlineUsers) {
      if (now - user.updated >= ONLINE_TIMEOUT) continue;
      const existing = userMap.get(user.userId);
      if (!existing || user.updated > existing.updated) {
        userMap.set(user.userId, user);
      }
    }
    return Array.from(userMap.values());
  });

  // Simple approach: only update when we have something to show
  let displayedUsers = $state<OnlineUser[]>([]);
  let lastChannelWithUsers = $state<string | null>(null);
  let showEmpty = $state(false);

  $effect(() => {
    const users = uniqueUsers;
    const channel = channelId;

    // If we have users, always show them immediately
    if (users.length > 0) {
      displayedUsers = users;
      lastChannelWithUsers = channel;
      showEmpty = false;
      return;
    }

    // No users - only show empty if this is definitely the current channel's state
    // (not stale data from a previous channel)
    const isCurrentChannel = lastChannelWithUsers === channel || lastChannelWithUsers === null;

    if (isCurrentChannel && untrack(() => displayedUsers.length === 0)) {
      // Already showing nothing, schedule empty state
      const timer = setTimeout(() => {
        if (untrack(() => uniqueUsers.length === 0 && channelId === channel)) {
          showEmpty = true;
        }
      }, EMPTY_DELAY);
      return () => clearTimeout(timer);
    }

    // Have users displayed from previous state - keep showing them briefly
    // until new channel's users arrive (or empty state timer fires)
    const timer = setTimeout(() => {
      if (untrack(() => uniqueUsers.length === 0 && channelId === channel)) {
        displayedUsers = [];
        showEmpty = true;
      }
    }, EMPTY_DELAY);
    return () => clearTimeout(timer);
  });
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if showEmpty}
    <EmptyState variant="users" />
  {:else if displayedUsers.length > 0}
    <ul class="flex flex-col gap-1" role="list" aria-label="Online users">
      {#each displayedUsers as user (user.userId)}
        <li class="flex items-center gap-2 text-sm">
          <PresenceIndicator isOnline={true} />
          <span>{user.displayName}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
