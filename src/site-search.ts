import { isFiniteNumber } from './event';
import { cleanText, truncateText } from './text';
import type { MatomoCommand, SiteSearch } from './types';

export const MAX_SEARCH_KEYWORD_LENGTH = 100;

/**
 * Builds the `trackSiteSearch` command, or returns `null` for a blank keyword.
 *
 * matomo.js sends whatever it is given for the results count, so an unknown count must be
 * left out entirely: passing `false` would be recorded as `search_count=false`, a zero.
 */
export function buildSiteSearchCommand(search: SiteSearch): MatomoCommand | null {
  const keyword = truncateText(cleanText(search?.keyword), MAX_SEARCH_KEYWORD_LENGTH);
  if (!keyword) return null;

  const category = cleanText(search.category) || false;
  if (isFiniteNumber(search.resultsCount) && search.resultsCount >= 0) {
    return ['trackSiteSearch', keyword, category, search.resultsCount];
  }
  return category === false ? ['trackSiteSearch', keyword] : ['trackSiteSearch', keyword, category];
}
