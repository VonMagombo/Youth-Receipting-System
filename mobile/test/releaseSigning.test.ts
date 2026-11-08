import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { applyReleaseSigning } = require('../plugins/withReleaseSigning.js') as { applyReleaseSigning: (g: string) => string };

// app/build.gradle exactly as `expo prebuild` generates it for this SDK. If an Expo upgrade changes
// the template, regenerate it (`npx expo prebuild -p android --no-install`, copy android/app/build.gradle).
const template = readFileSync(new URL('./fixtures/app.build.gradle', import.meta.url), 'utf8');

const buildType = (gradle: string, name: string) => {
  const types = gradle.slice(gradle.indexOf('buildTypes {'));
  const start = types.indexOf(`${name} {`);
  return types.slice(start, types.indexOf('\n        }', start));
};

describe('withReleaseSigning', () => {
  it('starts from the template signing release builds with the public debug key', () => {
    expect(buildType(template, 'release')).toContain('signingConfig signingConfigs.debug');
  });

  it('adds a release signing config read from environment variables', () => {
    const out = applyReleaseSigning(template);
    expect(out).toMatch(/signingConfigs \{\s*debug \{[^}]*\}\s*\/\/ youth-subs: release signing\s*release \{/);
    expect(out).toContain("storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))");
    expect(out).toContain("storeType 'pkcs12'");
    expect(out).not.toMatch(/storePassword '(?!android')/); // no literal secrets
  });

  it('makes release builds use the release key when one is provided', () => {
    const out = applyReleaseSigning(template);
    expect(buildType(out, 'release')).toContain(
      "signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
    expect(buildType(out, 'debug')).toContain('signingConfig signingConfigs.debug');
  });

  it('is idempotent when prebuild runs twice', () => {
    const once = applyReleaseSigning(template);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it('fails loudly if a future Expo template no longer matches, instead of silently shipping debug-signed APKs', () => {
    expect(() => applyReleaseSigning('android { }')).toThrow(/signingConfigs.debug block not found/);
    const noReleaseType = template.replace(/release \{[\s\S]*?signingConfig signingConfigs\.debug/, 'release {');
    expect(() => applyReleaseSigning(noReleaseType)).toThrow(/release buildType signingConfig not found/);
  });
});
