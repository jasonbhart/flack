<script lang="ts">
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
  const SETTLE_DELAY = 100; // ms to wait before updating displayed users

  let { onlineUsers, channelId }: {
    onlineUsers: OnlineUser[];
    /** Current channel ID - used to track channel switches */
    channelId: string;
  } = $props();

  // Reactive timer to drive staleness updates even when no server data changes
  let now = $state(Date.now());

  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
    }, 5000);
    return () => clearInterval(interval);
  });

  // Client-side staleness filtering
  const activeUsers = $derived(
    onlineUsers.filter((u) => now - u.updated < ONLINE_TIMEOUT)
  );

  // Deduplicate by userId
  const uniqueUsers = $derived.by(() => {
    const userMap = new Map<string, OnlineUser>();
    for (const user of activeUsers) {
      const existing = userMap.get(user.userId);
      if (!existing || user.updated > existing.updated) {
        userMap.set(user.userId, user);
      }
    }
    return Array.from(userMap.values());
  });

  // Stable display state - debounced to prevent flicker during channel transitions
  // Shows nothing during transitions, then settles to actual state
  let displayedUsers = $state<OnlineUser[]>([]);
  let showEmptyState = $state(false);
  let lastChannelId = $state(channelId);

  $effect(() => {
    const currentChannel = channelId;
    const users = uniqueUsers;
    const isChannelSwitch = currentChannel !== lastChannelId;

    if (isChannelSwitch) {
      // Channel changed - clear display immediately to avoid showing wrong channel's users
      displayedUsers = [];
      showEmptyState = false;
      lastChannelId = currentChannel;
    }

    // Debounce updates to let data settle
    const timer = setTimeout(() => {
      displayedUsers = users;
      showEmptyState = users.length === 0;
    }, isChannelSwitch ? SETTLE_DELAY : 0);

    return () => clearTimeout(timer);
  });
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if showEmptyState}
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
  <!-- During channel transitions: shows nothing briefly while data settles -->
</div>
