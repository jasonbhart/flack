<script lang="ts">
  interface TypingUser {
    userId: string;
    tempUserId?: string;
    displayName: string;
  }

  let {
    typingUsers,
    currentTempUserId,
  }: {
    typingUsers: TypingUser[];
    currentTempUserId?: string;
  } = $props();

  // Filter out current user by tempUserId (local UUID) for accurate self-filtering
  const filteredUsers = $derived(
    typingUsers.filter((u) => u.tempUserId !== currentTempUserId)
  );

  const displayText = $derived.by(() => {
    if (filteredUsers.length === 0) return null;
    if (filteredUsers.length === 1) return `${filteredUsers[0].displayName} is typing`;
    return `${filteredUsers.length} users are typing`;
  });
</script>

{#if displayText}
  <div
    class="text-sm text-ink-400 py-1 px-2 flex items-center gap-1"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <span>{displayText}</span>
    <span class="flex gap-0.5">
      <span class="typing-dot"></span>
      <span class="typing-dot" style="animation-delay: 0.2s"></span>
      <span class="typing-dot" style="animation-delay: 0.4s"></span>
    </span>
  </div>
{/if}

<style>
  .typing-dot {
    width: 4px;
    height: 4px;
    background-color: currentColor;
    border-radius: 50%;
    animation: typing-pulse 1s infinite;
  }

  @keyframes typing-pulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
  }
</style>
