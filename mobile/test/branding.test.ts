/**
 * The church's name and logo appear in four places that are written separately: the app (src/core/config),
 * the receipt and report PDFs (HTML templates), and the static verification page. These tests keep them
 * saying the same thing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOGO_DATA_URI } from '../src/assets/logo';
import { COLORS as C } from '../src/core/brand';
import { ORG } from '../src/core/config';
import { monthlyReport, weeklyReport } from '../src/core/reports';
import { BRAND } from '../src/core/templates/html';
import { monthlyReportHtml, weeklyReportHtml } from '../src/core/templates/reportHtml';
import { RECEIPT_FONT_STACK, receiptHtml } from '../src/core/templates/receiptHtml';
import { RECEIPT_FONT_BOLD, RECEIPT_FONT_REGULAR } from '../src/assets/receiptFont';

const receipt = receiptHtml(
  {
    claim: { receiptNo: 'T-2026-00042', memberNo: 'Y0007', name: 'Tendai Moyo', amountUsd: 3, method: 'cash', months: ['2026-01', '2026-02', '2026-03'], paidOn: '2026-03-15', keyId: 'T-3c31e077' },
    signature: 'sig',
    collectedBy: 'Tatenda Chikomo',
    mobileRef: null,
    voided: null,
  },
  LOGO_DATA_URI,
  'https://example-youth.web.app/',
);

describe('church name', () => {
  it('is the full name from the logo, with the Youth Department', () => {
    expect(ORG).toMatchObject({ church: 'AFM in Zimbabwe', assembly: 'El-Shaddai Christian Center Assembly', department: 'Youth Department' });
  });

  it('appears in full on the receipt header', () => {
    expect(receipt).toContain('AFM IN ZIMBABWE');
    expect(receipt).toContain('El-Shaddai Christian Center Assembly');
    expect(receipt).toContain('Youth Department · Monthly Subscription');
  });

  it('appears in full on both reports', () => {
    const w = weeklyReportHtml(weeklyReport('2026-11-02', '2026-11-08', []), 'group', LOGO_DATA_URI, '8 Nov 2026');
    const m = monthlyReportHtml(monthlyReport('2026-11', [], [], new Map()), 'leadership', LOGO_DATA_URI, '8 Nov 2026');
    for (const html of [w, m]) {
      expect(html).toContain('El-Shaddai Christian Center Assembly');
      expect(html).toContain('Youth Department');
    }
  });

  it('matches on the verification page, which is static HTML and cannot import config', () => {
    const page = readFileSync(new URL('../../verify/index.html', import.meta.url), 'utf8');
    expect(page).toContain(ORG.assembly);
    expect(page).toContain(ORG.church);
    expect(page).toContain(ORG.department);
    expect(page).not.toMatch(/Elshaddai Assembly/);
  });
});

describe('logo and colors', () => {
  it('embeds the generated logo in receipts as a JPEG', () => {
    expect(LOGO_DATA_URI).toMatch(/^data:image\/jpeg;base64,\/9j\//);
    expect(receipt).toContain(`<img src="${LOGO_DATA_URI}"`);
  });

  it('uses the emblem blue in the app, the PDFs and the verification page', () => {
    const page = readFileSync(new URL('../../verify/index.html', import.meta.url), 'utf8');
    expect(C.blue).toBe('#004f90');
    expect(BRAND.blue).toBe(C.blue);
    expect(page).toContain(`--blue:${C.blue}`);
    expect(receipt).toContain(BRAND.blue);
    const report = weeklyReportHtml(weeklyReport('2026-11-02', '2026-11-08', []), 'leadership', LOGO_DATA_URI, '8 Nov 2026');
    for (const old of ['#1d1b5e', '#1D1B5E']) expect(page + receipt + report).not.toContain(old);
  });
});

describe('receipt font', () => {
  it('embeds DejaVu Sans Mono (regular and bold) so every phone prints the same monospace face', () => {
    for (const f of [RECEIPT_FONT_REGULAR, RECEIPT_FONT_BOLD]) {
      expect(f).toMatch(/^data:font\/woff2;base64,d09GMg/); // "wOF2" magic
      expect(f.length).toBeLessThan(60_000); // Latin subset, not the 340 KB full font
      expect(receipt).toContain(f);
    }
    expect(RECEIPT_FONT_STACK).toMatch(/^'Receipt Mono', 'DejaVu Sans Mono',.*monospace$/);
    expect(receipt).toContain(`font-family: ${RECEIPT_FONT_STACK}`);
  });
});
