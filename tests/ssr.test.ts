// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMatomoTracker } from '../src';

describe('on the server, where there is no window', () => {
  const tracker = createMatomoTracker({ url: 'https://analytics.example.com', siteId: 7, debug: true });

  it('has no window', () => {
    expect(typeof window).toBe('undefined');
  });

  it('is still enabled, since the configuration is valid', () => {
    expect(tracker.enabled).toBe(true);
  });

  it('makes every method a no-op that does not throw', () => {
    expect(() => {
      tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });
      tracker.setDimensions({ 2: 'vi' });
      tracker.trackPageView({ url: '/a', title: 'A', force: true });
      tracker.trackEvent({ category: 'Orders', action: 'Export', name: 'csv', value: 1 });
      tracker.trackSiteSearch({ keyword: 'router', category: 'Products', resultsCount: 3 });
      tracker.trackError('ApiTimeout');
      tracker.ecommerce.productView({ sku: 'SKU-1' });
      tracker.ecommerce.cartUpdate([{ sku: 'SKU-1' }], 5);
      tracker.ecommerce.order({ orderId: 'ORD-1', grandTotal: 5, items: [] });
      tracker.push(['trackGoal', 1]);
      tracker.reset();
    }).not.toThrow();
  });

  it('creates no global state', () => {
    tracker.trackPageView();

    expect('_paq' in globalThis).toBe(false);
  });
});
