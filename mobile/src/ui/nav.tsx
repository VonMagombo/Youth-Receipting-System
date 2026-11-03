import React from 'react';
import { BackHandler } from 'react-native';

export type Route =
  | { name: 'home' }
  | { name: 'members' }
  | { name: 'member'; id: string }
  | { name: 'memberForm'; id?: string }
  | { name: 'pay'; memberId?: string }
  | { name: 'receipt'; paymentId: string }
  | { name: 'reports' }
  | { name: 'data' }
  | { name: 'settings' };

interface Nav {
  route: Route;
  canGoBack: boolean;
  push(r: Route): void;
  replace(r: Route): void;
  pop(): void;
  reset(r: Route): void;
}

const Ctx = React.createContext<Nav | null>(null);

/** A tiny stack navigator: enough for ~10 screens, no native navigation dependency. */
export function NavProvider({ initial, children }: { initial: Route; children: React.ReactNode }) {
  const [stack, setStack] = React.useState<Route[]>([initial]);
  const nav = React.useMemo<Nav>(
    () => ({
      route: stack[stack.length - 1],
      canGoBack: stack.length > 1,
      push: (r) => setStack((st) => [...st, r]),
      replace: (r) => setStack((st) => [...st.slice(0, -1), r]),
      pop: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
      reset: (r) => setStack([r]),
    }),
    [stack],
  );
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        nav.pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, nav]);
  return <Ctx.Provider value={nav}>{children}</Ctx.Provider>;
}

export function useNav(): Nav {
  const n = React.useContext(Ctx);
  if (!n) throw new Error('useNav outside NavProvider');
  return n;
}
