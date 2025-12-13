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
    return await ctx.db.insert("users", { name, email, nameLower: name.toLowerCase() });
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

describe("channelMembers", () => {
  describe("removeMember", () => {
    it("allows owner to remove a member", async () => {
      const t = convexTest(schema, modules);
      const { userId: ownerId, sessionToken: ownerToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: memberId, sessionToken: memberToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      // Create channel
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob as member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: memberId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Owner removes Bob
      const result = await t.mutation(api.channelMembers.removeMember, {
        sessionToken: ownerToken,
        channelId,
        userId: memberId,
      });

      expect(result.success).toBe(true);

      // Verify Bob is no longer a member
      const membership = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_and_user", (q) =>
            q.eq("channelId", channelId).eq("userId", memberId)
          )
          .first();
      });

      expect(membership).toBeNull();
    });

    it("allows member to remove themselves", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: memberId, sessionToken: memberToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob as member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: memberId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Bob removes himself
      const result = await t.mutation(api.channelMembers.removeMember, {
        sessionToken: memberToken,
        channelId,
        userId: memberId,
      });

      expect(result.success).toBe(true);
    });

    it("prevents owner from leaving when other members exist", async () => {
      const t = convexTest(schema, modules);
      const { userId: ownerId, sessionToken: ownerToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: memberId } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob as member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: memberId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Owner tries to leave
      await expect(
        t.mutation(api.channelMembers.removeMember, {
          sessionToken: ownerToken,
          channelId,
          userId: ownerId,
        })
      ).rejects.toThrow("transfer ownership");
    });

    it("allows sole owner to leave (deletes channel)", async () => {
      const t = convexTest(schema, modules);
      const { userId: ownerId, sessionToken: ownerToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Send a message to verify cascade delete
      await t.mutation(api.messages.send, {
        sessionToken: ownerToken,
        channelId,
        body: "Test message",
        clientMutationId: "test-msg",
      });

      // Owner leaves (sole member)
      const result = await t.mutation(api.channelMembers.removeMember, {
        sessionToken: ownerToken,
        channelId,
        userId: ownerId,
      });

      expect(result.success).toBe(true);
      expect(result.channelDeleted).toBe(true);

      // Verify channel is deleted
      const channel = await t.run(async (ctx) => {
        return await ctx.db.get(channelId);
      });
      expect(channel).toBeNull();

      // Verify messages are deleted
      const messages = await t.run(async (ctx) => {
        return await ctx.db
          .query("messages")
          .withIndex("by_channel", (q) => q.eq("channelId", channelId))
          .collect();
      });
      expect(messages).toHaveLength(0);
    });

    it("prevents member from removing another member", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");
      const { userId: charlieId } = await createAuthenticatedUser(
        t,
        "Charlie",
        "charlie@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob and Charlie as members
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: bobId,
          role: "member",
          joinedAt: Date.now(),
        });
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: charlieId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Bob tries to remove Charlie
      await expect(
        t.mutation(api.channelMembers.removeMember, {
          sessionToken: bobToken,
          channelId,
          userId: charlieId,
        })
      ).rejects.toThrow("Cannot remove this member");
    });
  });

  describe("transferOwnership", () => {
    it("allows owner to transfer ownership", async () => {
      const t = convexTest(schema, modules);
      const { userId: ownerId, sessionToken: ownerToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: newOwnerId } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob as member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: newOwnerId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Transfer ownership to Bob
      const result = await t.mutation(api.channelMembers.transferOwnership, {
        sessionToken: ownerToken,
        channelId,
        newOwnerId,
      });

      expect(result.success).toBe(true);

      // Verify Bob is now owner
      const bobMembership = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_and_user", (q) =>
            q.eq("channelId", channelId).eq("userId", newOwnerId)
          )
          .first();
      });
      expect(bobMembership?.role).toBe("owner");

      // Verify Alice is now admin
      const aliceMembership = await t.run(async (ctx) => {
        return await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_and_user", (q) =>
            q.eq("channelId", channelId).eq("userId", ownerId)
          )
          .first();
      });
      expect(aliceMembership?.role).toBe("admin");

      // Verify channel creatorId is updated
      const channel = await t.run(async (ctx) => {
        return await ctx.db.get(channelId);
      });
      expect(channel?.creatorId).toBe(newOwnerId);
    });

    it("prevents non-owner from transferring ownership", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");
      const { userId: charlieId } = await createAuthenticatedUser(
        t,
        "Charlie",
        "charlie@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob and Charlie
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: bobId,
          role: "admin",
          joinedAt: Date.now(),
        });
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: charlieId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Bob (admin, not owner) tries to transfer to Charlie
      await expect(
        t.mutation(api.channelMembers.transferOwnership, {
          sessionToken: bobToken,
          channelId,
          newOwnerId: charlieId,
        })
      ).rejects.toThrow("Only the channel owner");
    });

    it("prevents transferring to non-member", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: nonMemberId } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Try to transfer to Bob who is not a member
      await expect(
        t.mutation(api.channelMembers.transferOwnership, {
          sessionToken: ownerToken,
          channelId,
          newOwnerId: nonMemberId,
        })
      ).rejects.toThrow("must be a current member");
    });
  });
});
