/**
 * Types for the @mention system
 *
 * @deprecated Import from '$lib/types/messageTokens' instead.
 * This file re-exports for backward compatibility.
 */

// Re-export all types from messageTokens for backward compatibility
export {
  type ParsedMention,
  type SpecialMention,
  type ParsedSpecialMention,
  type MessageTokenType,
  type MessageToken,
  type AutocompleteContext,
  type MentionableUser,
  type ParseResult,
  type CodeBlockMatch,
  type InlineCodeMatch,
  type UrlMatch,
  type TextSegment,
} from "./messageTokens";
