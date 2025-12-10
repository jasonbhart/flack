import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
  }).index("by_email", ["email"]),

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
    .index("by_client_mutation_id", ["clientMutationId"]),

  // Presence table for online/typing status
  presence: defineTable({
    userId: v.id("users"),
    tempUserId: v.optional(v.string()), // Local UUID for client-side self-filtering
    user: v.string(), // Denormalized username
    channelId: v.id("channels"),
    updated: v.number(), // Timestamp for staleness check
    data: v.union(
      v.object({ type: v.literal("online") }),
      v.object({ type: v.literal("typing"), text: v.optional(v.string()) })
    ),
  })
    .index("by_channel_updated", ["channelId", "updated"])
    .index("by_user", ["userId"]),
});
