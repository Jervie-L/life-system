import { accountKey, createSession, hashPassword, json, normalizeUsername, randomBase64, validPassword, validUsername, writeAccount, type Env } from './_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json() as { username?: unknown; password?: unknown };
  const username = normalizeUsername(body.username);
  if (!validUsername(username)) return json({ error: '账号需为 3-32 位字母、数字、下划线或短横线' }, 400);
  if (!validPassword(body.password)) return json({ error: '密码长度至少为 8 位' }, 400);
  if (await env.LIFE_SYNC.get(await accountKey(username))) return json({ error: '账号已存在' }, 409);
  const salt = randomBase64(16);
  await writeAccount(env, { username, salt, passwordHash: await hashPassword(body.password, salt), createdAt: Date.now() });
  return json({ username, token: await createSession(env, username) }, 201);
};
