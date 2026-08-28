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
import posthog from "posthog-js";

interface AuthState {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (username: string, email: string, password: string, over18: boolean, extra?: { birthDate?: string; acceptedTerms?: boolean }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser]   = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Backend returns role as lowercase enum ('admin','seller','buyer'); normalize to uppercase
  function normalize(u: ApiUser): ApiUser {
    return { ...u, role: u.role?.toUpperCase() as ApiUser["role"] };
  }

  function persist(t: string, u: ApiUser) {
    const normalized = normalize(u);
    localStorage.setItem("tcg_token", t);
    localStorage.setItem("tcg_user", JSON.stringify(normalized));
    localStorage.setItem("tcg_returning", "1"); // remembers that a session existed (survives logout)
    setUser(normalized);
    try {
      posthog.identify(normalized.id, {
        username: normalized.username,
        email: normalized.email,
        isVerified: normalized.isVerified,
      });
    } catch {}
  }

  const logout = useCallback(() => {
    localStorage.removeItem("tcg_token");
    localStorage.removeItem("tcg_user");
    setUser(null);
    try { posthog.reset(); } catch {}
    router.push("/login");
  }, [router]);

  // Restore session from localStorage on mount, then silently verify token
  useEffect(() => {
    let cancelled = false;
    try {
      const t = localStorage.getItem("tcg_token");
      const u = localStorage.getItem("tcg_user");
      if (t && u) {
        setUser(normalize(JSON.parse(u)));
        // Verify token is still valid in the background
        authApi.me()
          .then((r) => { if (!cancelled) setUser(normalize(r.data)); })
          .catch((err) => {
            if (!cancelled && err?.response?.status === 401) logout();
          });
      }
    } catch {
      // corrupted storage — ignore
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-verify token when tab becomes visible after being hidden
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const t = localStorage.getItem("tcg_token");
      if (!t) return;
      authApi.me()
        .then((r) => setUser(normalize(r.data)))
        .catch((err) => { if (err?.response?.status === 401) logout(); });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [logout]);

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean) => {
    const { data } = await authApi.login(email, password, rememberMe);
    persist(data.token, data.user);
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string, over18: boolean, extra?: { birthDate?: string; acceptedTerms?: boolean }) => {
      const { data } = await authApi.register(username, email, password, over18, extra);
      persist(data.token, data.user);
    },
    []
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
