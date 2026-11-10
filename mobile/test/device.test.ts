/**
 * loadDevice / setupDevice decide the address in every receipt's QR code. The native modules they use
 * (Android Keystore storage, secure random) are replaced with in-memory stand-ins; everything else,
 * including the database, is the real code.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VERIFY_URL } from '../src/core/config';
import { createDeviceKey } from '../src/core/signing';
import { verificationLink } from '../src/core/templates/receiptHtml';
import { Repo, RepoError, VERIFY_URL_KEY } from '../src/db/repo';
import { loadDevice, setupDevice } from '../src/platform/device';
import { nodeDb } from './nodeDb';

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
}));
vi.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)),
  randomUUID: () => randomUUID(),
}));

const PILOT_KEY = 'T-3bcb4c0b';
const claim = { receiptNo: 'T-2026-00001', memberNo: 'Y0001', name: 'Tendai Moyo', amountUsd: 1, method: 'cash', months: ['2026-11'], paidOn: '2026-11-09', keyId: PILOT_KEY } as const;

let repo: Repo;
beforeEach(async () => {
  secure.clear();
  repo = new Repo({ db: nodeDb(), uuid: randomUUID, now: () => new Date('2026-11-10T10:00:00') });
  await repo.init();
});

/** The pilot phone as it is today: set up before this change, address field left blank. */
async function pilotPhone(storedUrl: string | null) {
  const key = createDeviceKey('T', () => new Uint8Array(randomBytes(32)));
  secure.set('device_signing_key_v1', key.privateKeyHex);
  await repo.setSetting('device_prefix', 'T');
  await repo.setSetting('collector_name', 'Matt Hardy');
  await repo.setSetting('key_id', PILOT_KEY);
  await repo.setSetting('public_key', key.publicKeyHex);
  if (storedUrl !== null) await repo.setSetting(VERIFY_URL_KEY, storedUrl);
}

const verifyAudits = async () => (await repo.auditLog(100)).filter((a) => a.action === 'settings.verify_url');

describe('loadDevice', () => {
  it('points the pilot phone (blank address) at the live page, with its key unchanged', async () => {
    await pilotPhone('');
    const d = (await loadDevice(repo))!;
    expect(d.keyId).toBe(PILOT_KEY);
    expect(d.verifyBaseUrl).toBe(DEFAULT_VERIFY_URL);
    expect(verificationLink(d.verifyBaseUrl, { ...claim, months: ['2026-11'] }, 'ab'.repeat(64))).toMatch(/^https:\/\/elshaddai-youth\.web\.app\/#/);
  });

  it('does the same for a phone that never stored an address', async () => {
    await pilotPhone(null);
    expect((await loadDevice(repo))!.verifyBaseUrl).toBe(DEFAULT_VERIFY_URL);
  });

  it('keeps an address the phone was given', async () => {
    await pilotPhone('https://receipts.example.org/');
    expect((await loadDevice(repo))!.verifyBaseUrl).toBe('https://receipts.example.org/');
  });
});

describe('setupDevice', () => {
  it('first run with the pre-filled address stores "use the default" and logs nothing', async () => {
    const d = await setupDevice(repo, { prefix: 'T', collectorName: ' Matt Hardy ', verifyBaseUrl: DEFAULT_VERIFY_URL });
    expect(d.verifyBaseUrl).toBe(DEFAULT_VERIFY_URL);
    expect(await repo.getSetting(VERIFY_URL_KEY)).toBeNull(); // nothing pinned: the phone follows DEFAULT_VERIFY_URL
    expect(await verifyAudits()).toEqual([]);
    expect((await loadDevice(repo))!).toEqual(d);
  });

  it('first run with another address stores it and logs who set it', async () => {
    const d = await setupDevice(repo, { prefix: 'T', collectorName: 'Matt Hardy', verifyBaseUrl: 'https://receipts.example.org' });
    expect(d.verifyBaseUrl).toBe('https://receipts.example.org/');
    const [a] = await verifyAudits();
    expect(a.actor).toBe('Matt Hardy');
    expect(JSON.parse(a.detail)).toEqual({ from: DEFAULT_VERIFY_URL, to: 'https://receipts.example.org/' });
  });

  it('refuses a bad address before making a key, so the phone is left as it was', async () => {
    await expect(setupDevice(repo, { prefix: 'T', collectorName: 'Matt Hardy', verifyBaseUrl: 'http://elshaddai-youth.web.app/' })).rejects.toBeInstanceOf(RepoError);
    expect(secure.size).toBe(0);
    expect(await repo.getSetting('key_id')).toBeNull();
    expect(await loadDevice(repo)).toBeNull();
  });

  it('re-keying keeps the address and does not touch the log entry for it', async () => {
    await pilotPhone('https://receipts.example.org/');
    const d = await setupDevice(repo, { prefix: 'T', collectorName: 'Matt Hardy' });
    expect(d.keyId).not.toBe(PILOT_KEY);
    expect(d.verifyBaseUrl).toBe('https://receipts.example.org/');
    expect(await repo.getSetting(VERIFY_URL_KEY)).toBe('https://receipts.example.org/');
    expect(await repo.getSetting(`retired_key:${PILOT_KEY}`)).not.toBeNull();
    expect(await verifyAudits()).toEqual([]);
  });
});
