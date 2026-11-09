/**
 * docs/RELEASE_SIGNING.md is followed by hand, once, by a church admin. Its certificate subject must be
 * something openssl and keytool accept: X.509 caps O, OU and CN at 64 characters, and a longer value
 * makes `openssl req` fail with "string too long" before any key is made.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const doc = readFileSync(new URL('../../docs/RELEASE_SIGNING.md', import.meta.url), 'utf8');
const MAX = 64; // ub-organization-name / ub-organizational-unit-name / ub-common-name

/** Every name=value field in the doc's `-subj "/A=x/B=y"` (openssl) and `-dname "A=x, B=y"` (keytool). */
function subjectFields(): { tool: string; field: string; value: string }[] {
  const out: { tool: string; field: string; value: string }[] = [];
  for (const [, s] of doc.matchAll(/-subj "([^"]+)"/g))
    for (const part of s.split('/').filter(Boolean)) out.push({ tool: 'openssl', field: part.split('=')[0], value: part.slice(part.indexOf('=') + 1) });
  for (const [, s] of doc.matchAll(/-dname "([^"]+)"/g))
    for (const part of s.split(/,\s*/)) out.push({ tool: 'keytool', field: part.split('=')[0], value: part.slice(part.indexOf('=') + 1) });
  return out;
}

describe('release signing doc', () => {
  it('has a certificate subject for both openssl and keytool', () => {
    const tools = new Set(subjectFields().map((f) => f.tool));
    expect([...tools].sort()).toEqual(['keytool', 'openssl']);
  });

  it('keeps every subject field within the 64-character X.509 limit', () => {
    for (const f of subjectFields()) expect(f.value.length, `${f.tool} ${f.field}=${f.value}`).toBeLessThanOrEqual(MAX);
  });

  it('names the assembly and the Youth Department, the same in both commands', () => {
    const fields = subjectFields();
    for (const tool of ['openssl', 'keytool']) {
      const get = (k: string) => fields.find((f) => f.tool === tool && f.field === k)?.value;
      expect([get('O'), get('OU'), get('C')]).toEqual(['El-Shaddai Christian Center Assembly', 'Youth Department', 'ZW']);
    }
  });
});
