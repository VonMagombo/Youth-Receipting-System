import * as ed from './noble-ed25519-2.1.0.js';

const DOMAIN = 'AFMY-RECEIPT-1';
const $ = (id) => document.getElementById(id);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fromB64Url(s) {
  const out = []; let buf = 0, bits = 0;
  for (const ch of s.replace(/=+$/, '')) {
    const v = B64.indexOf(ch); if (v < 0) throw new Error('bad signature encoding');
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}
const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));

// Must match canonicalBytes() in mobile/src/core/signing.ts exactly.
function canonical(c) {
  return new TextEncoder().encode(JSON.stringify([DOMAIN, c.receiptNo, c.memberNo, c.name, c.amountUsd, c.method, [...c.months].sort(), c.paidOn, c.keyId]));
}

function parse(fragment) {
  const p = new URLSearchParams(fragment.replace(/^.*?#/, '').replace(/^#/, ''));
  const keys = ['r','m','n','a','p','mo','d','k','s'];
  if (keys.some((k) => p.get(k) === null)) return null;
  const method = p.get('p');
  if (method !== 'cash' && method !== 'mobile') return null;
  return {
    claim: { receiptNo: p.get('r'), memberNo: p.get('m'), name: p.get('n'), amountUsd: Number(p.get('a')), method,
             months: p.get('mo').split(',').filter(Boolean), paidOn: p.get('d'), keyId: p.get('k') },
    sig: p.get('s'),
  };
}

const monthLabel = (m) => `${NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const dateLabel = (d) => `${Number(d.slice(8))} ${NAMES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

function show(kind, title, sub) {
  const v = $('verdict');
  v.className = `verdict ${kind}`;
  v.innerHTML = '';
  const h = document.createElement('h1'); h.textContent = title; v.append(h);
  if (sub) { const p = document.createElement('div'); p.textContent = sub; v.append(p); }
}

function fill(c, owner) {
  const rows = [
    ['Receipt number', c.receiptNo],
    ['Amount', `$${c.amountUsd.toFixed(2)}`],
    ['Received from', `${c.name} (${c.memberNo})`],
    ['For', `${c.months.map(monthLabel).join(', ')} (${c.months.length} month${c.months.length === 1 ? '' : 's'})`],
    ['Date', dateLabel(c.paidOn)],
    ['Method', c.method === 'cash' ? 'Cash' : 'Mobile money'],
    ['Issued by', owner ? `${owner} (key ${c.keyId})` : `key ${c.keyId}`],
  ];
  const t = $('fields'); t.innerHTML = '';
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = k;
    const b = document.createElement('td'); b.textContent = v;
    tr.append(a, b); t.append(tr);
  }
  $('details').hidden = false;
}

async function check(text) {
  $('details').hidden = true;
  const parsed = parse(text);
  if (!parsed) { show('bad', 'NOT A VALID RECEIPT CODE', 'The QR code is incomplete or not from this system.'); return; }
  const { claim, sig } = parsed;
  let keys;
  try {
    const res = await fetch('keys.json', { cache: 'no-store' });
    keys = (await res.json()).keys;
  } catch {
    show('wait', 'Could not check right now', 'The list of collector keys could not be loaded. Check your internet connection and try again.');
    return;
  }
  const key = keys.find((k) => k.keyId === claim.keyId);
  if (!key) { fill(claim); show('bad', 'NOT GENUINE', 'This receipt was not signed by a registered collector phone.'); return; }
  let ok = false;
  try { ok = await ed.verifyAsync(fromB64Url(sig), canonical(claim), hexToBytes(key.publicKey)); } catch { ok = false; }
  fill(claim, key.owner);
  if (!ok) { show('bad', 'NOT GENUINE', 'The details do not match the signature. This receipt has been altered or forged.'); return; }
  if (key.revokedAt && claim.paidOn >= key.revokedAt.slice(0, 10)) {
    show('bad', 'NOT GENUINE', `The phone that signed this receipt was reported lost or retired on ${dateLabel(key.revokedAt.slice(0, 10))}.`);
    return;
  }
  show('ok', 'GENUINE ✓', 'Issued by the Youth Department.');
}

if (location.hash.length > 1) check(location.hash);
else { show('wait', 'Scan a receipt QR code', 'Or paste the code below.'); $('paste').hidden = false; }
$('check').addEventListener('click', () => check($('pasted').value.trim()));
window.addEventListener('hashchange', () => check(location.hash));
