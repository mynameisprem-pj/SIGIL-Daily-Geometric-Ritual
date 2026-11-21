import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { getEditionNumber, getTodayUtcDateKey } from '../../shared/constants';
import type {
  ApiErrorResponse,
  CompletePuzzleResponse,
  LeaderboardApiResponse,
  SessionInitResponse,
} from '../../shared/types';
import { validateCompletionSubmission } from '../services/progressionRules';
import {
  getDailyCommunitySolves,
  getDailyLeaderboardSnapshot,
  getUserProfile,
  getUserSealRecords,
  recordPuzzleCompletion,
} from '../services/sigilStore';

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
    const username = (await reddit.getCurrentUsername()) ?? null;

    const [profile, completedRecords, communitySolves, leaderboard] =
      await Promise.all([
        getUserProfile(username),
        getUserSealRecords(username),
        getDailyCommunitySolves(dateKey),
        getDailyLeaderboardSnapshot(dateKey, username),
      ]);

    const dailyCompleted =
      profile.lastDailyDateKey === dateKey ||
      leaderboard.personalRank !== null;

    return c.json<SessionInitResponse>({
      status: 'ok',
      postId,
      username: username ?? 'wanderer',
      isAuthenticated: username !== null,
      dateKey,
      edition,
      communitySolves,
      streak: profile.currentStreak,
      bestStreak: profile.bestStreak,
      dailyCompleted,
      personalRank: leaderboard.personalRank,
      percentile: leaderboard.percentile,
      completedRecords,
      leaderboard,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to initialize session.';
    return c.json<ApiErrorResponse>({ status: 'error', message }, 500);
  }
});

api.post('/complete', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Missing postId in Devvit context.' },
      400
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Malformed JSON body.' },
      400
    );
  }

  const validated = validateCompletionSubmission(body);
  if (!validated.ok) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: validated.error },
      400
    );
  }

  try {
    const serverTodayDateKey = getTodayUtcDateKey();
    const username = (await reddit.getCurrentUsername()) ?? null;

    const result = await recordPuzzleCompletion(
      username,
      validated.value,
      serverTodayDateKey
    );

    return c.json<CompletePuzzleResponse>(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to record completion.';
    return c.json<ApiErrorResponse>({ status: 'error', message }, 500);
  }
});

api.get('/leaderboard', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Missing postId in Devvit context.' },
      400
    );
  }

  try {
    const requestedDate = c.req.query('dateKey');
    const dateKey =
      requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : getTodayUtcDateKey();

    const username = (await reddit.getCurrentUsername()) ?? null;
    const leaderboard = await getDailyLeaderboardSnapshot(dateKey, username);

    return c.json<LeaderboardApiResponse>({
      status: 'ok',
      leaderboard,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load leaderboard.';
    return c.json<ApiErrorResponse>({ status: 'error', message }, 500);
  }
});