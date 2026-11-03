/**
 * Writes sample receipt/report HTML for visual review. Skipped unless RENDER_OUT is set:
 *   RENDER_OUT=/some/dir npx vitest run test/render-samples.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { LOGO_DATA_URI } from '../src/assets/logo';
import { monthlyReport, weeklyReport } from '../src/core/reports';
import { createDeviceKey, signClaim } from '../src/core/signing';
import { monthlyReportHtml, weeklyReportHtml } from '../src/core/templates/reportHtml';
import { receiptHtml, verificationLink } from '../src/core/templates/receiptHtml';
import { Repo } from '../src/db/repo';
import { nodeDb } from './nodeDb';

const out = process.env.RENDER_OUT;

describe.skipIf(!out)('render samples', () => {
  it('writes HTML', async () => {
    mkdirSync(out!, { recursive: true });
    const repo = new Repo({ db: nodeDb(), uuid: randomUUID, now: () => new Date('2026-11-03T10:00:00') });
    await repo.init();
    const key = createDeviceKey('T', () => new Uint8Array(randomBytes(32)));
    const signer = { prefix: 'T', keyId: key.keyId, collectorName: 'Tatenda Chikomo', sign: (c: any) => signClaim(c, key.privateKeyHex) };
    const names = ['Tendai Moyo', 'Rudo Banda', 'Nyasha Dube', 'Farai Ncube', 'Chipo Sibanda', 'Tafadzwa Mpofu'];
    const ids: string[] = [];
    for (const n of names) ids.push((await repo.addMember({ fullName: n, phone: null, startMonth: '2026-06' }, 'T')).id);
    const p = await repo.recordPayment({ memberId: ids[0], amountUsd: 3, method: 'mobile', mobileRef: 'MP261103.1015.A12345', months: await repo.suggestMonths(ids[0], 3) }, signer);
    await repo.recordPayment({ memberId: ids[1], amountUsd: 6, method: 'cash', mobileRef: null, months: await repo.suggestMonths(ids[1], 6) }, signer);
    const v = await repo.recordPayment({ memberId: ids[2], amountUsd: 1, method: 'cash', mobileRef: null, months: ['2026-06'] }, signer);
    await repo.voidPayment(v.id, 'Wrong member selected', 'Tatenda Chikomo');
    await repo.recordPayment({ memberId: ids[3], amountUsd: 7, method: 'cash', mobileRef: null, months: await repo.suggestMonths(ids[3], 7) }, signer);

    const base = process.env.VERIFY_BASE ?? 'https://example-youth.web.app/';
    const view = { claim: p.claim, signature: p.signature, collectedBy: p.collectedBy, mobileRef: p.mobileRef, voided: null };
    writeFileSync(join(out!, 'receipt.html'), receiptHtml(view, LOGO_DATA_URI, base));
    const vp = (await repo.getPayment(v.id))!;
    writeFileSync(join(out!, 'receipt-void.html'), receiptHtml({ claim: vp.claim, signature: vp.signature, collectedBy: vp.collectedBy, mobileRef: null, voided: vp.voided }, LOGO_DATA_URI, base));
    writeFileSync(join(out!, 'verify-link.txt'), verificationLink(base, p.claim, p.signature!));
    writeFileSync(join(out!, 'keys.json'), JSON.stringify({ keys: [{ keyId: key.keyId, publicKey: key.publicKeyHex, owner: 'Tatenda Chikomo', revokedAt: null }] }, null, 2));

    const d = await repo.reportData('2026-01-01', '2026-11-30');
    const w = weeklyReport('2026-11-02', '2026-11-08', d.payments);
    const m = monthlyReport('2026-11', d.members, d.payments, d.exempt);
    for (const a of ['group', 'leadership'] as const) {
      writeFileSync(join(out!, `weekly-${a}.html`), weeklyReportHtml(w, a, LOGO_DATA_URI, '3 Nov 2026 10:00'));
      writeFileSync(join(out!, `monthly-${a}.html`), monthlyReportHtml(m, a, LOGO_DATA_URI, '3 Nov 2026 10:00'));
    }
  });
});
