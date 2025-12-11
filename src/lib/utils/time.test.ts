import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatRelativeTime } from "./time";

describe("formatRelativeTime", () => {
  // Mock Date.now for deterministic tests
  const MOCK_NOW = 1700000000000; // Fixed timestamp

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("edge cases", () => {
    it("returns empty string for undefined input", () => {
      expect(formatRelativeTime(undefined)).toBe("");
    });

    it('returns "just now" for future dates', () => {
      const futureTimestamp = MOCK_NOW + 60000; // 1 minute in the future
      expect(formatRelativeTime(futureTimestamp)).toBe("just now");
    });
  });

  describe("just now (< 60 seconds)", () => {
    it('returns "just now" for current timestamp', () => {
      expect(formatRelativeTime(MOCK_NOW)).toBe("just now");
    });

    it('returns "just now" for 1 second ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 1000)).toBe("just now");
    });

    it('returns "just now" for 59 seconds ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 59000)).toBe("just now");
    });
  });

  describe("minutes ago (60s to 59m)", () => {
    it('returns "1m ago" for exactly 60 seconds ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 60000)).toBe("1m ago");
    });

    it('returns "5m ago" for 5 minutes ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 5 * 60 * 1000)).toBe("5m ago");
    });

    it('returns "59m ago" for 59 minutes ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 59 * 60 * 1000)).toBe("59m ago");
    });
  });

  describe("hours ago (1h to 23h)", () => {
    it('returns "1h ago" for exactly 60 minutes ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 60 * 60 * 1000)).toBe("1h ago");
    });

    it('returns "5h ago" for 5 hours ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 5 * 60 * 60 * 1000)).toBe("5h ago");
    });

    it('returns "23h ago" for 23 hours ago', () => {
      expect(formatRelativeTime(MOCK_NOW - 23 * 60 * 60 * 1000)).toBe("23h ago");
    });
  });

  describe("dates (24h+)", () => {
    it('returns short date format for exactly 24 hours ago', () => {
      const timestamp = MOCK_NOW - 24 * 60 * 60 * 1000;
      const result = formatRelativeTime(timestamp);
      // Implementation returns short date like "Nov 13" for >24h
      expect(result).not.toBe("just now");
      expect(result).not.toContain("ago");
    });

    it('returns short date format for 1 week ago', () => {
      const timestamp = MOCK_NOW - 7 * 24 * 60 * 60 * 1000;
      const result = formatRelativeTime(timestamp);
      expect(result).not.toBe("just now");
      expect(result).not.toContain("ago");
    });

    it('returns short date format for 30 days ago', () => {
      const timestamp = MOCK_NOW - 30 * 24 * 60 * 60 * 1000;
      const result = formatRelativeTime(timestamp);
      expect(result).not.toBe("just now");
      expect(result).not.toContain("ago");
    });
  });
});
