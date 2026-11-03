/** A calendar month in `YYYY-MM` form. Lexicographic order equals chronological order. */
export type Month = string;
/** A calendar date in `YYYY-MM-DD` form (local time). */
export type ISODate = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isMonth(s: unknown): boolean {
  return typeof s === 'string' && MONTH_RE.test(s);
}

export function isISODate(s: unknown): boolean {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = (s as string).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = m.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Number of months from a to b (b - a). */
export function monthDiff(a: Month, b: Month): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Inclusive range; empty when to < from. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function monthOfDate(d: ISODate): Month {
  return d.slice(0, 7);
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function currentMonth(now: Date = new Date()): Month {
  return monthOfDate(toISODate(now));
}

export function monthLabel(m: Month): string {
  const [y, mo] = m.split('-').map(Number);
  return `${NAMES[mo - 1]} ${y}`;
}

/** Compact label for a month list, collapsing consecutive runs: "Jan–Mar 2026, May 2026". */
export function monthsLabel(months: Month[]): string {
  const sorted = [...months].sort();
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && addMonths(sorted[j], 1) === sorted[j + 1]) j++;
    if (i === j) parts.push(monthLabel(sorted[i]));
    else {
      const a = sorted[i];
      const b = sorted[j];
      parts.push(
        a.slice(0, 4) === b.slice(0, 4)
          ? `${NAMES[Number(a.slice(5)) - 1]}–${monthLabel(b)}`
          : `${monthLabel(a)} – ${monthLabel(b)}`,
      );
    }
    i = j + 1;
  }
  return parts.join(', ');
}

/** Monday..Sunday week containing the given date. */
export function weekContaining(d: ISODate): { from: ISODate; to: ISODate } {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(dt.getTime() - dow * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const f = (x: Date) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  return { from: f(start), to: f(end) };
}

export function addDays(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function dateLabel(d: ISODate): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${NAMES[m - 1]} ${y}`;
}
