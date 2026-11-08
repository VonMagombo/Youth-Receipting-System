import { IMPORT_PREFIX } from '../core/config';
import { ExistingMember, ImportPlan, ImportState, rowFingerprint } from '../core/importer';
import { allocateMonths, checkPayment, standing } from '../core/ledger';
import { currentMonth, isMonth, ISODate, Month, todayLocal } from '../core/months';
import type { ReportMember, ReportPayment } from '../core/reports';
import type { PayMethod, ReceiptClaim } from '../core/signing';
import { Db, SCHEMA, SCHEMA_VERSION } from './schema';

export interface Member {
  id: string;
  memberNo: string;
  fullName: string;
  phone: string | null;
  startMonth: Month;
  status: 'active' | 'inactive';
}

export interface MemberWithStanding extends Member {
  owed: number;
  ahead: number;
  paidThrough: Month | null;
}

export interface Payment {
  id: string;
  receiptNo: string;
  memberId: string;
  memberName: string;
  memberNo: string;
  amountUsd: number;
  method: PayMethod;
  mobileRef: string | null;
  paidOn: ISODate;
  collectedBy: string;
  keyId: string | null;
  signature: string | null;
  claim: ReceiptClaim;
  months: Month[];
  imported: boolean;
  createdAt: string;
  voided: { reason: string; by: string; at: string } | null;
}

export interface Exemption {
  id: string;
  memberId: string;
  month: Month;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

/** Device identity used to number and sign receipts. */
export interface Signer {
  prefix: string;
  keyId: string;
  collectorName: string;
  sign(claim: ReceiptClaim): string;
}

export interface RepoDeps {
  db: Db;
  uuid: () => string;
  now?: () => Date;
}

export class RepoError extends Error {}

const LAST_BACKUP_KEY = 'last_backup_at';
/** audit_log.seq of the newest change included in the last backup. */
const LAST_BACKUP_SEQ_KEY = 'last_backup_seq';
/** Audit action for an export. Excluded when finding the last data change, since it changes no data. */
const BACKUP_ACTION = 'backup.export';

type MemberRow = { id: string; member_no: string; full_name: string; phone: string | null; start_month: string; status: 'active' | 'inactive' };
type PaymentRow = {
  id: string;
  receipt_no: string;
  member_id: string;
  full_name: string;
  member_no: string;
  amount_usd: number;
  method: PayMethod;
  mobile_ref: string | null;
  paid_on: string;
  collected_by: string;
  key_id: string | null;
  signature: string | null;
  claim_json: string;
  imported: number;
  created_at: string;
  months: string | null;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
};

const toMember = (r: MemberRow): Member => ({
  id: r.id,
  memberNo: r.member_no,
  fullName: r.full_name,
  phone: r.phone,
  startMonth: r.start_month,
  status: r.status,
});

const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  receiptNo: r.receipt_no,
  memberId: r.member_id,
  memberName: r.full_name,
  memberNo: r.member_no,
  amountUsd: r.amount_usd,
  method: r.method,
  mobileRef: r.mobile_ref,
  paidOn: r.paid_on,
  collectedBy: r.collected_by,
  keyId: r.key_id,
  signature: r.signature,
  claim: JSON.parse(r.claim_json),
  months: r.months ? r.months.split(',').sort() : [],
  imported: !!r.imported,
  createdAt: r.created_at,
  voided: r.void_reason ? { reason: r.void_reason, by: r.voided_by!, at: r.voided_at! } : null,
});

const PAYMENT_SELECT = `
SELECT p.*, m.full_name, m.member_no,
       (SELECT group_concat(month) FROM payment_months pm WHERE pm.payment_id = p.id) AS months,
       v.reason AS void_reason, v.voided_by, v.created_at AS voided_at
FROM payments p
JOIN members m ON m.id = p.member_id
LEFT JOIN voids v ON v.payment_id = p.id`;

export class Repo {
  private db: Db;
  private uuid: () => string;
  private now: () => Date;

  constructor(deps: RepoDeps) {
    this.db = deps.db;
    this.uuid = deps.uuid;
    this.now = deps.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    await this.db.exec(SCHEMA);
    await this.db.run(`INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', ?)`, [String(SCHEMA_VERSION)]);
  }

  private stamp() {
    return this.now().toISOString();
  }

  // ---------- settings ----------
  async getSetting(key: string): Promise<string | null> {
    const r = await this.db.get<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, [key]);
    return r?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.run(`INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
  }

  private async audit(db: Db, actor: string, action: string, detail: object) {
    await db.run(`INSERT INTO audit_log(at, actor, action, detail) VALUES (?, ?, ?, ?)`, [this.stamp(), actor, action, JSON.stringify(detail)]);
  }

  async auditLog(limit = 200) {
    return this.db.all<{ seq: number; at: string; actor: string; action: string; detail: string }>(
      `SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?`,
      [limit],
    );
  }

  private async nextCounter(db: Db, name: string): Promise<number> {
    await db.run(`INSERT INTO counters(name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1`, [name]);
    const r = await db.get<{ value: number }>(`SELECT value FROM counters WHERE name = ?`, [name]);
    return r!.value;
  }

  // ---------- members ----------
  private async nextMemberNo(db: Db): Promise<string> {
    // Skip numbers already taken (e.g. by earlier imports), so the UNIQUE constraint never trips.
    for (;;) {
      const no = `Y${String(await this.nextCounter(db, 'member_no')).padStart(4, '0')}`;
      if (!(await db.get(`SELECT 1 AS x FROM members WHERE member_no = ?`, [no]))) return no;
    }
  }

  private validateMember(fullName: string, startMonth: Month) {
    if (fullName.trim().length < 2) throw new RepoError('Enter the member’s full name.');
    if (!isMonth(startMonth)) throw new RepoError('Start month must look like 2026-01.');
  }

  /** Pass `tx` when already inside a transaction; otherwise one is opened. */
  async addMember(input: { fullName: string; phone: string | null; startMonth: Month }, actor: string, tx?: Db): Promise<Member> {
    this.validateMember(input.fullName, input.startMonth);
    const run = async (tx: Db) => {
      const id = this.uuid();
      const memberNo = await this.nextMemberNo(tx);
      const t = this.stamp();
      const fullName = input.fullName.trim().replace(/\s+/g, ' ');
      await tx.run(
        `INSERT INTO members(id, member_no, full_name, phone, start_month, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        [id, memberNo, fullName, input.phone, input.startMonth, t, t],
      );
      await this.audit(tx, actor, 'member.add', { id, memberNo, fullName });
      return { id, memberNo, fullName, phone: input.phone, startMonth: input.startMonth, status: 'active' as const };
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  async updateMember(id: string, patch: Partial<Pick<Member, 'fullName' | 'phone' | 'startMonth' | 'status'>>, actor: string, tx?: Db) {
    const run = async (tx: Db) => {
      const cur = await this.getMember(id, tx);
      if (!cur) throw new RepoError('Member not found.');
      const next = { ...cur, ...patch };
      this.validateMember(next.fullName, next.startMonth);
      if (next.startMonth > cur.startMonth) {
        // Moving the start later must not orphan months that were already paid.
        const early = await tx.get<{ n: number }>(
          `SELECT count(*) AS n FROM payment_months pm JOIN payments p ON p.id = pm.payment_id
           LEFT JOIN voids v ON v.payment_id = p.id WHERE pm.member_id = ? AND pm.month < ? AND v.id IS NULL`,
          [id, next.startMonth],
        );
        if (early && early.n > 0) throw new RepoError('There are paid months before that start month.');
      }
      await tx.run(`UPDATE members SET full_name = ?, phone = ?, start_month = ?, status = ?, updated_at = ? WHERE id = ?`, [
        next.fullName.trim().replace(/\s+/g, ' '),
        next.phone,
        next.startMonth,
        next.status,
        this.stamp(),
        id,
      ]);
      await this.audit(tx, actor, 'member.update', { id, patch });
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  async getMember(id: string, db: Db = this.db): Promise<Member | null> {
    const r = await db.get<MemberRow>(`SELECT * FROM members WHERE id = ?`, [id]);
    return r ? toMember(r) : null;
  }

  async listMembers(): Promise<Member[]> {
    return (await this.db.all<MemberRow>(`SELECT * FROM members ORDER BY full_name COLLATE NOCASE`)).map(toMember);
  }

  /** Months covered by non-voided payments plus exemptions, per member. */
  async coveredMap(db: Db = this.db, memberId?: string): Promise<Map<string, Set<Month>>> {
    const filter = memberId ? 'AND pm.member_id = ?' : '';
    const filterE = memberId ? 'WHERE member_id = ?' : '';
    const params = memberId ? [memberId] : [];
    const rows = await db.all<{ member_id: string; month: string }>(
      `SELECT pm.member_id, pm.month FROM payment_months pm
       LEFT JOIN voids v ON v.payment_id = pm.payment_id
       WHERE v.id IS NULL ${filter}
       UNION ALL SELECT member_id, month FROM exemptions ${filterE}`,
      [...params, ...params],
    );
    const map = new Map<string, Set<Month>>();
    for (const r of rows) {
      if (!map.has(r.member_id)) map.set(r.member_id, new Set());
      map.get(r.member_id)!.add(r.month);
    }
    return map;
  }

  async membersWithStanding(asOf: Month = currentMonth(this.now())): Promise<MemberWithStanding[]> {
    const [members, covered] = await Promise.all([this.listMembers(), this.coveredMap()]);
    return members.map((m) => {
      const s = standing(m.startMonth, covered.get(m.id) ?? new Set(), asOf);
      return { ...m, owed: s.owed.length, ahead: s.ahead.length, paidThrough: s.paidThrough };
    });
  }

  async suggestMonths(memberId: string, count: number): Promise<Month[]> {
    const m = await this.getMember(memberId);
    if (!m) throw new RepoError('Member not found.');
    const covered = (await this.coveredMap(this.db, memberId)).get(memberId) ?? new Set();
    return allocateMonths(m.startMonth, covered, count);
  }

  // ---------- payments ----------
  async recordPayment(
    input: { memberId: string; amountUsd: number; method: PayMethod; mobileRef: string | null; months: Month[]; paidOn?: ISODate },
    signer: Signer,
  ): Promise<Payment> {
    if (input.method === 'mobile' && !input.mobileRef?.trim()) throw new RepoError('Enter the mobile money transaction reference.');
    const id = this.uuid();
    await this.db.transaction(async (tx) => {
      const member = await this.getMember(input.memberId, tx);
      if (!member) throw new RepoError('Member not found.');
      if (member.status !== 'active') throw new RepoError('This member is inactive. Reactivate them first.');
      const covered = (await this.coveredMap(tx, member.id)).get(member.id) ?? new Set();
      const paidOn = input.paidOn ?? todayLocal(this.now());
      const problems = checkPayment({
        amountUsd: input.amountUsd,
        months: input.months,
        startMonth: member.startMonth,
        covered,
        current: currentMonth(this.now()),
      });
      if (problems.length) throw new RepoError(problems.join('\n'));

      const year = paidOn.slice(0, 4);
      const seq = await this.nextCounter(tx, `receipt:${signer.prefix}:${year}`);
      const receiptNo = `${signer.prefix}-${year}-${String(seq).padStart(5, '0')}`;
      const claim: ReceiptClaim = {
        receiptNo,
        memberNo: member.memberNo,
        name: member.fullName,
        amountUsd: input.amountUsd,
        method: input.method,
        months: [...input.months].sort(),
        paidOn,
        keyId: signer.keyId,
      };
      const signature = signer.sign(claim);
      await tx.run(
        `INSERT INTO payments(id, receipt_no, member_id, amount_usd, method, mobile_ref, paid_on, collected_by, key_id, signature, claim_json, imported, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [id, receiptNo, member.id, input.amountUsd, input.method, input.mobileRef?.trim() || null, paidOn, signer.collectorName, signer.keyId, signature, JSON.stringify(claim), this.stamp()],
      );
      for (const m of claim.months) await tx.run(`INSERT INTO payment_months(payment_id, member_id, month) VALUES (?, ?, ?)`, [id, member.id, m]);
      await this.audit(tx, signer.collectorName, 'payment.record', { id, receiptNo, memberNo: member.memberNo, amountUsd: input.amountUsd, months: claim.months });
    });
    return (await this.getPayment(id))!;
  }

  async voidPayment(paymentId: string, reason: string, actor: string): Promise<void> {
    if (reason.trim().length < 3) throw new RepoError('Give a reason for voiding (at least 3 characters).');
    await this.db.transaction(async (tx) => {
      const p = await tx.get<{ id: string; receipt_no: string }>(`SELECT id, receipt_no FROM payments WHERE id = ?`, [paymentId]);
      if (!p) throw new RepoError('Receipt not found.');
      if (await tx.get(`SELECT 1 AS x FROM voids WHERE payment_id = ?`, [paymentId])) throw new RepoError('This receipt is already voided.');
      await tx.run(`INSERT INTO voids(id, payment_id, reason, voided_by, created_at) VALUES (?, ?, ?, ?, ?)`, [this.uuid(), paymentId, reason.trim(), actor, this.stamp()]);
      await this.audit(tx, actor, 'payment.void', { paymentId, receiptNo: p.receipt_no, reason: reason.trim() });
    });
  }

  async getPayment(id: string): Promise<Payment | null> {
    const r = await this.db.get<PaymentRow>(`${PAYMENT_SELECT} WHERE p.id = ?`, [id]);
    return r ? toPayment(r) : null;
  }

  async paymentsForMember(memberId: string): Promise<Payment[]> {
    return (await this.db.all<PaymentRow>(`${PAYMENT_SELECT} WHERE p.member_id = ? ORDER BY p.paid_on DESC, p.created_at DESC`, [memberId])).map(toPayment);
  }

  async paymentsBetween(from: ISODate, to: ISODate): Promise<Payment[]> {
    return (await this.db.all<PaymentRow>(`${PAYMENT_SELECT} WHERE p.paid_on BETWEEN ? AND ? ORDER BY p.paid_on, p.receipt_no`, [from, to])).map(toPayment);
  }

  async recentPayments(limit = 30): Promise<Payment[]> {
    return (await this.db.all<PaymentRow>(`${PAYMENT_SELECT} ORDER BY p.created_at DESC LIMIT ?`, [limit])).map(toPayment);
  }

  // ---------- exemptions ----------
  async addExemption(memberId: string, month: Month, reason: string, approvedBy: string, actor: string): Promise<void> {
    if (!isMonth(month)) throw new RepoError('Month must look like 2026-01.');
    if (reason.trim().length < 3) throw new RepoError('Give a reason for the exemption.');
    if (approvedBy.trim().length < 2) throw new RepoError('Enter who approved the exemption.');
    await this.db.transaction(async (tx) => {
      const member = await this.getMember(memberId, tx);
      if (!member) throw new RepoError('Member not found.');
      if (month < member.startMonth) throw new RepoError('That month is before the member’s start month.');
      const covered = (await this.coveredMap(tx, memberId)).get(memberId) ?? new Set();
      if (covered.has(month)) throw new RepoError('That month is already paid or exempt.');
      await tx.run(`INSERT INTO exemptions(id, member_id, month, reason, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
        this.uuid(),
        memberId,
        month,
        reason.trim(),
        approvedBy.trim(),
        this.stamp(),
      ]);
      await this.audit(tx, actor, 'exemption.add', { memberId, month, reason: reason.trim(), approvedBy: approvedBy.trim() });
    });
  }

  async exemptionsForMember(memberId: string): Promise<Exemption[]> {
    const rows = await this.db.all<{ id: string; member_id: string; month: string; reason: string; approved_by: string; created_at: string }>(
      `SELECT * FROM exemptions WHERE member_id = ? ORDER BY month`,
      [memberId],
    );
    return rows.map((r) => ({ id: r.id, memberId: r.member_id, month: r.month, reason: r.reason, approvedBy: r.approved_by, createdAt: r.created_at }));
  }

  // ---------- import ----------
  async importState(): Promise<ImportState> {
    const members: ExistingMember[] = await this.listMembers();
    const covered = await this.coveredMap();
    const fps = await this.db.all<{ fingerprint: string }>(`SELECT fingerprint FROM payments WHERE imported = 1 AND fingerprint IS NOT NULL`);
    return { members, covered, importedFingerprints: new Set(fps.map((f) => f.fingerprint)) };
  }

  /** Applies a plan produced by `planImport`. All-or-nothing. */
  async applyImport(plan: ImportPlan, actor: string): Promise<{ added: number; updated: number; payments: number }> {
    if (plan.errors.length) throw new RepoError('Fix the errors in the file before importing.');
    return this.db.transaction(async (tx) => {
      const refToId = new Map<string, string>();
      let added = 0;
      let updated = 0;
      for (const a of plan.members) {
        if (a.kind === 'new') {
          const m = await this.addMember({ fullName: a.data.fullName, phone: a.data.phone, startMonth: a.data.startMonth }, actor, tx);
          if (a.data.status === 'inactive') await this.updateMember(m.id, { status: 'inactive' }, actor, tx);
          refToId.set(a.ref, m.id);
          added++;
        } else if (a.kind === 'update') {
          await this.updateMember(a.memberId, { phone: a.data.phone, startMonth: a.data.startMonth, status: a.data.status }, actor, tx);
          updated++;
        }
      }
      const year = (d: string) => d.slice(0, 4);
      for (const p of plan.payments) {
        const memberId = 'existingId' in p.memberRef ? p.memberRef.existingId : refToId.get(p.memberRef.newRef);
        if (!memberId) throw new RepoError(`Internal error: unresolved member for payment row ${p.row}.`);
        const member = (await this.getMember(memberId, tx))!;
        const covered = (await this.coveredMap(tx, memberId)).get(memberId) ?? new Set();
        // Re-check against the live database in case something changed since the preview.
        const problems = checkPayment({ amountUsd: p.amountUsd, months: p.months, startMonth: member.startMonth, covered, current: currentMonth(this.now()) });
        if (problems.length) throw new RepoError(`Payments row ${p.row}: ${problems.join(' ')}`);
        const seq = await this.nextCounter(tx, `receipt:${IMPORT_PREFIX}:${year(p.paidOn)}`);
        const receiptNo = `${IMPORT_PREFIX}-${year(p.paidOn)}-${String(seq).padStart(5, '0')}`;
        const claim: ReceiptClaim = {
          receiptNo,
          memberNo: member.memberNo,
          name: member.fullName,
          amountUsd: p.amountUsd,
          method: p.method,
          months: [...p.months].sort(),
          paidOn: p.paidOn,
          keyId: 'imported',
        };
        const id = this.uuid();
        await tx.run(
          `INSERT INTO payments(id, receipt_no, member_id, amount_usd, method, mobile_ref, paid_on, collected_by, key_id, signature, claim_json, imported, fingerprint, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, ?, ?)`,
          [id, receiptNo, memberId, p.amountUsd, p.method, p.mobileRef, p.paidOn, `${actor} (import)`, JSON.stringify(claim), rowFingerprint(memberId, p.paidOn, p.amountUsd, p.autoAllocated ? [] : p.months), this.stamp()],
        );
        for (const m of claim.months) await tx.run(`INSERT INTO payment_months(payment_id, member_id, month) VALUES (?, ?, ?)`, [id, memberId, m]);
      }
      await this.audit(tx, actor, 'import', { added, updated, payments: plan.payments.length });
      return { added, updated, payments: plan.payments.length };
    });
  }

  // ---------- reports ----------
  async reportData(from: ISODate, to: ISODate) {
    const [members, payments, covered, exRows] = await Promise.all([
      this.listMembers(),
      this.paymentsBetween(from, to),
      this.coveredMap(),
      this.db.all<{ member_id: string; month: string }>(`SELECT member_id, month FROM exemptions`),
    ]);
    const exempt = new Map<string, Set<Month>>();
    for (const e of exRows) {
      if (!exempt.has(e.member_id)) exempt.set(e.member_id, new Set());
      exempt.get(e.member_id)!.add(e.month);
    }
    const reportMembers: ReportMember[] = members.map((m) => ({ ...m, covered: covered.get(m.id) ?? new Set() }));
    const reportPayments: ReportPayment[] = payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      memberId: p.memberId,
      memberName: p.memberName,
      amountUsd: p.amountUsd,
      method: p.method,
      paidOn: p.paidOn,
      collectedBy: p.collectedBy,
      months: p.months,
      imported: p.imported,
      voided: p.voided,
    }));
    return { members: reportMembers, payments: reportPayments, exempt };
  }

  /**
   * Inputs for `backupStatus`. "Unsaved" is decided by audit_log.seq, not by timestamps, so a
   * phone clock that was wrong at some point cannot make a real change look backed up.
   */
  async backupInputs(): Promise<{ lastBackupAt: string | null; oldestUnsavedAt: string | null }> {
    const lastSeq = Number((await this.getSetting(LAST_BACKUP_SEQ_KEY)) ?? 0);
    const oldest = await this.db.get<{ at: string }>(`SELECT at FROM audit_log WHERE seq > ? AND action <> ? ORDER BY seq LIMIT 1`, [
      lastSeq,
      BACKUP_ACTION,
    ]);
    return { lastBackupAt: await this.getSetting(LAST_BACKUP_KEY), oldestUnsavedAt: oldest?.at ?? null };
  }

  /**
   * Record a backup made from the snapshot whose `seq` came from `backupSnapshot()`. Changes made
   * after the snapshot was read stay unsaved.
   */
  async markBackedUp(seq: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, value] of [
        [LAST_BACKUP_KEY, this.stamp()],
        [LAST_BACKUP_SEQ_KEY, String(seq)],
      ]) {
        await tx.run(`INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
      }
      await this.audit(tx, 'app', BACKUP_ACTION, { seq });
    });
  }

  /** Everything for the Excel backup, plus the audit position it covers (for `markBackedUp`). */
  async backupSnapshot(): Promise<{ seq: number; sheets: Record<string, Record<string, unknown>[]> }> {
    return this.db.transaction(async (tx) => {
      const seq = (await tx.get<{ seq: number | null }>(`SELECT MAX(seq) AS seq FROM audit_log`))?.seq ?? 0;
      const t = await this.exportTables(tx);
      const sheets = {
        Members: t.members.map((m) => ({ member_no: m.memberNo, full_name: m.fullName, phone: m.phone ?? '', start_month: m.startMonth, status: m.status })),
        Payments: t.payments.map((p) => ({
          receipt_no: p.receiptNo,
          member_no: p.memberNo,
          full_name: p.memberName,
          date: p.paidOn,
          amount_usd: p.amountUsd,
          method: p.method,
          mobile_ref: p.mobileRef ?? '',
          months: p.months.join(','),
          collected_by: p.collectedBy,
          voided: p.voided ? 'yes' : '',
          void_reason: p.voided?.reason ?? '',
          signature: p.signature ?? '',
          key_id: p.keyId ?? '',
        })),
        Exemptions: t.exemptions,
        AuditLog: t.audit,
      };
      return { seq, sheets };
    });
  }

  /** Flat tables for the Excel backup. Every query goes through `db` so a snapshot reads one consistent state. */
  private async exportTables(db: Db) {
    const members = (await db.all<MemberRow>(`SELECT * FROM members ORDER BY full_name COLLATE NOCASE`)).map(toMember);
    const payments = (await db.all<PaymentRow>(`${PAYMENT_SELECT} ORDER BY p.paid_on, p.receipt_no`)).map(toPayment);
    const exemptions = await db.all<Record<string, unknown>>(
      `SELECT m.member_no, m.full_name, e.month, e.reason, e.approved_by, e.created_at FROM exemptions e JOIN members m ON m.id = e.member_id ORDER BY e.month`,
    );
    const audit = await db.all<Record<string, unknown>>(`SELECT * FROM audit_log ORDER BY seq`);
    return { members, payments, exemptions, audit };
  }
}
