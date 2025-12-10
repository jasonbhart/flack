import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const heartbeat = mutation({
  args: {
    channelId: v.id("channels"),
    type: v.union(v.literal("online"), v.literal("typing")),
    userName: v.optional(v.string()),
    sessionId: v.string(), // Required: unique per device/tab
  },
  handler: async (ctx, args) => {
    const userName = args.userName ?? "Anonymous";

    // Create a temporary user record if needed
    let user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), `${args.sessionId}@temp.local`))
      .first();

    let userIdToUse;
    if (!user) {
      userIdToUse = await ctx.db.insert("users", {
        name: userName,
        email: `${args.sessionId}@temp.local`,
      });
    } else {
      userIdToUse = user._id;
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
        channelId: args.channelId,
        updated: now,
        data: { type: args.type },
        displayName: userName,
      });
      return existing._id;
    } else {
      // Insert new presence record for this session
      const presenceId = await ctx.db.insert("presence", {
        userId: userIdToUse,
        sessionId: args.sessionId,
        displayName: userName,
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
      oduserId: p.userId.toString(),
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
      oduserId: p.userId.toString(),
      sessionId: p.sessionId,
      displayName: p.displayName,
      updated: p.updated,
    }));
  },
});
