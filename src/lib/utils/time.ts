/**
 * Format a timestamp as a relative time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time (e.g., "just now", "5m ago", "2h ago", "Dec 10")
 */
export function formatRelativeTime(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "";
  }

  const now = Date.now();
  const diff = now - timestamp;

  // Handle future dates
  if (diff < 0) {
    return "just now";
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  // For messages >24h old, show short date with time
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a timestamp as a full locale date/time string for hover tooltip
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Full date/time string (e.g., "December 10, 2025 at 3:45:30 PM")
 */
export function formatFullTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "";
  }

  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
