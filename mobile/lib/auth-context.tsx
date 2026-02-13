import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from './api';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  resident: api.ResidentInfo | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, pin: string, entityId: number) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  resident: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    resident: null,
  });

  useEffect(() => {
    (async () => {
      await api.initBaseUrl();
      const authed = await api.isAuthenticated();
      if (authed) {
        const resident = await api.getStoredResident();
        setState({ isLoading: false, isAuthenticated: !!resident, resident });
      } else {
        setState({ isLoading: false, isAuthenticated: false, resident: null });
      }
    })();
  }, []);

  const loginFn = useCallback(async (username: string, pin: string, entityId: number) => {
    const result = await api.login(username, pin, entityId);
    setState({ isLoading: false, isAuthenticated: true, resident: result.resident });
  }, []);

  const logoutFn = useCallback(async () => {
    await api.logout();
    setState({ isLoading: false, isAuthenticated: false, resident: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login: loginFn, logout: logoutFn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
