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

  let { onlineUsers, isLoading = false }: {
    onlineUsers: OnlineUser[] | undefined;
    /** When true, query is loading - preserve previous display */
    isLoading?: boolean;
  } = $props();

  // Staleness timer
  let now = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => { now = Date.now(); }, 5000);
    return () => clearInterval(interval);
  });

  // Filter stale and deduplicate
  const uniqueUsers = $derived.by(() => {
    if (!onlineUsers) return [];
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

  // Display state - only update when NOT loading
  let displayedUsers = $state<OnlineUser[]>([]);

  $effect(() => {
    // DEBUG: Log all state changes
    console.log('OnlineUsers state:', {
      isLoading,
      onlineUsersLength: onlineUsers?.length ?? 'undefined',
      uniqueUsersLength: uniqueUsers.length,
      displayedUsersLength: displayedUsers.length
    });

    // When loading, keep showing previous data to prevent flash
    if (isLoading) {
      console.log('  -> SKIPPING update (isLoading=true)');
      return;
    }

    // Not loading - safe to update display
    console.log('  -> UPDATING displayedUsers to', uniqueUsers.length);
    displayedUsers = uniqueUsers;
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
