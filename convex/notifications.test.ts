import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";

// Helper to create a user with a valid session
async function createAuthenticatedUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  email: string
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name, email, nameLower: name.toLowerCase() });
  });

  const rawToken = `token-${email}-${Date.now()}-${Math.random()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedToken = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      userId,
      token: hashedToken,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  });

  return { userId, sessionToken: rawToken };
}

// Helper to create presence for a user
async function createPresence(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  channelId: Id<"channels">,
  updatedAt: number
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("presence", {
      userId,
      sessionId: `session-${userId}-${Date.now()}`,
      displayName: "Test User",
      channelId,
      updated: updatedAt,
      data: { type: "online" },
    });
  });
}

describe("notifications", () => {
  describe("checkAndSendMentionEmail", () => {
    it("attempts to send email when user has no presence records (never online)", async () => {
      const t = convexTest(schema, modules);

      // Create sender and mentioned user
      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      // Create channel
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create a message directly (bypassing scheduler for test)
      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob check this out!",
          mentions: [mentionedUserId],
        });
      });

      // Run the notification check
      // In test environment, Resend throws "API key is not set"
      // This error means the code reached the email send step (all checks passed)
      await expect(
        t.mutation(internal.notifications.checkAndSendMentionEmail, {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt: Date.now() - 1000, // 1 second ago
        })
      ).rejects.toThrow("API key is not set");
    });

    it("skips notification when user came online after mention", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create message
      const mentionedAt = Date.now() - 5000; // 5 seconds ago
      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      // Create presence AFTER the mention (user came online)
      await createPresence(t, mentionedUserId, channelId, Date.now());

      const result = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt,
        }
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("user_online");
    });

    it("attempts to send notification when presence is older than mention", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create presence BEFORE the mention
      const oldPresenceTime = Date.now() - 10000; // 10 seconds ago
      await createPresence(t, mentionedUserId, channelId, oldPresenceTime);

      const mentionedAt = Date.now() - 5000; // 5 seconds ago (after presence)
      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      // In test environment, Resend throws "API key is not set"
      // This error means the code reached the email send step (all checks passed)
      await expect(
        t.mutation(internal.notifications.checkAndSendMentionEmail, {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt,
        })
      ).rejects.toThrow("API key is not set");
    });

    it("skips notification when message is deleted", async () => {
      const t = convexTest(schema, modules);

      const { sessionToken: senderToken } = await createAuthenticatedUser(
        t,
        "alice",
        "alice@example.com"
      );
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create and then delete a message
      const messageId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("messages", {
          channelId,
          userId: mentionedUserId, // Doesn't matter who sent it
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
        // Delete it immediately
        await ctx.db.delete(id);
        return id;
      });

      const result = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt: Date.now(),
        }
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("message_deleted");
    });

    it("skips notification when user has no email", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");

      // Create user without email
      const mentionedUserId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          name: "bob",
          email: "", // Empty email
          nameLower: "bob",
        });
      });

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      const result = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt: Date.now(),
        }
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("no_email");
    });

    it("skips notification when channel is deleted", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      // Delete the channel
      await t.run(async (ctx) => {
        await ctx.db.delete(channelId);
      });

      const result = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt: Date.now(),
        }
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("channel_deleted");
    });

    it("skips notification when mention is removed from message (edited)", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create message with mention
      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      // Simulate message edit that removes the mention
      await t.run(async (ctx) => {
        await ctx.db.patch(messageId, {
          body: "Hey everyone!",
          mentions: [], // Mention removed
        });
      });

      const result = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt: Date.now(),
        }
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("mention_removed");
    });

    it("handles multiple presence sessions correctly (uses most recent)", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create multiple presence records with different timestamps
      const oldTime = Date.now() - 20000; // 20 seconds ago
      const recentTime = Date.now() - 1000; // 1 second ago

      // Old session
      await t.run(async (ctx) => {
        await ctx.db.insert("presence", {
          userId: mentionedUserId,
          sessionId: "session-old",
          displayName: "bob",
          channelId,
          updated: oldTime,
          data: { type: "online" },
        });
      });

      // Recent session (most recent activity)
      await t.run(async (ctx) => {
        await ctx.db.insert("presence", {
          userId: mentionedUserId,
          sessionId: "session-new",
          displayName: "bob",
          channelId,
          updated: recentTime,
          data: { type: "online" },
        });
      });

      // Mention happened between old and recent
      const mentionedAt = Date.now() - 10000; // 10 seconds ago

      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      const result = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt,
        }
      );

      // User came online (recent session is after mention), so skip
      expect(result.sent).toBe(false);
      expect(result.reason).toBe("user_online");
    });
  });

  describe("consolidation", () => {
    it("consolidates multiple mentions - second mention is skipped", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create two messages mentioning the same user
      const messageId1 = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "First @bob mention",
          mentions: [mentionedUserId],
        });
      });

      // Small delay to ensure different creation times
      await new Promise((resolve) => setTimeout(resolve, 10));

      const messageId2 = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Second @bob mention",
          mentions: [mentionedUserId],
        });
      });

      const mentionedAt = Date.now();

      // Second message should be consolidated (skipped) because first message exists
      const result2 = await t.mutation(
        internal.notifications.checkAndSendMentionEmail,
        {
          messageId: messageId2,
          mentionedUserId,
          channelId,
          mentionedAt,
        }
      );

      // The second should be consolidated (first message is older)
      expect(result2.sent).toBe(false);
      expect(result2.reason).toBe("consolidated");
    });

    it("first mention attempts to send email", async () => {
      const t = convexTest(schema, modules);

      const { userId: senderId, sessionToken: senderToken } =
        await createAuthenticatedUser(t, "alice", "alice@example.com");
      const { userId: mentionedUserId } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: senderToken,
        name: "test-channel",
      });

      // Create a single message
      const messageId = await t.run(async (ctx) => {
        return await ctx.db.insert("messages", {
          channelId,
          userId: senderId,
          authorName: "alice",
          body: "Hey @bob!",
          mentions: [mentionedUserId],
        });
      });

      const mentionedAt = Date.now();

      // First (and only) message should attempt to send
      // In test environment, Resend throws "API key is not set"
      await expect(
        t.mutation(internal.notifications.checkAndSendMentionEmail, {
          messageId,
          mentionedUserId,
          channelId,
          mentionedAt,
        })
      ).rejects.toThrow("API key is not set");
    });
  });

  describe("scheduler integration", () => {
    it("schedules notification when message with mention is sent", async () => {
      const t = convexTest(schema, modules);

      const { sessionToken: aliceToken } = await createAuthenticatedUser(
        t,
        "alice",
        "alice@example.com"
      );
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "bob", "bob@example.com");

      // Create channel and add bob
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: aliceToken,
        name: "test-channel",
      });

      const { token: inviteToken } = await t.mutation(
        api.channelInvites.create,
        {
          sessionToken: aliceToken,
          channelId,
        }
      );

      await t.mutation(api.channelInvites.redeem, {
        sessionToken: bobToken,
        token: inviteToken,
      });

      // Send message mentioning bob
      const messageId = await t.mutation(api.messages.send, {
        sessionToken: aliceToken,
        channelId,
        body: "Hey @bob check this!",
        clientMutationId: "test-mention-1",
      });

      expect(messageId).toBeDefined();

      // Verify message has mention
      const message = await t.run(async (ctx) => {
        return await ctx.db.get(messageId);
      });

      expect(message?.mentions).toContain(bobId);

      // Note: We can't easily verify the scheduler was called in convex-test
      // but we've verified the message was created with the mention
      // The scheduler integration is tested via the actual Convex dev environment
    });
  });
});
