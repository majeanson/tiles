# Content tables

Everything in this document belongs in `src/content/` as typed constants. **No number here
should ever appear in `src/engine/`.**

All values are first-pass guesses. They exist so the game is playable on day one, not
because they are right. Tune with the harness in `src/sim/`.

---

## Terrains

`src/content/terrains.ts`

| id | display | fill | glyph fill |
|---|---|---|---|
| `woodland` | Woodland | `#7A9A5E` | `#3F5432` |
| `meadow` | Meadow | `#E4BA68` | `#8A6420` |
| `hamlet` | Hamlet | `#CE7255` | `#7A3721` |
| `water` | Water | `#7BA5BE` | `#38596E` |

Colours are placeholders. Art direction is deliberately deferred.

---

## Rarity

`src/content/tuning.ts`

| id | affixes | base weight | placement gate | border |
|---|---|---|---|---|
| `common` | 0 | 55 | 0 neighbours | `#A79C86` |
| `magic` | 1 | 30 | 1 | `#6BA8E8` |
| `rare` | 2 | 12 | 2 | `#F0B429` |
| `unique` | fixed | 3 | 3 | `#B98BE0` |

Gates are reduced by 1 at Masonry 5.

**Roll procedure:** `roll = rng(0..100) - luck × 0.35`; unique above 96, rare above 84,
magic above 54, else common. A `minimumRarity` floor may raise but never lower the result.

---

## Affix hooks

`src/content/affixes.ts`

| key | label template | rolls |
|---|---|---|
| `match` | `+{v} per match` | 4, 6, 8 |
| `aura` | `neighbours +{v}%` | 20, 30, 40 |
| `wild` | `matches anything` | — |
| `draw` | `+{v} tile on place` | 1 |
| `luck` | `+{v}% loot here` | 25, 40 |
| `burst` | `bursts here ×{v}` | 1.5, 2 |

Magic rolls one hook; rare rolls two distinct hooks.

---

## Uniques

`src/content/uniques.ts`

| id | name | terrain | affixes | requirement |
|---|---|---|---|---|
| `gilded-mill` | The Gilded Mill | hamlet | `burst: 2`, `draw: 2` | Husbandry 10 |
| `heartwood` | Heartwood of the Old King | woodland | `wild`, `aura: 50` | Craft 12 |
| `ashfall-plains` | Ashfall Plains | meadow | `match: 12`, `luck: 60` | Fortune 12 |
| `mirrowmere` | Mirrowmere | water | `aura: 35`, `luck: 50` | Fortune 8 |
| `wardens-rest` | Warden's Rest | hamlet | `match: 10`, `draw: 1` | Husbandry 8 |
| `the-long-stair` | The Long Stair | woodland | `burst: 1.5`, `wild` | Masonry 12 |
| `cartographers-cairn` | The Cartographer's Cairn | meadow | `aura: 25`, `luck: 30` | Survey 10 |

**Unmet requirement → the tile places normally but its affixes are dormant.** Show the
requirement and the shortfall in the tooltip.

---

## Stats

`src/content/stats.ts`

Two points per level. Breakpoints at 5, 10, 15, 20. No respec.

### Husbandry — tiles

| At | Name | Effect |
|---|---|---|
| 5 | Thrift | refund threshold 4 → 3 matches |
| 10 | Stores | Quarry dividends ×1.5 |
| 15 | Abundance | refund threshold 3 → 2 matches |
| 20 | Endurance | region cost term uses `floor((n-1)/2)` |

### Craft — score

| At | Name | Effect |
|---|---|---|
| 5 | Diligence | +20% match score |
| 10 | Resonance | your tiles' `aura` values ×1.5 |
| 15 | Mastery | match score bonus becomes +40% (replaces Diligence) |
| 20 | Apotheosis | burst pot ×2 |

### Fortune — loot

| At | Name | Effect |
|---|---|---|
| 5 | Keen eye | +15 luck on every roll |
| 10 | Grace | each loot floor needs 1 fewer matching neighbour |
| 15 | Avarice | Prospect rolls two tiles, keep one |
| 20 | Providence | a 6/6 burst drops a unique *and* a rare |

### Survey — information

| At | Name | Effect |
|---|---|---|
| 5 | Farsight | +1 world-graph lookahead tier |
| 10 | Wide draft | draft 4 tiles instead of 3 |
| 15 | Cartography | full region reveal on arrival |
| 20 | Foreknowledge | see the next 3 drafts |

### Masonry — space

| At | Name | Effect |
|---|---|---|
| 5 | Foundation | rarity gates need 1 fewer neighbour |
| 10 | Ley Lines | chain reach 1 → 2 jumps |
| 15 | Drystone | barren ground counts as matching for enclosure quality |
| 20 | Keystone | waypoint rings need 1 fewer hex |

---

## Blessings

`src/content/blessings.ts`

Drafted one-of-three every third level. **Six slots, five ranks each.**

| id | name | per rank |
|---|---|---|
| `leylines` | Ley Lines | +1 chain jump (stacks with Masonry 10) |
| `harvest` | Harvest | +15% match score |
| `prospector` | Prospector | +20% loot rarity |
| `surveyor` | Surveyor | +1 draft width at ranks 1 and 3 |
| `wildgrowth` | Wildgrowth | every (7 − rank)th tile placed counts as `wild` |
| `stonecutter` | Stonecutter | Quarry dividends +1 tile per burst |
| `cartographer` | Cartographer | contracts need 1 less progress at ranks 1, 3, 5 |
| `bloom` | Bloom | auras reach one hex further |
| `farsight` | Farsight | +1 lookahead tier at ranks 1, 3, 5 |

### Evolutions

Rank 5 plus the named unique **in the Vault loadout** fuses into an evolved blessing.

| Blessing | + Unique | = Evolution | Effect |
|---|---|---|---|
| `leylines` | `mirrowmere` | Tidal Cascade | chains travel all connected water regardless of adjacency |
| `harvest` | `heartwood` | Golden Age | every match scores as if 6/6 |
| `prospector` | `ashfall-plains` | Motherlode | every burst drops two loot tiles |
| `wildgrowth` | `wardens-rest` | Everbloom | all Hamlets are permanently `wild` |
| `stonecutter` | `gilded-mill` | Perpetuity | bursts refund more tiles than the chain consumed |

Evolutions are milestone 7. Define the data now; leave the effects unimplemented.

---

## Biomes

`src/content/biomes.ts`

```ts
type Biome = {
  id: string;
  name: string;
  terrainWeights: Record<Terrain, number>;
  blockedDensity: number;
  shapeBias: 'open' | 'narrow' | 'broken';   // stubbed until milestone 5
  connectsTo: string[];
  hint: string;                              // shown before committing
};
```

| id | name | woodland | meadow | hamlet | water | blocked | shape | hint |
|---|---|---|---|---|---|---|---|---|
| `marshfen` | Marshfen | 20 | 25 | 15 | 40 | 0.08 | open | open ground |
| `bonefields` | Bone-fields | 20 | 30 | 30 | 20 | 0.20 | broken | cliff-riddled |
| `highland` | Highland | 45 | 25 | 20 | 10 | 0.15 | narrow | broken ground |
| `sunkenvale` | Sunken vale | 25 | 30 | 15 | 30 | 0.10 | open | open ground |
| `ashland` | Ashland | 15 | 40 | 20 | 25 | 0.18 | broken | scorched and bare |
| `thornwold` | Thornwold | 50 | 20 | 20 | 10 | 0.12 | narrow | dense and close |

**Adjacency graph** (milestone 6; until then offer two random biomes):

```
marshfen   → sunkenvale, bonefields
sunkenvale → marshfen, thornwold, highland
bonefields → ashland, highland
highland   → thornwold, bonefields
thornwold  → highland, marshfen
ashland    → bonefields, thornwold
```

**Marshfen at 8% blocked and Bone-fields at 20% is the key contrast** — playing them back
to back should feel like different games. If it does not, the nook rule is not landing and
that is a serious problem.

---

## Contracts

`src/content/contracts.ts`

Two active. Two completions open the waypoint. Templates are parameterised at region entry.

| id | label | need | event |
|---|---|---|---|
| `terrain-run` | Place 5 {terrain} | 5 | `place` where terrain matches |
| `bursts` | Trigger 2 bursts | 2 | `burst`, incremented by chain length |
| `fill` | Fill 12 hexes | 12 | `place` (barren does not count) |
| `high-match` | Three 4+ match placements | 3 | `place` where matches ≥ 4 |
| `deep-hollow` | Two bursts within 3 hexes | 2 | `burst` proximity check |
| `long-fuse` | A single chain of 4+ | 1 | `burst` where chain length ≥ 4 |

`terrain-run` must choose from the biome's **two highest-weighted terrains**, or it becomes
unachievable in skewed biomes.

---

## Seal conditions

`src/content/seals.ts`

Indexed by region depth. Masonry 20 reduces required ring size by 1.

| depth | condition |
|---|---|
| 1 | enclose the waypoint, any terrain |
| 2 | enclose with at least 4 matching |
| 3 | ring must be all one terrain |
| 4 | ring all one terrain, no barren ground touching it |
| 5 | ring all one terrain, and it must be the region's rarest terrain |
| 6+ | ring of 12 (two hexes deep), all one terrain |

---

## Tuning constants

`src/content/tuning.ts` — the whole balance surface in one file.

| constant | value | notes |
|---|---|---|
| `startingBudget` | 20 | |
| `baseCost` | 1 | `cost = 1 + (region − 1) + ebbsSurvived` |
| `refundThresholdBase` | 4 | matches needed for +1 tile |
| `burstPotBase` | 60 | `pot = 60 × (1 + matches) × burstMult` |
| `quarryPerBurst` | 2 | +1 more if that burst had ≥5 matches |
| `waypointPotMultiplier` | 2.5 | |
| `waypointQuarryMultiplier` | 2 | |
| `chainReachBase` | 1 | +1 at Masonry 10, +1 per Ley Lines rank |
| `chainHardCap` | 24 | safety valve; should never bind in practice |
| `driftWidthBase` | 3 | |
| `contractsToOpenWay` | 2 | |
| `ebbEnter` | 5 | budget below this enters the Ebb |
| `ebbExit` | 12 | budget above this exits it |
| `xpPerLevel` | `l => 120 + l * 90` | first pass; expect to change |
| `statPointsPerLevel` | 2 | |
| `blessingEveryNLevels` | 3 | |
| `fillWeight` | 0.4 | region multiplier |
| `matchedWeight` | 0.2 | region multiplier |
| `barrenFillCredit` | 0.5 | barren counts half toward fill |
| `vaultSlots` | 3 | |

### The three numbers that matter most

1. **`baseCost` growth.** Sets how deep anyone can go. If a strong build never feels like
   it is outrunning the curve, this is why.
2. **Region depletion rate** (a function of `placeableTotal` and yield per placement).
   Decides whether the window decision is tense or obvious.
3. **`chainReachBase` scaling.** Decides whether the late run feels triumphant or broken.
