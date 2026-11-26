import { describe, expect, it } from 'vitest';
import { DEFAULT_INIT_COMMANDS, PAGE_ORIGIN, createTracker, queuedCommands } from './helpers';

const CAP = 500;
const NEW_VISIT = ['appendToTrackingUrl', 'new_visit=1'];
const CLEAR_NEW_VISIT = ['appendToTrackingUrl', ''];

/** Fills the queue with fillers until exactly `room` more commands fit. The tracker must have started. */
function leaveRoom(room: number): void {
  const queue = queuedCommands();
  while (queue.length < CAP - room) queue.push(['filler']);
}

/** What matomo.js does when it loads: the queue is emptied (only the configuration is kept here). */
function drainQueue(): void {
  queuedCommands().length = DEFAULT_INIT_COMMANDS.length;
}

function count(name: string, value?: unknown): number {
  return queuedCommands().filter(([commandName, commandValue]) => {
    return commandName === name && (value === undefined || commandValue === value);
  }).length;
}

function trackerWithPendingNewVisit() {
  const tracker = createTracker();
  tracker.reset();
  return tracker;
}

describe('the new visit group at the queue cap', () => {
  it('is queued whole when it fits exactly', () => {
    const tracker = trackerWithPendingNewVisit();
    leaveRoom(5);

    tracker.trackPageView({ url: '/a' });

    expect(queuedCommands()).toHaveLength(CAP);
    expect(queuedCommands().slice(-5)).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/a`],
      ['setDocumentTitle', ''],
      NEW_VISIT,
      ['trackPageView'],
      CLEAR_NEW_VISIT,
    ]);
  });

  it('is not queued at all when one command short', () => {
    const tracker = trackerWithPendingNewVisit();
    leaveRoom(4);
    const queuedBefore = queuedCommands().length;

    tracker.trackPageView({ url: '/a' });

    expect(queuedCommands()).toHaveLength(queuedBefore);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
    'never leaves a new_visit=1 without the clear that follows it, with %i commands of room',
    (room) => {
      const tracker = trackerWithPendingNewVisit();
      leaveRoom(room);

      tracker.trackPageView({ url: '/a' });

      expect(count('appendToTrackingUrl', 'new_visit=1')).toBe(count('appendToTrackingUrl', ''));
    },
  );

  it('keeps the new visit pending after a dropped view and applies it once to the next view that fits', () => {
    const tracker = trackerWithPendingNewVisit();
    leaveRoom(4);
    tracker.trackPageView({ url: '/a' });
    drainQueue();

    tracker.trackPageView({ url: '/a' });
    tracker.trackPageView({ url: '/b' });

    expect(count('appendToTrackingUrl', 'new_visit=1')).toBe(1);
    expect(count('trackPageView')).toBe(2);
  });
});

describe('page views at the queue cap', () => {
  it('does not remember a view that was dropped, so the same url is tracked once there is room', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(2);
    tracker.trackPageView({ url: '/a' });
    drainQueue();

    tracker.trackPageView({ url: '/a' });

    expect(count('trackPageView')).toBe(1);
  });

  it('keeps a pending product view for the next view that is sent', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1' });
    leaveRoom(2);
    tracker.trackPageView({ url: '/products/1' });
    drainQueue();

    tracker.trackPageView({ url: '/products/1' });

    expect(count('setEcommerceView')).toBe(1);
  });

  it('does not reset the error counter for a dropped view', () => {
    const tracker = createTracker({ maxErrorEventsPerPage: 1 });
    tracker.trackError('First');
    leaveRoom(2);
    tracker.trackPageView({ url: '/a' });
    drainQueue();

    tracker.trackError('Dropped');

    expect(count('trackEvent')).toBe(0);
  });

  it('does not count an error event that was dropped against the cap', () => {
    const tracker = createTracker({ maxErrorEventsPerPage: 1 });
    tracker.push(['start']);
    leaveRoom(0);
    tracker.trackError('NoRoom');
    drainQueue();

    tracker.trackError('Fits');

    expect(queuedCommands().filter(([name]) => name === 'trackEvent')).toEqual([['trackEvent', 'Error', 'Fits']]);
  });
});

describe('other command groups at the queue cap', () => {
  it('does not remember an identify that was dropped, so it is tried again', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(1);
    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });
    expect(count('setUserId')).toBe(0);
    drainQueue();

    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });

    expect(count('setUserId', 'u1')).toBe(1);
    expect(count('setCustomDimension')).toBe(1);
  });

  it('does not treat an account switch as done when its identify was dropped', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1' });
    leaveRoom(0);
    tracker.identify({ userId: 'u2' });
    drainQueue();

    tracker.identify({ userId: 'u2' });
    tracker.trackPageView({ url: '/a' });

    expect(count('appendToTrackingUrl', 'new_visit=1')).toBe(1);
  });

  it('does not count an order that was dropped as tracked', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(2);
    const order = { orderId: 'ORD-1', grandTotal: 5, items: [{ sku: 'SKU-1' }] };
    tracker.ecommerce.order(order);
    expect(count('trackEcommerceOrder')).toBe(0);
    drainQueue();

    tracker.ecommerce.order(order);

    expect(count('trackEcommerceOrder')).toBe(1);
  });

  it('queues a cart update whole or not at all, never a lone clearEcommerceCart', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(2);

    tracker.ecommerce.cartUpdate([{ sku: 'SKU-1' }], 5);

    expect(count('clearEcommerceCart')).toBe(0);
  });

  it('queues dimensions whole or not at all', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(1);

    tracker.setDimensions({ 1: 'a', 2: 'b' });

    expect(count('setCustomDimension')).toBe(0);
  });

});

interface ReplayedHit {
  userId: unknown;
  dimensions: Record<number, unknown>;
  newVisit: boolean;
}

/** What matomo.js makes of the queue: the user id, dimensions and new visit flag each page view goes out with. */
function replayHits(commands: unknown[][]): ReplayedHit[] {
  const hits: ReplayedHit[] = [];
  const dimensions: Record<number, unknown> = {};
  let userId: unknown;
  let appended: unknown = '';

  for (const [name, first, second] of commands) {
    if (name === 'setUserId') userId = first;
    if (name === 'resetUserId') userId = undefined;
    if (name === 'setCustomDimension') dimensions[first as number] = second;
    if (name === 'deleteCustomDimension') delete dimensions[first as number];
    if (name === 'appendToTrackingUrl') appended = first;
    if (name === 'trackPageView') hits.push({ userId, dimensions: { ...dimensions }, newVisit: appended === 'new_visit=1' });
  }
  return hits;
}

/** matomo.js replays the array it finds, then replaces `_paq` with a queue object that has no cap. */
function loadMatomo(): unknown[][] {
  const replayed = queuedCommands();
  (window as { _paq?: unknown })._paq = { push: (command: unknown[]) => replayed.push(command) };
  return replayed;
}

describe('reset at the queue cap', () => {
  const dimensions = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' };
  const resetCommands = [
    ['resetUserId'],
    ['deleteCustomDimension', 1],
    ['deleteCustomDimension', 2],
    ['deleteCustomDimension', 3],
    ['deleteCustomDimension', 4],
    ['deleteCustomDimension', 5],
    ['setReferrerUrl', ''],
  ];

  /** Identifies a user with 5 dimensions (6 commands) so that exactly `room` commands fit afterwards. */
  function identifiedWithRoomLeft(room: number) {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(6 + room);
    tracker.identify({ userId: 'userA', dimensions });
    expect(queuedCommands()).toHaveLength(CAP - room);
    return tracker;
  }

  it('queues its commands above the cap when they do not fit under it', () => {
    const tracker = identifiedWithRoomLeft(4);

    tracker.reset();

    expect(queuedCommands()).toHaveLength(CAP - 4 + resetCommands.length);
    expect(queuedCommands().slice(-resetCommands.length)).toEqual(resetCommands);
  });

  it('is queued even when the queue is already full', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(0);

    tracker.reset();

    expect(queuedCommands().slice(-2)).toEqual([['resetUserId'], ['setReferrerUrl', '']]);
  });

  it('makes the next view go out as a new visit with no user id and no dimensions', () => {
    const tracker = identifiedWithRoomLeft(4);
    tracker.reset();

    const replayed = loadMatomo();
    tracker.trackPageView({ url: '/login' });

    const hits = replayHits(replayed);
    expect(hits).toEqual([{ userId: undefined, dimensions: {}, newVisit: true }]);
  });

  it('would have sent the previous user id if its commands had been dropped', () => {
    const tracker = identifiedWithRoomLeft(4);
    const stale = replayHits([...queuedCommands(), ['trackPageView']]);

    expect(stale).toEqual([{ userId: 'userA', dimensions, newVisit: false }]);
    tracker.reset();
  });

  it('turns tracking off, rather than misattribute later hits, when even the reserve is full', () => {
    const tracker = createTracker();
    tracker.push(['start']);
    leaveRoom(-99);

    tracker.reset();

    expect(tracker.enabled).toBe(false);
    expect(queuedCommands()).toEqual([]);
  });

  it('never lets the queue grow past the cap plus the reserve, however often it is called', () => {
    const tracker = createTracker();
    let longest = 0;

    for (let call = 0; call < 1000; call += 1) {
      tracker.reset();
      longest = Math.max(longest, queuedCommands().length);
    }

    expect(longest).toBeLessThanOrEqual(CAP + 100);
    expect(tracker.enabled).toBe(false);
  });
});
