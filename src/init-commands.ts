import type { ResolvedConfig } from './config';
import type { MatomoCommand } from './types';

/**
 * The configuration pushed once, before any hit.
 *
 * `currentUrl` is the sanitized URL of the page the tracker starts on. Setting it up front
 * means an event raised before the first page view (a JS error on an OAuth callback page,
 * say) reports that URL instead of `location.href` with its `?code=` still attached.
 */
export function buildInitCommands(config: ResolvedConfig, currentUrl: string | null): MatomoCommand[] {
  const commands: Array<MatomoCommand | null> = [
    ['setTrackerUrl', `${config.baseUrl}/matomo.php`],
    ['setSiteId', config.siteId],
    config.requestMethod ? ['setRequestMethod', config.requestMethod] : null,
    config.domains.length > 0 ? ['setDomains', config.domains] : null,
    config.cookieDomain ? ['setCookieDomain', config.cookieDomain] : null,
    config.requireCookieConsent ? ['requireCookieConsent'] : null,
    currentUrl ? ['setCustomUrl', currentUrl] : null,
    config.linkTracking ? ['enableLinkTracking'] : null,
    config.heartbeatSeconds === false ? null : ['enableHeartBeatTimer', config.heartbeatSeconds],
    config.jsErrorTracking ? ['enableJSErrorTracking'] : null,
  ];
  return commands.filter((command): command is MatomoCommand => command !== null);
}
