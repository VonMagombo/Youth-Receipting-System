import { ORG } from '../config';
import { dateLabel, monthLabel } from '../months';
import type { MonthlyReport, ReceiptRange, Totals, WeeklyReport } from '../reports';
import { BASE_CSS, BRAND, esc, usd } from './html';

/**
 * `group`: totals only, safe to post in the youth WhatsApp group.
 * `leadership`: includes named lists (arrears, unpaid), for leaders only.
 */
export type Audience = 'group' | 'leadership';

export const REPORT_PAGE = { width: 595, height: 842 }; // A4 portrait, points

function shell(title: string, subtitle: string, audience: Audience, body: string, logo: string, generatedAt: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${BASE_CSS}
  @page { size: A4; margin: 28pt; }
  .kpis { display: flex; gap: 8px; margin: 10px 0; }
  .kpi { flex: 1; border: 1px solid ${BRAND.line}; border-radius: 8px; padding: 8px 10px; }
  .kpi .v { font-size: 20px; font-weight: 800; color: ${BRAND.navy}; }
  .kpi .l { font-size: 10px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: .5px; }
  .tag { display: inline-block; font-size: 9.5px; padding: 2px 8px; border-radius: 10px; font-weight: 700;
         background: ${audience === 'group' ? '#e8f3ea' : '#fdecec'}; color: ${audience === 'group' ? '#1f6b34' : BRAND.red}; }
  tr:nth-child(even) td { background: #f6f6fa; }
  .warn { color: ${BRAND.red}; font-weight: 600; }
</style></head><body>
<div class="head"><img src="${logo}" alt=""/><div>
  <div class="org1">${esc(ORG.church.toUpperCase())} · ${esc(ORG.assembly)}</div>
  <div class="org2">${esc(ORG.department)} — ${esc(title)}</div>
  <div class="org3">${esc(subtitle)} &nbsp; <span class="tag">${audience === 'group' ? 'GROUP SUMMARY' : 'LEADERSHIP — CONFIDENTIAL'}</span></div>
</div></div>
${body}
<div class="foot">Generated ${esc(generatedAt)}. Amounts in USD. Subscription: ${usd(ORG.subscriptionUsd)} per member per month.</div>
</body></html>`;
}

const kpi = (v: string, l: string) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;

function totalsRow(label: string, t: Totals) {
  return `<tr><td>${esc(label)}</td><td class="num">${t.receipts}</td><td class="num">${usd(t.cash)}</td><td class="num">${usd(t.mobile)}</td><td class="num"><b>${usd(t.total)}</b></td></tr>`;
}

function rangesTable(ranges: ReceiptRange[]) {
  if (!ranges.length) return '';
  return `<h1>Receipt numbers issued</h1><table><tr><th>Series</th><th>First</th><th>Last</th><th class="num">Count</th><th>Missing numbers</th></tr>
${ranges
  .map(
    (r) =>
      `<tr><td>${esc(r.series)}</td><td>${esc(r.first)}</td><td>${esc(r.last)}</td><td class="num">${r.count}</td><td class="${r.missing.length ? 'warn' : ''}">${r.missing.length ? esc(r.missing.join(', ')) : 'none'}</td></tr>`,
  )
  .join('')}</table>`;
}

export function weeklyReportHtml(r: WeeklyReport, audience: Audience, logo: string, generatedAt: string): string {
  let body = `<div class="kpis">${kpi(usd(r.totals.total), 'Collected')}${kpi(String(r.totals.receipts), 'Receipts')}${kpi(String(r.membersPaying), 'Members paid')}</div>
<table><tr><th></th><th class="num">Receipts</th><th class="num">Cash</th><th class="num">Mobile money</th><th class="num">Total</th></tr>
${totalsRow('This week', r.totals)}</table>`;
  if (r.byDay.length) {
    body += `<h1>By day</h1><table><tr><th>Date</th><th class="num">Collected</th></tr>${r.byDay
      .map((d) => `<tr><td>${esc(dateLabel(d.date))}</td><td class="num">${usd(d.total)}</td></tr>`)
      .join('')}</table>`;
  }
  if (audience === 'leadership') {
    body += `<h1>By collector</h1><table><tr><th>Collector</th><th class="num">Receipts</th><th class="num">Cash</th><th class="num">Mobile money</th><th class="num">Total</th></tr>
${r.byCollector.map((c) => totalsRow(c.name, c.totals)).join('') || '<tr><td colspan="5" class="muted">No receipts this week.</td></tr>'}</table>`;
    body += rangesTable(r.ranges);
    body += `<h1>Voided receipts</h1>${
      r.voided.length
        ? `<table><tr><th>Receipt</th><th class="num">Amount</th><th>Reason</th><th>Voided by</th></tr>${r.voided
            .map((v) => `<tr><td>${esc(v.receiptNo)}</td><td class="num">${usd(v.amountUsd)}</td><td>${esc(v.reason)}</td><td>${esc(v.by)}</td></tr>`)
            .join('')}</table>`
        : '<p class="muted">None.</p>'
    }`;
  }
  return shell('Weekly Collections', `${dateLabel(r.from)} – ${dateLabel(r.to)}`, audience, body, logo, generatedAt);
}

export function monthlyReportHtml(r: MonthlyReport, audience: Audience, logo: string, generatedAt: string): string {
  const pct = `${Math.round(r.collectionRate * 100)}%`;
  let body = `<div class="kpis">${kpi(usd(r.received.total), 'Received this month')}${kpi(pct, `Paid up for ${monthLabel(r.month)}`)}${kpi(
    `${r.coveredForMonth}/${r.activeMembers}`,
    'Members covered',
  )}</div>
<table><tr><th></th><th class="num">Receipts</th><th class="num">Cash</th><th class="num">Mobile money</th><th class="num">Total</th></tr>
${totalsRow(monthLabel(r.month), r.received)}${totalsRow(`Year to date (${r.month.slice(0, 4)})`, r.yearToDate)}</table>
<h1>Where this month's money went</h1>
<table>
<tr><td>Months paid in advance</td><td class="num">${usd(r.advanceReceived)}</td></tr>
<tr><td>Earlier months cleared (arrears)</td><td class="num">${usd(r.arrearsCleared)}</td></tr>
<tr><td>Members exempt this month</td><td class="num">${r.exemptForMonth}</td></tr>
<tr><td>Members with arrears</td><td class="num">${r.arrears.length}</td></tr>
<tr><td>Total arrears outstanding</td><td class="num"><b>${usd(r.totalArrears)}</b></td></tr>
</table>`;
  if (audience === 'leadership') {
    body += rangesTable(r.ranges);
    if (r.voidedCount) body += `<p class="warn">${r.voidedCount} receipt(s) voided this month — see the weekly reports for reasons.</p>`;
    body += `<h1>Arrears by member</h1>${
      r.arrears.length
        ? `<table><tr><th>No.</th><th>Name</th><th>Owing since</th><th class="num">Months</th><th class="num">Amount</th></tr>${r.arrears
            .map(
              (a) =>
                `<tr><td>${esc(a.memberNo)}</td><td>${esc(a.name)}</td><td>${esc(monthLabel(a.oldest))}</td><td class="num">${a.monthsOwed}</td><td class="num">${usd(a.amountOwed)}</td></tr>`,
            )
            .join('')}</table>`
        : '<p class="muted">Nobody is in arrears.</p>'
    }`;
  }
  return shell('Monthly Report', monthLabel(r.month), audience, body, logo, generatedAt);
}
