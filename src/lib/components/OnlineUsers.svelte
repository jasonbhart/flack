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

  let {
    onlineUsers,
    isLoading = false,
  }: {
    onlineUsers: OnlineUser[];
    /** Show loading state (keeps component mounted during channel switch) */
    isLoading?: boolean;
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
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if isLoading && uniqueUsers.length === 0}
    <!-- Loading skeleton - only show when no cached data -->
    <div class="flex flex-col gap-1 animate-pulse">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-[var(--bg-tertiary)]"></div>
        <div class="h-4 w-20 bg-[var(--bg-tertiary)] rounded"></div>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-[var(--bg-tertiary)]"></div>
        <div class="h-4 w-16 bg-[var(--bg-tertiary)] rounded"></div>
      </div>
    </div>
  {:else if uniqueUsers.length === 0}
    <EmptyState variant="users" />
  {:else}
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
