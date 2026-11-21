import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { publishDailySigilPost } from '../services/redditCommunity';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const { postId } = await publishDailySigilPost({ force: true });
    const subredditName = context.subredditName;

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${subredditName}/comments/${postId}`,
      },
      200
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create Sigil post';
    return c.json<UiResponse>(
      {
        showToast: message,
      },
      400
    );
  }
});