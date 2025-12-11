import { v } from "convex/values";
import { withAuthQuery, withAuthMutation } from "./authMiddleware";
import { checkRateLimit } from "./rateLimiter";

// Channel name constraints
const MAX_CHANNEL_NAME_LENGTH = 80;
const CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * List all channels the authenticated user is a member of.
 * Returns channels with creator info for UI disambiguation.
 * Requires valid session.
 */
export const list = withAuthQuery({
  args: {},
  handler: async (ctx, args) => {
    // Get user's channel memberships
    const memberships = await ctx.db
      .query("channelMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();

    // Fetch channel details with creator info for each membership
    const channels = await Promise.all(
      memberships.map(async (m) => {
        const channel = await ctx.db.get(m.channelId);
        if (!channel) return null;

        // Fetch creator info if creatorId exists (may be undefined for legacy channels)
        let creatorName: string | null = null;
        if (channel.creatorId) {
          const creator = await ctx.db.get(channel.creatorId);
          creatorName = creator?.name ?? null;
        }

        return {
          ...channel,
          creatorName,
          role: m.role,
        };
      })
    );

    // Filter out any null channels (in case of orphaned memberships)
    return channels.filter((c) => c !== null);
  },
});

/**
 * Create a new channel.
 * Sets the current user as creator and adds them as owner member.
 * Requires valid session.
 */
export const create = withAuthMutation({
  args: {
    name: v.string(),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Rate limit: 5 channels per hour per user
    const rateLimitResult = await checkRateLimit(
      ctx,
      `channel_create:${ctx.user._id}`,
      "hour",
      5
    );
    if (!rateLimitResult.allowed) {
      throw new Error(
        `You can only create 5 channels per hour. Try again in ${rateLimitResult.retryAfterSeconds} seconds.`
      );
    }

    // Validate and normalize name
    const trimmedName = args.name.trim().toLowerCase();
    if (!trimmedName) {
      throw new Error("Channel name cannot be empty");
    }
    if (trimmedName.length > MAX_CHANNEL_NAME_LENGTH) {
      throw new Error(`Channel name must be ${MAX_CHANNEL_NAME_LENGTH} characters or less`);
    }
    if (!CHANNEL_NAME_PATTERN.test(trimmedName)) {
      throw new Error(
        "Channel name can only contain lowercase letters, numbers, hyphens, and underscores. " +
        "It must start and end with a letter or number."
      );
    }

    // Create the channel with creatorId
    const channelId = await ctx.db.insert("channels", {
      name: trimmedName,
      creatorId: ctx.user._id,
      isDefault: args.isDefault ?? false,
    });

    // Add creator as owner member
    await ctx.db.insert("channelMembers", {
      channelId,
      userId: ctx.user._id,
      role: "owner",
      joinedAt: Date.now(),
    });

    return { channelId };
  },
});
