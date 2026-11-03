import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { planImport } from '../src/core/importer';
import { monthlyReport, weeklyReport } from '../src/core/reports';
import { createDeviceKey, signClaim, verifyClaim } from '../src/core/signing';
import { Repo, Signer } from '../src/db/repo';
import { nodeDb } from './nodeDb';

const NOW = new Date('2026-03-15T10:00:00');

function setup() {
  const db = nodeDb();
  const repo = new Repo({ db, uuid: randomUUID, now: () => NOW });
  const key = createDeviceKey('T', () => new Uint8Array(randomBytes(32)));
  const signer: Signer = { prefix: 'T', keyId: key.keyId, collectorName: 'Treasurer', sign: (c) => signClaim(c, key.privateKeyHex) };
  return { db, repo, key, signer };
}

describe('Repo', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await ctx.repo.init();
  });

  it('assigns member numbers in sequence', async () => {
    const a = await ctx.repo.addMember({ fullName: '  Tendai   Moyo ', phone: null, startMonth: '2026-01' }, 'T');
    const b = await ctx.repo.addMember({ fullName: 'Rudo Banda', phone: '+263772000111', startMonth: '2026-01' }, 'T');
    expect([a.memberNo, b.memberNo]).toEqual(['Y0001', 'Y0002']);
    expect(a.fullName).toBe('Tendai Moyo');
  });

  it('records a signed payment with sequential receipt numbers', async () => {
    const m = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    const months = await ctx.repo.suggestMonths(m.id, 2);
    expect(months).toEqual(['2026-01', '2026-02']);
    const p1 = await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 2, method: 'cash', mobileRef: null, months }, ctx.signer);
    const p2 = await ctx.repo.recordPayment(
      { memberId: m.id, amountUsd: 1, method: 'mobile', mobileRef: 'MP26.ABC', months: await ctx.repo.suggestMonths(m.id, 1) },
      ctx.signer,
    );
    expect(p1.receiptNo).toBe('T-2026-00001');
    expect(p2.receiptNo).toBe('T-2026-00002');
    expect(p2.months).toEqual(['2026-03']);
    expect(verifyClaim(p1.claim, p1.signature!, ctx.key.publicKeyHex)).toBe(true);
    const [s] = await ctx.repo.membersWithStanding();
    expect(s).toMatchObject({ owed: 0, ahead: 0, paidThrough: '2026-03' });
  });

  it('refuses double payment for a month and requires mobile ref', async () => {
    const m = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, ctx.signer);
    await expect(ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, ctx.signer)).rejects.toThrow(/already paid/);
    await expect(ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'mobile', mobileRef: ' ', months: ['2026-02'] }, ctx.signer)).rejects.toThrow(/reference/);
    // The failed attempts must not consume receipt numbers.
    const p = await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-02'] }, ctx.signer);
    expect(p.receiptNo).toBe('T-2026-00002');
  });

  it('voiding frees the months and keeps the record', async () => {
    const m = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    const p = await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, ctx.signer);
    await ctx.repo.voidPayment(p.id, 'Wrong member', 'Treasurer');
    await expect(ctx.repo.voidPayment(p.id, 'again', 'Treasurer')).rejects.toThrow(/already voided/);
    expect((await ctx.repo.getPayment(p.id))!.voided).toMatchObject({ reason: 'Wrong member' });
    const again = await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, ctx.signer);
    expect(again.receiptNo).toBe('T-2026-00002');
  });

  it('database triggers block editing or deleting payments', async () => {
    const m = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    const p = await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, ctx.signer);
    await expect(ctx.db.run(`UPDATE payments SET amount_usd = 5 WHERE id = ?`, [p.id])).rejects.toThrow(/append-only/);
    await expect(ctx.db.run(`DELETE FROM payments WHERE id = ?`, [p.id])).rejects.toThrow(/cannot be deleted/);
    await expect(ctx.db.run(`DELETE FROM payment_months`)).rejects.toThrow(/cannot be deleted/);
    await expect(ctx.db.run(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
    // Sync bookkeeping is still allowed.
    await ctx.db.run(`UPDATE payments SET synced_at = 'x' WHERE id = ?`, [p.id]);
  });

  it('exemptions count as covered', async () => {
    const m = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    await ctx.repo.addExemption(m.id, '2026-01', 'Hardship', 'Youth Pastor', 'Treasurer');
    expect(await ctx.repo.suggestMonths(m.id, 1)).toEqual(['2026-02']);
    await expect(ctx.repo.addExemption(m.id, '2026-01', 'Hardship', 'Pastor', 'T')).rejects.toThrow(/already/);
  });

  it('blocks moving the start month past paid months', async () => {
    const m = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    await ctx.repo.recordPayment({ memberId: m.id, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, ctx.signer);
    await expect(ctx.repo.updateMember(m.id, { startMonth: '2026-02' }, 'T')).rejects.toThrow(/paid months before/);
  });

  it('imports a plan atomically and is idempotent on re-import', async () => {
    const sheets = {
      members: [
        { full_name: 'Tendai Moyo', phone: '0771234567', start_month: '2026-01' },
        { full_name: 'Rudo Banda', start_month: '2026-02', status: 'inactive' },
      ],
      payments: [{ full_name: 'Tendai Moyo', date: '2026-02-01', amount_usd: 2, method: 'cash' }],
    };
    const plan = planImport(sheets, await ctx.repo.importState(), '2026-03');
    const res = await ctx.repo.applyImport(plan, 'Treasurer');
    expect(res).toEqual({ added: 2, updated: 0, payments: 1 });
    const ms = await ctx.repo.membersWithStanding();
    expect(ms.find((m) => m.fullName === 'Tendai Moyo')).toMatchObject({ owed: 1, phone: '+263771234567' });
    expect(ms.find((m) => m.fullName === 'Rudo Banda')!.status).toBe('inactive');

    const again = planImport(sheets, await ctx.repo.importState(), '2026-03');
    expect(again.members.every((m) => m.kind === 'unchanged')).toBe(true);
    expect(again.payments).toHaveLength(0);
  });

  it('rolls back the whole import on failure', async () => {
    const plan = planImport({ members: [{ full_name: 'A Person', start_month: '2026-01' }], payments: [] }, await ctx.repo.importState(), '2026-03');
    plan.payments.push({ row: 9, memberRef: { newRef: 'nope' }, memberName: 'x', paidOn: '2026-01-01', amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'], autoAllocated: false });
    await expect(ctx.repo.applyImport(plan, 'T')).rejects.toThrow(/unresolved/);
    expect(await ctx.repo.listMembers()).toHaveLength(0);
  });

  it('produces weekly and monthly reports', async () => {
    const a = await ctx.repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    const b = await ctx.repo.addMember({ fullName: 'Rudo Banda', phone: null, startMonth: '2026-01' }, 'T');
    await ctx.repo.recordPayment({ memberId: a.id, amountUsd: 5, method: 'cash', mobileRef: null, months: await ctx.repo.suggestMonths(a.id, 5) }, ctx.signer);
    const pb = await ctx.repo.recordPayment({ memberId: b.id, amountUsd: 1, method: 'mobile', mobileRef: 'R1', months: ['2026-01'] }, ctx.signer);
    await ctx.repo.voidPayment(pb.id, 'Duplicate', 'Treasurer');

    const data = await ctx.repo.reportData('2026-01-01', '2026-03-31');
    const w = weeklyReport('2026-03-09', '2026-03-15', data.payments);
    expect(w.totals).toEqual({ receipts: 1, total: 5, cash: 5, mobile: 0 });
    expect(w.voided).toHaveLength(1);
    expect(w.ranges[0]).toMatchObject({ first: 'T-2026-00001', last: 'T-2026-00002', missing: [] });

    const mr = monthlyReport('2026-03', data.members, data.payments, data.exempt);
    expect(mr).toMatchObject({ activeMembers: 2, coveredForMonth: 1, advanceReceived: 2, arrearsCleared: 2, totalArrears: 3 });
    expect(mr.arrears[0]).toMatchObject({ name: 'Rudo Banda', monthsOwed: 3, oldest: '2026-01' });
  });
});
