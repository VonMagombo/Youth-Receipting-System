/**
 * Backup reminder. Until sync exists the ledger lives only on one phone, so a lost or reset phone
 * loses everything since the last Excel export. The home screen nags when that window gets long.
 */

/** Days after the last backup before the reminder appears (only if something changed since). */
export const BACKUP_DUE_DAYS = 7;
/** Days after which the reminder turns red. */
export const BACKUP_OVERDUE_DAYS = 14;

export type BackupLevel = 'ok' | 'due' | 'overdue';

export interface BackupStatus {
  level: BackupLevel;
  /** Whole days since the last backup, or null if there has never been one. */
  daysSinceBackup: number | null;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * The reminder tracks how much would be lost if the phone died now: the age of the oldest change
 * that no backup contains yet. A month-old backup with nothing new since is fine; a change made a
 * week ago and never exported is not.
 *
 * @param lastBackupAt ISO time of the last Excel export, or null.
 * @param oldestUnsavedAt ISO time of the oldest data change not in any backup, or null if every
 *   change is backed up (or there is no data).
 */
export function backupStatus(input: { lastBackupAt: string | null; oldestUnsavedAt: string | null; now: Date }): BackupStatus {
  const now = input.now.getTime();
  const backup = parse(input.lastBackupAt);
  const since = backup === null ? null : days(now - backup);

  if (input.oldestUnsavedAt === null) {
    if (since === null) return { level: 'ok', daysSinceBackup: null, message: 'Nothing to back up yet.' };
    return { level: 'ok', daysSinceBackup: since, message: since === 0 ? 'Backed up today.' : `Last backup ${since} day${since === 1 ? '' : 's'} ago.` };
  }

  // Unsaved data exists. If its time is unreadable, or in the future (stamped while the clock ran
  // ahead), its real age is unknown: assume it is due rather than stay silent until the clock catches up.
  const unsaved = parse(input.oldestUnsavedAt);
  const age = unsaved === null || unsaved > now ? BACKUP_DUE_DAYS : days(now - unsaved);
  const overdue = age >= BACKUP_OVERDUE_DAYS;

  if (since === null) {
    return { level: overdue ? 'overdue' : 'due', daysSinceBackup: null, message: 'This phone has never been backed up. If it is lost, every receipt on it is lost too.' };
  }
  if (age < BACKUP_DUE_DAYS) {
    return { level: 'ok', daysSinceBackup: since, message: since === 0 ? 'Backed up today.' : `Last backup ${since} day${since === 1 ? '' : 's'} ago.` };
  }
  return {
    level: overdue ? 'overdue' : 'due',
    daysSinceBackup: since,
    message: `Changes from ${age} days ago are not in any backup yet.`,
  };
}

/** Whole days, never negative: a phone clock set backwards must not produce "-3 days ago". */
function days(ms: number): number {
  return Math.max(0, Math.floor(ms / DAY_MS));
}
