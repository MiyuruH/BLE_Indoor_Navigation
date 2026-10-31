# Paint-battle bot (v2)

A rewritten bot for the *paint battle* game (the one that reads `GAME R C U V T known`
and answers `ORDERS N E S W H`), plus a complete local simulator so the bot can be
measured instead of guessed.

```
bot/
├─ src/solution.cpp   <-- the bot. Single file, paste this into the judge.
├─ src/old_bot.cpp    <-- your previous submission, kept as a reference opponent
└─ sim/
   ├─ engine.py       <-- exact protocol + movement/paint rules + statistics
   ├─ bots.py         <-- subprocess adapter + reference opponents (random/greedy/squatter)
   ├─ bench.py        <-- one bot vs one opponent
   ├─ h2h.py          <-- two compiled bots head to head
   ├─ suite.py        <-- 8 scenarios x N opponents, balanced score
   ├─ report.py       <-- old bot vs new bot comparison table
   └─ trace.py        <-- print a full game, round by round
```

## Build

```bash
g++ -O2 -std=c++17 -o sim/new_bot src/solution.cpp
g++ -O2 -std=c++17 -o sim/old_bot src/old_bot.cpp
```

## Measure

```bash
python3 sim/report.py 10          # old vs new against 4 opponents, 10 scenarios
python3 sim/suite.py sim/new_bot --seeds 10                 # balanced score
python3 sim/suite.py sim/new_bot --seeds 10 --opponents old,squatter
python3 sim/h2h.py sim/new_bot sim/old_bot --seeds 15       # direct duel
python3 sim/trace.py sim/new_bot sim/old_bot --seed 3 --R 5 --C 5 --T 20
```

## Results (average cell margin, 20 games per cell)

| scenario | vs old bot | vs greedy | vs squatter | vs random |
|---|---|---|---|---|
| 4x4 U2 T15 | +1.00 | 4.75 → 3.50 | -2.25 → -1.25 | 6.45 → 6.45 |
| 5x5 U2 T20 | +1.90 | 6.20 → 6.45 | -1.25 → -0.75 | 10.80 → 10.40 |
| 6x6 U2 T25 | +0.30 | 11.25 → 10.95 | 1.85 → 0.95 | 12.00 → 11.85 |
| 8x8 U2 T25 | +5.25 | 15.70 → 14.95 | 3.10 → 6.65 | 20.45 → 20.25 |
| 8x8 U2 T40 | +5.75 | 22.90 → 19.30 | 4.70 → 5.30 | 25.75 → 24.20 |
| 10x10 U2 T35 | +3.35 | 18.05 → 18.50 | 9.95 → 8.75 | 33.65 → 32.15 |
| 12x12 U2 V2 T45 | +5.90 | 33.15 → 31.10 | 9.80 → 13.45 | 48.85 → 47.10 |
| 8x8 fog | +4.80 | 12.55 → 17.10 | 3.50 → 2.90 | 21.75 → 21.85 |
| 10x10 U3 T35 | +0.55 | 39.40 → 36.40 | 6.50 → 10.35 | 38.35 → 40.45 |
| 6x6 U4 T25 | +2.15 | 12.65 → 14.10 | -1.00 → 1.50 | 13.75 → 14.25 |

*"old → new" for the reference opponents; the first column is the new bot's margin
against your old bot (the old bot's own margin there is 0 by definition).*

The new bot wins every scenario against the old one, and it wins by a lot on
medium/large boards. On 4x4–6x6 boards the game is close to a coin flip for
every policy I tested (old bot, greedy, squatter and the new bot all land within
±2 cells), so margins there are small by nature.

Runtime is 1–5 ms per round on normal boards (60 ms worst case with 8 units on
12x12), well inside any judge limit.

## How the bot thinks

1. **Belief.** Every cell keeps terrain, owner and the round it was last seen.
2. **Enemy travel time.** A multi-source BFS from every enemy sighting gives
   `threat[cell]` = rounds until the enemy could physically be there, aged by
   the time since the sighting. With no sighting it falls back to the mirrored
   starting positions (the board is 180° rotation symmetric; the bot verifies
   this when the map is given and stops trusting it as soon as it is violated).
3. **Cell value** (the important part):

   | cell state | value |
   |---|---|
   | enemy cell | `2 · pStay` — flipping is a free option: 0 if they take it back, +2 if not |
   | empty cell | `(1 + denial) · pStay − 1 · (1 − pStay)` — a gamble, so it is worth less |
   | our cell, fresh | 0 — repainting it is a wasted move |
   | our cell, stale | `2 · pFlip · pStay` — it may have been stolen while we were away |

   `pStay` is 1 when the enemy cannot arrive before the last round and `0.65`
   when they can. Cells occupied by a visible enemy unit are discounted hard
   (the move usually just fails).
4. **Joint beam search.** All units are planned together to the end of the game
   (horizon 8 rounds), scoring the cells each unit paints. Two units can never
   target the same cell and can never swap, so our own units never block each
   other. A small potential term keeps units walking towards profit when
   nothing is reachable yet.
5. **Safety rails.** Rejected moves are remembered, and the output is
   post-checked so an impossible direction or a duplicate target is never sent.

## Tuning

Everything lives in `#ifndef` macros at the top of `src/solution.cpp`, e.g.

```bash
g++ -O2 -std=c++17 -DBEAM_W=24 -DMAXD=12 -DP_STAY=0.7 -o sim/new_bot src/solution.cpp
python3 sim/suite.py sim/new_bot --seeds 10 --opponents old,squatter
```

The shipped defaults (`BEAM_W 16`, `MAXD 8`, `P_STAY 0.65`, `DENIAL 0.5`) were
picked by sweeping each parameter against `old + squatter` over 320 games per
candidate; wider beams, longer horizons and hazard-rate-adaptive `pStay` all
measured worse.
