import { exportNativeData, importNativeData } from './nativeApi';

const SYNC_CODE_KEY = 'life-system-sync-code-v1';
const SYNC_STATUS_EVENT = 'life-system-sync-status';
const syncApiUrl = (import.meta.env.VITE_SYNC_API_URL || '/api/sync').replace(/\/+$/, '');

type SyncStatus = {
  enabled: boolean;
  state: 'disabled' | 'idle' | 'syncing' | 'success' | 'error';
  message: string;
  lastSyncedAt?: number;
};

type EncryptedPayload = {
  iv: string;
  ciphertext: string;
};

let status: SyncStatus = { enabled: false, state: 'disabled', message: '尚未开启同步' };
let initialized = false;
let pushTimer: number | undefined;
let refreshCallback: (() => void) | undefined;

function emit(next: SyncStatus): void {
  status = next;
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: status }));
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

async function syncId(code: string): Promise<string> {
  return [...await digest(`life-system-sync-id:${code}`)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function cryptoKey(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await digest(`life-system-encryption:${code}`) as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(code: string, value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await cryptoKey(code), plaintext as BufferSource));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decrypt<T>(code: string, payload: EncryptedPayload): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv) as BufferSource }, await cryptoKey(code), base64ToBytes(payload.ciphertext) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function remoteRequest(code: string, init?: RequestInit): Promise<Response> {
  return fetch(`${syncApiUrl}/${await syncId(code)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
}

export function getSyncCode(): string {
  return localStorage.getItem(SYNC_CODE_KEY) || '';
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').match(/.{1,6}/g)!.join('-');
}

export function setSyncCode(value: string): void {
  const code = value.trim();
  if (code) {
    localStorage.setItem(SYNC_CODE_KEY, code);
    emit({ enabled: true, state: 'idle', message: '同步码已保存，等待同步' });
  } else {
    localStorage.removeItem(SYNC_CODE_KEY);
    emit({ enabled: false, state: 'disabled', message: '尚未开启同步' });
  }
}

export function clearSyncCode(): void {
  setSyncCode('');
}

export async function syncNow(options: { preferRemote?: boolean } = {}): Promise<void> {
  const code = getSyncCode();
  if (!code) {
    emit({ enabled: false, state: 'disabled', message: '请先保存同步码' });
    return;
  }
  emit({ enabled: true, state: 'syncing', message: '正在同步...' });
  try {
    const local = exportNativeData();
    const response = await remoteRequest(code);
    if (response.status === 404) {
      await pushSnapshot(code, local);
      return;
    }
    if (!response.ok) throw new Error(`同步服务返回 ${response.status}`);
    const remote = await response.json() as { updatedAt: number; payload: EncryptedPayload };
    if (options.preferRemote || remote.updatedAt > local.updatedAt) {
      importNativeData(await decrypt(code, remote.payload));
      refreshCallback?.();
      emit({ enabled: true, state: 'success', message: '已从云端更新本机数据', lastSyncedAt: Date.now() });
    } else if (local.updatedAt > remote.updatedAt) {
      await pushSnapshot(code, local);
    } else {
      emit({ enabled: true, state: 'success', message: '数据已是最新', lastSyncedAt: Date.now() });
    }
  } catch (error) {
    emit({ enabled: true, state: 'error', message: error instanceof Error ? error.message : '同步失败，请稍后重试' });
  }
}

async function pushSnapshot(code: string, snapshot = exportNativeData()): Promise<void> {
  const response = await remoteRequest(code, {
    method: 'PUT',
    body: JSON.stringify({ updatedAt: snapshot.updatedAt, payload: await encrypt(code, snapshot) }),
  });
  if (!response.ok) throw new Error(`同步服务返回 ${response.status}`);
  emit({ enabled: true, state: 'success', message: '已同步到云端', lastSyncedAt: Date.now() });
}

function schedulePush(): void {
  if (!getSyncCode()) return;
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
  const code = getSyncCode();
  emit(code ? { enabled: true, state: 'idle', message: '自动同步已开启' } : { enabled: false, state: 'disabled', message: '尚未开启同步' });
  if (code) syncNow();
  return () => {
    refreshCallback = undefined;
  };
}

export { SYNC_STATUS_EVENT };
