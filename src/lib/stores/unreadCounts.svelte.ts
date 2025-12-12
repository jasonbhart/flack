import { browser } from "$app/environment";
import { calculateDividerInfo } from "$lib/utils/dividerCalculation";
import { shouldUpdateReadTimestamp } from "$lib/utils/readTimestamp";

const STORAGE_KEY = "flack_last_read_timestamps";

interface LastReadTimestamps {
  [channelId: string]: number; // Timestamp when channel was last read
}

class UnreadCountsStore {
  // In-memory counts per channel
  private counts = $state<Record<string, number>>({});

  // Mention counts per channel (messages where current user is @mentioned)
  private mentionCounts = $state<Record<string, number>>({});

  // Last read timestamps (persisted to localStorage)
  private lastReadTimestamps = $state<LastReadTimestamps>({});

  private initialized = false;

  constructor() {
    if (browser) {
      this.loadFromStorage();
    }
  }

  /**
   * Load last read timestamps from localStorage.
   * Handles missing/corrupt data gracefully.
   */
  private loadFromStorage() {
    if (!browser || this.initialized) return;
    this.initialized = true;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === "object" && parsed !== null) {
          this.lastReadTimestamps = parsed;
        }
      }
    } catch (error) {
      console.warn("Failed to load last read timestamps:", error);
      // Continue with empty state - counts will start fresh
    }
  }

  /**
   * Save last read timestamps to localStorage.
   */
  private saveToStorage() {
    if (!browser) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lastReadTimestamps));
    } catch (error) {
      console.warn("Failed to save last read timestamps:", error);
      // Non-critical - counts will work for this session
    }
  }

  /**
   * Mark a channel as read.
   * Sets last read timestamp to now and clears unread count and mention count.
   */
  markAsRead(channelId: string) {
    this.lastReadTimestamps[channelId] = Date.now();
    this.counts[channelId] = 0;
    this.mentionCounts[channelId] = 0;
    this.saveToStorage();
  }

  /**
   * Mark a channel as read only if the provided timestamp is newer than the current one.
   * Prevents race conditions from rapid updates (e.g., scroll events, multiple sources).
   * Use this when updating read state from scroll position or view events.
   */
  markAsReadIfNewer(channelId: string, timestamp: number) {
    if (shouldUpdateReadTimestamp(this.lastReadTimestamps[channelId], timestamp)) {
      this.lastReadTimestamps[channelId] = timestamp;
      this.counts[channelId] = 0;
      this.mentionCounts[channelId] = 0;
      this.saveToStorage();
    }
  }

  /**
   * Increment unread count for a channel.
   * Called when new messages arrive for inactive channels.
   */
  incrementUnread(channelId: string, amount: number = 1) {
    this.counts[channelId] = (this.counts[channelId] ?? 0) + amount;
  }

  /**
   * Increment mention count for a channel.
   * Called when a message mentions the current user (direct or @channel/@here).
   */
  incrementMentions(channelId: string, amount: number = 1) {
    this.mentionCounts[channelId] = (this.mentionCounts[channelId] ?? 0) + amount;
  }

  /**
   * Get unread count for a channel.
   * Returns 0 if no unreads tracked.
   */
  getCount(channelId: string): number {
    return this.counts[channelId] ?? 0;
  }

  /**
   * Get mention count for a channel.
   * Returns 0 if no mentions tracked.
   */
  getMentionCount(channelId: string): number {
    return this.mentionCounts[channelId] ?? 0;
  }

  /**
   * Get last read timestamp for a channel.
   * Used to determine which messages are unread when loading.
   */
  getLastReadTimestamp(channelId: string): number | undefined {
    return this.lastReadTimestamps[channelId];
  }

  /**
   * Initialize unread count from message timestamps.
   * Called when first loading a channel to count messages since last read.
   */
  initializeFromMessages(channelId: string, messageTimestamps: number[]) {
    const lastRead = this.lastReadTimestamps[channelId];

    if (!lastRead) {
      // Never read this channel - all messages are "read" (don't show huge badge)
      this.counts[channelId] = 0;
      return;
    }

    // Count messages newer than last read
    const unreadCount = messageTimestamps.filter(ts => ts > lastRead).length;
    this.counts[channelId] = unreadCount;
  }

  /**
   * Clear all unread data (e.g., on logout).
   */
  clearAll() {
    this.counts = {};
    this.mentionCounts = {};
    this.lastReadTimestamps = {};

    if (browser) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn("Failed to clear last read timestamps:", error);
      }
    }
  }

  /**
   * Get all counts as a reactive object.
   * Used by ChannelList to display badges.
   */
  get allCounts(): Record<string, number> {
    return this.counts;
  }

  /**
   * Get all mention counts as a reactive object.
   * Used by ChannelList to display @ badges.
   */
  get allMentionCounts(): Record<string, number> {
    return this.mentionCounts;
  }

  /**
   * Get total unread count across all channels.
   * Used for dock badge / system tray badge.
   */
  get totalUnread(): number {
    return Object.values(this.counts).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Get total mention count across all channels.
   * Used for dock badge priority / system tray badge.
   */
  get totalMentions(): number {
    return Object.values(this.mentionCounts).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Get divider information for displaying "New" separator in message list.
   * Delegates to exported calculateDividerInfo for testability.
   */
  getDividerInfo(
    channelId: string,
    messages: { _creationTime: number }[]
  ): { messageIndex: number; unreadCount: number } | null {
    return calculateDividerInfo(this.lastReadTimestamps[channelId], messages);
  }
}

export const unreadCounts = new UnreadCountsStore();
