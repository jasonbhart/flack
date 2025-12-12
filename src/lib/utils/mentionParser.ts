/**
 * MentionParser - Re-exports from messageParser for backward compatibility
 *
 * @deprecated Import from '$lib/utils/messageParser' instead.
 */

export {
  parse,
  tokenize,
  extractUsernames,
  extractSpecialMentions,
  getAutocompleteContext,
  replaceMention,
  matchesQuery,
  parseUrls,
  parseCodeBlocks,
  parseInlineCode,
  sanitizeUrl,
} from "./messageParser";
