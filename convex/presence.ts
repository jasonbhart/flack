import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const heartbeat = mutation({
  args: {
    channelId: v.id("channels"),
    type: v.union(v.literal("online"), v.literal("typing")),
    userName: v.optional(v.string()),
    tempUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // For now, use tempUserId until auth is implemented
    const uniqueId = args.tempUserId ?? "anonymous";
    const userName = args.userName ?? "Anonymous";

    // Create a temporary user record if needed (moved before presence lookup for proper upsert)
    let user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), `${uniqueId}@temp.local`))
      .first();

    let userIdToUse;
    if (!user) {
      userIdToUse = await ctx.db.insert("users", {
        name: userName,
        email: `${uniqueId}@temp.local`,
      });
    } else {
      userIdToUse = user._id;
    }

    // Check for existing presence record using by_user index for O(1) lookup
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userIdToUse))
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing record (include user to handle name changes)
      await ctx.db.patch(existing._id, {
        channelId: args.channelId,
        updated: now,
        data: { type: args.type },
        user: userName,
        tempUserId: uniqueId,
      });
      return existing._id;
    } else {
      // Insert new presence record
      const presenceId = await ctx.db.insert("presence", {
        userId: userIdToUse,
        tempUserId: uniqueId,
        user: userName,
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
    const cutoff = Date.now() - 60000; // 60 seconds

    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_channel_updated", (q) =>
        q.eq("channelId", args.channelId).gt("updated", cutoff)
      )
      .collect();

    return presenceRecords.map((p) => ({
      userId: p.userId.toString(),
      tempUserId: p.tempUserId,
      displayName: p.user,
    }));
  },
});

export const listTyping = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 3000; // 3 seconds

    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_channel_updated", (q) =>
        q.eq("channelId", args.channelId).gt("updated", cutoff)
      )
      .filter((q) => q.eq(q.field("data.type"), "typing"))
      .collect();

    return presenceRecords.map((p) => ({
      userId: p.userId.toString(),
      tempUserId: p.tempUserId,
      displayName: p.user,
    }));
  },
});
