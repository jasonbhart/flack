/**
 * Pure helper functions for read timestamp logic.
 * Extracted for testability - no Svelte or SvelteKit dependencies.
 */

/**
 * Determine if a read timestamp should be updated.
 * Returns true if the incoming timestamp is newer than the current one.
 *
 * @param current - Current timestamp for the channel (undefined if never read)
 * @param incoming - New timestamp to compare against
 * @returns true if incoming timestamp is newer and should replace current
 *
 * @example
 * shouldUpdateReadTimestamp(1000, 2000) // true - incoming is newer
 * shouldUpdateReadTimestamp(2000, 1000) // false - incoming is older
 * shouldUpdateReadTimestamp(undefined, 1000) // true - never read, any positive is newer
 */
export function shouldUpdateReadTimestamp(
  current: number | undefined,
  incoming: number
): boolean {
  return incoming > (current ?? 0);
}
