import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMatomoPageView } from '../src/react';
import type { MatomoPageViewOptions } from '../src/react';
import { PAGE_ORIGIN, commandsAfterInit, createTracker } from './helpers';

function fakeTracker(enabled = true) {
  return { enabled, trackPageView: vi.fn() };
}

function flushTimers(): void {
  act(() => {
    vi.runAllTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useMatomoPageView', () => {
  it('tracks the page after the render, not during it', () => {
    const tracker = fakeTracker();

    renderHook(() => useMatomoPageView(tracker, { path: '/a' }));
    expect(tracker.trackPageView).not.toHaveBeenCalled();

    flushTimers();
    expect(tracker.trackPageView).toHaveBeenCalledTimes(1);
    expect(tracker.trackPageView).toHaveBeenCalledWith({ url: '/a', title: undefined });
  });

  it('tracks again when the path changes', () => {
    const tracker = fakeTracker();
    const { rerender } = renderHook((options: MatomoPageViewOptions) => useMatomoPageView(tracker, options), {
      initialProps: { path: '/a' },
    });
    flushTimers();

    rerender({ path: '/b' });
    flushTimers();

    expect(tracker.trackPageView.mock.calls.map(([view]) => view.url)).toEqual(['/a', '/b']);
  });

  it('does not track again when the path stays the same', () => {
    const tracker = fakeTracker();
    const { rerender } = renderHook((options: MatomoPageViewOptions) => useMatomoPageView(tracker, options), {
      initialProps: { path: '/a' },
    });
    flushTimers();

    rerender({ path: '/a' });
    flushTimers();

    expect(tracker.trackPageView).toHaveBeenCalledTimes(1);
  });

  it('tracks only the last path when it changes before the timer fires', () => {
    const tracker = fakeTracker();
    const { rerender } = renderHook((options: MatomoPageViewOptions) => useMatomoPageView(tracker, options), {
      initialProps: { path: '/a' },
    });

    rerender({ path: '/b' });
    flushTimers();

    expect(tracker.trackPageView.mock.calls.map(([view]) => view.url)).toEqual(['/b']);
  });

  it('holds the view back while ready is false and sends it once ready', () => {
    const tracker = fakeTracker();
    const { rerender } = renderHook((options: MatomoPageViewOptions) => useMatomoPageView(tracker, options), {
      initialProps: { path: '/a', ready: false },
    });
    flushTimers();
    expect(tracker.trackPageView).not.toHaveBeenCalled();

    rerender({ path: '/a', ready: true });
    flushTimers();

    expect(tracker.trackPageView).toHaveBeenCalledTimes(1);
  });

  it('treats ready as true when it is left out', () => {
    const tracker = fakeTracker();

    renderHook(() => useMatomoPageView(tracker, { path: '/a' }));
    flushTimers();

    expect(tracker.trackPageView).toHaveBeenCalledTimes(1);
  });

  it('sends the latest title', () => {
    const tracker = fakeTracker();
    const { rerender } = renderHook((options: MatomoPageViewOptions) => useMatomoPageView(tracker, options), {
      initialProps: { path: '/a', title: 'Old' },
    });

    rerender({ path: '/a', title: 'New' });
    flushTimers();

    expect(tracker.trackPageView).toHaveBeenCalledWith({ url: '/a', title: 'New' });
  });

  it('sends nothing when the component unmounts before the timer fires', () => {
    const tracker = fakeTracker();
    const { unmount } = renderHook(() => useMatomoPageView(tracker, { path: '/a' }));

    unmount();
    flushTimers();

    expect(tracker.trackPageView).not.toHaveBeenCalled();
  });

  it('does nothing for a disabled tracker', () => {
    const tracker = fakeTracker(false);

    renderHook(() => useMatomoPageView(tracker, { path: '/a' }));
    flushTimers();

    expect(tracker.trackPageView).not.toHaveBeenCalled();
  });

  it('tracks once in StrictMode, where effects run twice', () => {
    const tracker = fakeTracker();

    renderHook(() => useMatomoPageView(tracker, { path: '/a' }), { wrapper: StrictMode });
    flushTimers();

    expect(tracker.trackPageView).toHaveBeenCalledTimes(1);
  });

  it('tracks once per path change in StrictMode', () => {
    const tracker = fakeTracker();
    const { rerender } = renderHook((options: MatomoPageViewOptions) => useMatomoPageView(tracker, options), {
      wrapper: StrictMode,
      initialProps: { path: '/a' },
    });
    flushTimers();

    rerender({ path: '/b' });
    flushTimers();

    expect(tracker.trackPageView.mock.calls.map(([view]) => view.url)).toEqual(['/a', '/b']);
  });
});

describe('useMatomoPageView with a real tracker', () => {
  it('queues exactly one page view in StrictMode', () => {
    const tracker = createTracker();

    renderHook(() => useMatomoPageView(tracker, { path: '/orders' }), { wrapper: StrictMode });
    flushTimers();

    expect(commandsAfterInit().filter(([name]) => name === 'trackPageView')).toHaveLength(1);
  });

  it('reads document.title after the page has updated it', () => {
    const tracker = createTracker();

    renderHook(() => useMatomoPageView(tracker, { path: '/orders' }));
    document.title = 'Orders';
    flushTimers();

    expect(commandsAfterInit()).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/orders`],
      ['setDocumentTitle', 'Orders'],
      ['trackPageView'],
    ]);
  });
});
