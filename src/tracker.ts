import { resolveConfig } from './config';
import { dimensionCommand, toDimensionEntries } from './dimensions';
import type { DimensionEntry } from './dimensions';
import {
  cartUpdateCommand,
  clearCartCommand,
  clearProductViewCommand,
  itemCommands,
  normalizeProduct,
  orderCommand,
  productViewCommand,
} from './ecommerce';
import type { ProductView } from './ecommerce';
import { buildEventCommand, cleanText, isFiniteNumber } from './event';
import { buildInitCommands } from './init-commands';
import { createLogger } from './logger';
import { buildPageUrl, buildSameOriginReferrerUrl } from './page-url';
import { discardQueuedCommands, enqueue, isBrowser } from './queue';
import { injectMatomoScript } from './script';
import { buildSiteSearchCommand } from './site-search';
import { createTabMemory } from './tab-memory';
import type {
  MatomoCommand,
  MatomoEcommerce,
  MatomoTracker,
  MatomoTrackerOptions,
  PageView,
  SiteSearch,
  TrackedEvent,
  UserIdentity,
} from './types';

const NEW_VISIT_PARAMETER = 'new_visit=1';
const ERROR_EVENT_CATEGORY = 'Error';

interface Identity {
  userId: string;
  key: string;
  dimensionIds: number[];
}

interface TrackerState {
  started: boolean;
  scriptFailed: boolean;
  lastViewUrl: string | null;
  newVisitPending: boolean;
  pendingProduct: ProductView | null;
  identity: Identity | null;
  errorEventsOnPage: number;
  trackedOrderIds: Set<string>;
}

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
export function createMatomoTracker(options: MatomoTrackerOptions): MatomoTracker {
  const config = resolveConfig(options);
  const logger = createLogger(options.debug === true);
  const memory = createTabMemory(config.siteId);
  const state: TrackerState = {
    started: false,
    scriptFailed: false,
    lastViewUrl: null,
    newVisitPending: false,
    pendingProduct: null,
    identity: null,
    errorEventsOnPage: 0,
    trackedOrderIds: new Set(),
  };

  const isActive = (): boolean => config.enabled && !state.scriptFailed && isBrowser();

  /** Returns whether the commands were queued, all of them or none. */
  function sendAll(commands: MatomoCommand[], options: { useReserve?: boolean } = {}): boolean {
    if (!enqueue(commands, options)) {
      logger.warn('queue is full, commands dropped', commands);
      return false;
    }
    commands.forEach((command) => logger.command(command));
    return true;
  }

  const send = (command: MatomoCommand): boolean => sendAll([command]);

  function start(): void {
    if (state.started) return;
    state.started = true;
    state.newVisitPending = memory.readNewVisitPending();

    const href = window.location.href;
    const page = {
      currentUrl: buildPageUrl(href, href, config),
      sameOriginReferrerUrl: buildSameOriginReferrerUrl(document.referrer, href, config),
    };
    sendAll(buildInitCommands(config, page));
    injectMatomoScript(`${config.baseUrl}/matomo.js`, () => turnTrackingOff('matomo.js could not be loaded'));
  }

  function turnTrackingOff(reason: string): void {
    state.scriptFailed = true;
    discardQueuedCommands();
    logger.warn(`${reason}, tracking is off`);
  }

  function run(action: () => void): void {
    if (!isActive()) return;
    try {
      start();
      action();
    } catch (error) {
      logger.warn('call failed', error);
    }
  }

  /** Kept in the tab's memory too, so a hard reload before the next page view does not forget it. */
  function setNewVisitPending(pending: boolean): void {
    state.newVisitPending = pending;
    memory.writeNewVisitPending(pending);
  }

  function isAccountSwitch(userId: string): boolean {
    const previousUserId = state.identity?.userId ?? memory.readUserId();
    return previousUserId !== null && previousUserId !== undefined && previousUserId !== userId;
  }

  /** The new dimensions replace the previous identity's: any it no longer has are removed. */
  function identityDimensionCommands(entries: DimensionEntry[]): MatomoCommand[] {
    const removed = (state.identity?.dimensionIds ?? [])
      .filter((id) => !entries.some(([entryId]) => entryId === id))
      .map((id): DimensionEntry => [id, null]);
    return [...entries, ...removed].sort(([left], [right]) => left - right).map(dimensionCommand);
  }

  function identify(user: UserIdentity): void {
    run(() => {
      const userId = normalizeUserId(user?.userId);
      if (!userId) {
        logger.warn('identify() ignored: userId is empty');
        return;
      }

      const entries = toDimensionEntries(user.dimensions);
      const key = JSON.stringify([userId, entries]);
      if (state.identity?.key === key) return;

      const switchesAccount = isAccountSwitch(userId);
      if (!sendAll([['setUserId', userId], ...identityDimensionCommands(entries)])) return;

      if (switchesAccount) setNewVisitPending(true);
      state.identity = {
        userId,
        key,
        dimensionIds: entries.filter(([, value]) => value !== null).map(([id]) => id),
      };
      memory.writeUserId(userId);
    });
  }

  function reset(): void {
    run(() => {
      const deletions = (state.identity?.dimensionIds ?? []).map((id): MatomoCommand => ['deleteCustomDimension', id]);
      // Matomo keeps the previous page as the referrer otherwise, and the new visit would open with it.
      const clearingCommands: MatomoCommand[] = [['resetUserId'], ...deletions, ['setReferrerUrl', '']];

      state.identity = null;
      state.lastViewUrl = null;
      state.pendingProduct = null;
      memory.forgetUserId();
      setNewVisitPending(true);

      // These must reach matomo.js before the next hit, whatever the queue holds: without them that hit
      // would go out as a new visit that still carries the previous user's id and dimensions. If even
      // the reserve is full, tracking stops rather than misattribute everything that follows.
      if (!sendAll(clearingCommands, { useReserve: true })) turnTrackingOff('the user id could not be cleared');
    });
  }

  function setDimensions(dimensions: UserIdentity['dimensions']): void {
    run(() => void sendAll(toDimensionEntries(dimensions).map(dimensionCommand)));
  }

  function pageViewCommands(url: string, title: string): MatomoCommand[] {
    const commands: MatomoCommand[] = [];
    if (state.lastViewUrl !== null) commands.push(['setReferrerUrl', state.lastViewUrl]);
    commands.push(['setCustomUrl', url], ['setDocumentTitle', title]);
    if (state.pendingProduct !== null) commands.push(productViewCommand(state.pendingProduct));

    // The new visit flag applies to every request after it, so it is set for this one hit and cleared right after.
    if (state.newVisitPending) {
      commands.push(['appendToTrackingUrl', NEW_VISIT_PARAMETER], ['trackPageView'], ['appendToTrackingUrl', '']);
    } else {
      commands.push(['trackPageView']);
    }

    // Like the new visit flag, the product view would stick to every later request: it is for this one hit.
    if (state.pendingProduct !== null) commands.push(clearProductViewCommand());
    return commands;
  }

  function trackPageView(view?: PageView): void {
    run(() => {
      const url = buildPageUrl(view?.url ?? window.location.href, window.location.href, config);
      if (url === null) {
        logger.warn('page view dropped: not an http(s) URL', view?.url);
        return;
      }
      if (view?.force !== true && url === state.lastViewUrl) {
        // A product viewed again on the page already tracked (a remounted component) belongs to that page:
        // kept pending, it would ride on the next page instead.
        state.pendingProduct = null;
        return;
      }
      if (!sendAll(pageViewCommands(url, view?.title ?? document.title))) return;

      state.lastViewUrl = url;
      state.errorEventsOnPage = 0;
      state.pendingProduct = null;
      if (state.newVisitPending) setNewVisitPending(false);
    });
  }

  /** Returns whether an event was actually sent. */
  function sendEvent(event: TrackedEvent): boolean {
    const command = buildEventCommand(event, logger);
    return command !== null && send(command);
  }

  function trackEvent(event: TrackedEvent): void {
    run(() => void sendEvent(event));
  }

  function trackSiteSearch(search: SiteSearch): void {
    run(() => {
      const command = buildSiteSearchCommand(search);
      if (command === null) {
        logger.warn('site search dropped: keyword is empty', search);
        return;
      }
      send(command);
    });
  }

  function trackError(kind: string): void {
    run(() => {
      if (state.errorEventsOnPage >= config.maxErrorEventsPerPage) {
        logger.warn(`error event "${kind}" dropped: ${config.maxErrorEventsPerPage} per page reached`);
        return;
      }
      if (sendEvent({ category: ERROR_EVENT_CATEGORY, action: kind })) state.errorEventsOnPage += 1;
    });
  }

  const ecommerce: MatomoEcommerce = {
    productView(product) {
      run(() => {
        const view = normalizeProduct(product);
        if (view === null) {
          logger.warn('productView ignored: sku is required', product);
          return;
        }
        state.pendingProduct = view;
      });
    },

    cartUpdate(items, grandTotal) {
      run(() => {
        if (!isFiniteNumber(grandTotal)) {
          logger.warn('cartUpdate ignored: grandTotal must be a number', grandTotal);
          return;
        }
        sendAll([clearCartCommand(), ...itemCommands(items), cartUpdateCommand(grandTotal)]);
      });
    },

    order(order) {
      run(() => {
        const orderId = cleanText(order?.orderId);
        if (!orderId || !isFiniteNumber(order.grandTotal)) {
          logger.warn('order ignored: orderId and a numeric grandTotal are required', order);
          return;
        }
        if (state.trackedOrderIds.has(orderId)) {
          logger.warn(`order "${orderId}" ignored: it was already tracked in this page session`);
          return;
        }
        if (sendAll([clearCartCommand(), ...itemCommands(order.items), orderCommand(order, orderId)])) {
          state.trackedOrderIds.add(orderId);
        }
      });
    },
  };

  function push(command: unknown[]): void {
    run(() => {
      if (!Array.isArray(command) || command.length === 0) {
        logger.warn('push() ignored: a command is a non-empty array', command);
        return;
      }
      send(command);
    });
  }

  return {
    get enabled() {
      return config.enabled && !state.scriptFailed;
    },
    identify,
    reset,
    setDimensions,
    trackPageView,
    trackEvent,
    trackSiteSearch,
    trackError,
    ecommerce,
    push,
  };
}

function normalizeUserId(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
