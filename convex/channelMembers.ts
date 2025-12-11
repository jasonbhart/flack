import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { withAuthQuery, withAuthMutation, type AuthenticatedQueryCtx, type AuthenticatedMutationCtx } from "./authMiddleware";

/**
 * Check if a user is a member of a channel.
 * Uses composite index for O(1) lookup.
 */
export const isMember = query({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", args.userId)
      )
      .first();

    return membership !== null;
  },
});

/**
 * Get membership details for a user in a channel.
 * Returns null if not a member.
 */
export const getMembership = query({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", args.userId)
      )
      .first();
  },
});

/**
 * List all members of a channel.
 */
export const listMembers = withAuthQuery({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    // Fetch user details for each member
    const members = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          ...m,
          user,
        };
      })
    );

    return members;
  },
});

/**
 * List all channels a user is a member of.
 */
export const listUserChannels = withAuthQuery({
  args: {},
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("channelMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();

    // Fetch channel details for each membership
    const channels = await Promise.all(
      memberships.map(async (m) => {
        const channel = await ctx.db.get(m.channelId);
        return {
          ...m,
          channel,
        };
      })
    );

    return channels;
  },
});

/**
 * Add a user to a channel.
 * Only channel owners/admins can add members.
 */
export const addMember = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
  },
  handler: async (ctx, args) => {
    // Check if calling user is owner/admin of channel
    const callerMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (!callerMembership || callerMembership.role === "member") {
      throw new Error("Unauthorized: Only owners and admins can add members");
    }

    // Check if target user already a member
    const existingMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", args.userId)
      )
      .first();

    if (existingMembership) {
      throw new Error("User is already a member of this channel");
    }

    // Add the member
    const membershipId = await ctx.db.insert("channelMembers", {
      channelId: args.channelId,
      userId: args.userId,
      role: args.role ?? "member",
      joinedAt: Date.now(),
    });

    return membershipId;
  },
});

/**
 * Remove a user from a channel.
 * Owners can remove anyone. Admins can remove members. Users can remove themselves.
 */
export const removeMember = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get caller's membership
    const callerMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    // Get target's membership
    const targetMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", args.userId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this channel");
    }

    // Authorization logic
    const isSelf = ctx.user._id === args.userId;
    const isOwner = callerMembership?.role === "owner";
    const isAdmin = callerMembership?.role === "admin";
    const targetIsOwner = targetMembership.role === "owner";
    const targetIsAdmin = targetMembership.role === "admin";

    // Only allow:
    // - Users removing themselves (except owners - must transfer ownership first)
    // - Owners removing anyone
    // - Admins removing members (not other admins or owners)
    const canRemove =
      (isSelf && !targetIsOwner) ||
      isOwner ||
      (isAdmin && !targetIsOwner && !targetIsAdmin);

    if (!canRemove) {
      throw new Error("Unauthorized: Cannot remove this member");
    }

    await ctx.db.delete(targetMembership._id);
    return { success: true };
  },
});

/**
 * Join a channel (self-add). For public channels or invite-only with validation.
 * Currently allows anyone to join any channel (public channels).
 */
export const joinChannel = withAuthMutation({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    // Check if already a member
    const existingMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (existingMembership) {
      return existingMembership._id; // Already a member
    }

    // Add as member
    const membershipId = await ctx.db.insert("channelMembers", {
      channelId: args.channelId,
      userId: ctx.user._id,
      role: "member",
      joinedAt: Date.now(),
    });

    return membershipId;
  },
});

/**
 * Helper function to check membership from other modules.
 * For use within other Convex functions, not exposed as API.
 */
export async function checkMembership(
  ctx: { db: AuthenticatedQueryCtx["db"] | AuthenticatedMutationCtx["db"] },
  channelId: Id<"channels">,
  userId: Id<"users">
): Promise<boolean> {
  const membership = await ctx.db
    .query("channelMembers")
    .withIndex("by_channel_and_user", (q) =>
      q.eq("channelId", channelId).eq("userId", userId)
    )
    .first();

  return membership !== null;
}
