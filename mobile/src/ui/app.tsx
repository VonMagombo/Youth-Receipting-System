import React from 'react';
import { Alert } from 'react-native';
import { Repo, RepoError } from '../db/repo';
import type { DeviceSettings } from '../platform/device';

interface AppCtx {
  repo: Repo;
  device: DeviceSettings;
  setDevice(d: DeviceSettings): void;
  /** Bumped after every write so screens reload their data. */
  version: number;
  changed(): void;
}

const Ctx = React.createContext<AppCtx | null>(null);

export function AppProvider({ value, children }: { value: Omit<AppCtx, 'version' | 'changed'>; children: React.ReactNode }) {
  const [version, setVersion] = React.useState(0);
  const ctx = React.useMemo(() => ({ ...value, version, changed: () => setVersion((v) => v + 1) }), [value, version]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = React.useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

/** Load data for a screen; reloads whenever the app data version changes. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const { version } = useApp();
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    fn().then(
      (d) => live && (setData(d), setError(null)),
      (e) => live && setError(String(e?.message ?? e)),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/** Run an action, showing validation errors as a dialog instead of crashing. */
export async function attempt<T>(fn: () => Promise<T>, title = 'Could not complete'): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e: any) {
    Alert.alert(title, e instanceof RepoError ? e.message : String(e?.message ?? e));
    return undefined;
  }
}
