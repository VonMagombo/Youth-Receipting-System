import { addMonths, isMonth, Month, monthRange } from './months';

/** Hard cap on months in a single payment; catches typos like $100 for $10. */
export const MAX_MONTHS_PER_PAYMENT = 36;
/** Payments may not reach further than this many months beyond the current month. */
export const MAX_MONTHS_AHEAD = 36;

export interface MemberStanding {
  /** Months from start to the current month (inclusive) that are neither paid nor exempt. */
  owed: Month[];
  /** Months after the current month that are already paid. */
  ahead: Month[];
  /** Latest month covered with no gap from the start month, or null if the start month is open. */
  paidThrough: Month | null;
}

/** `covered` = months paid by non-voided payments plus exempt months. */
export function standing(startMonth: Month, covered: ReadonlySet<Month>, current: Month): MemberStanding {
  const owed = startMonth <= current ? monthRange(startMonth, current).filter((m) => !covered.has(m)) : [];
  const ahead = [...covered].filter((m) => m > current).sort();
  let paidThrough: Month | null = null;
  for (let m = startMonth; covered.has(m); m = addMonths(m, 1)) paidThrough = m;
  return { owed, ahead, paidThrough };
}

/**
 * Default allocation: the oldest uncovered months first (arrears before advance),
 * starting at the member's start month.
 */
export function allocateMonths(startMonth: Month, covered: ReadonlySet<Month>, count: number): Month[] {
  const out: Month[] = [];
  let m = startMonth;
  // Bounded loop: covered is finite, so at most covered.size + count iterations.
  while (out.length < count) {
    if (!covered.has(m)) out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export interface PaymentCheckInput {
  amountUsd: number;
  months: Month[];
  startMonth: Month;
  covered: ReadonlySet<Month>;
  current: Month;
}

/** Returns a list of human-readable problems; empty means the payment is valid. */
export function checkPayment({ amountUsd, months, startMonth, covered, current }: PaymentCheckInput): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(amountUsd) || amountUsd <= 0) errors.push('Amount must be a whole number of dollars, at least $1.');
  if (amountUsd > MAX_MONTHS_PER_PAYMENT) errors.push(`A single payment cannot cover more than ${MAX_MONTHS_PER_PAYMENT} months.`);
  if (months.length !== amountUsd) errors.push(`$${amountUsd} must cover exactly ${amountUsd} month(s); ${months.length} selected.`);
  const seen = new Set<Month>();
  for (const m of months) {
    if (!isMonth(m)) {
      errors.push(`"${m}" is not a valid month.`);
      continue;
    }
    if (seen.has(m)) errors.push(`${m} is selected twice.`);
    seen.add(m);
    if (m < startMonth) errors.push(`${m} is before the member's start month (${startMonth}).`);
    if (covered.has(m)) errors.push(`${m} is already paid or exempt.`);
    if (m > addMonths(current, MAX_MONTHS_AHEAD)) errors.push(`${m} is too far in the future.`);
  }
  return errors;
}
