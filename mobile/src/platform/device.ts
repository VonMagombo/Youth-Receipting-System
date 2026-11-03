import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createDeviceKey, signClaim } from '../core/signing';
import type { Repo, Signer } from '../db/repo';

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
    ['device_prefix', 'collector_name', 'key_id', 'public_key', 'verify_base_url'].map((k) => repo.getSetting(k)),
  );
  if (!prefix || !collectorName || !keyId || !publicKeyHex) return null;
  // The private key lives in Android Keystore-backed secure storage, never in the database
  // or in exports. If it is missing (app data partly restored), setup must run again.
  if (!(await SecureStore.getItemAsync(PRIVATE_KEY))) return null;
  return { prefix, collectorName, keyId, publicKeyHex, verifyBaseUrl: verifyBaseUrl ?? '' };
}

export async function setupDevice(repo: Repo, input: { prefix: string; collectorName: string; verifyBaseUrl: string }): Promise<DeviceSettings> {
  const existingKeyId = await repo.getSetting('key_id');
  const key = createDeviceKey(input.prefix, () => Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(PRIVATE_KEY, key.privateKeyHex, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await repo.setSetting('device_prefix', input.prefix);
  await repo.setSetting('collector_name', input.collectorName.trim());
  await repo.setSetting('key_id', key.keyId);
  await repo.setSetting('public_key', key.publicKeyHex);
  await repo.setSetting('verify_base_url', input.verifyBaseUrl.trim());
  if (existingKeyId) await repo.setSetting(`retired_key:${existingKeyId}`, new Date().toISOString());
  return { prefix: input.prefix, collectorName: input.collectorName.trim(), keyId: key.keyId, publicKeyHex: key.publicKeyHex, verifyBaseUrl: input.verifyBaseUrl.trim() };
}

export async function makeSigner(d: DeviceSettings): Promise<Signer> {
  const priv = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!priv) throw new Error('Signing key missing. Run device setup again from Settings.');
  return { prefix: d.prefix, keyId: d.keyId, collectorName: d.collectorName, sign: (c) => signClaim(c, priv) };
}

export const newId = () => Crypto.randomUUID();
