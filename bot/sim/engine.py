#!/usr/bin/env python3
"""
Local simulator for the "paint battle" bot protocol.

Protocol implemented (exactly the shape the C++ bot reads):

  GAME R C U V T known
  [MAP]                      <- only when known == 1
  R lines of map ('#' wall, '.' open)
  ...
  ROUND round our_cells
  for each of our U units:
     UNIT id r c
     (2V+1) lines, each (2V+1) chars
  ...
  ORDERS d1 d2 ... dU        <- bot writes this (N/E/S/W/H)
  ...
  GAME_END points

View characters: '#' wall, '.' unpainted, '+' ours, '-' enemy, 'M' our unit, 'E' enemy unit.

Rules (reverse engineered from the judge behaviour + the reference bot):
  * all orders are resolved simultaneously
  * a unit whose target is a wall / out of bounds stays
  * two units asking for the same cell: everybody involved stays
  * a unit asking for a cell occupied by a unit that is staying: blocked, stays
  * two units swapping places: both stay
  * after movement every unit paints its cell with its own colour
  * score = number of cells carrying your colour at the end
"""

import random
from collections import deque

DE = (-1, 0)
DS = (1, 0)
DW = (0, -1)
DN = (0, 1)

DIRV = {
    'N': (-1, 0),
    'E': (0, 1),
    'S': (1, 0),
    'W': (0, -1),
    'H': (0, 0),
}

A, B = 1, 2  # paint owner codes


class Unit:
    __slots__ = ('side', 'id', 'r', 'c')

    def __init__(self, side, uid, r, c):
        self.side = side
        self.id = uid
        self.r = r
        self.c = c

    def pos(self):
        return (self.r, self.c)


class Game:
    def __init__(self, R, C, U, V, T, known, grid, startsA, startsB):
        self.R, self.C, self.U, self.V, self.T = R, C, U, V, T
        self.known = known
        self.grid = grid  # list[str]
        self.paint = [[0] * C for _ in range(R)]
        self.round = 0
        self.units = []
        self.stats = {1: dict(new=0, own=0, blocked=0, flip=0, steps=0,
                              block_enemy=0, block_own=0, block_swap=0),
                      2: dict(new=0, own=0, blocked=0, flip=0, steps=0,
                              block_enemy=0, block_own=0, block_swap=0)}
        for i, (r, c) in enumerate(startsA):
            self.units.append(Unit(1, i, r, c))
            self.paint[r][c] = A
        for i, (r, c) in enumerate(startsB):
            self.units.append(Unit(2, i, r, c))
            self.paint[r][c] = B

    # ---------------------------------------------------------------- helpers
    def is_wall(self, r, c):
        return self.grid[r][c] == '#'

    def units_of(self, side):
        return [u for u in self.units if u.side == side]

    def cell_owner_after_move(self):
        return self.paint

    def count(self, side):
        code = A if side == 1 else B
        return sum(row.count(code) for row in self.paint)

    def view(self, side, u):
        """Return the (2V+1) strings this unit sees."""
        V = self.V
        rows = []
        for dr in range(-V, V + 1):
            r = u.r + dr
            line = []
            for dc in range(-V, V + 1):
                c = u.c + dc
                if r < 0 or r >= self.R or c < 0 or c >= self.C or self.is_wall(r, c):
                    line.append('#')
                    continue
                occ = None
                for o in self.units:
                    if o.r == r and o.c == c:
                        occ = o
                        break
                if occ is not None:
                    line.append('M' if occ.side == side else 'E')
                else:
                    p = self.paint[r][c]
                    line.append('.' if p == 0 else ('+' if (p == A) == (side == 1) else '-'))
            rows.append(''.join(line))
        return rows

    def observation(self, side):
        """Everything a bot for `side` is allowed to know this round."""
        return {
            'round': self.round,
            'our_cells': self.count(side),
            'units': [
                {'id': u.id, 'r': u.r, 'c': u.c, 'view': self.view(side, u)}
                for u in self.units_of(side)
            ],
        }

    def header(self, side):
        return {
            'R': self.R, 'C': self.C, 'U': self.U, 'V': self.V, 'T': self.T,
            'known': self.known,
            'map': list(self.grid) if self.known else None,
        }

    # ------------------------------------------------------------- resolution
    def resolve(self, orders):
        """orders: dict side -> list[str] one per unit id.

        Simultaneous resolution, iterated to a fixed point so the outcome never
        depends on the order units are stored in.
        """
        pos = {}
        intent = {}
        for u in self.units:
            o = orders[u.side][u.id]
            dr, dc = DIRV.get(o, (0, 0))
            nr, nc = u.r + dr, u.c + dc
            if nr < 0 or nr >= self.R or nc < 0 or nc >= self.C or self.is_wall(nr, nc):
                nr, nc = u.r, u.c
            pos[(u.side, u.id)] = (u.r, u.c)
            intent[(u.side, u.id)] = (nr, nc)

        changed = True
        while changed:
            changed = False
            by_t = {}
            for k, v in intent.items():
                by_t.setdefault(v, []).append(k)
            # two units want the same cell: nobody moves
            for cell, ks in by_t.items():
                if len(ks) > 1:
                    for k in ks:
                        if intent[k] != pos[k]:
                            intent[k] = pos[k]
                            changed = True
            # walking into someone who is not leaving: blocked
            stayers = {pos[k] for k in intent if intent[k] == pos[k]}
            for k in intent:
                if intent[k] != pos[k] and intent[k] in stayers:
                    intent[k] = pos[k]
                    changed = True
            # swapping places: both stay
            for k in list(intent):
                if intent[k] == pos[k]:
                    continue
                for k2 in pos:
                    if k2 == k:
                        continue
                    if pos[k2] == intent[k] and intent.get(k2) == pos[k]:
                        intent[k] = pos[k]
                        changed = True

        before = dict(pos)
        for u in self.units:
            u.r, u.c = intent[(u.side, u.id)]
        for u in self.units:
            key = (u.side, u.id)
            st = self.stats[u.side]
            st['steps'] += 1
            if (u.r, u.c) == before[key]:
                if orders[u.side][u.id] != 'H':
                    st['blocked'] += 1
                    dr, dc = DIRV[orders[u.side][u.id]]
                    tr, tc = before[key][0] + dr, before[key][1] + dc
                    occ = None
                    for o in self.units:
                        if o is not u and before[(o.side, o.id)] == (tr, tc):
                            occ = o
                    if occ is None:
                        st['block_swap'] += 1
                    elif occ.side == u.side:
                        st['block_own'] += 1
                    else:
                        st['block_enemy'] += 1
            else:
                prevp = self.paint[u.r][u.c]
                mycode = A if u.side == 1 else B
                if prevp == mycode:
                    st['own'] += 1
                else:
                    st['new'] += 1
                    if prevp != 0:
                        st['flip'] += 1
            self.paint[u.r][u.c] = A if u.side == 1 else B

    def _unit(self, key):
        side, uid = key
        for u in self.units:
            if u.side == side and u.id == uid:
                return u
        raise KeyError(key)

    # ------------------------------------------------------------------- play
    def play(self, bot1, bot2, verbose=False, max_rounds=None):
        bots = {1: bot1, 2: bot2}
        for s in (1, 2):
            bots[s].start(self.header(s))
        tr = max_rounds if max_rounds else self.T
        for rnd in range(1, tr + 1):
            self.round = rnd
            orders = {}
            for s in (1, 2):
                obs = self.observation(s)
                orders[s] = bots[s].act(obs)
            if verbose:
                print('round', rnd, 'A', sorted((u.r, u.c) for u in self.units_of(1)),
                      'B', sorted((u.r, u.c) for u in self.units_of(2)))
            self.resolve(orders)
        res = (self.count(1), self.count(2))
        for s in (1, 2):
            bots[s].finish(1 if res[0] > res[1] else (2 if res[1] > res[0] else 0), res)
        return res


# ----------------------------------------------------------------- map makers
def mirror_pairs(R, C):
    out = []
    seen = set()
    for r in range(R):
        for c in range(C):
            p = (r, c)
            q = (R - 1 - r, C - 1 - c)
            if p in seen:
                continue
            seen.add(p)
            seen.add(q)
            out.append((p, q))
    return out


def make_map(R, C, seed, wall_prob=0.22, symmetric=True, corridor=False):
    rng = random.Random(seed)
    g = [['.'] * C for _ in range(R)]
    if corridor:
        # snake-like corridors: walls everywhere, carve a random walk path
        for r in range(R):
            for c in range(C):
                g[r][c] = '#'
        r, c = R // 2, C // 2
        g[r][c] = '.'
        steps = int(R * C * 0.65)
        for _ in range(steps):
            for _try in range(8):
                d = rng.choice([(-1, 0), (1, 0), (0, -1), (0, 1)])
                nr, nc = r + d[0] * rng.choice([1, 2]), c + d[1] * rng.choice([1, 2])
                if 0 <= nr < R and 0 <= nc < C:
                    g[nr][nc] = '.'
                    r, c = nr, nc
                    break
    else:
        pairs = mirror_pairs(R, C)
        for (r, c), (r2, c2) in pairs:
            if rng.random() < wall_prob:
                g[r][c] = '#'
                g[r2][c2] = '#'
    grid = [''.join(row) for row in g]
    return grid


def open_cells(grid, n, seed, avoid=()):
    rng = random.Random(seed)
    R, C = len(grid), len(grid[0])
    cells = [(r, c) for r in range(R) for c in range(C) if grid[r][c] == '.']
    rng.shuffle(cells)
    picked = []
    for p in cells:
        if p in avoid:
            continue
        picked.append(p)
        if len(picked) == n:
            break
    return picked


def mirror(p, R, C):
    return (R - 1 - p[0], C - 1 - p[1])


def make_scenario(seed, R=8, C=8, U=2, V=1, T=30, known=1, wall_prob=0.22, corridor=False,
                  symmetric=True):
    grid = make_map(R, C, seed, wall_prob=wall_prob, corridor=corridor, symmetric=symmetric)
    startsA = open_cells(grid, U, seed + 991)
    if symmetric:
        startsB = [mirror(p, R, C) for p in startsA]
    else:
        startsB = open_cells(grid, U, seed + 1777, avoid=set(startsA))
    # keep starts distinct
    if len(set(startsA) | set(startsB)) < 2 * U:
        if seed > 500:
            startsB = open_cells(grid, U, seed + 1777, avoid=set(startsA))
            return grid, startsA, startsB
        return make_scenario(seed + 1, R, C, U, V, T, known, wall_prob, corridor, symmetric)
    return grid, startsA, startsB


def make_game(seed, R=8, C=8, U=2, V=1, T=30, known=1, wall_prob=0.22, corridor=False,
              symmetric=True):
    grid, sa, sb = make_scenario(seed, R, C, U, V, T, known, wall_prob, corridor, symmetric)
    return Game(R, C, U, V, T, known, grid, sa, sb)


def score_points(ours, theirs, R, C, T):
    """Two plausible point formulas; used only for reporting."""
    total = R * C
    p1 = (ours / max(1, total)) * 100 * (2.0 if total < 30 else 1.0)
    p2 = 5.0 + 5.0 * (ours / max(1, ours + theirs))
    return round(p1, 2), round(p2, 2)
