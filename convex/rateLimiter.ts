import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

// Rate limit windows
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Rate limit configurations
export const RATE_LIMITS = {
  magicLink: {
    perMinutePerEmail: 1, // 1 request per minute per email
    perHourPerEmail: 5, // 5 requests per hour per email
    perMinutePerIp: 10, // 10 requests per minute per IP
  },
  codeVerification: {
    perMinutePerEmail: 5, // 5 attempts per minute per email
  },
} as const;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
  remainingRequests?: number;
};

/**
 * Check rate limit for a given key and limit configuration.
 * Uses fixed window approach (counters reset at window boundary).
 *
 * @param ctx - Mutation context
 * @param key - Rate limit key (e.g., "email:user@example.com" or "ip:192.168.1.1")
 * @param type - Window type ("minute" or "hour")
 * @param limit - Maximum requests allowed in the window
 * @returns RateLimitResult with allowed status and retry info
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  type: "minute" | "hour",
  limit: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = type === "minute" ? MINUTE_MS : HOUR_MS;
  const windowStart = Math.floor(now / windowMs) * windowMs;

  // Look up existing rate limit record
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key_and_type", (q) => q.eq("key", key).eq("type", type))
    .first();

  if (existing) {
    // Check if we're in the same window
    if (existing.windowStart === windowStart) {
      // Same window - check if limit exceeded
      if (existing.count >= limit) {
        const retryAfterMs = windowStart + windowMs - now;
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
          remainingRequests: 0,
        };
      }

      // Increment count
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
      });

      return {
        allowed: true,
        remainingRequests: limit - existing.count - 1,
      };
    } else {
      // New window - reset count
      await ctx.db.patch(existing._id, {
        windowStart,
        count: 1,
      });

      return {
        allowed: true,
        remainingRequests: limit - 1,
      };
    }
  } else {
    // No existing record - create new one
    await ctx.db.insert("rateLimits", {
      key,
      type,
      windowStart,
      count: 1,
    });

    return {
      allowed: true,
      remainingRequests: limit - 1,
    };
  }
}

/**
 * Check multiple rate limits at once.
 * Returns the first limit that is exceeded, or allows if all pass.
 */
export async function checkMultipleRateLimits(
  ctx: MutationCtx,
  checks: Array<{ key: string; type: "minute" | "hour"; limit: number }>
): Promise<RateLimitResult> {
  for (const check of checks) {
    const result = await checkRateLimit(ctx, check.key, check.type, check.limit);
    if (!result.allowed) {
      return result;
    }
  }

  return { allowed: true };
}

/**
 * Cleanup expired rate limit records.
 * Should be called periodically via cron.
 */
export const cleanupRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Remove records older than 2 hours (safe cleanup window)
    const threshold = now - 2 * HOUR_MS;

    const oldRecords = await ctx.db
      .query("rateLimits")
      .withIndex("by_window_start", (q) => q.lt("windowStart", threshold))
      .collect();

    for (const record of oldRecords) {
      await ctx.db.delete(record._id);
    }

    return { deleted: oldRecords.length };
  },
});
