import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { normalizePhone } from '../core/importer';
import { standing } from '../core/ledger';
import { addMonths, currentMonth, dateLabel, isMonth, monthLabel, monthRange } from '../core/months';
import type { Member } from '../db/repo';
import { attempt, useApp, useLoad } from '../ui/app';
import { Badge, Btn, C, Card, Field, KV, Muted, PromptModal, Row, s, Screen, Segmented } from '../ui/kit';
import { useNav } from '../ui/nav';

export function MemberScreen({ id }: { id: string }) {
  const { repo, device, changed } = useApp();
  const nav = useNav();
  const [year, setYear] = React.useState(Number(currentMonth().slice(0, 4)));
  const [exempting, setExempting] = React.useState(false);
  const { data } = useLoad(async () => {
    const [member, payments, exemptions, covered] = await Promise.all([
      repo.getMember(id),
      repo.paymentsForMember(id),
      repo.exemptionsForMember(id),
      repo.coveredMap(undefined, id),
    ]);
    return { member, payments, exemptions, covered: covered.get(id) ?? new Set<string>() };
  }, [id]);

  if (!data?.member) return <Screen title="Member">{data ? <Muted>Member not found.</Muted> : null}</Screen>;
  const m = data.member;
  const cur = currentMonth();
  const st = standing(m.startMonth, data.covered, cur);
  const exemptSet = new Set(data.exemptions.map((e) => e.month));
  const months = monthRange(`${year}-01`, `${year}-12`);

  return (
    <Screen title={m.fullName}>
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={s.h}>{m.memberNo}</Text>
          {m.status === 'inactive' ? <Badge text="inactive" tone="grey" /> : st.owed.length ? <Badge text={`owes $${st.owed.length}`} tone="red" /> : <Badge text="paid up" tone="green" />}
        </Row>
        <KV k="Phone" v={m.phone ?? '—'} />
        <KV k="Subscription starts" v={monthLabel(m.startMonth)} />
        <KV k="Paid through" v={st.paidThrough ? monthLabel(st.paidThrough) : '—'} />
        {st.owed.length ? <KV k="Owing" v={`${st.owed.length} month(s) since ${monthLabel(st.owed[0])}`} /> : null}
        {st.ahead.length ? <KV k="Paid ahead" v={`${st.ahead.length} month(s)`} /> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <Pressable onPress={() => setYear(year - 1)} hitSlop={10}>
            <Text style={{ color: C.blue, fontSize: 18 }}>‹</Text>
          </Pressable>
          <Text style={s.h}>{year}</Text>
          <Pressable onPress={() => setYear(year + 1)} hitSlop={10}>
            <Text style={{ color: C.blue, fontSize: 18 }}>›</Text>
          </Pressable>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {months.map((mo) => {
            const before = mo < m.startMonth;
            const ex = exemptSet.has(mo);
            const paid = data.covered.has(mo) && !ex;
            const owing = !before && !paid && !ex && mo <= cur;
            const bg = before ? C.disabled : paid ? C.greenSoft : ex ? C.amberSoft : owing ? C.redSoft : C.white;
            const fg = before ? C.disabledText : paid ? C.green : ex ? C.amberText : owing ? C.red : C.muted;
            return (
              <View key={mo} style={{ width: '23%', paddingVertical: 8, borderRadius: 8, backgroundColor: bg, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: fg, fontWeight: '700' }}>{monthLabel(mo).slice(0, 3)}</Text>
                <Text style={{ color: fg, fontSize: 11 }}>{before ? '' : paid ? 'paid' : ex ? 'exempt' : owing ? 'owing' : ''}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      {m.status === 'active' ? <Btn label="Record payment" onPress={() => nav.push({ name: 'pay', memberId: m.id })} style={{ marginBottom: 10 }} /> : null}
      <Row style={{ marginBottom: 16 }}>
        <Btn label="Edit" kind="secondary" onPress={() => nav.push({ name: 'memberForm', id: m.id })} style={{ flex: 1 }} />
        {m.status === 'active' ? <Btn label="Exempt a month" kind="secondary" onPress={() => setExempting(true)} style={{ flex: 1 }} /> : null}
      </Row>

      <Text style={s.h}>Receipts</Text>
      {data.payments.length === 0 ? <Muted>No payments yet.</Muted> : null}
      {data.payments.map((p) => (
        <Pressable key={p.id} onPress={() => nav.push({ name: 'receipt', paymentId: p.id })}>
          <Card style={{ marginBottom: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{p.receiptNo}</Text>
                <Muted>
                  {dateLabel(p.paidOn)} · {p.months.map((x) => monthLabel(x).slice(0, 3)).join(', ')}
                </Muted>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontWeight: '800', color: p.voided ? C.muted : C.blue, textDecorationLine: p.voided ? 'line-through' : 'none' }}>${p.amountUsd}</Text>
                {p.voided ? <Badge text="VOID" tone="red" /> : null}
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}
      {data.exemptions.length ? (
        <>
          <Text style={[s.h, { marginTop: 8 }]}>Exemptions</Text>
          {data.exemptions.map((e) => (
            <Card key={e.id} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '700' }}>{monthLabel(e.month)}</Text>
              <Muted>
                {e.reason} · approved by {e.approvedBy}
              </Muted>
            </Card>
          ))}
        </>
      ) : null}

      <PromptModal
        visible={exempting}
        title="Exempt a month"
        message="The member will not owe for this month. Only with approval from leadership."
        confirmLabel="Exempt"
        fields={[
          { key: 'month', label: 'Month (YYYY-MM)', initial: st.owed[0] ?? cur },
          { key: 'reason', label: 'Reason', placeholder: 'e.g. hardship' },
          { key: 'approvedBy', label: 'Approved by', placeholder: 'e.g. Youth Pastor' },
        ]}
        onCancel={() => setExempting(false)}
        onConfirm={async (v) => {
          const ok = await attempt(() => repo.addExemption(m.id, v.month.trim(), v.reason, v.approvedBy, device.collectorName));
          if (ok !== undefined) {
            setExempting(false);
            changed();
          }
        }}
      />
    </Screen>
  );
}

export function MemberFormScreen({ id }: { id?: string }) {
  const { repo } = useApp();
  const { data: existing, error } = useLoad(async () => {
    if (!id) return null;
    const m = await repo.getMember(id);
    if (!m) throw new Error('This member no longer exists.');
    return m;
  }, [id]);
  // Editing: wait for the member so the form starts filled in. The key resets the form if the member changes.
  if (id && !existing) return <Screen title="Edit member">{error ? <Muted>{error}</Muted> : null}</Screen>;
  return <MemberForm key={existing?.id ?? 'new'} id={id} existing={existing ?? null} />;
}

function MemberForm({ id, existing }: { id?: string; existing: Member | null }) {
  const { repo, device, changed } = useApp();
  const nav = useNav();
  const [name, setName] = React.useState(existing?.fullName ?? '');
  const [phone, setPhone] = React.useState(existing?.phone ?? '');
  const [start, setStart] = React.useState(existing?.startMonth ?? currentMonth());
  const [status, setStatus] = React.useState<'active' | 'inactive'>(existing?.status ?? 'active');
  const [busy, setBusy] = React.useState(false);

  const phoneNorm = normalizePhone(phone);
  const phoneErr = phoneNorm === undefined ? 'Use a Zimbabwe number like 0771234567, or +country code.' : null;
  const startErr = isMonth(start) ? (start > addMonths(currentMonth(), 12) ? 'Too far in the future.' : null) : 'Use YYYY-MM, e.g. 2026-01';

  return (
    <Screen title={id ? 'Edit member' : 'Add member'}>
      <Card>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="e.g. Tendai Moyo" />
        <Field label="Phone (WhatsApp)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0771234567" error={phoneErr} />
        <Field
          label="Subscription starts (first month owed)"
          value={start}
          onChangeText={setStart}
          placeholder="2026-01"
          error={startErr}
          hint="Arrears are counted from this month."
        />
        {id ? (
          <>
            <Text style={s.label}>Status</Text>
            <Segmented value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (left / moved)' }]} />
          </>
        ) : (
          <Muted style={{ marginBottom: 12 }}>A member number (Y0001…) is assigned automatically.</Muted>
        )}
        <Btn
          label={id ? 'Save' : 'Add member'}
          busy={busy}
          disabled={name.trim().length < 2 || !!phoneErr || !!startErr}
          onPress={async () => {
            setBusy(true);
            const res = await attempt(async () => {
              if (id) {
                await repo.updateMember(id, { fullName: name, phone: phoneNorm ?? null, startMonth: start, status }, device.collectorName);
                return id;
              }
              return (await repo.addMember({ fullName: name, phone: phoneNorm ?? null, startMonth: start }, device.collectorName)).id;
            });
            setBusy(false);
            if (res) {
              changed();
              if (id) nav.pop();
              else nav.replace({ name: 'member', id: res });
            }
          }}
        />
      </Card>
    </Screen>
  );
}
