const TOKEN_KEY = "hg_resident_token";
const RESIDENT_KEY = "hg_resident_profile";

export interface ResidentInfo {
  id: number;
  anonymousUsername: string;
  preferredName: string;
  entityId: number;
  status: string;
  unitId: number | null;
}

export interface UnitInfo {
  id: number;
  unitIdentifier: string;
  label: string | null;
  floor: string | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  isUnitAssigned: boolean;
  unit: UnitInfo | null;
  resident: ResidentInfo;
}

export interface SyncResponse {
  syncedAt: string;
  resident: {
    id: number;
    anonymousUsername: string;
    preferredName: string;
    status: string;
    lastActivityAt: string | null;
  };
  lastAIMessage: {
    id: number;
    content: string;
    createdAt: string;
  } | null;
  safetyStatus: {
    current: string;
    activeScenarios: number;
    hasActiveAlert: boolean;
  };
  announcements: {
    id: number;
    senderName: string;
    message: string;
    createdAt: string;
  }[];
}

export interface StatusResponse {
  status: string;
  activeScenario: any | null;
  activeConversation: { id: number; title: string } | null;
  name: string;
}

export interface StreamEvent {
  type: "transcription" | "chunk" | "done" | "error";
  text?: string;
  isResolved?: boolean;
  conversationId?: number;
  message?: string;
}

export function getResidentToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredResident(): ResidentInfo | null {
  const raw = localStorage.getItem(RESIDENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setResidentSession(token: string, resident: ResidentInfo): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(RESIDENT_KEY, JSON.stringify(resident));
}

export function clearResidentSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(RESIDENT_KEY);
}

export function isResidentAuthenticated(): boolean {
  return !!getResidentToken();
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getResidentToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    clearResidentSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/resident/login")) {
      window.location.href = "/resident/login";
    }
  }
  return res;
}

export async function residentLogin(
  anonymousUsername: string,
  pin: string,
  entityId: number,
): Promise<LoginResponse> {
  const res = await fetch("/api/mobile/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousUsername, pin, entityId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Login failed");
  }
  const data: LoginResponse = await res.json();
  setResidentSession(data.token, data.resident);
  return data;
}

export async function residentLogout(): Promise<void> {
  try {
    await authFetch("/api/mobile/logout", { method: "POST" });
  } catch {}
  clearResidentSession();
}

export async function residentSync(entityId: number, residentId: number): Promise<SyncResponse> {
  const res = await authFetch(`/api/mobile/sync/${entityId}/${residentId}`);
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

export async function residentStatus(residentId: number): Promise<StatusResponse> {
  const res = await authFetch(`/api/mobile/resident/${residentId}/status`);
  if (!res.ok) throw new Error("Status check failed");
  return res.json();
}

export async function residentMe(): Promise<{
  resident: ResidentInfo;
  unit: UnitInfo | null;
  isPaired: boolean;
}> {
  const res = await authFetch("/api/mobile/me");
  if (!res.ok) throw new Error("Failed to load profile");
  return res.json();
}

export async function createConversation(): Promise<{ id: number }> {
  const res = await authFetch("/api/mobile/conversation", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to create conversation");
  return res.json();
}

export async function streamResponse(
  residentId: number,
  conversationId: number,
  options: { message?: string; audioBase64?: string; audioMimeType?: string; scenarioId?: number },
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const token = getResidentToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body: any = { residentId, conversationId };
  if (options.message) body.message = options.message;
  if (options.audioBase64) {
    body.audioBase64 = options.audioBase64;
    if (options.audioMimeType) {
      body.audioMimeType = options.audioMimeType;
    }
  }
  if (options.scenarioId) body.scenarioId = options.scenarioId;

  const res = await fetch("/api/mobile/respond-stream", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    clearResidentSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/resident/login")) {
      window.location.href = "/resident/login";
    }
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to send message" }));
    throw new Error(err.error || "Failed to send message");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming not supported");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {}
      }
    }
  }
  if (buffer.startsWith("data: ")) {
    try {
      const event: StreamEvent = JSON.parse(buffer.slice(6));
      onEvent(event);
    } catch {}
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
