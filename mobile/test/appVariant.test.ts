import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Config = { name: string; ios: { bundleIdentifier: string }; android: { package: string; versionCode: number } };

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js') as ((ctx: { config: Config }) => Config) & {
  applyVariant: (config: Config, variant: string | undefined) => Config;
};
const { applyVariant } = appConfig;
const base = (JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as { expo: Config }).expo;

describe('app.config.js variants', () => {
  it('leaves the real app untouched without APP_VARIANT (CI and release builds)', () => {
    expect(applyVariant(base, undefined)).toBe(base);
    expect(applyVariant(base, '')).toBe(base);
  });

  it('gives the development build its own application ID, so it installs next to the real app', () => {
    const dev = applyVariant(base, 'development');
    expect(dev.android.package).toBe('org.elshaddai.youthreceipts.dev');
    expect(dev.ios.bundleIdentifier).toBe('org.elshaddai.youthreceipts.dev');
    expect(dev.android.package).not.toBe(base.android.package);
  });

  it('labels the development build so the two icons can be told apart', () => {
    expect(applyVariant(base, 'development').name).toBe('Youth Subs (Dev)');
  });

  it('keeps every other setting and does not modify app.json in place', () => {
    const before = JSON.stringify(base);
    const dev = applyVariant(base, 'development');
    expect(dev.android.versionCode).toBe(base.android.versionCode);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('refuses an unknown variant instead of silently building the real app ID', () => {
    expect(() => applyVariant(base, 'staging')).toThrow(/unknown APP_VARIANT "staging"/);
  });

  it('reads APP_VARIANT from the environment', () => {
    const saved = process.env.APP_VARIANT;
    try {
      process.env.APP_VARIANT = 'development';
      expect(appConfig({ config: base }).android.package).toBe('org.elshaddai.youthreceipts.dev');
      delete process.env.APP_VARIANT;
      expect(appConfig({ config: base }).android.package).toBe('org.elshaddai.youthreceipts');
    } finally {
      if (saved === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = saved;
    }
  });
});
