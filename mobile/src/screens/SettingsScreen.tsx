import React from 'react';
import { Text } from 'react-native';
import { parseVerifyUrl, VERIFY_URL_ERROR } from '../core/verifyUrl';
import { attempt, useApp, useLoad } from '../ui/app';
import { Btn, C, Card, Field, KV, Muted, Row, s, Screen } from '../ui/kit';

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
      </Card>
      <VerifyPageCard />
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
              {auditNote(a)}
            </Muted>
          ))
        ) : (
          <Muted>No activity yet.</Muted>
        )}
      </Card>
    </Screen>
  );
}

/** Extra detail worth showing on the phone for some log entries. */
function auditNote(a: { action: string; detail: string }): string {
  if (a.action !== 'settings.verify_url') return '';
  try {
    return ` → ${JSON.parse(a.detail).to}`;
  } catch {
    return '';
  }
}

/** Where receipt QR codes point. Changing it keeps the signing key, so the registered key stays valid. */
function VerifyPageCard() {
  const { repo, device, setDevice, changed } = useApp();
  const [draft, setDraft] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ok = draft === null || parseVerifyUrl(draft) !== null;
  return (
    <Card>
      <Text style={s.h}>Verification page</Text>
      <Muted style={{ marginBottom: 8 }}>Every receipt’s QR code opens this address so members can check the receipt is genuine.</Muted>
      {draft === null ? (
        <>
          <Text selectable style={{ fontFamily: 'monospace', fontSize: 13, color: C.ink, marginBottom: 10 }}>
            {device.verifyBaseUrl}
          </Text>
          <Btn label="Change address" kind="ghost" onPress={() => setDraft(device.verifyBaseUrl)} />
        </>
      ) : (
        <>
          <Field
            label="Address"
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint="This phone keeps its signing key. Left blank, the church's page is used."
            error={ok ? null : VERIFY_URL_ERROR}
          />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Btn label="Cancel" kind="ghost" onPress={() => setDraft(null)} />
            <Btn
              label="Save"
              busy={busy}
              disabled={!ok}
              onPress={async () => {
                setBusy(true);
                const url = await attempt(() => repo.changeVerifyUrl(draft, device.collectorName));
                setBusy(false);
                if (url === undefined) return;
                setDevice({ ...device, verifyBaseUrl: url });
                setDraft(null);
                changed();
              }}
            />
          </Row>
        </>
      )}
    </Card>
  );
}
