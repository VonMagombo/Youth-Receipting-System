# Release signing key: one-time setup

Android only installs an update over an existing app if both are signed with the **same key**. The
APK used to be signed with the Expo template's debug key, which is public. Release builds now use the
department's own key, stored as GitHub secrets. The **Android APK** workflow refuses to build without
it and checks that every APK it produces carries that key.

## 1. Create the key (once, ever)

On any Linux/macOS machine with `openssl` and the `gh` CLI logged in as **VonMagombo**:

```bash
umask 077
mkdir -p ~/.youth-subs-signing && cd ~/.youth-subs-signing
openssl rand -base64 33 | tr -d '/+=\n' | head -c 32 > password.txt
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 10000 \
  -subj "/CN=Youth Subs/O=El-Shaddai Christian Center Assembly/OU=Youth Department/C=ZW" \
  -keyout key.pem -out cert.pem
openssl pkcs12 -export -inkey key.pem -in cert.pem -name youthsubs \
  -out release.p12 -passout file:password.txt
rm key.pem
# Note this fingerprint: it identifies genuine builds. Printed in the same form CI prints it.
openssl x509 -in cert.pem -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f'
```

Any `openssl` works here, including the one built into macOS: CI reads the key with Java's `keytool`, which
accepts both old and new keystore formats.

If you only have Java, this makes the same files (run it in the same folder, after the `password.txt` line
above):

```bash
keytool -genkeypair -storetype pkcs12 -keystore release.p12 -alias youthsubs \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Youth Subs, O=El-Shaddai Christian Center Assembly, OU=Youth Department, C=ZW" \
  -storepass:file password.txt -keypass:file password.txt
keytool -list -v -storetype pkcs12 -keystore release.p12 -storepass:file password.txt \
  | awk '$1 == "SHA256:" {print $2}' | tr -d ':' | tr 'A-F' 'a-f'
```

## 2. Give it to GitHub

```bash
export GH_TOKEN=$(gh auth token --user VonMagombo)
R=VonMagombo/Youth-Receipting-System
base64 -w0 release.p12 | gh secret set ANDROID_KEYSTORE_BASE64 --repo $R   # macOS: base64 -i release.p12
gh secret set ANDROID_KEYSTORE_PASSWORD --repo $R < password.txt
printf youthsubs | gh secret set ANDROID_KEY_ALIAS --repo $R
gh secret list --repo $R
```

Re-run the **Android APK** workflow. The step "Check the APK is signed with the release key" prints the
certificate SHA-256 of the APK and of the key. Both must equal the fingerprint you noted in step 1.

## 3. Back it up

Put `release.p12` and `password.txt` in a password manager or a private church Google Drive folder, and
give a second church administrator access. **If this key is lost, the installed app can never be
updated again** without uninstalling it, and uninstalling deletes the app's data.

## Switching a phone that already runs a debug-signed build

The first release-signed APK will not install over a build from before this change (Android reports
"App not installed" or "package conflicts"). If that phone holds real receipts, do **not** uninstall
yet: see "Restoring a phone" in `mobile/README.md` first, because an Excel backup is a record that
cannot yet be imported back. If the phone only has test data, uninstall and
install the new APK.
