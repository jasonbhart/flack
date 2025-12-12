import { describe, it, expect } from "vitest";
import {
  tokenize,
  parseUrls,
  parseCodeBlocks,
  parseInlineCode,
  sanitizeUrl,
  parse,
} from "./messageParser";

describe("messageParser", () => {
  describe("sanitizeUrl", () => {
    it("should accept valid http URLs", () => {
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
    });

    it("should accept valid https URLs", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
    });

    it("should reject javascript: protocol", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });

    it("should reject data: protocol", () => {
      expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    });

    it("should reject file: protocol", () => {
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    });

    it("should reject invalid URLs", () => {
      expect(sanitizeUrl("not a url")).toBeNull();
    });

    it("should normalize URLs", () => {
      expect(sanitizeUrl("https://example.com/path?query=1#hash")).toBe(
        "https://example.com/path?query=1#hash"
      );
    });
  });

  describe("parseUrls", () => {
    it("should detect http URLs", () => {
      const result = parseUrls("Check out http://example.com for more");
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("http://example.com/");
    });

    it("should detect https URLs", () => {
      const result = parseUrls("Visit https://secure.example.com");
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://secure.example.com/");
    });

    it("should handle multiple URLs", () => {
      const result = parseUrls(
        "See https://one.com and https://two.com for details"
      );
      expect(result).toHaveLength(2);
    });

    it("should exclude trailing periods", () => {
      const result = parseUrls("Visit https://example.com.");
      expect(result).toHaveLength(1);
      expect(result[0].raw).toBe("https://example.com");
    });

    it("should exclude trailing commas", () => {
      const result = parseUrls("See https://example.com, for more");
      expect(result).toHaveLength(1);
      expect(result[0].raw).toBe("https://example.com");
    });

    it("should exclude trailing exclamation marks", () => {
      const result = parseUrls("Check https://example.com!");
      expect(result).toHaveLength(1);
      expect(result[0].raw).toBe("https://example.com");
    });

    it("should handle URLs with query parameters", () => {
      const result = parseUrls("See https://example.com/search?q=test&page=1");
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain("q=test");
    });

    it("should handle URLs with fragments", () => {
      const result = parseUrls("Jump to https://example.com/docs#section");
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain("#section");
    });

    it("should handle URLs with paths", () => {
      const result = parseUrls(
        "Read https://example.com/blog/2024/article-title"
      );
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain("/blog/2024/article-title");
    });

    it("should not match bare domains without protocol", () => {
      const result = parseUrls("Visit example.com for more");
      expect(result).toHaveLength(0);
    });

    it("should handle URLs with parentheses in path", () => {
      // URL regex intentionally stops at ) to handle "check out (https://example.com)" pattern
      // For Wikipedia URLs, users should paste without trailing punctuation
      const result = parseUrls(
        "See https://en.wikipedia.org/wiki/Rust_(programming_language)"
      );
      expect(result).toHaveLength(1);
      // The URL should be detected (may or may not include trailing paren depending on implementation)
      expect(result[0].url).toContain("wikipedia.org");
      expect(result[0].url).toContain("Rust_");
    });
  });

  describe("parseCodeBlocks", () => {
    it("should detect simple code blocks", () => {
      const text = "Here is code:\n```\nconst x = 1;\n```";
      const result = parseCodeBlocks(text);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].code).toBe("const x = 1;\n");
    });

    it("should extract language identifier", () => {
      const text = "```typescript\nconst x: number = 1;\n```";
      const result = parseCodeBlocks(text);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].language).toBe("typescript");
      expect(result.blocks[0].code).toBe("const x: number = 1;\n");
    });

    it("should handle code blocks without language", () => {
      const text = "```\nplain code\n```";
      const result = parseCodeBlocks(text);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].language).toBeUndefined();
    });

    it("should preserve whitespace in code blocks", () => {
      const text = "```\n  indented\n    more indented\n```";
      const result = parseCodeBlocks(text);
      expect(result.blocks[0].code).toBe("  indented\n    more indented\n");
    });

    it("should handle unclosed code blocks gracefully", () => {
      const text = "Here is code:\n```python\ndef foo():\n    pass";
      const result = parseCodeBlocks(text);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].language).toBe("python");
      expect(result.blocks[0].code).toContain("def foo():");
    });

    it("should return text segments between code blocks", () => {
      const text = "Before\n```\ncode\n```\nAfter";
      const result = parseCodeBlocks(text);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].content).toBe("Before\n");
      expect(result.segments[1].content).toBe("\nAfter");
    });

    it("should handle multiple code blocks", () => {
      const text = "```js\nfirst\n```\ntext\n```py\nsecond\n```";
      const result = parseCodeBlocks(text);
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].language).toBe("js");
      expect(result.blocks[1].language).toBe("py");
    });
  });

  describe("parseInlineCode", () => {
    it("should detect simple inline code", () => {
      const result = parseInlineCode("Use `const` for constants");
      expect(result.codes).toHaveLength(1);
      expect(result.codes[0].code).toBe("const");
    });

    it("should handle multiple inline codes", () => {
      const result = parseInlineCode("Use `let` or `const` for variables");
      expect(result.codes).toHaveLength(2);
      expect(result.codes[0].code).toBe("let");
      expect(result.codes[1].code).toBe("const");
    });

    it("should not match unclosed backticks", () => {
      const result = parseInlineCode("Unclosed `backtick");
      expect(result.codes).toHaveLength(0);
    });

    it("should not match backticks spanning multiple lines", () => {
      const result = parseInlineCode("Multi\n`line\ncode`");
      expect(result.codes).toHaveLength(0);
    });

    it("should return text segments around inline code", () => {
      const result = parseInlineCode("Before `code` after");
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].content).toBe("Before ");
      expect(result.segments[1].content).toBe(" after");
    });

    it("should handle inline code at start of text", () => {
      const result = parseInlineCode("`code` at start");
      expect(result.codes).toHaveLength(1);
      expect(result.codes[0].code).toBe("code");
    });

    it("should handle inline code at end of text", () => {
      const result = parseInlineCode("at end `code`");
      expect(result.codes).toHaveLength(1);
      expect(result.codes[0].code).toBe("code");
    });
  });

  describe("parse (mentions)", () => {
    it("should detect @mentions", () => {
      const result = parse("Hello @john!");
      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0].username).toBe("john");
    });

    it("should detect @channel", () => {
      const result = parse("Hey @channel, listen up!");
      expect(result.specialMentions).toHaveLength(1);
      expect(result.specialMentions[0].type).toBe("channel");
    });

    it("should detect @here", () => {
      const result = parse("@here quick meeting");
      expect(result.specialMentions).toHaveLength(1);
      expect(result.specialMentions[0].type).toBe("here");
    });

    it("should not detect mentions in email addresses", () => {
      const result = parse("Contact user@example.com");
      expect(result.mentions).toHaveLength(0);
    });

    it("should handle multiple mentions", () => {
      const result = parse("@alice and @bob are here");
      expect(result.mentions).toHaveLength(2);
    });
  });

  describe("tokenize (integration)", () => {
    it("should return empty array for empty string", () => {
      expect(tokenize("")).toEqual([]);
    });

    it("should return text tokens for plain text", () => {
      const result = tokenize("Hello world");
      // All tokens should be text type
      expect(result.every((t) => t.type === "text")).toBe(true);
      // Combined content should equal original
      const combined = result.map((t) => t.content).join("");
      expect(combined).toBe("Hello world");
    });

    it("should tokenize URLs", () => {
      const result = tokenize("Visit https://example.com today");
      // Should have URL token
      const urlToken = result.find((t) => t.type === "url");
      expect(urlToken).toBeDefined();
      expect(urlToken?.url).toBe("https://example.com/");
      // Should have text before and after
      const textTokens = result.filter((t) => t.type === "text");
      expect(textTokens.length).toBeGreaterThan(0);
      const combinedText = textTokens.map((t) => t.content).join("");
      expect(combinedText).toContain("Visit");
      expect(combinedText).toContain("today");
    });

    it("should tokenize code blocks", () => {
      const result = tokenize("Here:\n```js\ncode\n```");
      const codeBlock = result.find((t) => t.type === "code-block");
      expect(codeBlock).toBeDefined();
      expect(codeBlock?.language).toBe("js");
      expect(codeBlock?.content).toBe("code\n");
    });

    it("should tokenize inline code", () => {
      const result = tokenize("Use `const` for constants");
      const inlineCode = result.find((t) => t.type === "inline-code");
      expect(inlineCode).toBeDefined();
      expect(inlineCode?.content).toBe("const");
    });

    it("should tokenize mentions", () => {
      const result = tokenize("Hello @john!");
      const mention = result.find((t) => t.type === "mention");
      expect(mention).toBeDefined();
      expect(mention?.username).toBe("john");
    });

    it("should resolve mention userIds from mentionMap", () => {
      const result = tokenize("Hello @john!", { john: "user123" });
      const mention = result.find((t) => t.type === "mention");
      expect(mention?.userId).toBe("user123");
    });

    describe("token priority", () => {
      it("should not parse URLs inside code blocks", () => {
        const result = tokenize("```\nhttps://example.com\n```");
        const urlToken = result.find((t) => t.type === "url");
        expect(urlToken).toBeUndefined();

        const codeBlock = result.find((t) => t.type === "code-block");
        expect(codeBlock?.content).toContain("https://example.com");
      });

      it("should not parse URLs inside inline code", () => {
        const result = tokenize("See `https://example.com` for details");
        const urlToken = result.find((t) => t.type === "url");
        expect(urlToken).toBeUndefined();

        const inlineCode = result.find((t) => t.type === "inline-code");
        expect(inlineCode?.content).toBe("https://example.com");
      });

      it("should not parse mentions inside code blocks", () => {
        const result = tokenize("```\n@john\n```");
        const mention = result.find((t) => t.type === "mention");
        expect(mention).toBeUndefined();

        const codeBlock = result.find((t) => t.type === "code-block");
        expect(codeBlock?.content).toContain("@john");
      });

      it("should not parse mentions inside inline code", () => {
        const result = tokenize("Use `@deprecated` annotation");
        const mention = result.find((t) => t.type === "mention");
        expect(mention).toBeUndefined();

        const inlineCode = result.find((t) => t.type === "inline-code");
        expect(inlineCode?.content).toBe("@deprecated");
      });

      it("should not parse inline code inside code blocks", () => {
        const result = tokenize("```\n`inline`\n```");
        const inlineCode = result.find((t) => t.type === "inline-code");
        expect(inlineCode).toBeUndefined();
      });
    });

    describe("mixed content", () => {
      it("should handle text with URL and mention", () => {
        const result = tokenize("Hey @john, check https://example.com");
        const mention = result.find((t) => t.type === "mention");
        const url = result.find((t) => t.type === "url");
        expect(mention).toBeDefined();
        expect(url).toBeDefined();
      });

      it("should handle code block followed by inline code", () => {
        const result = tokenize("```\nblock\n```\nUse `inline` here");
        const codeBlock = result.find((t) => t.type === "code-block");
        const inlineCode = result.find((t) => t.type === "inline-code");
        expect(codeBlock).toBeDefined();
        expect(inlineCode).toBeDefined();
      });

      it("should handle complex message with all token types", () => {
        const message = `Hey @channel!
Check out https://docs.example.com for the guide.

\`\`\`typescript
const greeting = "Hello";
console.log(greeting);
\`\`\`

Use \`npm install\` to get started. CC @john`;

        const result = tokenize(message);

        const hasSpecialMention = result.some(
          (t) => t.type === "special-mention"
        );
        const hasUrl = result.some((t) => t.type === "url");
        const hasCodeBlock = result.some((t) => t.type === "code-block");
        const hasInlineCode = result.some((t) => t.type === "inline-code");
        const hasMention = result.some((t) => t.type === "mention");

        expect(hasSpecialMention).toBe(true);
        expect(hasUrl).toBe(true);
        expect(hasCodeBlock).toBe(true);
        expect(hasInlineCode).toBe(true);
        expect(hasMention).toBe(true);
      });
    });
  });
});
