# Youth Subs — Android app

Records youth subscription payments, issues signed PDF receipts over WhatsApp, and produces
weekly/monthly reports. Works fully offline. Built with Expo SDK 58 (React Native 0.88).

## Install on a phone

1. On GitHub open **Actions → Android APK**, pick the latest green run, and download the
   `youth-subs-apk` artifact (a zip containing `youth-subs-<commit>.apk`).
2. Send the APK to the Treasurer's / Secretary's phone (WhatsApp, Drive or USB), open it, and allow
   "Install unknown apps" when Android asks.
3. On first start choose **Treasurer** or **Secretary**, enter the name to print on receipts, and
   (once it is deployed) the verification page address. See `../docs/VERIFY_SETUP.md`.
4. **Settings → Public key**: copy the line shown into `verify/keys.json` so the verification page
   recognises this phone's receipts.

Updates install over the previous version and keep the data, as long as they come from this
workflow (same signing key).

## Day-to-day

| Task | Where |
|---|---|
| Load the member list | Excel → Get template → fill in → Choose file → check preview → Import |
| Take a payment | Record a payment → member → amount → cash/mobile → Issue receipt → Send PDF |
| Fix a mistake | Open the receipt → Void (with reason) → issue a new one |
| Hardship | Member → Exempt a month (reason + who approved) |
| Weekly / monthly report | Reports → Weekly/Monthly → Youth group (totals) or Leadership (names) → Share PDF |
| Backup | Excel → Export to Excel (do this weekly until sync exists) |

## Development

```bash
npm ci
npm test            # 28 unit tests: ledger, signing, import, reports, SQLite repo + triggers
npm run typecheck   # app + tests
npx expo start      # needs a development build, since the app uses native modules
```

`RENDER_OUT=/tmp/samples npx vitest run test/render-samples.test.ts` writes sample receipt and
report HTML for visual review.

### Layout

```
src/core/        pure TypeScript, unit-tested: months, ledger (allocation/standing), signing,
                 importer (Excel → plan), reports, HTML templates for receipt/report PDFs
src/db/          SQLite schema (append-only triggers) and repository
src/platform/    expo-sqlite adapter, device key (SecureStore), PDF/Excel/share helpers
src/screens/     UI screens;  src/ui/  kit, tiny stack navigator, app context
test/            vitest; node:sqlite adapter runs the real schema and triggers
```

### Known issues

- **SheetJS `xlsx@0.18.5`** has two advisories (prototype pollution and ReDoS when parsing a
  crafted file). Fixed versions are published only on SheetJS's CDN, which the build sandbox could
  not reach. The app only parses files the collector picks, which limits the exposure. Fix on a
  normal network:
  `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz && npm test`
- Release builds are signed with the Expo template's debug keystore. Fine for installing directly
  on two phones; switch to a private keystore (GitHub secret) before wider distribution.
- Remaining `npm audit` findings are in Expo's build tooling (`glob`, `minimatch`), not in the app.
