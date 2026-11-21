import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import { getEditionNumber, getTodayUtcDateKey } from '../../shared/constants';
import type { ApiErrorResponse, SessionInitResponse } from '../../shared/types';

export const api = new Hono();

api.get('/session', async (c) => {
  const { postId } = context;

  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Missing postId in Devvit context.' },
      400
    );
  }

  try {
    const dateKey = getTodayUtcDateKey();
    const edition = getEditionNumber(dateKey);

    const [username, solvesRaw] = await Promise.all([
      reddit.getCurrentUsername(),
      redis.get(`sigil:daily:${dateKey}:solves`),
    ]);

    const resolvedUser = username ?? 'wanderer';
    const [streakRaw, completedRaw] = await Promise.all([
      redis.get(`sigil:user:${resolvedUser}:streak`),
      redis.get(`sigil:daily:${dateKey}:done:${resolvedUser}`),
    ]);

    return c.json<SessionInitResponse>({
      status: 'ok',
      postId,
      username: resolvedUser,
      dateKey,
      edition,
      communitySolves: solvesRaw ? parseInt(solvesRaw, 10) : 0,
      streak: streakRaw ? parseInt(streakRaw, 10) : 0,
      dailyCompleted: completedRaw === '1',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to initialize session.';
    return c.json<ApiErrorResponse>({ status: 'error', message }, 500);
  }
});