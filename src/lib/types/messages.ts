import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Message status state machine for optimistic UI.
 *
 * State transitions:
 * ```
 * [User sends] → pending → sending → confirmed (removed from queue)
 *                   ↑          ↓
 *                   └── failed ←┘ (after retry or manual retry)
 * ```
 *
 * - **pending**: Message is queued locally, waiting to be sent.
 *   Used when: offline, or send hasn't started yet.
 *   On app crash recovery, "sending" is reset to "pending".
 *
 * - **sending**: Message is actively being sent (mutation in-flight).
 *   Prevents duplicate sends during flush operations.
 *
 * - **confirmed**: Message confirmed by server (via Convex subscription).
 *   Message is removed from local queue at this point.
 *
 * - **failed**: Send attempt failed. Will auto-retry with exponential backoff
 *   up to MAX_RETRIES (5). User can manually retry after max retries.
 */
export type MessageStatus = "pending" | "sending" | "confirmed" | "failed";

export interface PendingMessage {
  clientMutationId: string;
  channelId: Id<"channels">;
  authorName: string;
  body: string;
  status: MessageStatus;
  error?: string;
}

export interface ServerMessage {
  _id: Id<"messages">;
  _creationTime: number;
  channelId: Id<"channels">;
  userId: Id<"users">;
  authorName: string;
  body: string;
  clientMutationId?: string;
  parentId?: Id<"messages">;
  reactions?: Array<{
    emoji: string;
    users: Id<"users">[];
  }>;
}

export interface MergedMessage {
  _id?: Id<"messages">;
  _creationTime?: number;
  clientMutationId: string;
  channelId: Id<"channels">;
  authorName: string;
  body: string;
  status: MessageStatus;
  error?: string;
}
