import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getStoredCompanyToken } from "@/lib/company-token";

const CO_TOKEN_KEY = "co_token";
const CO_USER_KEY = "co_user";
const CO_ENTITY_KEY = "co_entity";

function clearCompanySession() {
  localStorage.removeItem(CO_TOKEN_KEY);
  localStorage.removeItem(CO_USER_KEY);
  localStorage.removeItem(CO_ENTITY_KEY);
  window.location.href = "/login";
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredCompanyToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (res.status === 401 && getStoredCompanyToken()) {
    clearCompanySession();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
