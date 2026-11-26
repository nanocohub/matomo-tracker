import { describe, expect, it, vi } from 'vitest';
import { PAGE_ORIGIN, commandsAfterInit, createTracker, simulateHardReload } from './helpers';

const VIEW_A = [
  ['setCustomUrl', `${PAGE_ORIGIN}/a`],
  ['setDocumentTitle', ''],
] as const;

describe('identify', () => {
  it('sets the user id, then each dimension in ascending id order', () => {
    createTracker().identify({ userId: 'u1', dimensions: { 3: 'ampo', 1: 'admin' } });

    expect(commandsAfterInit()).toEqual([
      ['setUserId', 'u1'],
      ['setCustomDimension', 1, 'admin'],
      ['setCustomDimension', 3, 'ampo'],
    ]);
  });

  it('deletes a dimension whose value is null, undefined or blank', () => {
    createTracker().identify({ userId: 'u1', dimensions: { 1: null, 2: undefined, 3: '   ', 4: 'x' } });

    expect(commandsAfterInit()).toEqual([
      ['setUserId', 'u1'],
      ['deleteCustomDimension', 1],
      ['deleteCustomDimension', 2],
      ['deleteCustomDimension', 3],
      ['setCustomDimension', 4, 'x'],
    ]);
  });

  it('trims a dimension value and caps it at 255 characters', () => {
    createTracker().identify({ userId: 'u1', dimensions: { 1: `  ${'x'.repeat(300)}  ` } });

    expect(commandsAfterInit()[1]).toEqual(['setCustomDimension', 1, 'x'.repeat(255)]);
  });

  it('works without dimensions', () => {
    createTracker().identify({ userId: 'u1' });

    expect(commandsAfterInit()).toEqual([['setUserId', 'u1']]);
  });

  it('ignores an empty user id', () => {
    createTracker().identify({ userId: '   ' });

    expect(commandsAfterInit()).toEqual([]);
  });

  it('accepts a numeric user id from untyped callers', () => {
    createTracker().identify({ userId: 42 as unknown as string });

    expect(commandsAfterInit()).toEqual([['setUserId', '42']]);
  });

  it('is idempotent for the same user and dimensions', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });
    const queuedBefore = commandsAfterInit().length;

    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });

    expect(commandsAfterInit()).toHaveLength(queuedBefore);
  });

  it('applies changed dimensions for the same user without starting a new visit', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });

    tracker.identify({ userId: 'u1', dimensions: { 1: 'agent' } });
    tracker.trackPageView({ url: '/a' });

    expect(commandsAfterInit().slice(2)).toEqual([
      ['setUserId', 'u1'],
      ['setCustomDimension', 1, 'agent'],
      ...VIEW_A,
      ['trackPageView'],
    ]);
  });

  it('removes a dimension the same user no longer has', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin', 2: 'north' } });

    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });

    expect(commandsAfterInit().slice(3)).toEqual([
      ['setUserId', 'u1'],
      ['setCustomDimension', 1, 'admin'],
      ['deleteCustomDimension', 2],
    ]);
  });

  it('skips dimension ids that are not positive integers', () => {
    createTracker().identify({
      userId: 'u1',
      dimensions: { 0: 'zero', [-1]: 'negative', 1.5: 'fraction', 2: 'ok' } as Record<number, string>,
    });

    expect(commandsAfterInit()).toEqual([
      ['setUserId', 'u1'],
      ['setCustomDimension', 2, 'ok'],
    ]);
  });
});

describe('an account switch without logout', () => {
  it('makes the next page view a new visit, for that request only', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1' });
    tracker.identify({ userId: 'u2' });

    tracker.trackPageView({ url: '/a' });
    tracker.trackPageView({ url: '/b' });

    expect(commandsAfterInit().slice(1)).toEqual([
      ['setUserId', 'u2'],
      ...VIEW_A,
      ['appendToTrackingUrl', 'new_visit=1'],
      ['trackPageView'],
      ['appendToTrackingUrl', ''],
      ['setReferrerUrl', `${PAGE_ORIGIN}/a`],
      ['setCustomUrl', `${PAGE_ORIGIN}/b`],
      ['setDocumentTitle', ''],
      ['trackPageView'],
    ]);
  });

  it('is recognised across a hard reload through the tab session', () => {
    createTracker().identify({ userId: 'u1' });
    simulateHardReload();

    const afterReload = createTracker();
    afterReload.identify({ userId: 'u2' });
    afterReload.trackPageView({ url: '/a' });

    expect(commandsAfterInit()).toContainEqual(['appendToTrackingUrl', 'new_visit=1']);
  });

  it('is not a switch when the same user signs in again after a hard reload', () => {
    createTracker().identify({ userId: 'u1' });
    simulateHardReload();

    const afterReload = createTracker();
    afterReload.identify({ userId: 'u1' });
    afterReload.trackPageView({ url: '/a' });

    expect(commandsAfterInit()).not.toContainEqual(['appendToTrackingUrl', 'new_visit=1']);
  });

  it('still works in memory when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const tracker = createTracker();

    tracker.identify({ userId: 'u1' });
    tracker.identify({ userId: 'u2' });
    tracker.trackPageView({ url: '/a' });

    expect(commandsAfterInit()).toContainEqual(['appendToTrackingUrl', 'new_visit=1']);
  });
});

describe('reset', () => {
  it('clears the user id and every dimension set through identify, and sends no hit', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin', 2: null, 3: 'ampo' } });

    tracker.reset();

    expect(commandsAfterInit().slice(4)).toEqual([
      ['resetUserId'],
      ['deleteCustomDimension', 1],
      ['deleteCustomDimension', 3],
      ['setReferrerUrl', ''],
    ]);
    expect(commandsAfterInit().some(([name]) => name === 'trackPageView')).toBe(false);
  });

  it('leaves dimensions that were not set through identify alone', () => {
    const tracker = createTracker();
    tracker.setDimensions({ 9: 'vi' });
    tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });

    tracker.reset();

    const deletes = commandsAfterInit().filter(([name]) => name === 'deleteCustomDimension');
    expect(deletes).toEqual([['deleteCustomDimension', 1]]);
  });

  it('makes the next page view a new visit and then clears the flag', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/a' });
    tracker.reset();

    tracker.trackPageView({ url: '/login' });
    tracker.trackPageView({ url: '/home' });

    expect(commandsAfterInit().slice(5)).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/login`],
      ['setDocumentTitle', ''],
      ['appendToTrackingUrl', 'new_visit=1'],
      ['trackPageView'],
      ['appendToTrackingUrl', ''],
      ['setReferrerUrl', `${PAGE_ORIGIN}/login`],
      ['setCustomUrl', `${PAGE_ORIGIN}/home`],
      ['setDocumentTitle', ''],
      ['trackPageView'],
    ]);
  });

  it('survives a hard reload: the first page view afterwards is a new visit, and only that one', () => {
    createTracker().reset();
    simulateHardReload();

    const afterReload = createTracker();
    afterReload.trackPageView({ url: '/login' });
    afterReload.trackPageView({ url: '/home' });

    expect(commandsAfterInit()).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/login`],
      ['setDocumentTitle', ''],
      ['appendToTrackingUrl', 'new_visit=1'],
      ['trackPageView'],
      ['appendToTrackingUrl', ''],
      ['setReferrerUrl', `${PAGE_ORIGIN}/login`],
      ['setCustomUrl', `${PAGE_ORIGIN}/home`],
      ['setDocumentTitle', ''],
      ['trackPageView'],
    ]);
  });

  it('does not make the page after a second reload a new visit as well', () => {
    createTracker().reset();
    simulateHardReload();
    createTracker().trackPageView({ url: '/login' });
    simulateHardReload();

    createTracker().trackPageView({ url: '/home' });

    expect(commandsAfterInit()).not.toContainEqual(['appendToTrackingUrl', 'new_visit=1']);
  });

  it('tracks a first view to the url the user was on when they logged out', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/public' });
    tracker.reset();

    tracker.trackPageView({ url: '/public' });

    expect(commandsAfterInit().filter(([name]) => name === 'trackPageView')).toHaveLength(2);
  });

  it('does not add the new visit flag to events sent before the next page view', () => {
    const tracker = createTracker();
    tracker.reset();

    tracker.trackEvent({ category: 'Auth', action: 'Logout' });

    expect(commandsAfterInit()).not.toContainEqual(['appendToTrackingUrl', 'new_visit=1']);
  });

  it('forgets the previous user, so signing in as anyone is not a further switch', () => {
    const tracker = createTracker();
    tracker.identify({ userId: 'u1' });
    tracker.reset();
    tracker.trackPageView({ url: '/login' });

    tracker.identify({ userId: 'u2' });
    tracker.trackPageView({ url: '/home' });

    const newVisits = commandsAfterInit().filter(([name, value]) => name === 'appendToTrackingUrl' && value);
    expect(newVisits).toHaveLength(1);
  });

  it('drops a product view that was waiting for the next page view', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1' });

    tracker.reset();
    tracker.trackPageView({ url: '/login' });

    expect(commandsAfterInit().some(([name]) => name === 'setEcommerceView')).toBe(false);
  });
});

describe('setDimensions', () => {
  it('sets each dimension and deletes the empty ones', () => {
    createTracker().setDimensions({ 5: 'vi', 2: null, 4: undefined });

    expect(commandsAfterInit()).toEqual([
      ['deleteCustomDimension', 2],
      ['deleteCustomDimension', 4],
      ['setCustomDimension', 5, 'vi'],
    ]);
  });
});
