/**
 * Types for the @mention system
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
 * Token types for rendering messages with mentions
 */
export type MessageTokenType = "text" | "mention" | "special-mention";

/**
 * A token in the tokenized message for rendering
 */
export interface MessageToken {
  /** Type of this token */
  type: MessageTokenType;
  /** The text content */
  content: string;
  /** For mention tokens: the username */
  username?: string;
  /** For mention tokens: the user ID if resolved */
  userId?: Id<"users">;
  /** For special mention tokens: the type */
  specialType?: SpecialMention;
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
