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

  let { onlineUsers }: {
    /** undefined = loading/transitioning, [] = confirmed empty, [...] = users */
    onlineUsers: OnlineUser[] | undefined;
  } = $props();

  // DEBUG: Track component lifecycle
  let instanceId = Math.random().toString(36).slice(2, 6);
  console.log(`[OnlineUsers ${instanceId}] MOUNTED`);
  $effect(() => {
    return () => console.log(`[OnlineUsers ${instanceId}] UNMOUNTED`);
  });

  // DEBUG: Log prop changes
  $effect(() => {
    console.log(`[OnlineUsers ${instanceId}] onlineUsers prop:`,
      onlineUsers === undefined ? 'undefined' :
      `array(${onlineUsers.length})`);
  });

  // Staleness timer
  let now = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => { now = Date.now(); }, 5000);
    return () => clearInterval(interval);
  });

  // Filter stale and deduplicate (only when we have data)
  const uniqueUsers = $derived.by(() => {
    if (!onlineUsers) return undefined; // preserve undefined
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

  // Display state - only update when we have definitive data
  let displayedUsers = $state<OnlineUser[]>([]);

  $effect(() => {
    // undefined = loading, don't update display
    // [] = confirmed empty, update to empty
    // [...] = users, update to users
    if (uniqueUsers !== undefined) {
      console.log(`[OnlineUsers ${instanceId}] updating displayedUsers:`, uniqueUsers.length);
      displayedUsers = uniqueUsers;
    } else {
      console.log(`[OnlineUsers ${instanceId}] SKIPPING update (uniqueUsers undefined)`);
    }
  });

  // DEBUG: Log what we're actually rendering
  $effect(() => {
    console.log(`[OnlineUsers ${instanceId}] RENDERING displayedUsers:`, displayedUsers.length);
  });
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if displayedUsers.length === 0}
    <EmptyState variant="users" />
  {:else}
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
