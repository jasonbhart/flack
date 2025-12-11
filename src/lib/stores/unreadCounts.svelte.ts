import { browser } from "$app/environment";

const STORAGE_KEY = "flack_last_read_timestamps";

interface LastReadTimestamps {
  [channelId: string]: number; // Timestamp when channel was last read
}

class UnreadCountsStore {
  // In-memory counts per channel
  private counts = $state<Record<string, number>>({});

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
   * Sets last read timestamp to now and clears unread count.
   */
  markAsRead(channelId: string) {
    this.lastReadTimestamps = {
      ...this.lastReadTimestamps,
      [channelId]: Date.now()
    };
    this.counts = {
      ...this.counts,
      [channelId]: 0
    };
    this.saveToStorage();
  }

  /**
   * Increment unread count for a channel.
   * Called when new messages arrive for inactive channels.
   */
  incrementUnread(channelId: string, amount: number = 1) {
    const current = this.counts[channelId] ?? 0;
    this.counts = {
      ...this.counts,
      [channelId]: current + amount
    };
  }

  /**
   * Get unread count for a channel.
   * Returns 0 if no unreads tracked.
   */
  getCount(channelId: string): number {
    return this.counts[channelId] ?? 0;
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
      this.counts = {
        ...this.counts,
        [channelId]: 0
      };
      return;
    }

    // Count messages newer than last read
    const unreadCount = messageTimestamps.filter(ts => ts > lastRead).length;
    this.counts = {
      ...this.counts,
      [channelId]: unreadCount
    };
  }

  /**
   * Clear all unread data (e.g., on logout).
   */
  clearAll() {
    this.counts = {};
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
}

export const unreadCounts = new UnreadCountsStore();
