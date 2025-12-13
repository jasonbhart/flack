import { describe, it, expect } from "vitest";
import { sortTodos } from "./sortTodos";
import type { Id } from "../../../convex/_generated/dataModel";

// Helper to create mock user IDs
const mockUserId = (id: string) => id as Id<"users">;

// Helper to create minimal todo objects for testing
function createTodo(overrides: {
  ownerId?: Id<"users">;
  dueDate?: number;
  createdAt: number;
}) {
  return {
    ownerId: overrides.ownerId,
    dueDate: overrides.dueDate,
    createdAt: overrides.createdAt,
  };
}

describe("sortTodos", () => {
  const currentUserId = mockUserId("user-current");
  const otherUserId = mockUserId("user-other");

  describe("empty array handling", () => {
    it("returns empty array for empty input", () => {
      const result = sortTodos([], currentUserId);
      expect(result).toEqual([]);
    });

    it("does not mutate original array", () => {
      const todos = [createTodo({ createdAt: 1000 })];
      const original = [...todos];
      sortTodos(todos, currentUserId);
      expect(todos).toEqual(original);
    });
  });

  describe("null currentUserId handling", () => {
    it("handles null currentUserId gracefully", () => {
      const todos = [
        createTodo({ ownerId: mockUserId("user-a"), createdAt: 1000 }),
        createTodo({ createdAt: 2000 }),
      ];
      // Should not throw
      const result = sortTodos(todos, null);
      expect(result).toHaveLength(2);
    });

    it("treats all todos as unassigned priority when currentUserId is null", () => {
      const todos = [
        createTodo({ ownerId: mockUserId("user-a"), createdAt: 1000 }),
        createTodo({ createdAt: 2000 }),
        createTodo({ ownerId: mockUserId("user-b"), createdAt: 3000 }),
      ];
      const result = sortTodos(todos, null);
      // All should have same ownership priority, so sorted by due date then createdAt
      // No due dates, so sorted by createdAt descending (newest first)
      expect(result[0].createdAt).toBe(3000);
      expect(result[1].createdAt).toBe(2000);
      expect(result[2].createdAt).toBe(1000);
    });
  });

  describe("ownership priority (Level 1)", () => {
    it("sorts current user's todos before unassigned", () => {
      const todos = [
        createTodo({ createdAt: 1000 }), // unassigned
        createTodo({ ownerId: currentUserId, createdAt: 2000 }), // mine
      ];
      const result = sortTodos(todos, currentUserId);
      expect(result[0].ownerId).toBe(currentUserId);
      expect(result[1].ownerId).toBeUndefined();
    });

    it("sorts unassigned todos before others' todos", () => {
      const todos = [
        createTodo({ ownerId: otherUserId, createdAt: 1000 }), // other's
        createTodo({ createdAt: 2000 }), // unassigned
      ];
      const result = sortTodos(todos, currentUserId);
      expect(result[0].ownerId).toBeUndefined();
      expect(result[1].ownerId).toBe(otherUserId);
    });

    it("sorts mine > unassigned > others", () => {
      const todos = [
        createTodo({ ownerId: otherUserId, createdAt: 1000 }), // other's
        createTodo({ createdAt: 2000 }), // unassigned
        createTodo({ ownerId: currentUserId, createdAt: 3000 }), // mine
      ];
      const result = sortTodos(todos, currentUserId);
      expect(result[0].ownerId).toBe(currentUserId); // mine first
      expect(result[1].ownerId).toBeUndefined(); // unassigned second
      expect(result[2].ownerId).toBe(otherUserId); // others last
    });

    it("handles multiple todos in each ownership category", () => {
      const todos = [
        createTodo({ ownerId: otherUserId, createdAt: 1000 }),
        createTodo({ ownerId: otherUserId, createdAt: 1500 }),
        createTodo({ createdAt: 2000 }),
        createTodo({ createdAt: 2500 }),
        createTodo({ ownerId: currentUserId, createdAt: 3000 }),
        createTodo({ ownerId: currentUserId, createdAt: 3500 }),
      ];
      const result = sortTodos(todos, currentUserId);
      // First two should be mine
      expect(result[0].ownerId).toBe(currentUserId);
      expect(result[1].ownerId).toBe(currentUserId);
      // Next two should be unassigned
      expect(result[2].ownerId).toBeUndefined();
      expect(result[3].ownerId).toBeUndefined();
      // Last two should be others
      expect(result[4].ownerId).toBe(otherUserId);
      expect(result[5].ownerId).toBe(otherUserId);
    });
  });

  describe("due date presence (Level 2)", () => {
    it("sorts todos with due dates before todos without due dates", () => {
      const todos = [
        createTodo({ ownerId: currentUserId, createdAt: 1000 }), // no due date
        createTodo({ ownerId: currentUserId, dueDate: 5000, createdAt: 2000 }), // has due date
      ];
      const result = sortTodos(todos, currentUserId);
      expect(result[0].dueDate).toBe(5000);
      expect(result[1].dueDate).toBeUndefined();
    });

    it("applies due date presence within each ownership group", () => {
      const todos = [
        createTodo({ ownerId: currentUserId, createdAt: 1000 }), // mine, no date
        createTodo({ ownerId: currentUserId, dueDate: 5000, createdAt: 2000 }), // mine, has date
        createTodo({ createdAt: 3000 }), // unassigned, no date
        createTodo({ dueDate: 6000, createdAt: 4000 }), // unassigned, has date
      ];
      const result = sortTodos(todos, currentUserId);
      // Mine with due date first
      expect(result[0].ownerId).toBe(currentUserId);
      expect(result[0].dueDate).toBe(5000);
      // Mine without due date second
      expect(result[1].ownerId).toBe(currentUserId);
      expect(result[1].dueDate).toBeUndefined();
      // Unassigned with due date third
      expect(result[2].ownerId).toBeUndefined();
      expect(result[2].dueDate).toBe(6000);
      // Unassigned without due date last
      expect(result[3].ownerId).toBeUndefined();
      expect(result[3].dueDate).toBeUndefined();
    });
  });

  describe("due date ordering (Level 3 - with due dates)", () => {
    it("sorts due dates in ascending order (earliest first)", () => {
      const todos = [
        createTodo({ ownerId: currentUserId, dueDate: 3000, createdAt: 1000 }),
        createTodo({ ownerId: currentUserId, dueDate: 1000, createdAt: 2000 }),
        createTodo({ ownerId: currentUserId, dueDate: 2000, createdAt: 3000 }),
      ];
      const result = sortTodos(todos, currentUserId);
      expect(result[0].dueDate).toBe(1000);
      expect(result[1].dueDate).toBe(2000);
      expect(result[2].dueDate).toBe(3000);
    });

    it("handles same due dates by maintaining relative order", () => {
      const sameDueDate = 5000;
      const todos = [
        createTodo({ ownerId: currentUserId, dueDate: sameDueDate, createdAt: 1000 }),
        createTodo({ ownerId: currentUserId, dueDate: sameDueDate, createdAt: 2000 }),
      ];
      const result = sortTodos(todos, currentUserId);
      // Both have same due date, order depends on sort stability
      expect(result[0].dueDate).toBe(sameDueDate);
      expect(result[1].dueDate).toBe(sameDueDate);
    });
  });

  describe("creation time ordering (Level 3 - without due dates)", () => {
    it("sorts by creation time descending (newest first) when no due dates", () => {
      const todos = [
        createTodo({ ownerId: currentUserId, createdAt: 1000 }),
        createTodo({ ownerId: currentUserId, createdAt: 3000 }),
        createTodo({ ownerId: currentUserId, createdAt: 2000 }),
      ];
      const result = sortTodos(todos, currentUserId);
      expect(result[0].createdAt).toBe(3000); // newest first
      expect(result[1].createdAt).toBe(2000);
      expect(result[2].createdAt).toBe(1000); // oldest last
    });
  });

  describe("complex sorting scenarios", () => {
    it("correctly sorts a mixed set of todos", () => {
      const todos = [
        createTodo({ ownerId: otherUserId, dueDate: 1000, createdAt: 100 }), // other, due 1000
        createTodo({ createdAt: 200 }), // unassigned, no date
        createTodo({ ownerId: currentUserId, createdAt: 300 }), // mine, no date
        createTodo({ ownerId: currentUserId, dueDate: 2000, createdAt: 400 }), // mine, due 2000
        createTodo({ dueDate: 500, createdAt: 500 }), // unassigned, due 500
        createTodo({ ownerId: currentUserId, dueDate: 1000, createdAt: 600 }), // mine, due 1000
      ];
      const result = sortTodos(todos, currentUserId);

      // Mine with due dates first, sorted by due date ascending
      expect(result[0].ownerId).toBe(currentUserId);
      expect(result[0].dueDate).toBe(1000);
      expect(result[1].ownerId).toBe(currentUserId);
      expect(result[1].dueDate).toBe(2000);

      // Mine without due dates, sorted by createdAt descending
      expect(result[2].ownerId).toBe(currentUserId);
      expect(result[2].dueDate).toBeUndefined();

      // Unassigned with due dates
      expect(result[3].ownerId).toBeUndefined();
      expect(result[3].dueDate).toBe(500);

      // Unassigned without due dates
      expect(result[4].ownerId).toBeUndefined();
      expect(result[4].dueDate).toBeUndefined();

      // Others with due dates
      expect(result[5].ownerId).toBe(otherUserId);
      expect(result[5].dueDate).toBe(1000);
    });
  });
});
