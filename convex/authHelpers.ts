import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Hash a token using SHA-256 for secure comparison
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get authenticated user from session token
 * Returns the user if valid session, null otherwise
 */
export async function getAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined
): Promise<Doc<"users"> | null> {
  if (!sessionToken) {
    return null;
  }

  const sessionTokenHash = await hashToken(sessionToken);

  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionTokenHash))
    .first();

  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  const user = await ctx.db.get(session.userId);
  return user;
}
