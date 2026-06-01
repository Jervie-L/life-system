import { deleteSession, json, type Env } from './_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  await deleteSession(env, request);
  return json({ ok: true });
};
