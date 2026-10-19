/** Daily reports use the America/Chicago calendar day, not UTC. */
export const REPORT_TIME_ZONE = 'America/Chicago';

/** YYYY-MM-DD in America/Chicago. 2026-10-15T01:17Z is still 2026-10-14. */
export function reportCalendarDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

function calendarDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Noon UTC stays on the same calendar day in Chicago (UTC-5 or UTC-6).
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

/** Long calendar date with an explicit Central Time label. */
export function formatReportDate(date: string): string {
  const parsed = calendarDate(date);
  if (!parsed) return date;
  return `${parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: REPORT_TIME_ZONE,
  })} CT`;
}

/** Compact calendar date for tight cards, still labeled as Central Time. */
export function formatReportDateShort(date: string): string {
  const parsed = calendarDate(date);
  if (!parsed) return date;
  return `${parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: REPORT_TIME_ZONE,
  })} CT`;
}

/** Timestamp shown in Central Time. Stored values stay ISO-8601. */
export function formatGeneratedAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(parsed);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('month')} ${value('day')}, ${value('year')}, ${value('hour')}:${value('minute')} ${value('dayPeriod')} CT`;
}

/** Calendar days from `date` to today in America/Chicago. Negative if `date` is ahead. */
export function daysBehindReport(date: string, now = new Date()): number {
  const today = reportCalendarDay(now);
  if (!calendarDate(date) || !calendarDate(today)) return 0;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const checked = Date.parse(`${date}T00:00:00Z`);
  return Math.round((todayMs - checked) / 86_400_000);
}
