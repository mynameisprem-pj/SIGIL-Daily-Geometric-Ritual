import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateSigilScore } from './scoring';
import {
  buildRedditMarkdownComment,
  buildShareDispatchText,
  formatPrestigeUserFlair,
} from './shareFormatter';

void describe('Spoiler-Free Share Dispatch & Reddit Community Formatters', () => {
  void it('formats a Perfect Main Daily solve with Jade Seal, Top %, and Streak', () => {
    const score = calculateSigilScore({
      moves: 13,
      parMoves: 12,
      elapsedMs: 29_400,
      pieceCount: 6,
    });

    const text = buildShareDispatchText({
      mode: 'daily',
      edition: 1,
      sigilName: 'Valkyrie Compass',
      pieceCount: 6,
      moves: 13,
      elapsedMs: 29_400,
      score,
      streak: 4,
      percentile: 5,
    });

    const lines = text.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'SIGIL #001 — Valkyrie Compass');
    assert.equal(lines[1], '◈◈◈◈◈◈ Perfect Reconstruction (Jade Seal)');
    assert.equal(lines[2], '1,100 pts · 13 moves · 00:29 · Top 5% · 4d streak');

    const md = buildRedditMarkdownComment({
      mode: 'daily',
      edition: 1,
      sigilName: 'Valkyrie Compass',
      pieceCount: 6,
      moves: 13,
      elapsedMs: 29_400,
      score,
      streak: 4,
      percentile: 5,
    });
    assert.ok(md.includes('**SIGIL #001 — Valkyrie Compass**'));
    assert.ok(md.includes('`◈◈◈◈◈◈` **Jade Seal**'));
  });

  void it('omits clock and score pressure in Zen Mode dispatches', () => {
    const score = calculateSigilScore({
      moves: 20,
      parMoves: 14,
      elapsedMs: 85_000,
      pieceCount: 7,
    });

    const text = buildShareDispatchText({
      mode: 'zen',
      edition: 3,
      sigilName: 'Solstice Loom',
      pieceCount: 7,
      moves: 20,
      elapsedMs: 85_000,
      score,
    });

    assert.ok(text.includes('SIGIL · Zen #3 — Solstice Loom'));
    assert.ok(text.includes('20 moves · Meditative Flow'));
    assert.ok(!text.includes('01:25'));
  });

  void it('formats understated prestige user flairs accurately', () => {
    assert.equal(formatPrestigeUserFlair(4, 2), '◈ Grand Lapidary · 4d');
    assert.equal(formatPrestigeUserFlair(0, 3), '◈ Jade Engraver · 3');
    assert.equal(formatPrestigeUserFlair(9, 0), '◇ Master Scribe · 9d');
    assert.equal(formatPrestigeUserFlair(1, 0), '◇ Sigil Scribe · 1d');
  });
});