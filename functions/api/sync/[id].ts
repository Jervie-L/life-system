interface Env {
  LIFE_SYNC: KVNamespace;
}

type SyncBody = {
  updatedAt: number;
  payload: {
    iv: string;
    ciphertext: string;
  };
};

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  if (!validId(params.id)) return json({ error: 'Invalid sync id' }, 400);
  const value = await env.LIFE_SYNC.get(`sync:${params.id}`);
  return value ? new Response(value, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) : json({ error: 'Not found' }, 404);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  if (!validId(params.id)) return json({ error: 'Invalid sync id' }, 400);
  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: 'Payload too large' }, 413);
  const body = JSON.parse(raw) as SyncBody;
  if (!Number.isFinite(body.updatedAt) || typeof body.payload?.iv !== 'string' || typeof body.payload?.ciphertext !== 'string') {
    return json({ error: 'Invalid payload' }, 400);
  }
  const key = `sync:${params.id}`;
  const existing = await env.LIFE_SYNC.get(key, 'json') as SyncBody | null;
  if (!existing || body.updatedAt >= existing.updatedAt) {
    await env.LIFE_SYNC.put(key, JSON.stringify(body));
  }
  return json({ ok: true });
};
