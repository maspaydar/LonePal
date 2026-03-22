import { useLocation } from "wouter";

const CO_TOKEN_KEY = "co_token";
const CO_USER_KEY = "co_user";

export interface CompanyUser {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "manager" | "staff";
  entityId: number;
}

export interface CompanySession {
  token: string;
  user: CompanyUser;
  entity: { id: number; name: string; type: string };
}

export function getCompanyToken(): string {
  return localStorage.getItem(CO_TOKEN_KEY) || "";
}

export function getCompanyUser(): CompanyUser | null {
  try {
    const raw = localStorage.getItem(CO_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getCompanyEntityId(): number {
  return getCompanyUser()?.entityId ?? 1;
}

export function getCompanyAuthHeaders(): Record<string, string> {
  const token = getCompanyToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function useCompanyAuth() {
  const [, setLocation] = useLocation();

  function getToken(): string {
    return getCompanyToken();
  }

  function getUser(): CompanyUser | null {
    return getCompanyUser();
  }

  function getEntityId(): number {
    return getCompanyEntityId();
  }

  function authHeaders(): Record<string, string> {
    return getCompanyAuthHeaders();
  }

  function setSession(session: CompanySession) {
    localStorage.setItem(CO_TOKEN_KEY, session.token);
    localStorage.setItem(CO_USER_KEY, JSON.stringify({ ...session.user, entityId: session.entity?.id ?? session.user.entityId }));
  }

  function logout() {
    localStorage.removeItem(CO_TOKEN_KEY);
    localStorage.removeItem(CO_USER_KEY);
    setLocation("/login");
  }

  function isAuthenticated(): boolean {
    return Boolean(localStorage.getItem(CO_TOKEN_KEY));
  }

  return { getToken, getUser, getEntityId, authHeaders, setSession, logout, isAuthenticated };
}
