<script lang="ts">
  import PresenceIndicator from "./PresenceIndicator.svelte";

  interface OnlineUser {
    oduserId: string;
    sessionId: string;
    displayName: string;
    updated: number;
    type: string;
  }

  const ONLINE_TIMEOUT = 60000; // 60 seconds

  let { onlineUsers }: { onlineUsers: OnlineUser[] } = $props();

  // Client-side staleness filtering - removes users inactive > 60s
  // This ensures UI updates immediately when users go offline, even without server activity
  const activeUsers = $derived(
    onlineUsers.filter((u) => Date.now() - u.updated < ONLINE_TIMEOUT)
  );

  // Deduplicate by oduserId (same user on multiple devices shows once)
  // Keep the most recently updated session for each user
  const uniqueUsers = $derived(() => {
    const userMap = new Map<string, OnlineUser>();
    for (const user of activeUsers) {
      const existing = userMap.get(user.oduserId);
      if (!existing || user.updated > existing.updated) {
        userMap.set(user.oduserId, user);
      }
    }
    return Array.from(userMap.values());
  });
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if uniqueUsers().length === 0}
    <div class="text-sm text-[var(--text-secondary)]">No one online</div>
  {:else}
    <ul class="flex flex-col gap-1" role="list" aria-label="Online users">
      {#each uniqueUsers() as user (user.oduserId)}
        <li class="flex items-center gap-2 text-sm">
          <PresenceIndicator isOnline={true} />
          <span>{user.displayName}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
