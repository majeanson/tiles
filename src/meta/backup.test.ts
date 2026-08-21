import { describe, expect, it } from 'vitest';
import {
  buildBackup,
  decodeBackup,
  describeBackup,
  encodeBackup,
  isOwnKey,
  restorePlan,
} from './backup';

/**
 * The backup is the only thing standing between a player and a platform that
 * is entitled to delete their world — Safari's 7-day eviction, an in-app
 * browser, a new phone. A backup that silently restores nothing is worse
 * than none, because it fails at the one moment it was kept for, so this
 * file leans on the failure cases harder than the happy one.
 */

const META = { sha: 'abc1234', at: '2026-08-21T01:00:00.000Z' };

describe('building one', () => {
  it('takes this game’s keys and leaves everything else alone', () => {
    const backup = buildBackup(
      {
        'tiles.world.v1': '{"worldSeed":7}',
        'tiles.progress.v1': '{"relics":412}',
        // Somebody else's storage on the same origin. A save button that
        // quietly copied this into a file the player is about to SHARE would
        // be a surprising thing for a save button to do.
        'analytics.session': 'nope',
        theme: 'not ours either',
      },
      META,
    );

    expect(Object.keys(backup.keys).sort()).toEqual(['tiles.progress.v1', 'tiles.world.v1']);
    expect(backup.sha).toBe('abc1234');
    expect(backup.format).toBeGreaterThanOrEqual(1);
  });

  it('round-trips whole', () => {
    const backup = buildBackup(
      { 'tiles.world.v1': '{"worldSeed":7}', 'tiles.daily.v1': '{}' },
      META,
    );
    expect(decodeBackup(encodeBackup(backup))).toEqual(backup);
  });
});

describe('reading one back', () => {
  it('refuses anything that is not one, rather than half-restoring', () => {
    expect(decodeBackup(null)).toBeNull();
    expect(decodeBackup('not json')).toBeNull();
    expect(decodeBackup('[]')).toBeNull();
    expect(decodeBackup('{}')).toBeNull();
    // An envelope with no version is not this format.
    expect(decodeBackup('{"keys":{"tiles.world.v1":"{}"}}')).toBeNull();
    // A well-formed envelope carrying nothing of OURS is not a backup: it
    // would wipe the device and put nothing back, which is the one outcome
    // this whole module exists to make impossible.
    expect(decodeBackup('{"format":1,"keys":{}}')).toBeNull();
    expect(decodeBackup('{"format":1,"keys":{"someone.else":"x"}}')).toBeNull();
  });

  it('keeps the good keys when one entry is rubbish', () => {
    // Strict about the envelope, forgiving about the contents — the same
    // split decodeWorld learned. Refusing a whole backup over one bad value
    // fails the player at the moment they needed it.
    const kept = decodeBackup(
      JSON.stringify({
        format: 1,
        keys: { 'tiles.world.v1': '{"worldSeed":7}', 'tiles.broken': 42, 'tiles.daily.v1': '{}' },
      }),
    );
    expect(kept).not.toBeNull();
    expect(Object.keys(kept!.keys).sort()).toEqual(['tiles.daily.v1', 'tiles.world.v1']);
  });

  it('survives a backup written by a build that knew more than this one', () => {
    // Forward compatibility is the whole reason `format` never has to move:
    // restore is key-by-key, and every decoder in this codebase already
    // tolerates shapes it does not recognise, so a newer backup lands as a
    // newer save and migrates on the next boot exactly as it would have.
    const future = decodeBackup(
      JSON.stringify({
        format: 99,
        sha: 'future',
        at: '2027-01-01T00:00:00.000Z',
        keys: { 'tiles.world.v1': '{"worldSeed":7,"somethingNew":true}' },
        extra: 'a field this build has never heard of',
      }),
    );
    expect(future?.keys['tiles.world.v1']).toContain('somethingNew');
  });
});

describe('restoring one', () => {
  it('REPLACES rather than merges, and says so in the plan', () => {
    // Merging two devices was the other option and it is a trap: two worlds'
    // revealed ground unioned together is a map of somewhere that never
    // existed, and there is no rule for which of two purses wins.
    const backup = buildBackup({ 'tiles.world.v1': '{"worldSeed":7}' }, META);
    const plan = restorePlan(backup);
    expect(plan.remove).toEqual(['tiles.']);
    expect(plan.write).toEqual({ 'tiles.world.v1': '{"worldSeed":7}' });
  });

  it('knows which keys are the game’s to clear', () => {
    expect(isOwnKey('tiles.world.v1')).toBe(true);
    expect(isOwnKey('tiles.progress.v1')).toBe(true);
    expect(isOwnKey('analytics.session')).toBe(false);
    expect(isOwnKey('nottiles.world.v1')).toBe(false);
  });
});

describe('describing one', () => {
  it('counts what a player recognises as theirs', () => {
    const backup = buildBackup(
      {
        'tiles.world.v1': '{"worldSeed":1}',
        'tiles.world.s2.v1': '{"worldSeed":2}',
        'tiles.world.s3.v1': '{"worldSeed":3}',
        'tiles.progress.v1': '{"relics":412}',
        'tiles.daily.v1': '{}',
      },
      META,
    );
    const line = describeBackup(backup);
    expect(line).toContain('3 worlds');
    expect(line).toContain('412 relics');
    expect(line).toContain('2026-08-21');
  });

  it('pluralises one world honestly, and survives an unreadable purse', () => {
    const one = buildBackup(
      { 'tiles.world.v1': '{"worldSeed":1}', 'tiles.progress.v1': 'not json' },
      { sha: 'x', at: '' },
    );
    const line = describeBackup(one);
    expect(line).toContain('1 world ');
    expect(line).toContain('0 relics');
  });
});
