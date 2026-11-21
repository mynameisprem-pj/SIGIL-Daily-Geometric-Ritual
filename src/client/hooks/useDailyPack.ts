import { useCallback, useMemo, useState } from 'react';
import { getTodayUtcDateKey } from '../../shared/constants';
import type {
  DailySigilPack,
  GameMode,
  ScheduledPuzzleEntry,
} from '../../shared/types';
import {
  buildDailySigilPack,
  buildPracticeEntryByEdition,
  buildZenEntry,
} from '../engine/dailyPack';

export interface UseDailyPackResult {
  readonly pack: DailySigilPack;
  readonly activeMode: GameMode;
  readonly activeEntry: ScheduledPuzzleEntry;
  readonly practiceEdition: number;
  readonly zenIndex: number;
  selectMode: (mode: GameMode) => void;
  selectPracticeEdition: (edition: number) => void;
  advanceZen: () => void;
}

export function useDailyPack(
  sessionDateKey: string | undefined,
  username: string | undefined
): UseDailyPackResult {
  const dateKey = sessionDateKey ?? getTodayUtcDateKey();
  const userSalt = username ?? 'wanderer';

  const pack = useMemo(() => buildDailySigilPack(dateKey), [dateKey]);

  const [activeMode, setActiveMode] = useState<GameMode>('daily');
  const [practiceEdition, setPracticeEdition] = useState<number>(() =>
    Math.max(1, pack.edition - 1)
  );
  const [zenIndex, setZenIndex] = useState<number>(1);

  const activeEntry = useMemo<ScheduledPuzzleEntry>(() => {
    switch (activeMode) {
      case 'daily':
        return pack.main;
      case 'bonus-1':
        return pack.bonus1;
      case 'bonus-2':
        return pack.bonus2;
      case 'practice':
        return buildPracticeEntryByEdition(practiceEdition);
      case 'zen':
        return buildZenEntry(zenIndex, userSalt);
    }
  }, [activeMode, pack, practiceEdition, userSalt, zenIndex]);

  const selectMode = useCallback((mode: GameMode) => {
    setActiveMode(mode);
  }, []);

  const selectPracticeEdition = useCallback((edition: number) => {
    setPracticeEdition(Math.max(1, edition));
    setActiveMode('practice');
  }, []);

  const advanceZen = useCallback(() => {
    setZenIndex((idx) => idx + 1);
    setActiveMode('zen');
  }, []);

  return {
    pack,
    activeMode,
    activeEntry,
    practiceEdition,
    zenIndex,
    selectMode,
    selectPracticeEdition,
    advanceZen,
  };
}