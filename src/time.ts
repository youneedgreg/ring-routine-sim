/**
 * Time-zone helpers built on Intl only (no dependencies). A household lives in a
 * real time zone, so "07:10 in Columbus" becomes the correct UTC instant,
 * including across daylight-saving changes.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function offsetMinutes(timeZone: string, utcMs: number): number {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Local wall-clock time in `timeZone` -> UTC epoch ms. */
export function localToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minutesAfterMidnight: number,
): number {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0) + Math.round(minutesAfterMidnight * 60000);
  let guess = naive - offsetMinutes(timeZone, naive) * 60000;
  // Second pass settles DST boundaries.
  guess = naive - offsetMinutes(timeZone, guess) * 60000;
  return guess;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday */
  weekday: number;
  minutes: number;
}

export function utcToLocal(timeZone: string, utcMs: number): LocalParts {
  const local = new Date(utcMs + offsetMinutes(timeZone, utcMs) * 60000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60,
  };
}

/** Add whole days to a calendar date (no time zone involved). */
export function addDays(date: string, n: number): { year: number; month: number; day: number; weekday: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), weekday: dt.getUTCDay() };
}
