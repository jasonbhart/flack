import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    body: v.string(),
    clientMutationId: v.string(),
    // For now, accept authorName directly since we don't have auth yet
    authorName: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Check for existing message with same clientMutationId (idempotency)
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_client_mutation_id", (q) =>
        q.eq("clientMutationId", args.clientMutationId)
      )
      .first();

    if (existing) {
      // Return existing message ID for idempotency
      return existing._id;
    }

    // For now, use a placeholder user if not provided
    // In production, this would come from ctx.auth.getUserIdentity()
    const authorName = args.authorName ?? "Anonymous";

    // Create a placeholder userId if not provided
    // In production, this would be looked up from the authenticated user
    let userId = args.userId;
    if (!userId) {
      // Check if we have a default user, if not create one
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "anonymous@bolt.local"))
        .first();

      if (existingUser) {
        userId = existingUser._id;
      } else {
        userId = await ctx.db.insert("users", {
          name: "Anonymous",
          email: "anonymous@bolt.local",
        });
      }
    }

    // Insert new message
    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      userId,
      authorName,
      body: args.body,
      clientMutationId: args.clientMutationId,
    });

    return messageId;
  },
});
