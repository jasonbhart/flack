/**
 * NotificationService - Cross-platform notification management
 *
 * Handles notification permissions, preferences, and display for both
 * web browsers (Web Notifications API) and Tauri desktop (native OS notifications).
 * Uses localStorage persistence for preferences.
 *
 * Permission states:
 * - 'default': User hasn't been asked yet
 * - 'granted': User allowed notifications
 * - 'denied': User blocked notifications (can only change via browser/OS settings)
 */

import { browser } from "$app/environment";
import { isTauri } from "$lib/utils/platform";

const PREFS_STORAGE_KEY = "flack_notification_prefs";
const PROMPT_DISMISSED_KEY = "flack_notification_prompt_dismissed";
const PROMPT_COOLDOWN_DAYS = 7;

interface NotificationPreferences {
  enabled: boolean;
  notifyAllMessages: boolean; // vs mentions-only
  soundEnabled: boolean;
}

interface NotificationOptions {
  title: string;
  body: string;
  channelId: string;
  channelName: string;
  messageId: string;
  authorId: string;
  authorName: string;
  icon?: string;
  /** User IDs mentioned in this message */
  mentions?: string[];
  /** Special mentions (@channel, @here) */
  specialMentions?: ("channel" | "here")[];
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  notifyAllMessages: true,
  soundEnabled: true,
};

// Tauri action type IDs
const TAURI_ACTION_TYPE_ID = "flack-message";
const TAURI_ACTION_VIEW = "view";

class NotificationService {
  // Reactive state using Svelte 5 runes
  permission = $state<NotificationPermission>("default");
  enabled = $state<boolean>(true);
  notifyAllMessages = $state<boolean>(true);
  soundEnabled = $state<boolean>(true);

  // Track typing timestamps per channel (for suppression)
  private lastTypingTimestamps = $state<Record<string, number>>({});

  // Current user ID (set externally)
  private currentUserId: string | null = null;

  // Currently focused channel ID (set externally)
  private focusedChannelId: string | null = null;

  private initialized = false;
  private tauriActionsRegistered = false;

  constructor() {
    if (browser) {
      this.initialize();
    }
  }

  /**
   * Initialize service - load preferences and sync permission state
   */
  private initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Load preferences from localStorage first
    this.loadPreferences();

    // Initialize platform-specific permission state
    if (isTauri()) {
      // Tauri: check permission async
      this.initTauriPermission();
    } else {
      // Web: check if Notification API is supported
      if (!("Notification" in window)) {
        console.warn("Notification API not supported");
        this.enabled = false;
        return;
      }
      // Sync permission state from browser
      this.permission = Notification.permission;
    }
  }

  /**
   * Initialize Tauri notification permission state
   */
  private async initTauriPermission() {
    try {
      const { isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );
      const granted = await isPermissionGranted();
      this.permission = granted ? "granted" : "default";

      // Register action types and listeners if permission granted
      if (granted) {
        await this.registerTauriActions();
      }
    } catch (error) {
      console.warn("Failed to check Tauri notification permission:", error);
      this.permission = "default";
    }
  }

  /**
   * Register Tauri notification action types and click listener
   */
  private async registerTauriActions() {
    if (this.tauriActionsRegistered) return;

    try {
      const { registerActionTypes, onAction } = await import(
        "@tauri-apps/plugin-notification"
      );

      // Register action type with "View" button
      await registerActionTypes([
        {
          id: TAURI_ACTION_TYPE_ID,
          actions: [
            {
              id: TAURI_ACTION_VIEW,
              title: "View",
              foreground: true, // Bring app to foreground
            },
          ],
        },
      ]);

      // Listen for notification clicks/actions
      await onAction((notification) => {
        this.handleTauriNotificationClick(notification);
      });

      this.tauriActionsRegistered = true;
    } catch (error) {
      console.warn("Failed to register Tauri notification actions:", error);
    }
  }

  /**
   * Handle Tauri notification click - focus window and navigate
   */
  private async handleTauriNotificationClick(notification: {
    extra?: Record<string, unknown>;
  }) {
    try {
      // Focus the window
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      await currentWindow.setFocus();

      // Extract channel info from notification extra data
      const channelId = notification.extra?.channelId as string | undefined;
      const messageId = notification.extra?.messageId as string | undefined;

      if (channelId) {
        // Post message to navigate (picked up by main app)
        window.postMessage(
          {
            type: "FLACK_NOTIFICATION_CLICK",
            channelId,
            messageId,
          },
          "*"
        );
      }
    } catch (error) {
      console.error("Failed to handle Tauri notification click:", error);
    }
  }

  /**
   * Load notification preferences from localStorage
   */
  private loadPreferences() {
    if (!browser) return;

    try {
      const stored = localStorage.getItem(PREFS_STORAGE_KEY);
      if (stored) {
        const prefs: NotificationPreferences = JSON.parse(stored);
        this.enabled = prefs.enabled ?? DEFAULT_PREFS.enabled;
        this.notifyAllMessages = prefs.notifyAllMessages ?? DEFAULT_PREFS.notifyAllMessages;
        this.soundEnabled = prefs.soundEnabled ?? DEFAULT_PREFS.soundEnabled;
      }
    } catch (error) {
      console.warn("Failed to load notification preferences:", error);
    }
  }

  /**
   * Save notification preferences to localStorage
   */
  private savePreferences() {
    if (!browser) return;

    try {
      const prefs: NotificationPreferences = {
        enabled: this.enabled,
        notifyAllMessages: this.notifyAllMessages,
        soundEnabled: this.soundEnabled,
      };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn("Failed to save notification preferences:", error);
    }
  }

  /**
   * Request notification permission from user
   * Returns the new permission state
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!browser) return "denied";

    if (isTauri()) {
      // Tauri: use native permission request
      try {
        const { isPermissionGranted, requestPermission } = await import(
          "@tauri-apps/plugin-notification"
        );

        // Check if already granted
        let granted = await isPermissionGranted();
        if (!granted) {
          // Request permission (returns "granted" | "denied" | "default")
          const result = await requestPermission();
          granted = result === "granted";
        }

        this.permission = granted ? "granted" : "denied";

        // Register action types after permission granted
        if (granted) {
          await this.registerTauriActions();
        }

        return this.permission;
      } catch (error) {
        console.error("Failed to request Tauri notification permission:", error);
        return "denied";
      }
    }

    // Web: use Notification API
    if (!("Notification" in window)) {
      return "denied";
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result;
      return result;
    } catch (error) {
      console.error("Failed to request notification permission:", error);
      return "denied";
    }
  }

  /**
   * Set enabled state and persist
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.savePreferences();
  }

  /**
   * Set notifyAllMessages preference and persist
   */
  setNotifyAllMessages(notifyAll: boolean) {
    this.notifyAllMessages = notifyAll;
    this.savePreferences();
  }

  /**
   * Set sound enabled preference and persist
   */
  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    this.savePreferences();
  }

  /**
   * Set current user ID (for "don't notify for own messages" logic)
   */
  setCurrentUserId(userId: string | null) {
    this.currentUserId = userId;
  }

  /**
   * Set currently focused channel ID (for suppression logic)
   */
  setFocusedChannelId(channelId: string | null) {
    this.focusedChannelId = channelId;
  }

  /**
   * Record that user typed in a channel (for suppression)
   */
  recordTyping(channelId: string) {
    this.lastTypingTimestamps = {
      ...this.lastTypingTimestamps,
      [channelId]: Date.now(),
    };
  }

  /**
   * Check if notification should be shown for a message
   * Considers: enabled, permission, focus, author, typing, mentions
   */
  shouldNotify(
    channelId: string,
    authorId: string,
    mentions?: string[],
    specialMentions?: ("channel" | "here")[]
  ): boolean {
    // Basic checks
    if (!this.enabled) return false;
    if (this.permission !== "granted") return false;

    // Don't notify for own messages
    if (this.currentUserId && authorId === this.currentUserId) return false;

    // Don't notify if tab is focused and viewing this channel
    if (browser && document.hasFocus() && channelId === this.focusedChannelId) {
      return false;
    }

    // Don't notify if user typed in channel recently (30 seconds)
    const lastTyping = this.lastTypingTimestamps[channelId];
    if (lastTyping && Date.now() - lastTyping < 30000) {
      return false;
    }

    // If mentions-only mode, check if current user is mentioned or there's a broadcast mention
    if (!this.notifyAllMessages) {
      const isDirectlyMentioned = mentions && this.currentUserId && mentions.includes(this.currentUserId);
      // @channel notifies all members, @here notifies online members
      // For simplicity, we notify all users for both (online status check would be complex)
      const hasBroadcastMention = specialMentions && specialMentions.length > 0;

      if (!isDirectlyMentioned && !hasBroadcastMention) {
        return false;
      }
    }

    return true;
  }

  /**
   * Show a notification for a new message
   * Handles click to focus tab and navigate to channel
   */
  show(options: NotificationOptions): void {
    if (!browser) return;
    if (this.permission !== "granted") return;

    // Truncate body to 100 chars
    const body =
      options.body.length > 100
        ? options.body.substring(0, 97) + "..."
        : options.body;

    // Check if current user was mentioned
    const isMentioned =
      this.currentUserId &&
      options.mentions &&
      options.mentions.includes(this.currentUserId);

    // Check for special mentions (@channel, @here)
    const hasSpecialMention =
      options.specialMentions && options.specialMentions.length > 0;

    // Build title with mention indicator
    let title = `${options.authorName} in #${options.channelName}`;
    if (isMentioned) {
      title = `${options.authorName} mentioned you in #${options.channelName}`;
    } else if (hasSpecialMention) {
      const specialType = options.specialMentions![0];
      title = `${options.authorName} @${specialType} in #${options.channelName}`;
    }

    if (isTauri()) {
      this.showTauriNotification(title, body, options);
    } else {
      this.showWebNotification(title, body, options);
    }
  }

  /**
   * Show notification using Tauri native API
   */
  private async showTauriNotification(
    title: string,
    body: string,
    options: NotificationOptions
  ): Promise<void> {
    try {
      // Ensure actions are registered before showing notification
      if (!this.tauriActionsRegistered) {
        await this.registerTauriActions();
      }

      const { sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );

      await sendNotification({
        title,
        body,
        sound: this.soundEnabled ? "default" : undefined,
        // Reference the registered action type for "View" button
        actionTypeId: TAURI_ACTION_TYPE_ID,
        // Store channel/message info for click handler
        extra: {
          channelId: options.channelId,
          channelName: options.channelName,
          messageId: options.messageId,
          authorId: options.authorId,
          authorName: options.authorName,
        },
      });

      // Also post message for in-app handling (window may already be focused)
      window.postMessage(
        {
          type: "FLACK_NOTIFICATION_SHOWN",
          channelId: options.channelId,
          messageId: options.messageId,
        },
        "*"
      );
    } catch (error) {
      console.error("Failed to show Tauri notification:", error);
      // Fallback to web notification if Tauri fails
      this.showWebNotification(title, body, options);
    }
  }

  /**
   * Show notification using Web Notifications API
   */
  private showWebNotification(
    title: string,
    body: string,
    options: NotificationOptions
  ): void {
    if (!("Notification" in window)) return;

    try {
      const notification = new Notification(title, {
        body,
        tag: options.channelId, // Group notifications by channel
        icon: options.icon || "/favicon.png",
        data: {
          channelId: options.channelId,
          messageId: options.messageId,
        },
      });

      // Handle click - focus tab and navigate to channel
      notification.onclick = () => {
        window.focus();
        // Post message to navigate (picked up by main app)
        window.postMessage(
          {
            type: "FLACK_NOTIFICATION_CLICK",
            channelId: options.channelId,
            messageId: options.messageId,
          },
          "*"
        );
        notification.close();
      };
    } catch (error) {
      console.error("Failed to show web notification:", error);
    }
  }

  /**
   * Check if prompt should be shown (respects 7-day cooldown)
   */
  shouldShowPrompt(): boolean {
    if (!browser) return false;
    if (this.permission !== "default") return false;

    try {
      const dismissed = localStorage.getItem(PROMPT_DISMISSED_KEY);
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        const cooldownMs = PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() - dismissedAt < cooldownMs) {
          return false;
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    return true;
  }

  /**
   * Record that user dismissed the prompt
   */
  dismissPrompt() {
    if (!browser) return;

    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, Date.now().toString());
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Check if notifications are supported by the platform
   */
  get isSupported(): boolean {
    if (!browser) return false;
    // Tauri always supports notifications (via plugin)
    if (isTauri()) return true;
    // Web: check for Notification API
    return "Notification" in window;
  }

  /**
   * Check if notifications are fully ready (supported + granted + enabled)
   */
  get isReady(): boolean {
    return this.isSupported && this.permission === "granted" && this.enabled;
  }
}

export const notificationService = new NotificationService();
