import { redis } from '@devvit/web/server';
import { getEditionNumber } from '../../shared/constants';
import {
  calculateSigilScore,
  decodeLeaderboardTotalScore,
  encodeLeaderboardCompositeScore,
} from '../../shared/scoring';
import type {
  CompletePuzzleRequest,
  CompletePuzzleResponse,
  DailyLeaderboardSnapshot,
  LeaderboardRow,
  PersistedSealRecord,
} from '../../shared/types';
import {
  computeRankAndPercentile,
  EMPTY_USER_PROFILE,
  evaluateDailyStreakUpdate,
  mergeSealRecord,
  type StoredUserProfile,
} from './progressionRules';

const TOP_LEADERBOARD_LIMIT = 10;
const MAX_RETURNED_RECORDS = 60;

interface LeaderboardMemberMeta {
  readonly score: number;
  readonly moves: number;
  readonly elapsedMs: number;
  readonly isPerfect: boolean;
}

const Keys = {
  userProfile: (username: string) => `sigil:user:${username}:profile`,
  userRecords: (username: string) => `sigil:user:${username}:records`,
  dailyLeaderboardZSet: (dateKey: string) => `sigil:daily:${dateKey}:lb`,
  dailyLeaderboardMeta: (dateKey: string) => `sigil:daily:${dateKey}:lb_meta`,
  dailyAnonSolves: (dateKey: string) => `sigil:daily:${dateKey}:anon_solves`,
} as const;

function parseProfileHash(
  raw: Record<string, string> | undefined
): StoredUserProfile {
  if (!raw || Object.keys(raw).length === 0) return EMPTY_USER_PROFILE;

  return {
    currentStreak: parseInt(raw.currentStreak ?? '0', 10) || 0,
    bestStreak: parseInt(raw.bestStreak ?? '0', 10) || 0,
    lastDailyDateKey: raw.lastDailyDateKey || null,
    totalDailySolves: parseInt(raw.totalDailySolves ?? '0', 10) || 0,
    perfectCount: parseInt(raw.perfectCount ?? '0', 10) || 0,
  };
}

function serializeProfileHash(
  profile: StoredUserProfile
): Record<string, string> {
  return {
    currentStreak: String(profile.currentStreak),
    bestStreak: String(profile.bestStreak),
    lastDailyDateKey: profile.lastDailyDateKey ?? '',
    totalDailySolves: String(profile.totalDailySolves),
    perfectCount: String(profile.perfectCount),
  };
}

function safeParseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getUserProfile(
  username: string | null
): Promise<StoredUserProfile> {
  if (!username) return EMPTY_USER_PROFILE;
  const raw = await redis.hGetAll(Keys.userProfile(username));
  return parseProfileHash(raw);
}

export async function getUserSealRecords(
  username: string | null
): Promise<PersistedSealRecord[]> {
  if (!username) return [];
  const rawMap = await redis.hGetAll(Keys.userRecords(username));
  const parsed: PersistedSealRecord[] = [];

  for (const jsonStr of Object.values(rawMap)) {
    const rec = safeParseJson<PersistedSealRecord>(jsonStr);
    if (rec && rec.seed) {
      parsed.push(rec);
    }
  }

  // Sort newest / highest edition first and cap payload size cleanly
  parsed.sort((a, b) => b.completedAtIso.localeCompare(a.completedAtIso));
  return parsed.slice(0, MAX_RETURNED_RECORDS);
}

export async function getDailyCommunitySolves(dateKey: string): Promise<number> {
  const [rankedCount, anonRaw] = await Promise.all([
    redis.zCard(Keys.dailyLeaderboardZSet(dateKey)),
    redis.get(Keys.dailyAnonSolves(dateKey)),
  ]);
  const anonCount = anonRaw ? parseInt(anonRaw, 10) || 0 : 0;
  return rankedCount + anonCount;
}

/**
 * Queries Today's Top 10 Leaderboard + Personal Rank + Top Percentile in minimal Redis round-trips.
 */
export async function getDailyLeaderboardSnapshot(
  dateKey: string,
  username: string | null
): Promise<DailyLeaderboardSnapshot> {
  const edition = getEditionNumber(dateKey);
  const lbKey = Keys.dailyLeaderboardZSet(dateKey);
  const metaKey = Keys.dailyLeaderboardMeta(dateKey);

  const totalPlayers = await redis.zCard(lbKey);
  if (totalPlayers === 0) {
    return {
      dateKey,
      edition,
      totalPlayers: 0,
      entries: [],
      personalRank: null,
      percentile: null,
      personalEntry: null,
    };
  }

  // Fetch highest Top 10 from the tail of the ascending sorted set: [max(0, total - 10) .. total - 1]
  const startIdx = Math.max(0, totalPlayers - TOP_LEADERBOARD_LIMIT);
  const stopIdx = totalPlayers - 1;

  const [rawTopAscending, userAscRank, userCompositeScore] = await Promise.all([
    redis.zRange(lbKey, startIdx, stopIdx),
    username ? redis.zRank(lbKey, username) : Promise.resolve(undefined),
    username ? redis.zScore(lbKey, username) : Promise.resolve(undefined),
  ]);

  // Reverse ascending slice so #1 highest composite score comes first
  const topMembersDesc = [...rawTopAscending].reverse();

  const metaFieldsToFetch = new Set<string>(
    topMembersDesc.map((item) => item.member)
  );
  if (username && userAscRank !== undefined) {
    metaFieldsToFetch.add(username);
  }

  const metaLookup = new Map<string, LeaderboardMemberMeta>();
  if (metaFieldsToFetch.size > 0) {
    const fetchedMetas = await Promise.all(
      [...metaFieldsToFetch].map(async (member) => {
        const raw = await redis.hGet(metaKey, member);
        return [member, safeParseJson<LeaderboardMemberMeta>(raw)] as const;
      })
    );
    for (const [member, meta] of fetchedMetas) {
      if (meta) metaLookup.set(member, meta);
    }
  }

  const entries: LeaderboardRow[] = topMembersDesc.map((item, idx) => {
    const meta = metaLookup.get(item.member);
    return {
      rank: idx + 1,
      username: item.member,
      score: meta?.score ?? decodeLeaderboardTotalScore(item.score),
      moves: meta?.moves ?? 0,
      elapsedMs: meta?.elapsedMs ?? 0,
      isPerfect: meta?.isPerfect ?? false,
    };
  });

  const { personalRank, percentile } = computeRankAndPercentile(
    userAscRank,
    totalPlayers
  );

  let personalEntry: LeaderboardRow | null = null;
  if (username && personalRank !== null && userCompositeScore !== undefined) {
    const myMeta = metaLookup.get(username);
    personalEntry = {
      rank: personalRank,
      username,
      score: myMeta?.score ?? decodeLeaderboardTotalScore(userCompositeScore),
      moves: myMeta?.moves ?? 0,
      elapsedMs: myMeta?.elapsedMs ?? 0,
      isPerfect: myMeta?.isPerfect ?? false,
    };
  }

  return {
    dateKey,
    edition,
    totalPlayers,
    entries,
    personalRank,
    percentile,
    personalEntry,
  };
}

/**
 * Records a validated puzzle completion, computes authoritative server score,
 * updates Main Daily streak + first-attempt leaderboard, and persists Jade/Best seals.
 */
export async function recordPuzzleCompletion(
  username: string | null,
  submission: CompletePuzzleRequest,
  serverTodayDateKey: string
): Promise<CompletePuzzleResponse> {
  const authoritativeScore = calculateSigilScore({
    moves: submission.moves,
    parMoves: submission.parMoves,
    elapsedMs: submission.elapsedMs,
    pieceCount: submission.pieceCount,
  });

  const nowIso = new Date().toISOString();
  const incomingRecord: PersistedSealRecord = {
    seed: submission.seed,
    mode: submission.mode,
    edition: submission.edition,
    name: submission.sigilName,
    silhouettePathD: submission.silhouettePathD,
    isPerfect: authoritativeScore.isPerfect,
    bestScore: authoritativeScore.totalScore,
    bestMoves: submission.moves,
    bestElapsedMs: submission.elapsedMs,
    completedAtIso: nowIso,
  };

  // Effective daily dateKey is pinned to server UTC date when mode === 'daily'
  const effectiveDailyDateKey =
    submission.mode === 'daily' ? serverTodayDateKey : submission.dateKey;

  // Logged-out / anonymous viewer fallback
  if (!username) {
    if (submission.mode === 'daily') {
      await redis.incrBy(Keys.dailyAnonSolves(effectiveDailyDateKey), 1);
    }
    const [communitySolves, leaderboard] = await Promise.all([
      getDailyCommunitySolves(serverTodayDateKey),
      getDailyLeaderboardSnapshot(serverTodayDateKey, null),
    ]);

    return {
      status: 'ok',
      score: authoritativeScore,
      firstDailyAttemptRecorded: false,
      streak: 1,
      bestStreak: 1,
      communitySolves,
      record: incomingRecord,
      leaderboard,
    };
  }

  // Authenticated Reddit Player
  const [prevProfile, existingRecordRaw, existingDailyScore] = await Promise.all(
    [
      getUserProfile(username),
      redis.hGet(Keys.userRecords(username), submission.seed),
      submission.mode === 'daily'
        ? redis.zScore(Keys.dailyLeaderboardZSet(effectiveDailyDateKey), username)
        : Promise.resolve(undefined),
    ]
  );

  const existingRecord = safeParseJson<PersistedSealRecord>(existingRecordRaw);
  const { merged, newlyEarnedPerfect } = mergeSealRecord(
    existingRecord,
    incomingRecord
  );

  const { nextProfile } = evaluateDailyStreakUpdate(
    prevProfile,
    submission.mode,
    effectiveDailyDateKey,
    newlyEarnedPerfect
  );

  let firstDailyAttemptRecorded = false;

  // First-Attempt Competitive Integrity: Only write Main Daily Leaderboard on first solve of the day!
  const writeOps: Promise<unknown>[] = [
    redis.hSet(Keys.userProfile(username), serializeProfileHash(nextProfile)),
    redis.hSet(Keys.userRecords(username), {
      [submission.seed]: JSON.stringify(merged),
    }),
  ];

  if (submission.mode === 'daily' && existingDailyScore === undefined) {
    firstDailyAttemptRecorded = true;
    const composite = encodeLeaderboardCompositeScore(
      authoritativeScore.totalScore,
      submission.elapsedMs
    );
    const meta: LeaderboardMemberMeta = {
      score: authoritativeScore.totalScore,
      moves: submission.moves,
      elapsedMs: submission.elapsedMs,
      isPerfect: authoritativeScore.isPerfect,
    };

    writeOps.push(
      redis.zAdd(Keys.dailyLeaderboardZSet(effectiveDailyDateKey), {
        member: username,
        score: composite,
      }),
      redis.hSet(Keys.dailyLeaderboardMeta(effectiveDailyDateKey), {
        [username]: JSON.stringify(meta),
      })
    );
  }

  await Promise.all(writeOps);

  const [communitySolves, leaderboard] = await Promise.all([
    getDailyCommunitySolves(serverTodayDateKey),
    getDailyLeaderboardSnapshot(serverTodayDateKey, username),
  ]);

  return {
    status: 'ok',
    score: authoritativeScore,
    firstDailyAttemptRecorded,
    streak: nextProfile.currentStreak,
    bestStreak: nextProfile.bestStreak,
    communitySolves,
    record: merged,
    leaderboard,
  };
}