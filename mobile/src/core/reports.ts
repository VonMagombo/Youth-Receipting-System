import { standing } from './ledger';
import { ISODate, Month, monthOfDate } from './months';
import type { PayMethod } from './signing';

export interface ReportPayment {
  id: string;
  receiptNo: string;
  memberId: string;
  memberName: string;
  amountUsd: number;
  method: PayMethod;
  paidOn: ISODate;
  collectedBy: string;
  months: Month[];
  imported: boolean;
  voided: { reason: string; by: string; at: string } | null;
}

export interface ReportMember {
  id: string;
  memberNo: string;
  fullName: string;
  startMonth: Month;
  status: 'active' | 'inactive';
  covered: ReadonlySet<Month>;
}

export interface Totals {
  receipts: number;
  total: number;
  cash: number;
  mobile: number;
}

function totals(ps: ReportPayment[]): Totals {
  const live = ps.filter((p) => !p.voided);
  const sum = (m?: PayMethod) => live.filter((p) => !m || p.method === m).reduce((a, p) => a + p.amountUsd, 0);
  return { receipts: live.length, total: sum(), cash: sum('cash'), mobile: sum('mobile') };
}

export interface ReceiptRange {
  series: string; // e.g. "T-2026"
  first: string;
  last: string;
  count: number;
  /** Numbers missing between first and last: a missing receipt is a red flag. */
  missing: string[];
}

/** Assumes receipt numbers look like PREFIX-YEAR-NNNNN. */
export function receiptRanges(receiptNos: string[]): ReceiptRange[] {
  const series = new Map<string, number[]>();
  for (const r of receiptNos) {
    const m = r.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    series.set(m[1], [...(series.get(m[1]) ?? []), Number(m[2])]);
  }
  return [...series.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, nums]) => {
      nums.sort((a, b) => a - b);
      const width = 5;
      const fmt = (n: number) => `${s}-${String(n).padStart(width, '0')}`;
      const have = new Set(nums);
      const missing: string[] = [];
      for (let n = nums[0]; n <= nums[nums.length - 1] && missing.length < 50; n++) if (!have.has(n)) missing.push(fmt(n));
      return { series: s, first: fmt(nums[0]), last: fmt(nums[nums.length - 1]), count: nums.length, missing };
    });
}

export interface WeeklyReport {
  from: ISODate;
  to: ISODate;
  totals: Totals;
  byCollector: { name: string; totals: Totals }[];
  byDay: { date: ISODate; total: number }[];
  voided: { receiptNo: string; amountUsd: number; reason: string; by: string }[];
  ranges: ReceiptRange[];
  membersPaying: number;
}

/** `payments` = everything with paidOn in [from, to], voided included. */
export function weeklyReport(from: ISODate, to: ISODate, payments: ReportPayment[]): WeeklyReport {
  const inRange = payments.filter((p) => p.paidOn >= from && p.paidOn <= to && !p.imported);
  const collectors = [...new Set(inRange.map((p) => p.collectedBy))].sort();
  const days = [...new Set(inRange.filter((p) => !p.voided).map((p) => p.paidOn))].sort();
  return {
    from,
    to,
    totals: totals(inRange),
    byCollector: collectors.map((name) => ({ name, totals: totals(inRange.filter((p) => p.collectedBy === name)) })),
    byDay: days.map((date) => ({ date, total: totals(inRange.filter((p) => p.paidOn === date)).total })),
    voided: inRange
      .filter((p) => p.voided)
      .map((p) => ({ receiptNo: p.receiptNo, amountUsd: p.amountUsd, reason: p.voided!.reason, by: p.voided!.by })),
    ranges: receiptRanges(inRange.map((p) => p.receiptNo)),
    membersPaying: new Set(inRange.filter((p) => !p.voided).map((p) => p.memberId)).size,
  };
}

export interface ArrearsLine {
  memberNo: string;
  name: string;
  monthsOwed: number;
  amountOwed: number;
  oldest: Month;
}

export interface MonthlyReport {
  month: Month;
  activeMembers: number;
  /** Active members whose subscription for this month is paid or exempt. */
  coveredForMonth: number;
  exemptForMonth: number;
  collectionRate: number; // 0..1
  /** Cash actually received during the month (by receipt date). */
  received: Totals;
  /** Of the money received this month, how much was for future months. */
  advanceReceived: number;
  /** ...and how much cleared earlier months. */
  arrearsCleared: number;
  /** Members owing for this month or earlier, as of this month. */
  arrears: ArrearsLine[];
  totalArrears: number;
  yearToDate: Totals;
  unpaidThisMonth: { memberNo: string; name: string }[];
  ranges: ReceiptRange[];
  voidedCount: number;
}

export function monthlyReport(
  month: Month,
  members: ReportMember[],
  payments: ReportPayment[],
  exemptMonthsByMember: Map<string, Set<Month>>,
): MonthlyReport {
  const active = members.filter((m) => m.status === 'active' && m.startMonth <= month);
  const covered = active.filter((m) => m.covered.has(month));
  const exempt = active.filter((m) => exemptMonthsByMember.get(m.id)?.has(month));
  const receivedPs = payments.filter((p) => monthOfDate(p.paidOn) === month && !p.imported);
  const live = receivedPs.filter((p) => !p.voided);
  const advanceReceived = live.reduce((a, p) => a + p.months.filter((m) => m > month).length, 0);
  const arrearsCleared = live.reduce((a, p) => a + p.months.filter((m) => m < month).length, 0);
  const year = month.slice(0, 4);
  const ytd = payments.filter((p) => p.paidOn.slice(0, 4) === year && monthOfDate(p.paidOn) <= month && !p.imported);

  const arrears: ArrearsLine[] = active
    .map((m) => {
      const s = standing(m.startMonth, m.covered, month);
      return { memberNo: m.memberNo, name: m.fullName, monthsOwed: s.owed.length, amountOwed: s.owed.length, oldest: s.owed[0] };
    })
    .filter((a) => a.monthsOwed > 0)
    .sort((a, b) => b.monthsOwed - a.monthsOwed || a.name.localeCompare(b.name));

  return {
    month,
    activeMembers: active.length,
    coveredForMonth: covered.length,
    exemptForMonth: exempt.length,
    collectionRate: active.length ? covered.length / active.length : 0,
    received: totals(receivedPs),
    advanceReceived,
    arrearsCleared,
    arrears,
    totalArrears: arrears.reduce((a, l) => a + l.amountOwed, 0),
    yearToDate: totals(ytd),
    unpaidThisMonth: active
      .filter((m) => !m.covered.has(month))
      .map((m) => ({ memberNo: m.memberNo, name: m.fullName }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ranges: receiptRanges(receivedPs.map((p) => p.receiptNo)),
    voidedCount: receivedPs.filter((p) => p.voided).length,
  };
}
