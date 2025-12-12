/**
 * MentionParser - Utilities for parsing @mentions from text
 *
 * Handles:
 * - @username mentions (alphanumeric + underscores)
 * - @channel and @here special mentions
 * - Edge cases: punctuation, possessives, emails, escaped @@
 */

import type {
  ParsedMention,
  ParsedSpecialMention,
  ParseResult,
  MessageToken,
  AutocompleteContext,
  SpecialMention,
} from "$lib/types/mentions";
import type { Id } from "../../../convex/_generated/dataModel";

// Regex pattern for valid username characters (letters, numbers, underscores)
// Matches @username but stops at punctuation, spaces, or special chars
// NOTE: Keep in sync with convex/messages.ts (server-side parser)
const MENTION_PATTERN = /@([a-zA-Z][a-zA-Z0-9_]*)/g;

// Special mention patterns
const SPECIAL_MENTIONS: SpecialMention[] = ["channel", "here"];

/**
 * Parse all mentions from a text string.
 *
 * @param text - The input text to parse
 * @returns ParseResult with arrays of regular and special mentions
 *
 * @example
 * parse("Hello @john and @channel!")
 * // Returns: { mentions: [{raw: "@john", username: "john", ...}], specialMentions: [{type: "channel", ...}] }
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

    // Check for escaped @@ (skip if preceded by @)
    if (startIndex > 0 && text[startIndex - 1] === "@") {
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
 * Tokenize text into segments for rendering with highlighted mentions.
 *
 * @param text - The input text to tokenize
 * @param mentionMap - Optional map of username -> userId for resolving mention user IDs
 * @returns Array of tokens for rendering
 *
 * @example
 * tokenize("Hello @john!", { john: "user123" })
 * // Returns: [
 * //   { type: "text", content: "Hello " },
 * //   { type: "mention", content: "@john", username: "john", userId: "user123" },
 * //   { type: "text", content: "!" }
 * // ]
 */
export function tokenize(
  text: string,
  mentionMap?: Record<string, string>
): MessageToken[] {
  const { mentions, specialMentions } = parse(text);

  // Combine all mentions and sort by position
  const allMentions = [
    ...mentions.map((m) => ({ ...m, isMention: true as const })),
    ...specialMentions.map((m) => ({ ...m, isMention: false as const })),
  ].sort((a, b) => a.startIndex - b.startIndex);

  if (allMentions.length === 0) {
    // No mentions, return single text token
    return text ? [{ type: "text", content: text }] : [];
  }

  const tokens: MessageToken[] = [];
  let lastIndex = 0;

  for (const mention of allMentions) {
    // Add text before this mention
    if (mention.startIndex > lastIndex) {
      tokens.push({
        type: "text",
        content: text.slice(lastIndex, mention.startIndex),
      });
    }

    // Add the mention token
    if (mention.isMention) {
      const m = mention as ParsedMention & { isMention: true };
      // Look up userId from mentionMap if provided
      const resolvedUserId = mentionMap?.[m.username];
      tokens.push({
        type: "mention",
        content: m.raw,
        username: m.username,
        userId: resolvedUserId as Id<"users"> | undefined,
      });
    } else {
      const m = mention as ParsedSpecialMention & { isMention: false };
      tokens.push({
        type: "special-mention",
        content: m.raw,
        specialType: m.type,
      });
    }

    lastIndex = mention.endIndex;
  }

  // Add remaining text after last mention
  if (lastIndex < text.length) {
    tokens.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return tokens;
}

/**
 * Get autocomplete context based on cursor position in text.
 * Used to determine if/when to show the mention autocomplete dropdown.
 *
 * @param text - The full input text
 * @param cursorPosition - Current cursor position (0-indexed)
 * @returns AutocompleteContext with query and trigger position
 *
 * @example
 * getAutocompleteContext("Hello @jo", 9)
 * // Returns: { isActive: true, query: "jo", triggerIndex: 6, cursorIndex: 9 }
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
