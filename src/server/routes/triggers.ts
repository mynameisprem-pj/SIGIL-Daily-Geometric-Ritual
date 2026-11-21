import { Hono } from 'hono';
import { publishDailySigilPost } from '../services/redditCommunity';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const result = await publishDailySigilPost({ force: false });
    return c.json({ status: 'ok', ...result }, 200);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Initial Sigil post setup failed';
    return c.json({ status: 'error', message }, 400);
  }
});