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

  const rawToken = `token-${email}-${Date.now()}`;
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

describe("channels", () => {
  describe("create", () => {
    it("creates a channel with creator as owner", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const result = await t.mutation(api.channels.create, {
        sessionToken,
        name: "my-channel",
      });

      expect(result.channelId).toBeDefined();

      // Verify channel was created
      const channel = await t.run(async (ctx) => {
        return await ctx.db.get(result.channelId);
      });

      expect(channel?.name).toBe("my-channel");
      expect(channel?.creatorId).toBe(userId);

      // Verify membership was created
      const membership = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_and_user", (q) =>
            q.eq("channelId", result.channelId).eq("userId", userId)
          )
          .first();
      });

      expect(membership?.role).toBe("owner");
    });

    it("normalizes channel name to lowercase", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const result = await t.mutation(api.channels.create, {
        sessionToken,
        name: "MY-CHANNEL",
      });

      const channel = await t.run(async (ctx) => {
        return await ctx.db.get(result.channelId);
      });

      expect(channel?.name).toBe("my-channel");
    });

    it("rejects empty channel name", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      await expect(
        t.mutation(api.channels.create, {
          sessionToken,
          name: "",
        })
      ).rejects.toThrow("Channel name cannot be empty");
    });

    it("rejects channel name over 80 characters", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const longName = "a".repeat(81);

      await expect(
        t.mutation(api.channels.create, {
          sessionToken,
          name: longName,
        })
      ).rejects.toThrow("80 characters or less");
    });

    it("rejects invalid channel name characters", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      await expect(
        t.mutation(api.channels.create, {
          sessionToken,
          name: "my channel!", // spaces and special chars not allowed
        })
      ).rejects.toThrow("can only contain lowercase letters");
    });

    it("rejects unauthenticated request", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.mutation(api.channels.create, {
          sessionToken: "invalid-token",
          name: "test-channel",
        })
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("returns only channels user is member of", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      // Create a channel Alice owns
      const result = await t.mutation(api.channels.create, {
        sessionToken,
        name: "alice-channel",
      });

      // Create another channel without Alice
      await t.run(async (ctx) => {
        await ctx.db.insert("channels", {
          name: "other-channel",
        });
      });

      const channels = await t.query(api.channels.list, { sessionToken });

      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe("alice-channel");
      expect(channels[0].role).toBe("owner");
    });

    it("includes creator name in response", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const channels = await t.query(api.channels.list, { sessionToken });

      expect(channels[0].creatorName).toBe("Alice");
    });
  });
});
