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
  const EMPTY_DEBOUNCE_MS = 200; // Debounce empty results

  let { onlineUsers, channelId }: {
    onlineUsers: OnlineUser[] | undefined;
    /** Current channel - used to detect channel switches */
    channelId: string;
  } = $props();

  // Track channel changes (non-reactive to avoid infinite loops)
  let lastChannelId: string | null = null;
  let displayedUsers = $state<OnlineUser[]>([]);
  let emptyDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  // Update display with channel-aware debouncing
  $effect(() => {
    // Clear any pending debounce on every run
    if (emptyDebounceTimer) {
      clearTimeout(emptyDebounceTimer);
      emptyDebounceTimer = null;
    }

    const channelChanged = channelId !== lastChannelId;
    if (channelChanged) {
      lastChannelId = channelId;
    }

    // If we have users, show immediately (regardless of channel change)
    if (uniqueUsers.length > 0) {
      displayedUsers = uniqueUsers;
      return;
    }

    // Empty result - debounce to handle: undefined → [] → [users] transition
    emptyDebounceTimer = setTimeout(() => {
      displayedUsers = uniqueUsers;
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
