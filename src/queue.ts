import type { MatomoCommand } from './types';

interface CommandQueue {
  push(command: MatomoCommand): unknown;
}

/** `_paq` is a plain array until matomo.js runs, then Matomo's own queue object. */
type MatomoWindow = Window & { _paq?: CommandQueue | MatomoCommand[] };

/**
 * Until matomo.js executes, `_paq` only grows. If the script never arrives (a proxy that
 * black-holes the host fires no error event) it would grow for the whole session. New
 * commands are dropped once the cap is reached, so the configuration queued first survives.
 */
export const MAX_QUEUED_COMMANDS = 500;

/**
 * Slots above the cap for the commands that must reach matomo.js whatever the queue holds
 * (the ones that clear the user id on logout). Still bounded, so the queue cannot grow forever.
 */
export const RESERVED_QUEUE_COMMANDS = 100;

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Queues the commands together or not at all, and returns whether they were queued.
 *
 * Commands that belong together must never be split by the cap. A hit dropped between
 * `appendToTrackingUrl new_visit=1` and the `appendToTrackingUrl ''` that clears it would turn
 * every later request into a new visit.
 */
export function enqueue(commands: MatomoCommand[], options: { useReserve?: boolean } = {}): boolean {
  const target = window as MatomoWindow;
  const queue = target._paq ?? (target._paq = []);
  const limit = MAX_QUEUED_COMMANDS + (options.useReserve ? RESERVED_QUEUE_COMMANDS : 0);
  if (Array.isArray(queue) && queue.length + commands.length > limit) return false;

  commands.forEach((command) => queue.push(command));
  return true;
}

export function discardQueuedCommands(): void {
  const queue = (window as MatomoWindow)._paq;
  if (Array.isArray(queue)) queue.length = 0;
}
