export interface PageUrlRules {
  keepQueryParams: ReadonlySet<string>;
  normalizePath: (path: string) => string;
}

/**
 * The URL Matomo sees: origin + normalized path + whitelisted query parameters.
 * Everything else (other parameters such as OAuth `?code=`, the #fragment, credentials) is dropped.
 * Returns `null` for input that is not an http(s) URL.
 */
export function buildPageUrl(input: string, baseHref: string, rules: PageUrlRules): string | null {
  const parsed = parseUrl(input, baseHref);
  if (parsed === null) return null;

  const path = normalizePathname(parsed.pathname, rules.normalizePath);
  const query = keepQueryParams(parsed.search, rules.keepQueryParams);
  return `${parsed.origin}${path}${query}`;
}

function parseUrl(input: string, baseHref: string): URL | null {
  try {
    const parsed = new URL(input, baseHref);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string, normalize: (path: string) => string): string {
  try {
    const normalized = normalize(pathname);
    if (typeof normalized === 'string' && normalized.length > 0) {
      return normalized.startsWith('/') ? normalized : `/${normalized}`;
    }
  } catch {
    // A faulty normalizer must not stop the page view: fall back to the raw path.
  }
  return pathname;
}

/** Filters the raw query string so the surviving parameters keep their original encoding and order. */
function keepQueryParams(search: string, keep: ReadonlySet<string>): string {
  if (keep.size === 0 || search.length <= 1) return '';

  const kept = search
    .slice(1)
    .split('&')
    .filter((pair) => pair.length > 0 && keep.has(decodeParamName(pair)));
  return kept.length > 0 ? `?${kept.join('&')}` : '';
}

function decodeParamName(pair: string): string {
  const rawName = pair.split('=')[0] ?? '';
  try {
    return decodeURIComponent(rawName.replace(/\+/g, ' '));
  } catch {
    return rawName;
  }
}
