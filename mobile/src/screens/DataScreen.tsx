import React from 'react';
import { Text, View } from 'react-native';
import { ImportPlan, planImport } from '../core/importer';
import { currentMonth, monthLabel } from '../core/months';
import { IMPORT_TEMPLATE, pickWorkbook, shareWorkbook } from '../platform/files';
import { attempt, useApp } from '../ui/app';
import { Badge, Btn, C, Card, KV, Muted, Row, s, Screen } from '../ui/kit';

export function DataScreen() {
  const { repo, device, changed } = useApp();
  const [plan, setPlan] = React.useState<{ file: string; plan: ImportPlan } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const pick = async () => {
    setDone(null);
    setBusy('pick');
    const res = await attempt(async () => {
      const wb = await pickWorkbook();
      if (!wb) return null;
      return { file: wb.name, plan: planImport({ members: wb.members, payments: wb.payments }, await repo.importState(), currentMonth()) };
    }, 'Could not read the file');
    setBusy(null);
    if (res) setPlan(res);
  };

  const apply = async () => {
    if (!plan) return;
    setBusy('apply');
    const r = await attempt(() => repo.applyImport(plan.plan, device.collectorName), 'Import failed — nothing was changed');
    setBusy(null);
    if (r) {
      changed();
      setPlan(null);
      setDone(`Imported: ${r.added} new members, ${r.updated} updated, ${r.payments} past payments.`);
    }
  };

  const exportAll = async () => {
    setBusy('export');
    await attempt(async () => {
      const t = await repo.exportTables();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      await shareWorkbook(
        `youth-subs-backup-${stamp}.xlsx`,
        {
          Members: t.members.map((m) => ({ member_no: m.memberNo, full_name: m.fullName, phone: m.phone ?? '', start_month: m.startMonth, status: m.status })),
          Payments: t.payments.map((p) => ({
            receipt_no: p.receiptNo,
            member_no: p.memberNo,
            full_name: p.memberName,
            date: p.paidOn,
            amount_usd: p.amountUsd,
            method: p.method,
            mobile_ref: p.mobileRef ?? '',
            months: p.months.join(','),
            collected_by: p.collectedBy,
            voided: p.voided ? 'yes' : '',
            void_reason: p.voided?.reason ?? '',
            signature: p.signature ?? '',
            key_id: p.keyId ?? '',
          })),
          Exemptions: t.exemptions,
          AuditLog: t.audit,
        },
        'Save or send the backup',
      );
    }, 'Export failed');
    setBusy(null);
  };

  const counts = plan
    ? {
        new: plan.plan.members.filter((m) => m.kind === 'new').length,
        update: plan.plan.members.filter((m) => m.kind === 'update').length,
        same: plan.plan.members.filter((m) => m.kind === 'unchanged').length,
      }
    : null;

  return (
    <Screen title="Excel import & export">
      <Card>
        <Text style={s.h}>Import members from Excel</Text>
        <Muted style={{ marginBottom: 12 }}>
          Use the template: a “Members” sheet (full_name, phone, start_month) and optionally a “Payments” sheet for history from the paper book. You will see a preview before anything changes.
        </Muted>
        <Row>
          <Btn label="Get template" kind="secondary" busy={busy === 'tpl'} onPress={async () => {
            setBusy('tpl');
            await attempt(() => shareWorkbook('youth-subs-import-template.xlsx', IMPORT_TEMPLATE, 'Save the template'));
            setBusy(null);
          }} style={{ flex: 1 }} />
          <Btn label="Choose file" busy={busy === 'pick'} onPress={pick} style={{ flex: 1 }} />
        </Row>
        {done ? <Text style={{ color: C.green, fontWeight: '700', marginTop: 12 }}>{done}</Text> : null}
      </Card>

      {plan && counts ? (
        <Card>
          <Text style={s.h}>Preview: {plan.file}</Text>
          <KV k="New members" v={counts.new} />
          <KV k="Members updated" v={counts.update} />
          <KV k="Already up to date" v={counts.same} />
          <KV k="Past payments" v={`${plan.plan.payments.length} ($${plan.plan.payments.reduce((a, p) => a + p.amountUsd, 0)})`} />
          {plan.plan.members
            .filter((m) => m.kind === 'update')
            .slice(0, 10)
            .map((m) => (m.kind === 'update' ? <Muted key={m.row}>Row {m.row}: {m.changes.join(', ')}</Muted> : null))}
          {plan.plan.errors.length ? (
            <View style={{ marginTop: 12 }}>
              <Row style={{ marginBottom: 6 }}>
                <Badge text={`${plan.plan.errors.length} error(s)`} tone="red" />
                <Muted>Fix these in Excel and choose the file again.</Muted>
              </Row>
              {plan.plan.errors.slice(0, 30).map((e, i) => (
                <Text key={i} style={{ color: C.red, fontSize: 13, marginBottom: 3 }}>
                  {e.sheet} row {e.row}: {e.message}
                </Text>
              ))}
            </View>
          ) : null}
          {plan.plan.warnings.length ? (
            <View style={{ marginTop: 12 }}>
              <Badge text={`${plan.plan.warnings.length} warning(s)`} tone="amber" />
              {plan.plan.warnings.slice(0, 30).map((w, i) => (
                <Muted key={i} style={{ marginTop: 3 }}>
                  {w.sheet} row {w.row}: {w.message}
                </Muted>
              ))}
            </View>
          ) : null}
          {plan.plan.payments.length ? (
            <Muted style={{ marginTop: 10 }}>
              Past payments get receipt numbers H-… and are marked “from paper book” (no digital signature). Example: {plan.plan.payments[0].memberName}, ${plan.plan.payments[0].amountUsd} for{' '}
              {plan.plan.payments[0].months.map(monthLabel).join(', ')}.
            </Muted>
          ) : null}
          <Row style={{ marginTop: 14 }}>
            <Btn label="Cancel" kind="ghost" onPress={() => setPlan(null)} style={{ flex: 1 }} />
            <Btn label="Import" busy={busy === 'apply'} disabled={plan.plan.errors.length > 0 || (counts.new + counts.update + plan.plan.payments.length === 0)} onPress={apply} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <Text style={s.h}>Back up everything</Text>
        <Muted style={{ marginBottom: 12 }}>
          Until syncing is added, the data lives only on this phone. Export weekly and send the file to the church email or Google Drive. If the phone is lost, the backup can be imported on a new phone.
        </Muted>
        <Btn label="Export to Excel" kind="secondary" busy={busy === 'export'} onPress={exportAll} />
      </Card>
    </Screen>
  );
}
