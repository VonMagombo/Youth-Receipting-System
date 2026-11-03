import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import type { ISODate, Month } from './months';

// noble-ed25519 needs a synchronous SHA-512; React Native has no WebCrypto.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type PayMethod = 'cash' | 'mobile';

/** The facts a receipt asserts. Everything here is covered by the signature. */
export interface ReceiptClaim {
  receiptNo: string;
  memberNo: string;
  name: string;
  amountUsd: number;
  method: PayMethod;
  months: Month[];
  paidOn: ISODate;
  keyId: string;
}

const DOMAIN = 'AFMY-RECEIPT-1';

/**
 * Canonical byte string that gets signed. A JSON array is unambiguous: a name containing
 * a separator character cannot shift fields the way a delimiter-joined string could.
 */
export function canonicalBytes(c: ReceiptClaim): Uint8Array {
  return utf8ToBytes(
    JSON.stringify([DOMAIN, c.receiptNo, c.memberNo, c.name, c.amountUsd, c.method, [...c.months].sort(), c.paidOn, c.keyId]),
  );
}

export interface DeviceKey {
  keyId: string;
  publicKeyHex: string;
  privateKeyHex: string;
}

/** `random32` must be a CSPRNG (expo-crypto on device, node:crypto in tests). */
export function createDeviceKey(prefix: string, random32: () => Uint8Array): DeviceKey {
  const priv = random32();
  if (priv.length !== 32) throw new Error('Private key must be 32 bytes');
  const pub = ed.getPublicKey(priv);
  return { keyId: keyIdFor(prefix, pub), publicKeyHex: bytesToHex(pub), privateKeyHex: bytesToHex(priv) };
}

export function keyIdFor(prefix: string, publicKey: Uint8Array): string {
  return `${prefix}-${bytesToHex(sha256(publicKey)).slice(0, 8)}`;
}

export function signClaim(c: ReceiptClaim, privateKeyHex: string): string {
  return toB64Url(ed.sign(canonicalBytes(c), hexToBytes(privateKeyHex)));
}

export function verifyClaim(c: ReceiptClaim, signatureB64Url: string, publicKeyHex: string): boolean {
  try {
    return ed.verify(fromB64Url(signatureB64Url), canonicalBytes(c), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

/** URL fragment (never sent to the server) carrying the claim + signature, for the QR code. */
export function claimToFragment(c: ReceiptClaim, sig: string): string {
  // Built by hand (not URLSearchParams) so output is identical on React Native and in tests.
  const fields: [string, string][] = [
    ['r', c.receiptNo],
    ['m', c.memberNo],
    ['n', c.name],
    ['a', String(c.amountUsd)],
    ['p', c.method],
    ['mo', [...c.months].sort().join(',')],
    ['d', c.paidOn],
    ['k', c.keyId],
    ['s', sig],
  ];
  return fields.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

export function fragmentToClaim(fragment: string): { claim: ReceiptClaim; sig: string } | null {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  const get = (k: string) => p.get(k);
  const fields = ['r', 'm', 'n', 'a', 'p', 'mo', 'd', 'k', 's'];
  if (fields.some((f) => get(f) === null)) return null;
  const method = get('p');
  if (method !== 'cash' && method !== 'mobile') return null;
  return {
    claim: {
      receiptNo: get('r')!,
      memberNo: get('m')!,
      name: get('n')!,
      amountUsd: Number(get('a')),
      method,
      months: get('mo')!.split(',').filter(Boolean),
      paidOn: get('d')!,
      keyId: get('k')!,
    },
    sig: get('s')!,
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toB64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

export function fromB64Url(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Invalid base64url');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
