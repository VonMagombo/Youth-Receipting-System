import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BACKUP_DUE_DAYS, BACKUP_OVERDUE_DAYS, backupStatus } from '../src/core/backup';
import { createDeviceKey, signClaim } from '../src/core/signing';
import type { Db } from '../src/db/schema';
import { Repo, Signer } from '../src/db/repo';
import { nodeDb } from './nodeDb';

const day = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-03-15T10:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString();

describe('backupStatus', () => {
  it('is not due on a fresh install with no data', () => {
    expect(backupStatus({ lastBackupAt: null, oldestUnsavedAt: null, now: NOW })).toMatchObject({ level: 'ok', message: 'Nothing to back up yet.' });
  });

  it('is due as soon as data exists and nothing was ever backed up', () => {
    const s = backupStatus({ lastBackupAt: null, oldestUnsavedAt: ago(0), now: NOW });
    expect(s.level).toBe('due');
    expect(s.message).toMatch(/never been backed up/i);
  });

  it('becomes overdue when data older than the overdue limit was never backed up', () => {
    expect(backupStatus({ lastBackupAt: null, oldestUnsavedAt: ago(BACKUP_OVERDUE_DAYS), now: NOW }).level).toBe('overdue');
  });

  it('is ok when everything is backed up, however old the backup is', () => {
    expect(backupStatus({ lastBackupAt: ago(60), oldestUnsavedAt: null, now: NOW })).toMatchObject({ level: 'ok', daysSinceBackup: 60 });
  });

  it('does not nag about a change made today just because the last backup is old', () => {
    expect(backupStatus({ lastBackupAt: ago(30), oldestUnsavedAt: ago(0), now: NOW }).level).toBe('ok');
  });

  it('is due once an unsaved change is a week old, overdue after two', () => {
    const due = backupStatus({ lastBackupAt: ago(20), oldestUnsavedAt: ago(BACKUP_DUE_DAYS), now: NOW });
    expect(due).toMatchObject({ level: 'due', daysSinceBackup: 20 });
    expect(due.message).toMatch(/from 7 days ago are not in any backup/);
    expect(backupStatus({ lastBackupAt: ago(20), oldestUnsavedAt: ago(BACKUP_DUE_DAYS - 1), now: NOW }).level).toBe('ok');
    expect(backupStatus({ lastBackupAt: ago(20), oldestUnsavedAt: ago(BACKUP_OVERDUE_DAYS), now: NOW }).level).toBe('overdue');
  });

  it('never shows negative days if the phone clock was set back', () => {
    const future = new Date(NOW.getTime() + 3 * day).toISOString();
    expect(backupStatus({ lastBackupAt: future, oldestUnsavedAt: null, now: NOW })).toMatchObject({ level: 'ok', daysSinceBackup: 0, message: 'Backed up today.' });
  });

  it('treats an unreadable backup date as never backed up rather than crashing', () => {
    expect(backupStatus({ lastBackupAt: 'garbage', oldestUnsavedAt: ago(0), now: NOW }).level).toBe('due');
  });

  it('treats a change stamped in the future (clock ran ahead) as due, not as brand new', () => {
    const future = new Date(NOW.getTime() + 365 * day).toISOString();
    expect(backupStatus({ lastBackupAt: ago(1), oldestUnsavedAt: future, now: NOW }).level).toBe('due');
  });

  it('treats an unreadable change date as due, never as "nothing to back up"', () => {
    expect(backupStatus({ lastBackupAt: ago(1), oldestUnsavedAt: 'garbage', now: NOW }).level).toBe('due');
  });
});

/**
 * Mimics expo-sqlite's exclusive transaction: the transaction body gets its own connection, and the
 * root connection may not be used until it finishes (on a phone that waits on the lock forever).
 */
function exclusiveDb(): Db {
  const inner = nodeDb();
  let inTx = false;
  const guard =
    <K extends keyof Db>(k: K) =>
    (...args: any[]) => {
      if (inTx) throw new Error(`root connection used inside a transaction (${k})`);
      return (inner[k] as any)(...args);
    };
  const txConn: Db = { ...inner, transaction: () => Promise.reject(new Error('nested transaction')) };
  return {
    run: guard('run'),
    all: guard('all'),
    get: guard('get'),
    exec: guard('exec'),
    transaction: <T,>(fn: (tx: Db) => Promise<T>) =>
      inner.transaction(async () => {
        inTx = true;
        try {
          return await fn(txConn);
        } finally {
          inTx = false;
        }
      }),
  } as Db;
}

describe('Repo backup tracking', () => {
  async function setup(db: Db = nodeDb()) {
    let now = NOW;
    const repo = new Repo({ db, uuid: randomUUID, now: () => now });
    await repo.init();
    const key = createDeviceKey('T', () => new Uint8Array(randomBytes(32)));
    const signer: Signer = { prefix: 'T', keyId: key.keyId, collectorName: 'Treasurer', sign: (c) => signClaim(c, key.privateKeyHex) };
    const member = () => repo.addMember({ fullName: 'Tendai Moyo', phone: null, startMonth: '2026-01' }, 'T');
    const pay = (memberId: string) => repo.recordPayment({ memberId, amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-01'] }, signer);
    const backUp = async () => repo.markBackedUp((await repo.backupSnapshot()).seq);
    return { repo, member, pay, backUp, setNow: (d: Date) => (now = d) };
  }

  it('reports nothing unsaved and no backup on an empty database', async () => {
    const { repo } = await setup();
    expect(await repo.backupInputs()).toEqual({ lastBackupAt: null, oldestUnsavedAt: null });
  });

  it('reports the oldest unsaved change, and nothing unsaved after a backup', async () => {
    const { repo, member, pay, backUp, setNow } = await setup();
    const m = await member();
    setNow(new Date(NOW.getTime() + day));
    await pay(m.id);
    expect((await repo.backupInputs()).oldestUnsavedAt).toBe(NOW.toISOString());

    const later = new Date(NOW.getTime() + 2 * day);
    setNow(later);
    await backUp();
    expect(await repo.backupInputs()).toEqual({ lastBackupAt: later.toISOString(), oldestUnsavedAt: null });

    // A backup is not itself a data change, and is logged for the audit trail.
    expect((await repo.auditLog(1))[0].action).toBe('backup.export');
  });

  it('keeps a change made while the share sheet was open as unsaved', async () => {
    const { repo, member, pay } = await setup();
    const m = await member();
    const snap = await repo.backupSnapshot();
    await pay(m.id); // recorded after the file was built, so it is not in it
    await repo.markBackedUp(snap.seq);
    expect((await repo.backupInputs()).oldestUnsavedAt).toBe(NOW.toISOString());
  });

  it('counts a change as unsaved even if the phone clock put it before the last backup', async () => {
    const { repo, member, backUp, setNow } = await setup();
    await backUp();
    setNow(new Date(NOW.getTime() - 5 * day)); // clock wound back
    await member();
    expect((await repo.backupInputs()).oldestUnsavedAt).not.toBeNull();
  });

  it('end to end: a payment left unsaved for a week makes the reminder due', async () => {
    const { repo, member, pay, backUp } = await setup();
    const m = await member();
    await backUp();
    await pay(m.id);
    expect(backupStatus({ ...(await repo.backupInputs()), now: NOW }).level).toBe('ok');
    const weekLater = new Date(NOW.getTime() + BACKUP_DUE_DAYS * day);
    expect(backupStatus({ ...(await repo.backupInputs()), now: weekLater }).level).toBe('due');
  });

  it('snapshot contains every table, with receipt numbers and signatures', async () => {
    const { repo, member, pay } = await setup();
    const m = await member();
    await pay(m.id);
    const { seq, sheets } = await repo.backupSnapshot();
    expect(seq).toBeGreaterThan(0);
    expect(Object.keys(sheets)).toEqual(['Members', 'Payments', 'Exemptions', 'AuditLog']);
    expect(sheets.Members).toEqual([expect.objectContaining({ member_no: m.memberNo, full_name: 'Tendai Moyo' })]);
    expect(sheets.Payments).toEqual([expect.objectContaining({ receipt_no: 'T-2026-00001', member_no: m.memberNo, signature: expect.any(String) })]);
    expect(sheets.AuditLog).toHaveLength(2);
  });

  it('snapshot reads only through the transaction connection, as expo-sqlite requires', async () => {
    const { repo, member, pay, backUp } = await setup(exclusiveDb());
    await pay((await member()).id);
    await expect(backUp()).resolves.toBeUndefined();
    expect((await repo.backupInputs()).oldestUnsavedAt).toBeNull();
  });
});
