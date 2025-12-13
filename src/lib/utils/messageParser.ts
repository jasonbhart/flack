/**
 * MessageParser - Utilities for parsing message text into formatted tokens
 *
 * Handles (in priority order):
 * 1. Fenced code blocks (``` ... ```)
 * 2. Inline code (` ... `)
 * 3. URLs (http:// and https://)
 * 4. @mentions (@username, @channel, @here)
 *
 * Edge cases: punctuation, possessives, emails, escaped @@, unclosed blocks
 */

import type {
  ParsedMention,
  ParsedSpecialMention,
  ParseResult,
  MessageToken,
  AutocompleteContext,
  SpecialMention,
  CodeBlockMatch,
  InlineCodeMatch,
  UrlMatch,
  TextSegment,
} from "$lib/types/messageTokens";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================
// Regex Patterns
// ============================================

// Regex pattern for valid username characters (letters, numbers, underscores, dots, dashes)
// Supports email-derived usernames like john.doe or john-doe
// Matches @username but stops at punctuation (except . and -), spaces, or special chars
// NOTE: Keep in sync with convex/messages.ts (server-side parser)
const MENTION_PATTERN = /@([a-zA-Z][a-zA-Z0-9_.-]*)/g;

// Special mention patterns
const SPECIAL_MENTIONS: SpecialMention[] = ["channel", "here"];

// URL pattern - matches http:// and https:// URLs
// Stops at whitespace, angle brackets, quotes, and excludes trailing punctuation
const URL_PATTERN = /https?:\/\/[^\s<>")\]}\n]+/g;

// Trailing punctuation that should not be part of URL
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

// Fenced code block pattern - matches ```language\ncode``` or unclosed ```code
// Group 1: language (optional), Group 2: code content (closed), Group 3: language (unclosed), Group 4: code (unclosed)
const CODE_BLOCK_PATTERN = /```(\w*)\n?([\s\S]*?)```|```(\w*)\n?([\s\S]*)$/g;

// Inline code pattern - single backticks, cannot span lines
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;

// ============================================
// URL Parsing
// ============================================

/**
 * Sanitize a URL to prevent XSS attacks.
 * Only allows http: and https: protocols.
 *
 * @param url - The URL to sanitize
 * @returns The sanitized URL or null if invalid/dangerous
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null; // Invalid URL
  }
}

/**
 * Parse all URLs from a text string.
 *
 * @param text - The input text to parse
 * @returns Array of URL matches with positions
 */
export function parseUrls(text: string): UrlMatch[] {
  const urls: UrlMatch[] = [];

  // Reset regex state
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    let raw = match[0];
    const startIndex = match.index;

    // Remove trailing punctuation
    const punctuationMatch = raw.match(TRAILING_PUNCTUATION);
    if (punctuationMatch) {
      raw = raw.slice(0, -punctuationMatch[0].length);
    }

    // Handle balanced parentheses (for Wikipedia-style URLs)
    // Count open parens, if more close parens at end, trim them
    let openParens = 0;
    let closeParens = 0;
    for (const char of raw) {
      if (char === "(") openParens++;
      if (char === ")") closeParens++;
    }
    // If we have excess closing parens at the end, trim them
    while (closeParens > openParens && raw.endsWith(")")) {
      raw = raw.slice(0, -1);
      closeParens--;
    }

    const endIndex = startIndex + raw.length;

    // Sanitize the URL
    const sanitized = sanitizeUrl(raw);
    if (sanitized) {
      urls.push({
        raw,
        url: sanitized,
        startIndex,
        endIndex,
      });
    }
  }

  return urls;
}

// ============================================
// Code Block Parsing
// ============================================

/**
 * Parse fenced code blocks from text.
 * Code blocks have highest priority and their content is not parsed further.
 *
 * @param text - The input text to parse
 * @returns Object with code blocks and remaining text segments
 */
export function parseCodeBlocks(text: string): {
  blocks: CodeBlockMatch[];
  segments: TextSegment[];
} {
  const blocks: CodeBlockMatch[] = [];
  const segments: TextSegment[] = [];

  // Reset regex state
  CODE_BLOCK_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_PATTERN.exec(text)) !== null) {
    const startIndex = match.index;

    // Add text segment before this code block
    if (startIndex > lastIndex) {
      segments.push({
        content: text.slice(lastIndex, startIndex),
        startIndex: lastIndex,
        endIndex: startIndex,
      });
    }

    // Determine if this is a closed or unclosed block
    const isClosed = match[2] !== undefined;
    const language = (isClosed ? match[1] : match[3]) || undefined;
    const code = isClosed ? match[2] : match[4];
    const raw = match[0];
    const endIndex = startIndex + raw.length;

    blocks.push({
      raw,
      code: code || "",
      language: language || undefined,
      startIndex,
      endIndex,
    });

    lastIndex = endIndex;
  }

  // Add remaining text after last code block OR entire text if no blocks found
  if (lastIndex < text.length) {
    segments.push({
      content: text.slice(lastIndex),
      startIndex: lastIndex,
      endIndex: text.length,
    });
  }

  return { blocks, segments };
}

// ============================================
// Inline Code Parsing
// ============================================

/**
 * Parse inline code spans from text.
 * Should only be called on text segments (not inside code blocks).
 *
 * @param text - The input text to parse
 * @returns Object with inline code matches and remaining text segments
 */
export function parseInlineCode(text: string): {
  codes: InlineCodeMatch[];
  segments: TextSegment[];
} {
  const codes: InlineCodeMatch[] = [];
  const segments: TextSegment[] = [];

  // Reset regex state
  INLINE_CODE_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_CODE_PATTERN.exec(text)) !== null) {
    const startIndex = match.index;

    // Add text segment before this inline code
    if (startIndex > lastIndex) {
      segments.push({
        content: text.slice(lastIndex, startIndex),
        startIndex: lastIndex,
        endIndex: startIndex,
      });
    }

    const raw = match[0];
    const code = match[1];
    const endIndex = startIndex + raw.length;

    codes.push({
      raw,
      code,
      startIndex,
      endIndex,
    });

    lastIndex = endIndex;
  }

  // Add remaining text after last inline code OR entire text if no inline code found
  if (lastIndex < text.length) {
    segments.push({
      content: text.slice(lastIndex),
      startIndex: lastIndex,
      endIndex: text.length,
    });
  }

  return { codes, segments };
}

// ============================================
// Mention Parsing (existing functionality)
// ============================================

/**
 * Parse all mentions from a text string.
 *
 * @param text - The input text to parse
 * @returns ParseResult with arrays of regular and special mentions
 */
export function parse(text: string): ParseResult {
  const mentions: ParsedMention[] = [];
  const specialMentions: ParsedSpecialMention[] = [];

  // Reset regex state
  MENTION_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    const raw = match[0];
    const username = match[1];
    const startIndex = match.index;
    const endIndex = startIndex + raw.length;

    // Skip if @ is not at word boundary (e.g., inside email: user@example.com)
    // Must be at start of string OR preceded by whitespace
    if (startIndex > 0 && !/\s/.test(text[startIndex - 1])) {
      // Exception: allow @@ escape sequence (skip the escaped mention)
      if (text[startIndex - 1] === "@") {
        continue;
      }
      // Not a valid mention boundary (likely part of email or URL)
      continue;
    }

    // Check if this is a special mention
    const lowerUsername = username.toLowerCase();
    if (SPECIAL_MENTIONS.includes(lowerUsername as SpecialMention)) {
      specialMentions.push({
        type: lowerUsername as SpecialMention,
        raw,
        startIndex,
        endIndex,
      });
    } else {
      mentions.push({
        raw,
        username,
        startIndex,
        endIndex,
      });
    }
  }

  return { mentions, specialMentions };
}

/**
 * Parse URLs and mentions from a text segment.
 * URLs take priority over mentions (a mention inside a URL is not parsed).
 *
 * @param text - The text segment to parse
 * @param mentionMap - Optional map of username -> userId
 * @returns Array of tokens
 */
function parseUrlsAndMentions(
  text: string,
  mentionMap?: Record<string, string>
): MessageToken[] {
  // First, find all URLs
  const urls = parseUrls(text);

  // Then find all mentions
  const { mentions, specialMentions } = parse(text);

  // Filter out mentions that overlap with URLs
  const filteredMentions = mentions.filter((m) => {
    return !urls.some(
      (url) => m.startIndex >= url.startIndex && m.endIndex <= url.endIndex
    );
  });

  const filteredSpecialMentions = specialMentions.filter((m) => {
    return !urls.some(
      (url) => m.startIndex >= url.startIndex && m.endIndex <= url.endIndex
    );
  });

  // Combine all matches and sort by position
  type Match =
    | { type: "url"; match: UrlMatch }
    | { type: "mention"; match: ParsedMention }
    | { type: "special-mention"; match: ParsedSpecialMention };

  const allMatches: Match[] = [
    ...urls.map((m) => ({ type: "url" as const, match: m })),
    ...filteredMentions.map((m) => ({ type: "mention" as const, match: m })),
    ...filteredSpecialMentions.map((m) => ({
      type: "special-mention" as const,
      match: m,
    })),
  ].sort((a, b) => a.match.startIndex - b.match.startIndex);

  if (allMatches.length === 0) {
    return text ? [{ type: "text", content: text }] : [];
  }

  const tokens: MessageToken[] = [];
  let lastIndex = 0;

  for (const item of allMatches) {
    // Add text before this match
    if (item.match.startIndex > lastIndex) {
      tokens.push({
        type: "text",
        content: text.slice(lastIndex, item.match.startIndex),
      });
    }

    // Add the token based on type
    if (item.type === "url") {
      const urlMatch = item.match as UrlMatch;
      tokens.push({
        type: "url",
        content: urlMatch.raw,
        url: urlMatch.url,
      });
    } else if (item.type === "mention") {
      const mentionMatch = item.match as ParsedMention;
      // Use lowercase for case-insensitive lookup (mentionMap keys are lowercase)
      const resolvedUserId = mentionMap?.[mentionMatch.username.toLowerCase()];
      tokens.push({
        type: "mention",
        content: mentionMatch.raw,
        username: mentionMatch.username,
        userId: resolvedUserId as Id<"users"> | undefined,
      });
    } else {
      const specialMatch = item.match as ParsedSpecialMention;
      tokens.push({
        type: "special-mention",
        content: specialMatch.raw,
        specialType: specialMatch.type,
      });
    }

    lastIndex = item.match.endIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return tokens;
}

// ============================================
// Main Tokenizer (Multi-Phase)
// ============================================

/**
 * Tokenize text into segments for rendering with all formatting types.
 *
 * Processing order (priority):
 * 1. Fenced code blocks (``` ... ```)
 * 2. Inline code (` ... `)
 * 3. URLs (http://, https://)
 * 4. @mentions (@username, @channel, @here)
 *
 * @param text - The input text to tokenize
 * @param mentionMap - Optional map of username -> userId for resolving mention user IDs
 * @returns Array of tokens for rendering
 */
export function tokenize(
  text: string,
  mentionMap?: Record<string, string>
): MessageToken[] {
  if (!text) {
    return [];
  }

  const tokens: MessageToken[] = [];

  // Phase 1: Extract fenced code blocks
  const { blocks: codeBlocks, segments: afterCodeBlocks } =
    parseCodeBlocks(text);

  // Build a map of what tokens to insert at what positions
  type TokenWithPosition = { position: number; tokens: MessageToken[] };
  const tokenGroups: TokenWithPosition[] = [];

  // Add code block tokens
  for (const block of codeBlocks) {
    tokenGroups.push({
      position: block.startIndex,
      tokens: [
        {
          type: "code-block",
          content: block.code,
          language: block.language,
        },
      ],
    });
  }

  // Phase 2 & 3 & 4: Process remaining text segments for inline code, URLs, and mentions
  for (const segment of afterCodeBlocks) {
    // Phase 2: Extract inline code from this segment
    const { codes: inlineCodes, segments: afterInlineCode } = parseInlineCode(
      segment.content
    );

    // Add inline code tokens
    for (const code of inlineCodes) {
      tokenGroups.push({
        position: segment.startIndex + code.startIndex,
        tokens: [
          {
            type: "inline-code",
            content: code.code,
          },
        ],
      });
    }

    // Phase 3 & 4: Parse URLs and mentions from remaining text
    for (const textSeg of afterInlineCode) {
      const segmentTokens = parseUrlsAndMentions(textSeg.content, mentionMap);

      // Adjust for segment position and add
      if (segmentTokens.length > 0) {
        tokenGroups.push({
          position: segment.startIndex + textSeg.startIndex,
          tokens: segmentTokens,
        });
      }
    }
  }

  // Sort by position and flatten
  tokenGroups.sort((a, b) => a.position - b.position);
  for (const group of tokenGroups) {
    tokens.push(...group.tokens);
  }

  return tokens;
}

// ============================================
// Autocomplete Functions (unchanged)
// ============================================

/**
 * Extract just the usernames from text (for quick lookup).
 *
 * @param text - The input text to parse
 * @returns Array of unique usernames (without @)
 */
export function extractUsernames(text: string): string[] {
  const { mentions } = parse(text);
  const usernames = mentions.map((m) => m.username);
  return [...new Set(usernames)]; // Deduplicate
}

/**
 * Extract special mentions from text.
 *
 * @param text - The input text to parse
 * @returns Array of special mention types present
 */
export function extractSpecialMentions(text: string): SpecialMention[] {
  const { specialMentions } = parse(text);
  const types = specialMentions.map((m) => m.type);
  return [...new Set(types)]; // Deduplicate
}

/**
 * Get autocomplete context based on cursor position in text.
 * Used to determine if/when to show the mention autocomplete dropdown.
 *
 * @param text - The full input text
 * @param cursorPosition - Current cursor position (0-indexed)
 * @returns AutocompleteContext with query and trigger position
 */
export function getAutocompleteContext(
  text: string,
  cursorPosition: number
): AutocompleteContext {
  const inactive: AutocompleteContext = {
    isActive: false,
    query: "",
    triggerIndex: -1,
    cursorIndex: cursorPosition,
  };

  if (cursorPosition === 0 || !text) {
    return inactive;
  }

  // Look backwards from cursor to find @
  const textBeforeCursor = text.slice(0, cursorPosition);

  // Find the last @ before cursor
  const lastAtIndex = textBeforeCursor.lastIndexOf("@");

  if (lastAtIndex === -1) {
    return inactive;
  }

  // Check for escaped @@ (double @)
  if (lastAtIndex > 0 && text[lastAtIndex - 1] === "@") {
    return inactive;
  }

  // Get text between @ and cursor
  const query = textBeforeCursor.slice(lastAtIndex + 1);

  // Check if query is valid (only alphanumeric and underscores, starts with letter or empty)
  if (query && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(query) && !/^$/.test(query)) {
    // Allow empty query (just typed @) or first char must be letter
    if (query.length > 0 && !/^[a-zA-Z]/.test(query)) {
      return inactive;
    }
    // If has invalid chars (space, punctuation), deactivate
    if (/[^a-zA-Z0-9_]/.test(query)) {
      return inactive;
    }
  }

  // Check if @ is at start of text or preceded by whitespace/punctuation
  if (lastAtIndex > 0) {
    const charBefore = text[lastAtIndex - 1];
    // @ must be preceded by space, newline, or start of string
    if (!/\s/.test(charBefore)) {
      return inactive;
    }
  }

  return {
    isActive: true,
    query,
    triggerIndex: lastAtIndex,
    cursorIndex: cursorPosition,
  };
}

/**
 * Replace a mention in text after user selects from autocomplete.
 *
 * @param text - Original text
 * @param triggerIndex - Position of @ in text
 * @param cursorIndex - Current cursor position
 * @param selectedUsername - The username to insert
 * @returns Object with new text and new cursor position
 */
export function replaceMention(
  text: string,
  triggerIndex: number,
  cursorIndex: number,
  selectedUsername: string
): { text: string; cursorPosition: number } {
  const before = text.slice(0, triggerIndex);
  const after = text.slice(cursorIndex);
  const mention = `@${selectedUsername} `; // Add trailing space

  return {
    text: before + mention + after,
    cursorPosition: before.length + mention.length,
  };
}

/**
 * Check if a username matches a search query (for filtering autocomplete).
 *
 * @param username - The username to check
 * @param query - The search query (without @)
 * @returns true if username matches query
 */
export function matchesQuery(username: string, query: string): boolean {
  if (!query) return true; // Empty query matches all
  const lowerUsername = username.toLowerCase();
  const lowerQuery = query.toLowerCase();
  return lowerUsername.startsWith(lowerQuery);
}
