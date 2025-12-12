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
  const EMPTY_STATE_DELAY = 150; // ms to wait before showing empty state

  let { onlineUsers }: {
    onlineUsers: OnlineUser[];
  } = $props();

  // Reactive timer to drive staleness updates even when no server data changes
  let now = $state(Date.now());

  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
    }, 5000); // Update every 5 seconds (sufficient for 60s timeout)
    return () => clearInterval(interval);
  });

  // Client-side staleness filtering - removes users inactive > 60s
  // This ensures UI updates immediately when users go offline
  const activeUsers = $derived(
    onlineUsers.filter((u) => now - u.updated < ONLINE_TIMEOUT)
  );

  // Deduplicate by userId (same user on multiple devices shows once)
  // Keep the most recently updated session for each user
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

  // Debounced empty state - prevents flash during channel transitions
  // Only show "No one else is online" after data has settled for EMPTY_STATE_DELAY ms
  let showEmptyState = $state(false);

  $effect(() => {
    const isEmpty = uniqueUsers.length === 0;

    if (!isEmpty) {
      // Users exist - show them immediately, hide empty state
      showEmptyState = false;
      return;
    }

    // Empty - delay showing empty state to avoid flash during channel switch
    const timer = setTimeout(() => {
      showEmptyState = true;
    }, EMPTY_STATE_DELAY);

    return () => clearTimeout(timer);
  });
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if showEmptyState}
    <!-- Debounced empty state - only shown after 150ms of no users -->
    <EmptyState variant="users" />
  {:else if uniqueUsers.length > 0}
    <ul class="flex flex-col gap-1" role="list" aria-label="Online users">
      {#each uniqueUsers as user (user.userId)}
        <li class="flex items-center gap-2 text-sm">
          <PresenceIndicator isOnline={true} />
          <span>{user.displayName}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
