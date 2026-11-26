import { createMatomoTracker } from '../src';
import type { MatomoTracker, MatomoTrackerOptions } from '../src';

export const MATOMO_URL = 'https://analytics.example.com';
export const PAGE_ORIGIN = 'https://app.example.com';

/** What a default tracker queues the first time it is used, on a page at `PAGE_ORIGIN/`. */
export const DEFAULT_INIT_COMMANDS: unknown[][] = [
  ['setTrackerUrl', `${MATOMO_URL}/matomo.php`],
  ['setSiteId', 7],
  ['setCustomUrl', `${PAGE_ORIGIN}/`],
  ['enableLinkTracking'],
  ['enableHeartBeatTimer', 15],
];

export function createTracker(overrides: Partial<MatomoTrackerOptions> = {}): MatomoTracker {
  return createMatomoTracker({ url: MATOMO_URL, siteId: 7, ...overrides });
}

export function queuedCommands(): unknown[][] {
  return (window as { _paq?: unknown[][] })._paq ?? [];
}

/** Everything queued after the one-time configuration. */
export function commandsAfterInit(): unknown[][] {
  return queuedCommands().slice(DEFAULT_INIT_COMMANDS.length);
}

/** A hard reload loses the queue and the scripts but keeps the tab's session storage. */
export function simulateHardReload(): void {
  delete (window as { _paq?: unknown })._paq;
  document.querySelectorAll('script').forEach((script) => script.remove());
}

export function navigateTo(path: string): void {
  window.history.replaceState(null, '', path);
}

/** What `document.referrer` returns for the page load under test; `tests/setup.ts` restores it. */
export function setReferrer(referrer: string): void {
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

export function matomoScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-nanoco-matomo]'));
}
