import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { allocateMonths, checkPayment, MAX_MONTHS_PER_PAYMENT } from '../core/ledger';
import { addMonths, currentMonth, Month, monthLabel, monthRange, monthsLabel } from '../core/months';
import type { PayMethod } from '../core/signing';
import { makeSigner } from '../platform/device';
import { attempt, useApp, useLoad } from '../ui/app';
import { Btn, C, Card, Field, KV, Muted, Row, s, Screen, Segmented } from '../ui/kit';
import { useNav } from '../ui/nav';
import { MembersScreen } from './MembersScreen';

export function PayScreen({ memberId: initialMember }: { memberId?: string }) {
  const [memberId, setMemberId] = React.useState(initialMember);
  if (!memberId) return <MembersScreen title="Who is paying?" onPick={(m) => setMemberId(m.id)} />;
  return <PayForm memberId={memberId} />;
}

function PayForm({ memberId }: { memberId: string }) {
  const { repo, device, changed } = useApp();
  const nav = useNav();
  const cur = currentMonth();
  const { data } = useLoad(async () => {
    const [member, covered] = await Promise.all([repo.getMember(memberId), repo.coveredMap(undefined, memberId)]);
    return { member, covered: covered.get(memberId) ?? new Set<Month>() };
  }, [memberId]);

  const [amount, setAmount] = React.useState(1);
  const [method, setMethod] = React.useState<PayMethod>('cash');
  const [ref, setRef] = React.useState('');
  const [picked, setPicked] = React.useState<Month[]>([]);
  const [manual, setManual] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (!data?.member) return <Screen title="Record payment">{data ? <Muted>Member not found.</Muted> : null}</Screen>;
  const m = data.member;
  // Default allocation (oldest unpaid first) follows the amount unless the collector picked months by hand.
  const selected = manual ? picked : allocateMonths(m.startMonth, data.covered, amount);
  const gridStart = m.startMonth < addMonths(cur, -23) ? addMonths(cur, -23) : m.startMonth;
  const grid = monthRange(gridStart, addMonths(cur, 12));
  const problems = checkPayment({ amountUsd: amount, months: selected, startMonth: m.startMonth, covered: data.covered, current: cur });
  const refMissing = method === 'mobile' && !ref.trim();

  const toggle = (mo: Month) => {
    setPicked(selected.includes(mo) ? selected.filter((x) => x !== mo) : [...selected, mo].sort());
    setManual(true);
  };

  const submit = () => {
    Alert.alert(
      'Issue receipt?',
      `${m.fullName} (${m.memberNo})\n$${amount} ${method === 'cash' ? 'cash' : `mobile money, ref ${ref.trim()}`}\nFor: ${monthsLabel(selected)}\n\nReceipts cannot be edited afterwards, only voided.`,
      [
        { text: 'Check again', style: 'cancel' },
        {
          text: 'Issue receipt',
          onPress: async () => {
            setBusy(true);
            const p = await attempt(async () =>
              repo.recordPayment({ memberId: m.id, amountUsd: amount, method, mobileRef: method === 'mobile' ? ref : null, months: selected }, await makeSigner(device)),
            );
            setBusy(false);
            if (p) {
              changed();
              nav.replace({ name: 'receipt', paymentId: p.id });
            }
          },
        },
      ],
    );
  };

  return (
    <Screen title="Record payment">
      <Card>
        <Text style={s.h}>{m.fullName}</Text>
        <Muted>{m.memberNo}</Muted>
      </Card>

      <Card>
        <Text style={s.label}>Amount (USD)</Text>
        <Row style={{ justifyContent: 'center', marginBottom: 12 }}>
          <Btn label="−" kind="secondary" onPress={() => setAmount((a) => Math.max(1, a - 1))} style={{ width: 56 }} />
          <Text style={{ fontSize: 34, fontWeight: '800', color: C.blue, minWidth: 90, textAlign: 'center' }}>${amount}</Text>
          <Btn label="+" kind="secondary" onPress={() => setAmount((a) => Math.min(MAX_MONTHS_PER_PAYMENT, a + 1))} style={{ width: 56 }} />
        </Row>
        <Text style={s.label}>Paid by</Text>
        <Segmented value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash' }, { value: 'mobile', label: 'Mobile money' }]} />
        {method === 'mobile' ? (
          <Field label="Transaction reference" value={ref} onChangeText={setRef} autoCapitalize="characters" placeholder="e.g. MP260308.1234.A56789" hint="From the EcoCash / mobile money SMS. Check the money has arrived." />
        ) : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={s.label}>Months covered ({selected.length} of {amount})</Text>
          {manual ? (
            <Pressable onPress={() => setManual(false)} hitSlop={8}>
              <Text style={{ color: C.blue, fontWeight: '700' }}>Reset</Text>
            </Pressable>
          ) : null}
        </Row>
        <Muted style={{ marginBottom: 8 }}>Oldest unpaid months are chosen first. Tap to change.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {grid.map((mo) => {
            const taken = data.covered.has(mo);
            const on = selected.includes(mo);
            return (
              <Pressable
                key={mo}
                disabled={taken}
                onPress={() => toggle(mo)}
                style={{
                  width: '23%',
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: on ? C.blue : C.line,
                  backgroundColor: taken ? C.disabled : on ? C.blue : mo <= cur ? C.redSoft : C.white,
                }}
              >
                <Text style={{ color: taken ? C.disabledText : on ? C.white : C.ink, fontWeight: '700', fontSize: 13 }}>{monthLabel(mo).slice(0, 3)}</Text>
                <Text style={{ color: taken ? C.disabledText : on ? C.white : C.muted, fontSize: 11 }}>{taken ? 'paid' : mo.slice(0, 4)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <KV k="Receipt for" v={selected.length ? monthsLabel(selected) : '—'} />
        <KV k="Collected by" v={device.collectorName} />
        {problems.length ? <Text style={[s.error, { marginTop: 8 }]}>{problems[0]}</Text> : null}
      </Card>
      <Btn label={`Issue receipt for $${amount}`} busy={busy} disabled={problems.length > 0 || refMissing} onPress={submit} />
    </Screen>
  );
}
