/**
 * Types for message tokenization and formatting
 *
 * Extends the original mention system to support:
 * - @mentions (user and special)
 * - URLs (clickable links)
 * - Code blocks (fenced with ```)
 * - Inline code (single backticks)
 */

import type { Id } from "../../../convex/_generated/dataModel";

/**
 * A parsed mention extracted from text
 */
export interface ParsedMention {
  /** The raw text including @ symbol (e.g., "@john") */
  raw: string;
  /** The username without @ (e.g., "john") */
  username: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text (exclusive) */
  endIndex: number;
  /** Resolved user ID (set after lookup) */
  userId?: Id<"users">;
}

/**
 * Special broadcast mentions
 */
export type SpecialMention = "channel" | "here";

/**
 * A parsed special mention (@channel, @here)
 */
export interface ParsedSpecialMention {
  /** The type of special mention */
  type: SpecialMention;
  /** The raw text including @ symbol */
  raw: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text (exclusive) */
  endIndex: number;
}

/**
 * Token types for rendering messages with formatting
 */
export type MessageTokenType =
  | "text"
  | "mention"
  | "special-mention"
  | "url"
  | "code-block"
  | "inline-code";

/**
 * A token in the tokenized message for rendering
 */
export interface MessageToken {
  /** Type of this token */
  type: MessageTokenType;
  /** The text content to display */
  content: string;
  /** For mention tokens: the username */
  username?: string;
  /** For mention tokens: the user ID if resolved */
  userId?: Id<"users">;
  /** For special mention tokens: the type */
  specialType?: SpecialMention;
  /** For URL tokens: the sanitized URL */
  url?: string;
  /** For code-block tokens: the language identifier */
  language?: string;
}

/**
 * Context for autocomplete when user is typing @ mention
 */
export interface AutocompleteContext {
  /** Whether autocomplete should be shown */
  isActive: boolean;
  /** The partial username being typed (without @) */
  query: string;
  /** Position of @ in the text */
  triggerIndex: number;
  /** Current cursor position */
  cursorIndex: number;
}

/**
 * A user that can be mentioned
 */
export interface MentionableUser {
  /** User ID */
  id: Id<"users">;
  /** Display name */
  name: string;
  /** Optional avatar URL */
  avatarUrl?: string;
}

/**
 * Result from parsing all mentions in a message
 */
export interface ParseResult {
  /** Regular @user mentions */
  mentions: ParsedMention[];
  /** Special @channel/@here mentions */
  specialMentions: ParsedSpecialMention[];
}

// ============================================
// Internal parser types (used by messageParser)
// ============================================

/**
 * A matched fenced code block
 */
export interface CodeBlockMatch {
  /** Full match including backticks */
  raw: string;
  /** Code content only (without backticks) */
  code: string;
  /** Language identifier if provided */
  language?: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text (exclusive) */
  endIndex: number;
}

/**
 * A matched inline code span
 */
export interface InlineCodeMatch {
  /** Full match including backticks */
  raw: string;
  /** Code content only (without backticks) */
  code: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text (exclusive) */
  endIndex: number;
}

/**
 * A matched URL
 */
export interface UrlMatch {
  /** The raw URL text as it appears */
  raw: string;
  /** The sanitized URL (or null if invalid) */
  url: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text (exclusive) */
  endIndex: number;
}

/**
 * A text segment for intermediate parsing
 */
export interface TextSegment {
  /** The text content */
  content: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text (exclusive) */
  endIndex: number;
}
