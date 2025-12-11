import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// Helper to hash strings for testing (same algorithm as production)
async function hashForTest(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("auth", () => {
  describe("getSession", () => {
    it("returns null for invalid session token", async () => {
      const t = convexTest(schema, modules);

      const result = await t.query(api.auth.getSession, {
        sessionToken: "invalid-token",
      });

      expect(result).toBeNull();
    });

    it("returns null for missing session token", async () => {
      const t = convexTest(schema, modules);

      const result = await t.query(api.auth.getSession, {
        sessionToken: "",
      });

      expect(result).toBeNull();
    });

    it("returns user for valid session", async () => {
      const t = convexTest(schema, modules);

      // Create a user
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          name: "Test User",
          email: "test@example.com",
        });
      });

      // Create a session with hashed token
      const rawToken = "test-session-token";
      const encoder = new TextEncoder();
      const data = encoder.encode(rawToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedToken = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      await t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          userId,
          token: hashedToken,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        });
      });

      const result = await t.query(api.auth.getSession, {
        sessionToken: rawToken,
      });

      expect(result).not.toBeNull();
      expect(result?.email).toBe("test@example.com");
      expect(result?.name).toBe("Test User");
    });

    it("returns null for expired session", async () => {
      const t = convexTest(schema, modules);

      // Create a user
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          name: "Test User",
          email: "test@example.com",
        });
      });

      // Create an expired session
      const rawToken = "expired-token";
      const encoder = new TextEncoder();
      const data = encoder.encode(rawToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedToken = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      await t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          userId,
          token: hashedToken,
          expiresAt: Date.now() - 1000, // Expired 1 second ago
        });
      });

      const result = await t.query(api.auth.getSession, {
        sessionToken: rawToken,
      });

      expect(result).toBeNull();
    });
  });

  describe("logout", () => {
    it("deletes session on logout", async () => {
      const t = convexTest(schema, modules);

      // Create user and session
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          name: "Test User",
          email: "test@example.com",
        });
      });

      const rawToken = "logout-test-token";
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

      // Verify session exists
      const beforeLogout = await t.query(api.auth.getSession, {
        sessionToken: rawToken,
      });
      expect(beforeLogout).not.toBeNull();

      // Logout
      await t.mutation(api.auth.logout, {
        sessionToken: rawToken,
      });

      // Verify session is gone
      const afterLogout = await t.query(api.auth.getSession, {
        sessionToken: rawToken,
      });
      expect(afterLogout).toBeNull();
    });
  });

  describe("verifyCode", () => {
    it("returns rate limit error when limit is reached", async () => {
      const t = convexTest(schema, modules);
      const email = "rate-limit@test.com";
      const normalizedEmail = email.toLowerCase().trim();

      // Pre-populate rate limit to simulate 5 previous attempts
      const now = Date.now();
      const windowMs = 60 * 1000; // 1 minute
      const windowStart = Math.floor(now / windowMs) * windowMs;

      await t.run(async (ctx) => {
        await ctx.db.insert("rateLimits", {
          key: `code_verify:${normalizedEmail}`,
          type: "minute",
          windowStart,
          count: 5, // Already at limit
        });
      });

      // Next attempt should return rate limit error (not throw)
      const result = await t.mutation(api.auth.verifyCode, {
        email,
        code: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many attempts");
      expect(result.retryAfterSeconds).toBeDefined();
    });

    it("returns error for invalid code format", async () => {
      const t = convexTest(schema, modules);

      const result = await t.mutation(api.auth.verifyCode, {
        email: "format-test@test.com",
        code: "abc", // Invalid format
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid code format");
    });

    it("increments rate limit counter on failed verification", async () => {
      const t = convexTest(schema, modules);
      const email = "increment-test@test.com";
      const normalizedEmail = email.toLowerCase().trim();

      // Verify no rate limit records exist initially
      const beforeRateLimits = await t.run(async (ctx) => {
        return await ctx.db.query("rateLimits").collect();
      });
      const beforeCount = beforeRateLimits.filter(
        (r) => r.key === `code_verify:${normalizedEmail}`
      ).length;
      expect(beforeCount).toBe(0);

      // Make a failed verification attempt (no token exists for this email)
      const result = await t.mutation(api.auth.verifyCode, {
        email,
        code: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired code");

      // Verify rate limit was incremented (mutation didn't roll back)
      const afterRateLimits = await t.run(async (ctx) => {
        return await ctx.db.query("rateLimits").collect();
      });
      const rateLimitRecord = afterRateLimits.find(
        (r) => r.key === `code_verify:${normalizedEmail}`
      );
      expect(rateLimitRecord).toBeDefined();
      expect(rateLimitRecord?.count).toBe(1);
    });

    it("increments attempt counter on wrong code", async () => {
      const t = convexTest(schema, modules);
      const email = "attempts-test@test.com";
      const normalizedEmail = email.toLowerCase().trim();

      // Create a valid auth token for this email
      const codeHash = await hashForTest("999999");
      const tokenId = await t.run(async (ctx) => {
        return await ctx.db.insert("authTokens", {
          email: normalizedEmail,
          token: "some-token-hash",
          code: codeHash,
          expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
          used: false,
        });
      });

      // Try with wrong code
      const result = await t.mutation(api.auth.verifyCode, {
        email,
        code: "123456", // Wrong code (correct is 999999)
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired code");

      // Verify attempts counter was incremented
      const token = await t.run(async (ctx) => {
        return await ctx.db.get(tokenId);
      });
      expect(token?.attempts).toBe(1);
    });

    it("creates user, default channel, and membership on successful verification", async () => {
      const t = convexTest(schema, modules);
      const email = "newuser@test.com";
      const normalizedEmail = email.toLowerCase().trim();
      const code = "123456";

      // Create a valid auth token
      const codeHash = await hashForTest(code);
      const tokenHash = await hashForTest("some-magic-link-token");
      await t.run(async (ctx) => {
        await ctx.db.insert("authTokens", {
          email: normalizedEmail,
          token: tokenHash,
          code: codeHash,
          expiresAt: Date.now() + 15 * 60 * 1000,
          used: false,
        });
      });

      // Verify the code
      const result = await t.mutation(api.auth.verifyCode, {
        email,
        code,
      });

      // Should succeed
      expect(result.success).toBe(true);
      expect(result.sessionToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe(normalizedEmail);

      // Verify user was created
      const users = await t.run(async (ctx) => {
        return await ctx.db.query("users").collect();
      });
      expect(users.length).toBe(1);
      expect(users[0].email).toBe(normalizedEmail);

      // Verify default channel was created
      const channels = await t.run(async (ctx) => {
        return await ctx.db.query("channels").collect();
      });
      expect(channels.length).toBe(1);
      expect(channels[0].name).toBe("general");
      expect(channels[0].isDefault).toBe(true);
      expect(channels[0].creatorId).toBe(users[0]._id);

      // Verify channel membership was created
      const memberships = await t.run(async (ctx) => {
        return await ctx.db.query("channelMembers").collect();
      });
      expect(memberships.length).toBe(1);
      expect(memberships[0].channelId).toBe(channels[0]._id);
      expect(memberships[0].userId).toBe(users[0]._id);
      expect(memberships[0].role).toBe("owner");
    });

    it("returns channels for authenticated user after signup", async () => {
      const t = convexTest(schema, modules);
      const email = "channeltest@test.com";
      const normalizedEmail = email.toLowerCase().trim();
      const code = "654321";

      // Create a valid auth token
      const codeHash = await hashForTest(code);
      const tokenHash = await hashForTest("another-magic-link-token");
      await t.run(async (ctx) => {
        await ctx.db.insert("authTokens", {
          email: normalizedEmail,
          token: tokenHash,
          code: codeHash,
          expiresAt: Date.now() + 15 * 60 * 1000,
          used: false,
        });
      });

      // Verify the code to create user and get session
      const verifyResult = await t.mutation(api.auth.verifyCode, {
        email,
        code,
      });

      expect(verifyResult.success).toBe(true);
      const sessionToken = verifyResult.sessionToken!;

      // Now query channels with the session token
      const channels = await t.query(api.channels.list, {
        sessionToken,
      });

      // Should return the default general channel
      expect(channels.length).toBe(1);
      expect(channels[0].name).toBe("general");
      expect(channels[0].role).toBe("owner");
      expect(channels[0].creatorName).toBeDefined();
    });
  });
});
