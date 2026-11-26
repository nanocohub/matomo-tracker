/*
 * Every value the tracker hands to matomo.js ends up in `encodeURIComponent`, there or here, and that
 * throws a URIError on a lone UTF-16 surrogate: half of an emoji, left by a string cut in the middle.
 * A throw while matomo.js applies a hit loses that hit, and can leave state set for the ones after it.
 */

const SURROGATE_PAIR_OR_LONE_SURROGATE = /([\uD800-\uDBFF][\uDC00-\uDFFF])|[\uD800-\uDFFF]/g;
const REPLACEMENT_CHARACTER = '\uFFFD';
const ENDS_WITH_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

/** Replaces each lone surrogate with U+FFFD and keeps surrogate pairs. (`String#toWellFormed` is ES2024.) */
export function toWellFormed(text: string): string {
  return text.replace(SURROGATE_PAIR_OR_LONE_SURROGATE, (_match, pair: string | undefined) => {
    return pair || REPLACEMENT_CHARACTER;
  });
}

/** Trimmed, well-formed text, or `''` for anything that is not a string. */
export function cleanText(value: unknown): string {
  return typeof value === 'string' ? toWellFormed(value.trim()) : '';
}

/** Well-formed `text` cut to at most `maxLength` UTF-16 units, never between the two halves of a pair. */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return ENDS_WITH_HIGH_SURROGATE.test(cut) ? cut.slice(0, -1) : cut;
}
