import { allocateMonths, checkPayment } from './ledger';
import { isISODate, isMonth, ISODate, Month, monthOfDate, toISODate } from './months';
import type { PayMethod } from './signing';

/** A cell value as SheetJS returns it with `cellDates: true`. */
export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Record<string, Cell>;

export interface ExistingMember {
  id: string;
  memberNo: string;
  fullName: string;
  phone: string | null;
  startMonth: Month;
  status: 'active' | 'inactive';
}

export interface ImportState {
  members: ExistingMember[];
  /** Covered months (paid + exempt) for each existing member id. */
  covered: Map<string, Set<Month>>;
  /** Fingerprints of payments already imported, see `paymentFingerprint`. */
  importedFingerprints: Set<string>;
}

export interface MemberData {
  fullName: string;
  phone: string | null;
  startMonth: Month;
  status: 'active' | 'inactive';
}

export type MemberAction =
  | { kind: 'new'; row: number; ref: string; data: MemberData }
  | { kind: 'update'; row: number; ref: string; memberId: string; data: MemberData; changes: string[] }
  | { kind: 'unchanged'; row: number; ref: string; memberId: string };

export interface PaymentAction {
  row: number;
  /** Either an existing member id or the `ref` of a new member in this plan. */
  memberRef: { existingId: string } | { newRef: string };
  memberName: string;
  paidOn: ISODate;
  amountUsd: number;
  method: PayMethod;
  mobileRef: string | null;
  months: Month[];
  /** True when the file gave no months and they were allocated automatically. */
  autoAllocated: boolean;
}

/**
 * Identifies a spreadsheet payment row for duplicate detection. Uses the months *as written in
 * the file* (empty when auto-allocated), because re-allocating on a second import would pick
 * different months and defeat the check.
 */
export function rowFingerprint(memberId: string, paidOn: ISODate, amountUsd: number, monthsAsWritten: Month[]): string {
  return paymentFingerprint(memberId, paidOn, amountUsd, monthsAsWritten);
}

export interface Issue {
  sheet: 'Members' | 'Payments' | 'File';
  row: number;
  message: string;
}

export interface ImportPlan {
  members: MemberAction[];
  payments: PaymentAction[];
  errors: Issue[];
  warnings: Issue[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const ALIASES: Record<string, string> = {
  name: 'full_name',
  fullname: 'full_name',
  full_name: 'full_name',
  member_name: 'full_name',
  phone: 'phone',
  phone_number: 'phone',
  cell: 'phone',
  mobile: 'phone',
  whatsapp: 'phone',
  start_month: 'start_month',
  start: 'start_month',
  joined: 'start_month',
  status: 'status',
  member_no: 'member_no',
  member_number: 'member_no',
  date: 'date',
  paid_on: 'date',
  amount: 'amount_usd',
  amount_usd: 'amount_usd',
  method: 'method',
  payment_method: 'method',
  mobile_ref: 'mobile_ref',
  reference: 'mobile_ref',
  ref: 'mobile_ref',
  months: 'months',
};

/** Rename columns to canonical names; unknown columns are dropped. */
export function canonicalizeRows(rows: Row[]): Row[] {
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      const c = ALIASES[normHeader(k)];
      if (c && out[c] === undefined) out[c] = v;
    }
    return out;
  });
}

const text = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return toISODate(v);
  return String(v).trim();
};

/** Excel serial date (days since 1899-12-30) to ISO date. */
function excelSerialToISO(n: number): ISODate {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDate(v: Cell): ISODate | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : toISODate(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelSerialToISO(v);
  const s = text(v);
  if (isISODate(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // Zimbabwe uses day/month/year
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}

export function parseMonth(v: Cell): Month | null {
  if (v instanceof Date || typeof v === 'number') {
    const d = parseDate(v);
    return d ? monthOfDate(d) : null;
  }
  const s = text(v).toLowerCase();
  if (isMonth(s)) return s;
  const iso = parseDate(s);
  if (iso) return monthOfDate(iso);
  const named = s.match(/^([a-z]{3})[a-z]*[\s,-]+(\d{4})$/);
  if (named) {
    const idx = MONTH_NAMES.indexOf(named[1]);
    if (idx >= 0) return `${named[2]}-${String(idx + 1).padStart(2, '0')}`;
  }
  const mY = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (mY) {
    const m = `${mY[2]}-${mY[1].padStart(2, '0')}`;
    if (isMonth(m)) return m;
  }
  return null;
}

/**
 * Normalise Zimbabwean phone numbers to E.164. Excel often drops the leading zero,
 * so 771234567 is accepted. Returns null for empty input, `undefined` if unparseable.
 */
export function normalizePhone(v: Cell): string | null | undefined {
  const raw = text(v);
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  let d = digits.startsWith('+') ? digits.slice(1) : digits;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('263')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (/^7\d{8}$/.test(d)) return `+263${d}`;
  if (digits.startsWith('+') && /^\+\d{9,15}$/.test(digits)) return digits; // foreign number
  return undefined;
}

function parseMethod(v: Cell): PayMethod | null {
  const s = text(v).toLowerCase();
  if (!s || s === 'cash') return 'cash';
  if (/(mobile|ecocash|onemoney|innbucks|telecash|mukuru|transfer|bank)/.test(s)) return 'mobile';
  return null;
}

export function paymentFingerprint(memberKey: string, paidOn: ISODate, amountUsd: number, months: Month[]): string {
  return [memberKey, paidOn, amountUsd, [...months].sort().join(',')].join('|');
}

/**
 * Build an exact, side-effect-free import plan. The preview shown to the user is this plan,
 * and applying it does nothing the preview did not show.
 */
export function planImport(
  sheets: { members: Row[]; payments: Row[] },
  state: ImportState,
  current: Month,
): ImportPlan {
  const plan: ImportPlan = { members: [], payments: [], errors: [], warnings: [] };
  const err = (sheet: Issue['sheet'], row: number, message: string) => plan.errors.push({ sheet, row, message });
  const warn = (sheet: Issue['sheet'], row: number, message: string) => plan.warnings.push({ sheet, row, message });

  const byNo = new Map(state.members.map((m) => [m.memberNo.toUpperCase(), m]));
  const byName = new Map<string, ExistingMember[]>();
  for (const m of state.members) {
    const k = norm(m.fullName);
    byName.set(k, [...(byName.get(k) ?? []), m]);
  }

  // Resolution table used by the Payments sheet: lookup key -> member reference.
  type Ref = { existingId: string } | { newRef: string };
  const resolved = new Map<string, { ref: Ref; name: string; startMonth: Month; covered: Set<Month> }>();
  const seenInFile = new Set<string>();

  const members = canonicalizeRows(sheets.members);
  members.forEach((r, i) => {
    const row = i + 2; // header is row 1
    const fullName = text(r.full_name).replace(/\s+/g, ' ');
    if (!fullName && Object.values(r).every((v) => text(v) === '')) return; // blank line
    if (!fullName) return err('Members', row, 'Missing full_name.');
    const phone = normalizePhone(r.phone);
    if (phone === undefined) warn('Members', row, `Phone "${text(r.phone)}" not recognised; left blank.`);
    const startMonth = r.start_month === undefined || text(r.start_month) === '' ? current : parseMonth(r.start_month);
    if (!startMonth) return err('Members', row, `start_month "${text(r.start_month)}" is not a month (use 2026-01).`);
    if (startMonth > current) warn('Members', row, `start_month ${startMonth} is in the future.`);
    const st = text(r.status).toLowerCase();
    if (st && st !== 'active' && st !== 'inactive') return err('Members', row, `status must be active or inactive, got "${st}".`);
    const data: MemberData = { fullName, phone: phone ?? null, startMonth, status: st === 'inactive' ? 'inactive' : 'active' };

    const fileKey = `${norm(fullName)}|${data.phone ?? ''}`;
    if (seenInFile.has(fileKey)) return err('Members', row, `Duplicate of an earlier row (${fullName}).`);
    seenInFile.add(fileKey);

    // Match an existing member: explicit member_no wins, otherwise name (+ phone to disambiguate).
    let existing: ExistingMember | undefined;
    const no = text(r.member_no).toUpperCase();
    if (no) {
      existing = byNo.get(no);
      if (!existing) warn('Members', row, `member_no ${no} not found; member will get a new number.`);
    }
    if (!existing) {
      const cands = byName.get(norm(fullName)) ?? [];
      const narrowed = data.phone ? cands.filter((c) => c.phone === data.phone || c.phone === null) : cands;
      if (narrowed.length === 1) existing = narrowed[0];
      else if (narrowed.length > 1) return err('Members', row, `"${fullName}" matches several existing members; add member_no to choose.`);
    }

    const ref = `row${row}`;
    if (existing) {
      const changes: string[] = [];
      if (data.phone && data.phone !== existing.phone) changes.push(`phone → ${data.phone}`);
      if (data.startMonth !== existing.startMonth && r.start_month !== undefined && text(r.start_month) !== '')
        changes.push(`start month → ${data.startMonth}`);
      if (st && data.status !== existing.status) changes.push(`status → ${data.status}`);
      const merged: MemberData = {
        fullName: existing.fullName,
        phone: data.phone ?? existing.phone,
        startMonth: changes.some((c) => c.startsWith('start')) ? data.startMonth : existing.startMonth,
        status: st ? data.status : existing.status,
      };
      plan.members.push(
        changes.length
          ? { kind: 'update', row, ref, memberId: existing.id, data: merged, changes }
          : { kind: 'unchanged', row, ref, memberId: existing.id },
      );
      const entry = {
        ref: { existingId: existing.id },
        name: existing.fullName,
        startMonth: merged.startMonth,
        covered: new Set(state.covered.get(existing.id) ?? []),
      };
      resolved.set(`no:${existing.memberNo.toUpperCase()}`, entry);
      resolved.set(`name:${norm(existing.fullName)}`, entry);
    } else {
      plan.members.push({ kind: 'new', row, ref, data });
      const entry = { ref: { newRef: ref }, name: fullName, startMonth, covered: new Set<Month>() };
      const nameKey = `name:${norm(fullName)}`;
      // A name that appears twice cannot be used to link payments.
      resolved.set(nameKey, resolved.has(nameKey) ? { ...entry, ref: { newRef: '__ambiguous__' } } : entry);
    }
  });

  // Existing members not mentioned in the Members sheet can still be referenced by Payments.
  for (const m of state.members) {
    const kNo = `no:${m.memberNo.toUpperCase()}`;
    if (!resolved.has(kNo)) {
      const entry = { ref: { existingId: m.id }, name: m.fullName, startMonth: m.startMonth, covered: new Set(state.covered.get(m.id) ?? []) };
      resolved.set(kNo, entry);
      const kName = `name:${norm(m.fullName)}`;
      if (!resolved.has(kName)) resolved.set(kName, entry);
      else if ((byName.get(norm(m.fullName)) ?? []).length > 1) resolved.set(kName, { ...entry, ref: { newRef: '__ambiguous__' } });
    }
  }

  // Payments are applied in date order so automatic allocation matches what really happened.
  const payments = canonicalizeRows(sheets.payments)
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => Object.values(r).some((v) => text(v) !== ''));
  const parsed = payments.map(({ r, row }) => ({ r, row, date: parseDate(r.date) }));
  parsed.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.row - b.row);

  for (const { r, row, date } of parsed) {
    const no = text(r.member_no).toUpperCase();
    const name = text(r.full_name);
    const target = (no && resolved.get(`no:${no}`)) || (name && resolved.get(`name:${norm(name)}`)) || undefined;
    if (!target) {
      err('Payments', row, `Member "${no || name || '(blank)'}" not found in the app or the Members sheet.`);
      continue;
    }
    if ('newRef' in target.ref && target.ref.newRef === '__ambiguous__') {
      err('Payments', row, `"${name}" is ambiguous (several members share it); use member_no.`);
      continue;
    }
    if (!date) {
      err('Payments', row, `date "${text(r.date)}" is not a date (use 2026-03-01 or 1/3/2026).`);
      continue;
    }
    const amount = typeof r.amount_usd === 'number' ? r.amount_usd : Number(text(r.amount_usd).replace(/^\$/, ''));
    const method = parseMethod(r.method);
    if (!method) {
      err('Payments', row, `method "${text(r.method)}" must be cash or mobile.`);
      continue;
    }
    const mobileRef = text(r.mobile_ref) || null;

    let months: Month[];
    const monthsText = text(r.months);
    if (monthsText) {
      const parts = monthsText.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      const ms = parts.map((p) => parseMonth(p));
      if (ms.some((m) => !m)) {
        err('Payments', row, `months "${monthsText}" contains an invalid month.`);
        continue;
      }
      months = ms as Month[];
    } else {
      months = Number.isInteger(amount) && amount > 0 && amount <= 36 ? allocateMonths(target.startMonth, target.covered, amount) : [];
    }

    // Re-importing the same file must not double-count; only existing members can have prior imports.
    if ('existingId' in target.ref && state.importedFingerprints.has(rowFingerprint(target.ref.existingId, date, amount, monthsText ? months : []))) {
      warn('Payments', row, 'Already imported earlier; skipped.');
      continue;
    }
    const problems = checkPayment({ amountUsd: amount, months, startMonth: target.startMonth, covered: target.covered, current });
    if (problems.length) {
      err('Payments', row, problems.join(' '));
      continue;
    }
    months.forEach((m) => target.covered.add(m));
    plan.payments.push({ row, memberRef: target.ref, memberName: target.name, paidOn: date, amountUsd: amount, method, mobileRef, months, autoAllocated: !monthsText });
  }

  if (!plan.members.length && !plan.payments.length && !plan.errors.length) {
    err('File', 0, 'No data found. Use the template: a "Members" sheet and optionally a "Payments" sheet.');
  }
  return plan;
}
