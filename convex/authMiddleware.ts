import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { getAuthenticatedUser, hashToken } from "./authHelpers";

/**
 * Auth error types for consistent error handling
 */
export type AuthError = {
  type: "unauthorized";
  message: string;
  code: 401;
};

export type AuthResult<T> =
  | { success: true; data: T }
  | { success: false; error: AuthError };

/**
 * Create an unauthorized error response
 */
export function unauthorized(message: string = "Authentication required"): AuthError {
  return {
    type: "unauthorized",
    message,
    code: 401,
  };
}

/**
 * Context with authenticated user - passed to protected handlers
 */
export type AuthenticatedQueryCtx = QueryCtx & {
  user: Doc<"users">;
  sessionToken: string;
};

export type AuthenticatedMutationCtx = MutationCtx & {
  user: Doc<"users">;
  sessionToken: string;
};

/**
 * Wrapper for protected queries that require authentication.
 * Validates session token and provides user in context.
 *
 * Usage:
 * export const myQuery = withAuthQuery({
 *   args: { channelId: v.id("channels") },
 *   handler: async (ctx, args) => {
 *     // ctx.user is guaranteed to be defined
 *     return ctx.db.query("messages").collect();
 *   },
 * });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuthQuery(options: {
  args: Record<string, any>;
  handler: (ctx: AuthenticatedQueryCtx, args: any) => Promise<any>;
}) {
  return query({
    args: {
      ...options.args,
      sessionToken: v.string(),
    },
    handler: async (ctx, allArgs) => {
      const { sessionToken, ...restArgs } = allArgs;

      const user = await getAuthenticatedUser(ctx, sessionToken);

      if (!user) {
        throw new Error("Unauthorized: Invalid or expired session");
      }

      const authCtx: AuthenticatedQueryCtx = {
        ...ctx,
        user,
        sessionToken,
      };

      return options.handler(authCtx, restArgs);
    },
  });
}

/**
 * Wrapper for protected mutations that require authentication.
 * Validates session token and provides user in context.
 *
 * Usage:
 * export const myMutation = withAuthMutation({
 *   args: { body: v.string() },
 *   handler: async (ctx, args) => {
 *     // ctx.user is guaranteed to be defined
 *     await ctx.db.insert("messages", { userId: ctx.user._id, ... });
 *   },
 * });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuthMutation(options: {
  args: Record<string, any>;
  handler: (ctx: AuthenticatedMutationCtx, args: any) => Promise<any>;
}) {
  return mutation({
    args: {
      ...options.args,
      sessionToken: v.string(),
    },
    handler: async (ctx, allArgs) => {
      const { sessionToken, ...restArgs } = allArgs;

      const user = await getAuthenticatedUser(ctx, sessionToken);

      if (!user) {
        throw new Error("Unauthorized: Invalid or expired session");
      }

      const authCtx: AuthenticatedMutationCtx = {
        ...ctx,
        user,
        sessionToken,
      };

      return options.handler(authCtx, restArgs);
    },
  });
}

/**
 * Optional auth wrapper - allows unauthenticated access but provides user if available.
 * Useful for queries that show different data based on auth status.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withOptionalAuthQuery(options: {
  args: Record<string, any>;
  handler: (ctx: QueryCtx & { user: Doc<"users"> | null }, args: any) => Promise<any>;
}) {
  return query({
    args: {
      ...options.args,
      sessionToken: v.optional(v.string()),
    },
    handler: async (ctx, allArgs) => {
      const { sessionToken, ...restArgs } = allArgs;

      const user = sessionToken
        ? await getAuthenticatedUser(ctx, sessionToken)
        : null;

      const authCtx = {
        ...ctx,
        user,
      };

      return options.handler(authCtx, restArgs);
    },
  });
}

/**
 * Validate session without returning user - for lightweight session checks.
 * Returns true if session is valid, false otherwise.
 */
export async function isValidSession(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined
): Promise<boolean> {
  if (!sessionToken) {
    return false;
  }

  const sessionTokenHash = await hashToken(sessionToken);

  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionTokenHash))
    .first();

  return session !== null && session.expiresAt > Date.now();
}
