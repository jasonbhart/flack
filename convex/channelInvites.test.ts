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

describe("channelInvites", () => {
  describe("create", () => {
    it("creates an invite for channel owner", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      // Create a channel
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      // Create invite
      const result = await t.mutation(api.channelInvites.create, {
        sessionToken,
        channelId,
      });

      expect(result.token).toBeDefined();
      expect(result.token).toHaveLength(12);
      expect(result.url).toBe(`/invite/${result.token}`);
    });

    it("revokes existing invite when creating new one (one invite per channel)", async () => {
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

      // Create first invite
      const firstInvite = await t.mutation(api.channelInvites.create, {
        sessionToken,
        channelId,
      });

      // Create second invite
      const secondInvite = await t.mutation(api.channelInvites.create, {
        sessionToken,
        channelId,
      });

      // Tokens should be different
      expect(firstInvite.token).not.toBe(secondInvite.token);

      // First invite should no longer exist
      const invites = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelInvites")
          .withIndex("by_channel", (q) => q.eq("channelId", channelId))
          .collect();
      });

      expect(invites).toHaveLength(1);
      expect(invites[0].token).toBe(secondInvite.token);
    });

    it("rejects non-owner/admin creating invite", async () => {
      const t = convexTest(schema, modules);
      const { userId: ownerId, sessionToken: ownerToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: memberId, sessionToken: memberToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      // Create channel as owner
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob as regular member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: memberId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Bob tries to create invite
      await expect(
        t.mutation(api.channelInvites.create, {
          sessionToken: memberToken,
          channelId,
        })
      ).rejects.toThrow("Only channel owners and admins");
    });
  });

  describe("redeem", () => {
    it("allows user to join channel via invite", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: joiningUserId, sessionToken: joiningToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      // Create channel and invite
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      const { token } = await t.mutation(api.channelInvites.create, {
        sessionToken: ownerToken,
        channelId,
      });

      // Bob redeems invite
      const result = await t.mutation(api.channelInvites.redeem, {
        sessionToken: joiningToken,
        token,
      });

      expect(result.success).toBe(true);
      expect(result.channelId).toBe(channelId);
      expect(result.alreadyMember).toBe(false);

      // Verify Bob is now a member
      const membership = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_and_user", (q) =>
            q.eq("channelId", channelId).eq("userId", joiningUserId)
          )
          .first();
      });

      expect(membership?.role).toBe("member");
    });

    it("increments usage count on redeem", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: joiningToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      const { token } = await t.mutation(api.channelInvites.create, {
        sessionToken: ownerToken,
        channelId,
      });

      // Check initial uses
      const beforeRedeem = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelInvites")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first();
      });
      expect(beforeRedeem?.uses).toBe(0);

      // Redeem
      await t.mutation(api.channelInvites.redeem, {
        sessionToken: joiningToken,
        token,
      });

      // Check uses incremented
      const afterRedeem = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelInvites")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first();
      });
      expect(afterRedeem?.uses).toBe(1);
    });

    it("rejects invalid token", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      await expect(
        t.mutation(api.channelInvites.redeem, {
          sessionToken,
          token: "invalid-token-123",
        })
      ).rejects.toThrow("Invalid invite link");
    });

    it("rejects expired invite", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: joiningToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Create an already-expired invite directly in DB
      const expiredToken = "expired123abc";
      await t.run(async (ctx) => {
        await ctx.db.insert("channelInvites", {
          channelId,
          token: expiredToken,
          createdBy: userId,
          createdAt: Date.now() - 100000,
          expiresAt: Date.now() - 1000, // Expired
          uses: 0,
        });
      });

      await expect(
        t.mutation(api.channelInvites.redeem, {
          sessionToken: joiningToken,
          token: expiredToken,
        })
      ).rejects.toThrow("expired");
    });

    it("rejects invite that exceeded max uses", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: joiningToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Create invite with maxUses already reached
      const maxedToken = "maxed123abcde";
      await t.run(async (ctx) => {
        await ctx.db.insert("channelInvites", {
          channelId,
          token: maxedToken,
          createdBy: userId,
          createdAt: Date.now(),
          maxUses: 1,
          uses: 1, // Already used
        });
      });

      await expect(
        t.mutation(api.channelInvites.redeem, {
          sessionToken: joiningToken,
          token: maxedToken,
        })
      ).rejects.toThrow("usage limit");
    });

    it("returns success without incrementing if already member", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      const { token } = await t.mutation(api.channelInvites.create, {
        sessionToken: ownerToken,
        channelId,
      });

      // Owner (already member) tries to redeem
      const result = await t.mutation(api.channelInvites.redeem, {
        sessionToken: ownerToken,
        token,
      });

      expect(result.success).toBe(true);
      expect(result.alreadyMember).toBe(true);

      // Uses should not be incremented
      const invite = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelInvites")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first();
      });
      expect(invite?.uses).toBe(0);
    });
  });

  describe("revoke", () => {
    it("allows owner to revoke invite", async () => {
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

      const { token } = await t.mutation(api.channelInvites.create, {
        sessionToken,
        channelId,
      });

      // Get invite ID
      const invite = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelInvites")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first();
      });

      // Revoke
      await t.mutation(api.channelInvites.revoke, {
        sessionToken,
        inviteId: invite!._id,
      });

      // Verify deleted
      const afterRevoke = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelInvites")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first();
      });

      expect(afterRevoke).toBeNull();
    });
  });
});
