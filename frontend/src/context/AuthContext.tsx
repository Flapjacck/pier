import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/errors";
import { setUnauthorizedHandler } from "../api/request";
import { safeNext } from "../lib/safeNext";

export type AuthStatus = "checking" | "authenticated" | "anonymous" | "unreachable";

type AuthContextValue = {
  status: AuthStatus;
  authDisabled: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function sessionFailureKind(err: unknown): "anonymous" | "unreachable" {
  if (err instanceof ApiError) {
    if (err.kind === "unauthorized") return "anonymous";
    if (err.kind === "unavailable" || err.kind === "network") return "unreachable";
  }
  return "unreachable";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [authDisabled, setAuthDisabled] = useState(false);
  const loadSession = useCallback(async (signal?: AbortSignal) => {
    setStatus("checking");
    try {
      const session = await api.getSession({ signal });
      setAuthDisabled(session.authDisabled);
      setStatus("authenticated");
    } catch (err) {
      if (signal?.aborted) return;
      setStatus(sessionFailureKind(err));
    }
  }, []);

  const retrySession = useCallback(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
  }, [loadSession]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStatus("anonymous");
      const next = safeNext(`${location.pathname}${location.search}`);
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, location.pathname, location.search]);

  const login = useCallback(async (token: string) => {
    await api.login(token);
    const session = await api.getSession({ skipAuthRedirect: true });
    setAuthDisabled(session.authDisabled);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* still clear local session */
    }
    setStatus("anonymous");
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ status, authDisabled, login, logout, retrySession }),
    [status, authDisabled, login, logout, retrySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
