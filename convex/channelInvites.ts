import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { withAuthQuery, withAuthMutation } from "./authMiddleware";
import { checkRateLimit } from "./rateLimiter";

/**
 * Generate a cryptographically random 12-character alphanumeric token.
 * Uses crypto.getRandomValues() for secure randomness.
 * 12 chars from 62-char alphabet = ~71 bits of entropy.
 */
function generateInviteToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

/**
 * Create an invite link for a channel.
 * Only owners and admins can create invites.
 * Rate limited to 10 invites per channel per hour.
 */
export const create = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check rate limit: 10 invites per channel per hour
    const rateLimitResult = await checkRateLimit(
      ctx,
      `invite_create:${args.channelId}`,
      "hour",
      10
    );

    if (!rateLimitResult.allowed) {
      throw new Error(
        `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`
      );
    }

    // Check if user is owner/admin of channel
    const membership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (!membership || membership.role === "member") {
      throw new Error("Unauthorized: Only channel owners and admins can create invites");
    }

    // Verify channel exists
    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // One invite per channel: revoke any existing invite first
    const existingInvites = await ctx.db
      .query("channelInvites")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    for (const invite of existingInvites) {
      await ctx.db.delete(invite._id);
    }

    // Generate unique token with collision check
    let token: string;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      token = generateInviteToken();
      const existing = await ctx.db
        .query("channelInvites")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();

      if (!existing) {
        break;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error("Failed to generate unique invite token. Please try again.");
      }
    } while (attempts < maxAttempts);

    // Store invite
    await ctx.db.insert("channelInvites", {
      channelId: args.channelId,
      token,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
      maxUses: args.maxUses,
      uses: 0,
    });

    return {
      token,
      url: `/invite/${token}`,
    };
  },
});

/**
 * Redeem an invite token to join a channel.
 * Rate limited to 10 attempts per user per minute.
 */
export const redeem = withAuthMutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Check rate limit: 10 redemption attempts per user per minute
    const rateLimitResult = await checkRateLimit(
      ctx,
      `invite_redeem:${ctx.user._id}`,
      "minute",
      10
    );

    if (!rateLimitResult.allowed) {
      throw new Error(
        `Too many attempts. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`
      );
    }

    // Look up invite by token
    const invite = await ctx.db
      .query("channelInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invite) {
      throw new Error("Invalid invite link");
    }

    // Check if expired
    if (invite.expiresAt && invite.expiresAt < Date.now()) {
      throw new Error("This invite has expired. Ask the channel owner for a new link.");
    }

    // Check if max uses exceeded
    if (invite.maxUses && invite.uses >= invite.maxUses) {
      throw new Error("This invite has reached its usage limit.");
    }

    // Check if channel still exists
    const channel = await ctx.db.get(invite.channelId);
    if (!channel) {
      throw new Error("This channel no longer exists.");
    }

    // Check if already a member
    const existingMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", invite.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (existingMembership) {
      // Already a member - return success without incrementing uses
      return {
        success: true,
        channelId: invite.channelId,
        alreadyMember: true,
      };
    }

    // Increment uses count
    await ctx.db.patch(invite._id, {
      uses: invite.uses + 1,
    });

    // Add user as member
    await ctx.db.insert("channelMembers", {
      channelId: invite.channelId,
      userId: ctx.user._id,
      role: "member",
      joinedAt: Date.now(),
    });

    return {
      success: true,
      channelId: invite.channelId,
      alreadyMember: false,
    };
  },
});

/**
 * List active invites for a channel.
 * Only owners and admins can view invites.
 * Filters out expired invites.
 */
export const list = withAuthQuery({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    // Check if user is owner/admin of channel
    const membership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (!membership || membership.role === "member") {
      throw new Error("Unauthorized: Only channel owners and admins can view invites");
    }

    // Get all invites for this channel
    const allInvites = await ctx.db
      .query("channelInvites")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    // Filter out expired and max-used invites
    const now = Date.now();
    const activeInvites = allInvites.filter((invite) => {
      if (invite.expiresAt && invite.expiresAt < now) return false;
      if (invite.maxUses && invite.uses >= invite.maxUses) return false;
      return true;
    });

    // Get creator info for each invite
    const invitesWithCreator = await Promise.all(
      activeInvites.map(async (invite) => {
        const creator = await ctx.db.get(invite.createdBy);
        return {
          ...invite,
          creatorName: creator?.name ?? "Unknown",
        };
      })
    );

    return invitesWithCreator;
  },
});

/**
 * Revoke an invite.
 * Only owners and admins can revoke invites.
 */
export const revoke = withAuthMutation({
  args: {
    inviteId: v.id("channelInvites"),
  },
  handler: async (ctx, args) => {
    // Get the invite - query by id to get proper typing
    const invite = await ctx.db
      .query("channelInvites")
      .filter((q) => q.eq(q.field("_id"), args.inviteId))
      .first();
    if (!invite) {
      throw new Error("Invite not found");
    }

    // Check if user is owner/admin of the channel
    const membership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", invite.channelId).eq("userId", ctx.user._id)
      )
      .first();

    if (!membership || membership.role === "member") {
      throw new Error("Unauthorized: Only channel owners and admins can revoke invites");
    }

    // Delete the invite
    await ctx.db.delete(invite._id);

    return { success: true };
  },
});

/**
 * Cleanup expired and max-used invites.
 * Called by cron job to prevent unbounded table growth.
 *
 * Uses by_expires index for efficient time-based cleanup.
 * Max-uses cleanup requires scanning invites with maxUses set,
 * but this is a smaller subset than the full table.
 */
export const cleanupInvites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let expiredCount = 0;
    let maxUsedCount = 0;

    // Efficiently delete expired invites using index
    // Query invites where expiresAt < now (expired)
    const expiredInvites = await ctx.db
      .query("channelInvites")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();

    for (const invite of expiredInvites) {
      await ctx.db.delete(invite._id);
      expiredCount++;
    }

    // For max-uses cleanup, we need to check invites that have maxUses set
    // This is less common, so we query by channel index and filter
    // Note: A compound index on [maxUses, uses] would be more efficient
    // but adds schema complexity for a rare case
    const allInvitesWithMaxUses = await ctx.db
      .query("channelInvites")
      .filter((q) => q.neq(q.field("maxUses"), undefined))
      .collect();

    for (const invite of allInvitesWithMaxUses) {
      if (invite.maxUses && invite.uses >= invite.maxUses) {
        await ctx.db.delete(invite._id);
        maxUsedCount++;
      }
    }

    return {
      deletedCount: expiredCount + maxUsedCount,
      expiredCount,
      maxUsedCount,
    };
  },
});
