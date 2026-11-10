/**
 * The verification page address is printed into every receipt's QR code. It must default to the
 * live Firebase site, and changing it must never touch the signing key that keys.json registers.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VERIFY_URL } from '../src/core/config';
import type { ReceiptClaim } from '../src/core/signing';
import { qrSvg } from '../src/core/templates/qr';
import { verificationLink } from '../src/core/templates/receiptHtml';
import { effectiveVerifyUrl, parseVerifyUrl, VERIFY_URL_MAX } from '../src/core/verifyUrl';
import { Repo, RepoError, VERIFY_URL_KEY } from '../src/db/repo';
import { nodeDb } from './nodeDb';

const SIG = 'ab'.repeat(64);
const TYPICAL: ReceiptClaim = { receiptNo: 'T-2026-00001', memberNo: 'Y0001', name: 'Tendai Moyo', amountUsd: 1, method: 'cash', months: ['2026-11'], paidOn: '2026-11-09', keyId: 'T-3bcb4c0b' };
/** The largest receipt the app makes: a long name, a whole year paid by mobile money. */
const LARGEST: ReceiptClaim = {
  ...TYPICAL,
  receiptNo: 'T-2026-99999',
  memberNo: 'Y9999',
  name: 'X'.repeat(60),
  amountUsd: 120,
  method: 'mobile',
  months: Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}` as ReceiptClaim['months'][number]),
  paidOn: '2026-12-31',
};
/**
 * QR version 17. With the church's address the largest receipt needs 77 modules; the longest allowed
 * address adds two versions. Past this, the 136px code on an A6 receipt gets hard for phones to read.
 */
const QR_MAX_MODULES = 85;
const qrModules = (link: string) => Number(/viewBox="0 0 (\d+)/.exec(qrSvg(link, 136))?.[1]) - 8; // minus the 4-module quiet zone each side

describe('DEFAULT_VERIFY_URL', () => {
  it('is the Firebase Hosting address of the project in .firebaserc', () => {
    const rc = JSON.parse(readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8'));
    expect(DEFAULT_VERIFY_URL).toBe(`https://${rc.projects.default}.web.app/`);
  });

  it('is stored as "use the default" (blank), so phones follow it if it ever moves', () => {
    expect(parseVerifyUrl(DEFAULT_VERIFY_URL)).toBe('');
    expect(parseVerifyUrl('HTTPS://ElShaddai-Youth.web.app')).toBe('');
    expect(parseVerifyUrl('https://elshaddai-youth.web.app:443/')).toBe('');
  });

  it('makes QR links that open the live page with the receipt in the fragment', () => {
    const link = new URL(verificationLink(DEFAULT_VERIFY_URL, TYPICAL, SIG));
    expect(link.origin + link.pathname).toBe(DEFAULT_VERIFY_URL);
    expect(link.search).toBe('');
    expect(link.hash.length).toBeGreaterThan(20);
  });
});

describe('parseVerifyUrl', () => {
  it.each([
    ['', ''],
    ['   ', ''],
    ['  https://elshaddai-youth.web.app  ', ''],
    ['https://receipts.example.org', 'https://receipts.example.org/'],
    ['Https://Receipts.Example.org/Verify/', 'https://receipts.example.org/Verify/'], // host lower-cased, path kept
    ['https://receipts.example.org/verify/', 'https://receipts.example.org/verify/'],
    ['https://receipts.example.org:8443/', 'https://receipts.example.org:8443/'],
    ['https://xn--e1afmkfd.xn--p1ai/', 'https://xn--e1afmkfd.xn--p1ai/'], // an international domain, in the form the QR encoder can carry
  ])('accepts %j as %j', (input, out) => {
    expect(parseVerifyUrl(input)).toBe(out);
  });

  it.each([
    'http://elshaddai-youth.web.app/', // not https: a plain-http page can be rewritten in transit
    'elshaddai-youth.web.app',
    'https://',
    'https://localhost/',
    'https://192.168.1.10/',
    'https://.../',
    'https://a..b/',
    'https://-bad.example.org/',
    'https://elshaddai youth.web.app/',
    'https://elshaddai-youth.web.app/#old-fragment', // the fragment is where the receipt goes
    'https://elshaddai-youth.web.app@evil.com/', // reads as the church page, goes to evil.com
    'https://elshaddai-youth.web.app/@evil.com',
    'https://a.bc\\evil.com/',
    'https://a.bc/"<script>/',
    'https://a.bc:99999/',
    'https://a.bc:0/',
    'https://пример.рф/', // the QR encoder turns non-ASCII into "?"
    'https://café.example/',
    'https://elshaddai-youth.web.app/​', // invisible zero-width space
    `https://receipts.example.org/${'a'.repeat(80)}`, // too long: the QR code would grow past scannable
  ])('rejects %j', (input) => {
    expect(parseVerifyUrl(input)).toBeNull();
  });

  it('keeps the longest accepted address small enough for a scannable receipt QR code', () => {
    const longest = `https://receipts.example.org/${'a'.repeat(VERIFY_URL_MAX - 'https://receipts.example.org/'.length)}`;
    expect(parseVerifyUrl(longest)).toBe(longest);
    expect(qrModules(verificationLink(longest, LARGEST, SIG))).toBeLessThanOrEqual(QR_MAX_MODULES);
    expect(qrModules(verificationLink(DEFAULT_VERIFY_URL, LARGEST, SIG))).toBeLessThan(QR_MAX_MODULES);
  });
});

describe('effectiveVerifyUrl', () => {
  it('falls back to the church page when nothing is stored, including phones set up with a blank address', () => {
    expect(effectiveVerifyUrl(null)).toBe(DEFAULT_VERIFY_URL);
    expect(effectiveVerifyUrl('')).toBe(DEFAULT_VERIFY_URL);
    expect(effectiveVerifyUrl('  ')).toBe(DEFAULT_VERIFY_URL);
  });

  it('keeps an address the phone was given', () => {
    expect(effectiveVerifyUrl('https://receipts.example.org/')).toBe('https://receipts.example.org/');
  });
});

describe('Repo.changeVerifyUrl', () => {
  let repo: Repo;
  beforeEach(async () => {
    repo = new Repo({ db: nodeDb(), uuid: randomUUID, now: () => new Date('2026-11-09T10:00:00') });
    await repo.init();
    await repo.setSetting('key_id', 'T-3bcb4c0b');
    await repo.setSetting('public_key', 'aa'.repeat(32));
    await repo.setSetting(VERIFY_URL_KEY, ''); // what the pilot phone stored by leaving the field blank
  });

  it('stores the new address, audits the change, and leaves the signing key alone', async () => {
    expect(await repo.changeVerifyUrl(' https://receipts.example.org/ ', 'Matt Hardy')).toBe('https://receipts.example.org/');
    expect(await repo.getSetting(VERIFY_URL_KEY)).toBe('https://receipts.example.org/');
    expect(await repo.getSetting('key_id')).toBe('T-3bcb4c0b');
    expect(await repo.getSetting('public_key')).toBe('aa'.repeat(32));
    const [entry] = await repo.auditLog(1);
    expect(entry).toMatchObject({ actor: 'Matt Hardy', action: 'settings.verify_url' });
    expect(JSON.parse(String((entry as { detail: string }).detail))).toEqual({ from: DEFAULT_VERIFY_URL, to: 'https://receipts.example.org/' });
  });

  it('treats blank as the church page and logs nothing when the address in use does not change', async () => {
    const before = (await repo.auditLog(10)).length;
    expect(await repo.changeVerifyUrl('', 'Matt Hardy')).toBe(DEFAULT_VERIFY_URL);
    expect(await repo.changeVerifyUrl(DEFAULT_VERIFY_URL, 'Matt Hardy')).toBe(DEFAULT_VERIFY_URL);
    expect(await repo.changeVerifyUrl('HTTPS://elshaddai-youth.web.app', 'Matt Hardy')).toBe(DEFAULT_VERIFY_URL);
    expect((await repo.auditLog(10)).length).toBe(before);
    expect(await repo.getSetting(VERIFY_URL_KEY)).toBe('');
  });

  it('going back to the church page stores blank, so the phone follows the default if it moves', async () => {
    await repo.changeVerifyUrl('https://receipts.example.org/', 'Matt Hardy');
    expect(await repo.changeVerifyUrl('https://elshaddai-youth.web.app', 'Matt Hardy')).toBe(DEFAULT_VERIFY_URL);
    expect(await repo.getSetting(VERIFY_URL_KEY)).toBe('');
  });

  it('refuses a bad address and stores nothing', async () => {
    await expect(repo.changeVerifyUrl('http://elshaddai-youth.web.app/', 'Matt Hardy')).rejects.toBeInstanceOf(RepoError);
    expect(await repo.getSetting(VERIFY_URL_KEY)).toBe('');
  });
});
