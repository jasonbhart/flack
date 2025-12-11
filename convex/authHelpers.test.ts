import { describe, it, expect } from "vitest";
import { normalizeEmail, hashToken } from "./authHelpers";

describe("authHelpers", () => {
  describe("normalizeEmail", () => {
    it("converts email to lowercase", () => {
      expect(normalizeEmail("Test@Example.COM")).toBe("test@example.com");
    });

    it("trims whitespace", () => {
      expect(normalizeEmail("  test@example.com  ")).toBe("test@example.com");
    });

    it("handles already normalized email", () => {
      expect(normalizeEmail("test@example.com")).toBe("test@example.com");
    });

    it("handles mixed case with whitespace", () => {
      expect(normalizeEmail("  TEST@Example.Com  ")).toBe("test@example.com");
    });
  });

  describe("hashToken", () => {
    it("returns a 64-character hex string (SHA-256)", async () => {
      const hash = await hashToken("test-token");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("produces consistent hashes for same input", async () => {
      const hash1 = await hashToken("my-secret-token");
      const hash2 = await hashToken("my-secret-token");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", async () => {
      const hash1 = await hashToken("token-1");
      const hash2 = await hashToken("token-2");
      expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", async () => {
      const hash = await hashToken("");
      expect(hash).toHaveLength(64);
      // SHA-256 of empty string is a known value
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("handles unicode characters", async () => {
      const hash = await hashToken("token-with-émoji-🔐");
      expect(hash).toHaveLength(64);
    });
  });
});
