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

  let { onlineUsers, channelId }: {
    onlineUsers: OnlineUser[];
    channelId: string;
  } = $props();

  // Staleness timer - runs independently, doesn't trigger on data changes
  let now = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => { now = Date.now(); }, 5000);
    return () => clearInterval(interval);
  });

  // Derived: filter stale and deduplicate
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

  // Track last confirmed channel to detect switches
  let confirmedChannelId = $state(channelId);

  // Display state - only updates on confirmed data
  let displayState = $state<{ users: OnlineUser[]; isEmpty: boolean }>({
    users: [],
    isEmpty: false
  });

  // When channelId changes, mark as unconfirmed (don't update display yet)
  $effect.pre(() => {
    channelId; // track
    // Reset confirmation when channel changes
    untrack(() => {
      if (channelId !== confirmedChannelId) {
        confirmedChannelId = channelId;
        // Clear users immediately on switch, but don't show empty yet
        displayState = { users: [], isEmpty: false };
      }
    });
  });

  // When we have users, update immediately. Empty state only after users settle.
  $effect(() => {
    const users = uniqueUsers;
    const currentChannel = channelId;

    if (users.length > 0) {
      // Users exist - update display immediately
      displayState = { users, isEmpty: false };
    } else if (untrack(() => displayState.users.length > 0)) {
      // Had users, now empty - likely channel switch, wait for real data
      // Keep showing nothing (already cleared by $effect.pre)
    } else {
      // No users and display is empty - schedule empty state
      const timer = setTimeout(() => {
        // Verify still on same channel and still empty
        if (untrack(() => channelId === currentChannel && uniqueUsers.length === 0)) {
          displayState = { users: [], isEmpty: true };
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  });
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if displayState.isEmpty}
    <EmptyState variant="users" />
  {:else if displayState.users.length > 0}
    <ul class="flex flex-col gap-1" role="list" aria-label="Online users">
      {#each displayState.users as user (user.userId)}
        <li class="flex items-center gap-2 text-sm">
          <PresenceIndicator isOnline={true} />
          <span>{user.displayName}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
