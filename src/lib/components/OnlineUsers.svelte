<script lang="ts">
  import PresenceIndicator from "./PresenceIndicator.svelte";

  interface OnlineUser {
    userId: string;
    tempUserId?: string;
    displayName: string;
  }

  let { onlineUsers }: { onlineUsers: OnlineUser[] } = $props();
</script>

<div class="py-2">
  <div class="text-xs text-ink-400 uppercase mb-2">Online</div>

  {#if onlineUsers.length === 0}
    <div class="text-sm text-[var(--text-secondary)]">No one online</div>
  {:else}
    <ul class="flex flex-col gap-1" role="list" aria-label="Online users">
      {#each onlineUsers as user (user.userId)}
        <li class="flex items-center gap-2 text-sm">
          <PresenceIndicator isOnline={true} />
          <span>{user.displayName}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
