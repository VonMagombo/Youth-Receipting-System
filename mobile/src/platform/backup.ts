import { Alert } from 'react-native';
import type { Repo } from '../db/repo';
import { shareWorkbook } from './files';

/** Ask a yes/no question. Dismissing the dialog (back button, tap outside) counts as No. */
function confirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'No', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Yes, saved or sent', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/**
 * Export every table to an .xlsx, open the share sheet, and record what the backup covered.
 * Android does not report whether the file was actually saved or sent (closing the share sheet looks
 * the same as sending), so the collector has to confirm. Returns whether the backup was recorded.
 */
export async function exportBackup(repo: Repo): Promise<boolean> {
  const { seq, sheets } = await repo.backupSnapshot();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  await shareWorkbook(`youth-subs-backup-${stamp}.xlsx`, sheets, 'Save or send the backup');
  const saved = await confirm(
    'Did the backup leave this phone?',
    'Only say yes if you sent the file to the church Google Drive, email or WhatsApp. A file left on this phone is lost with the phone.',
  );
  if (saved) await repo.markBackedUp(seq);
  return saved;
}
