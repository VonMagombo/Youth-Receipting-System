import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import type { Row } from '../core/importer';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Move a file into the cache under a friendly name (what WhatsApp shows the recipient). */
async function renameInCache(uri: string, name: string): Promise<File> {
  const safe = name.replace(/[^A-Za-z0-9._ -]+/g, '_');
  const dest = new File(Paths.cache, safe);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);
  return dest;
}

/** Render HTML to a PDF and open the Android share sheet (pick WhatsApp there). */
export async function sharePdf(html: string, fileName: string, page: { width: number; height: number }, dialogTitle: string) {
  const { uri } = await Print.printToFileAsync({ html, width: page.width, height: page.height });
  const file = await renameInCache(uri, fileName);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
}

export interface PickedWorkbook {
  name: string;
  members: Row[];
  payments: Row[];
}

const findSheet = (wb: XLSX.WorkBook, name: string) => wb.SheetNames.find((s) => s.trim().toLowerCase() === name);

/** Let the user pick an .xlsx/.xls/.csv file and read its Members and Payments sheets. */
export async function pickWorkbook(): Promise<PickedWorkbook | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [XLSX_MIME, 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const bytes = await new File(asset.uri).bytes();
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const toRows = (sheet?: string): Row[] => (sheet ? XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheet], { defval: '', raw: true }) : []);
  const membersSheet = findSheet(wb, 'members') ?? (wb.SheetNames.length === 1 ? wb.SheetNames[0] : undefined);
  return { name: asset.name, members: toRows(membersSheet), payments: toRows(findSheet(wb, 'payments')) };
}

/** Write sheets to an .xlsx in the cache and open the share sheet. */
export async function shareWorkbook(fileName: string, sheets: Record<string, Record<string, unknown>[]>, dialogTitle: string) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
  }
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(data));
  await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, dialogTitle });
}

export const IMPORT_TEMPLATE = {
  Members: [
    { full_name: 'Tendai Moyo', phone: '0771234567', start_month: '2026-01', status: 'active' },
    { full_name: 'Rudo Banda', phone: '0772000111', start_month: '2026-03', status: 'active' },
  ],
  Payments: [
    { full_name: 'Tendai Moyo', date: '2026-03-01', amount_usd: 3, method: 'cash', mobile_ref: '', months: '2026-01,2026-02,2026-03' },
    { full_name: 'Rudo Banda', date: '2026-03-08', amount_usd: 1, method: 'mobile', mobile_ref: 'MP260308.1234.A56789', months: '' },
  ],
  Instructions: [
    { field: 'Members.full_name', rule: 'Required. Members get numbers (Y0001…) automatically.' },
    { field: 'Members.phone', rule: 'Optional. 0771234567 or +263771234567.' },
    { field: 'Members.start_month', rule: 'First month the member owes, e.g. 2026-01. Blank = this month.' },
    { field: 'Members.status', rule: 'active or inactive. Blank = active.' },
    { field: 'Payments sheet', rule: 'Optional. Past payments from the paper book. Receipts get the H- series.' },
    { field: 'Payments.full_name / member_no', rule: 'Who paid. Must match a member in the app or in the Members sheet.' },
    { field: 'Payments.date', rule: '2026-03-01 or 1/3/2026 (day/month/year).' },
    { field: 'Payments.amount_usd', rule: 'Whole dollars. $1 = one month.' },
    { field: 'Payments.method', rule: 'cash or mobile (EcoCash etc.). Blank = cash.' },
    { field: 'Payments.months', rule: 'Optional, comma separated. Blank = oldest unpaid months first.' },
  ],
};
