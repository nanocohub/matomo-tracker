import type { MatomoTrackerOptions } from './types';

const DEFAULT_HEARTBEAT_SECONDS = 15;
const DEFAULT_MAX_ERROR_EVENTS_PER_PAGE = 10;

export interface ResolvedConfig {
  enabled: boolean;
  baseUrl: string;
  siteId: number;
  linkTracking: boolean;
  heartbeatSeconds: number | false;
  jsErrorTracking: boolean;
  keepQueryParams: ReadonlySet<string>;
  normalizePath: (path: string) => string;
  domains: string[];
  cookieDomain: string | undefined;
  requireCookieConsent: boolean;
  requestMethod: 'GET' | 'POST' | undefined;
  maxErrorEventsPerPage: number;
}

export function resolveConfig(options: MatomoTrackerOptions): ResolvedConfig {
  const baseUrl = parseHttpsBaseUrl(options.url);
  const siteId = parsePositiveInteger(options.siteId);

  return {
    enabled: options.enabled !== false && baseUrl !== null && siteId !== null,
    baseUrl: baseUrl ?? '',
    siteId: siteId ?? 0,
    linkTracking: options.linkTracking !== false,
    heartbeatSeconds: resolveHeartbeat(options.heartbeatSeconds),
    jsErrorTracking: options.jsErrorTracking === true,
    keepQueryParams: new Set(options.keepQueryParams ?? []),
    normalizePath: options.normalizePath ?? identity,
    domains: options.domains ?? [],
    cookieDomain: options.cookieDomain || undefined,
    requireCookieConsent: options.requireCookieConsent === true,
    requestMethod: options.requestMethod,
    maxErrorEventsPerPage: resolveErrorCap(options.maxErrorEventsPerPage),
  };
}

function identity(path: string): string {
  return path;
}

function parseHttpsBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveHeartbeat(value: number | false | undefined): number | false {
  if (value === undefined) return DEFAULT_HEARTBEAT_SECONDS;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : false;
}

function resolveErrorCap(value: number | undefined): number {
  const isValid = typeof value === 'number' && Number.isInteger(value) && value >= 0;
  return isValid ? value : DEFAULT_MAX_ERROR_EVENTS_PER_PAGE;
}
