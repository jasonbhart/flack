import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { withAuthMutation, withAuthQuery } from "./authMiddleware";
import type { Id } from "./_generated/dataModel";

/**
 * Generate HMAC-SHA256 signature for a message using the UNSUBSCRIBE_SECRET.
 * Returns null if UNSUBSCRIBE_SECRET is not set.
 */
async function generateHmac(message: string): Promise<string | null> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    console.warn(
      "[unsubscribe] UNSUBSCRIBE_SECRET not set, cannot generate token"
    );
    return null;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify HMAC-SHA256 signature for a message.
 * Returns true if the signature is valid, false otherwise.
 */
async function verifyHmac(
  message: string,
  expectedSignature: string
): Promise<boolean> {
  const actualSignature = await generateHmac(message);
  if (!actualSignature) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (actualSignature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < actualSignature.length; i++) {
    result |= actualSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Base64URL encode a string (URL-safe base64).
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64URL decode a string (URL-safe base64).
 */
function base64UrlDecode(str: string): string {
  // Add padding back
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

/**
 * Generate a signed unsubscribe token for a user.
 * Token format: base64url(userId:hmac_signature)
 *
 * Returns null if UNSUBSCRIBE_SECRET is not set.
 */
export async function generateUnsubscribeToken(
  userId: Id<"users">
): Promise<string | null> {
  const signature = await generateHmac(userId);
  if (!signature) {
    return null;
  }

  const tokenData = `${userId}:${signature}`;
  return base64UrlEncode(tokenData);
}

/**
 * Validate an unsubscribe token and extract the userId.
 * Returns the userId if valid, null if invalid or tampered.
 */
export async function validateUnsubscribeToken(
  token: string
): Promise<Id<"users"> | null> {
  try {
    const decoded = base64UrlDecode(token);
    const colonIndex = decoded.indexOf(":");

    if (colonIndex === -1) {
      console.log("[unsubscribe] Invalid token format: no separator");
      return null;
    }

    const userId = decoded.substring(0, colonIndex);
    const providedSignature = decoded.substring(colonIndex + 1);

    if (!userId || !providedSignature) {
      console.log("[unsubscribe] Invalid token format: empty parts");
      return null;
    }

    const isValid = await verifyHmac(userId, providedSignature);
    if (!isValid) {
      console.log("[unsubscribe] Invalid token: signature mismatch");
      return null;
    }

    return userId as Id<"users">;
  } catch (error) {
    console.log("[unsubscribe] Invalid token: decode error", error);
    return null;
  }
}

// ============================================================================
// Mutations and Queries
// ============================================================================

/**
 * Get user's email notification preference.
 * Returns true (default) if no preference exists (opt-out model).
 * Requires authentication.
 */
export const getEmailNotificationPreference = withAuthQuery({
  args: {},
  handler: async (ctx) => {
    const preference = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .first();

    // Default to true if no preference exists (opt-out model)
    return preference?.emailNotifications ?? true;
  },
});

/**
 * Set user's email notification preference.
 * Requires authentication. Uses upsert pattern.
 */
export const setEmailNotifications = withAuthMutation({
  args: {
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        emailNotifications: args.enabled,
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: ctx.user._id,
        emailNotifications: args.enabled,
      });
    }

    console.log(
      `[unsubscribe] User ${ctx.user._id} set emailNotifications to ${args.enabled}`
    );

    return { success: true };
  },
});

/**
 * Unsubscribe a user by token (no authentication required).
 * Used for one-click unsubscribe from email links.
 * Idempotent: multiple calls have the same effect.
 */
export const unsubscribeByToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await validateUnsubscribeToken(args.token);

    if (!userId) {
      console.log("[unsubscribe] Invalid token provided");
      return { success: false, error: "invalid_token" };
    }

    // Verify user exists
    const user = await ctx.db.get(userId);
    if (!user) {
      console.log(`[unsubscribe] User ${userId} not found`);
      return { success: false, error: "user_not_found" };
    }

    // Upsert preference
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        emailNotifications: false,
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        emailNotifications: false,
      });
    }

    console.log(`[unsubscribe] User ${userId} unsubscribed via token`);

    return { success: true };
  },
});
