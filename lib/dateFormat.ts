/**
 * Organization.defaultDateFormat - a real, consumed preference, not a
 * dropdown that only changes its own label. formatOrgDate() actually
 * implements each pattern; callers that render an org-scoped date (the
 * Organization Settings Overview, for one) pass the org's preference
 * through it instead of always using toLocaleDateString().
 */
export const DATE_FORMAT_OPTIONS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
export type DateFormatOption = (typeof DATE_FORMAT_OPTIONS)[number];

export function isDateFormatOption(value: unknown): value is DateFormatOption {
  return typeof value === 'string' && (DATE_FORMAT_OPTIONS as readonly string[]).includes(value);
}

export function formatOrgDate(date: Date, format: DateFormatOption | null | undefined): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  switch (format) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'MM/DD/YYYY':
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
}
