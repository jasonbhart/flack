import { mutation, query, internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import { withAuthMutation } from "./authMiddleware";
import { checkRateLimit, checkMultipleRateLimits, RATE_LIMITS } from "./rateLimiter";
import { hashToken, normalizeEmail } from "./authHelpers";

// Token expiry times
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_LENGTH = 6; // 6-digit verification code for desktop

// Initialize Resend component
// testMode defaults to true for safety (works with any email in dev)
// Set RESEND_TEST_MODE=false in production with a verified domain
const isTestMode = process.env.RESEND_TEST_MODE !== "false";
export const resend = new Resend(components.resend, {
  testMode: isTestMode,
});

// Generate a cryptographically random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}


// Generate a 6-digit verification code for desktop/manual entry
function generateCode(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const num = (array[0] << 24 | array[1] << 16 | array[2] << 8 | array[3]) >>> 0;
  return String(num % 1000000).padStart(CODE_LENGTH, "0");
}


/**
 * Get or create a user by email.
 *
 * Race condition handling: Convex uses serializable transactions.
 * If two requests try to create the same user simultaneously:
 * 1. First transaction reads null, inserts user, commits
 * 2. Second transaction's read becomes invalid (phantom read detected)
 * 3. Convex automatically retries second transaction, which now finds the user
 *
 * Note: Convex doesn't enforce unique constraints on non-ID fields.
 * We rely on transaction retries for correctness. For strict uniqueness,
 * consider using email as a document ID in a separate lookup table.
 *
 * For new users, also creates a default #general channel with the user as owner.
 */
async function getOrCreateUser(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  email: string,
  options: { upgradeTemp?: boolean } = {}
): Promise<{ user: import("./_generated/dataModel").Doc<"users">; isNewUser: boolean }> {
  // Try to find existing user
  let user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (user) {
    // If upgrading temp user to authenticated
    if (options.upgradeTemp && user.isTemp) {
      await ctx.db.patch(user._id, { isTemp: false });
      user = await ctx.db.get(user._id);
    }
    return { user: user!, isNewUser: false };
  }

  // User doesn't exist - create new user
  // Convex's serializable isolation handles race conditions via automatic retry
  const userId = await ctx.db.insert("users", {
    email,
    name: email.split("@")[0], // Default name from email
    isTemp: false,
  });

  const newUser = await ctx.db.get(userId);

  // Create default #general channel for new user
  const channelId = await ctx.db.insert("channels", {
    name: "general",
    creatorId: userId,
    isDefault: true,
  });

  // Add user as owner of their default channel
  await ctx.db.insert("channelMembers", {
    channelId,
    userId,
    role: "owner",
    joinedAt: Date.now(),
  });

  return { user: newUser!, isNewUser: true };
}

/**
 * Send a magic link to the user's email.
 * Rate limited: 1/min per email, 5/hour per email, 10/min per IP.
 */
export const sendMagicLink = mutation({
  args: {
    email: v.string(),
    clientIp: v.optional(v.string()), // Optional: passed from client for IP rate limiting
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);

    // Basic email validation
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error("Invalid email address");
    }

    // Check rate limits before proceeding
    const rateLimitChecks: Array<{ key: string; type: "minute" | "hour"; limit: number }> = [
      { key: `email:${email}`, type: "minute", limit: RATE_LIMITS.magicLink.perMinutePerEmail },
      { key: `email:${email}`, type: "hour", limit: RATE_LIMITS.magicLink.perHourPerEmail },
    ];

    // Add IP rate limit if provided
    if (args.clientIp) {
      rateLimitChecks.push({
        key: `ip:${args.clientIp}`,
        type: "minute",
        limit: RATE_LIMITS.magicLink.perMinutePerIp,
      });
    }

    const rateLimitResult = await checkMultipleRateLimits(ctx, rateLimitChecks);

    if (!rateLimitResult.allowed) {
      // Return 429-style error with retry info
      // Don't reveal which limit was hit to prevent enumeration
      throw new Error(
        JSON.stringify({
          code: 429,
          message: "Too many requests. Please try again later.",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        })
      );
    }

    // Generate token (for magic link) and code (for manual entry)
    const token = generateToken();
    const code = generateCode();
    const tokenHash = await hashToken(token);
    const codeHash = await hashToken(code);
    const expiresAt = Date.now() + MAGIC_LINK_EXPIRY_MS;

    // Store hashed token and code in database (never store raw values)
    await ctx.db.insert("authTokens", {
      email,
      token: tokenHash,
      code: codeHash,
      expiresAt,
      used: false,
    });

    // Build magic link URL (raw token in URL, hashed in DB)
    const baseUrl = process.env.SITE_URL ?? "http://localhost:5173";
    // Use URL fragment (hash) instead of query param to prevent token leakage
    // in browser history, server logs, and referrer headers
    const magicLink = `${baseUrl}/auth/verify#token=${token}`;

    // Send email via Resend with both magic link and verification code
    const fromEmail = process.env.RESEND_EMAIL ?? "onboarding@resend.dev";
    await resend.sendEmail(ctx, {
      from: `Flack <${fromEmail}>`,
      to: email,
      subject: "Sign in to Flack",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">Sign in to Flack</h1>
          <p>Click the button below to sign in. This link expires in 15 minutes.</p>
          <a href="${magicLink}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Sign in to Flack
          </a>
          <div style="margin: 24px 0; padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <p style="color: #666; font-size: 14px; margin: 0 0 8px 0;">
              <strong>Using the desktop app?</strong> Enter this code:
            </p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #3B82F6; margin: 0; font-family: monospace;">
              ${code}
            </p>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this email, you can safely ignore it.
          </p>
        </div>
      `,
    });

    return { success: true };
  },
});

/**
 * Verify a magic link token and create a session
 */
export const verifyMagicLink = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Hash the incoming token to compare with stored hash
    const tokenHash = await hashToken(args.token);

    // Find the token by hash
    const authToken = await ctx.db
      .query("authTokens")
      .withIndex("by_token", (q) => q.eq("token", tokenHash))
      .first();

    if (!authToken) {
      throw new Error("Invalid or expired link");
    }

    if (authToken.used) {
      throw new Error("This link has already been used");
    }

    if (authToken.expiresAt < Date.now()) {
      throw new Error("This link has expired");
    }

    // Mark token as used
    await ctx.db.patch(authToken._id, { used: true });

    // Get or create user (handles race conditions, creates default channel for new users)
    const { user } = await getOrCreateUser(ctx, authToken.email, { upgradeTemp: true });

    // Create session with hashed token
    const sessionToken = generateToken();
    const sessionTokenHash = await hashToken(sessionToken);
    const sessionExpiresAt = Date.now() + SESSION_EXPIRY_MS;

    await ctx.db.insert("sessions", {
      userId: user._id,
      token: sessionTokenHash, // Store hash, not raw token
      expiresAt: sessionExpiresAt,
    });

    // Return raw token to client (they'll use it for auth, we'll hash to verify)
    return {
      sessionToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

// Maximum code verification attempts before lockout
const MAX_CODE_ATTEMPTS = 5;

/**
 * Verify a 6-digit code (for desktop app where magic links don't work)
 * Rate limited to prevent brute-force lockout attacks.
 *
 * IMPORTANT: Returns a result object instead of throwing errors for failures.
 * This ensures rate limit increments and attempt counters persist even on
 * failed verification (Convex rolls back all writes when mutations throw).
 */
export const verifyCode = mutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    retryAfterSeconds: v.optional(v.number()),
    sessionToken: v.optional(v.string()),
    user: v.optional(
      v.object({
        id: v.id("users"),
        email: v.string(),
        name: v.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const code = args.code.replace(/\s/g, ""); // Remove any spaces

    // Rate limit to prevent attackers from rapidly exhausting attempts
    const rateLimitResult = await checkRateLimit(
      ctx,
      `code_verify:${email}`,
      "minute",
      RATE_LIMITS.codeVerification.perMinutePerEmail
    );
    if (!rateLimitResult.allowed) {
      // Return error (don't throw) - rate limit increment already persisted
      return {
        success: false,
        error: "Too many attempts. Please try again later.",
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
      };
    }

    // Validate code format
    if (!/^\d{6}$/.test(code)) {
      // Format validation doesn't need to persist state, but return for consistency
      return { success: false, error: "Invalid code format" };
    }

    // Hash the incoming code to compare with stored hash
    const codeHash = await hashToken(code);

    // Find the most recent unused token for this email
    const authTokens = await ctx.db
      .query("authTokens")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) =>
        q.and(
          q.eq(q.field("used"), false),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .collect();

    // Check if any tokens have exceeded max attempts
    const validTokens = authTokens.filter(
      (t) => (t.attempts ?? 0) < MAX_CODE_ATTEMPTS
    );

    if (validTokens.length === 0 && authTokens.length > 0) {
      // All tokens exhausted - return error (state already persisted)
      return {
        success: false,
        error: "Too many failed attempts. Please request a new code.",
      };
    }

    // Find matching code among valid tokens
    const authToken = validTokens.find((t) => t.code === codeHash);

    if (!authToken) {
      // Brute-force protection: increment attempts only on the MOST RECENT token
      // This prevents attackers from locking out all tokens with random guesses
      // while still protecting against brute-force on the active code
      if (validTokens.length > 0) {
        // Sort by creation time (descending) and increment only the newest
        const sortedTokens = [...validTokens].sort(
          (a, b) => b._creationTime - a._creationTime
        );
        const newestToken = sortedTokens[0];
        await ctx.db.patch(newestToken._id, {
          attempts: (newestToken.attempts ?? 0) + 1,
        });
      }
      // RETURN instead of throw - ensures attempt increment persists
      return { success: false, error: "Invalid or expired code" };
    }

    // Mark token as used
    await ctx.db.patch(authToken._id, { used: true });

    // Get or create user (handles race conditions, creates default channel for new users)
    const { user } = await getOrCreateUser(ctx, authToken.email, { upgradeTemp: true });

    // Create session with hashed token
    const sessionToken = generateToken();
    const sessionTokenHash = await hashToken(sessionToken);
    const sessionExpiresAt = Date.now() + SESSION_EXPIRY_MS;

    await ctx.db.insert("sessions", {
      userId: user._id,
      token: sessionTokenHash,
      expiresAt: sessionExpiresAt,
    });

    return {
      success: true,
      sessionToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

/**
 * Get current user from session token
 */
export const getSession = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken) {
      return null;
    }

    // Hash the incoming token to compare with stored hash
    const sessionTokenHash = await hashToken(args.sessionToken);

    // Find session by hash
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionTokenHash))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    // Get user
    const user = await ctx.db.get(session.userId);
    if (!user) {
      return null;
    }

    return {
      id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  },
});

/**
 * Log out - delete session
 */
export const logout = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Hash the incoming token to find the session
    const sessionTokenHash = await hashToken(args.sessionToken);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionTokenHash))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }

    return { success: true };
  },
});

/**
 * Update user profile.
 * Uses auth middleware - users can only update their own profile.
 */
export const updateProfile = withAuthMutation({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update authenticated user's profile
    const updates: { name?: string } = {};
    if (args.name) {
      updates.name = args.name;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(ctx.user._id, updates);
    }

    return { success: true };
  },
});

/**
 * Revoke all sessions for a user (logout all devices).
 * Requires authentication - users can only revoke their own sessions.
 */
export const revokeAllSessions = withAuthMutation({
  args: {},
  handler: async (ctx, args) => {
    // Find all sessions for this user
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();

    // Delete all sessions
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    return { revokedCount: sessions.length };
  },
});

/**
 * Cleanup expired tokens and sessions (called by cron)
 */
export const cleanupAuth = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Delete expired auth tokens using index for O(log n) lookup
    const expiredTokens = await ctx.db
      .query("authTokens")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();

    for (const token of expiredTokens) {
      await ctx.db.delete(token._id);
    }

    // Delete expired sessions using index for O(log n) lookup
    const expiredSessions = await ctx.db
      .query("sessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();

    for (const session of expiredSessions) {
      await ctx.db.delete(session._id);
    }

    // Clean up orphan sessions (sessions for deleted users)
    const allSessions = await ctx.db.query("sessions").collect();
    let orphanCount = 0;
    for (const session of allSessions) {
      const user = await ctx.db.get(session.userId);
      if (!user) {
        await ctx.db.delete(session._id);
        orphanCount++;
      }
    }

    return {
      deletedTokens: expiredTokens.length,
      deletedSessions: expiredSessions.length,
      deletedOrphanSessions: orphanCount,
    };
  },
});
