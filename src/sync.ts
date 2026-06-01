import { exportNativeData, importNativeData } from './nativeApi';

const SYNC_SESSION_KEY = 'life-system-sync-session-v2';
const SYNC_STATUS_EVENT = 'life-system-sync-status';
const syncApiUrl = (import.meta.env.VITE_SYNC_API_URL || '/api').replace(/\/+$/, '');

export type SyncStatus = {
  enabled: boolean;
  state: 'disabled' | 'idle' | 'syncing' | 'success' | 'error';
  message: string;
  username?: string;
  lastSyncedAt?: number;
};

type Session = {
  username: string;
  token: string;
  encryptionKey: string;
};

type EncryptedPayload = {
  iv: string;
  ciphertext: string;
};

let status: SyncStatus = { enabled: false, state: 'disabled', message: '尚未登录同步账号' };
let initialized = false;
let pushTimer: number | undefined;
let refreshCallback: (() => void) | undefined;

function emit(next: SyncStatus): void {
  status = next;
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: status }));
}

function readSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SYNC_SESSION_KEY) || 'null') as Session | null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null): void {
  if (session) localStorage.setItem(SYNC_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SYNC_SESSION_KEY);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function cryptoKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await digest(`life-system-account-encryption:${value}`) as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(value: string, snapshot: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await cryptoKey(value), plaintext as BufferSource));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decrypt<T>(value: string, payload: EncryptedPayload): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv) as BufferSource }, await cryptoKey(value), base64ToBytes(payload.ciphertext) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const session = readSession();
  return fetch(`${syncApiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

async function accountRequest(path: string, username: string, password: string): Promise<void> {
  emit({ enabled: false, state: 'syncing', message: path === '/auth/register' ? '正在创建账号...' : '正在登录...' });
  try {
    const response = await fetch(`${syncApiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json() as { username?: string; token?: string; error?: string };
    if (!response.ok || !body.username || !body.token) throw new Error(body.error || '账号操作失败');
    writeSession({ username: body.username, token: body.token, encryptionKey: `${body.username}:${password}` });
    emit({ enabled: true, state: 'idle', message: '账号已登录，正在同步', username: body.username });
    await syncNow({ preferRemote: path === '/auth/login' });
  } catch (error) {
    emit({ enabled: false, state: 'error', message: error instanceof Error ? error.message : '账号操作失败' });
    throw error;
  }
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getSyncUsername(): string {
  return readSession()?.username || '';
}

export function isSyncLoggedIn(): boolean {
  return Boolean(readSession());
}

export async function registerSyncAccount(username: string, password: string): Promise<void> {
  await accountRequest('/auth/register', username.trim().toLowerCase(), password);
}

export async function loginSyncAccount(username: string, password: string): Promise<void> {
  await accountRequest('/auth/login', username.trim().toLowerCase(), password);
}

export async function logoutSyncAccount(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    writeSession(null);
    emit({ enabled: false, state: 'disabled', message: '已退出同步账号' });
  }
}

export async function syncNow(options: { preferRemote?: boolean } = {}): Promise<void> {
  const session = readSession();
  if (!session) {
    emit({ enabled: false, state: 'disabled', message: '请先登录同步账号' });
    return;
  }
  emit({ enabled: true, state: 'syncing', message: '正在同步...', username: session.username });
  try {
    const local = exportNativeData();
    const response = await request('/account-sync');
    if (response.status === 401) throw new Error('登录已过期，请重新登录');
    if (response.status === 204) {
      await pushSnapshot(session, local);
      return;
    }
    if (!response.ok) throw new Error(`同步服务返回 ${response.status}`);
    const remote = await response.json() as { updatedAt: number; payload: EncryptedPayload };
    if (options.preferRemote || remote.updatedAt > local.updatedAt) {
      importNativeData(await decrypt(session.encryptionKey, remote.payload));
      refreshCallback?.();
      emit({ enabled: true, state: 'success', message: '已从云端更新本机数据', username: session.username, lastSyncedAt: Date.now() });
    } else if (local.updatedAt > remote.updatedAt) {
      await pushSnapshot(session, local);
    } else {
      emit({ enabled: true, state: 'success', message: '数据已是最新', username: session.username, lastSyncedAt: Date.now() });
    }
  } catch (error) {
    emit({ enabled: true, state: 'error', message: error instanceof Error ? error.message : '同步失败，请稍后重试', username: session.username });
  }
}

async function pushSnapshot(session: Session, snapshot = exportNativeData()): Promise<void> {
  const response = await request('/account-sync', {
    method: 'PUT',
    body: JSON.stringify({ updatedAt: snapshot.updatedAt, payload: await encrypt(session.encryptionKey, snapshot) }),
  });
  if (response.status === 401) throw new Error('登录已过期，请重新登录');
  if (!response.ok) throw new Error(`同步服务返回 ${response.status}`);
  emit({ enabled: true, state: 'success', message: '已同步到云端', username: session.username, lastSyncedAt: Date.now() });
}

function schedulePush(): void {
  if (!readSession()) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => syncNow(), 700);
}

export function initializeDataSync(onRemoteUpdate: () => void): () => void {
  refreshCallback = onRemoteUpdate;
  if (!initialized) {
    initialized = true;
    window.addEventListener('life-system-data-changed', (event) => {
      if ((event as CustomEvent).detail?.source === 'local') schedulePush();
    });
    window.addEventListener('focus', () => syncNow());
    window.setInterval(() => syncNow(), 60_000);
  }
  const session = readSession();
  emit(session ? { enabled: true, state: 'idle', message: '自动同步已开启', username: session.username } : { enabled: false, state: 'disabled', message: '尚未登录同步账号' });
  if (session) syncNow();
  return () => {
    refreshCallback = undefined;
  };
}

export { SYNC_STATUS_EVENT };
