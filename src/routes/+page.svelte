<script lang="ts">
  import { browser } from "$app/environment";
  import { useConvexClient, useQuery } from "convex-svelte";
  import { api } from "../../convex/_generated/api";
  import type { Id, Doc } from "../../convex/_generated/dataModel";
  import type { MergedMessage } from "$lib/types/messages";
  import { messageQueue } from "$lib/stores/QueueManager.svelte";
  import { presenceManager } from "$lib/stores/presence.svelte";
  import ChannelList from "$lib/components/ChannelList.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import ChatInput from "$lib/components/ChatInput.svelte";
  import OfflineIndicator from "$lib/components/OfflineIndicator.svelte";
  import QueueStatus from "$lib/components/QueueStatus.svelte";
  import OnlineUsers from "$lib/components/OnlineUsers.svelte";
  import TypingIndicator from "$lib/components/TypingIndicator.svelte";

  // Get Convex client for mutations
  const client = useConvexClient();

  // Inject send mutation into QueueManager
  $effect(() => {
    messageQueue.setSendMutation(async (args) => {
      await client.mutation(api.messages.send, args);
    });
  });

  // Inject heartbeat mutation into PresenceManager
  $effect(() => {
    presenceManager.setHeartbeatMutation(async (args) => {
      await client.mutation(api.presence.heartbeat, args);
    });
  });

  // Theme state with localStorage persistence
  let isDark = $state(false);

  if (browser) {
    isDark = localStorage.getItem("bolt-theme") === "dark";
  }

  $effect(() => {
    if (browser) {
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      localStorage.setItem("bolt-theme", isDark ? "dark" : "light");
    }
  });

  function toggleTheme() {
    isDark = !isDark;
  }

  // Channel state
  let activeChannelId = $state<Id<"channels"> | null>(null);

  // Queries
  const channelsQuery = useQuery(api.channels.list, {});
  const messagesQuery = useQuery(
    api.messages.list,
    () => (activeChannelId ? { channelId: activeChannelId } : "skip")
  );

  // Presence queries
  const onlineUsersQuery = useQuery(
    api.presence.listOnline,
    () => (activeChannelId ? { channelId: activeChannelId } : "skip")
  );
  const typingUsersQuery = useQuery(
    api.presence.listTyping,
    () => (activeChannelId ? { channelId: activeChannelId } : "skip")
  );

  // Auto-select first channel when loaded
  $effect(() => {
    const channels = channelsQuery.data;
    if (channels && channels.length > 0 && !activeChannelId) {
      activeChannelId = channels[0]._id;
    }
  });

  // Update presence when channel changes
  $effect(() => {
    presenceManager.setChannel(activeChannelId);
    if (activeChannelId) {
      presenceManager.startHeartbeat();
    }

    return () => {
      presenceManager.stopHeartbeat();
    };
  });

  /**
   * Merged Messages - Optimistic UI Pattern
   *
   * This derivation implements "optimistic updates" by combining two data sources:
   * 1. **Server Truth**: Messages from Convex subscription (confirmed by backend)
   * 2. **Local Truth**: Messages in IndexedDB queue (pending/sending/failed)
   *
   * The result is a unified view where:
   * - Messages appear instantly when sent (from local queue, at 60% opacity)
   * - Messages transition to confirmed (from server, at 100% opacity)
   * - Failed messages show error state with retry option
   *
   * ## Why clientMutationId?
   * Each message gets a UUID (clientMutationId) generated client-side before sending.
   * This enables:
   * - **Deduplication**: When server confirms a message, we match it to the local
   *   queue entry by clientMutationId and remove the duplicate
   * - **Idempotency**: Server uses clientMutationId index to prevent double-inserts
   *   if the same message is retried
   * - **Reconciliation**: React/Svelte can use it as a stable key for list rendering
   *
   * ## Merge Algorithm
   * 1. Build a Set of confirmed clientMutationIds from server messages
   * 2. Filter local queue: keep only entries NOT in confirmed set (still pending)
   * 3. Map server messages to MergedMessage format with status="confirmed"
   * 4. Append pending queue entries (status="pending"|"sending"|"failed")
   * 5. Result: confirmed messages first, then pending messages at the end
   */
  const mergedMessages = $derived.by(() => {
    // Step 1: Get server-confirmed messages from Convex real-time subscription
    const serverMessages = (messagesQuery.data ?? []) as Doc<"messages">[];

    // Step 2: Build set of clientMutationIds that the server has confirmed
    // This allows O(1) lookup to check if a local queue entry has been confirmed
    const confirmedIds = new Set(
      serverMessages
        .map((m: Doc<"messages">) => m.clientMutationId)
        .filter(Boolean)
    );

    // Step 3: Filter local queue to entries not yet confirmed by server
    // - Must match current channel (don't show messages from other channels)
    // - Must not be in confirmedIds (not yet acknowledged by server)
    const stillPending = messageQueue.queue.filter(
      (entry) =>
        entry.channelId === activeChannelId &&
        !confirmedIds.has(entry.clientMutationId)
    );

    // Step 4: Convert server messages to unified MergedMessage format
    // All server messages get status="confirmed" (they're the source of truth)
    const merged: MergedMessage[] = serverMessages.map(
      (m: Doc<"messages">) => ({
        _id: m._id,
        _creationTime: m._creationTime,
        clientMutationId: m.clientMutationId ?? m._id, // Fallback for old messages
        channelId: m.channelId,
        authorName: m.authorName,
        body: m.body,
        status: "confirmed" as const,
      })
    );

    // Step 5: Append pending queue entries after confirmed messages
    // These will render at 60% opacity (pending/sending) or with error (failed)
    stillPending.forEach((entry) => {
      merged.push({
        clientMutationId: entry.clientMutationId,
        channelId: entry.channelId,
        authorName: entry.authorName,
        body: entry.body,
        status: entry.status, // "pending" | "sending" | "failed"
        error: entry.error,
      });
    });

    return merged;
  });

  // Handle sending a message
  async function handleSend(body: string) {
    if (!activeChannelId) return;

    const clientMutationId = crypto.randomUUID();
    const authorName = presenceManager.getUserName();

    // Enqueue message (will be sent automatically if online)
    await messageQueue.enqueue({
      clientMutationId,
      channelId: activeChannelId,
      authorName,
      body,
      status: "pending",
    });
  }

  function handleChannelSelect(channelId: Id<"channels">) {
    activeChannelId = channelId;
  }

  // Handle retry of failed messages
  async function handleRetry(clientMutationId: string) {
    await messageQueue.retry(clientMutationId);
  }

  // Chat input ref for keyboard shortcuts
  let chatInputRef: HTMLTextAreaElement | undefined = $state();

  // Global keyboard shortcuts
  function handleGlobalKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl+N to focus message input
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      chatInputRef?.focus();
    }
    // Escape to blur
    if (e.key === "Escape") {
      (document.activeElement as HTMLElement)?.blur();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<OfflineIndicator isOnline={messageQueue.isOnline} />
<QueueStatus
  queueCount={messageQueue.queue.length}
  isSyncing={messageQueue.isSyncing}
/>

<div class="flex min-h-screen">
  <!-- Sidebar with extra top padding for macOS traffic lights (40px = pt-10) -->
  <aside class="w-64 bg-[var(--bg-secondary)] p-4 pt-10 flex flex-col">
    <h2 class="text-lg font-bold mb-4">Bolt</h2>

    <div class="text-xs text-[var(--text-secondary)] uppercase mb-2">
      Channels
    </div>

    {#if channelsQuery.data}
      <ChannelList
        channels={channelsQuery.data}
        {activeChannelId}
        onSelect={handleChannelSelect}
      />
    {:else if channelsQuery.isLoading}
      <div class="text-sm text-[var(--text-secondary)]">Loading...</div>
    {:else}
      <div class="text-sm text-[var(--text-secondary)]">No channels yet</div>
    {/if}

    <!-- Online Users -->
    {#if activeChannelId && onlineUsersQuery.data}
      <OnlineUsers onlineUsers={onlineUsersQuery.data} />
    {/if}

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Theme Toggle -->
    <button
      onclick={toggleTheme}
      class="flex items-center gap-2 px-3 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-volt/10 hover:text-volt transition-colors"
    >
      {#if isDark}
        <span>Light Mode</span>
      {:else}
        <span>Dark Mode</span>
      {/if}
    </button>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 bg-[var(--bg-primary)] flex flex-col">
    {#if activeChannelId}
      <MessageList messages={mergedMessages} onRetry={handleRetry} />
      {#if typingUsersQuery.data}
        <TypingIndicator
          typingUsers={typingUsersQuery.data}
          currentSessionId={presenceManager.getSessionId()}
        />
      {/if}
      <ChatInput
        onSend={handleSend}
        onTyping={(isTyping) => presenceManager.setTyping(isTyping)}
        bind:inputRef={chatInputRef}
      />
    {:else}
      <div
        class="flex-1 flex items-center justify-center text-[var(--text-secondary)]"
      >
        Select a channel to start chatting
      </div>
    {/if}
  </main>
</div>
