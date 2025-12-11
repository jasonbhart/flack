import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

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
    it("enforces rate limits when limit is reached", async () => {
      const t = convexTest(schema, modules);
      const email = "rate-limit@test.com";
      const normalizedEmail = email.toLowerCase().trim();

      // Pre-populate rate limit to simulate 5 previous attempts
      // (In real usage, rate limits persist across failed mutations via internal mutation)
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

      // Next attempt should be rate limited immediately
      await expect(
        t.mutation(api.auth.verifyCode, {
          email,
          code: "123456",
        })
      ).rejects.toThrow("Too many attempts");
    });

    it("rejects invalid code format before rate limiting", async () => {
      const t = convexTest(schema, modules);

      // Rate limit check runs first, then format validation
      // But we still want to verify format validation works
      await expect(
        t.mutation(api.auth.verifyCode, {
          email: "format-test@test.com",
          code: "abc", // Invalid format
        })
      ).rejects.toThrow("Invalid code format");
    });
  });
});
