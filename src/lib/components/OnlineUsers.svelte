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
  const EMPTY_DEBOUNCE_MS = 150; // Wait before showing empty state

  let { onlineUsers }: {
    /** undefined = loading/transitioning, [] = confirmed empty, [...] = users */
    onlineUsers: OnlineUser[] | undefined;
  } = $props();

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

  // Display state with debounced empty handling
  let displayedUsers = $state<OnlineUser[]>([]);
  let emptyDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    // Cleanup timer on effect re-run
    if (emptyDebounceTimer) {
      clearTimeout(emptyDebounceTimer);
      emptyDebounceTimer = null;
    }

    if (uniqueUsers === undefined) {
      // Loading - keep showing previous data
      return;
    }

    if (uniqueUsers.length > 0) {
      // Have users - update immediately
      displayedUsers = uniqueUsers;
      return;
    }

    // Empty array - debounce before showing empty state
    // This handles the Convex pattern of: undefined → [] → [actual data]
    emptyDebounceTimer = setTimeout(() => {
      displayedUsers = [];
    }, EMPTY_DEBOUNCE_MS);

    return () => {
      if (emptyDebounceTimer) {
        clearTimeout(emptyDebounceTimer);
        emptyDebounceTimer = null;
      }
    };
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
