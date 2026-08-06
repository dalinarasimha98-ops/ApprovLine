/**
 * unstable_cache round-trips its return value through JSON, so any `Date`
 * in a cached payload can come back as an ISO string instead — this is the
 * type that models what a Prisma Date field actually is after crossing a
 * cache boundary, as opposed to what Prisma's generated types claim it is.
 */
export type SerializedDate = Date | string;

export function toDate(value: SerializedDate): Date;
export function toDate(value: SerializedDate | null | undefined): Date | null;
export function toDate(value: SerializedDate | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}
