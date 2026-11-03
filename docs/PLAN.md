# Youth Subscription & Receipt System — Build Plan

Status: **Phase 1 built** (see `mobile/README.md`) · Owner: Youth Department

## 1. Problem

Youth members pay a **USD $1 monthly subscription** (cash or mobile money) to the
Treasurer or Secretary. Today each payment is written in a book and a paper receipt
is issued. We want an Android app that records payments, issues tamper-evident PDF
receipts over WhatsApp, and produces weekly and monthly reports, working offline
and syncing when online.

## 2. Requirements (confirmed)

| # | Requirement | Notes |
|---|---|---|
| R1 | 160+ members, growing | Design for ~1,000 without changes |
| R2 | Collectors: Treasurer and Secretary | Two devices, each with its own login |
| R3 | Cash and mobile money (EcoCash etc.) | Store mobile money transaction reference |
| R4 | USD only | Whole dollars; $1 = 1 month |
| R5 | Advance payments | A payment covers N specific months |
| R6 | Excel import | Members (and optional payment history) from .xlsx |
| R7 | PDF receipt shared via WhatsApp | Via Android share sheet |
| R8 | AFM in Zimbabwe logo + QR code for authenticity | Logo file to be supplied by the department |
| R9 | Weekly and monthly reports | PDF, shareable to WhatsApp |
| R10 | Android phone app, offline-first with sync | |
| R11 | Ship fast | Phased delivery below |

## 3. Key design decisions

### 3.1 Payments are append-only
A recorded payment is never edited or deleted. Mistakes are fixed by **voiding**
the receipt (reason + who + when), then issuing a new one. This is what makes
the system more trustworthy than the paper book, and it also makes sync simple:
two devices can never produce conflicting edits to the same payment.

### 3.2 Receipt numbers that cannot collide offline
Both phones may issue receipts while offline, so a single global counter would
collide. Each device gets a prefix:

```
T-2026-00042   (Treasurer's phone)
S-2026-00017   (Secretary's phone)
```

Numbers run in sequence for each device and year. A gap in the sequence is
visible in the reports, the same way a missing page in a receipt book would be.

### 3.3 QR authenticity: a digital signature, not just data
A QR code holding only "Receipt T-2026-00042, $3, John" proves nothing: anyone
with a QR generator can make one. Instead:

- Each device holds an **Ed25519 signing key** created when the device is first set up.
- The QR encodes a verification URL carrying the receipt fields plus a signature.
- A small **verify page** (static web page, free hosting) checks the signature
  against the registered device public keys and shows **GENUINE / NOT GENUINE**.
  When online it also shows whether the receipt was later **voided**.
- Signature checking needs no database, so verification still works if the
  backend is down.

Residual risk: if a collector's phone is stolen and unlocked, its key can sign
fake receipts. Mitigations: app PIN lock, and **revoking a device key** from the
admin screen (receipts signed after the revocation date then show as not genuine).

### 3.4 Month allocation
Each member has a `start_month`. By default a payment of $N covers the **oldest
N unpaid months first** (arrears before advance). The collector can override
this and pick months explicitly. Exempt months (hardship, approved by leadership)
are recorded as $0 entries with a reason, so the member is not counted as owing.

### 3.5 Offline-first storage and sync
- **On the phone:** SQLite is the source of truth. The app works fully with no network.
- **In the cloud:** Firebase (Firestore + Auth), free Spark plan. Chosen over
  Supabase because Supabase free projects pause after a week of inactivity.
- **Sync:** push local rows that haven't been synced, then pull remote rows changed
  since the last sync. Payments and voids are matched by UUID only (append-only, so
  conflicts are impossible). Member profile edits use last-writer-wins on `updated_at`.
- **Backup:** "Export to Excel" at any time, plus the cloud copy.

### 3.6 WhatsApp delivery: limits to know
The app produces the PDF and opens Android's share sheet. The collector taps
WhatsApp and picks the member or group. Android cannot attach a file *and*
pre-select a WhatsApp contact automatically. Fully automatic sending needs the
paid WhatsApp Business API, which is outside the budget.

## 4. Technology

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + TypeScript** | One codebase. The core logic is plain TypeScript we can unit-test without a phone |
| Local DB | expo-sqlite | Offline source of truth |
| PDF | expo-print (HTML → PDF) | Receipt and report templates are plain HTML |
| Share | expo-sharing | Android share sheet → WhatsApp |
| QR | react-native-qrcode-svg | Embedded in the receipt |
| Signing | @noble/ed25519 | Pure JS, audited, no native module |
| Excel | SheetJS (xlsx) + expo-document-picker | Import and export |
| Backend | Firebase Auth + Firestore | Free tier, does not pause |
| Verify page | Static HTML on Firebase Hosting | Free |
| Build | GitHub Actions → APK | Installed directly on the 2 phones (no Play Store needed) |

## 5. Data model

```
members      id, member_no, full_name, phone, gender?, start_month,
             status(active|inactive), created_at, updated_at, synced_at
payments     id(uuid), receipt_no, member_id, amount_usd, method(cash|mobile),
             mobile_ref?, months[] (YYYY-MM), collected_by, device_id,
             created_at, signature, synced_at
voids        id(uuid), payment_id, reason, voided_by, created_at, synced_at
exemptions   id(uuid), member_id, month, reason, approved_by, created_at
devices      id, prefix(T|S|..), public_key, owner, active, revoked_at
users        id, name, role(admin|collector)
```

## 6. Excel import format

Sheet **Members** (required):

| member_no | full_name | phone | start_month | status |
|---|---|---|---|---|
| Y001 | Tendai Moyo | 0771234567 | 2026-01 | active |

Sheet **Payments** (optional, for history from the paper book):

| member_no | date | amount_usd | method | mobile_ref | months |
|---|---|---|---|---|---|
| Y001 | 2026-03-02 | 3 | cash | | 2026-01,2026-02,2026-03 |

Import shows a **dry-run preview** first (new / updated / rejected rows with reasons)
before writing anything. Imported historical payments get receipt prefix `H-`
and are marked "imported" (they carry no device signature).

## 7. Reports

- **Weekly (Mon–Sun):** receipts issued, total collected, cash vs mobile money split,
  breakdown by collector, voided receipts, gaps in receipt sequences.
- **Monthly:** paid / unpaid list for the month, collection rate, advance payments
  received, members in arrears with amount owed, totals for the year so far.
- Output: PDF, shared to WhatsApp.

## 8. Delivery phases

| Phase | Scope | Outcome |
|---|---|---|
| **1 — Paper replacement** | Members, Excel import, record payment, signed PDF receipt + QR, WhatsApp share, weekly/monthly reports, Excel export. Single device, offline | Department stops using the book |
| **2 — Sync** | Firebase login, two devices, sync, verify page, voided-status lookup | Treasurer and Secretary share one ledger |
| **3 — Hardening** | PIN lock, device revocation, admin screen, audit log viewer | Safe to rely on long-term |

## 9. Decisions

1. **Report visibility:** group reports show totals only; named arrears lists go to leadership.
2. **Logo:** Elshaddai Assembly logo supplied by the department (`mobile/assets/logo-original.jpg`).
3. **Firebase:** the requester's own Firebase account (see risk note below).
4. **Default allocation:** oldest unpaid month first (collector can override).
5. **Member numbers:** assigned by the app (`Y0001`…).

## 10. Phase 1 deviations from the plan

- Navigation uses a small in-app stack instead of a navigation library (fewer native deps).
- The verification page was pulled forward from Phase 2 because the QR code needs it. It checks
  signatures against a static `keys.json`; voided-status lookup still needs Phase 2.
- Excel import also accepts an optional **Payments** sheet for history from the paper book
  (receipt series `H-`, unsigned, marked "from paper book").

## 11. Open items for Phase 2

- **Member numbers across two phones.** Numbers come from a counter on each phone, so two phones
  adding members offline could both issue `Y0042`. Before enabling the second phone, either let
  only one phone add members, or prefix member numbers by device.
- **Firebase ownership.** The project will sit on a personal account. Add a second church
  administrator as Owner in the Firebase console so access doesn't depend on one person.
- Replace SheetJS 0.18.5 with 0.20.3 (see `mobile/README.md`).
