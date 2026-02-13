import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface MobileUser {
  id: number;
  anonymousUsername: string;
  preferredName: string;
  entityId: number;
  status: string;
}

interface MobileAuthState {
  token: string | null;
  user: MobileUser | null;
  isLoading: boolean;
  error: string | null;
  login: (anonymousUsername: string, pin: string, entityId: number) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const MobileAuthContext = createContext<MobileAuthState | null>(null);

const STORAGE_KEY = "echopath_mobile_token";
const USER_KEY = "echopath_mobile_user";

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (anonymousUsername: string, pin: string, entityId: number): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mobile/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousUsername, pin, entityId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        setIsLoading(false);
        return false;
      }

      const data = await res.json();
      setToken(data.token);
      setUser(data.resident);
      localStorage.setItem(STORAGE_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.resident));
      setIsLoading(false);
      return true;
    } catch {
      setError("Unable to connect. Please try again.");
      setIsLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch("/api/mobile/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
  }, [token]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <MobileAuthContext.Provider value={{ token, user, isLoading, error, login, logout, clearError }}>
      {children}
    </MobileAuthContext.Provider>
  );
}

export function useMobileAuth() {
  const ctx = useContext(MobileAuthContext);
  if (!ctx) throw new Error("useMobileAuth must be used within MobileAuthProvider");
  return ctx;
}
