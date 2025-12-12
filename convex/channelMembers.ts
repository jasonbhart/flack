import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { withAuthQuery, withAuthMutation, type AuthenticatedQueryCtx, type AuthenticatedMutationCtx } from "./authMiddleware";

/**
 * Check if a user is a member of a channel.
 * Uses composite index for O(1) lookup.
 *
 * INTERNAL ONLY - not exposed to clients to prevent social graph enumeration.
 * Use checkMembership() helper for in-mutation checks.
 */
export const isMember = internalQuery({
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
 *
 * INTERNAL ONLY - not exposed to clients to prevent role enumeration.
 */
export const getMembership = internalQuery({
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
 * Requires authentication AND membership in the channel.
 */
export const listMembers = withAuthQuery({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    // Authorization: verify requester is a member of this channel
    const requesterMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (!requesterMembership) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

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

    // Special case: Owner leaving - check if they're the sole member
    if (isSelf && targetIsOwner) {
      const allMembers = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
        .collect();

      if (allMembers.length === 1) {
        // Sole owner leaving - delete the channel and all related data
        const channel = await ctx.db.get(args.channelId);
        if (channel) {
          // Delete all invites for this channel
          const invites = await ctx.db
            .query("channelInvites")
            .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
            .collect();
          for (const invite of invites) {
            await ctx.db.delete(invite._id);
          }

          // Delete all messages in this channel
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
            .collect();
          for (const message of messages) {
            await ctx.db.delete(message._id);
          }

          // Delete the channel itself
          await ctx.db.delete(args.channelId);
        }

        // Delete the membership
        await ctx.db.delete(targetMembership._id);
        return { success: true, channelDeleted: true };
      } else {
        // Owner with other members must transfer ownership first
        throw new Error(
          "You must transfer ownership before leaving. Use the transferOwnership action, or remove all other members first."
        );
      }
    }

    // Only allow:
    // - Users removing themselves (except owners - handled above)
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
    return { success: true, channelDeleted: false };
  },
});

/**
 * Transfer ownership of a channel to another member.
 * Only the current owner can transfer ownership.
 * The new owner must already be a member of the channel.
 */
export const transferOwnership = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    newOwnerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify caller is current owner
    const callerMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only the channel owner can transfer ownership");
    }

    // Verify new owner is a current member
    const newOwnerMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", args.newOwnerId)
      )
      .first();

    if (!newOwnerMembership) {
      throw new Error("New owner must be a current member of the channel");
    }

    if (args.newOwnerId === ctx.user._id) {
      throw new Error("You are already the owner");
    }

    // Transfer ownership: promote new owner, demote current owner to admin
    await ctx.db.patch(newOwnerMembership._id, { role: "owner" });
    await ctx.db.patch(callerMembership._id, { role: "admin" });

    // Update channel creatorId to reflect new owner
    await ctx.db.patch(args.channelId, { creatorId: args.newOwnerId });

    return { success: true };
  },
});

/**
 * REMOVED: joinChannel mutation
 *
 * The joinChannel mutation has been removed as it bypassed the invite-only
 * security model. In the user-owned channels architecture, users can only
 * join channels through:
 * 1. Being the creator (automatically added as owner on channel creation)
 * 2. Redeeming a valid invite token via channelInvites.redeem
 * 3. Being added by an owner/admin via addMember
 *
 * This prevents unauthorized access by users who might guess or brute-force channel IDs.
 */

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
