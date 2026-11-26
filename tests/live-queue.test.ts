import { describe, expect, it } from 'vitest';
import { createTracker } from './helpers';

const CLEAR_PARAMETERS = ['appendToTrackingUrl', ''];

interface LiveQueue {
  applied: unknown[][];
  failOn: string | null;
}

/**
 * What `_paq` becomes once matomo.js has run: each push applies the command at once, and applying
 * the command named `failOn` throws, as matomo.js does on an unknown method or a value it cannot encode.
 */
function loadMatomo(failOn: string | null): LiveQueue {
  const live: LiveQueue = { applied: [], failOn };
  (window as { _paq?: unknown })._paq = {
    push: (command: unknown[]) => {
      live.applied.push(command);
      if (command[0] === live.failOn) throw new TypeError(`matomo.js failed to apply ${String(command[0])}`);
    },
  };
  return live;
}

/** A tracker that has queued its configuration, with a new visit and a product view pending. */
function trackerWithOneHitParameters() {
  const tracker = createTracker();
  tracker.reset();
  tracker.ecommerce.productView({ sku: 'SKU-1' });
  return tracker;
}

describe('a page view once matomo.js has loaded', () => {
  it('still clears its one-hit parameters when matomo.js throws while applying the hit', () => {
    const tracker = trackerWithOneHitParameters();
    const live = loadMatomo('trackPageView');

    tracker.trackPageView({ url: '/products/1' });

    expect(live.applied.slice(-3)).toEqual([
      ['appendToTrackingUrl', 'new_visit=1&_pks=SKU-1'],
      ['trackPageView'],
      CLEAR_PARAMETERS,
    ]);
  });

  it('does not let the error reach the app', () => {
    const tracker = trackerWithOneHitParameters();
    loadMatomo('trackPageView');

    expect(() => tracker.trackPageView({ url: '/products/1' })).not.toThrow();
  });

  it('keeps the new visit and the product pending after the throw, and sends them once with the next view', () => {
    const tracker = trackerWithOneHitParameters();
    const live = loadMatomo('trackPageView');
    tracker.trackPageView({ url: '/products/1' });
    live.failOn = null;
    live.applied.length = 0;

    tracker.trackPageView({ url: '/products/1' });
    tracker.trackPageView({ url: '/cart' });

    const appended = live.applied.filter(([name]) => name === 'appendToTrackingUrl');
    expect(appended).toEqual([['appendToTrackingUrl', 'new_visit=1&_pks=SKU-1'], CLEAR_PARAMETERS]);
  });
});
