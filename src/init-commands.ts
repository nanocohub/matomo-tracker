import type { ResolvedConfig } from './config';
import type { MatomoCommand } from './types';

export interface InitPage {
  /** The sanitized URL of the page the tracker starts on. */
  currentUrl: string | null;
  /** The sanitized `document.referrer`, when it is a page of the same origin. */
  sameOriginReferrerUrl: string | null;
}

/**
 * The configuration pushed once, before any hit.
 *
 * Setting the page URL up front means an event raised before the first page view (a JS error
 * on an OAuth callback page, say) reports that URL instead of `location.href` with its `?code=`
 * still attached. A same-origin referrer is set for the same reason: the first page view of
 * the page the callback redirected to would otherwise carry the callback URL as `urlref`.
 */
export function buildInitCommands(config: ResolvedConfig, page: InitPage): MatomoCommand[] {
  const commands: Array<MatomoCommand | null> = [
    ['setTrackerUrl', `${config.baseUrl}/matomo.php`],
    ['setSiteId', config.siteId],
    config.requestMethod ? ['setRequestMethod', config.requestMethod] : null,
    config.domains.length > 0 ? ['setDomains', config.domains] : null,
    config.cookieDomain ? ['setCookieDomain', config.cookieDomain] : null,
    config.requireCookieConsent ? ['requireCookieConsent'] : null,
    page.currentUrl ? ['setCustomUrl', page.currentUrl] : null,
    page.sameOriginReferrerUrl ? ['setReferrerUrl', page.sameOriginReferrerUrl] : null,
    config.linkTracking ? ['enableLinkTracking'] : null,
    config.heartbeatSeconds === false ? null : ['enableHeartBeatTimer', config.heartbeatSeconds],
    config.jsErrorTracking ? ['enableJSErrorTracking'] : null,
  ];
  return commands.filter((command): command is MatomoCommand => command !== null);
}
