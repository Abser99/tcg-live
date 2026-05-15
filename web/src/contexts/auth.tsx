"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authApi, type ApiUser } from "@/lib/api";

interface AuthState {
  user: ApiUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser]   = useState<ApiUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("tcg_token");
      const u = localStorage.getItem("tcg_user");
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u));
      }
    } catch {
      // corrupted storage — ignore
    } finally {
      setLoading(false);
    }
  }, []);

  function persist(t: string, u: ApiUser) {
    localStorage.setItem("tcg_token", t);
    localStorage.setItem("tcg_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  }

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    persist(data.token, data.user);
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const { data } = await authApi.register(username, email, password);
      persist(data.token, data.user);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem("tcg_token");
    localStorage.removeItem("tcg_user");
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
