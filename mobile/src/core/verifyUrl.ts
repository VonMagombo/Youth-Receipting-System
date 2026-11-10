import { DEFAULT_VERIFY_URL } from './config';

export const VERIFY_URL_ERROR = 'Enter an https:// address with a domain, e.g. https://elshaddai-youth.web.app/';

/** Long enough for any real address; short enough that the receipt QR code stays small and scannable. */
export const VERIFY_URL_MAX = 100;

// Host: dot-separated labels ending in a letter-led TLD (no IP literals, no empty labels).
// Path: printable ASCII except the characters that would change where the link goes or break the page.
const PATTERN = /^https:\/\/((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9])(?::(\d{1,5}))?(\/[^#@\\"<>`\s]*)?$/i;

/**
 * Check an address typed for the verification page. Returns:
 * - '' for a blank field or the church's own page (stored as "use the default", so the phone follows
 *   DEFAULT_VERIFY_URL if it ever moves);
 * - the normalised address (lower-case scheme and host, '/' when there is no path) otherwise;
 * - null when it is not an acceptable https address.
 *
 * Only printable ASCII is accepted: the QR encoder mangles other characters, so an international
 * domain must be entered in its xn-- form.
 */
export function parseVerifyUrl(input: string): string | null {
  const url = input.trim();
  if (!url) return '';
  if (url.length > VERIFY_URL_MAX || !/^[\x21-\x7e]+$/.test(url)) return null;
  const m = PATTERN.exec(url);
  if (!m) return null;
  const [, host, port, path] = m;
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return null;
  const out = `https://${host.toLowerCase()}${port === undefined || port === '443' ? '' : `:${Number(port)}`}${path || '/'}`;
  return out === DEFAULT_VERIFY_URL ? '' : out;
}

/** The address receipts should point to: the phone's own setting, or the church's page if unset. */
export function effectiveVerifyUrl(stored: string | null): string {
  return stored?.trim() || DEFAULT_VERIFY_URL;
}
