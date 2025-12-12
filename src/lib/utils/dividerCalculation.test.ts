import { describe, it, expect } from "vitest";
import { calculateDividerInfo } from "./dividerCalculation";

describe("calculateDividerInfo", () => {
  describe("no lastRead timestamp", () => {
    it("returns null when channel was never read (undefined)", () => {
      const result = calculateDividerInfo(undefined, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
      ]);
      expect(result).toBeNull();
    });
  });

  describe("empty messages", () => {
    it("returns null for empty messages array", () => {
      const result = calculateDividerInfo(1500, []);
      expect(result).toBeNull();
    });
  });

  describe("all messages read", () => {
    it("returns null when all messages are older than lastRead", () => {
      const result = calculateDividerInfo(
        3000, // Read after all messages
        [{ _creationTime: 1000 }, { _creationTime: 2000 }]
      );
      expect(result).toBeNull();
    });

    it("returns null when lastRead equals the latest message time", () => {
      const result = calculateDividerInfo(2000, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
      ]);
      expect(result).toBeNull();
    });
  });

  describe("all messages unread", () => {
    it("returns null when all messages are newer than lastRead", () => {
      // Nothing to separate from - all unread
      const result = calculateDividerInfo(
        500, // Read before all messages
        [{ _creationTime: 1000 }, { _creationTime: 2000 }]
      );
      expect(result).toBeNull();
    });
  });

  describe("partial unread", () => {
    it("returns correct index for simple case", () => {
      // Messages: [1000, 2000, 3000, 4000]
      // LastRead: 2000
      // Expected: divider at index 2 (before 3000), 2 unread
      const result = calculateDividerInfo(2000, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
        { _creationTime: 3000 },
        { _creationTime: 4000 },
      ]);
      expect(result).toEqual({ messageIndex: 2, unreadCount: 2 });
    });

    it("returns correct index when only last message is unread", () => {
      const result = calculateDividerInfo(3000, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
        { _creationTime: 3000 },
        { _creationTime: 4000 },
      ]);
      expect(result).toEqual({ messageIndex: 3, unreadCount: 1 });
    });

    it("returns correct index when multiple messages are unread", () => {
      const result = calculateDividerInfo(1500, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
        { _creationTime: 3000 },
        { _creationTime: 4000 },
      ]);
      expect(result).toEqual({ messageIndex: 1, unreadCount: 3 });
    });
  });

  describe("binary search correctness", () => {
    it("handles single message (read)", () => {
      const result = calculateDividerInfo(2000, [{ _creationTime: 1000 }]);
      expect(result).toBeNull();
    });

    it("handles single message (unread)", () => {
      // Only one message and it's unread = nothing to separate from
      const result = calculateDividerInfo(500, [{ _creationTime: 1000 }]);
      expect(result).toBeNull();
    });

    it("handles large message list efficiently", () => {
      const messages = Array.from({ length: 1000 }, (_, i) => ({
        _creationTime: i * 100,
      }));

      // Last read at 50000 (after message 500)
      const result = calculateDividerInfo(50000, messages);

      expect(result).toEqual({
        messageIndex: 501,
        unreadCount: 499,
      });
    });

    it("handles timestamps at exact message boundaries", () => {
      const result = calculateDividerInfo(2000, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
        { _creationTime: 3000 },
      ]);
      // Messages at or before 2000 are read, so divider at index 2
      expect(result).toEqual({ messageIndex: 2, unreadCount: 1 });
    });
  });

  describe("edge cases", () => {
    it("handles two messages with first read", () => {
      const result = calculateDividerInfo(1000, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
      ]);
      expect(result).toEqual({ messageIndex: 1, unreadCount: 1 });
    });

    it("handles lastRead between consecutive timestamps", () => {
      const result = calculateDividerInfo(1500, [
        { _creationTime: 1000 },
        { _creationTime: 2000 },
        { _creationTime: 3000 },
      ]);
      expect(result).toEqual({ messageIndex: 1, unreadCount: 2 });
    });
  });
});
