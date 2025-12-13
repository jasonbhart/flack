import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Represents a channel member for todo owner selection.
 * Used by TodoList, TodoItem, TodoInput, and OwnerSelector components.
 */
export interface TodoMember {
  _id: Id<"users">;
  name: string;
  avatarUrl?: string;
}
