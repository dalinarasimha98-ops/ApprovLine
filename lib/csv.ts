const SPREADSHEET_FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

export function csvCell(value: unknown) {
  const raw = String(value ?? '');
  const safe = SPREADSHEET_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
