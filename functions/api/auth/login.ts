import { createSession, hashPassword, json, normalizeUsername, readAccount, validPassword, validUsername, type Env } from './_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json() as { username?: unknown; password?: unknown };
  const username = normalizeUsername(body.username);
  if (!validUsername(username) || !validPassword(body.password)) return json({ error: '账号或密码错误' }, 401);
  const account = await readAccount(env, username);
  if (!account || await hashPassword(body.password, account.salt) !== account.passwordHash) return json({ error: '账号或密码错误' }, 401);
  return json({ username, token: await createSession(env, username) });
};
