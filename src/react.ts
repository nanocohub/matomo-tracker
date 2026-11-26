import { useEffect, useRef } from 'react';
import type { MatomoTracker } from './types';

export interface MatomoPageViewOptions {
  /** The current location, e.g. `router.asPath` or `usePathname()`. A page view is tracked whenever it changes. */
  path: string;
  /** Default `document.title` at the moment the page view is sent. */
  title?: string;
  /** Hold the page view back (`false`) until the page is ready, e.g. `router.isReady` or the data is loaded. Default `true`. */
  ready?: boolean;
}

/**
 * Tracks a page view whenever `path` changes while `ready` is not `false`.
 *
 * The view is sent in a timer after React has committed, so `document.title` already shows
 * the new page. Cleaning the timer up is what keeps StrictMode's double-run effects from
 * counting twice.
 */
export function useMatomoPageView(
  tracker: Pick<MatomoTracker, 'enabled' | 'trackPageView'>,
  { path, title, ready = true }: MatomoPageViewOptions,
): void {
  const latestTitle = useRef(title);

  useEffect(() => {
    latestTitle.current = title;
  });

  useEffect(() => {
    if (!ready || !tracker.enabled) return undefined;

    const timer = setTimeout(() => tracker.trackPageView({ url: path, title: latestTitle.current }), 0);
    return () => clearTimeout(timer);
  }, [tracker, path, ready]);
}
