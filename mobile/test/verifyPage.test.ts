/**
 * Runs the real verification page (verify/verify.js) against receipts signed by the app's own code.
 * verify.js re-implements the signed byte format in plain browser JS; if the two ever drift, every
 * genuine receipt would show NOT GENUINE once the page is live. This test is the guard.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDeviceKey, ReceiptClaim, signClaim } from '../src/core/signing';
import { verificationLink } from '../src/core/templates/receiptHtml';

// ---- a minimal DOM: just the calls verify.js makes ----
interface El {
  id?: string;
  tag: string;
  className: string;
  hidden: boolean;
  textContent: string;
  value: string;
  children: El[];
  innerHTML: string;
  append(...c: El[]): void;
  addEventListener(ev: string, fn: () => void): void;
}
function el(tag: string, id?: string): El {
  const e: El = {
    id,
    tag,
    className: '',
    hidden: false,
    textContent: '',
    value: '',
    children: [],
    set innerHTML(_: string) {
      e.children = [];
    },
    get innerHTML() {
      return '';
    },
    append: (...c) => e.children.push(...c),
    addEventListener: () => {},
  };
  return e;
}
const byId = new Map<string, El>();
const listeners = new Map<string, () => void>();
let keysJson: unknown = { keys: [] };

function verdict(): { kind: string; title: string; sub: string } {
  const v = byId.get('verdict')!;
  return { kind: v.className.replace('verdict ', ''), title: v.children[0]?.textContent ?? '', sub: v.children[1]?.textContent ?? '' };
}
function field(name: string): string | undefined {
  const row = byId.get('fields')!.children.find((tr) => tr.children[0].textContent === name);
  return row?.children[1].textContent;
}

async function checkLink(link: string) {
  (globalThis as any).location.hash = link.slice(link.indexOf('#'));
  byId.get('verdict')!.className = '';
  listeners.get('hashchange')!();
  await vi.waitFor(() => expect(verdict().kind).not.toBe(''));
  return verdict();
}

// ---- receipts signed exactly as the app signs them ----
const treasurer = createDeviceKey('T', () => new Uint8Array(randomBytes(32)));
const stranger = createDeviceKey('T', () => new Uint8Array(randomBytes(32)));
const BASE = 'https://elshaddai-youth.web.app/';
const claim: ReceiptClaim = {
  receiptNo: 'T-2026-00042',
  memberNo: 'Y0007',
  name: "Nyasha O'Brien-Moyo & Tanaka+Rudo Chiŋ", // apostrophe, ampersand, plus, non-ASCII
  amountUsd: 3,
  method: 'mobile',
  months: ['2026-03', '2026-01', '2026-02'],
  paidOn: '2026-03-15',
  keyId: treasurer.keyId,
};
const link = (c: ReceiptClaim, key = treasurer) => verificationLink(BASE, c, signClaim(c, key.privateKeyHex));

beforeAll(async () => {
  const g = globalThis as any;
  g.document = {
    getElementById: (id: string) => {
      if (!byId.has(id)) byId.set(id, el('div', id));
      return byId.get(id);
    },
    createElement: (tag: string) => el(tag),
  };
  g.location = { hash: '' };
  g.window = { addEventListener: (ev: string, fn: () => void) => listeners.set(ev, fn) };
  g.fetch = async () => ({ json: async () => keysJson });
  await import('../../verify/verify.js');
});
afterAll(() => {
  for (const k of ['document', 'location', 'window', 'fetch']) delete (globalThis as any)[k];
});

describe('verification page against app-signed receipts', () => {
  it('shows GENUINE for an untouched receipt from a registered phone, with the details decoded', async () => {
    keysJson = { keys: [{ keyId: treasurer.keyId, publicKey: treasurer.publicKeyHex, owner: 'Tatenda', revokedAt: null }] };
    expect(await checkLink(link(claim))).toMatchObject({ kind: 'ok', title: expect.stringContaining('GENUINE') });
    expect(field('Received from')).toBe(`${claim.name} (Y0007)`);
    expect(field('Amount')).toBe('$3.00');
    expect(field('For')).toBe('Jan 2026, Feb 2026, Mar 2026 (3 months)');
    expect(field('Issued by')).toBe(`Tatenda (key ${treasurer.keyId})`);
  });

  it('shows NOT GENUINE when any signed field in the link is changed', async () => {
    keysJson = { keys: [{ keyId: treasurer.keyId, publicKey: treasurer.publicKeyHex, owner: 'Tatenda', revokedAt: null }] };
    const good = link(claim);
    for (const [from, to] of [
      ['a=3', 'a=30'],
      ['d=2026-03-15', 'd=2026-03-16'],
      ['p=mobile', 'p=cash'],
      ['m=Y0007', 'm=Y0008'],
      ['r=T-2026-00042', 'r=T-2026-00043'],
      ['n=Nyasha', 'n=Nyasho'],
      ['mo=2026-01', 'mo=2025-12'],
    ]) {
      expect(good).toContain(from);
      const v = await checkLink(good.replace(from, to));
      expect(v, `${from} -> ${to}`).toMatchObject({ kind: 'bad', sub: expect.stringContaining('altered or forged') });
    }
  });

  it('shows NOT GENUINE for a receipt signed by a phone that is not registered', async () => {
    keysJson = { keys: [{ keyId: treasurer.keyId, publicKey: treasurer.publicKeyHex, owner: 'Tatenda', revokedAt: null }] };
    const forged = { ...claim, keyId: stranger.keyId };
    expect(await checkLink(link(forged, stranger))).toMatchObject({ kind: 'bad', sub: expect.stringContaining('not signed by a registered') });
  });

  it('honours revocation: receipts dated on/after the loss fail, earlier ones still verify', async () => {
    keysJson = { keys: [{ keyId: treasurer.keyId, publicKey: treasurer.publicKeyHex, owner: 'Tatenda', revokedAt: '2026-03-15T00:00:00Z' }] };
    expect(await checkLink(link(claim))).toMatchObject({ kind: 'bad', sub: expect.stringContaining('reported lost') });
    expect(await checkLink(link({ ...claim, paidOn: '2026-03-14' }))).toMatchObject({ kind: 'ok' });
  });

  it('asks the reader to retry, not "forged", when keys.json cannot be loaded', async () => {
    const g = globalThis as any;
    const real = g.fetch;
    g.fetch = async () => {
      throw new Error('offline');
    };
    try {
      expect(await checkLink(link(claim))).toMatchObject({ kind: 'wait', title: 'Could not check right now' });
    } finally {
      g.fetch = real;
    }
  });
});
