import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Repo } from './src/db/repo';
import { DeviceSettings, loadDevice, newId } from './src/platform/device';
import { openAppDb } from './src/platform/expoDb';
import { DataScreen } from './src/screens/DataScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MemberFormScreen, MemberScreen } from './src/screens/MemberScreens';
import { MembersScreen } from './src/screens/MembersScreen';
import { PayScreen } from './src/screens/PayScreen';
import { ReceiptScreen } from './src/screens/ReceiptScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { AppProvider } from './src/ui/app';
import { C } from './src/ui/kit';
import { NavProvider, useNav } from './src/ui/nav';

function Router({ onRekey }: { onRekey: () => void }) {
  const { route } = useNav();
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'members':
      return <MembersScreen />;
    case 'member':
      return <MemberScreen key={route.id} id={route.id} />;
    case 'memberForm':
      return <MemberFormScreen id={route.id} />;
    case 'pay':
      return <PayScreen memberId={route.memberId} />;
    case 'receipt':
      return <ReceiptScreen key={route.paymentId} paymentId={route.paymentId} />;
    case 'reports':
      return <ReportsScreen />;
    case 'data':
      return <DataScreen />;
    case 'settings':
      return <SettingsScreen onRekey={onRekey} />;
  }
}

export default function App() {
  const [repo, setRepo] = React.useState<Repo | null>(null);
  const [device, setDevice] = React.useState<DeviceSettings | null | undefined>(undefined);
  const [rekeying, setRekeying] = React.useState(false);
  const [fatal, setFatal] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const r = new Repo({ db: await openAppDb(), uuid: newId });
      await r.init();
      setRepo(r);
      setDevice(await loadDevice(r));
    })().catch((e) => setFatal(String(e?.message ?? e)));
  }, []);

  const ctx = React.useMemo(() => (repo && device ? { repo, device, setDevice } : null), [repo, device]);

  let body: React.ReactNode;
  if (fatal) {
    body = (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.red, fontWeight: '700', marginBottom: 8 }}>The app could not start</Text>
        <Text>{fatal}</Text>
      </View>
    );
  } else if (!repo || device === undefined) {
    body = <ActivityIndicator style={{ flex: 1 }} color={C.navy} />;
  } else if (!device || rekeying) {
    body = (
      <SetupScreen
        repo={repo}
        initial={rekeying ? device : null}
        onCancel={rekeying ? () => setRekeying(false) : undefined}
        onDone={(d) => {
          setDevice(d);
          setRekeying(false);
        }}
      />
    );
  } else {
    body = (
      <AppProvider value={ctx!}>
        <NavProvider initial={{ name: 'home' }}>
          <Router onRekey={() => setRekeying(true)} />
        </NavProvider>
      </AppProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {body}
    </SafeAreaProvider>
  );
}
