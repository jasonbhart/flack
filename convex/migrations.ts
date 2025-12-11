import { internalMutation } from "./_generated/server";

/**
 * Migration: Backfill creatorId on existing channels.
 *
 * For each channel without a creatorId:
 * 1. Find the first member with role "owner"
 * 2. If no owner, use the first member
 * 3. If no members, log for manual review
 *
 * This is idempotent - channels with creatorId already set are skipped.
 *
 * Run with: npx convex run migrations:migrateChannelOwnership
 */
export const migrateChannelOwnership = internalMutation({
  args: {},
  handler: async (ctx) => {
    const channels = await ctx.db.query("channels").collect();

    let updated = 0;
    let skipped = 0;
    let noOwnerFound: string[] = [];

    for (const channel of channels) {
      // Skip if already has creatorId
      if (channel.creatorId) {
        skipped++;
        continue;
      }

      // Get all memberships for this channel
      const memberships = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
        .collect();

      if (memberships.length === 0) {
        noOwnerFound.push(channel._id);
        continue;
      }

      // Find owner, or fall back to first member
      const owner = memberships.find((m) => m.role === "owner");
      const creatorId = owner?.userId ?? memberships[0].userId;

      // Update channel
      await ctx.db.patch(channel._id, { creatorId });
      updated++;
    }

    return {
      updated,
      skipped,
      noOwnerFound,
      total: channels.length,
    };
  },
});

/**
 * Migration: Ensure all users have a default channel.
 *
 * For each user without a channel where they are owner and isDefault=true:
 * Create a new "general" channel with isDefault=true.
 *
 * This is idempotent - users with existing default channels are skipped.
 *
 * Run with: npx convex run migrations:ensureDefaultChannels
 */
export const ensureDefaultChannels = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    let created = 0;
    let skipped = 0;

    for (const user of users) {
      // Check if user already has a default channel
      const ownedChannels = await ctx.db
        .query("channels")
        .withIndex("by_creator", (q) => q.eq("creatorId", user._id))
        .collect();

      const hasDefault = ownedChannels.some((c) => c.isDefault === true);

      if (hasDefault) {
        skipped++;
        continue;
      }

      // Create default channel for this user
      const channelId = await ctx.db.insert("channels", {
        name: "general",
        creatorId: user._id,
        isDefault: true,
      });

      // Add user as owner
      await ctx.db.insert("channelMembers", {
        channelId,
        userId: user._id,
        role: "owner",
        joinedAt: Date.now(),
      });

      created++;
    }

    return {
      created,
      skipped,
      total: users.length,
    };
  },
});

/**
 * Migration: Clean up orphan channels (no members, no creator).
 *
 * For channels with no members and no creatorId, delete them.
 *
 * Run with: npx convex run migrations:cleanupOrphanChannels
 */
export const cleanupOrphanChannels = internalMutation({
  args: {},
  handler: async (ctx) => {
    const channels = await ctx.db.query("channels").collect();

    let deleted = 0;
    let kept = 0;

    for (const channel of channels) {
      // Check for members
      const memberships = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
        .collect();

      // Keep if has creator or members
      if (channel.creatorId || memberships.length > 0) {
        kept++;
        continue;
      }

      // Delete orphan channel
      await ctx.db.delete(channel._id);
      deleted++;
    }

    return {
      deleted,
      kept,
      total: channels.length,
    };
  },
});
