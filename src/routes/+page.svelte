<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { useConvexClient, useQuery } from "convex-svelte";
  import { untrack } from "svelte";
  import { api } from "../../convex/_generated/api";
  import type { Id, Doc } from "../../convex/_generated/dataModel";
  import type { MergedMessage } from "$lib/types/messages";
  import type { MentionableUser } from "$lib/types/mentions";
  import { messageQueue } from "$lib/stores/QueueManager.svelte";
  import { presenceManager } from "$lib/stores/presence.svelte";
  import { authStore } from "$lib/stores/auth.svelte";
  import { unreadCounts } from "$lib/stores/unreadCounts.svelte";
  import ChannelList from "$lib/components/ChannelList.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import ChatInput from "$lib/components/ChatInput.svelte";
  import OfflineIndicator from "$lib/components/OfflineIndicator.svelte";
  import QueueStatus from "$lib/components/QueueStatus.svelte";
  import OnlineUsers from "$lib/components/OnlineUsers.svelte";
  import TypingIndicator from "$lib/components/TypingIndicator.svelte";
  import SkipLink from "$lib/components/SkipLink.svelte";
  import MobileDrawer from "$lib/components/MobileDrawer.svelte";
  import HamburgerButton from "$lib/components/HamburgerButton.svelte";
  import PersistenceWarning from "$lib/components/PersistenceWarning.svelte";
  import StorageWarning from "$lib/components/StorageWarning.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import ErrorBoundary from "$lib/components/ErrorBoundary.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import QuickSwitcher from "$lib/components/QuickSwitcher.svelte";
  import KeyboardShortcutsHelp from "$lib/components/KeyboardShortcutsHelp.svelte";
  import InviteModal from "$lib/components/InviteModal.svelte";
  import NotificationPrompt from "$lib/components/NotificationPrompt.svelte";
  import NotificationSettings from "$lib/components/NotificationSettings.svelte";
  import { notificationService } from "$lib/services/NotificationService.svelte";
  import { systemTrayManager } from "$lib/services/SystemTrayManager.svelte";
  import { responsive } from "$lib/utils/responsive.svelte";

  // Get Convex client for mutations
  const client = useConvexClient();

  // Check session on load
  // Skip the query while authStore.sessionToken is undefined (still loading from storage)
  // or null (logged out) - only query when we have an actual token
  const sessionQuery = useQuery(
    api.auth.getSession,
    () => authStore.sessionToken
      ? { sessionToken: authStore.sessionToken }
      : "skip"
  );

  // Update auth store when session query resolves
  $effect(() => {
    if (sessionQuery.data !== undefined) {
      authStore.setUser(sessionQuery.data);
      // Update presence manager with authenticated user name
      if (sessionQuery.data) {
        presenceManager.setUserName(sessionQuery.data.name);
      }
    }
  });

  // Redirect to login if not authenticated
  $effect(() => {
    // authStore.sessionToken states:
    // - undefined: still loading from storage (don't redirect yet)
    // - null: confirmed no token (redirect to login)
    // - string: have token, wait for session query
    if (authStore.sessionToken === null && browser) {
      goto("/auth/login");
    }
  });

  // Handle server rejecting the token (session expired/revoked)
  $effect(() => {
    // Token exists locally but server says it's invalid
    if (authStore.sessionToken && sessionQuery.data === null && browser) {
      // Clear local token and redirect
      authStore.clearSession();
      // Note: the effect above will trigger redirect once token becomes null
    }
  });

  // Handle pending invite redemption after login
  $effect(() => {
    if (!browser || !sessionQuery.data || !authStore.sessionToken) return;

    const pendingInvite = localStorage.getItem("pendingInvite");
    if (!pendingInvite) return;

    // Clear immediately to prevent multiple attempts
    localStorage.removeItem("pendingInvite");

    // Redeem the invite
    (async () => {
      try {
        const result = await client.mutation(api.channelInvites.redeem, {
          sessionToken: authStore.sessionToken!,
          token: pendingInvite,
        });
        // Navigate to the joined channel
        activeChannelId = result.channelId;
      } catch (err) {
        // Silently fail - user is already on the main page
        console.error("Failed to redeem pending invite:", err);
      }
    })();
  });

  // Handle logout
  async function handleLogout() {
    // Stop heartbeat first to prevent new presence updates
    presenceManager.stopHeartbeat();

    // Clear presence record so user doesn't appear online
    await client.mutation(api.presence.clearPresence, {
      sessionId: presenceManager.getSessionId(),
    });

    // Logout from auth
    if (authStore.sessionToken) {
      await client.mutation(api.auth.logout, {
        sessionToken: authStore.sessionToken,
      });
    }
    authStore.clearSession();

    // Clear unread counts on logout
    unreadCounts.clearAll();

    // Clear persisted channel on logout
    if (browser) {
      localStorage.removeItem(ACTIVE_CHANNEL_KEY);
    }

    goto("/auth/login");
  }

  // Session token getter for authenticated requests
  const getSessionToken = () => authStore.sessionToken;

  // Inject send mutation into QueueManager
  $effect(() => {
    messageQueue.setSendMutation(async (args) => {
      // Strip authorName (derived from session on backend) and sessionToken (handled by wrapper)
      const { authorName, sessionToken, ...mutationArgs } = args;
      await client.mutation(api.messages.send, { ...mutationArgs, sessionToken });
    }, getSessionToken);
  });

  // Inject heartbeat mutation into PresenceManager
  $effect(() => {
    presenceManager.setHeartbeatMutation(async (args) => {
      await client.mutation(api.presence.heartbeat, args);
    }, getSessionToken);
  });

  // Mobile drawer state
  let drawerOpen = $state(false);

  // Theme state with localStorage persistence
  let isDark = $state(false);

  if (browser) {
    isDark = localStorage.getItem("flack-theme") === "dark";
  }

  $effect(() => {
    if (browser) {
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      localStorage.setItem("flack-theme", isDark ? "dark" : "light");
    }
  });

  function toggleTheme() {
    isDark = !isDark;
  }

  // Channel state with localStorage persistence
  const ACTIVE_CHANNEL_KEY = "flack_active_channel";
  let activeChannelId = $state<Id<"channels"> | null>(null);
  let channelRestored = $state(false);

  // Restore active channel from localStorage on mount
  if (browser) {
    const savedChannelId = localStorage.getItem(ACTIVE_CHANNEL_KEY);
    if (savedChannelId) {
      // Will be validated once channels load
      activeChannelId = savedChannelId as Id<"channels">;
    }
  }

  // Persist active channel to localStorage when it changes
  $effect(() => {
    if (browser && activeChannelId && channelRestored) {
      localStorage.setItem(ACTIVE_CHANNEL_KEY, activeChannelId);
    }
  });

  // Queries
  const channelsQuery = useQuery(
    api.channels.list,
    () => authStore.sessionToken ? { sessionToken: authStore.sessionToken } : "skip"
  );
  const messagesQuery = useQuery(
    api.messages.list,
    () => (activeChannelId && authStore.sessionToken
      ? { channelId: activeChannelId, sessionToken: authStore.sessionToken }
      : "skip")
  );

  // Presence queries
  const onlineUsersQuery = useQuery(
    api.presence.listOnline,
    () => (activeChannelId && authStore.sessionToken
      ? { channelId: activeChannelId, sessionToken: authStore.sessionToken }
      : "skip")
  );
  const typingUsersQuery = useQuery(
    api.presence.listTyping,
    () => (activeChannelId && authStore.sessionToken
      ? { channelId: activeChannelId, sessionToken: authStore.sessionToken }
      : "skip")
  );

  // Channel members query for @mention autocomplete
  const channelMembersQuery = useQuery(
    api.channelMembers.listMembers,
    () => (activeChannelId && authStore.sessionToken
      ? { channelId: activeChannelId, sessionToken: authStore.sessionToken }
      : "skip")
  );

  // Transform channel members to MentionableUser format for autocomplete
  const channelMembersForMention = $derived.by((): MentionableUser[] => {
    const members = channelMembersQuery.data;
    if (!members) return [];
    return members
      .filter((m): m is typeof m & { user: NonNullable<typeof m.user> } => m.user !== null)
      .map((m) => ({
        id: m.user._id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
      }));
  });

  // Auto-select channel when loaded (validate saved or fall back to first)
  // Using untrack to prevent infinite loops when reading state we also write to
  $effect(() => {
    const channels = channelsQuery.data;
    if (!channels || channels.length === 0) return;

    // Read current values without tracking to avoid infinite loop
    const currentActiveChannelId = untrack(() => activeChannelId);
    const currentChannelRestored = untrack(() => channelRestored);

    // Check if saved channel exists in list
    const savedChannelExists = currentActiveChannelId && channels.some(c => c._id === currentActiveChannelId);

    if (savedChannelExists && !currentChannelRestored) {
      // Saved channel is valid - mark restored and as read
      channelRestored = true;
      unreadCounts.markAsRead(currentActiveChannelId!);
    } else if (!savedChannelExists && !currentChannelRestored) {
      // No valid saved channel - fall back to first
      activeChannelId = channels[0]._id;
      channelRestored = true;
      unreadCounts.markAsRead(channels[0]._id);
    }
  });

  // Track message counts per channel for unread detection
  // Store previous message counts to detect new messages
  let prevMessageCounts = $state<Record<string, number>>({});

  // Query for all channels' latest message to detect new messages
  // This is a lightweight query that just returns the count/latest timestamp
  const allChannelsMessagesQuery = useQuery(
    api.messages.listLatestPerChannel,
    () => authStore.sessionToken ? { sessionToken: authStore.sessionToken } : "skip"
  );

  // Detect new messages in inactive channels and increment unread counts + trigger notifications
  $effect(() => {
    const latestMessages = allChannelsMessagesQuery.data;
    if (!latestMessages || !activeChannelId) return;

    const channels = untrack(() => channelsQuery.data);

    for (const channelData of latestMessages) {
      const channelId = channelData.channelId;
      const messageCount = channelData.messageCount;

      // Skip the active channel - we're reading it
      if (channelId === activeChannelId) {
        prevMessageCounts[channelId] = messageCount;
        continue;
      }

      const prevCount = prevMessageCounts[channelId] ?? 0;
      if (messageCount > prevCount && prevCount > 0) {
        // New messages arrived in an inactive channel
        const newMessages = messageCount - prevCount;
        unreadCounts.incrementUnread(channelId, newMessages);

        // Check if current user is mentioned in the latest message
        if (channelData.latestMessage) {
          const currentUserId = sessionQuery.data?.id;
          const mentions = channelData.latestMessage.mentions;
          const specialMentions = channelData.latestMessage.specialMentions;

          // Count as mention if directly @mentioned or @channel/@here
          const isMentioned = currentUserId && mentions?.includes(currentUserId);
          const hasBroadcastMention = specialMentions && specialMentions.length > 0;

          if (isMentioned || hasBroadcastMention) {
            unreadCounts.incrementMentions(channelId);
          }
        }

        // Trigger notification for new messages (if conditions are met)
        if (channelData.latestMessage && notificationService.shouldNotify(
          channelId,
          channelData.latestMessage.authorId,
          channelData.latestMessage.mentions,
          channelData.latestMessage.specialMentions
        )) {
          const channelName = channels?.find(c => c._id === channelId)?.name ?? "channel";
          notificationService.show({
            title: `New message in #${channelName}`,
            body: channelData.latestMessage.body,
            channelId,
            channelName,
            messageId: channelData.latestMessage._id,
            authorId: channelData.latestMessage.authorId,
            authorName: channelData.latestMessage.authorName,
            mentions: channelData.latestMessage.mentions,
            specialMentions: channelData.latestMessage.specialMentions,
          });
        }
      }

      prevMessageCounts[channelId] = messageCount;
    }
  });

  // Get active channel name for empty state
  const activeChannelName = $derived(
    channelsQuery.data?.find(c => c._id === activeChannelId)?.name
  );

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
   * 4. Add pending queue entries with their createdAt timestamp
   * 5. Sort all messages chronologically by _creationTime
   */
  const mergedMessages = $derived.by(() => {
    // Step 1: Get server-confirmed messages from Convex real-time subscription
    // The server now returns mentionMap for each message (username -> userId)
    type ServerMessageWithMentionMap = Doc<"messages"> & { mentionMap?: Record<string, string> };
    const serverMessages = (messagesQuery.data ?? []) as ServerMessageWithMentionMap[];

    // Step 2: Build set of clientMutationIds that the server has confirmed
    // This allows O(1) lookup to check if a local queue entry has been confirmed
    const confirmedIds = new Set(
      serverMessages
        .map((m) => m.clientMutationId)
        .filter(Boolean)
    );

    // Step 3: Filter local queue to entries not yet confirmed by server
    // - Must match current channel (don't show messages from other channels)
    // - Must not be in confirmedIds (not yet acknowledged by server)
    // - Must not be in "confirming" status (being removed, prevents duplicates)
    const stillPending = messageQueue.queue.filter(
      (entry) =>
        entry.channelId === activeChannelId &&
        !confirmedIds.has(entry.clientMutationId) &&
        entry.status !== "confirming"
    );

    // Step 4: Convert server messages to unified MergedMessage format
    // All server messages get status="confirmed" (they're the source of truth)
    const merged: MergedMessage[] = serverMessages.map(
      (m) => ({
        _id: m._id,
        _creationTime: m._creationTime,
        clientMutationId: m.clientMutationId ?? m._id, // Fallback for old messages
        channelId: m.channelId,
        authorName: m.authorName,
        body: m.body,
        status: "confirmed" as const,
        mentionMap: m.mentionMap, // Include mentionMap for self-mention highlighting
      })
    );

    // Step 5: Add pending queue entries with their createdAt as _creationTime
    // This ensures offline messages sort correctly among server messages
    stillPending.forEach((entry) => {
      merged.push({
        _creationTime: entry.createdAt, // Use local timestamp for sorting
        clientMutationId: entry.clientMutationId,
        channelId: entry.channelId,
        authorName: entry.authorName,
        body: entry.body,
        status: entry.status, // "pending" | "sending" | "failed"
        error: entry.error,
        retryCount: entry.retryCount,
        // Pending messages don't have mentionMap yet (not confirmed by server)
      });
    });

    // Step 6: Sort chronologically - pending messages appear at correct position
    return merged.sort((a, b) => a._creationTime - b._creationTime);
  });

  // Handle sending a message
  async function handleSend(body: string) {
    if (!activeChannelId) return;

    const clientMutationId = crypto.randomUUID();
    const authorName = presenceManager.getUserName();

    // Record typing for notification suppression
    notificationService.recordTyping(activeChannelId);

    // Show notification prompt after first message (if eligible)
    if (!hasSentFirstMessage && notificationService.shouldShowPrompt()) {
      hasSentFirstMessage = true;
      // Slight delay so message sends first
      setTimeout(() => {
        showNotificationPrompt = true;
      }, 1000);
    }

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
    // Only focus if actually switching channels (not initial load)
    const isSwitch = activeChannelId !== null && activeChannelId !== channelId;
    activeChannelId = channelId;

    // Mark the channel as read when switching to it
    unreadCounts.markAsRead(channelId);

    // Close drawer on mobile after selection
    if (responsive.isMobile) {
      drawerOpen = false;
    }

    // Focus message input after channel switch for keyboard users
    // Use requestAnimationFrame to ensure DOM has updated
    if (isSwitch) {
      requestAnimationFrame(() => {
        chatInputRef?.focus();
      });
    }
  }

  // Handle retry of failed messages
  async function handleRetry(clientMutationId: string) {
    await messageQueue.retry(clientMutationId);
  }

  // Chat input ref for keyboard shortcuts
  let chatInputRef: HTMLTextAreaElement | undefined = $state();

  // Modal states
  let quickSwitcherOpen = $state(false);
  let shortcutsHelpOpen = $state(false);
  let inviteModalOpen = $state(false);
  let settingsOpen = $state(false);

  // Notification prompt state
  let showNotificationPrompt = $state(false);
  let hasSentFirstMessage = $state(false);

  // Initialize notification service with user context
  $effect(() => {
    if (sessionQuery.data) {
      notificationService.setCurrentUserId(sessionQuery.data.id);
    }
  });

  // Track focused channel for notification suppression
  $effect(() => {
    notificationService.setFocusedChannelId(activeChannelId);
  });

  // Sync unread counts to system tray badge (Tauri only)
  $effect(() => {
    const totalUnread = unreadCounts.totalUnread;
    // Debounce by using untrack to avoid triggering on every micro-change
    untrack(() => {
      systemTrayManager.setBadge(totalUnread);
    });
  });

  // Get current user's role in active channel
  const currentUserRole = $derived(() => {
    const channels = channelsQuery.data;
    if (!channels || !activeChannelId) return null;
    const channel = channels.find(c => c._id === activeChannelId);
    return channel?.role ?? null;
  });

  // Can current user invite to active channel?
  const canInvite = $derived(() => {
    const role = currentUserRole();
    return role === "owner" || role === "admin";
  });

  // Global keyboard shortcuts
  function handleGlobalKeydown(e: KeyboardEvent) {
    // Don't trigger shortcuts when typing in inputs (except for meta keys)
    const isTyping = document.activeElement instanceof HTMLInputElement ||
                     document.activeElement instanceof HTMLTextAreaElement;

    // Cmd/Ctrl+K to open quick switcher
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      quickSwitcherOpen = true;
      return;
    }

    // Cmd/Ctrl+N to focus message input
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      chatInputRef?.focus();
      return;
    }

    // Don't trigger non-meta shortcuts when typing
    if (isTyping) return;

    // ? to show keyboard shortcuts help
    if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      shortcutsHelpOpen = true;
      return;
    }

    // Escape to close modals or blur
    if (e.key === "Escape") {
      if (quickSwitcherOpen) {
        quickSwitcherOpen = false;
      } else if (shortcutsHelpOpen) {
        shortcutsHelpOpen = false;
      } else {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- Auth loading state - show minimal UI while checking auth -->
<!--
  authStore.sessionToken states:
  - undefined: loading from storage → show spinner
  - null: no token → redirect to login (show blank)
  - string: have token → check sessionQuery.data

  sessionQuery.data states (when token exists):
  - undefined: query in flight → show spinner
  - null: token invalid → will clear and redirect
  - object: valid session → show app
-->
{#if authStore.sessionToken === undefined}
  <!-- Still loading token from storage -->
  <div class="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
    <div class="flex flex-col items-center gap-3">
      <div class="w-8 h-8 border-3 border-[var(--text-tertiary)] border-t-volt rounded-full animate-spin"></div>
      <span class="text-sm text-[var(--text-secondary)]">Loading...</span>
    </div>
  </div>
{:else if authStore.sessionToken === null}
  <!-- No token - redirecting to login -->
  <div class="min-h-screen bg-[var(--bg-primary)]"></div>
{:else if sessionQuery.data === undefined}
  <!-- Have token, validating session -->
  <div class="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
    <div class="flex flex-col items-center gap-3">
      <div class="w-8 h-8 border-3 border-[var(--text-tertiary)] border-t-volt rounded-full animate-spin"></div>
      <span class="text-sm text-[var(--text-secondary)]">Loading...</span>
    </div>
  </div>
{:else if sessionQuery.data === null}
  <!-- Token invalid - will be cleared and redirected -->
  <div class="min-h-screen bg-[var(--bg-primary)]"></div>
{:else}
  <!-- Authenticated - render full app -->

  <!-- Quick Switcher Modal -->
  {#if channelsQuery.data}
    <QuickSwitcher
      channels={channelsQuery.data}
      isOpen={quickSwitcherOpen}
      onSelect={handleChannelSelect}
      onClose={() => quickSwitcherOpen = false}
    />
  {/if}

  <!-- Keyboard Shortcuts Help Modal -->
  <KeyboardShortcutsHelp
    isOpen={shortcutsHelpOpen}
    onClose={() => shortcutsHelpOpen = false}
  />

  <!-- Skip Link - first focusable element for keyboard users -->
  <SkipLink href="#main-content" label="Skip to messages" />

  <OfflineIndicator isOnline={messageQueue.isOnline} />
  <QueueStatus
    queueCount={messageQueue.queue.length}
    isSyncing={messageQueue.isSyncing}
  />
  <PersistenceWarning isPersistenceEnabled={messageQueue.isPersistenceEnabled} />
  <StorageWarning
    isQuotaExceeded={messageQueue.isQuotaExceeded}
    isQueueFull={messageQueue.isQueueFull}
  />

  <!-- Notification Permission Prompt -->
  {#if showNotificationPrompt}
    <NotificationPrompt
      onEnable={() => showNotificationPrompt = false}
      onDismiss={() => showNotificationPrompt = false}
    />
  {/if}

<!-- Sidebar content (shared between desktop aside and mobile drawer) -->
{#snippet sidebarContent()}
  <h2 class="text-lg font-bold mb-4">Flack</h2>

  <div class="text-xs text-[var(--text-secondary)] uppercase mb-2">
    Channels
  </div>

  {#if channelsQuery.error}
    <ErrorBoundary
      error={channelsQuery.error}
      context="loading channels"
    />
  {:else if channelsQuery.data}
    <ChannelList
      channels={channelsQuery.data}
      {activeChannelId}
      currentUserId={(authStore.user?.id as Id<"users">) ?? null}
      sessionToken={authStore.sessionToken ?? ""}
      onSelect={handleChannelSelect}
    />
  {:else if channelsQuery.isLoading}
    <LoadingSkeleton variant="channel" count={5} />
  {:else if channelsQuery.data?.length === 0}
    <EmptyState variant="channels" />
  {/if}

  <!-- Online Users -->
  {#if activeChannelId && onlineUsersQuery.data}
    <OnlineUsers onlineUsers={onlineUsersQuery.data} />
  {/if}

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- User Info & Actions -->
  <div class="border-t border-[var(--border-default)] pt-4 mt-4 space-y-2">
    {#if authStore.isLoading}
      <!-- Loading skeleton for user info -->
      <div class="px-2 py-1 animate-pulse" aria-hidden="true">
        <div class="h-4 w-24 rounded bg-[var(--bg-tertiary)] mb-1.5"></div>
        <div class="h-3 w-32 rounded bg-[var(--bg-tertiary)]"></div>
      </div>
      <div class="h-9 rounded bg-[var(--bg-tertiary)] animate-pulse" aria-hidden="true"></div>
    {:else if authStore.user}
      <div class="px-2 py-1">
        <div class="text-sm font-medium truncate">{authStore.user.name}</div>
        <div class="text-xs text-[var(--text-tertiary)] truncate">
          {authStore.user.email}
        </div>
      </div>
      <button
        onclick={handleLogout}
        aria-label="Sign out"
        class="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        Sign out
      </button>
    {:else}
      <a
        href="/auth/login"
        class="block w-full text-center px-3 py-2 bg-volt text-white rounded text-sm hover:bg-volt/90 transition-colors"
      >
        Sign in
      </a>
    {/if}

    <!-- Settings Button -->
    <button
      onclick={() => settingsOpen = !settingsOpen}
      aria-label="Toggle settings"
      aria-expanded={settingsOpen}
      class="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-volt/10 hover:text-volt transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>Settings</span>
    </button>

    <!-- Collapsible Settings Panel -->
    {#if settingsOpen}
      <div class="mt-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-default)]">
        <NotificationSettings />
      </div>
    {/if}

    <!-- Theme Toggle -->
    <button
      onclick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      class="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-volt/10 hover:text-volt transition-colors"
    >
      {#if isDark}
        <span>Light Mode</span>
      {:else}
        <span>Dark Mode</span>
      {/if}
    </button>
  </div>
{/snippet}

<!-- Mobile Drawer (shown on mobile only) -->
{#if responsive.isMobile}
  <MobileDrawer bind:isOpen={drawerOpen}>
    <div class="flex flex-col h-full">
      {@render sidebarContent()}
    </div>
  </MobileDrawer>
{/if}

<div class="flex min-h-screen flex-col">
  <!-- Mobile Header (shown on mobile only) -->
  {#if responsive.isMobile}
    <header class="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-default)]">
      <HamburgerButton isOpen={drawerOpen} onclick={() => drawerOpen = !drawerOpen} />
      <h1 class="text-lg font-bold">Flack</h1>
      {#if activeChannelId && channelsQuery.data}
        {@const activeChannel = channelsQuery.data.find(c => c._id === activeChannelId)}
        {#if activeChannel}
          <span class="text-[var(--text-secondary)]">#{activeChannel.name}</span>
        {/if}
      {/if}
    </header>
    <!-- Spacer for fixed header -->
    <div class="h-14"></div>
  {/if}

  <div class="flex flex-1">
    <!-- Desktop Sidebar (hidden on mobile) -->
    {#if !responsive.isMobile}
      <aside
        role="complementary"
        aria-label="Sidebar"
        class="w-64 bg-[var(--bg-secondary)] p-4 flex flex-col"
      >
        {@render sidebarContent()}
      </aside>
    {/if}

    <!-- Main Content -->
    <main
      id="main-content"
      role="main"
      aria-label="Messages"
      class="flex-1 bg-[var(--bg-primary)] flex flex-col"
    >
      {#if activeChannelId}
        <!-- Channel header with Invite button -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
          <h2 class="text-lg font-semibold text-[var(--text-primary)]">
            #{activeChannelName ?? ""}
          </h2>
          {#if canInvite()}
            <button
              onclick={() => inviteModalOpen = true}
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-volt/10 rounded transition-colors"
              aria-label="Invite people to this channel"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>Invite</span>
            </button>
          {/if}
        </div>

        {#if messagesQuery.error}
          <div class="flex-1 flex items-center justify-center">
            <ErrorBoundary
              error={messagesQuery.error}
              context="loading messages"
            />
          </div>
        {:else if activeChannelId && messagesQuery.isLoading && mergedMessages.length === 0}
          <!-- Only show loading if we have a channel selected and query is actually running -->
          <div class="flex-1 flex flex-col items-center justify-center gap-3" aria-busy="true">
            <div class="w-8 h-8 border-3 border-[var(--text-tertiary)] border-t-volt rounded-full animate-spin"></div>
            <span class="text-sm text-[var(--text-secondary)]">Loading messages...</span>
          </div>
        {:else if !activeChannelId}
          <!-- No channel selected yet -->
          <div class="flex-1 flex items-center justify-center">
            <span class="text-[var(--text-secondary)]">Select a channel to start chatting</span>
          </div>
        {:else}
          <MessageList messages={mergedMessages} onRetry={handleRetry} channelName={activeChannelName} channelId={activeChannelId} currentUserId={(authStore.user?.id as Id<"users">) ?? null} />
        {/if}
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
          channelMembers={channelMembersForMention}
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
</div>

<!-- Invite Modal -->
{#if activeChannelId && activeChannelName && authStore.sessionToken}
  <InviteModal
    isOpen={inviteModalOpen}
    channelId={activeChannelId}
    channelName={activeChannelName}
    sessionToken={authStore.sessionToken}
    onClose={() => inviteModalOpen = false}
  />
{/if}

{/if}
<!-- End of auth check -->
