import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, UnauthorizedError } from "../api/client";
import { clearUserToken, getUserToken, setUserToken } from "../api/userToken";
import type { CaptchaSolution, User } from "../types";

interface LoginResult {
  requires2fa: boolean;
  pendingToken?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2fa: (pendingToken: string, code: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    captcha: CaptchaSolution
  ) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getUserToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearUserToken();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.login(email, password);
    if (res.requires_2fa) {
      return { requires2fa: true, pendingToken: res.pending_token ?? undefined };
    }
    setUserToken(res.access_token!);
    setUser(res.user!);
    return { requires2fa: false };
  }, []);

  const verify2fa = useCallback(async (pendingToken: string, code: string) => {
    const res = await api.verify2fa(pendingToken, code);
    setUserToken(res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string, captcha: CaptchaSolution) => {
      const res = await api.register(email, password, displayName, captcha);
      setUserToken(res.access_token);
      setUser(res.user);
    },
    []
  );

  const logout = useCallback(() => {
    clearUserToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2fa, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
