import { MatomoTracker } from './index.js';

interface MatomoPageViewOptions {
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
declare function useMatomoPageView(tracker: Pick<MatomoTracker, 'enabled' | 'trackPageView'>, { path, title, ready }: MatomoPageViewOptions): void;

export { useMatomoPageView };
export type { MatomoPageViewOptions };
