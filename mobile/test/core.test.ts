import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { allocateMonths, checkPayment, standing } from '../src/core/ledger';
import { addMonths, monthRange, monthsLabel, weekContaining } from '../src/core/months';
import { canonicalBytes, claimToFragment, createDeviceKey, fragmentToClaim, fromB64Url, ReceiptClaim, signClaim, toB64Url, verifyClaim } from '../src/core/signing';
import { normalizePhone, parseDate, parseMonth, planImport } from '../src/core/importer';
import { receiptRanges } from '../src/core/reports';

const rnd = () => new Uint8Array(randomBytes(32));

describe('months', () => {
  it('adds months across year boundaries', () => {
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthRange('2025-12', '2026-02')).toEqual(['2025-12', '2026-01', '2026-02']);
  });
  it('labels runs compactly', () => {
    expect(monthsLabel(['2026-03', '2026-01', '2026-02', '2026-05'])).toBe('Jan–Mar 2026, May 2026');
    expect(monthsLabel(['2025-12', '2026-01'])).toBe('Dec 2025 – Jan 2026');
  });
  it('finds the Monday-Sunday week', () => {
    expect(weekContaining('2026-11-03')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // Tuesday
    expect(weekContaining('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // Sunday
  });
});

describe('ledger', () => {
  it('allocates oldest unpaid months first, then advance', () => {
    const covered = new Set(['2026-01', '2026-03']);
    expect(allocateMonths('2026-01', covered, 3)).toEqual(['2026-02', '2026-04', '2026-05']);
  });
  it('computes standing', () => {
    const s = standing('2026-01', new Set(['2026-01', '2026-02', '2026-12']), '2026-04');
    expect(s.owed).toEqual(['2026-03', '2026-04']);
    expect(s.ahead).toEqual(['2026-12']);
    expect(s.paidThrough).toBe('2026-02');
  });
  it('rejects bad payments', () => {
    const base = { startMonth: '2026-01', covered: new Set(['2026-02']), current: '2026-03' };
    expect(checkPayment({ ...base, amountUsd: 2, months: ['2026-01', '2026-03'] })).toEqual([]);
    expect(checkPayment({ ...base, amountUsd: 2, months: ['2026-01'] })[0]).toMatch(/exactly 2/);
    expect(checkPayment({ ...base, amountUsd: 1, months: ['2026-02'] }).join()).toMatch(/already paid/);
    expect(checkPayment({ ...base, amountUsd: 1, months: ['2025-12'] }).join()).toMatch(/before/);
    expect(checkPayment({ ...base, amountUsd: 1.5, months: ['2026-01'] }).join()).toMatch(/whole number/);
    expect(checkPayment({ ...base, amountUsd: 2, months: ['2026-01', '2026-01'] }).join()).toMatch(/twice/);
  });
});

describe('signing', () => {
  const claim: ReceiptClaim = {
    receiptNo: 'T-2026-00042',
    memberNo: 'Y0007',
    name: 'Tendai Moyo',
    amountUsd: 3,
    method: 'cash',
    months: ['2026-01', '2026-02', '2026-03'],
    paidOn: '2026-03-01',
    keyId: 'T-xxxx',
  };
  const key = createDeviceKey('T', rnd);
  const c = { ...claim, keyId: key.keyId };

  it('signs and verifies', () => {
    const sig = signClaim(c, key.privateKeyHex);
    expect(verifyClaim(c, sig, key.publicKeyHex)).toBe(true);
  });
  it('detects any change to the receipt', () => {
    const sig = signClaim(c, key.privateKeyHex);
    expect(verifyClaim({ ...c, amountUsd: 30 }, sig, key.publicKeyHex)).toBe(false);
    expect(verifyClaim({ ...c, name: 'Someone Else' }, sig, key.publicKeyHex)).toBe(false);
    expect(verifyClaim({ ...c, months: ['2026-01'] }, sig, key.publicKeyHex)).toBe(false);
  });
  it('rejects signatures from another key', () => {
    const other = createDeviceKey('S', rnd);
    expect(verifyClaim(c, signClaim(c, other.privateKeyHex), key.publicKeyHex)).toBe(false);
  });
  it('round-trips through the QR fragment, including non-ASCII names', () => {
    const c2 = { ...c, name: 'Nyasha O’Neil | Ç' };
    const sig = signClaim(c2, key.privateKeyHex);
    const back = fragmentToClaim('#' + claimToFragment(c2, sig))!;
    expect(back.claim).toEqual(c2);
    expect(verifyClaim(back.claim, back.sig, key.publicKeyHex)).toBe(true);
  });
  it('canonical form is order-independent for months', () => {
    expect(canonicalBytes({ ...c, months: ['2026-03', '2026-01', '2026-02'] })).toEqual(canonicalBytes(c));
  });
  it('base64url round-trips', () => {
    for (const n of [0, 1, 2, 3, 63, 64, 65]) {
      const b = new Uint8Array(randomBytes(n));
      expect(fromB64Url(toB64Url(b))).toEqual(b);
      expect(toB64Url(b)).toBe(Buffer.from(b).toString('base64url'));
    }
  });
});

describe('import parsing', () => {
  it('normalises Zimbabwe phone numbers', () => {
    expect(normalizePhone('0771 234 567')).toBe('+263771234567');
    expect(normalizePhone(771234567)).toBe('+263771234567'); // Excel dropped the zero
    expect(normalizePhone('+263 77 123 4567')).toBe('+263771234567');
    expect(normalizePhone('00263771234567')).toBe('+263771234567');
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeUndefined();
  });
  it('parses dates and months in common spreadsheet forms', () => {
    expect(parseDate('2026-03-02')).toBe('2026-03-02');
    expect(parseDate('2/3/2026')).toBe('2026-03-02'); // day/month/year
    expect(parseDate(46083)).toBe('2026-03-02'); // Excel serial
    expect(parseDate('31/2/2026')).toBeNull();
    expect(parseMonth('2026-01')).toBe('2026-01');
    expect(parseMonth('January 2026')).toBe('2026-01');
    expect(parseMonth('Feb-2026')).toBe('2026-02');
    expect(parseMonth('3/2026')).toBe('2026-03');
    expect(parseMonth(new Date(2026, 4, 1))).toBe('2026-05');
  });
});

describe('planImport', () => {
  const empty = { members: [], covered: new Map(), importedFingerprints: new Set<string>() };

  it('plans new members and auto-allocates historical payments in date order', () => {
    const plan = planImport(
      {
        members: [
          { 'Full Name': 'Tendai Moyo', Phone: '0771234567', 'Start Month': '2026-01' },
          { 'Full Name': 'Rudo Banda', Phone: 772000111, 'Start Month': 'Feb 2026' },
        ],
        payments: [
          { full_name: 'tendai moyo', date: '2026-03-01', amount_usd: 1, method: 'EcoCash', mobile_ref: 'MP123' },
          { full_name: 'Tendai Moyo', date: '2026-02-01', amount_usd: 2, method: 'cash' },
        ],
      },
      empty,
      '2026-04',
    );
    expect(plan.errors).toEqual([]);
    expect(plan.members.map((m) => m.kind)).toEqual(['new', 'new']);
    expect(plan.payments).toHaveLength(2);
    expect(plan.payments[0]).toMatchObject({ paidOn: '2026-02-01', months: ['2026-01', '2026-02'] });
    expect(plan.payments[1]).toMatchObject({ paidOn: '2026-03-01', months: ['2026-03'], method: 'mobile' });
  });

  it('reports row-level errors without stopping', () => {
    const plan = planImport(
      {
        members: [{ full_name: '', phone: '' , start_month: '2026-01'}, { full_name: 'A B', start_month: 'soon' }, { full_name: 'C D', start_month: '2026-01' }],
        payments: [{ full_name: 'Nobody', date: '2026-01-01', amount_usd: 1 }, { full_name: 'C D', date: '2026-01-05', amount_usd: 1, months: '2026-01' }, { full_name: 'C D', date: '2026-01-06', amount_usd: 1, months: '2026-01' }],
      },
      empty,
      '2026-04',
    );
    expect(plan.members).toHaveLength(1);
    expect(plan.errors.map((e) => `${e.sheet}:${e.row}`)).toEqual(['Members:2', 'Members:3', 'Payments:2', 'Payments:4']);
    expect(plan.errors[3].message).toMatch(/already paid/);
  });

  it('matches existing members and detects re-imported payments', () => {
    const state = {
      members: [{ id: 'm1', memberNo: 'Y0001', fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01', status: 'active' as const }],
      covered: new Map([['m1', new Set(['2026-01'])]]),
      importedFingerprints: new Set(['m1|2026-01-03|1|2026-01']),
    };
    const plan = planImport(
      {
        members: [{ full_name: 'TENDAI  moyo', phone: '0771234567' }],
        payments: [
          { member_no: 'y0001', date: '2026-01-03', amount_usd: 1, months: '2026-01' },
          { member_no: 'Y0001', date: '2026-02-03', amount_usd: 1 },
        ],
      },
      state,
      '2026-04',
    );
    expect(plan.errors).toEqual([]);
    expect(plan.members[0]).toMatchObject({ kind: 'update', memberId: 'm1', changes: ['phone → +263771234567'] });
    expect(plan.warnings.some((w) => /Already imported/.test(w.message))).toBe(true);
    expect(plan.payments).toHaveLength(1);
    expect(plan.payments[0].months).toEqual(['2026-02']);
  });
});

describe('receipt ranges', () => {
  it('flags missing receipt numbers', () => {
    const r = receiptRanges(['T-2026-00001', 'T-2026-00002', 'T-2026-00005', 'S-2026-00001']);
    expect(r.find((x) => x.series === 'T-2026')).toMatchObject({ count: 3, missing: ['T-2026-00003', 'T-2026-00004'] });
    expect(r.find((x) => x.series === 'S-2026')!.missing).toEqual([]);
  });
});
