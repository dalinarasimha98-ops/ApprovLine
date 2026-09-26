/** Shared shape/helper for reading a Next.js App Router page's raw
 *  searchParams - used by both app/dashboard/me/page.tsx and the client
 *  components it renders (IndividualDashboardView, IndividualRangePicker),
 *  which would otherwise need to import this from each other and create a
 *  circular module dependency. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function str(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
