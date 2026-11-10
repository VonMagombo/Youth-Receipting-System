import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createDeviceKey, signClaim } from '../core/signing';
import { effectiveVerifyUrl, parseVerifyUrl, VERIFY_URL_ERROR } from '../core/verifyUrl';
import { type Repo, RepoError, type Signer, VERIFY_URL_KEY } from '../db/repo';

const PRIVATE_KEY = 'device_signing_key_v1';

export interface DeviceSettings {
  prefix: string;
  collectorName: string;
  keyId: string;
  publicKeyHex: string;
  verifyBaseUrl: string;
}

export async function loadDevice(repo: Repo): Promise<DeviceSettings | null> {
  const [prefix, collectorName, keyId, publicKeyHex, verifyBaseUrl] = await Promise.all(
    ['device_prefix', 'collector_name', 'key_id', 'public_key', VERIFY_URL_KEY].map((k) => repo.getSetting(k)),
  );
  if (!prefix || !collectorName || !keyId || !publicKeyHex) return null;
  // The private key lives in Android Keystore-backed secure storage, never in the database
  // or in exports. If it is missing (app data partly restored), setup must run again.
  if (!(await SecureStore.getItemAsync(PRIVATE_KEY))) return null;
  return { prefix, collectorName, keyId, publicKeyHex, verifyBaseUrl: effectiveVerifyUrl(verifyBaseUrl) };
}

/**
 * First-run setup, or a new key from Settings. `verifyBaseUrl` is given only on first run; re-keying
 * keeps the address, which is changed on its own (and audited) from Settings.
 */
export async function setupDevice(repo: Repo, input: { prefix: string; collectorName: string; verifyBaseUrl?: string }): Promise<DeviceSettings> {
  // Check the address before making a key, so a bad address leaves the phone as it was.
  if (input.verifyBaseUrl !== undefined && parseVerifyUrl(input.verifyBaseUrl) === null) throw new RepoError(VERIFY_URL_ERROR);
  const collectorName = input.collectorName.trim();
  const existingKeyId = await repo.getSetting('key_id');
  const key = createDeviceKey(input.prefix, () => Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(PRIVATE_KEY, key.privateKeyHex, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await repo.setSetting('device_prefix', input.prefix);
  await repo.setSetting('collector_name', collectorName);
  await repo.setSetting('key_id', key.keyId);
  await repo.setSetting('public_key', key.publicKeyHex);
  const verifyBaseUrl =
    input.verifyBaseUrl === undefined ? effectiveVerifyUrl(await repo.getSetting(VERIFY_URL_KEY)) : await repo.changeVerifyUrl(input.verifyBaseUrl, collectorName);
  if (existingKeyId) await repo.setSetting(`retired_key:${existingKeyId}`, new Date().toISOString());
  return { prefix: input.prefix, collectorName, keyId: key.keyId, publicKeyHex: key.publicKeyHex, verifyBaseUrl };
}

export async function makeSigner(d: DeviceSettings): Promise<Signer> {
  const priv = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!priv) throw new Error('Signing key missing. Run device setup again from Settings.');
  return { prefix: d.prefix, keyId: d.keyId, collectorName: d.collectorName, sign: (c) => signClaim(c, priv) };
}

export const newId = () => Crypto.randomUUID();
