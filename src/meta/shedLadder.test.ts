import { describe, expect, it } from 'vitest';
import { SHED_LADDER } from './shedLadder';

/**
 * Pinning the ORDER and the wording exactly (2026-08-26), extracted out of
 * `main.ts`'s storage-full retry loop — POLISH.md named this ladder as one
 * of the next pieces to pull out and test, after the data-loss cluster it
 * survived (STATUS.md, "the shed ladder never touches the world being
 * played and each rung says what it took"). A reorder here is exactly the
 * class of bug that corrupted a world once already (2026-08-20): rung 2 used
 * to shed the active world's own key and leave its run behind.
 */

describe('SHED_LADDER', () => {
  it('sheds cheapest and least missed first, and never the active world', () => {
    expect(SHED_LADDER.map((r) => r.id)).toEqual([
      'lastError',
      'otherReceipts',
      'timeline',
      'otherWorlds',
    ]);
  });

  it('gives every rung its own honest sentence — none share text, none are empty', () => {
    const notes = SHED_LADDER.map((r) => r.note);
    expect(new Set(notes).size).toBe(notes.length);
    for (const note of notes) {
      expect(note.length).toBeGreaterThan(0);
      expect(note).toMatch(/^Storage was full/);
    }
  });

  it('is honest about the diary rung: it says what was cleared, not "some history"', () => {
    const timeline = SHED_LADDER.find((r) => r.id === 'timeline');
    expect(timeline?.note).toContain('diary');
    expect(timeline?.note).toContain('relics and perks are untouched');
  });

  it('is honest about the world rung: only the OTHER worlds, never the one in play', () => {
    const otherWorlds = SHED_LADDER.find((r) => r.id === 'otherWorlds');
    expect(otherWorlds?.note).toContain('OTHER worlds');
    expect(otherWorlds?.note).toContain('world you are in is untouched');
  });
});
