import type { Logger } from './logger';
import type { MatomoCommand, TrackedEvent } from './types';

export const MAX_EVENT_NAME_LENGTH = 100;

const SUSPICIOUS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, 'looks like an email address'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'contains a UUID'],
  [/\d{5,}/, 'contains a long number, probably an id'],
  [/https?:\/\//i, 'contains a URL'],
];
const MAX_WORDS_IN_NAME = 8;

/**
 * Builds the `trackEvent` command, or returns `null` when category or action is blank.
 * Matomo omits an `undefined` name or value, so those stay `undefined` rather than becoming `''`.
 */
export function buildEventCommand(event: TrackedEvent, logger: Logger): MatomoCommand | null {
  const category = cleanText(event.category);
  const action = cleanText(event.action);
  if (!category || !action) {
    logger.warn('event dropped: category and action are required', event);
    return null;
  }

  const name = normalizeEventName(event.name, logger);
  const value = isFiniteNumber(event.value) ? event.value : undefined;
  const command: MatomoCommand = ['trackEvent', category, action];
  if (name !== undefined || value !== undefined) command.push(name);
  if (value !== undefined) command.push(value);
  return command;
}

function normalizeEventName(rawName: unknown, logger: Logger): string | undefined {
  const name = cleanText(rawName);
  if (!name) return undefined;

  const suspicion = describeSuspiciousName(name);
  if (suspicion) logger.warn(`suspicious event name "${name}": ${suspicion}`);
  return name.slice(0, MAX_EVENT_NAME_LENGTH);
}

function describeSuspiciousName(name: string): string | null {
  if (name.length > MAX_EVENT_NAME_LENGTH) {
    return `longer than ${MAX_EVENT_NAME_LENGTH} characters, it will be truncated`;
  }
  const match = SUSPICIOUS_PATTERNS.find(([pattern]) => pattern.test(name));
  if (match) return match[1];
  return name.split(/\s+/).length > MAX_WORDS_IN_NAME ? 'looks like free text' : null;
}

export function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
