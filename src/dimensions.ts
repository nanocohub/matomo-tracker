import type { DimensionMap, DimensionValue } from './types';

/** Matomo stores custom dimension values up to 255 characters. */
export const MAX_DIMENSION_LENGTH = 255;

/** A dimension id and its value; `null` means "remove it". */
export type DimensionEntry = readonly [id: number, value: string | null];

export function normalizeDimensionValue(value: DimensionValue): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text.slice(0, MAX_DIMENSION_LENGTH) : null;
}

/** Valid entries of a dimension map, in ascending id order. Invalid ids are skipped. */
export function toDimensionEntries(dimensions: DimensionMap | undefined): DimensionEntry[] {
  return Object.keys(dimensions ?? {})
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right)
    .map((id): DimensionEntry => [id, normalizeDimensionValue((dimensions as DimensionMap)[id])]);
}

export function dimensionCommand([id, value]: DimensionEntry): unknown[] {
  return value === null ? ['deleteCustomDimension', id] : ['setCustomDimension', id, value];
}
