import { get, set } from "idb-keyval";
import type { QueueEntry, QueueStorage } from "$lib/types/queue";
import type { Id } from "../../../convex/_generated/dataModel";
import { isIndexedDBAvailable } from "$lib/utils/storageDetection";

const QUEUE_KEY = "flack-message-queue";
const QUEUE_VERSION_KEY = "flack-queue-version";
const STORAGE_VERSION = 2;
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const MAX_QUEUE_SIZE = 1000;

type SendMutationFn = (args: {
  channelId: Id<"channels">;
  body: string;
  clientMutationId: string;
  authorName: string;
  sessionToken?: string;
}) => Promise<unknown>;

type SessionTokenGetter = () => string | null;

/**
 * Queue statistics for UI display
 */
export interface QueueStats {
  pending: number;
  failed: number;
  sending: number;
  confirming: number;
  total: number;
}

/**
 * Result of enqueue operation
 */
export interface EnqueueResult {
  success: boolean;
  error?: string;
}

class MessageQueue {
  queue = $state<QueueEntry[]>([]);
  isOnline = $state(true);
  isSyncing = $state(false);
  /** Whether IndexedDB persistence is available */
  isPersistenceEnabled = $state(true);
  /** Whether storage quota has been exceeded */
  isQuotaExceeded = $state(false);
  /** Whether queue has reached maximum size */
  isQueueFull = $state(false);

  private sendMutation: SendMutationFn | null = null;
  private sessionTokenGetter: SessionTokenGetter | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private initPromise: Promise<void>;
  /** Promise chain for race-safe persistence */
  private persistChain: Promise<void> = Promise.resolve();
  /** Debounce timer for status update persistence */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 100;
  /** Map of retry timers by clientMutationId for cleanup */
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Get queue statistics for UI display
   */
  get stats(): QueueStats {
    let pending = 0;
    let failed = 0;
    let sending = 0;
    let confirming = 0;

    for (const entry of this.queue) {
      if (entry.status === "pending") pending++;
      else if (entry.status === "failed") failed++;
      else if (entry.status === "sending") sending++;
      else if (entry.status === "confirming") confirming++;
    }

    return {
      pending,
      failed,
      sending,
      confirming,
      total: this.queue.length,
    };
  }

  constructor() {
    if (typeof window !== "undefined") {
      this.isOnline = navigator.onLine;

      // Listen for online/offline events
      this.onlineHandler = () => {
        this.isOnline = true;
        this.flush();
      };
      this.offlineHandler = () => {
        this.isOnline = false;
      };

      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);

      // Check IndexedDB availability and restore queue
      this.initPromise = this.init();
    } else {
      this.initPromise = Promise.resolve();
    }
  }

  /**
   * Initialize storage: check persistence and restore queue
   */
  private async init(): Promise<void> {
    // Check if IndexedDB is available (detects private browsing)
    this.isPersistenceEnabled = await isIndexedDBAvailable();

    if (this.isPersistenceEnabled) {
      await this.restore();
    } else {
      console.warn("IndexedDB unavailable - messages won't persist across refresh");
    }
  }

  // Cleanup method for removing event listeners
  destroy() {
    if (typeof window !== "undefined") {
      if (this.onlineHandler) {
        window.removeEventListener("online", this.onlineHandler);
      }
      if (this.offlineHandler) {
        window.removeEventListener("offline", this.offlineHandler);
      }
    }
  }

  setSendMutation(fn: SendMutationFn, sessionTokenGetter: SessionTokenGetter) {
    this.sendMutation = fn;
    this.sessionTokenGetter = sessionTokenGetter;
  }

  /**
   * Persist with lock to prevent race conditions.
   * Chains operations to ensure they complete in order.
   */
  private persistWithLock(): Promise<void> {
    this.persistChain = this.persistChain
      .then(() => this.doPersist())
      .catch(() => {
        // Error already logged in doPersist, continue chain
      });
    return this.persistChain;
  }

  /**
   * Internal persist implementation.
   */
  private async doPersist(): Promise<void> {
    // Skip persistence if IndexedDB is not available
    if (!this.isPersistenceEnabled) {
      return;
    }

    try {
      const storage: QueueStorage = {
        version: 1,
        entries: this.queue,
      };
      await set(QUEUE_KEY, storage);
    } catch (error) {
      // Check for QuotaExceededError specifically
      if (
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" ||
          error.code === 22 || // Legacy code for QuotaExceededError
          error.name === "NS_ERROR_DOM_QUOTA_REACHED") // Firefox
      ) {
        console.warn("Storage quota exceeded, continuing in memory-only mode");
        this.isQuotaExceeded = true;
        this.isPersistenceEnabled = false;
      } else {
        console.warn("IndexedDB unavailable, queue will not persist:", error);
        this.isPersistenceEnabled = false;
      }
    }
  }

  /**
   * @deprecated Use persistWithLock() for race-safe persistence
   */
  private async persist(): Promise<void> {
    return this.persistWithLock();
  }

  /**
   * Debounced persist for status updates.
   * Batches multiple status changes within DEBOUNCE_MS window.
   * Cancels pending debounce if immediate persist is called.
   */
  private debouncedPersist(): void {
    // Cancel any pending debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.persistWithLock();
    }, this.DEBOUNCE_MS);
  }

  /**
   * Cancel pending debounced persist (called before immediate persist).
   */
  private cancelDebouncedPersist(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private async restore(): Promise<void> {
    try {
      // Check stored version
      const storedVersion = await get<number>(QUEUE_VERSION_KEY);
      const storage = await get<QueueStorage>(QUEUE_KEY);

      if (!storage || !storage.entries) {
        // No stored data
        await set(QUEUE_VERSION_KEY, STORAGE_VERSION);
        return;
      }

      // Handle version migration
      if (storedVersion === undefined || storedVersion === 1) {
        // Migrate from v1 to v2
        console.log("Migrating queue storage from v1 to v2");
        this.queue = this.migrateV1ToV2(storage.entries);
        await set(QUEUE_VERSION_KEY, STORAGE_VERSION);
        await this.persistWithLock();
      } else if (storedVersion === STORAGE_VERSION) {
        // Current version - just sanitize sending status (crash recovery)
        this.queue = storage.entries.map((entry) => ({
          ...entry,
          status: entry.status === "sending" ? "pending" : entry.status,
        }));
      } else {
        // Unknown future version - clear queue for safety
        console.warn("Unknown queue version, clearing queue:", storedVersion);
        this.queue = [];
        await set(QUEUE_VERSION_KEY, STORAGE_VERSION);
      }
    } catch (error) {
      console.warn("IndexedDB unavailable, queue will not persist:", error);
      this.queue = [];
    }
  }

  /**
   * Migrate v1 queue entries to v2 format.
   * - Reset "sending" to "pending" (crash recovery)
   * - Add any missing fields with defaults
   */
  private migrateV1ToV2(entries: QueueEntry[]): QueueEntry[] {
    return entries.map((entry) => ({
      ...entry,
      // Reset sending status (crash recovery)
      status: entry.status === "sending" ? "pending" : entry.status,
      // Ensure all required fields exist
      retryCount: entry.retryCount ?? 0,
      createdAt: entry.createdAt ?? Date.now(),
    }));
  }

  async enqueue(
    entry: Omit<QueueEntry, "retryCount" | "createdAt">
  ): Promise<EnqueueResult> {
    // Wait for restore() to complete before enqueueing to prevent race condition
    await this.initPromise;

    // Count pending/failed messages (not sending/confirming which are in progress)
    const pendingCount = this.queue.filter(
      (e) => e.status === "pending" || e.status === "failed"
    ).length;

    // Check queue size limit
    if (pendingCount >= MAX_QUEUE_SIZE) {
      this.isQueueFull = true;
      return {
        success: false,
        error: "Message queue is full. Please wait for pending messages to send or check your connection.",
      };
    }

    // Reset isQueueFull if we're under the limit
    if (this.isQueueFull) {
      this.isQueueFull = false;
    }

    const newEntry: QueueEntry = {
      ...entry,
      retryCount: 0,
      createdAt: Date.now(),
    };
    this.queue = [...this.queue, newEntry];

    // Cancel any pending debounced persist and persist immediately for new messages
    this.cancelDebouncedPersist();
    await this.persistWithLock();

    // Try to send immediately if online
    if (this.isOnline && this.sendMutation) {
      this.process(newEntry);
    }

    return { success: true };
  }

  async remove(clientMutationId: string): Promise<void> {
    // Cancel any pending retry timer
    this.cancelRetry(clientMutationId);

    this.queue = this.queue.filter(
      (e) => e.clientMutationId !== clientMutationId
    );
    await this.persist();
  }

  /**
   * Mark entry as confirming (server confirmed, removal in progress).
   * This prevents duplicates during async removal by immediately updating
   * the status synchronously, then scheduling the actual removal.
   */
  markConfirming(clientMutationId: string): void {
    // Cancel any pending retry timer
    this.cancelRetry(clientMutationId);

    // Synchronously update status to "confirming"
    this.queue = this.queue.map((e) =>
      e.clientMutationId === clientMutationId
        ? { ...e, status: "confirming" as const }
        : e
    );

    // Use debounced persist for status change
    this.debouncedPersist();

    // Schedule actual removal via queueMicrotask
    queueMicrotask(() => {
      this.remove(clientMutationId);
    });
  }

  /**
   * Cancel a pending retry timer for an entry.
   * Called when removing entries or before scheduling a new retry.
   */
  private cancelRetry(clientMutationId: string): void {
    const timerId = this.retryTimers.get(clientMutationId);
    if (timerId) {
      clearTimeout(timerId);
      this.retryTimers.delete(clientMutationId);
    }
  }

  private getRetryDelay(retryCount: number): number {
    const baseDelay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
    // Add ±10% jitter
    const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
    return Math.round(baseDelay + jitter);
  }

  private scheduleRetry(clientMutationId: string, retryCount: number): void {
    const delay = this.getRetryDelay(retryCount);
    const timerId = setTimeout(() => {
      // Remove timer from map after it fires
      this.retryTimers.delete(clientMutationId);

      // Look up fresh entry to avoid processing stale/deleted entries
      const freshEntry = this.queue.find(
        (e) => e.clientMutationId === clientMutationId
      );
      if (freshEntry && freshEntry.status === "failed") {
        this.process(freshEntry);
      }
    }, delay);

    // Store timer for potential cleanup
    this.retryTimers.set(clientMutationId, timerId);
  }

  private async process(entry: QueueEntry): Promise<void> {
    if (!this.sendMutation || !this.isOnline) return;

    // Guard: ensure entry still exists in queue (may have been deleted)
    if (!this.queue.some((e) => e.clientMutationId === entry.clientMutationId)) {
      return;
    }

    // Update status to sending (use debounced persist for status changes)
    this.queue = this.queue.map((e) =>
      e.clientMutationId === entry.clientMutationId
        ? { ...e, status: "sending" as const }
        : e
    );
    this.debouncedPersist();

    try {
      const sessionToken = this.sessionTokenGetter?.() ?? undefined;
      await this.sendMutation({
        channelId: entry.channelId,
        body: entry.body,
        clientMutationId: entry.clientMutationId,
        authorName: entry.authorName,
        sessionToken,
      });

      // Success - mark as confirming (prevents duplicates during async removal)
      this.markConfirming(entry.clientMutationId);
    } catch (error) {
      // Failure - update status and increment retry count
      const updatedEntry = this.queue.find(
        (e) => e.clientMutationId === entry.clientMutationId
      );
      if (!updatedEntry) return;

      const newRetryCount = updatedEntry.retryCount + 1;

      this.queue = this.queue.map((e) =>
        e.clientMutationId === entry.clientMutationId
          ? {
              ...e,
              status: "failed" as const,
              retryCount: newRetryCount,
              error: error instanceof Error ? error.message : String(error),
            }
          : e
      );
      this.debouncedPersist();

      // Schedule retry if under max retries
      if (newRetryCount < MAX_RETRIES) {
        this.scheduleRetry(entry.clientMutationId, newRetryCount);
      }
    }
  }

  async flush(): Promise<void> {
    if (this.isSyncing || !this.sendMutation) return;

    this.isSyncing = true;
    try {
      const toProcess = this.queue.filter(
        (e) => e.status === "pending" || e.status === "failed"
      );

      for (const entry of toProcess) {
        await this.process(entry);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async retry(clientMutationId: string): Promise<void> {
    const entry = this.queue.find(
      (e) => e.clientMutationId === clientMutationId
    );
    if (!entry) return;

    // Cancel any existing retry timer before manual retry
    this.cancelRetry(clientMutationId);

    // Reset retry count and status
    this.queue = this.queue.map((e) =>
      e.clientMutationId === clientMutationId
        ? { ...e, retryCount: 0, status: "pending" as const, error: undefined }
        : e
    );
    await this.persist();

    // Process immediately
    await this.process({ ...entry, retryCount: 0, status: "pending" });
  }
}

export const messageQueue = new MessageQueue();
