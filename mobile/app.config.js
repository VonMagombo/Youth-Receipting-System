// Expo reads app.json first and passes it in as `config`; this file only adjusts it.
// APP_VARIANT=development builds the dev client under its own application ID, so it installs next to
// the real app instead of colliding with it. The real app is release-signed (docs/RELEASE_SIGNING.md):
// a debug build with the same ID cannot update it, and the uninstall Android then asks for deletes the
// phone's receipts and its signing key. Without APP_VARIANT (CI, release builds) app.json is used as is.
const DEV_SUFFIX = '.dev';

/** Pure transform, exported for tests. */
function applyVariant(config, variant) {
  if (!variant) return config;
  if (variant !== 'development') throw new Error(`app.config.js: unknown APP_VARIANT "${variant}" (expected "development")`);
  return {
    ...config,
    name: `${config.name} (Dev)`,
    ios: { ...config.ios, bundleIdentifier: config.ios.bundleIdentifier + DEV_SUFFIX },
    android: { ...config.android, package: config.android.package + DEV_SUFFIX },
  };
}

module.exports = ({ config }) => applyVariant(config, process.env.APP_VARIANT);
module.exports.applyVariant = applyVariant;
