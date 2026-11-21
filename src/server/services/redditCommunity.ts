import { context, reddit, redis } from '@devvit/web/server';
import { getTodayUtcDateKey } from '../../shared/constants';
import { resolveDailyPostSummary } from '../../shared/dailyMeta';

type RedditCommentOrPostId = `t1_${string}` | `t3_${string}`;

const LEDGER_COMMENT_KEY = (postId: string) =>
  `sigil:post:${postId}:ledger_comment`;
const DAILY_PUBLISHED_KEY = (subreddit: string, dateKey: string) =>
  `sigil:post:published:${subreddit}:${dateKey}`;

function asPostFullname(rawId: string): `t3_${string}` {
  return rawId.startsWith('t3_')
    ? (rawId as `t3_${string}`)
    : (`t3_${rawId}` as `t3_${string}`);
}

function asCommentFullname(rawId: string): `t1_${string}` {
  return rawId.startsWith('t1_')
    ? (rawId as `t1_${string}`)
    : (`t1_${rawId}` as `t1_${string}`);
}

/**
 * Ensures a single pinned "Daily Ritual Ledger" root comment exists on `postId`
 * so player score dispatches group cleanly as replies (per Reddit User Actions policy).
 */
export async function ensurePostLedgerComment(
  postId: string,
  editionLabel?: string
): Promise<RedditCommentOrPostId> {
  const normalizedPostId = asPostFullname(postId);
  const existingCommentId = await redis.get(
    LEDGER_COMMENT_KEY(normalizedPostId)
  );
  if (existingCommentId) {
    return asCommentFullname(existingCommentId);
  }

  try {
    const header = editionLabel
      ? `**${editionLabel} — Daily Ritual Ledger**`
      : '**SIGIL — Daily Ritual Ledger**';

    const rootComment = await reddit.submitComment({
      id: normalizedPostId,
      text: `${header}  \nInscribe your spoiler-free reconstruction seals below, or discuss today’s geometry in the main thread.`,
      runAs: 'APP',
    });

    try {
      await rootComment.distinguish(true);
    } catch {
      // Distinguish/sticky requires moderator permission; safe to continue if unavailable
    }

    await redis.set(LEDGER_COMMENT_KEY(normalizedPostId), rootComment.id);
    return asCommentFullname(rootComment.id);
  } catch {
    return normalizedPostId;
  }
}

/**
 * Submits a spoiler-free Markdown result comment on behalf of the authenticated user.
 */
export async function submitUserResultDispatchComment(
  postId: string,
  markdownText: string
): Promise<string> {
  const targetParentId = await ensurePostLedgerComment(postId);

  const comment = await reddit.submitComment({
    id: targetParentId,
    text: markdownText,
    runAs: 'USER',
  });

  return comment.id;
}

/**
 * Publishes Today's Calibrated Daily Sigil Custom Post with strict once-per-UTC-day idempotency
 * unless `force === true` (e.g., manual moderator menu click).
 */
export async function publishDailySigilPost(options?: {
  force?: boolean;
}): Promise<{
  publishOutcome: 'published' | 'skipped_existing';
  postId: string;
  dateKey: string;
  title: string;
}> {
  const subredditName = context.subredditName;
  if (!subredditName) {
    throw new Error('Missing subredditName in Devvit context.');
  }

  const dateKey = getTodayUtcDateKey();
  const summary = resolveDailyPostSummary(dateKey);

  const lockKey = DAILY_PUBLISHED_KEY(subredditName, dateKey);
  if (!options?.force) {
    const alreadyPostId = await redis.get(lockKey);
    if (alreadyPostId) {
      return {
        publishOutcome: 'skipped_existing',
        postId: alreadyPostId,
        dateKey,
        title: summary.postTitle,
      };
    }
  }

  const post = await reddit.submitCustomPost({
    subredditName,
    title: summary.postTitle,
    entry: 'default',
  });

  await redis.set(lockKey, post.id);
  await ensurePostLedgerComment(
    post.id,
    `SIGIL ${summary.editionTag} (${summary.sigilName})`
  );

  return {
    publishOutcome: 'published',
    postId: post.id,
    dateKey,
    title: summary.postTitle,
  };
}