import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// Helper to create a user with a valid session
async function createAuthenticatedUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  email: string
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name, email });
  });

  const rawToken = `token-${email}-${Date.now()}-${Math.random()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedToken = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      userId,
      token: hashedToken,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  });

  return { userId, sessionToken: rawToken };
}

describe("messages", () => {
  describe("send", () => {
    it("sends message to channel user is member of", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      // Create channel
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      // Send message
      const messageId = await t.mutation(api.messages.send, {
        sessionToken,
        channelId,
        body: "Hello, world!",
        clientMutationId: "unique-id-123",
      });

      expect(messageId).toBeDefined();

      // Verify message
      const message = await t.run(async (ctx) => {
        return await ctx.db.get(messageId);
      });

      expect(message?.body).toBe("Hello, world!");
      expect(message?.authorName).toBe("Alice");
      expect(message?.userId).toBe(userId);
      expect(message?.channelId).toBe(channelId);
    });

    it("is idempotent - same clientMutationId returns same message", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const clientMutationId = "idempotent-id-456";

      // Send same message twice
      const messageId1 = await t.mutation(api.messages.send, {
        sessionToken,
        channelId,
        body: "Idempotent message",
        clientMutationId,
      });

      const messageId2 = await t.mutation(api.messages.send, {
        sessionToken,
        channelId,
        body: "Idempotent message",
        clientMutationId,
      });

      // Should return same message ID
      expect(messageId1).toBe(messageId2);

      // Should only have one message
      const messages = await t.run(async (ctx) => {
        return await ctx.db
          .query("messages")
          .withIndex("by_channel", (q) => q.eq("channelId", channelId))
          .collect();
      });

      expect(messages).toHaveLength(1);
    });

    it("rejects message to channel user is not member of", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      // Alice creates channel
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "private-channel",
      });

      // Bob (not a member) tries to send message
      await expect(
        t.mutation(api.messages.send, {
          sessionToken: outsiderToken,
          channelId,
          body: "Unauthorized message",
          clientMutationId: "unauthorized-123",
        })
      ).rejects.toThrow("Not a member");
    });

    it("rejects unauthenticated request", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      await expect(
        t.mutation(api.messages.send, {
          sessionToken: "invalid-token",
          channelId,
          body: "Should fail",
          clientMutationId: "fail-123",
        })
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("returns messages for channel member", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      // Send some messages
      await t.mutation(api.messages.send, {
        sessionToken,
        channelId,
        body: "First message",
        clientMutationId: "msg-1",
      });

      await t.mutation(api.messages.send, {
        sessionToken,
        channelId,
        body: "Second message",
        clientMutationId: "msg-2",
      });

      // List messages
      const messages = await t.query(api.messages.list, {
        sessionToken,
        channelId,
      });

      expect(messages).toHaveLength(2);
      expect(messages.map((m) => m.body)).toContain("First message");
      expect(messages.map((m) => m.body)).toContain("Second message");
    });

    it("rejects list for non-member", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "private-channel",
      });

      await expect(
        t.query(api.messages.list, {
          sessionToken: outsiderToken,
          channelId,
        })
      ).rejects.toThrow("Not a member");
    });
  });
});
