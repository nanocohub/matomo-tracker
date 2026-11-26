import { describe, expect, it } from 'vitest';
import { createMatomoTracker } from '../src';
import {
  DEFAULT_INIT_COMMANDS,
  MATOMO_URL,
  PAGE_ORIGIN,
  createTracker,
  matomoScripts,
  navigateTo,
  queuedCommands,
} from './helpers';

describe('when the tracker is disabled', () => {
  const invalidConfigurations: Array<[string, Parameters<typeof createMatomoTracker>[0]]> = [
    ['an http url', { url: 'http://analytics.example.com', siteId: 7 }],
    ['an unparseable url', { url: 'not a url', siteId: 7 }],
    ['an empty url', { url: '', siteId: 7 }],
    ['a missing site id', { url: MATOMO_URL, siteId: undefined }],
    ['a zero site id', { url: MATOMO_URL, siteId: 0 }],
    ['a negative site id', { url: MATOMO_URL, siteId: -3 }],
    ['a fractional site id', { url: MATOMO_URL, siteId: 1.5 }],
    ['a non numeric site id', { url: MATOMO_URL, siteId: 'abc' }],
    ['a half numeric site id', { url: MATOMO_URL, siteId: '12abc' }],
    ['an empty site id', { url: MATOMO_URL, siteId: '' }],
    ['enabled: false', { url: MATOMO_URL, siteId: 7, enabled: false }],
  ];

  it.each(invalidConfigurations)('%s reports enabled === false', (_label, options) => {
    expect(createMatomoTracker(options).enabled).toBe(false);
  });

  it.each(invalidConfigurations)('%s queues nothing and loads no script', (_label, options) => {
    const tracker = createMatomoTracker(options);

    tracker.trackPageView();
    tracker.trackEvent({ category: 'Orders', action: 'Export' });
    tracker.identify({ userId: 'u1' });
    tracker.push(['trackGoal', 1]);

    expect(queuedCommands()).toEqual([]);
    expect(matomoScripts()).toEqual([]);
  });
});

describe('when the configuration is valid', () => {
  it('is enabled', () => {
    expect(createTracker().enabled).toBe(true);
  });

  it('accepts a numeric string as site id and queues it as a number', () => {
    const tracker = createTracker({ siteId: ' 12 ' });
    tracker.push(['ping']);

    expect(queuedCommands()[1]).toEqual(['setSiteId', 12]);
  });

  it('ignores trailing slashes on the url', () => {
    createTracker({ url: `${MATOMO_URL}///` }).push(['ping']);

    expect(queuedCommands()[0]).toEqual(['setTrackerUrl', `${MATOMO_URL}/matomo.php`]);
    expect(matomoScripts()[0]?.src).toBe(`${MATOMO_URL}/matomo.js`);
  });

  it('keeps a path on the url', () => {
    createTracker({ url: `${MATOMO_URL}/matomo/` }).push(['ping']);

    expect(queuedCommands()[0]).toEqual(['setTrackerUrl', `${MATOMO_URL}/matomo/matomo.php`]);
  });
});

describe('the one-time configuration', () => {
  it('does nothing until the tracker is used', () => {
    createTracker();

    expect(queuedCommands()).toEqual([]);
    expect(matomoScripts()).toEqual([]);
  });

  it('is queued in a fixed order before the first command', () => {
    createTracker().push(['ping']);

    expect(queuedCommands()).toEqual([...DEFAULT_INIT_COMMANDS, ['ping']]);
  });

  it('is queued only once however often the tracker is used', () => {
    const tracker = createTracker();

    tracker.push(['one']);
    tracker.push(['two']);
    tracker.trackEvent({ category: 'Orders', action: 'Export' });

    const setups = queuedCommands().filter(([name]) => name === 'setTrackerUrl');
    expect(setups).toHaveLength(1);
  });

  it('includes every option when all are set', () => {
    createTracker({
      requestMethod: 'POST',
      domains: ['*.example.com'],
      cookieDomain: '*.example.com',
      requireCookieConsent: true,
      heartbeatSeconds: 30,
      jsErrorTracking: true,
    }).push(['ping']);

    expect(queuedCommands()).toEqual([
      ['setTrackerUrl', `${MATOMO_URL}/matomo.php`],
      ['setSiteId', 7],
      ['setRequestMethod', 'POST'],
      ['setDomains', ['*.example.com']],
      ['setCookieDomain', '*.example.com'],
      ['requireCookieConsent'],
      ['setCustomUrl', `${PAGE_ORIGIN}/`],
      ['enableLinkTracking'],
      ['enableHeartBeatTimer', 30],
      ['enableJSErrorTracking'],
      ['ping'],
    ]);
  });

  it('leaves out link tracking and the heartbeat when they are switched off', () => {
    createTracker({ linkTracking: false, heartbeatSeconds: false }).push(['ping']);

    expect(queuedCommands()).toEqual([
      ['setTrackerUrl', `${MATOMO_URL}/matomo.php`],
      ['setSiteId', 7],
      ['setCustomUrl', `${PAGE_ORIGIN}/`],
      ['ping'],
    ]);
  });

  it('does not enable the matomo.js error tracking by default, which reports raw urls and messages', () => {
    createTracker().push(['ping']);

    expect(queuedCommands()).not.toContainEqual(['enableJSErrorTracking']);
  });

  it.each([[false], [undefined]])('does not enable it for jsErrorTracking: %s either', (jsErrorTracking) => {
    createTracker({ jsErrorTracking }).push(['ping']);

    expect(queuedCommands()).not.toContainEqual(['enableJSErrorTracking']);
  });

  it('enables it, after the heartbeat, only when jsErrorTracking is true', () => {
    createTracker({ jsErrorTracking: true }).push(['ping']);

    expect(queuedCommands()).toEqual([...DEFAULT_INIT_COMMANDS, ['enableJSErrorTracking'], ['ping']]);
  });

  it('reports the page it starts on without its query string or fragment', () => {
    navigateTo('/oauth/callback?code=secret&state=abc#token');

    createTracker().push(['ping']);

    expect(queuedCommands()[2]).toEqual(['setCustomUrl', `${PAGE_ORIGIN}/oauth/callback`]);
  });
});

describe('the matomo.js script', () => {
  it('is added once, asynchronously', () => {
    const tracker = createTracker();
    tracker.trackPageView();
    tracker.trackEvent({ category: 'Orders', action: 'Export' });

    const [script] = matomoScripts();
    expect(matomoScripts()).toHaveLength(1);
    expect(script?.src).toBe(`${MATOMO_URL}/matomo.js`);
    expect(script?.async).toBe(true);
  });

  it('is added once even when several trackers use the same Matomo', () => {
    createTracker().push(['ping']);
    createTracker().push(['ping']);

    expect(matomoScripts()).toHaveLength(1);
  });

  it('is not added again when the page already loads it', () => {
    const existing = document.createElement('script');
    existing.src = `${MATOMO_URL}/matomo.js`;
    document.head.appendChild(existing);

    createTracker().push(['ping']);

    expect(matomoScripts()).toHaveLength(0);
  });

  it('turns the tracker off and empties the queue when it fails to load', () => {
    const tracker = createTracker();
    tracker.trackPageView();

    matomoScripts()[0]?.dispatchEvent(new Event('error'));
    tracker.trackPageView({ url: '/next', force: true });

    expect(tracker.enabled).toBe(false);
    expect(queuedCommands()).toEqual([]);
  });
});

describe('the command queue before matomo.js has loaded', () => {
  it('stops growing at 500 commands and keeps the configuration', () => {
    const tracker = createTracker();

    for (let index = 0; index < 600; index += 1) tracker.push(['ping', index]);

    expect(queuedCommands()).toHaveLength(500);
    expect(queuedCommands()[0]).toEqual(['setTrackerUrl', `${MATOMO_URL}/matomo.php`]);
  });

  it('passes commands to the queue object matomo.js installs', () => {
    const received: unknown[] = [];
    (window as { _paq?: unknown })._paq = { push: (command: unknown) => received.push(command) };

    createTracker().push(['ping']);

    expect(received[received.length - 1]).toEqual(['ping']);
  });
});

describe('a failing page or tracker', () => {
  it('never throws when the queue itself throws', () => {
    (window as { _paq?: unknown })._paq = {
      push: () => {
        throw new Error('boom');
      },
    };
    const tracker = createTracker();

    expect(() => {
      tracker.trackPageView();
      tracker.trackEvent({ category: 'Orders', action: 'Export' });
      tracker.identify({ userId: 'u1' });
      tracker.reset();
    }).not.toThrow();
  });
});
