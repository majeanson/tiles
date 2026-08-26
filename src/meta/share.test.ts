import { describe, expect, it } from 'vitest';
import { shareOf } from './share';
import { DAILY_EPOCH } from './daily';

/**
 * The share line is the whole distribution mechanism — no backend, no
 * account, no store listing, just somebody pasting this into a chat. It was
 * built inline in `main.ts`'s share hook and covered by nothing.
 */

describe('a run', () => {
  it('says the score, the length, the shape, and carries only its seed', () => {
    const { text, params } = shareOf('Ashwake', {
      kind: 'run',
      points: 7795,
      placements: 166,
      seed: 1234567,
      arc: '▁▂▄▃█▅▂',
    });
    expect(text).toBe('Ashwake: 7795 pts in 166 placements · ▁▂▄▃█▅▂. Beat my run:');
    // ONLY the seed. A link built from the sender's full URL drags their own
    // overrides along — `?ff=`, `?theme=`, `?hex=`, `?camp=` — and an
    // arriving `?ff=` is persisted, so a stale override would install itself
    // on every phone the link reached. Both launch audits found that
    // independently; returning params rather than a URL is what makes it
    // impossible to reintroduce here.
    expect(params).toEqual({ seed: '1234567' });
  });

  it('omits the arc rather than printing an empty gap', () => {
    const { text } = shareOf('Ashwake', {
      kind: 'run',
      points: 12,
      placements: 3,
      seed: 7,
      arc: '',
    });
    expect(text).toBe('Ashwake: 12 pts in 3 placements. Beat my run:');
  });

  it('carries a negative seed intact', () => {
    // A hand-typed seed can be negative, and the settle path was bitten once
    // by a 31-bit mask that quietly changed which world travelled.
    expect(
      shareOf('Ashwake', { kind: 'run', points: 1, placements: 1, seed: -42, arc: '' }).params,
    ).toEqual({
      seed: '-42',
    });
  });
});

describe('a daily', () => {
  it('reads as a scoreboard line, and confesses the try', () => {
    const { text, params } = shareOf('Ashwake', {
      kind: 'daily',
      date: DAILY_EPOCH,
      points: 1204,
      reach: 12,
      arc: '▁▂▄▃█▅▂',
      tries: 2,
    });
    expect(text).toContain('Ashwake #1');
    expect(text).toContain('1204 pts');
    expect(text).toContain('reach 12');
    expect(text).toContain('▁▂▄▃█▅▂');
    // Counted and confessed rather than pretend-enforced — the daily's own
    // honesty rule. A second try says so.
    expect(text).toContain('2nd try');
    expect(text.endsWith('beat it:')).toBe(true);
    // The DATE travels, not the seed: every phone opening this link must
    // derive the same world, and the date is what the seed comes from.
    expect(params).toEqual({ daily: DAILY_EPOCH });
  });

  it('omits the arc rather than printing an empty gap', () => {
    const { text } = shareOf('Ashwake', {
      kind: 'daily',
      date: DAILY_EPOCH,
      points: 0,
      reach: 0,
      arc: '',
      tries: 1,
    });
    expect(text).not.toContain('·  ·');
    expect(text).toContain('1st try');
  });

  it('names a rehearsal-week date rather than a #0', () => {
    // Dates before the epoch are playable but pre-calendar (Marc's 2026-08-20
    // ruling): they print their DATE, because "#0" reads as broken.
    const { text } = shareOf('Ashwake', {
      kind: 'daily',
      date: '2026-08-20',
      points: 10,
      reach: 1,
      arc: '',
      tries: 1,
    });
    expect(text).toContain('2026-08-20');
    expect(text).not.toContain('#');
  });
});
