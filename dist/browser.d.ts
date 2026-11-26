/** A command for Matomo's `_paq` queue, e.g. `['trackEvent', 'Orders', 'Export']`. */
type MatomoCommand = unknown[];
/** `null`, `undefined` and blank strings all mean "remove this dimension". */
type DimensionValue = string | null | undefined;
/** Custom dimension id -> value. */
type DimensionMap = Record<number, DimensionValue>;
interface MatomoTrackerOptions {
    /** Matomo base URL, e.g. `https://analytics.nanoco.com.vn`. Must be https. */
    url: string;
    /** Matomo site id. A positive integer, as a number or a numeric string. */
    siteId: number | string | undefined;
    /** Set to `false` to turn every call into a no-op. Default `true`. */
    enabled?: boolean;
    /** Matomo `enableLinkTracking` (outlinks and downloads). Default `true`. */
    linkTracking?: boolean;
    /** Matomo heartbeat interval in seconds, or `false` to turn it off. Default `15`. */
    heartbeatSeconds?: number | false;
    /** Matomo `enableJSErrorTracking`. Default `true`. */
    jsErrorTracking?: boolean;
    /** Page URLs keep ONLY these query parameters. Default: none. The #fragment is always dropped. */
    keepQueryParams?: string[];
    /** Maps a pathname before it is reported, e.g. `/orders/123` -> `/orders/:id`. Default: identity. */
    normalizePath?: (path: string) => string;
    /** Matomo `setDomains`: hosts that count as internal links. */
    domains?: string[];
    /** Matomo `setCookieDomain`, e.g. `*.nanoco.com.vn`. */
    cookieDomain?: string;
    /** Matomo `requireCookieConsent`. Call `push(['rememberCookieConsentGiven'])` once the visitor agrees. Default `false`. */
    requireCookieConsent?: boolean;
    /**
     * Matomo `setRequestMethod`. Leave unset for Matomo's default (GET). `POST` avoids URL
     * length limits but needs the page origin to be allowed by Matomo's CORS settings.
     */
    requestMethod?: 'GET' | 'POST';
    /** `trackError` sends at most this many events per page view. Default `10`. */
    maxErrorEventsPerPage?: number;
    /** Logs every command and warns about suspicious event names to the console. Default `false`. */
    debug?: boolean;
}
interface UserIdentity {
    /** A stable internal id when possible. Emails work but leak PII into Matomo. */
    userId: string;
    /** Visit-scope custom dimensions that describe this user. Cleared again by `reset()`. */
    dimensions?: DimensionMap;
}
interface PageView {
    /** Absolute URL or path. Default `window.location.href`. */
    url?: string;
    /** Default `document.title`. */
    title?: string;
    /** Track even when the URL equals the last tracked page view. */
    force?: boolean;
}
interface TrackedEvent {
    category: string;
    action: string;
    /** Trimmed to 100 characters. Keep it low-cardinality: no ids, emails or free text. */
    name?: string;
    value?: number;
}
interface SiteSearch {
    keyword: string;
    category?: string;
    resultsCount?: number;
}
/** One category, or up to five (Matomo drops the rest). */
type EcommerceCategory = string | string[];
interface EcommerceProduct {
    sku: string;
    name?: string;
    category?: EcommerceCategory;
    price?: number;
}
interface EcommerceItem extends EcommerceProduct {
    /** Default `1`. */
    quantity?: number;
}
interface EcommerceOrder {
    orderId: string;
    grandTotal: number;
    subTotal?: number;
    tax?: number;
    shipping?: number;
    discount?: number;
    items: EcommerceItem[];
}
interface MatomoEcommerce {
    /** Applied to the next page view that is actually sent. */
    productView(product: EcommerceProduct): void;
    cartUpdate(items: EcommerceItem[], grandTotal: number): void;
    /** The same `orderId` twice in one page session is ignored. */
    order(order: EcommerceOrder): void;
}
interface MatomoTracker {
    /** `false` when the URL is not https, the site id is invalid or `enabled: false`. */
    readonly enabled: boolean;
    /** Sets the user id and its dimensions. Idempotent. A different user id starts a new visit at the next page view. */
    identify(user: UserIdentity): void;
    /** Logout. Clears the user id and its dimensions; the next page view starts a new visit. Sends no hit itself. */
    reset(): void;
    /** Non-identity dimensions. `null`/`undefined` removes one. */
    setDimensions(dimensions: DimensionMap): void;
    trackPageView(view?: PageView): void;
    trackEvent(event: TrackedEvent): void;
    trackSiteSearch(search: SiteSearch): void;
    /** Event category `Error`, action `kind`, capped per page view by `maxErrorEventsPerPage`. */
    trackError(kind: string): void;
    readonly ecommerce: MatomoEcommerce;
    /** Escape hatch for any other `_paq` command. Still SSR and disabled safe. */
    push(command: unknown[]): void;
}

/**
 * Creates a tracker. Nothing happens until it is first used: no script, no `_paq` writes.
 *
 * The rule every method keeps: analytics never throws and never changes what the app does.
 * Server side, with an invalid configuration, or after matomo.js failed to load, every
 * method is a no-op.
 */
declare function createMatomoTracker(options: MatomoTrackerOptions): MatomoTracker;

export { createMatomoTracker };
export type { DimensionMap, DimensionValue, EcommerceCategory, EcommerceItem, EcommerceOrder, EcommerceProduct, MatomoCommand, MatomoEcommerce, MatomoTracker, MatomoTrackerOptions, PageView, SiteSearch, TrackedEvent, UserIdentity };
