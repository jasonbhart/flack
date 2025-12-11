import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { withAuthQuery, withAuthMutation } from "./authMiddleware";
import { checkMembership } from "./channelMembers";

/**
 * List messages in a channel.
 * Requires authentication and channel membership.
 */
export const list = withAuthQuery({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
  },
});

/**
 * Send a message to a channel.
 * Requires authentication and channel membership.
 * Maintains idempotency via clientMutationId.
 */
export const send = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    body: v.string(),
    clientMutationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

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

    // Insert new message using authenticated user
    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      userId: ctx.user._id,
      authorName: ctx.user.name,
      body: args.body,
      clientMutationId: args.clientMutationId,
    });

    return messageId;
  },
});

/**
 * Legacy unauthenticated message listing for backwards compatibility.
 * TODO: Remove once all clients are updated to use authenticated endpoints.
 * @deprecated Use authenticated `list` query instead
 */
export const listPublic = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
  },
});

/**
 * List message counts per channel for unread tracking.
 * Returns channelId and message count for all channels the user has access to.
 * Lightweight query for detecting new messages in inactive channels.
 */
export const listLatestPerChannel = withAuthQuery({
  args: {},
  handler: async (ctx) => {
    // Get all channels the user is a member of
    const memberships = await ctx.db
      .query("channelMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();

    const channelIds = memberships.map((m) => m.channelId);

    // Get message counts for each channel
    const results = await Promise.all(
      channelIds.map(async (channelId) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_channel", (q) => q.eq("channelId", channelId))
          .collect();

        return {
          channelId,
          messageCount: messages.length,
        };
      })
    );

    return results;
  },
});
