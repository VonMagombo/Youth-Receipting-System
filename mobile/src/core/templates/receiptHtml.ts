import { ORG } from '../config';
import { dateLabel, monthsLabel } from '../months';
import { claimToFragment, ReceiptClaim } from '../signing';
import { BASE_CSS, BRAND, esc, usd } from './html';
import { qrSvg } from './qr';

export interface ReceiptView {
  claim: ReceiptClaim;
  signature: string | null; // null for receipts imported from the paper book
  collectedBy: string;
  mobileRef: string | null;
  voided: { reason: string; at: string } | null;
}

/** Page size for expo-print, in points (A6 portrait). */
export const RECEIPT_PAGE = { width: 298, height: 420 };

/** QR content: the verify page URL with the signed claim in the fragment. */
export function verificationLink(verifyBaseUrl: string, claim: ReceiptClaim, sig: string): string {
  const frag = claimToFragment(claim, sig);
  return verifyBaseUrl ? `${verifyBaseUrl.replace(/#.*$/, '')}#${frag}` : `AFMY1#${frag}`;
}

export function receiptHtml(v: ReceiptView, logoDataUri: string, verifyBaseUrl: string): string {
  const c = v.claim;
  const qr = v.signature
    ? `<div class="qr">${qrSvg(verificationLink(verifyBaseUrl, c, v.signature), 96)}<div>Scan to verify<br/>key ${esc(c.keyId)}</div></div>`
    : `<div class="qr muted">Recorded from paper book<br/>(no digital signature)</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<style>${BASE_CSS}
  @page { size: ${RECEIPT_PAGE.width}pt ${RECEIPT_PAGE.height}pt; margin: 14pt; }
  body { font-size: 10.5px; }
  .head img { width: 48px; height: 48px; }
  .org1 { font-size: 12.5px; } .org2 { font-size: 10.5px; } .org3 { font-size: 9.5px; }
  .title { display: flex; justify-content: space-between; align-items: baseline; margin: 10px 0 4px; }
  .title b { font-size: 13px; color: ${BRAND.navy}; letter-spacing: 1px; }
  .no { font-family: "Roboto Mono", Menlo, monospace; font-weight: 700; color: ${BRAND.red}; font-size: 12px; }
  td { padding: 3px 0; } td.k { color: ${BRAND.muted}; width: 34%; }
  .amount { font-size: 22px; font-weight: 800; color: ${BRAND.navy}; margin: 6px 0 2px; }
  .qr { display: flex; align-items: center; gap: 8px; font-size: 8.5px; color: ${BRAND.muted}; margin-top: 8px; }
  .void { position: fixed; top: 40%; left: 0; right: 0; text-align: center; transform: rotate(-24deg);
          font-size: 64px; font-weight: 900; color: rgba(215,38,46,.28); letter-spacing: 6px; }
  .voidnote { color: ${BRAND.red}; font-weight: 700; margin-top: 6px; }
</style></head><body>
${v.voided ? '<div class="void">VOID</div>' : ''}
<div class="head"><img src="${logoDataUri}" alt=""/><div>
  <div class="org1">${esc(ORG.church.toUpperCase())}</div>
  <div class="org2">${esc(ORG.assembly)}</div>
  <div class="org3">${esc(ORG.department)} · Monthly Subscription</div>
</div></div>
<div class="title"><b>RECEIPT</b><span class="no">${esc(c.receiptNo)}</span></div>
<div class="amount">${usd(c.amountUsd)}</div>
<table>
  <tr><td class="k">Received from</td><td><b>${esc(c.name)}</b> <span class="muted">(${esc(c.memberNo)})</span></td></tr>
  <tr><td class="k">For</td><td>${esc(monthsLabel(c.months))} <span class="muted">(${c.months.length} month${c.months.length === 1 ? '' : 's'})</span></td></tr>
  <tr><td class="k">Date</td><td>${esc(dateLabel(c.paidOn))}</td></tr>
  <tr><td class="k">Method</td><td>${c.method === 'cash' ? 'Cash' : 'Mobile money'}${v.mobileRef ? ` · ref ${esc(v.mobileRef)}` : ''}</td></tr>
  <tr><td class="k">Received by</td><td>${esc(v.collectedBy)}</td></tr>
</table>
${v.voided ? `<div class="voidnote">This receipt was voided: ${esc(v.voided.reason)}</div>` : ''}
${qr}
<div class="foot">Thank you for your faithful support. Check this receipt is genuine by scanning the QR code: the page that opens must show the same details as this receipt.</div>
</body></html>`;
}
