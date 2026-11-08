import React from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEVICE_PREFIXES, ORG } from '../core/config';
import type { Repo } from '../db/repo';
import { DeviceSettings, setupDevice } from '../platform/device';
import { attempt } from '../ui/app';
import { Btn, C, Card, Field, Muted, s, Segmented } from '../ui/kit';

/** First run (and re-keying from Settings): who is collecting on this phone. */
export function SetupScreen({ repo, initial, onDone, onCancel }: { repo: Repo; initial?: DeviceSettings | null; onDone: (d: DeviceSettings) => void; onCancel?: () => void }) {
  const [prefix, setPrefix] = React.useState<string>(initial?.prefix ?? 'T');
  const [name, setName] = React.useState(initial?.collectorName ?? '');
  const [url, setUrl] = React.useState(initial?.verifyBaseUrl ?? '');
  const [busy, setBusy] = React.useState(false);
  const urlOk = !url.trim() || /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim());

  return (
    <SafeAreaView style={s.safe}>
      <View style={[s.body, { gap: 4 }]}>
        <View style={{ alignItems: 'center', marginVertical: 16 }}>
          <Image source={require('../../assets/logo-256.png')} style={{ width: 96, height: 96 }} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.blue, marginTop: 10 }}>{ORG.assembly}</Text>
          <Muted>{ORG.church}</Muted>
          <Muted>{ORG.department} · Subscriptions</Muted>
        </View>
        <Card>
          <Text style={s.h}>{initial ? 'Change device setup' : 'Set up this phone'}</Text>
          <Text style={s.label}>This phone belongs to the</Text>
          <Segmented value={prefix} onChange={setPrefix} options={DEVICE_PREFIXES.map((d) => ({ value: d.prefix, label: d.label }))} />
          <Field label="Your name (printed on receipts)" value={name} onChangeText={setName} placeholder="e.g. Tatenda Chikomo" autoCapitalize="words" />
          <Field
            label="Verification page address"
            value={url}
            onChangeText={setUrl}
            placeholder="https://your-project.web.app/"
            autoCapitalize="none"
            keyboardType="url"
            hint="Optional for now. Receipts made before this is set carry a QR code that the verification page can still check by pasting."
            error={urlOk ? null : 'Must start with https://'}
          />
          {initial ? (
            <Muted style={{ marginBottom: 12, color: C.red }}>
              Saving creates a NEW signing key. Receipts already issued stay valid as long as the old key stays listed on the verification page.
            </Muted>
          ) : null}
          <Btn
            label={initial ? 'Save and create new key' : 'Start'}
            busy={busy}
            disabled={name.trim().length < 2 || !urlOk}
            onPress={async () => {
              setBusy(true);
              const d = await attempt(() => setupDevice(repo, { prefix, collectorName: name, verifyBaseUrl: url }));
              setBusy(false);
              if (d) onDone(d);
            }}
          />
          {onCancel ? <Btn label="Cancel" kind="ghost" onPress={onCancel} style={{ marginTop: 8 }} /> : null}
        </Card>
      </View>
    </SafeAreaView>
  );
}
