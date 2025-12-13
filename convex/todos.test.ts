import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// Helper to create a user with a valid session
async function createAuthenticatedUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  email: string
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name, email, nameLower: name.toLowerCase() });
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

describe("todos", () => {
  describe("getByChannel", () => {
    it("returns todos for channel member", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      // Create channel
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      // Create a todo directly in DB
      await t.run(async (ctx) => {
        await ctx.db.insert("channelTodos", {
          channelId,
          text: "Test todo",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      // Query todos
      const todos = await t.query(api.todos.getByChannel, {
        sessionToken,
        channelId,
      });

      expect(todos).toHaveLength(1);
      expect(todos[0].text).toBe("Test todo");
      expect(todos[0].creator.name).toBe("Alice");
    });

    it("rejects non-member access", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      await expect(
        t.query(api.todos.getByChannel, {
          sessionToken: outsiderToken,
          channelId,
        })
      ).rejects.toThrow("channel member");
    });

    it("rejects unauthenticated access", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      await expect(
        t.query(api.todos.getByChannel, {
          sessionToken: "invalid-token",
          channelId,
        })
      ).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("creates todo for channel member", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.mutation(api.todos.create, {
        sessionToken,
        channelId,
        text: "Buy groceries",
      });

      expect(todoId).toBeDefined();

      // Verify the todo was created correctly
      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.text).toBe("Buy groceries");
      expect(todo?.completed).toBe(false);
      expect(todo?.createdBy).toBe(userId);
      expect(todo?.channelId).toBe(channelId);
    });

    it("creates todo with owner and due date", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const dueDate = Date.now() + 86400000; // Tomorrow
      const todoId = await t.mutation(api.todos.create, {
        sessionToken,
        channelId,
        text: "Complete report",
        ownerId: userId,
        dueDate,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.ownerId).toBe(userId);
      expect(todo?.dueDate).toBe(dueDate);
    });

    it("rejects empty text", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      await expect(
        t.mutation(api.todos.create, {
          sessionToken,
          channelId,
          text: "",
        })
      ).rejects.toThrow("cannot be empty");
    });

    it("rejects whitespace-only text", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      await expect(
        t.mutation(api.todos.create, {
          sessionToken,
          channelId,
          text: "   ",
        })
      ).rejects.toThrow("cannot be empty");
    });

    it("rejects text over 500 characters", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const longText = "a".repeat(501);
      await expect(
        t.mutation(api.todos.create, {
          sessionToken,
          channelId,
          text: longText,
        })
      ).rejects.toThrow("under 500 characters");
    });

    it("accepts text exactly 500 characters", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const text500 = "a".repeat(500);
      const todoId = await t.mutation(api.todos.create, {
        sessionToken,
        channelId,
        text: text500,
      });

      expect(todoId).toBeDefined();
    });

    it("rejects owner who is not a channel member", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: outsiderId } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      await expect(
        t.mutation(api.todos.create, {
          sessionToken,
          channelId,
          text: "Test task",
          ownerId: outsiderId,
        })
      ).rejects.toThrow("Owner must be a channel member");
    });

    it("rejects non-member from creating todos", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      await expect(
        t.mutation(api.todos.create, {
          sessionToken: outsiderToken,
          channelId,
          text: "Unauthorized todo",
        })
      ).rejects.toThrow("channel member");
    });
  });

  describe("update", () => {
    it("updates todo text", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      // Create todo
      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Original text",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      // Update text
      await t.mutation(api.todos.update, {
        sessionToken,
        todoId,
        text: "Updated text",
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.text).toBe("Updated text");
    });

    it("allows partial updates - only text", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const originalDueDate = Date.now() + 86400000;
      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Original",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
          ownerId: userId,
          dueDate: originalDueDate,
        });
      });

      // Update only text
      await t.mutation(api.todos.update, {
        sessionToken,
        todoId,
        text: "New text",
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.text).toBe("New text");
      expect(todo?.ownerId).toBe(userId); // Unchanged
      expect(todo?.dueDate).toBe(originalDueDate); // Unchanged
    });

    it("allows partial updates - only owner", async () => {
      const t = convexTest(schema, modules);
      const { userId: aliceId, sessionToken: aliceToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: aliceToken,
        name: "test-channel",
      });

      // Add Bob as member
      const { token: inviteToken } = await t.mutation(
        api.channelInvites.create,
        {
          sessionToken: aliceToken,
          channelId,
        }
      );
      await t.mutation(api.channelInvites.redeem, {
        sessionToken: bobToken,
        token: inviteToken,
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Task for Bob",
          completed: false,
          createdBy: aliceId,
          createdAt: Date.now(),
        });
      });

      // Update only owner
      await t.mutation(api.todos.update, {
        sessionToken: aliceToken,
        todoId,
        ownerId: bobId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.text).toBe("Task for Bob"); // Unchanged
      expect(todo?.ownerId).toBe(bobId); // Updated
    });

    it("allows partial updates - only due date", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Original task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      const newDueDate = Date.now() + 172800000; // 2 days from now
      await t.mutation(api.todos.update, {
        sessionToken,
        todoId,
        dueDate: newDueDate,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.text).toBe("Original task"); // Unchanged
      expect(todo?.dueDate).toBe(newDueDate); // Updated
    });

    it("clears owner when set to null", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Assigned task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
          ownerId: userId,
        });
      });

      // Clear owner
      await t.mutation(api.todos.update, {
        sessionToken,
        todoId,
        ownerId: null,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.ownerId).toBeUndefined();
    });

    it("clears due date when set to null", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Dated task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
          dueDate: Date.now() + 86400000,
        });
      });

      // Clear due date
      await t.mutation(api.todos.update, {
        sessionToken,
        todoId,
        dueDate: null,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.dueDate).toBeUndefined();
    });

    it("rejects update with empty text", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Valid text",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.todos.update, {
          sessionToken,
          todoId,
          text: "",
        })
      ).rejects.toThrow("cannot be empty");
    });

    it("rejects update with text over 500 characters", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Valid text",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.todos.update, {
          sessionToken,
          todoId,
          text: "a".repeat(501),
        })
      ).rejects.toThrow("under 500 characters");
    });

    it("rejects owner update to non-member", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: outsiderId } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.todos.update, {
          sessionToken,
          todoId,
          ownerId: outsiderId,
        })
      ).rejects.toThrow("Owner must be a channel member");
    });

    it("rejects non-member from updating", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.todos.update, {
          sessionToken: outsiderToken,
          todoId,
          text: "Hacked text",
        })
      ).rejects.toThrow("channel member");
    });

    it("rejects update for non-existent todo", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      // Create a todo ID that doesn't exist
      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      // Create and delete a todo to get a valid but non-existent ID format
      const todoId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("channelTodos", {
          channelId,
          text: "Temp",
          completed: false,
          createdBy: (await ctx.db.query("users").first())!._id,
          createdAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.mutation(api.todos.update, {
          sessionToken,
          todoId,
          text: "Updated",
        })
      ).rejects.toThrow("not found");
    });
  });

  describe("toggle", () => {
    it("marks incomplete todo as complete", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Incomplete task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await t.mutation(api.todos.toggle, {
        sessionToken,
        todoId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.completed).toBe(true);
      expect(todo?.completedBy).toBe(userId);
      expect(todo?.completedAt).toBeDefined();
    });

    it("marks complete todo as incomplete", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Complete task",
          completed: true,
          createdBy: userId,
          createdAt: Date.now(),
          completedBy: userId,
          completedAt: Date.now(),
        });
      });

      await t.mutation(api.todos.toggle, {
        sessionToken,
        todoId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.completed).toBe(false);
      expect(todo?.completedBy).toBeUndefined();
      expect(todo?.completedAt).toBeUndefined();
    });

    it("allows any channel member to toggle", async () => {
      const t = convexTest(schema, modules);
      const { userId: aliceId, sessionToken: aliceToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: aliceToken,
        name: "test-channel",
      });

      // Add Bob
      const { token: inviteToken } = await t.mutation(
        api.channelInvites.create,
        {
          sessionToken: aliceToken,
          channelId,
        }
      );
      await t.mutation(api.channelInvites.redeem, {
        sessionToken: bobToken,
        token: inviteToken,
      });

      // Alice creates todo
      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Alice's task",
          completed: false,
          createdBy: aliceId,
          createdAt: Date.now(),
        });
      });

      // Bob toggles Alice's todo
      await t.mutation(api.todos.toggle, {
        sessionToken: bobToken,
        todoId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo?.completed).toBe(true);
      expect(todo?.completedBy).toBe(bobId);
    });

    it("rejects non-member from toggling", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.todos.toggle, {
          sessionToken: outsiderToken,
          todoId,
        })
      ).rejects.toThrow("channel member");
    });

    it("rejects toggle for non-existent todo", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("channelTodos", {
          channelId,
          text: "Temp",
          completed: false,
          createdBy: (await ctx.db.query("users").first())!._id,
          createdAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.mutation(api.todos.toggle, {
          sessionToken,
          todoId,
        })
      ).rejects.toThrow("not found");
    });
  });

  describe("deleteTodo", () => {
    it("allows creator to delete their todo", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "My task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await t.mutation(api.todos.deleteTodo, {
        sessionToken,
        todoId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo).toBeNull();
    });

    it("allows channel owner to delete any todo", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      // Add Bob as member
      const { token: inviteToken } = await t.mutation(
        api.channelInvites.create,
        {
          sessionToken: ownerToken,
          channelId,
        }
      );
      await t.mutation(api.channelInvites.redeem, {
        sessionToken: bobToken,
        token: inviteToken,
      });

      // Bob creates a todo
      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Bob's task",
          completed: false,
          createdBy: bobId,
          createdAt: Date.now(),
        });
      });

      // Alice (owner) deletes Bob's todo
      await t.mutation(api.todos.deleteTodo, {
        sessionToken: ownerToken,
        todoId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo).toBeNull();
    });

    it("allows channel admin to delete any todo", async () => {
      const t = convexTest(schema, modules);
      const { userId: aliceId, sessionToken: aliceToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");
      const { userId: charlieId, sessionToken: charlieToken } =
        await createAuthenticatedUser(t, "Charlie", "charlie@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: aliceToken,
        name: "test-channel",
      });

      // Add Bob as admin
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: bobId,
          role: "admin",
          joinedAt: Date.now(),
        });
      });

      // Add Charlie as member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: charlieId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Charlie creates a todo
      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Charlie's task",
          completed: false,
          createdBy: charlieId,
          createdAt: Date.now(),
        });
      });

      // Bob (admin) deletes Charlie's todo
      await t.mutation(api.todos.deleteTodo, {
        sessionToken: bobToken,
        todoId,
      });

      const todo = await t.run(async (ctx) => {
        return await ctx.db.get(todoId);
      });

      expect(todo).toBeNull();
    });

    it("prevents regular member from deleting others' todos", async () => {
      const t = convexTest(schema, modules);
      const { userId: aliceId, sessionToken: aliceToken } =
        await createAuthenticatedUser(t, "Alice", "alice@example.com");
      const { userId: bobId, sessionToken: bobToken } =
        await createAuthenticatedUser(t, "Bob", "bob@example.com");

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: aliceToken,
        name: "test-channel",
      });

      // Add Bob as regular member
      await t.run(async (ctx) => {
        await ctx.db.insert("channelMembers", {
          channelId,
          userId: bobId,
          role: "member",
          joinedAt: Date.now(),
        });
      });

      // Alice creates a todo
      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Alice's task",
          completed: false,
          createdBy: aliceId,
          createdAt: Date.now(),
        });
      });

      // Bob (member) tries to delete Alice's todo
      await expect(
        t.mutation(api.todos.deleteTodo, {
          sessionToken: bobToken,
          todoId,
        })
      ).rejects.toThrow("Only the creator or an admin");
    });

    it("rejects non-member from deleting", async () => {
      const t = convexTest(schema, modules);
      const { userId, sessionToken: ownerToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );
      const { sessionToken: outsiderToken } = await createAuthenticatedUser(
        t,
        "Bob",
        "bob@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken: ownerToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        return await ctx.db.insert("channelTodos", {
          channelId,
          text: "Task",
          completed: false,
          createdBy: userId,
          createdAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.todos.deleteTodo, {
          sessionToken: outsiderToken,
          todoId,
        })
      ).rejects.toThrow("channel member");
    });

    it("rejects delete for non-existent todo", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await createAuthenticatedUser(
        t,
        "Alice",
        "alice@example.com"
      );

      const { channelId } = await t.mutation(api.channels.create, {
        sessionToken,
        name: "test-channel",
      });

      const todoId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("channelTodos", {
          channelId,
          text: "Temp",
          completed: false,
          createdBy: (await ctx.db.query("users").first())!._id,
          createdAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.mutation(api.todos.deleteTodo, {
          sessionToken,
          todoId,
        })
      ).rejects.toThrow("not found");
    });
  });
});
