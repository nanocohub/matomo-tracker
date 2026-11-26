import { describe, expect, it } from 'vitest';
import { cleanText, toWellFormed, truncateText } from '../src/text';
import { commandsAfterInit, createTracker, queuedCommands } from './helpers';

const EMOJI = '\u{1F600}';
const HIGH_SURROGATE = EMOJI.charAt(0);
const LOW_SURROGATE = EMOJI.charAt(1);
const REPLACEMENT = '\uFFFD';
/** A name an app cut in the middle of its emoji. */
const CUT_MID_EMOJI = `Quạt ${EMOJI}`.slice(0, -1);

/** Every string in the queued commands, nested arrays included. */
function queuedStrings(): string[] {
  const strings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
  };
  queuedCommands().forEach(collect);
  return strings;
}

describe('toWellFormed', () => {
  it('keeps surrogate pairs and other text as they are', () => {
    expect(toWellFormed(`Quạt điện ${EMOJI}!`)).toBe(`Quạt điện ${EMOJI}!`);
  });

  it.each([
    ['a lone high surrogate', `a${HIGH_SURROGATE}b`, `a${REPLACEMENT}b`],
    ['a lone low surrogate', `a${LOW_SURROGATE}b`, `a${REPLACEMENT}b`],
    ['a high surrogate at the end', `a${HIGH_SURROGATE}`, `a${REPLACEMENT}`],
    ['a pair in the wrong order', `${LOW_SURROGATE}${HIGH_SURROGATE}`, `${REPLACEMENT}${REPLACEMENT}`],
    ['a lone surrogate next to a pair', `${HIGH_SURROGATE}${EMOJI}`, `${REPLACEMENT}${EMOJI}`],
  ])('replaces %s with U+FFFD', (_label, input, expected) => {
    expect(toWellFormed(input)).toBe(expected);
  });
});

describe('cleanText', () => {
  it('trims and makes the text well formed', () => {
    expect(cleanText(`  ${CUT_MID_EMOJI} `)).toBe(`Quạt ${REPLACEMENT}`);
  });

  it('returns an empty string for anything that is not a string', () => {
    expect([cleanText(42), cleanText(null), cleanText(undefined)]).toEqual(['', '', '']);
  });
});

describe('truncateText', () => {
  it('never cuts between the two halves of a pair', () => {
    expect(truncateText(`ab${EMOJI}`, 3)).toBe('ab');
  });

  it('keeps a pair that fits, and text that is short enough', () => {
    expect([truncateText(`ab${EMOJI}c`, 4), truncateText('abc', 3)]).toEqual([`ab${EMOJI}`, 'abc']);
  });
});

describe('what the tracker hands to matomo.js', () => {
  it('has no lone surrogate, whatever the app passes, so encoding it can never throw', () => {
    const tracker = createTracker({ normalizePath: () => `/products/${HIGH_SURROGATE}` });
    tracker.identify({ userId: `user${HIGH_SURROGATE}`, dimensions: { 1: CUT_MID_EMOJI } });
    tracker.setDimensions({ 2: CUT_MID_EMOJI });
    tracker.trackPageView({ url: '/a', title: CUT_MID_EMOJI });
    document.title = CUT_MID_EMOJI;
    tracker.trackPageView({ url: '/b', force: true });
    tracker.trackEvent({ category: CUT_MID_EMOJI, action: CUT_MID_EMOJI, name: CUT_MID_EMOJI });
    tracker.trackSiteSearch({ keyword: CUT_MID_EMOJI, category: CUT_MID_EMOJI });
    tracker.trackError(CUT_MID_EMOJI);
    tracker.ecommerce.productView({ sku: CUT_MID_EMOJI, name: CUT_MID_EMOJI, category: [CUT_MID_EMOJI] });
    tracker.trackPageView({ url: '/c', force: true });
    tracker.ecommerce.cartUpdate([{ sku: CUT_MID_EMOJI, name: CUT_MID_EMOJI, category: CUT_MID_EMOJI }], 1);
    tracker.ecommerce.order({ orderId: CUT_MID_EMOJI, grandTotal: 1, items: [{ sku: CUT_MID_EMOJI }] });

    const names = commandsAfterInit().map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining(['setUserId', 'setCustomDimension', 'setDocumentTitle', 'trackEvent', 'trackSiteSearch']),
    );
    expect(names).toEqual(expect.arrayContaining(['appendToTrackingUrl', 'addEcommerceItem', 'trackEcommerceOrder']));
    for (const text of queuedStrings()) expect(() => encodeURIComponent(text), JSON.stringify(text)).not.toThrow();
  });

  it('sends a page title cut mid-emoji with U+FFFD in place of the lone half, also from document.title', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/a', title: CUT_MID_EMOJI });
    document.title = CUT_MID_EMOJI;

    tracker.trackPageView({ url: '/b' });

    const titles = commandsAfterInit().filter(([name]) => name === 'setDocumentTitle');
    expect(titles).toEqual([
      ['setDocumentTitle', `Quạt ${REPLACEMENT}`],
      ['setDocumentTitle', `Quạt ${REPLACEMENT}`],
    ]);
  });

  it('sends a product whose name was cut mid-emoji, and keeps sending the page views after it', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1', name: CUT_MID_EMOJI });

    tracker.trackPageView({ url: '/products/1' });
    tracker.trackPageView({ url: '/cart' });

    const appended = commandsAfterInit().filter(([name]) => name === 'appendToTrackingUrl');
    expect(appended).toEqual([
      ['appendToTrackingUrl', `_pks=SKU-1&_pkn=${encodeURIComponent(`Quạt ${REPLACEMENT}`)}`],
      ['appendToTrackingUrl', ''],
    ]);
    expect(commandsAfterInit().filter(([name]) => name === 'trackPageView')).toHaveLength(2);
  });

  it.each([
    ['an event name', 100, (tracker: ReturnType<typeof createTracker>, text: string) => {
      tracker.trackEvent({ category: 'C', action: 'A', name: text });
    }],
    ['a site search keyword', 100, (tracker: ReturnType<typeof createTracker>, text: string) => {
      tracker.trackSiteSearch({ keyword: text });
    }],
    ['a dimension value', 255, (tracker: ReturnType<typeof createTracker>, text: string) => {
      tracker.setDimensions({ 1: text });
    }],
  ])('truncates %s without cutting an emoji in two', (_label, maxLength, track) => {
    const tracker = createTracker();

    track(tracker, `${'a'.repeat(maxLength - 1)}${EMOJI}`);

    expect(queuedStrings()).toContain('a'.repeat(maxLength - 1));
  });
});
