import React from 'react';
import { Text } from 'react-native';
import { useApp, useLoad } from '../ui/app';
import { Btn, C, Card, KV, Muted, s, Screen } from '../ui/kit';

export function SettingsScreen({ onRekey }: { onRekey: () => void }) {
  const { repo, device } = useApp();
  const { data: audit } = useLoad(() => repo.auditLog(50));
  return (
    <Screen title="Settings">
      <Card>
        <Text style={s.h}>This phone</Text>
        <KV k="Collector" v={device.collectorName} />
        <KV k="Receipt series" v={`${device.prefix}-YYYY-NNNNN`} />
        <KV k="Signing key" v={device.keyId} />
        <KV k="Verification page" v={device.verifyBaseUrl || 'not set'} />
      </Card>
      <Card>
        <Text style={s.h}>Public key</Text>
        <Muted style={{ marginBottom: 8 }}>
          Add this to the verification page’s keys.json so it can confirm receipts from this phone. It is safe to share: it can check receipts but not create them.
        </Muted>
        <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: C.ink, backgroundColor: C.disabled, padding: 10, borderRadius: 8 }}>
          {JSON.stringify({ keyId: device.keyId, publicKey: device.publicKeyHex, owner: device.collectorName })}
        </Text>
        <Muted style={{ marginTop: 6 }}>Long-press the text to copy it.</Muted>
      </Card>
      <Btn label="Change collector / create new key" kind="secondary" onPress={onRekey} style={{ marginBottom: 16 }} />

      <Text style={s.h}>Activity log</Text>
      <Card>
        {audit?.length ? (
          audit.map((a) => (
            <Muted key={a.seq} style={{ marginBottom: 6 }}>
              {new Date(a.at).toLocaleString()} · {a.actor} · {a.action}
            </Muted>
          ))
        ) : (
          <Muted>No activity yet.</Muted>
        )}
      </Card>
    </Screen>
  );
}
