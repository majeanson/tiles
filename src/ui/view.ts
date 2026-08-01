import { parse } from '@engine/hex';
import { canLeave } from '@engine/reduce';
import {
  canPlaceAt,
  canPlaceNow,
  costOf,
  harvestValue,
  isRipe,
  previewWorth,
  ripeKeys,
  worthOf,
} from '@engine/rules';
import type { GameState } from '@engine/state';
import type { BoardView, CellKind, CellView } from '@render/Renderer';

/**
 * State to screen, as one pure function.
 *
 * Everything the player is shown is derived here, so the UI cannot invent a
 * number the engine disagrees with — the classic version of that bug is a
 * preview that says 4 and a placement that pays 3. It is also the only reason
 * any of this is testable: the interesting question is "does the board show the
 * right thing", and answering it needs no canvas and no phone.
 */

export function toBoardView(state: GameState): BoardView {
  const selected = state.draft[state.selected];
  const placeable = canPlaceNow(state);

  const cells: CellView[] = Object.entries(state.cells).map(([k, cell]) => {
    const { q, r } = parse(k);
    const legal = placeable && canPlaceAt(state.cells, k);

    return {
      key: k,
      q,
      r,
      kind: cell.kind satisfies CellKind,
      colour: cell.kind === 'tile' ? cell.colour : null,
      ripe: isRipe(state.cells, k),
      worth: worthOf(state.cells, k, state.tuning),
      legal,
      preview:
        legal && selected !== undefined
          ? previewWorth(state.cells, k, selected.colour, state.tuning)
          : null,
    };
  });

  return { cells };
}

/**
 * Everything outside the board: the run's numbers, and which buttons are live.
 *
 * The disabled reasons are text rather than booleans because a control that is
 * simply dead teaches nothing. "Harvest here first" is the rule being explained
 * at the only moment the player cares about it, which is the whole tutorial
 * budget this game gets.
 */
export type HudView = {
  readonly tiles: number;
  readonly points: number;
  readonly mapNumber: number;
  readonly cost: number;
  readonly placements: number;

  readonly draft: readonly {
    readonly id: string;
    readonly colour: string;
    readonly selected: boolean;
  }[];

  readonly ripeCount: number;
  /** What harvesting right now would pay, each way. Both are always shown. */
  readonly harvestTiles: number;
  readonly harvestPoints: number;

  readonly canHarvest: boolean;
  readonly canLeave: boolean;
  readonly leaveHint: string;

  readonly ended: boolean;
  /** Gate D: the cause of death, in one sentence. */
  readonly epitaph: string | null;
};

export function toHudView(state: GameState): HudView {
  const value = harvestValue(state);
  const leaving = canLeave(state);

  return {
    tiles: state.tiles,
    points: state.points,
    mapNumber: state.mapNumber,
    cost: costOf(state.placements, state.tuning),
    placements: state.placements,

    draft: state.draft.map((tile, i) => ({
      id: tile.id,
      colour: tile.colour,
      selected: i === state.selected,
    })),

    ripeCount: ripeKeys(state.cells).length,
    harvestTiles: value.tiles,
    harvestPoints: value.points,

    canHarvest: state.phase === 'placing' && value.count > 0,
    canLeave: leaving,
    leaveHint: leaving ? 'Move on' : 'Harvest here first',

    ended: state.phase === 'ended',
    epitaph: state.phase === 'ended' ? epitaphFor(state) : null,
  };
}

/**
 * Gate D wants the end screen to name the cause of death in one sentence. There
 * is only one cause, so the sentence's job is to say WHY it happened — the cost
 * of a placement having climbed past what the board could pay back is the whole
 * arc of a run, and it should be the last thing the player reads.
 */
function epitaphFor(state: GameState): string {
  const cost = costOf(state.placements, state.tuning);
  return (
    `Out of tiles on map ${state.mapNumber}, after ${state.placements} placements. ` +
    `They cost ${cost} each by the end.`
  );
}
