import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Snapshot = { ready: boolean; userId: string | null; generation: number; signal: AbortSignal };

/** One store per mounted app, never a server-wide singleton. */
export class SessionStore {
  private controller = new AbortController();
  private snapshot: Snapshot = {
    ready: false,
    userId: null,
    generation: 0,
    signal: this.controller.signal,
  };
  private listeners = new Set<() => void>();
  private readonly serverSnapshot = this.snapshot;
  private signingOut = false;
  constructor(private queryClient: QueryClient) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.serverSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setUser(userId: string | null) {
    if (this.signingOut && userId !== null) return false;
    const previous = this.snapshot;
    if (previous.ready && previous.userId === userId) return false;
    this.controller.abort();
    // cancelQueries aborts synchronously; removeQueries also removes resolved data.
    void this.queryClient.cancelQueries({ queryKey: ["user"] });
    this.queryClient.removeQueries({ queryKey: ["user"] });
    this.controller = new AbortController();
    this.snapshot = {
      ready: true,
      userId,
      generation: previous.generation + 1,
      signal: this.controller.signal,
    };
    // External-store updates are synchronous, including transitions from an auth callback.
    for (const listener of this.listeners) listener();
    return true;
  }
  startSignOut() {
    this.setUser(null);
    this.signingOut = true;
  }
  finishSignOut(userId: string | null = null) {
    this.signingOut = false;
    this.setUser(userId);
  }
}

const SessionContext = createContext<SessionStore | null>(null);

export function SessionProvider({
  children,
  onIdentityChange,
}: {
  children: ReactNode;
  onIdentityChange: () => void;
}) {
  const qc = useQueryClient();
  const [store] = useState(() => new SessionStore(qc));
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (store.setUser(session?.user.id ?? null)) {
        // Do not await Supabase methods inside its auth lock.
        queueMicrotask(onIdentityChange);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [store, onIdentityChange]);
  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const store = useContext(SessionContext);
  if (!store) throw new Error("SessionProvider is required");
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...snapshot, store, isCurrent: () => store.getSnapshot() === snapshot };
}

export function useUserSession() {
  const session = useSession();
  if (!session.ready || !session.userId) throw new Error("Authenticated session is required");
  return { ...session, userId: session.userId };
}

export function AccountBoundary({
  verifiedUserId,
  children,
}: {
  verifiedUserId: string;
  children: ReactNode;
}) {
  const session = useSession();
  if (!session.ready || !session.userId || session.userId !== verifiedUserId)
    return (
      <p className="p-5" role="status">
        Проверка сессии…
      </p>
    );
  return <Fragment key={session.generation}>{children}</Fragment>;
}
