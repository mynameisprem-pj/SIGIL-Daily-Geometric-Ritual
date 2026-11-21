import { reddit } from '@devvit/web/server';
import { getEditionNumber, getTodayUtcDateKey } from '../../shared/constants';

export const createPost = async () => {
  const dateKey = getTodayUtcDateKey();
  const edition = getEditionNumber(dateKey);

  return await reddit.submitCustomPost({
    title: `Sigil #${edition} — Daily Geometric Reconstruction (${dateKey})`,
  });
};