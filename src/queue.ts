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

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Returns `false` when the command was dropped because the queue is full. */
export function enqueue(command: MatomoCommand): boolean {
  const target = window as MatomoWindow;
  const queue = target._paq ?? (target._paq = []);
  if (Array.isArray(queue) && queue.length >= MAX_QUEUED_COMMANDS) return false;
  queue.push(command);
  return true;
}

export function discardQueuedCommands(): void {
  const queue = (window as MatomoWindow)._paq;
  if (Array.isArray(queue)) queue.length = 0;
}
