import { get, set } from "idb-keyval";
import type { QueueEntry, QueueStorage } from "$lib/types/queue";
import type { Id } from "../../../convex/_generated/dataModel";

const QUEUE_KEY = "bolt-message-queue";
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

type SendMutationFn = (args: {
  channelId: Id<"channels">;
  body: string;
  clientMutationId: string;
  authorName: string;
}) => Promise<unknown>;

class MessageQueue {
  queue = $state<QueueEntry[]>([]);
  isOnline = $state(true);
  isSyncing = $state(false);

  private sendMutation: SendMutationFn | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

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

      // Restore queue from IndexedDB
      this.restore();
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

  setSendMutation(fn: SendMutationFn) {
    this.sendMutation = fn;
  }

  // TODO: Consider debouncing persist() calls for high-volume message scenarios
  private async persist(): Promise<void> {
    try {
      const storage: QueueStorage = {
        version: 1,
        entries: this.queue,
      };
      await set(QUEUE_KEY, storage);
    } catch (error) {
      console.warn("IndexedDB unavailable, queue will not persist:", error);
    }
  }

  private async restore(): Promise<void> {
    try {
      const storage = await get<QueueStorage>(QUEUE_KEY);
      if (storage && storage.entries) {
        // Explicit version check for forward compatibility
        if (storage.version !== 1) {
          console.warn("Unknown queue version, clearing queue:", storage.version);
          this.queue = [];
          return;
        }
        // Sanitize 'sending' status to 'pending' (crash recovery)
        this.queue = storage.entries.map((entry) => ({
          ...entry,
          status: entry.status === "sending" ? "pending" : entry.status,
        }));
      }
    } catch (error) {
      console.warn("IndexedDB unavailable, queue will not persist:", error);
      this.queue = [];
    }
  }

  async enqueue(
    entry: Omit<QueueEntry, "retryCount" | "createdAt">
  ): Promise<void> {
    const newEntry: QueueEntry = {
      ...entry,
      retryCount: 0,
      createdAt: Date.now(),
    };
    this.queue = [...this.queue, newEntry];
    await this.persist();

    // Try to send immediately if online
    if (this.isOnline && this.sendMutation) {
      this.process(newEntry);
    }
  }

  async remove(clientMutationId: string): Promise<void> {
    this.queue = this.queue.filter(
      (e) => e.clientMutationId !== clientMutationId
    );
    await this.persist();
  }

  private getRetryDelay(retryCount: number): number {
    const baseDelay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
    // Add ±10% jitter
    const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
    return Math.round(baseDelay + jitter);
  }

  private scheduleRetry(clientMutationId: string, retryCount: number): void {
    const delay = this.getRetryDelay(retryCount);
    setTimeout(() => {
      // Look up fresh entry to avoid processing stale/deleted entries
      const freshEntry = this.queue.find(
        (e) => e.clientMutationId === clientMutationId
      );
      if (freshEntry && freshEntry.status === "failed") {
        this.process(freshEntry);
      }
    }, delay);
  }

  private async process(entry: QueueEntry): Promise<void> {
    if (!this.sendMutation || !this.isOnline) return;

    // Guard: ensure entry still exists in queue (may have been deleted)
    if (!this.queue.some((e) => e.clientMutationId === entry.clientMutationId)) {
      return;
    }

    // Update status to sending
    this.queue = this.queue.map((e) =>
      e.clientMutationId === entry.clientMutationId
        ? { ...e, status: "sending" as const }
        : e
    );
    await this.persist();

    try {
      await this.sendMutation({
        channelId: entry.channelId,
        body: entry.body,
        clientMutationId: entry.clientMutationId,
        authorName: entry.authorName,
      });

      // Success - remove from queue
      await this.remove(entry.clientMutationId);
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
      await this.persist();

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
