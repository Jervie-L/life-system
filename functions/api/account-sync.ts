import { accountKey, authenticatedUsername, json, type Env } from './auth/_lib';

type SyncBody = {
  updatedAt: number;
  payload: {
    iv: string;
    ciphertext: string;
  };
};

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const username = await authenticatedUsername(env, request);
  if (!username) return json({ error: 'Unauthorized' }, 401);
  const value = await env.LIFE_SYNC.get(`account-sync:${await accountKey(username)}`);
  return value ? new Response(value, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) : new Response(null, { status: 204 });
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  const username = await authenticatedUsername(env, request);
  if (!username) return json({ error: 'Unauthorized' }, 401);
  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: 'Payload too large' }, 413);
  const body = JSON.parse(raw) as SyncBody;
  if (!Number.isFinite(body.updatedAt) || typeof body.payload?.iv !== 'string' || typeof body.payload?.ciphertext !== 'string') {
    return json({ error: 'Invalid payload' }, 400);
  }
  const key = `account-sync:${await accountKey(username)}`;
  const existing = await env.LIFE_SYNC.get(key, 'json') as SyncBody | null;
  if (!existing || body.updatedAt >= existing.updatedAt) await env.LIFE_SYNC.put(key, JSON.stringify(body));
  return json({ ok: true });
};
