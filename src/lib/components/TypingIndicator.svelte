<script lang="ts">
  interface TypingUser {
    userId: string;
    sessionId: string;
    displayName: string;
    updated: number;
  }

  const TYPING_TIMEOUT = 3000; // 3 seconds

  let {
    typingUsers,
    currentSessionId,
  }: {
    typingUsers: TypingUser[];
    currentSessionId?: string;
  } = $props();

  // Reactive timer to drive staleness updates even when no server data changes
  let now = $state(Date.now());

  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
    }, 1000); // Update every 1 second (typing timeout is 3s, needs faster updates)
    return () => clearInterval(interval);
  });

  // Client-side staleness filtering - removes users who stopped typing > 3s ago
  const activeTyping = $derived(
    typingUsers.filter((u) => now - u.updated < TYPING_TIMEOUT)
  );

  // Filter out current session and deduplicate by userId
  // This handles multi-device: excludes all sessions from current device
  const filteredUsers = $derived.by(() => {
    // First filter out current session
    const otherSessions = activeTyping.filter(
      (u) => u.sessionId !== currentSessionId
    );

    // Deduplicate by userId (same user on multiple devices shows once)
    const userMap = new Map<string, TypingUser>();
    for (const user of otherSessions) {
      const existing = userMap.get(user.userId);
      if (!existing || user.updated > existing.updated) {
        userMap.set(user.userId, user);
      }
    }
    return Array.from(userMap.values());
  });

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
