import type { MatomoCommand } from './types';

export interface Logger {
  command(command: MatomoCommand): void;
  warn(message: string, ...details: unknown[]): void;
}

/** Console output exists only to help while integrating; without `debug` the tracker is silent. */
export function createLogger(debug: boolean): Logger {
  if (!debug) return { command: noop, warn: noop };

  return {
    command: (command) => console.info('[matomo]', ...command),
    warn: (message, ...details) => console.warn(`[matomo] ${message}`, ...details),
  };
}

function noop(): void {}
