import { mutation, query, internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";

// Token expiry times
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_LENGTH = 6; // 6-digit verification code for desktop

// Initialize Resend component
// Note: testMode defaults to true, set to false in production via RESEND_TEST_MODE env var
export const resend = new Resend(components.resend, {});

// Generate a cryptographically random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Hash a token using SHA-256 for secure storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a 6-digit verification code for desktop/manual entry
function generateCode(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const num = (array[0] << 24 | array[1] << 16 | array[2] << 8 | array[3]) >>> 0;
  return String(num % 1000000).padStart(CODE_LENGTH, "0");
}

// Rate limiting: minimum time between magic link requests per email
const EMAIL_RATE_LIMIT_MS = 60 * 1000; // 1 minute between requests

/**
 * Send a magic link to the user's email
 */
export const sendMagicLink = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    // Basic email validation
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error("Invalid email address");
    }

    // Rate limiting: check for recent unused token for this email
    // If one exists and isn't expired, don't send another email
    // Use .order("desc") to get the NEWEST token first for accurate rate limiting
    const recentToken = await ctx.db
      .query("authTokens")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("used"), false),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .first();

    // If a valid token was sent recently, silently succeed to prevent enumeration
    // but don't send another email (rate limiting)
    if (recentToken) {
      const tokenAge = Date.now() - (recentToken.expiresAt - MAGIC_LINK_EXPIRY_MS);
      if (tokenAge < EMAIL_RATE_LIMIT_MS) {
        // Token is less than 1 minute old, don't send another
        return { success: true };
      }
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

    // Find or create user
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", authToken.email))
      .first();

    if (!user) {
      // Create new user
      const userId = await ctx.db.insert("users", {
        email: authToken.email,
        name: authToken.email.split("@")[0], // Default name from email
        isTemp: false, // Real authenticated user
      });
      user = await ctx.db.get(userId);
    } else if (user.isTemp) {
      // Upgrade temp user to authenticated
      await ctx.db.patch(user._id, { isTemp: false });
    }

    // Create session with hashed token
    const sessionToken = generateToken();
    const sessionTokenHash = await hashToken(sessionToken);
    const sessionExpiresAt = Date.now() + SESSION_EXPIRY_MS;

    await ctx.db.insert("sessions", {
      userId: user!._id,
      token: sessionTokenHash, // Store hash, not raw token
      expiresAt: sessionExpiresAt,
    });

    // Return raw token to client (they'll use it for auth, we'll hash to verify)
    return {
      sessionToken,
      user: {
        id: user!._id,
        email: user!.email,
        name: user!.name,
      },
    };
  },
});

// Maximum code verification attempts before lockout
const MAX_CODE_ATTEMPTS = 5;

/**
 * Verify a 6-digit code (for desktop app where magic links don't work)
 */
export const verifyCode = mutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const code = args.code.replace(/\s/g, ""); // Remove any spaces

    // Validate code format
    if (!/^\d{6}$/.test(code)) {
      throw new Error("Invalid code format");
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
      throw new Error("Too many failed attempts. Please request a new code.");
    }

    // Find matching code among valid tokens
    const authToken = validTokens.find((t) => t.code === codeHash);

    if (!authToken) {
      // Increment attempts on all valid tokens for this email (brute-force protection)
      for (const token of validTokens) {
        await ctx.db.patch(token._id, {
          attempts: (token.attempts ?? 0) + 1,
        });
      }
      throw new Error("Invalid or expired code");
    }

    // Mark token as used
    await ctx.db.patch(authToken._id, { used: true });

    // Find or create user (same logic as verifyMagicLink)
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", authToken.email))
      .first();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        email: authToken.email,
        name: authToken.email.split("@")[0],
        isTemp: false,
      });
      user = await ctx.db.get(userId);
    } else if (user.isTemp) {
      await ctx.db.patch(user._id, { isTemp: false });
    }

    // Create session with hashed token
    const sessionToken = generateToken();
    const sessionTokenHash = await hashToken(sessionToken);
    const sessionExpiresAt = Date.now() + SESSION_EXPIRY_MS;

    await ctx.db.insert("sessions", {
      userId: user!._id,
      token: sessionTokenHash,
      expiresAt: sessionExpiresAt,
    });

    return {
      sessionToken,
      user: {
        id: user!._id,
        email: user!.email,
        name: user!.name,
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
 * Update user profile
 */
export const updateProfile = mutation({
  args: {
    sessionToken: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Hash the incoming token to verify session
    const sessionTokenHash = await hashToken(args.sessionToken);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionTokenHash))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Not authenticated");
    }

    // Update user
    const updates: { name?: string } = {};
    if (args.name) {
      updates.name = args.name;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(session.userId, updates);
    }

    return { success: true };
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

    return {
      deletedTokens: expiredTokens.length,
      deletedSessions: expiredSessions.length,
    };
  },
});
