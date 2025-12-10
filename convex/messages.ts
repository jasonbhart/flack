import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./authHelpers";

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
    sessionToken: v.optional(v.string()), // Optional: for authenticated users
    // Fallback for unauthenticated users
    authorName: v.optional(v.string()),
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

    // Try to get authenticated user first
    const authUser = await getAuthenticatedUser(ctx, args.sessionToken);

    let userId;
    let authorName;

    if (authUser) {
      // Use authenticated user
      userId = authUser._id;
      authorName = authUser.name;
    } else {
      // Fall back to anonymous user for unauthenticated users
      authorName = args.authorName ?? "Anonymous";

      // Check if we have a default anonymous user, if not create one
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "anonymous@flack.local"))
        .first();

      if (existingUser) {
        userId = existingUser._id;
      } else {
        userId = await ctx.db.insert("users", {
          name: "Anonymous",
          email: "anonymous@flack.local",
          isTemp: true,
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
