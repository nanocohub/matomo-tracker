import { resolveConfig } from './config';
import { dimensionCommand, toDimensionEntries } from './dimensions';
import type { DimensionEntry } from './dimensions';
import {
  cartUpdateCommand,
  clearCartCommand,
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
  EcommerceItem,
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

  function send(command: MatomoCommand): void {
    if (enqueue(command)) {
      logger.command(command);
    } else {
      logger.warn('queue is full, command dropped', command);
    }
  }

  function start(): void {
    if (state.started) return;
    state.started = true;
    state.newVisitPending = memory.readNewVisitPending();

    const href = window.location.href;
    const page = {
      currentUrl: buildPageUrl(href, href, config),
      sameOriginReferrerUrl: buildSameOriginReferrerUrl(document.referrer, href, config),
    };
    buildInitCommands(config, page).forEach(send);
    injectMatomoScript(`${config.baseUrl}/matomo.js`, handleScriptFailure);
  }

  function handleScriptFailure(): void {
    state.scriptFailed = true;
    discardQueuedCommands();
    logger.warn('matomo.js could not be loaded, tracking is off');
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

  function sendDimensions(entries: DimensionEntry[]): void {
    entries.forEach((entry) => send(dimensionCommand(entry)));
  }

  /** Kept in the tab's memory too, so a hard reload before the next page view does not forget it. */
  function setNewVisitPending(pending: boolean): void {
    state.newVisitPending = pending;
    memory.writeNewVisitPending(pending);
  }

  /** The hit is sent as the first request of a new visit; the flag lives for this one request only. */
  function sendHit(hit: MatomoCommand): void {
    const startsNewVisit = state.newVisitPending;
    if (startsNewVisit) send(['appendToTrackingUrl', NEW_VISIT_PARAMETER]);
    send(hit);
    if (startsNewVisit) {
      send(['appendToTrackingUrl', '']);
      setNewVisitPending(false);
    }
  }

  function isAccountSwitch(userId: string): boolean {
    const previousUserId = state.identity?.userId ?? memory.readUserId();
    return previousUserId !== null && previousUserId !== undefined && previousUserId !== userId;
  }

  /** The new dimensions replace the previous identity's: any it no longer has are removed. */
  function applyIdentityDimensions(entries: DimensionEntry[]): void {
    const removed = (state.identity?.dimensionIds ?? [])
      .filter((id) => !entries.some(([entryId]) => entryId === id))
      .map((id): DimensionEntry => [id, null]);
    sendDimensions([...entries, ...removed].sort(([left], [right]) => left - right));
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

      if (isAccountSwitch(userId)) setNewVisitPending(true);
      send(['setUserId', userId]);
      applyIdentityDimensions(entries);
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
      send(['resetUserId']);
      (state.identity?.dimensionIds ?? []).forEach((id) => send(['deleteCustomDimension', id]));
      // Matomo keeps the previous page as the referrer otherwise, and the new visit would open with it.
      send(['setReferrerUrl', '']);
      state.identity = null;
      state.lastViewUrl = null;
      state.pendingProduct = null;
      memory.forgetUserId();
      setNewVisitPending(true);
    });
  }

  function setDimensions(dimensions: UserIdentity['dimensions']): void {
    run(() => sendDimensions(toDimensionEntries(dimensions)));
  }

  function sendPendingProductView(): void {
    if (state.pendingProduct === null) return;
    send(productViewCommand(state.pendingProduct));
    state.pendingProduct = null;
  }

  function sendPageView(url: string, title: string): void {
    if (state.lastViewUrl !== null) send(['setReferrerUrl', state.lastViewUrl]);
    send(['setCustomUrl', url]);
    send(['setDocumentTitle', title]);
    sendPendingProductView();
    sendHit(['trackPageView']);
  }

  function trackPageView(view?: PageView): void {
    run(() => {
      const url = buildPageUrl(view?.url ?? window.location.href, window.location.href, config);
      if (url === null) {
        logger.warn('page view dropped: not an http(s) URL', view?.url);
        return;
      }
      if (view?.force !== true && url === state.lastViewUrl) return;

      sendPageView(url, view?.title ?? document.title);
      state.lastViewUrl = url;
      state.errorEventsOnPage = 0;
    });
  }

  /** Returns whether an event was actually sent. */
  function sendEvent(event: TrackedEvent): boolean {
    const command = buildEventCommand(event, logger);
    if (command !== null) send(command);
    return command !== null;
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

  function sendCart(items: EcommerceItem[]): void {
    send(clearCartCommand());
    itemCommands(items).forEach(send);
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
        sendCart(items);
        send(cartUpdateCommand(grandTotal));
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
        sendCart(order.items);
        send(orderCommand(order, orderId));
        state.trackedOrderIds.add(orderId);
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
