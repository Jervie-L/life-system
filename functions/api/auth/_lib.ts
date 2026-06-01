export interface Env {
  LIFE_SYNC: KVNamespace;
}

type Account = {
  username: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
};

const encoder = new TextEncoder();

export const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

export const normalizeUsername = (value: unknown) => String(value ?? '').trim().toLowerCase();

export const validUsername = (value: string) => /^[a-z0-9][a-z0-9_-]{2,31}$/.test(value);

export const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 8 && value.length <= 128;

const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const randomBase64 = (length: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let value = '';
  bytes.forEach((byte) => value += String.fromCharCode(byte));
  return btoa(value);
};

const sha256Hex = async (value: string) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));

export const accountKey = async (username: string) => `account:${await sha256Hex(username)}`;

export const hashPassword = async (password: string, salt: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return bytesToHex(new Uint8Array(bits));
};

export const createSession = async (env: Env, username: string) => {
  const token = randomBase64(32).replace(/[+/=]/g, '');
  await env.LIFE_SYNC.put(`session:${token}`, username, { expirationTtl: 60 * 60 * 24 * 30 });
  return token;
};

export const readAccount = async (env: Env, username: string) => env.LIFE_SYNC.get(await accountKey(username), 'json') as Promise<Account | null>;

export const writeAccount = async (env: Env, account: Account) => env.LIFE_SYNC.put(await accountKey(account.username), JSON.stringify(account));

export const authenticatedUsername = async (env: Env, request: Request) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  return token ? env.LIFE_SYNC.get(`session:${token}`) : null;
};

export const deleteSession = async (env: Env, request: Request) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (token) await env.LIFE_SYNC.delete(`session:${token}`);
};
