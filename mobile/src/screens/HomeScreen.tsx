import React from 'react';
import { AppState, Image, Pressable, Text, View } from 'react-native';
import { backupStatus } from '../core/backup';
import { ORG } from '../core/config';
import { currentMonth, dateLabel, monthLabel, todayLocal } from '../core/months';
import { exportBackup } from '../platform/backup';
import { attempt, useApp, useLoad } from '../ui/app';
import { Badge, Btn, C, Card, Muted, Row, s, Screen } from '../ui/kit';
import { useNav } from '../ui/nav';

export function HomeScreen() {
  const { repo, device, changed } = useApp();
  const nav = useNav();
  const [backingUp, setBackingUp] = React.useState(false);
  const month = currentMonth();
  const { data, reload } = useLoad(async () => {
    const [members, recent, monthPays, backupIn] = await Promise.all([
      repo.membersWithStanding(month),
      repo.recentPayments(8),
      repo.paymentsBetween(`${month}-01`, `${month}-31`),
      repo.backupInputs(),
    ]);
    const active = members.filter((m) => m.status === 'active');
    const live = monthPays.filter((p) => !p.voided && !p.imported);
    return {
      active: active.length,
      owing: active.filter((m) => m.owed > 0).length,
      collected: live.reduce((a, p) => a + p.amountUsd, 0),
      today: live.filter((p) => p.paidOn === todayLocal()).reduce((a, p) => a + p.amountUsd, 0),
      recent,
      backup: backupStatus({ ...backupIn, now: new Date() }),
    };
  });

  // The reminder depends on today's date: re-check it whenever the app comes back to the foreground,
  // or a phone left on this screen for days would keep showing "ok".
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backUpNow = async () => {
    setBackingUp(true);
    const ok = await attempt(() => exportBackup(repo), 'Backup failed');
    setBackingUp(false);
    if (ok) changed();
  };

  return (
    <Screen title={`${ORG.department}`} right={<Pressable onPress={() => nav.push({ name: 'settings' })} hitSlop={10}><Text style={{ color: C.white, fontSize: 15 }}>Settings</Text></Pressable>}>
      <Row style={{ marginBottom: 14 }}>
        <Image source={require('../../assets/logo-256.png')} style={{ width: 52, height: 52 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: C.blue, fontSize: 16 }}>{ORG.assembly}</Text>
          <Text style={{ fontWeight: '600', color: C.muted }}>{ORG.church}</Text>
          <Muted>
            {device.collectorName} · receipts {device.prefix}-…
          </Muted>
        </View>
      </Row>

      {data && data.backup.level !== 'ok' ? (
        <Card style={{ backgroundColor: data.backup.level === 'overdue' ? C.redSoft : C.amberSoft, borderColor: data.backup.level === 'overdue' ? C.red : C.gold }}>
          <Text style={{ fontWeight: '800', color: data.backup.level === 'overdue' ? C.red : C.ink, marginBottom: 4 }}>Back up this phone</Text>
          <Muted style={{ marginBottom: 10 }}>{data.backup.message} Send the file to the church Google Drive or email.</Muted>
          <Btn label="Back up now" busy={backingUp} onPress={backUpNow} />
        </Card>
      ) : null}

      <Row style={{ marginBottom: 12 }}>
        <Card style={{ flex: 1, marginBottom: 0 }}>
          <Muted>{monthLabel(month)}</Muted>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.blue }}>${data?.collected ?? '–'}</Text>
          <Muted>today ${data?.today ?? '–'}</Muted>
        </Card>
        <Card style={{ flex: 1, marginBottom: 0 }}>
          <Muted>Active members</Muted>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.blue }}>{data?.active ?? '–'}</Text>
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
                <Text style={{ fontWeight: '800', color: p.voided ? C.muted : C.blue, textDecorationLine: p.voided ? 'line-through' : 'none' }}>${p.amountUsd}</Text>
                {p.voided ? <Badge text="VOID" tone="red" /> : p.imported ? <Badge text="paper" tone="grey" /> : null}
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}
      <Muted style={{ textAlign: 'center', marginTop: 8 }}>Data is stored on this phone. {data?.backup.level === 'ok' ? data.backup.message : 'Back it up weekly.'}</Muted>
    </Screen>
  );
}
