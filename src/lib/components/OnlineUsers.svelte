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

  let { onlineUsers, channelId, isLoading }: {
    onlineUsers: OnlineUser[];
    channelId: string;
    /** True while query is fetching - suppress updates during loading */
    isLoading: boolean;
  } = $props();

  // Reactive timer to drive staleness updates
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

  // Snapshot state - only update when data is ready (not loading)
  let snapshot = $state<{ users: OnlineUser[]; channelId: string }>({
    users: [],
    channelId
  });

  $effect(() => {
    // Only update snapshot when:
    // 1. Not loading (query has returned)
    // 2. Data is for current channel (channelId matches)
    if (!isLoading) {
      snapshot = { users: uniqueUsers, channelId };
    }
  });

  // Display the snapshot - stable during transitions
  const displayedUsers = $derived(snapshot.users);
  const showEmptyState = $derived(snapshot.channelId === channelId && displayedUsers.length === 0 && !isLoading);
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
