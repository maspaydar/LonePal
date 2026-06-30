import { useLocation } from "wouter";

const SA_TOKEN_KEY = "sa_token";
const SA_ADMIN_KEY = "sa_admin";

export function getSuperAdminToken(): string {
  return localStorage.getItem(SA_TOKEN_KEY) || "";
}

export function getSuperAdminAuthHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getSuperAdminToken()}`,
  };
}

export function useSuperAdminAuth() {
  const [, setLocation] = useLocation();

  function getToken(): string {
    return localStorage.getItem(SA_TOKEN_KEY) || "";
  }

  function getAdmin(): Record<string, any> {
    try {
      return JSON.parse(localStorage.getItem(SA_ADMIN_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    };
  }

  function setSession(token: string, admin: Record<string, any>) {
    localStorage.setItem(SA_TOKEN_KEY, token);
    localStorage.setItem(SA_ADMIN_KEY, JSON.stringify(admin));
  }

  function logout() {
    localStorage.removeItem(SA_TOKEN_KEY);
    localStorage.removeItem(SA_ADMIN_KEY);
    setLocation("/super-admin/login");
  }

  function isAuthenticated(): boolean {
    return Boolean(localStorage.getItem(SA_TOKEN_KEY));
  }

  return { getToken, getAdmin, authHeaders, setSession, logout, isAuthenticated };
}
