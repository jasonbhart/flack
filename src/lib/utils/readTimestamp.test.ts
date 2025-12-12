/**
 * Unit tests for shouldUpdateReadTimestamp helper
 *
 * Tests the pure exported helper function that determines if a read timestamp
 * should be updated. This validates the core business logic used by
 * UnreadCountsStore.markAsReadIfNewer() without Svelte dependencies.
 */

import { describe, it, expect } from "vitest";
import { shouldUpdateReadTimestamp } from "./readTimestamp";

describe("shouldUpdateReadTimestamp", () => {
  describe("basic comparison", () => {
    it("returns true when incoming timestamp is greater than current", () => {
      expect(shouldUpdateReadTimestamp(1000, 2000)).toBe(true);
    });

    it("returns false when incoming timestamp is less than current", () => {
      expect(shouldUpdateReadTimestamp(2000, 1000)).toBe(false);
    });

    it("returns false when incoming timestamp equals current", () => {
      expect(shouldUpdateReadTimestamp(2000, 2000)).toBe(false);
    });
  });

  describe("undefined current timestamp", () => {
    it("returns true when current is undefined and incoming is positive", () => {
      expect(shouldUpdateReadTimestamp(undefined, 1000)).toBe(true);
    });

    it("returns true when current is undefined and incoming is 1", () => {
      expect(shouldUpdateReadTimestamp(undefined, 1)).toBe(true);
    });

    it("returns false when current is undefined and incoming is 0", () => {
      // 0 > (undefined ?? 0) = 0 > 0 = false
      expect(shouldUpdateReadTimestamp(undefined, 0)).toBe(false);
    });

    it("returns false when current is undefined and incoming is negative", () => {
      // -1 > (undefined ?? 0) = -1 > 0 = false
      expect(shouldUpdateReadTimestamp(undefined, -1)).toBe(false);
    });
  });

  describe("zero current timestamp", () => {
    it("returns true when current is 0 and incoming is positive", () => {
      expect(shouldUpdateReadTimestamp(0, 1)).toBe(true);
    });

    it("returns false when current is 0 and incoming is 0", () => {
      expect(shouldUpdateReadTimestamp(0, 0)).toBe(false);
    });

    it("returns false when current is 0 and incoming is negative", () => {
      expect(shouldUpdateReadTimestamp(0, -1)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles very large timestamps", () => {
      const futureTimestamp = Date.now() + 1000000000;
      const currentTimestamp = Date.now();
      expect(shouldUpdateReadTimestamp(currentTimestamp, futureTimestamp)).toBe(true);
    });

    it("handles very small positive differences", () => {
      expect(shouldUpdateReadTimestamp(1000, 1001)).toBe(true);
    });

    it("handles timestamps at the millisecond boundary", () => {
      expect(shouldUpdateReadTimestamp(1000, 1000)).toBe(false);
      expect(shouldUpdateReadTimestamp(999, 1000)).toBe(true);
    });

    it("correctly compares realistic timestamps", () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const oneMinuteLater = now + 60000;

      expect(shouldUpdateReadTimestamp(oneMinuteAgo, now)).toBe(true);
      expect(shouldUpdateReadTimestamp(now, oneMinuteAgo)).toBe(false);
      expect(shouldUpdateReadTimestamp(now, oneMinuteLater)).toBe(true);
    });
  });

  describe("type safety", () => {
    it("treats undefined as 0 for comparison", () => {
      // This is the key behavior: undefined ?? 0 means "never read" = timestamp 0
      expect(shouldUpdateReadTimestamp(undefined, 100)).toBe(true);
      expect(shouldUpdateReadTimestamp(100, 100)).toBe(false);
    });
  });
});
