/**
 * Pure function to calculate divider info for unread messages.
 * Extracted to separate module for testability (avoids Svelte 5 runes issues).
 *
 * @param lastRead - Timestamp when channel was last read (undefined if never read)
 * @param messages - Array of messages with _creationTime (must be sorted chronologically)
 * @returns { messageIndex, unreadCount } or null if no divider needed
 *
 * @example
 * // Messages: [msg1 (old), msg2 (old), msg3 (new), msg4 (new)]
 * // lastRead timestamp is between msg2 and msg3
 * calculateDividerInfo(2000, messages)
 * // Returns: { messageIndex: 2, unreadCount: 2 }
 * // Divider should be rendered BEFORE messages[2]
 */
export function calculateDividerInfo(
  lastRead: number | undefined,
  messages: { _creationTime: number }[]
): { messageIndex: number; unreadCount: number } | null {
  // No lastRead timestamp means user never read this channel
  // Don't show divider (treat all as read to avoid overwhelming new users)
  if (!lastRead) {
    return null;
  }

  // No messages = no divider
  if (messages.length === 0) {
    return null;
  }

  // Find the first message newer than lastRead timestamp
  // Binary search for O(log n) since messages are sorted chronologically
  let left = 0;
  let right = messages.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (messages[mid]._creationTime <= lastRead) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // left is now the index of the first unread message
  const firstUnreadIndex = left;

  // If all messages are read (firstUnreadIndex === messages.length), no divider needed
  if (firstUnreadIndex >= messages.length) {
    return null;
  }

  // If all messages are unread (firstUnreadIndex === 0), no divider needed
  // (nothing to separate from)
  if (firstUnreadIndex === 0) {
    return null;
  }

  const unreadCount = messages.length - firstUnreadIndex;

  return {
    messageIndex: firstUnreadIndex,
    unreadCount,
  };
}
