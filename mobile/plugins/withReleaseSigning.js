// Signs release builds with the department's own key instead of the Expo template's public debug key.
// The key comes from environment variables so it never lives in the repo (CI: GitHub secrets).
// Without ANDROID_KEYSTORE_PATH a local release build still falls back to the debug key; the CI
// workflow refuses to build in that case, so a shipped APK is always signed with the real key.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// youth-subs: release signing';

const RELEASE_CONFIG = `
        ${MARKER}
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storeType 'pkcs12'
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            }
        }`;

/** Pure transform of app/build.gradle, exported for tests. Idempotent. */
function applyReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const debugConfig = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
  if (!debugConfig.test(gradle)) throw new Error('withReleaseSigning: signingConfigs.debug block not found in app/build.gradle');
  let out = gradle.replace(debugConfig, `$1${RELEASE_CONFIG}`);

  // [^{}]* keeps the match inside the release block: it cannot run on into a later block.
  const releaseUsesDebug = /(buildTypes\s*\{[\s\S]*?release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/;
  if (!releaseUsesDebug.test(out)) throw new Error('withReleaseSigning: release buildType signingConfig not found in app/build.gradle');
  out = out.replace(releaseUsesDebug, "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug");
  return out;
}

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy') throw new Error('withReleaseSigning: expected a Groovy app/build.gradle');
    c.modResults.contents = applyReleaseSigning(c.modResults.contents);
    return c;
  });

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
