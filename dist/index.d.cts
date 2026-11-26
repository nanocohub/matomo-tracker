import { M as MatomoTrackerOptions, a as MatomoTracker } from './types-BFZaCOCH.cjs';
export { D as DimensionMap, b as DimensionValue, E as EcommerceCategory, c as EcommerceItem, d as EcommerceOrder, e as EcommerceProduct, f as MatomoCommand, g as MatomoEcommerce, P as PageView, S as SiteSearch, T as TrackedEvent, U as UserIdentity } from './types-BFZaCOCH.cjs';

/**
 * Creates a tracker. Nothing happens until it is first used: no script, no `_paq` writes.
 *
 * The rule every method keeps: analytics never throws and never changes what the app does.
 * Server side, with an invalid configuration, or after matomo.js failed to load, every
 * method is a no-op.
 *
 * Every operation that needs several commands queues them as one group, and changes the
 * tracker's own state only once the group was queued; see `enqueue`. The one exception is
 * `reset`, whose commands may use a reserve above the cap.
 */
declare function createMatomoTracker(options: MatomoTrackerOptions): MatomoTracker;

export { MatomoTracker, MatomoTrackerOptions, createMatomoTracker };
