import { Hono } from 'hono';
import { publishDailySigilPost } from '../services/redditCommunity';

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/daily-post', async (c) => {
  try {
    const result = await publishDailySigilPost({ force: false });
    return c.json({ status: 'ok', ...result }, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Daily cron post failed.';
    return c.json({ status: 'error', message }, 500);
  }
});