import { useCallback, useMemo, useState } from 'react';
import { getTodayUtcDateKey } from '../../shared/constants';
import type {
  DailySigilPack,
  GameMode,
  ScheduledPuzzleEntry,
} from '../../shared/types';
import {
  buildDailySigilPack,
  buildZenEntry,
  listPracticeCatalog,
  type PracticeCatalogItem,
} from '../engine/dailyPack';

export interface UseDailyPackResult {
  readonly pack: DailySigilPack;
  readonly practiceCatalog: readonly PracticeCatalogItem[];
  readonly activeMode: GameMode;
  readonly activeEntry: ScheduledPuzzleEntry;
  readonly activePracticeKey: string;
  readonly zenIndex: number;
  selectMode: (mode: GameMode) => void;
  selectPracticeItem: (key: string) => void;
  advanceZen: () => void;
}

export function useDailyPack(
  sessionDateKey: string | undefined,
  username: string | undefined
): UseDailyPackResult {
  const dateKey = sessionDateKey ?? getTodayUtcDateKey();
  const userSalt = username ?? 'wanderer';

  const pack = useMemo(() => buildDailySigilPack(dateKey), [dateKey]);
  const practiceCatalog = useMemo(
    () => listPracticeCatalog(pack.edition),
    [pack.edition]
  );

  const [activeMode, setActiveMode] = useState<GameMode>('daily');
  const [activePracticeKey, setActivePracticeKey] = useState<string>(
    () => practiceCatalog[0]?.key ?? 'prelude-1'
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
      case 'practice': {
        const match =
          practiceCatalog.find((item) => item.key === activePracticeKey) ??
          practiceCatalog[0]!;
        return match.entry;
      }
      case 'zen':
        return buildZenEntry(zenIndex, userSalt);
    }
  }, [activeMode, activePracticeKey, pack, practiceCatalog, userSalt, zenIndex]);

  const selectMode = useCallback((mode: GameMode) => {
    setActiveMode(mode);
  }, []);

  const selectPracticeItem = useCallback((key: string) => {
    setActivePracticeKey(key);
    setActiveMode('practice');
  }, []);

  const advanceZen = useCallback(() => {
    setZenIndex((idx) => idx + 1);
    setActiveMode('zen');
  }, []);

  return {
    pack,
    practiceCatalog,
    activeMode,
    activeEntry,
    activePracticeKey,
    zenIndex,
    selectMode,
    selectPracticeItem,
    advanceZen,
  };
}