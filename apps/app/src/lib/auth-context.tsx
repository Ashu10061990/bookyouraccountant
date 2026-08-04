import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getAccessToken,
  getSessionUser,
  initSession,
  signOutSession,
  subscribeToSession,
  type SessionUser,
} from "./session";

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Thin React bridge over `session.ts`: exposes the signed-in user (uid is
 * the server's `authUid`), a loading flag that stays true until the boot
 * refresh settles, and signOut. Same consumed shape as the previous
 * provider, so RequireAuth/Onboarding/Accountant work unchanged. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(getSessionUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToSession(setUser);
    // Resume from a stored refresh token; until this settles the app shows
    // its loading state instead of bouncing straight to /signin.
    void initSession().finally(() => {
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signOut: signOutSession,
      getToken: () => Promise.resolve(getAccessToken()),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
