import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    isTemp: v.optional(v.boolean()), // True for guest/anonymous users
  })
    .index("by_email", ["email"])
    .index("by_is_temp", ["isTemp"]),

  // Auth tokens for magic link authentication
  authTokens: defineTable({
    email: v.string(),
    token: v.string(), // Hashed random token sent in magic link
    code: v.string(), // Hashed 6-digit code for manual entry (desktop)
    expiresAt: v.number(), // Timestamp when token expires
    used: v.boolean(), // Prevent replay attacks
    attempts: v.optional(v.number()), // Brute-force protection: code verification attempts
  })
    .index("by_token", ["token"])
    .index("by_code", ["code"])
    .index("by_email", ["email"])
    .index("by_expires", ["expiresAt"]), // For cleanup cron efficiency

  // Sessions for authenticated users
  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(), // Session token stored in client
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_expires", ["expiresAt"]), // For cleanup cron efficiency

  // Channels table
  channels: defineTable({
    name: v.string(),
    // TODO: Change to v.optional(v.id("teams")) when teams table is added
    teamId: v.optional(v.string()),
  }),

  // Messages table with idempotency support
  messages: defineTable({
    channelId: v.id("channels"),
    userId: v.id("users"),
    authorName: v.string(), // Denormalized for 0-latency rendering
    body: v.string(),
    parentId: v.optional(v.id("messages")), // Thread parent (null = main chat)
    clientMutationId: v.optional(v.string()), // Idempotency key (UUID)
    reactions: v.optional(
      v.array(
        v.object({
          emoji: v.string(),
          users: v.array(v.id("users")),
        })
      )
    ),
  })
    .index("by_channel", ["channelId"])
    .index("by_client_mutation_id", ["clientMutationId"])
    .index("by_user", ["userId"]),

  // Presence table for online/typing status (supports multi-device)
  presence: defineTable({
    userId: v.id("users"),
    sessionId: v.string(), // Unique per device/tab for multi-device support
    displayName: v.string(), // Denormalized username
    channelId: v.id("channels"),
    updated: v.number(), // Timestamp for staleness check
    data: v.union(
      v.object({ type: v.literal("online") }),
      v.object({ type: v.literal("typing"), text: v.optional(v.string()) })
    ),
  })
    .index("by_channel", ["channelId"])
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_updated", ["updated"]),
});
