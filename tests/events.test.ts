import { describe, expect, it, vi } from 'vitest';
import { commandsAfterInit, createTracker } from './helpers';

describe('trackEvent', () => {
  it('queues category and action', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export' });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export']]);
  });

  it('adds the name', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: 'csv' });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export', 'csv']]);
  });

  it('adds name and value', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: 'csv', value: 120 });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export', 'csv', 120]]);
  });

  it('leaves the name undefined, not empty, when only a value is given', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', value: 120 });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export', undefined, 120]]);
  });

  it('keeps a value of zero', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: 'csv', value: 0 });

    expect(commandsAfterInit()[0]).toEqual(['trackEvent', 'Orders', 'Export', 'csv', 0]);
  });

  it.each([NaN, Infinity, '5' as unknown as number])('drops the value %s', (value) => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: 'csv', value });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export', 'csv']]);
  });

  it('trims the name and caps it at 100 characters', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: `  ${'n'.repeat(150)}  ` });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export', 'n'.repeat(100)]]);
  });

  it('leaves out a name that is blank after trimming', () => {
    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: '   ' });

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Orders', 'Export']]);
  });

  it.each([
    ['category', { category: '  ', action: 'Export' }],
    ['action', { category: 'Orders', action: '' }],
  ])('drops an event with a blank %s', (_field, event) => {
    createTracker().trackEvent(event);

    expect(commandsAfterInit()).toEqual([]);
  });
});

describe('trackSiteSearch', () => {
  it('queues the keyword alone', () => {
    createTracker().trackSiteSearch({ keyword: 'router' });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'router']]);
  });

  it('adds the category', () => {
    createTracker().trackSiteSearch({ keyword: 'router', category: 'Products' });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'router', 'Products']]);
  });

  it('adds the results count, with false as the absent category', () => {
    createTracker().trackSiteSearch({ keyword: 'router', resultsCount: 12 });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'router', false, 12]]);
  });

  it('keeps a results count of zero, which Matomo reports as a search without results', () => {
    createTracker().trackSiteSearch({ keyword: 'router', category: 'Products', resultsCount: 0 });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'router', 'Products', 0]]);
  });

  it('never sends false as the results count, which matomo.js would record as a zero', () => {
    createTracker().trackSiteSearch({ keyword: 'router', resultsCount: undefined });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'router']]);
  });

  it.each([false, -1, Number.NaN, '3'])('omits the results count %j', (resultsCount) => {
    createTracker().trackSiteSearch({ keyword: 'router', resultsCount: resultsCount as unknown as number });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'router']]);
  });

  it('trims the keyword and caps it at 100 characters', () => {
    createTracker().trackSiteSearch({ keyword: `  ${'k'.repeat(150)}  ` });

    expect(commandsAfterInit()).toEqual([['trackSiteSearch', 'k'.repeat(100)]]);
  });

  it('drops a blank keyword', () => {
    createTracker().trackSiteSearch({ keyword: '   ' });

    expect(commandsAfterInit()).toEqual([]);
  });
});

describe('trackError', () => {
  it('sends an Error event with the kind as action', () => {
    createTracker().trackError('ApiTimeout');

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Error', 'ApiTimeout']]);
  });

  it('sends at most 10 events per page view by default', () => {
    const tracker = createTracker();

    for (let index = 0; index < 25; index += 1) tracker.trackError('ApiTimeout');

    expect(commandsAfterInit()).toHaveLength(10);
  });

  it('honours maxErrorEventsPerPage', () => {
    const tracker = createTracker({ maxErrorEventsPerPage: 2 });

    for (let index = 0; index < 5; index += 1) tracker.trackError('ApiTimeout');

    expect(commandsAfterInit()).toHaveLength(2);
  });

  it('sends none when maxErrorEventsPerPage is 0', () => {
    createTracker({ maxErrorEventsPerPage: 0 }).trackError('ApiTimeout');

    expect(commandsAfterInit()).toEqual([]);
  });

  it('starts counting again with each tracked page view', () => {
    const tracker = createTracker({ maxErrorEventsPerPage: 1 });
    tracker.trackError('First');
    tracker.trackError('Dropped');

    tracker.trackPageView({ url: '/next' });
    tracker.trackError('SecondPage');

    const errors = commandsAfterInit().filter(([name]) => name === 'trackEvent');
    expect(errors).toEqual([
      ['trackEvent', 'Error', 'First'],
      ['trackEvent', 'Error', 'SecondPage'],
    ]);
  });

  it('does not start counting again when a page view is skipped as a repeat', () => {
    const tracker = createTracker({ maxErrorEventsPerPage: 1 });
    tracker.trackPageView({ url: '/a' });
    tracker.trackError('First');

    tracker.trackPageView({ url: '/a' });
    tracker.trackError('Dropped');

    const errors = commandsAfterInit().filter(([name]) => name === 'trackEvent');
    expect(errors).toEqual([['trackEvent', 'Error', 'First']]);
  });

  it('does not count a blank kind against the cap', () => {
    const tracker = createTracker({ maxErrorEventsPerPage: 1 });

    tracker.trackError('  ');
    tracker.trackError('Real');

    expect(commandsAfterInit()).toEqual([['trackEvent', 'Error', 'Real']]);
  });
});

describe('push', () => {
  it('queues any command as given', () => {
    createTracker().push(['trackGoal', 3]);

    expect(commandsAfterInit()).toEqual([['trackGoal', 3]]);
  });

  it.each([[[]], ['trackGoal' as unknown as unknown[]]])('ignores %j', (command) => {
    createTracker().push(command);

    expect(commandsAfterInit()).toEqual([]);
  });
});

describe('debug mode', () => {
  it('logs each command and warns about suspicious event names', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createTracker({ debug: true }).trackEvent({ category: 'Orders', action: 'Export', name: 'jane@example.com' });

    expect(info).toHaveBeenCalledWith('[matomo]', 'trackEvent', 'Orders', 'Export', 'jane@example.com');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('looks like an email address'));
  });

  it.each([
    ['a UUID', '3f2b8c1e-9d4a-4b6e-8a3c-1d2e3f4a5b6c'],
    ['a long id', 'order 1234567'],
    ['a URL', 'https://app.example.com/x'],
    ['free text', 'one two three four five six seven eight nine'],
    ['too long a name', 'n'.repeat(120)],
  ])('warns about %s', (_label, name) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    createTracker({ debug: true }).trackEvent({ category: 'Orders', action: 'Export', name });

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn about a short, plain name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    createTracker({ debug: true }).trackEvent({ category: 'Orders', action: 'Export', name: 'csv-large' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent without the debug option', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createTracker().trackEvent({ category: 'Orders', action: 'Export', name: 'jane@example.com' });

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
