/**
 * Format a timestamp as a relative time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time (e.g., "just now", "5m ago", "2h ago", "3d ago")
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
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${days}d ago`;
}
