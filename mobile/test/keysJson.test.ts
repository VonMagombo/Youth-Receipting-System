/**
 * verify/keys.json is edited by hand (docs/VERIFY_SETUP.md) and decides which phones' receipts show
 * GENUINE. A typo there silently breaks verification for a whole phone, so check every entry the way
 * the app and the verify page will read it.
 */
import { readFileSync } from 'node:fs';
import { hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { keyIdFor } from '../src/core/signing';

interface KeyEntry {
  keyId: string;
  publicKey: string;
  owner: string;
  revokedAt: string | null;
}

const { keys } = JSON.parse(readFileSync(new URL('../../verify/keys.json', import.meta.url), 'utf8')) as { keys: KeyEntry[] };

describe('verify/keys.json', () => {
  it('has the exact shape the verify page reads', () => {
    for (const k of keys) expect(Object.keys(k).sort()).toEqual(['keyId', 'owner', 'publicKey', 'revokedAt']);
  });

  it.each(keys.map((k) => [k.keyId, k] as const))('%s: public key is 32 bytes of lowercase hex', (_, k) => {
    expect(k.publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(keys.map((k) => [k.keyId, k] as const))('%s: key ID is the one the app derives from the public key', (_, k) => {
    const prefix = k.keyId.split('-')[0];
    expect(keyIdFor(prefix, hexToBytes(k.publicKey))).toBe(k.keyId);
  });

  it.each(keys.map((k) => [k.keyId, k] as const))('%s: has an owner and a valid revokedAt', (_, k) => {
    expect(k.owner.trim().length).toBeGreaterThan(1);
    if (k.revokedAt !== null) expect(Number.isNaN(Date.parse(k.revokedAt))).toBe(false);
  });

  it('lists each key only once', () => {
    expect(new Set(keys.map((k) => k.keyId)).size).toBe(keys.length);
    expect(new Set(keys.map((k) => k.publicKey)).size).toBe(keys.length);
  });
});
