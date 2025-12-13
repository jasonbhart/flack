import { describe, it, expect } from "vitest";
import { formatDueDate, getDueDateClasses } from "./formatDueDate";

describe("formatDueDate", () => {
  // Use a fixed "now" date for all tests: January 15, 2024 at noon
  const now = new Date(2024, 0, 15, 12, 0, 0); // Month is 0-indexed

  describe("null/undefined handling", () => {
    it("returns null for undefined timestamp", () => {
      const result = formatDueDate(undefined, now);
      expect(result).toBeNull();
    });

    it("returns null for null timestamp", () => {
      const result = formatDueDate(null, now);
      expect(result).toBeNull();
    });
  });

  describe("overdue dates", () => {
    it("returns Overdue for yesterday", () => {
      // January 14, 2024
      const yesterday = new Date(2024, 0, 14).getTime();
      const result = formatDueDate(yesterday, now);
      expect(result).toEqual({ text: "Overdue", status: "overdue" });
    });

    it("returns Overdue for dates far in the past", () => {
      // January 1, 2024
      const pastDate = new Date(2024, 0, 1).getTime();
      const result = formatDueDate(pastDate, now);
      expect(result).toEqual({ text: "Overdue", status: "overdue" });
    });

    it("returns Overdue for dates in previous year", () => {
      // December 31, 2023
      const lastYear = new Date(2023, 11, 31).getTime();
      const result = formatDueDate(lastYear, now);
      expect(result).toEqual({ text: "Overdue", status: "overdue" });
    });
  });

  describe("today", () => {
    it("returns Today for the current date", () => {
      // January 15, 2024 (same day as now)
      const today = new Date(2024, 0, 15).getTime();
      const result = formatDueDate(today, now);
      expect(result).toEqual({ text: "Today", status: "today" });
    });

    it("returns Today regardless of time on same day", () => {
      // January 15, 2024 at 23:59:59
      const todayLate = new Date(2024, 0, 15, 23, 59, 59).getTime();
      const result = formatDueDate(todayLate, now);
      expect(result).toEqual({ text: "Today", status: "today" });
    });

    it("returns Today for midnight of current day", () => {
      // January 15, 2024 at 00:00:00
      const todayMidnight = new Date(2024, 0, 15, 0, 0, 0).getTime();
      const result = formatDueDate(todayMidnight, now);
      expect(result).toEqual({ text: "Today", status: "today" });
    });
  });

  describe("tomorrow", () => {
    it("returns Tomorrow for the next day", () => {
      // January 16, 2024
      const tomorrow = new Date(2024, 0, 16).getTime();
      const result = formatDueDate(tomorrow, now);
      expect(result).toEqual({ text: "Tomorrow", status: "upcoming" });
    });

    it("returns Tomorrow regardless of time on next day", () => {
      // January 16, 2024 at 23:59:59
      const tomorrowLate = new Date(2024, 0, 16, 23, 59, 59).getTime();
      const result = formatDueDate(tomorrowLate, now);
      expect(result).toEqual({ text: "Tomorrow", status: "upcoming" });
    });
  });

  describe("within 7 days (weekday name)", () => {
    it("returns weekday name for 2 days from now", () => {
      // January 17, 2024 (Wednesday)
      const twoDays = new Date(2024, 0, 17).getTime();
      const result = formatDueDate(twoDays, now);
      expect(result).toEqual({ text: "Wednesday", status: "normal" });
    });

    it("returns weekday name for 3 days from now", () => {
      // January 18, 2024 (Thursday)
      const threeDays = new Date(2024, 0, 18).getTime();
      const result = formatDueDate(threeDays, now);
      expect(result).toEqual({ text: "Thursday", status: "normal" });
    });

    it("returns weekday name for 7 days from now", () => {
      // January 22, 2024 (Monday)
      const sevenDays = new Date(2024, 0, 22).getTime();
      const result = formatDueDate(sevenDays, now);
      expect(result).toEqual({ text: "Monday", status: "normal" });
    });

    it("shows weekday for Saturday", () => {
      // January 20, 2024 (Saturday)
      const saturday = new Date(2024, 0, 20).getTime();
      const result = formatDueDate(saturday, now);
      expect(result).toEqual({ text: "Saturday", status: "normal" });
    });

    it("shows weekday for Sunday", () => {
      // January 21, 2024 (Sunday)
      const sunday = new Date(2024, 0, 21).getTime();
      const result = formatDueDate(sunday, now);
      expect(result).toEqual({ text: "Sunday", status: "normal" });
    });
  });

  describe("beyond 7 days (formatted date)", () => {
    it("returns formatted date for 8 days from now", () => {
      // January 23, 2024
      const eightDays = new Date(2024, 0, 23).getTime();
      const result = formatDueDate(eightDays, now);
      expect(result?.text).toBe("Jan 23");
      expect(result?.status).toBe("normal");
    });

    it("returns formatted date for dates in next month", () => {
      // February 15, 2024
      const nextMonth = new Date(2024, 1, 15).getTime();
      const result = formatDueDate(nextMonth, now);
      expect(result?.text).toBe("Feb 15");
      expect(result?.status).toBe("normal");
    });

    it("returns formatted date for dates far in the future", () => {
      // December 25, 2024
      const farFuture = new Date(2024, 11, 25).getTime();
      const result = formatDueDate(farFuture, now);
      expect(result?.text).toBe("Dec 25");
      expect(result?.status).toBe("normal");
    });

    it("returns formatted date for dates in next year", () => {
      // January 1, 2025
      const nextYear = new Date(2025, 0, 1).getTime();
      const result = formatDueDate(nextYear, now);
      expect(result?.text).toBe("Jan 1");
      expect(result?.status).toBe("normal");
    });
  });

  describe("edge cases", () => {
    it("handles timestamp of 0 (epoch)", () => {
      const result = formatDueDate(0, now);
      // January 1, 1970 is way in the past
      expect(result).toEqual({ text: "Overdue", status: "overdue" });
    });

    it("handles very large timestamps", () => {
      // Year 2100
      const farFuture = new Date(2100, 0, 1).getTime();
      const result = formatDueDate(farFuture, now);
      expect(result?.text).toBe("Jan 1");
      expect(result?.status).toBe("normal");
    });

    it("uses current date when now is not provided", () => {
      // Create a timestamp for tomorrow relative to actual current date
      const actualNow = new Date();
      const tomorrow = new Date(
        actualNow.getFullYear(),
        actualNow.getMonth(),
        actualNow.getDate() + 1
      ).getTime();
      const result = formatDueDate(tomorrow);
      expect(result).toEqual({ text: "Tomorrow", status: "upcoming" });
    });
  });

  describe("month boundary handling", () => {
    it("correctly handles end of month", () => {
      // Now is January 31, 2024
      const endOfMonth = new Date(2024, 0, 31, 12, 0, 0);
      // Due February 1, 2024 (tomorrow)
      const nextDay = new Date(2024, 1, 1).getTime();
      const result = formatDueDate(nextDay, endOfMonth);
      expect(result).toEqual({ text: "Tomorrow", status: "upcoming" });
    });

    it("correctly handles year boundary", () => {
      // Now is December 31, 2024
      const endOfYear = new Date(2024, 11, 31, 12, 0, 0);
      // Due January 1, 2025 (tomorrow)
      const newYear = new Date(2025, 0, 1).getTime();
      const result = formatDueDate(newYear, endOfYear);
      expect(result).toEqual({ text: "Tomorrow", status: "upcoming" });
    });
  });
});

describe("getDueDateClasses", () => {
  it("returns red classes for overdue status", () => {
    const result = getDueDateClasses("overdue");
    expect(result).toBe("text-red-500 font-medium");
  });

  it("returns orange classes for today status", () => {
    const result = getDueDateClasses("today");
    expect(result).toBe("text-orange-500 font-medium");
  });

  it("returns yellow classes for upcoming status", () => {
    const result = getDueDateClasses("upcoming");
    expect(result).toBe("text-yellow-600 dark:text-yellow-500");
  });

  it("returns secondary text classes for normal status", () => {
    const result = getDueDateClasses("normal");
    expect(result).toBe("text-[var(--text-secondary)]");
  });
});
