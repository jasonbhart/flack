import { v } from "convex/values";
import { withAuthQuery, withAuthMutation } from "./authMiddleware";
import { checkMembership } from "./channelMembers";
import { checkRateLimit } from "./rateLimiter";
import type { Id } from "./_generated/dataModel";

// Rate limits for message sending (per user)
const MESSAGE_RATE_LIMITS = {
  perMinute: 30, // 30 messages/minute (burst)
  perHour: 500,  // 500 messages/hour (sustained)
};

// Regex pattern for @mentions - matches @username (alphanumeric + underscores)
// NOTE: Keep in sync with src/lib/utils/mentionParser.ts (client-side parser)
const MENTION_PATTERN = /@([a-zA-Z][a-zA-Z0-9_]*)/g;

// Special mention types
type SpecialMention = "channel" | "here";
const SPECIAL_MENTIONS: SpecialMention[] = ["channel", "here"];

/**
 * Parse mentions from message text (server-side).
 * Returns usernames and special mentions found.
 */
function parseMentions(text: string): {
  usernames: string[];
  specialMentions: SpecialMention[];
} {
  const usernames: string[] = [];
  const specialMentions: SpecialMention[] = [];

  // Reset regex state
  MENTION_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    const username = match[1];
    const startIndex = match.index;

    // Check for escaped @@ (skip if preceded by @)
    if (startIndex > 0 && text[startIndex - 1] === "@") {
      continue;
    }

    // Check if this is a special mention
    const lowerUsername = username.toLowerCase();
    if (SPECIAL_MENTIONS.includes(lowerUsername as SpecialMention)) {
      if (!specialMentions.includes(lowerUsername as SpecialMention)) {
        specialMentions.push(lowerUsername as SpecialMention);
      }
    } else {
      if (!usernames.includes(username)) {
        usernames.push(username);
      }
    }
  }

  return { usernames, specialMentions };
}

/**
 * List messages in a channel.
 * Requires authentication and channel membership.
 * Returns messages with mentionMap for resolving @username -> userId.
 */
export const list = withAuthQuery({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

    // Fetch latest 100 messages (prevents timeout on large channels)
    // Order desc to get latest, then reverse for chronological display
    const messagesDesc = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(100);
    const messages = messagesDesc.reverse();

    // Build mentionMap for each message (username -> userId)
    // Collect all unique mentioned user IDs across all messages
    const allMentionedUserIds = new Set<Id<"users">>();
    for (const msg of messages) {
      if (msg.mentions) {
        for (const userId of msg.mentions) {
          allMentionedUserIds.add(userId);
        }
      }
    }

    // Fetch all mentioned users in one batch
    const mentionedUsers = await Promise.all(
      Array.from(allMentionedUserIds).map((id) => ctx.db.get(id))
    );

    // Build userId -> name lookup
    const userIdToName: Record<string, string> = {};
    for (const user of mentionedUsers) {
      if (user) {
        userIdToName[user._id.toString()] = user.name;
      }
    }

    // Attach mentionMap to each message
    return messages.map((msg) => {
      const mentionMap: Record<string, string> = {};
      if (msg.mentions) {
        for (const userId of msg.mentions) {
          const userName = userIdToName[userId.toString()];
          if (userName) {
            mentionMap[userName] = userId.toString();
          }
        }
      }
      return {
        ...msg,
        mentionMap,
      };
    });
  },
});

/**
 * Send a message to a channel.
 * Requires authentication and channel membership.
 * Maintains idempotency via clientMutationId.
 * Parses @mentions and validates them against channel members.
 */
export const send = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    body: v.string(),
    clientMutationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Rate limit check (per user) - prevent spam attacks
    const minuteLimit = await checkRateLimit(
      ctx,
      `msg:${ctx.user._id}`,
      "minute",
      MESSAGE_RATE_LIMITS.perMinute
    );
    if (!minuteLimit.allowed) {
      throw new Error(
        JSON.stringify({
          code: 429,
          message: "Sending too fast. Please slow down.",
          retryAfterSeconds: minuteLimit.retryAfterSeconds,
        })
      );
    }

    const hourLimit = await checkRateLimit(
      ctx,
      `msg:${ctx.user._id}`,
      "hour",
      MESSAGE_RATE_LIMITS.perHour
    );
    if (!hourLimit.allowed) {
      throw new Error(
        JSON.stringify({
          code: 429,
          message: "Message limit reached. Please try again later.",
          retryAfterSeconds: hourLimit.retryAfterSeconds,
        })
      );
    }

    // Verify channel membership
    const isMember = await checkMembership(ctx, args.channelId, ctx.user._id);
    if (!isMember) {
      throw new Error("Unauthorized: Not a member of this channel");
    }

    // Check for existing message with same clientMutationId (idempotency)
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_client_mutation_id", (q) =>
        q.eq("clientMutationId", args.clientMutationId)
      )
      .first();

    if (existing) {
      // Return existing message ID for idempotency
      return existing._id;
    }

    // Parse mentions from message body
    const { usernames, specialMentions } = parseMentions(args.body);

    // Resolve usernames to user IDs and validate channel membership
    // Only check membership for mentioned users (O(mentions) not O(members))
    // Normalize to lowercase for case-insensitive lookup (@John -> john)
    const validMentions: Id<"users">[] = [];
    if (usernames.length > 0) {
      for (const username of usernames) {
        // Find user by name (case-insensitive via lowercase normalization)
        const normalizedUsername = username.toLowerCase();
        const user = await ctx.db
          .query("users")
          .withIndex("by_name", (q) => q.eq("name", normalizedUsername))
          .first();

        // Validate membership individually using efficient composite index
        if (user && (await checkMembership(ctx, args.channelId, user._id))) {
          validMentions.push(user._id);
        }
      }
    }

    // Insert new message using authenticated user
    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      userId: ctx.user._id,
      authorName: ctx.user.name,
      body: args.body,
      clientMutationId: args.clientMutationId,
      mentions: validMentions.length > 0 ? validMentions : undefined,
      specialMentions: specialMentions.length > 0 ? specialMentions : undefined,
    });

    return messageId;
  },
});

/**
 * List message counts per channel for unread tracking.
 * Returns channelId and message count for all channels the user has access to.
 * Lightweight query for detecting new messages in inactive channels.
 *
 * ## Performance Note (N+1 Query Pattern)
 *
 * This query performs one DB query per channel (N+1 pattern).
 * For users in many channels, this may become a bottleneck.
 *
 * Current approach is acceptable for:
 * - Small teams (<20 channels per user)
 * - Infrequent polling (Convex subscriptions minimize calls)
 *
 * If performance degrades, consider:
 * 1. Denormalize: Add `messageCount` field to channelMembers, update on message insert
 * 2. Denormalize: Add `lastMessageTime` to channels table
 * 3. Use a separate "unreadCounts" table updated by triggers
 *
 * Trade-off: Current simplicity vs. write complexity of denormalization
 */
export const listLatestPerChannel = withAuthQuery({
  args: {},
  handler: async (ctx) => {
    // Get all channels the user is a member of
    const memberships = await ctx.db
      .query("channelMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();

    const channelIds = memberships.map((m) => m.channelId);

    // N+1 query: one query per channel
    // See performance note above for optimization strategies
    const results = await Promise.all(
      channelIds.map(async (channelId) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_channel", (q) => q.eq("channelId", channelId))
          .collect();

        // Get the latest message for notification details
        const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

        return {
          channelId,
          messageCount: messages.length,
          latestMessage: latestMessage
            ? {
                _id: latestMessage._id.toString(),
                body: latestMessage.body,
                authorId: latestMessage.userId.toString(),
                authorName: latestMessage.authorName,
                mentions: latestMessage.mentions?.map((m) => m.toString()),
                specialMentions: latestMessage.specialMentions,
              }
            : null,
        };
      })
    );

    return results;
  },
});
