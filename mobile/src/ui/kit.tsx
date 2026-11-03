import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNav } from './nav';

export const C = {
  navy: '#1d1b5e',
  navySoft: '#e9e8f6',
  gold: '#c99a2e',
  red: '#c8212a',
  redSoft: '#fdecec',
  green: '#1f7a3e',
  greenSoft: '#e6f4ea',
  amberSoft: '#fff4dc',
  ink: '#1a1a2e',
  muted: '#62627a',
  line: '#dcdce6',
  bg: '#f5f5fa',
  white: '#ffffff',
};

export function Screen({ title, children, right, scroll = true }: { title: string; children: React.ReactNode; right?: React.ReactNode; scroll?: boolean }) {
  const nav = useNav();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        {nav.canGoBack ? (
          <Pressable onPress={nav.pop} hitSlop={12} style={s.back} accessibilityLabel="Back">
            <Text style={s.backText}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.body, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Btn({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const k = btnKinds[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: k.bg, borderColor: k.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator color={k.fg} /> : <Text style={[s.btnText, { color: k.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const btnKinds = {
  primary: { bg: C.navy, fg: C.white, border: C.navy },
  secondary: { bg: C.white, fg: C.navy, border: C.navy },
  danger: { bg: C.white, fg: C.red, border: C.red },
  ghost: { bg: 'transparent', fg: C.navy, border: 'transparent' },
};

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9a9ab0" style={[s.input, error ? { borderColor: C.red } : null]} {...props} />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, value === o.value && s.segActive]} accessibilityState={{ selected: value === o.value }}>
          <Text style={[s.segText, value === o.value && s.segTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone: 'green' | 'red' | 'amber' | 'grey' | 'navy' }) {
  const t = {
    green: [C.greenSoft, C.green],
    red: [C.redSoft, C.red],
    amber: [C.amberSoft, '#8a5a00'],
    grey: ['#ececf2', C.muted],
    navy: [C.navySoft, C.navy],
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: t[0] }]}>
      <Text style={[s.badgeText, { color: t[1] }]}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function H({ children }: { children: React.ReactNode }) {
  return <Text style={s.h}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvK}>{k}</Text>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={s.kvV}>{v}</Text> : v}
    </View>
  );
}

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function PromptModal({
  visible,
  title,
  message,
  fields,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  fields: { key: string; label: string; placeholder?: string; initial?: string }[];
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (visible) setValues(Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalBg}>
        <View style={s.modal}>
          <Text style={s.h}>{title}</Text>
          {message ? <Text style={[s.muted, { marginBottom: 12 }]}>{message}</Text> : null}
          {fields.map((f) => (
            <Field key={f.key} label={f.label} placeholder={f.placeholder} value={values[f.key] ?? ''} onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))} />
          ))}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Btn label="Cancel" kind="ghost" onPress={onCancel} />
            <Btn
              label={confirmLabel}
              kind={danger ? 'danger' : 'primary'}
              busy={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await onConfirm(values);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.navy, gap: 8 },
  back: { paddingRight: 6 },
  backText: { color: C.white, fontSize: 30, lineHeight: 30, marginTop: -4 },
  title: { color: C.white, fontSize: 18, fontWeight: '700', flex: 1 },
  body: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  btn: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: C.ink, marginBottom: 6 },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink },
  hint: { fontSize: 12, color: C.muted, marginTop: 4 },
  error: { fontSize: 12, color: C.red, marginTop: 4 },
  seg: { flexDirection: 'row', backgroundColor: C.navySoft, borderRadius: 10, padding: 3, marginBottom: 14 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segActive: { backgroundColor: C.white, elevation: 1 },
  segText: { color: C.muted, fontWeight: '600' },
  segTextActive: { color: C.navy },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  h: { fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 8 },
  muted: { fontSize: 13, color: C.muted },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 12 },
  kvK: { color: C.muted, fontSize: 14 },
  kvV: { color: C.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: C.white, borderRadius: 14, padding: 18 },
});
