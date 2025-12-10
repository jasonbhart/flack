import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./authHelpers";
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

export const heartbeat = mutation({
  args: {
    channelId: v.id("channels"),
    type: v.union(v.literal("online"), v.literal("typing")),
    userName: v.optional(v.string()),
    sessionId: v.string(), // Required: unique per device/tab
    sessionToken: v.optional(v.string()), // Optional: for authenticated users
  },
  handler: async (ctx, args) => {
    // Try to get authenticated user first
    const authUser = await getAuthenticatedUser(ctx, args.sessionToken);

    let userIdToUse: Id<"users">;
    let displayName: string;

    if (authUser) {
      // Use authenticated user
      userIdToUse = authUser._id;
      displayName = authUser.name;
    } else {
      // Fall back to temp user for unauthenticated users
      displayName = args.userName ?? "Anonymous";

      // Create a temporary user record if needed (use index for O(1) lookup)
      const tempUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", `${args.sessionId}@temp.local`))
        .first();

      if (!tempUser) {
        userIdToUse = await ctx.db.insert("users", {
          name: displayName,
          email: `${args.sessionId}@temp.local`,
          isTemp: true, // Mark as temporary/guest user for cleanup
        });
      } else {
        userIdToUse = tempUser._id;
      }
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
        userId: userIdToUse, // Update userId in case user just logged in
        channelId: args.channelId,
        updated: now,
        data: { type: args.type },
        displayName,
      });
      return existing._id;
    } else {
      // Insert new presence record for this session
      const presenceId = await ctx.db.insert("presence", {
        userId: userIdToUse,
        sessionId: args.sessionId,
        displayName,
        channelId: args.channelId,
        updated: now,
        data: { type: args.type },
      });
      return presenceId;
    }
  },
});

export const listOnline = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    // Return all presence records for channel - client handles staleness filtering
    // This avoids stale data issues with Date.now() in queries
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    return presenceRecords.map((p) => ({
      odUserId: p.userId.toString(),
      sessionId: p.sessionId,
      displayName: p.displayName,
      updated: p.updated,
      type: p.data.type,
    }));
  },
});

export const listTyping = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    // Return all typing records for channel - client handles staleness filtering
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) => q.eq(q.field("data.type"), "typing"))
      .collect();

    return presenceRecords.map((p) => ({
      odUserId: p.userId.toString(),
      sessionId: p.sessionId,
      displayName: p.displayName,
      updated: p.updated,
    }));
  },
});

/**
 * Clear presence for a session (called on logout)
 */
export const clearPresence = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find and delete presence record for this session
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (presence) {
      await ctx.db.delete(presence._id);
    }

    return { success: true };
  },
});
