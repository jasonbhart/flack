import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { withAuthQuery, withAuthMutation, isValidSession } from "./authMiddleware";
import { checkMembership } from "./channelMembers";
import type { Id } from "./_generated/dataModel";

// Cleanup stale presence records older than 1 hour
const PRESENCE_CLEANUP_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
// Cleanup temp users older than 24 hours with no activity
const USER_CLEANUP_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const presenceThreshold = Date.now() - PRESENCE_CLEANUP_THRESHOLD_MS;
    const userThreshold = Date.now() - USER_CLEANUP_THRESHOLD_MS;

    // Find all stale presence records using by_updated index (O(log n) lookup)
    const stalePresence = await ctx.db
      .query("presence")
      .withIndex("by_updated", (q) => q.lt("updated", presenceThreshold))
      .collect();

    // Delete stale presence records
    for (const record of stalePresence) {
      await ctx.db.delete(record._id);
    }

    // Find temp users using the isTemp index (O(log n) lookup)
    // Only consider users created more than 24 hours ago
    const tempUsers = await ctx.db
      .query("users")
      .withIndex("by_is_temp", (q) => q.eq("isTemp", true))
      .filter((q) => q.lt(q.field("_creationTime"), userThreshold))
      .collect();

    // Check each temp user for recent activity before deleting
    let deletedUsers = 0;
    for (const user of tempUsers) {
      // Check if user has any active presence records
      const hasPresence = await ctx.db
        .query("presence")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();

      // If user has presence, they're still active - don't delete
      if (hasPresence) {
        continue;
      }

      // Check if user has any messages - if so, they're a legitimate user, don't delete
      const hasMessages = await ctx.db
        .query("messages")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();

      // Only delete if no presence and no messages, and older than threshold
      if (!hasMessages) {
        await ctx.db.delete(user._id);
        deletedUsers++;
      }
    }

    return { deletedPresence: stalePresence.length, deletedUsers };
  },
});

/**
 * Heartbeat to update presence status.
 * Requires valid session and channel membership.
 */
export const heartbeat = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    type: v.union(v.literal("online"), v.literal("typing")),
    sessionId: v.string(), // Required: unique per device/tab
  },
  handler: async (ctx, args) => {
    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

    // Check for existing presence record by sessionId (supports multi-device)
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing session record
      await ctx.db.patch(existing._id, {
        userId: ctx.user._id,
        channelId: args.channelId,
        updated: now,
        data: { type: args.type },
        displayName: ctx.user.name,
      });
      return existing._id;
    } else {
      // Insert new presence record for this session
      const presenceId = await ctx.db.insert("presence", {
        userId: ctx.user._id,
        sessionId: args.sessionId,
        displayName: ctx.user.name,
        channelId: args.channelId,
        updated: now,
        data: { type: args.type },
      });
      return presenceId;
    }
  },
});

/**
 * List online users in a channel.
 * Requires valid session and channel membership.
 */
export const listOnline = withAuthQuery({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

    // Return all presence records for channel - client handles staleness filtering
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    return presenceRecords.map((p) => ({
      userId: p.userId.toString(),
      sessionId: p.sessionId,
      displayName: p.displayName,
      updated: p.updated,
      type: p.data.type,
    }));
  },
});

/**
 * List typing users in a channel.
 * Requires valid session and channel membership.
 */
export const listTyping = withAuthQuery({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

    // Return all typing records for channel - client handles staleness filtering
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) => q.eq(q.field("data.type"), "typing"))
      .collect();

    return presenceRecords.map((p) => ({
      userId: p.userId.toString(),
      sessionId: p.sessionId,
      displayName: p.displayName,
      updated: p.updated,
    }));
  },
});

/**
 * Clear presence for a session (called on logout).
 * Requires valid session to prevent abuse.
 */
export const clearPresence = withAuthMutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find and delete presence record for this session
    // Only allow clearing own sessions (by matching user)
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (presence && presence.userId === ctx.user._id) {
      await ctx.db.delete(presence._id);
    }

    return { success: true };
  },
});
