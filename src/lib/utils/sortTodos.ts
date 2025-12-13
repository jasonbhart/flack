import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Todo item with owner information for sorting
 */
export interface TodoWithOwner {
  _id: Id<"channelTodos">;
  channelId: Id<"channels">;
  text: string;
  completed: boolean;
  createdBy: Id<"users">;
  createdAt: number;
  completedBy?: Id<"users">;
  completedAt?: number;
  ownerId?: Id<"users">;
  dueDate?: number;
  owner?: {
    _id: Id<"users">;
    name: string;
    avatarUrl?: string;
  } | null;
  creator: {
    _id: Id<"users">;
    name: string;
  };
}

/**
 * Get ownership priority for sorting:
 * - 0: Owned by current user (highest priority)
 * - 1: Unassigned (medium priority)
 * - 2: Owned by others (lowest priority)
 */
function getOwnerPriority(
  ownerId: Id<"users"> | undefined,
  currentUserId: Id<"users"> | null
): number {
  if (!currentUserId) return 1; // If no current user, treat all as unassigned priority
  if (ownerId === currentUserId) return 0; // Mine first
  if (ownerId == null) return 1; // Unassigned second
  return 2; // Others third
}

/**
 * Sort todos by the following priority:
 *
 * Level 1 - Ownership:
 *   - Todos owned by current user appear first
 *   - Todos with no owner (unassigned) appear second
 *   - Todos owned by others appear third
 *
 * Level 2 - Due date presence (within each ownership group):
 *   - Todos WITH due dates appear before todos WITHOUT due dates
 *
 * Level 3 - Due date / creation time:
 *   - Todos WITH due dates are sorted ascending (earliest due first)
 *   - Todos WITHOUT due dates are sorted by creation time descending (newest first)
 *
 * @param todos - Array of todos to sort
 * @param currentUserId - The current user's ID (for ownership priority)
 * @returns Sorted array of todos (new array, doesn't mutate input)
 */
export function sortTodos<T extends Pick<TodoWithOwner, "ownerId" | "dueDate" | "createdAt">>(
  todos: T[],
  currentUserId: Id<"users"> | null
): T[] {
  return [...todos].sort((a, b) => {
    // Level 1: Ownership priority (mine=0, unassigned=1, others=2)
    const ownerPriorityA = getOwnerPriority(a.ownerId, currentUserId);
    const ownerPriorityB = getOwnerPriority(b.ownerId, currentUserId);
    if (ownerPriorityA !== ownerPriorityB) {
      return ownerPriorityA - ownerPriorityB;
    }

    // Level 2: Due date presence (has due date > no due date)
    const hasDueDateA = a.dueDate != null;
    const hasDueDateB = b.dueDate != null;
    if (hasDueDateA !== hasDueDateB) {
      return hasDueDateA ? -1 : 1;
    }

    // Level 3: Due date ascending OR creation time descending
    if (hasDueDateA && hasDueDateB) {
      return a.dueDate! - b.dueDate!; // Earliest due first
    }
    return b.createdAt - a.createdAt; // Newest first for no-due-date items
  });
}
