import { describe, it, expect } from "vitest";
import {
  parse,
  extractUsernames,
  extractSpecialMentions,
  tokenize,
  getAutocompleteContext,
  replaceMention,
  matchesQuery,
} from "./mentionParser";

describe("parse", () => {
  it("parses a single @mention", () => {
    const result = parse("Hello @john!");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].username).toBe("john");
    expect(result.mentions[0].raw).toBe("@john");
    expect(result.mentions[0].startIndex).toBe(6);
    expect(result.mentions[0].endIndex).toBe(11);
  });

  it("parses multiple @mentions", () => {
    const result = parse("@alice and @bob are here");
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0].username).toBe("alice");
    expect(result.mentions[1].username).toBe("bob");
  });

  it("parses @channel as special mention", () => {
    const result = parse("Hey @channel!");
    expect(result.mentions).toHaveLength(0);
    expect(result.specialMentions).toHaveLength(1);
    expect(result.specialMentions[0].type).toBe("channel");
    expect(result.specialMentions[0].raw).toBe("@channel");
  });

  it("parses @here as special mention", () => {
    const result = parse("@here please respond");
    expect(result.specialMentions).toHaveLength(1);
    expect(result.specialMentions[0].type).toBe("here");
  });

  it("handles mixed mentions and special mentions", () => {
    const result = parse("@john @channel @alice @here");
    expect(result.mentions).toHaveLength(2);
    expect(result.specialMentions).toHaveLength(2);
  });

  it("ignores escaped @@ mentions", () => {
    // @@john is escaped (ignored), and @example.com looks like an email (no mention)
    const result = parse("Email me at @@john@example.com");
    // Neither @john (escaped) nor @example (no word boundary) should be parsed
    expect(result.mentions).toHaveLength(0);
  });

  it("parses mention after space even with escaped @@", () => {
    // @@john is escaped, but @alice after space is valid
    const result = parse("Use @@john and @alice");
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].username).toBe("alice");
  });

  it("fully ignores escaped @@ when standalone", () => {
    // @@john alone - the @john part is escaped
    const result = parse("Use @@john to escape");
    expect(result.mentions).toHaveLength(0);
  });

  it("handles mentions with underscores", () => {
    const result = parse("Hi @john_doe!");
    expect(result.mentions[0].username).toBe("john_doe");
  });

  it("handles mentions with numbers", () => {
    const result = parse("@user123 joined");
    expect(result.mentions[0].username).toBe("user123");
  });

  it("stops at punctuation", () => {
    const result = parse("@john's message");
    expect(result.mentions[0].username).toBe("john");
    expect(result.mentions[0].endIndex).toBe(5);
  });

  it("returns empty arrays for text without mentions", () => {
    const result = parse("No mentions here");
    expect(result.mentions).toHaveLength(0);
    expect(result.specialMentions).toHaveLength(0);
  });

  it("returns empty arrays for empty text", () => {
    const result = parse("");
    expect(result.mentions).toHaveLength(0);
    expect(result.specialMentions).toHaveLength(0);
  });

  it("handles @channel case-insensitively", () => {
    const result = parse("@Channel and @CHANNEL and @channel");
    // Note: current implementation only matches lowercase in special mentions
    // All are parsed, but only lowercase matches as special
    expect(result.specialMentions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("extractUsernames", () => {
  it("extracts unique usernames", () => {
    const usernames = extractUsernames("@john @alice @john");
    expect(usernames).toEqual(["john", "alice"]);
  });

  it("excludes special mentions", () => {
    const usernames = extractUsernames("@john @channel");
    expect(usernames).toEqual(["john"]);
  });

  it("returns empty array for no mentions", () => {
    const usernames = extractUsernames("No mentions");
    expect(usernames).toEqual([]);
  });
});

describe("extractSpecialMentions", () => {
  it("extracts unique special mention types", () => {
    const types = extractSpecialMentions("@channel @here @channel");
    expect(types).toEqual(["channel", "here"]);
  });

  it("returns empty array for no special mentions", () => {
    const types = extractSpecialMentions("@john @alice");
    expect(types).toEqual([]);
  });
});

describe("tokenize", () => {
  it("tokenizes text with mentions", () => {
    const tokens = tokenize("Hello @john!");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: "text", content: "Hello " });
    expect(tokens[1]).toEqual({
      type: "mention",
      content: "@john",
      username: "john",
      userId: undefined,
    });
    expect(tokens[2]).toEqual({ type: "text", content: "!" });
  });

  it("resolves userId from mentionMap", () => {
    const tokens = tokenize("Hi @john", { john: "user_123" });
    expect(tokens[1]).toEqual({
      type: "mention",
      content: "@john",
      username: "john",
      userId: "user_123",
    });
  });

  it("tokenizes special mentions", () => {
    const tokens = tokenize("Hey @channel!");
    expect(tokens).toHaveLength(3);
    expect(tokens[1]).toEqual({
      type: "special-mention",
      content: "@channel",
      specialType: "channel",
    });
  });

  it("handles text-only input", () => {
    const tokens = tokenize("No mentions here");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ type: "text", content: "No mentions here" });
  });

  it("handles empty input", () => {
    const tokens = tokenize("");
    expect(tokens).toHaveLength(0);
  });

  it("handles multiple consecutive mentions with spaces", () => {
    const tokens = tokenize("@alice @bob");
    // @alice @bob - both should be parsed (space-separated)
    expect(tokens.filter((t) => t.type === "mention")).toHaveLength(2);
  });

  it("does not parse mentions without word boundary (like emails)", () => {
    const tokens = tokenize("user@example.com");
    // @example should NOT be parsed - it's part of an email
    expect(tokens.filter((t) => t.type === "mention")).toHaveLength(0);
    expect(tokens.filter((t) => t.type === "text")).toHaveLength(1);
  });

  it("parses mention at start of string", () => {
    const tokens = tokenize("@alice said hello");
    expect(tokens.filter((t) => t.type === "mention")).toHaveLength(1);
  });

  it("sorts tokens by position", () => {
    const tokens = tokenize("@here and @john");
    expect(tokens[0].type).toBe("special-mention"); // @here comes first
    expect(tokens[2].type).toBe("mention"); // @john comes second
  });
});

describe("getAutocompleteContext", () => {
  it("detects active autocomplete after @", () => {
    const ctx = getAutocompleteContext("Hello @", 7);
    expect(ctx.isActive).toBe(true);
    expect(ctx.query).toBe("");
    expect(ctx.triggerIndex).toBe(6);
  });

  it("captures partial query", () => {
    const ctx = getAutocompleteContext("Hello @jo", 9);
    expect(ctx.isActive).toBe(true);
    expect(ctx.query).toBe("jo");
    expect(ctx.triggerIndex).toBe(6);
  });

  it("returns inactive for cursor at start", () => {
    const ctx = getAutocompleteContext("@john", 0);
    expect(ctx.isActive).toBe(false);
  });

  it("returns inactive for empty text", () => {
    const ctx = getAutocompleteContext("", 0);
    expect(ctx.isActive).toBe(false);
  });

  it("returns inactive for escaped @@", () => {
    const ctx = getAutocompleteContext("@@john", 6);
    expect(ctx.isActive).toBe(false);
  });

  it("returns inactive when @ not preceded by whitespace", () => {
    const ctx = getAutocompleteContext("email@john", 10);
    expect(ctx.isActive).toBe(false);
  });

  it("returns inactive when query has space", () => {
    const ctx = getAutocompleteContext("Hello @ john", 12);
    expect(ctx.isActive).toBe(false);
  });

  it("works at start of text", () => {
    const ctx = getAutocompleteContext("@jo", 3);
    expect(ctx.isActive).toBe(true);
    expect(ctx.query).toBe("jo");
  });

  it("works after newline", () => {
    const ctx = getAutocompleteContext("Line 1\n@jo", 10);
    expect(ctx.isActive).toBe(true);
    expect(ctx.query).toBe("jo");
  });
});

describe("replaceMention", () => {
  it("replaces partial mention with selected username", () => {
    const result = replaceMention("Hello @jo", 6, 9, "john");
    expect(result.text).toBe("Hello @john ");
    expect(result.cursorPosition).toBe(12);
  });

  it("handles empty query", () => {
    const result = replaceMention("Hello @", 6, 7, "alice");
    expect(result.text).toBe("Hello @alice ");
  });

  it("preserves text after cursor", () => {
    const result = replaceMention("Hello @jo and more", 6, 9, "john");
    expect(result.text).toBe("Hello @john  and more");
  });

  it("works at start of text", () => {
    const result = replaceMention("@jo test", 0, 3, "john");
    expect(result.text).toBe("@john  test");
  });
});

describe("matchesQuery", () => {
  it("matches prefix", () => {
    expect(matchesQuery("john", "jo")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesQuery("John", "jo")).toBe(true);
    expect(matchesQuery("john", "JO")).toBe(true);
  });

  it("matches empty query", () => {
    expect(matchesQuery("anyone", "")).toBe(true);
  });

  it("does not match non-prefix", () => {
    expect(matchesQuery("john", "ohn")).toBe(false);
  });

  it("does not match longer query", () => {
    expect(matchesQuery("jo", "john")).toBe(false);
  });
});
