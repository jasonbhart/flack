import { v, ConvexError } from "convex/values";
import { withAuthQuery, withAuthMutation } from "./authMiddleware";
import { checkMembership } from "./channelMembers";
import type { Id, Doc } from "./_generated/dataModel";
import type { AuthenticatedQueryCtx, AuthenticatedMutationCtx } from "./authMiddleware";

/**
 * Helper to verify channel membership and throw if not a member
 */
async function requireChannelMembership(
  ctx: { db: AuthenticatedQueryCtx["db"] | AuthenticatedMutationCtx["db"] },
  channelId: Id<"channels">,
  userId: Id<"users">
): Promise<void> {
  const isMember = await checkMembership(ctx, channelId, userId);
  if (!isMember) {
    throw new ConvexError("You must be a channel member to access todos");
  }
}

/**
 * Get all todos for a channel with owner and creator details.
 * Returns todos with user information for display.
 */
export const getByChannel = withAuthQuery({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    // Verify caller is a channel member
    await requireChannelMembership(ctx, args.channelId, ctx.user._id);

    // Fetch all todos for the channel
    const todos = await ctx.db
      .query("channelTodos")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    // Batch fetch user details for owners and creators
    // Using Promise.all to avoid N+1 queries
    const todosWithUsers = await Promise.all(
      todos.map(async (todo) => {
        const [owner, creator] = await Promise.all([
          todo.ownerId ? ctx.db.get(todo.ownerId) : null,
          ctx.db.get(todo.createdBy),
        ]);

        return {
          ...todo,
          owner: owner
            ? {
                _id: owner._id,
                name: owner.name,
                avatarUrl: owner.avatarUrl,
              }
            : null,
          creator: {
            _id: creator!._id,
            name: creator!.name,
          },
        };
      })
    );

    return todosWithUsers;
  },
});

/**
 * Create a new todo in a channel.
 * Only channel members can create todos.
 */
export const create = withAuthMutation({
  args: {
    channelId: v.id("channels"),
    text: v.string(),
    ownerId: v.optional(v.id("users")),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify caller is a channel member
    await requireChannelMembership(ctx, args.channelId, ctx.user._id);

    // Validate text
    const text = args.text.trim();
    if (!text) {
      throw new ConvexError("Todo text cannot be empty");
    }
    if (text.length > 500) {
      throw new ConvexError("Todo text must be under 500 characters");
    }

    // Validate owner is a channel member (if provided)
    if (args.ownerId) {
      const isOwnerMember = await checkMembership(ctx, args.channelId, args.ownerId);
      if (!isOwnerMember) {
        throw new ConvexError("Owner must be a channel member");
      }
    }

    // Create the todo
    return await ctx.db.insert("channelTodos", {
      channelId: args.channelId,
      text,
      completed: false,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
      ownerId: args.ownerId,
      dueDate: args.dueDate,
    });
  },
});

/**
 * Update a todo's text, owner, or due date.
 * Only channel members can update todos.
 */
export const update = withAuthMutation({
  args: {
    todoId: v.id("channelTodos"),
    text: v.optional(v.string()),
    ownerId: v.optional(v.union(v.id("users"), v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    // Get the todo
    const todo = await ctx.db.get(args.todoId) as Doc<"channelTodos"> | null;
    if (!todo) {
      throw new ConvexError("Todo not found");
    }

    // Verify caller is a channel member
    await requireChannelMembership(ctx, todo.channelId, ctx.user._id);

    // Build update object
    const updates: {
      text?: string;
      ownerId?: Id<"users"> | undefined;
      dueDate?: number | undefined;
    } = {};

    // Validate and set text
    if (args.text !== undefined) {
      const text = args.text.trim();
      if (!text) {
        throw new ConvexError("Todo text cannot be empty");
      }
      if (text.length > 500) {
        throw new ConvexError("Todo text must be under 500 characters");
      }
      updates.text = text;
    }

    // Validate and set owner
    if (args.ownerId !== undefined) {
      if (args.ownerId !== null) {
        const isOwnerMember = await checkMembership(ctx, todo.channelId, args.ownerId);
        if (!isOwnerMember) {
          throw new ConvexError("Owner must be a channel member");
        }
        updates.ownerId = args.ownerId;
      } else {
        updates.ownerId = undefined; // Clear owner
      }
    }

    // Set due date
    if (args.dueDate !== undefined) {
      updates.dueDate = args.dueDate === null ? undefined : args.dueDate;
    }

    // Apply updates
    await ctx.db.patch(args.todoId, updates);
  },
});

/**
 * Toggle a todo's completed status.
 * Records who completed it and when.
 */
export const toggle = withAuthMutation({
  args: {
    todoId: v.id("channelTodos"),
  },
  handler: async (ctx, args) => {
    // Get the todo
    const todo = await ctx.db.get(args.todoId) as Doc<"channelTodos"> | null;
    if (!todo) {
      throw new ConvexError("Todo not found");
    }

    // Verify caller is a channel member
    await requireChannelMembership(ctx, todo.channelId, ctx.user._id);

    if (todo.completed) {
      // Un-complete: clear completion metadata
      await ctx.db.patch(args.todoId, {
        completed: false,
        completedBy: undefined,
        completedAt: undefined,
      });
    } else {
      // Complete: record who and when
      await ctx.db.patch(args.todoId, {
        completed: true,
        completedBy: ctx.user._id,
        completedAt: Date.now(),
      });
    }
  },
});

/**
 * Delete a todo.
 * Only the creator or channel owner/admin can delete.
 */
export const deleteTodo = withAuthMutation({
  args: {
    todoId: v.id("channelTodos"),
  },
  handler: async (ctx, args) => {
    // Get the todo
    const todo = await ctx.db.get(args.todoId) as Doc<"channelTodos"> | null;
    if (!todo) {
      throw new ConvexError("Todo not found");
    }

    // Verify caller is a channel member
    await requireChannelMembership(ctx, todo.channelId, ctx.user._id);

    // Check permissions: creator OR admin/owner can delete
    const isCreator = todo.createdBy === ctx.user._id;

    if (!isCreator) {
      // Check if user is admin/owner
      const membership = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel_and_user", (q) =>
          q.eq("channelId", todo.channelId).eq("userId", ctx.user._id)
        )
        .first();

      const isAdmin = membership?.role === "owner" || membership?.role === "admin";

      if (!isAdmin) {
        throw new ConvexError("Only the creator or an admin can delete this todo");
      }
    }

    // Delete the todo
    await ctx.db.delete(args.todoId);
  },
});
