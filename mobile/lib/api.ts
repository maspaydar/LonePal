import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const TOKEN_KEY = 'echopath_token';
const RESIDENT_KEY = 'echopath_resident';
const SERVER_URL_KEY = 'echopath_server_url';

const CONFIG_SERVER_URL: string =
  Constants.expoConfig?.extra?.serverUrl ?? 'http://localhost:5000';

let BASE_URL = CONFIG_SERVER_URL;

export async function initBaseUrl(): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(SERVER_URL_KEY);
    if (stored) {
      BASE_URL = stored;
    } else {
      BASE_URL = CONFIG_SERVER_URL;
    }
  } catch {}
}

export async function setBaseUrl(url: string): Promise<void> {
  BASE_URL = url.replace(/\/$/, '');
  try {
    await SecureStore.setItemAsync(SERVER_URL_KEY, BASE_URL);
  } catch {}
}

export function getBaseUrl() {
  return BASE_URL;
}

export interface ResidentInfo {
  id: number;
  anonymousUsername: string;
  preferredName: string;
  entityId: number;
  status: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
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

export interface ChatResponse {
  response: string;
  isResolved: boolean;
  conversationId: number;
}

export interface StatusResponse {
  status: string;
  activeScenario: any | null;
  activeConversation: { id: number; title: string } | null;
  name: string;
}

export interface StreamEvent {
  type: 'transcription' | 'chunk' | 'done' | 'error';
  text?: string;
  isResolved?: boolean;
  conversationId?: number;
  message?: string;
}

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(RESIDENT_KEY);
}

export async function getStoredResident(): Promise<ResidentInfo | null> {
  try {
    const data = await SecureStore.getItemAsync(RESIDENT_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function setStoredResident(resident: ResidentInfo): Promise<void> {
  await SecureStore.setItemAsync(RESIDENT_KEY, JSON.stringify(resident));
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${BASE_URL}${path}`, { ...options, headers });
}

export async function login(anonymousUsername: string, pin: string, entityId: number): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/api/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonymousUsername, pin, entityId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Login failed');
  }
  const data: LoginResponse = await res.json();
  await setToken(data.token);
  await setStoredResident(data.resident);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await authFetch('/api/mobile/logout', { method: 'POST' });
  } catch {}
  await clearToken();
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function syncData(entityId: number, userId: number): Promise<SyncResponse> {
  const res = await authFetch(`/api/mobile/sync/${entityId}/${userId}`);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await clearToken();
      throw new Error('SESSION_EXPIRED');
    }
    throw new Error('Sync failed');
  }
  return res.json();
}

export async function getResidentStatus(residentId: number): Promise<StatusResponse> {
  const res = await authFetch(`/api/mobile/resident/${residentId}/status`);
  if (!res.ok) throw new Error('Status check failed');
  return res.json();
}

export async function sendMessage(residentId: number, conversationId: number, message: string, scenarioId?: number): Promise<ChatResponse> {
  const res = await authFetch('/api/mobile/respond', {
    method: 'POST',
    body: JSON.stringify({ residentId, conversationId, message, scenarioId }),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function sendVoiceMessage(
  residentId: number,
  conversationId: number,
  options: { message?: string; audioBase64?: string; audioMimeType?: string },
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body: any = { residentId, conversationId };
  if (options.message) body.message = options.message;
  if (options.audioBase64) {
    body.audioBase64 = options.audioBase64;
    body.audioMimeType = options.audioMimeType || 'audio/m4a';
  }

  const res = await fetch(`${BASE_URL}/api/mobile/respond-stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to send message' }));
    throw new Error(err.error || 'Failed to send message');
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Streaming not supported');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {}
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    try {
      const event: StreamEvent = JSON.parse(buffer.slice(6));
      onEvent(event);
    } catch {}
  }
}

export async function getProfile(): Promise<any> {
  const res = await authFetch('/api/mobile/profile');
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function getMe(): Promise<any> {
  const res = await authFetch('/api/mobile/me');
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function createConversation(): Promise<{ id: number }> {
  const res = await authFetch('/api/mobile/conversation', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}
