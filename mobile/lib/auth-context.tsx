import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from './api';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  resident: api.ResidentInfo | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, pin: string, entityId: number) => Promise<api.LoginResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  resident: null,
  login: async () => ({ token: '', expiresAt: '', isUnitAssigned: false, unit: null, resident: { id: 0, anonymousUsername: '', preferredName: '', entityId: 0, status: 'safe', unitId: null } }),
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

  const loginFn = useCallback(async (username: string, pin: string, entityId: number): Promise<api.LoginResponse> => {
    const result = await api.login(username, pin, entityId);
    setState({ isLoading: false, isAuthenticated: true, resident: result.resident });
    return result;
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
