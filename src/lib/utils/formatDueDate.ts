/**
 * Due date status for styling purposes
 */
export type DueDateStatus = "overdue" | "today" | "upcoming" | "normal";

/**
 * Formatted due date with display text and status
 */
export interface FormattedDueDate {
  text: string;
  status: DueDateStatus;
}

/**
 * Format a due date timestamp into a human-readable string with status.
 *
 * Returns:
 * - "Overdue" (status: "overdue") - past dates
 * - "Today" (status: "today") - today's date
 * - "Tomorrow" (status: "upcoming") - tomorrow's date
 * - Weekday name like "Friday" (status: "normal") - within 7 days
 * - Formatted date like "Dec 25" (status: "normal") - beyond 7 days
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @param now - Optional current date for testing (defaults to new Date())
 * @returns Formatted due date with text and status
 */
export function formatDueDate(
  timestamp: number | undefined | null,
  now: Date = new Date()
): FormattedDueDate | null {
  if (timestamp == null) {
    return null;
  }

  const due = new Date(timestamp);

  // Normalize to start of day for comparison (in local timezone)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  // Calculate difference in days
  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: "Overdue", status: "overdue" };
  }

  if (diffDays === 0) {
    return { text: "Today", status: "today" };
  }

  if (diffDays === 1) {
    return { text: "Tomorrow", status: "upcoming" };
  }

  if (diffDays <= 7) {
    // Show weekday name for dates within a week
    return {
      text: due.toLocaleDateString("en-US", { weekday: "long" }),
      status: "normal",
    };
  }

  // Show formatted date for dates beyond a week
  return {
    text: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    status: "normal",
  };
}

/**
 * Get CSS classes for due date status styling
 *
 * @param status - The due date status
 * @returns Tailwind CSS classes for the status
 */
export function getDueDateClasses(status: DueDateStatus): string {
  switch (status) {
    case "overdue":
      return "text-red-500 font-medium";
    case "today":
      return "text-orange-500 font-medium";
    case "upcoming":
      return "text-yellow-600 dark:text-yellow-500";
    case "normal":
    default:
      return "text-[var(--text-secondary)]";
  }
}
