import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { getEditionNumber, getTodayUtcDateKey } from '../../shared/constants';
import { calculateSigilScore } from '../../shared/scoring';
import { buildRedditMarkdownComment } from '../../shared/shareFormatter';
import type {
  ApiErrorResponse,
  CompletePuzzleResponse,
  LeaderboardApiResponse,
  SessionInitResponse,
  ShareCommentRequest,
  ShareCommentResponse,
} from '../../shared/types';
import { validateCompletionSubmission } from '../services/progressionRules';
import { submitUserResultDispatchComment } from '../services/redditCommunity';
import {
  getDailyCommunityPulse,
  getDailyLeaderboardSnapshot,
  getSharedCommentId,
  getUserProfile,
  getUserSealRecords,
  markSharedCommentId,
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

    const [profile, completedRecords, communityPulse, leaderboard, sharedId] =
      await Promise.all([
        getUserProfile(username),
        getUserSealRecords(username),
        getDailyCommunityPulse(dateKey),
        getDailyLeaderboardSnapshot(dateKey, username),
        getSharedCommentId(postId, username),
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
      communitySolves: communityPulse.totalSolves,
      communityPulse,
      commentSharedToday: sharedId !== null,
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

api.post('/share-comment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Missing postId in Devvit context.' },
      400
    );
  }

  const username = (await reddit.getCurrentUsername()) ?? null;
  if (!username) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Sign in to Reddit to post your seal.' },
      401
    );
  }

  // Idempotency guard: prevent duplicate score comments on the same post
  const existingId = await getSharedCommentId(postId, username);
  if (existingId) {
    return c.json<ShareCommentResponse>({
      status: 'ok',
      commentId: existingId,
      alreadyShared: true,
    });
  }

  let body: ShareCommentRequest;
  try {
    body = (await c.req.json()) as ShareCommentRequest;
  } catch {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Invalid JSON payload.' },
      400
    );
  }

  if (
    !body ||
    typeof body.sigilName !== 'string' ||
    !Number.isInteger(body.pieceCount) ||
    body.pieceCount < 6 ||
    body.pieceCount > 9 ||
    !Number.isInteger(body.moves) ||
    body.moves < body.pieceCount
  ) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Invalid share payload.' },
      400
    );
  }

  try {
    const dateKey = getTodayUtcDateKey();
    const [profile, leaderboard] = await Promise.all([
      getUserProfile(username),
      getDailyLeaderboardSnapshot(dateKey, username),
    ]);

    const score = calculateSigilScore({
      moves: body.moves,
      parMoves: Math.max(body.pieceCount, body.parMoves),
      elapsedMs: Math.max(0, body.elapsedMs),
      pieceCount: body.pieceCount,
    });

    const markdown = buildRedditMarkdownComment({
      mode: body.mode,
      edition: body.edition,
      sigilName: body.sigilName.slice(0, 80),
      pieceCount: body.pieceCount,
      moves: body.moves,
      elapsedMs: body.elapsedMs,
      score,
      streak: profile.currentStreak,
      percentile: leaderboard.percentile,
    });

    const commentId = await submitUserResultDispatchComment(postId, markdown);
    await markSharedCommentId(postId, username, commentId);

    return c.json<ShareCommentResponse>({
      status: 'ok',
      commentId,
      alreadyShared: false,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to submit comment to thread.';
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