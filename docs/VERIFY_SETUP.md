# Receipt verification page: setup

The QR code on every receipt opens `verify/index.html` with the receipt details and a digital
signature in the URL fragment (the part after `#`, which browsers never send to the server). The
page checks the signature against the public keys in `verify/keys.json` and shows **GENUINE** or
**NOT GENUINE**. It is a static page: no database or server code, so free hosting is enough.

## 1. Deploy (Firebase Hosting, free)

On a computer with Node.js:

```bash
npm install -g firebase-tools
firebase login                      # use the church/department Google account
firebase projects:create            # or pick an existing project in the console
firebase use --add                  # select the project, alias "default"
firebase deploy --only hosting      # from the repository root (uses firebase.json)
```

The page is then live at `https://<project-id>.web.app/`. Use a project ID that clearly belongs to
the church, e.g. `elshaddai-youth`. **The project ID is the address members will learn to trust.**

## 2. Tell the app the address

The church's page, `https://elshaddai-youth.web.app/`, is built into the app (`DEFAULT_VERIFY_URL`
in `mobile/src/core/config.ts`). Any phone running an APK built from this change or later uses it
unless it has been given another address, so beyond installing that APK there is nothing to do on
the phone. A phone set up earlier with the address left blank picks it up as soon as the new APK is
installed over the old one. Check it under **Settings → Verification page**. A test fails if the
constant and `.firebaserc` disagree.

To point a phone somewhere else: **Settings → Verification page → Change address**. That keeps
the phone's signing key, so its entry in keys.json stays valid, and the change goes in the
activity log. The address must be `https://`, plain ASCII (enter an international domain in its
`xn--` form) and at most 100 characters, so the receipt QR code stays scannable. Clearing the field
goes back to the church's page. *Change collector / create new key* no longer touches the address.

## 3. Register each phone's key

On each phone: **Settings → Public key** → long-press to copy. Add it to `verify/keys.json`:

```json
{
  "keys": [
    { "keyId": "T-3c31e077", "publicKey": "a1b2…64 hex chars…", "owner": "Tatenda Chikomo", "revokedAt": null },
    { "keyId": "S-9f00aa12", "publicKey": "…", "owner": "Secretary name", "revokedAt": null }
  ]
}
```

Commit, then `firebase deploy --only hosting` again.

## Lost or stolen phone

Set that key's `revokedAt` to the date it went missing (e.g. `"2026-12-01T00:00:00Z"`) and deploy.
Receipts dated on or after that day then show NOT GENUINE. Do **not** delete the entry: receipts
issued before the loss must keep verifying. Set up the replacement phone, which creates a new key.

## What the check does and does not prove

- Proves: the details shown were signed by a registered phone and have not been changed.
- A forger can copy a real QR code onto a fake receipt. That is why the page tells the reader to
  compare the details it shows with the paper/PDF in their hand.
- A forger can also make a QR code that points to a look-alike website. Members should only trust
  the official address.
- Voided receipts still show GENUINE until Phase 2 (cloud sync) lets the page look up void status.
