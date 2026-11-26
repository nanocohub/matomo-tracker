import { describe, expect, it } from 'vitest';
import { PAGE_ORIGIN, commandsAfterInit, createTracker, navigateTo } from './helpers';

describe('trackPageView', () => {
  it('queues the url, the title and the hit, in that order, with no referrer for the first view', () => {
    document.title = 'Home';

    createTracker().trackPageView();

    expect(commandsAfterInit()).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/`],
      ['setDocumentTitle', 'Home'],
      ['trackPageView'],
    ]);
  });

  it('uses the current location when no url is given', () => {
    navigateTo('/orders');

    createTracker().trackPageView();

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/orders`]);
  });

  it('uses the given title instead of document.title', () => {
    document.title = 'Ignored';

    createTracker().trackPageView({ title: 'Orders' });

    expect(commandsAfterInit()[1]).toEqual(['setDocumentTitle', 'Orders']);
  });

  it('resolves a path against the current origin', () => {
    createTracker().trackPageView({ url: '/orders/new' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/orders/new`]);
  });

  it('keeps the origin of an absolute url', () => {
    createTracker().trackPageView({ url: 'https://other.example.com/p?x=1' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', 'https://other.example.com/p']);
  });

  it.each(['javascript:alert(1)', 'mailto:someone@example.com', 'data:text/html,hi'])(
    'drops a view of %s',
    (url) => {
      createTracker().trackPageView({ url });

      expect(commandsAfterInit()).toEqual([]);
    },
  );
});

describe('referrer chaining', () => {
  it('sets the previous tracked url as the referrer of each later view', () => {
    const tracker = createTracker();

    tracker.trackPageView({ url: '/a' });
    tracker.trackPageView({ url: '/b' });
    tracker.trackPageView({ url: '/c' });

    expect(commandsAfterInit()).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/a`],
      ['setDocumentTitle', ''],
      ['trackPageView'],
      ['setReferrerUrl', `${PAGE_ORIGIN}/a`],
      ['setCustomUrl', `${PAGE_ORIGIN}/b`],
      ['setDocumentTitle', ''],
      ['trackPageView'],
      ['setReferrerUrl', `${PAGE_ORIGIN}/b`],
      ['setCustomUrl', `${PAGE_ORIGIN}/c`],
      ['setDocumentTitle', ''],
      ['trackPageView'],
    ]);
  });

  it('never sets a referrer for the first view, so Matomo keeps document.referrer', () => {
    createTracker().trackPageView({ url: '/a' });

    expect(commandsAfterInit().some(([name]) => name === 'setReferrerUrl')).toBe(false);
  });
});

describe('skipping repeated views', () => {
  it('skips a view with the same final url as the last one', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/a' });
    const queuedBefore = commandsAfterInit().length;

    tracker.trackPageView({ url: '/a' });

    expect(commandsAfterInit()).toHaveLength(queuedBefore);
  });

  it('compares the sanitized urls, so a dropped query parameter does not make a new view', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/a?x=1' });

    tracker.trackPageView({ url: '/a?x=2#top' });

    expect(commandsAfterInit().filter(([name]) => name === 'trackPageView')).toHaveLength(1);
  });

  it('tracks the same url again when forced', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/a' });

    tracker.trackPageView({ url: '/a', force: true });

    expect(commandsAfterInit().filter(([name]) => name === 'trackPageView')).toHaveLength(2);
  });

  it('tracks a return to an earlier url', () => {
    const tracker = createTracker();

    tracker.trackPageView({ url: '/a' });
    tracker.trackPageView({ url: '/b' });
    tracker.trackPageView({ url: '/a' });

    expect(commandsAfterInit().filter(([name]) => name === 'trackPageView')).toHaveLength(3);
  });
});

describe('url sanitizing', () => {
  it('drops every query parameter by default', () => {
    createTracker().trackPageView({ url: '/cb?code=secret&state=xyz' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/cb`]);
  });

  it('keeps only the whitelisted query parameters, in their original order and encoding', () => {
    const tracker = createTracker({ keepQueryParams: ['page', 'q'] });

    tracker.trackPageView({ url: '/list?token=x&q=a+b%20c&code=1&page=2' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/list?q=a+b%20c&page=2`]);
  });

  it('matches whitelisted names after decoding', () => {
    const tracker = createTracker({ keepQueryParams: ['filter by'] });

    tracker.trackPageView({ url: '/list?filter%20by=open&other=1' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/list?filter%20by=open`]);
  });

  it('adds no question mark when no whitelisted parameter is present', () => {
    const tracker = createTracker({ keepQueryParams: ['page'] });

    tracker.trackPageView({ url: '/list?other=1' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/list`]);
  });

  it('always drops the fragment, even a whitelisted looking one', () => {
    const tracker = createTracker({ keepQueryParams: ['page'] });

    tracker.trackPageView({ url: '/list?page=2#access_token=secret' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/list?page=2`]);
  });

  it('drops credentials in the url', () => {
    createTracker().trackPageView({ url: 'https://user:pass@app.example.com/a' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/a`]);
  });

  it('maps the path with normalizePath', () => {
    const tracker = createTracker({ normalizePath: (path) => path.replace(/\/\d+/g, '/:id') });

    tracker.trackPageView({ url: '/orders/123/items/45?x=1' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/orders/:id/items/:id`]);
  });

  it('adds the leading slash a normalizePath result lacks', () => {
    const tracker = createTracker({ normalizePath: () => 'home' });

    tracker.trackPageView({ url: '/anything' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/home`]);
  });

  it('falls back to the raw path when normalizePath throws or returns nothing', () => {
    const throwing = createTracker({
      normalizePath: () => {
        throw new Error('boom');
      },
    });
    throwing.trackPageView({ url: '/orders' });
    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/orders`]);
  });

  it('falls back to the raw path when normalizePath returns an empty string', () => {
    createTracker({ normalizePath: () => '' }).trackPageView({ url: '/orders' });

    expect(commandsAfterInit()[0]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/orders`]);
  });

  it('applies the same rules to the url the referrer chain remembers', () => {
    const tracker = createTracker({ keepQueryParams: ['page'] });

    tracker.trackPageView({ url: '/list?page=1&code=secret' });
    tracker.trackPageView({ url: '/detail?code=secret' });

    expect(commandsAfterInit()[3]).toEqual(['setReferrerUrl', `${PAGE_ORIGIN}/list?page=1`]);
  });
});
