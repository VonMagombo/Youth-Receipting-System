import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { ORG } from '../core/config';
import { currentMonth, dateLabel, monthLabel, todayLocal } from '../core/months';
import { useApp, useLoad } from '../ui/app';
import { Badge, Btn, C, Card, Muted, Row, s, Screen } from '../ui/kit';
import { useNav } from '../ui/nav';

export function HomeScreen() {
  const { repo, device } = useApp();
  const nav = useNav();
  const month = currentMonth();
  const { data } = useLoad(async () => {
    const [members, recent, monthPays] = await Promise.all([
      repo.membersWithStanding(month),
      repo.recentPayments(8),
      repo.paymentsBetween(`${month}-01`, `${month}-31`),
    ]);
    const active = members.filter((m) => m.status === 'active');
    const live = monthPays.filter((p) => !p.voided && !p.imported);
    return {
      active: active.length,
      owing: active.filter((m) => m.owed > 0).length,
      collected: live.reduce((a, p) => a + p.amountUsd, 0),
      today: live.filter((p) => p.paidOn === todayLocal()).reduce((a, p) => a + p.amountUsd, 0),
      recent,
    };
  });

  return (
    <Screen title={`${ORG.department}`} right={<Pressable onPress={() => nav.push({ name: 'settings' })} hitSlop={10}><Text style={{ color: C.white, fontSize: 15 }}>Settings</Text></Pressable>}>
      <Row style={{ marginBottom: 14 }}>
        <Image source={require('../../assets/logo-256.png')} style={{ width: 52, height: 52 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: C.navy, fontSize: 16 }}>{ORG.church}</Text>
          <Text style={{ fontWeight: '600', color: C.navy }}>{ORG.assembly}</Text>
          <Muted>
            {device.collectorName} · receipts {device.prefix}-…
          </Muted>
        </View>
      </Row>

      <Row style={{ marginBottom: 12 }}>
        <Card style={{ flex: 1, marginBottom: 0 }}>
          <Muted>{monthLabel(month)}</Muted>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.navy }}>${data?.collected ?? '–'}</Text>
          <Muted>today ${data?.today ?? '–'}</Muted>
        </Card>
        <Card style={{ flex: 1, marginBottom: 0 }}>
          <Muted>Active members</Muted>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.navy }}>{data?.active ?? '–'}</Text>
          <Muted>{data ? `${data.owing} owing` : ' '}</Muted>
        </Card>
      </Row>

      <Btn label="Record a payment" onPress={() => nav.push({ name: 'pay' })} style={{ marginBottom: 10 }} />
      <Row style={{ marginBottom: 18 }}>
        <Btn label="Members" kind="secondary" onPress={() => nav.push({ name: 'members' })} style={{ flex: 1 }} />
        <Btn label="Reports" kind="secondary" onPress={() => nav.push({ name: 'reports' })} style={{ flex: 1 }} />
        <Btn label="Excel" kind="secondary" onPress={() => nav.push({ name: 'data' })} style={{ flex: 1 }} />
      </Row>

      <Text style={s.h}>Recent receipts</Text>
      {data && data.recent.length === 0 ? (
        <Card>
          <Muted>No receipts yet. Import your member list from Excel or add members, then record a payment.</Muted>
        </Card>
      ) : null}
      {data?.recent.map((p) => (
        <Pressable key={p.id} onPress={() => nav.push({ name: 'receipt', paymentId: p.id })}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{p.memberName}</Text>
                <Muted>
                  {p.receiptNo} · {dateLabel(p.paidOn)} · {p.method === 'cash' ? 'Cash' : 'Mobile'}
                </Muted>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontWeight: '800', color: p.voided ? C.muted : C.navy, textDecorationLine: p.voided ? 'line-through' : 'none' }}>${p.amountUsd}</Text>
                {p.voided ? <Badge text="VOID" tone="red" /> : p.imported ? <Badge text="paper" tone="grey" /> : null}
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}
      <Muted style={{ textAlign: 'center', marginTop: 8 }}>Data is stored on this phone. Back it up weekly from Excel → Export.</Muted>
    </Screen>
  );
}
