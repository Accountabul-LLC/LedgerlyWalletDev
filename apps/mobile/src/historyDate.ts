/** Reuse the screen's locale/time-zone formatter without crashing on malformed server timestamps. */
export function formatHistoryDate(
  timestamp: number | null,
  formatter: Intl.DateTimeFormat,
): string {
  return timestamp !== null && Number.isFinite(timestamp)
    ? ` · ${formatter.format(timestamp)}`
    : '';
}
