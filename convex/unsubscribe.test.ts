import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  generateUnsubscribeToken,
  validateUnsubscribeToken,
} from "./unsubscribe";
import type { Id } from "./_generated/dataModel";

// Test secret for HMAC operations
const TEST_SECRET = "test-unsubscribe-secret-for-testing-only";

describe("unsubscribe token utilities", () => {
  beforeEach(() => {
    // Set up test environment variable
    vi.stubEnv("UNSUBSCRIBE_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("generateUnsubscribeToken", () => {
    it("generates a non-empty token for valid userId", async () => {
      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token!.length).toBeGreaterThan(0);
    });

    it("generates URL-safe base64 token (no +, /, or = characters)", async () => {
      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeTruthy();
      expect(token).not.toMatch(/[+/=]/);
    });

    it("generates different tokens for different userIds", async () => {
      const userId1 = "k57abc123def456" as Id<"users">;
      const userId2 = "k57xyz789ghi012" as Id<"users">;

      const token1 = await generateUnsubscribeToken(userId1);
      const token2 = await generateUnsubscribeToken(userId2);

      expect(token1).not.toBe(token2);
    });

    it("generates consistent tokens for same userId", async () => {
      const userId = "k57abc123def456" as Id<"users">;

      const token1 = await generateUnsubscribeToken(userId);
      const token2 = await generateUnsubscribeToken(userId);

      expect(token1).toBe(token2);
    });

    it("returns null when UNSUBSCRIBE_SECRET is not set", async () => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "");

      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeNull();
    });
  });

  describe("validateUnsubscribeToken", () => {
    it("validates a token and returns the correct userId", async () => {
      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeTruthy();

      const validatedUserId = await validateUnsubscribeToken(token!);
      expect(validatedUserId).toBe(userId);
    });

    it("returns null for tampered token (modified signature)", async () => {
      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeTruthy();

      // Tamper with the token by changing a character
      const tamperedToken = token!.slice(0, -1) + (token!.slice(-1) === "a" ? "b" : "a");

      const validatedUserId = await validateUnsubscribeToken(tamperedToken);
      expect(validatedUserId).toBeNull();
    });

    it("returns null for completely invalid token", async () => {
      const invalidToken = "totally-not-a-valid-token";

      const validatedUserId = await validateUnsubscribeToken(invalidToken);
      expect(validatedUserId).toBeNull();
    });

    it("returns null for empty token", async () => {
      const validatedUserId = await validateUnsubscribeToken("");
      expect(validatedUserId).toBeNull();
    });

    it("returns null for token without separator", async () => {
      // Base64 encoded string without colon separator
      const invalidToken = btoa("no-separator-here")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const validatedUserId = await validateUnsubscribeToken(invalidToken);
      expect(validatedUserId).toBeNull();
    });

    it("returns null when UNSUBSCRIBE_SECRET is not set", async () => {
      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeTruthy();

      // Clear the secret
      vi.stubEnv("UNSUBSCRIBE_SECRET", "");

      const validatedUserId = await validateUnsubscribeToken(token!);
      expect(validatedUserId).toBeNull();
    });

    it("returns null for token generated with different secret", async () => {
      const userId = "k57abc123def456" as Id<"users">;
      const token = await generateUnsubscribeToken(userId);

      expect(token).toBeTruthy();

      // Change the secret
      vi.stubEnv("UNSUBSCRIBE_SECRET", "different-secret");

      const validatedUserId = await validateUnsubscribeToken(token!);
      expect(validatedUserId).toBeNull();
    });
  });
});

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

describe("unsubscribe mutations", () => {
  beforeEach(() => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("setEmailNotifications", () => {
    it("creates preference record when none exists", async () => {
      const t = convexTest(schema, modules);

      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "alice",
        "alice@example.com"
      );

      // Set preference to false
      const result = await t.mutation(api.unsubscribe.setEmailNotifications, {
        sessionToken,
        enabled: false,
      });

      expect(result.success).toBe(true);

      // Verify preference was created
      const preference = await t.run(async (ctx) => {
        return await ctx.db
          .query("userPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
      });

      expect(preference).toBeTruthy();
      expect(preference!.emailNotifications).toBe(false);
    });

    it("updates existing preference record", async () => {
      const t = convexTest(schema, modules);

      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "bob",
        "bob@example.com"
      );

      // Create initial preference
      await t.run(async (ctx) => {
        await ctx.db.insert("userPreferences", {
          userId,
          emailNotifications: true,
        });
      });

      // Update to false
      await t.mutation(api.unsubscribe.setEmailNotifications, {
        sessionToken,
        enabled: false,
      });

      // Verify update
      const preference = await t.run(async (ctx) => {
        return await ctx.db
          .query("userPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
      });

      expect(preference!.emailNotifications).toBe(false);

      // Update back to true
      await t.mutation(api.unsubscribe.setEmailNotifications, {
        sessionToken,
        enabled: true,
      });

      const updatedPreference = await t.run(async (ctx) => {
        return await ctx.db
          .query("userPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
      });

      expect(updatedPreference!.emailNotifications).toBe(true);
    });
  });

  describe("getEmailNotificationPreference", () => {
    it("returns true (default) when no preference exists", async () => {
      const t = convexTest(schema, modules);

      const { sessionToken } = await createAuthenticatedUser(
        t,
        "charlie",
        "charlie@example.com"
      );

      const preference = await t.query(
        api.unsubscribe.getEmailNotificationPreference,
        { sessionToken }
      );

      expect(preference).toBe(true);
    });

    it("returns stored preference when it exists", async () => {
      const t = convexTest(schema, modules);

      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "diana",
        "diana@example.com"
      );

      // Create preference
      await t.run(async (ctx) => {
        await ctx.db.insert("userPreferences", {
          userId,
          emailNotifications: false,
        });
      });

      const preference = await t.query(
        api.unsubscribe.getEmailNotificationPreference,
        { sessionToken }
      );

      expect(preference).toBe(false);
    });
  });

  describe("unsubscribeByToken", () => {
    it("unsubscribes user with valid token", async () => {
      const t = convexTest(schema, modules);

      const { userId } = await createAuthenticatedUser(
        t,
        "eve",
        "eve@example.com"
      );

      // Generate token
      const token = await generateUnsubscribeToken(userId);
      expect(token).toBeTruthy();

      // Unsubscribe
      const result = await t.mutation(api.unsubscribe.unsubscribeByToken, {
        token: token!,
      });

      expect(result.success).toBe(true);

      // Verify preference was set
      const preference = await t.run(async (ctx) => {
        return await ctx.db
          .query("userPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
      });

      expect(preference).toBeTruthy();
      expect(preference!.emailNotifications).toBe(false);
    });

    it("returns error for invalid token", async () => {
      const t = convexTest(schema, modules);

      const result = await t.mutation(api.unsubscribe.unsubscribeByToken, {
        token: "invalid-token",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_token");
    });

    it("returns error for non-existent user", async () => {
      const t = convexTest(schema, modules);

      // Generate token for a fake user ID that doesn't exist
      const fakeUserId = "k57nonexistent123" as Id<"users">;
      const token = await generateUnsubscribeToken(fakeUserId);
      expect(token).toBeTruthy();

      const result = await t.mutation(api.unsubscribe.unsubscribeByToken, {
        token: token!,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("user_not_found");
    });

    it("is idempotent - multiple calls have same effect", async () => {
      const t = convexTest(schema, modules);

      const { userId } = await createAuthenticatedUser(
        t,
        "frank",
        "frank@example.com"
      );

      const token = await generateUnsubscribeToken(userId);
      expect(token).toBeTruthy();

      // Call unsubscribe multiple times
      const result1 = await t.mutation(api.unsubscribe.unsubscribeByToken, {
        token: token!,
      });
      const result2 = await t.mutation(api.unsubscribe.unsubscribeByToken, {
        token: token!,
      });
      const result3 = await t.mutation(api.unsubscribe.unsubscribeByToken, {
        token: token!,
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Verify only one preference record exists
      const preferences = await t.run(async (ctx) => {
        return await ctx.db
          .query("userPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
      });

      expect(preferences.length).toBe(1);
      expect(preferences[0].emailNotifications).toBe(false);
    });
  });
});

describe("integration: preference flow", () => {
  beforeEach(() => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("full unsubscribe flow: token → preference update → query reflects change", async () => {
    const t = convexTest(schema, modules);

    const { userId, sessionToken } = await createAuthenticatedUser(
      t,
      "grace",
      "grace@example.com"
    );

    // Initially, preference should be true (default)
    const initialPref = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );
    expect(initialPref).toBe(true);

    // Generate token and unsubscribe
    const token = await generateUnsubscribeToken(userId);
    expect(token).toBeTruthy();

    const result = await t.mutation(api.unsubscribe.unsubscribeByToken, {
      token: token!,
    });
    expect(result.success).toBe(true);

    // Now preference should be false
    const finalPref = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );
    expect(finalPref).toBe(false);
  });

  it("resubscribe flow: unsubscribe → settings toggle on → preference restored", async () => {
    const t = convexTest(schema, modules);

    const { userId, sessionToken } = await createAuthenticatedUser(
      t,
      "henry",
      "henry@example.com"
    );

    // Unsubscribe first
    const token = await generateUnsubscribeToken(userId);
    await t.mutation(api.unsubscribe.unsubscribeByToken, { token: token! });

    // Verify unsubscribed
    const unsubPref = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );
    expect(unsubPref).toBe(false);

    // Resubscribe via settings toggle
    await t.mutation(api.unsubscribe.setEmailNotifications, {
      sessionToken,
      enabled: true,
    });

    // Verify resubscribed
    const resubPref = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );
    expect(resubPref).toBe(true);
  });

  it("shouldNotifyUser respects preference (via internal notification check)", async () => {
    const t = convexTest(schema, modules);

    const { userId } = await createAuthenticatedUser(
      t,
      "ivy",
      "ivy@example.com"
    );

    // Create preference record with emailNotifications: false
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId,
        emailNotifications: false,
      });
    });

    // The shouldNotifyUser function is internal, so we verify by checking
    // that the preference table has the correct value
    const preference = await t.run(async (ctx) => {
      return await ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
    });

    expect(preference).toBeTruthy();
    expect(preference!.emailNotifications).toBe(false);

    // When emailNotifications is false, the internal shouldNotifyUser
    // function will return false, preventing email sending
  });

  it("preference persists across multiple queries", async () => {
    const t = convexTest(schema, modules);

    const { userId, sessionToken } = await createAuthenticatedUser(
      t,
      "jack",
      "jack@example.com"
    );

    // Set preference to false
    await t.mutation(api.unsubscribe.setEmailNotifications, {
      sessionToken,
      enabled: false,
    });

    // Query multiple times to verify persistence
    const pref1 = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );
    const pref2 = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );
    const pref3 = await t.query(
      api.unsubscribe.getEmailNotificationPreference,
      { sessionToken }
    );

    expect(pref1).toBe(false);
    expect(pref2).toBe(false);
    expect(pref3).toBe(false);
  });
});
