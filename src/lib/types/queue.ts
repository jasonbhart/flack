import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Queue entry status for IndexedDB-persisted message queue.
 *
 * Note: Does NOT include "confirmed" because confirmed messages are
 * removed from the queue entirely (they exist in Convex, not locally).
 *
 * - **pending**: Waiting to be sent (offline or queued)
 * - **sending**: Mutation in-flight (prevents duplicate sends)
 * - **failed**: Send failed, will auto-retry or await manual retry
 * - **confirming**: Server confirmed, removal in progress (prevents duplicates)
 *
 * @see MessageStatus in messages.ts for full state machine documentation
 */
export type QueueEntryStatus = "pending" | "sending" | "failed" | "confirming";

export interface QueueEntry {
  clientMutationId: string;
  channelId: Id<"channels">;
  body: string;
  authorName: string;
  status: QueueEntryStatus;
  retryCount: number;
  createdAt: number;
  error?: string;
}

export interface QueueStorage {
  version: 1;
  entries: QueueEntry[];
}
