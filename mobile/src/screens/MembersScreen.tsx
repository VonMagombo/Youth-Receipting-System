import React from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { monthLabel } from '../core/months';
import type { MemberWithStanding } from '../db/repo';
import { useApp, useLoad } from '../ui/app';
import { Badge, Btn, C, Card, Muted, Row, s, Screen, Segmented } from '../ui/kit';
import { useNav } from '../ui/nav';

type Filter = 'all' | 'owing' | 'paid' | 'inactive';

export function standingBadge(m: MemberWithStanding) {
  if (m.status === 'inactive') return <Badge text="inactive" tone="grey" />;
  if (m.owed > 0) return <Badge text={`owes $${m.owed}`} tone={m.owed >= 3 ? 'red' : 'amber'} />;
  if (m.ahead > 0) return <Badge text={`+${m.ahead} ahead`} tone="blue" />;
  return <Badge text="paid up" tone="green" />;
}

/** Member list. With `onPick`, acts as a picker (used by Record payment). */
export function MembersScreen({ onPick, title = 'Members' }: { onPick?: (m: MemberWithStanding) => void; title?: string }) {
  const { repo } = useApp();
  const nav = useNav();
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>(onPick ? 'all' : 'all');
  const { data } = useLoad(() => repo.membersWithStanding());

  const list = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? [])
      .filter((m) => (onPick ? m.status === 'active' : true))
      .filter((m) =>
        filter === 'owing' ? m.status === 'active' && m.owed > 0 : filter === 'paid' ? m.status === 'active' && m.owed === 0 : filter === 'inactive' ? m.status === 'inactive' : true,
      )
      .filter((m) => !needle || m.fullName.toLowerCase().includes(needle) || m.memberNo.toLowerCase().includes(needle) || (m.phone ?? '').includes(needle));
  }, [data, q, filter, onPick]);

  return (
    <Screen title={title} scroll={false}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search name, number or phone" style={[s.input, { marginBottom: 10 }]} placeholderTextColor={C.placeholder} autoFocus={!!onPick} />
      {!onPick ? (
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${data ? data.length : ''}` },
            { value: 'owing', label: 'Owing' },
            { value: 'paid', label: 'Paid up' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 20 }}>{data ? 'No members match.' : 'Loading…'}</Muted>}
        renderItem={({ item: m }) => (
          <Pressable onPress={() => (onPick ? onPick(m) : nav.push({ name: 'member', id: m.id }))}>
            <Card style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.ink, fontSize: 15 }}>{m.fullName}</Text>
                  <Muted>
                    {m.memberNo}
                    {m.paidThrough ? ` · paid to ${monthLabel(m.paidThrough)}` : ''}
                  </Muted>
                </View>
                {standingBadge(m)}
              </Row>
            </Card>
          </Pressable>
        )}
      />
      {!onPick ? <Btn label="+ Add member" onPress={() => nav.push({ name: 'memberForm' })} style={{ marginTop: 8 }} /> : null}
    </Screen>
  );
}
