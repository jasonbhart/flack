import { query } from "./_generated/server";
import { withAuthQuery } from "./authMiddleware";

/**
 * List all channels the authenticated user is a member of.
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

    // Fetch channel details for each membership
    const channels = await Promise.all(
      memberships.map(async (m) => {
        const channel = await ctx.db.get(m.channelId);
        return channel;
      })
    );

    // Filter out any null channels (in case of orphaned memberships)
    return channels.filter((c) => c !== null);
  },
});

/**
 * List all channels (for discovery/joining).
 * Still requires auth but shows all channels, not just member channels.
 */
export const listAll = withAuthQuery({
  args: {},
  handler: async (ctx, args) => {
    return await ctx.db.query("channels").collect();
  },
});
