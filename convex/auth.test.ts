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
});
