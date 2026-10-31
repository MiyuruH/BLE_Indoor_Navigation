#!/usr/bin/env python3
"""Bot adapters: subprocess (real C++/whatever binary) + reference Python bots."""

import random
import subprocess

random.seed(20240531)
from collections import deque

DIRV = {'N': (-1, 0), 'E': (0, 1), 'S': (1, 0), 'W': (0, -1), 'H': (0, 0)}


# --------------------------------------------------------------------- base
class Bot:
    name = 'bot'

    def start(self, header):
        self.header = header
        self.R = header['R']
        self.C = header['C']
        self.U = header['U']
        self.V = header['V']
        self.T = header['T']
        self.known = header['known']
        self.map = header['map']
        self.seed = 0

    def act(self, obs):
        raise NotImplementedError

    def finish(self, result, score):
        pass


class SubprocessBot(Bot):
    """Talks the real text protocol with a compiled executable."""

    def __init__(self, cmd, name=None, time_limit=5.0, devnull_err=True):
        self.cmd = cmd
        self.name = name or cmd[0].split('/')[-1]
        self.time_limit = time_limit
        self.p = None
        self.devnull_err = devnull_err

    def start(self, header):
        super().start(header)
        self.p = subprocess.Popen(self.cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=(subprocess.PIPE if self.devnull_err else None),
                                  text=True, bufsize=1)
        toks = ['GAME', header['R'], header['C'], header['U'], header['V'], header['T'],
                header['known']]
        self._send(' '.join(str(t) for t in toks))
        if header['known']:
            self._send('MAP')
            for row in header['map']:
                self._send(row)

    def _send(self, line):
        self.p.stdin.write(line + '\n')
        self.p.stdin.flush()

    def act(self, obs):
        self._send('ROUND %d %d' % (obs['round'], obs['our_cells']))
        for u in obs['units']:
            self._send('UNIT %d %d %d' % (u['id'], u['r'], u['c']))
            for row in u['view']:
                self._send(row)
        try:
            line = self.p.stdout.readline()
        except Exception:
            line = ''
        if not line:
            err = ''
            try:
                err = self.p.stderr.read()
            except Exception:
                pass
            raise RuntimeError('%s died or timed out. stderr:\n%s' % (self.name, err))
        toks = line.split()
        if not toks or toks[0] != 'ORDERS':
            raise RuntimeError('%s bad output: %r' % (self.name, line[:200]))
        orders = toks[1:1 + obs['units'].__len__()]
        while len(orders) < self.U:
            orders.append('H')
        return orders

    def finish(self, result, score):
        if self.p:
            try:
                self._send('GAME_END %.2f' % (0.0,))
                self.p.stdin.close()
                self.p.wait(timeout=3)
            except Exception:
                try:
                    self.p.kill()
                except Exception:
                    pass


# ------------------------------------------------------- reference opponents
def bfs_dist(grid, R, C, src):
    INF = 10 ** 9
    d = [[INF] * C for _ in range(R)]
    q = deque()
    for (r, c) in src:
        d[r][c] = 0
        q.append((r, c))
    while q:
        r, c = q.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] != '#' and d[nr][nc] > d[r][c] + 1:
                d[nr][nc] = d[r][c] + 1
                q.append((nr, nc))
    return d


class LocalMap(Bot):
    """Base for python bots: reconstructs terrain/paint from its own vision."""

    def start(self, header):
        super().start(header)
        R, C = header['R'], header['C']
        self.terr = [['?' for _ in range(C)] for _ in range(R)]
        self.paint = [[0] * C for _ in range(R)]  # 0 unknown,1 none,2 ours,3 theirs
        self.enemy_last = {}
        if header['known']:
            for r in range(R):
                for c in range(C):
                    self.terr[r][c] = header['map'][r][c]

    def observe(self, obs):
        R, C, V = self.R, self.C, self.V
        self.round = obs['round']
        self.our = []
        self.enemy_now = set()
        for u in obs['units']:
            self.our.append((u['id'], u['r'], u['c']))
            for i, row in enumerate(u['view']):
                rr = u['r'] - V + i
                for j, ch in enumerate(row):
                    cc = u['c'] - V + j
                    if not (0 <= rr < R and 0 <= cc < C):
                        continue
                    if ch == '#':
                        self.terr[rr][cc] = '#'
                        continue
                    self.terr[rr][cc] = '.'
                    if ch == '.':
                        self.paint[rr][cc] = 1
                    elif ch in '+M':
                        self.paint[rr][cc] = 2
                    else:
                        self.paint[rr][cc] = 3
                        if ch == 'E':
                            self.enemy_now.add((rr, cc))
                            self.enemy_last[(rr, cc)] = self.round

    def passable_dist(self, src, unknown_ok=True):
        R, C = self.R, self.C
        INF = 10 ** 9
        d = [[INF] * C for _ in range(R)]
        q = deque()
        for (r, c) in src:
            d[r][c] = 0
            q.append((r, c))
        while q:
            r, c = q.popleft()
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nr, nc = r + dr, c + dc
                if not (0 <= nr < self.R and 0 <= nc < self.C):
                    continue
                t = self.terr[nr][nc]
                if t == '#':
                    continue
                if t == '?' and not unknown_ok:
                    continue
                if d[nr][nc] > d[r][c] + 1:
                    d[nr][nc] = d[r][c] + 1
                    q.append((nr, nc))
        return d


class RandomBot(LocalMap):
    name = 'random'

    def act(self, obs):
        self.observe(obs)
        out = []
        for _ in range(self.U):
            out.append(random.choice('NESWH'))
        return out


class GreedyBot(LocalMap):
    """Heads for the nearest cell that is not ours, prefers enemy cells."""

    name = 'greedy'

    def act(self, obs):
        self.observe(obs)
        R, C = self.R, self.C
        d = self.passable_dist([(r, c) for _, r, c in self.our])
        best = None
        for r in range(R):
            for c in range(C):
                if self.terr[r][c] == '#' or d[r][c] >= 10 ** 9:
                    continue
                p = self.paint[r][c]
                if p == 2:
                    val = 0.0
                elif p == 3:
                    val = 3.0 / (d[r][c] + 1.5)
                elif p == 1:
                    val = 1.0 / (d[r][c] + 1.5)
                else:
                    val = 1.2 / (d[r][c] + 1.5)
                if best is None or val > best[0]:
                    best = (val, r, c)
        if best is None:
            return ['H'] * self.U
        _, tr, tc = best
        dt = self.passable_dist([(tr, tc)])
        orders = []
        for (uid, r, c) in self.our:
            cur = dt[r][c]
            bestm = ('H', cur)
            for ch, (dr, dc) in DIRV.items():
                nr, nc = r + dr, c + dc
                if not (0 <= nr < self.R and 0 <= nc < self.C):
                    continue
                if self.terr[nr][nc] == '#':
                    continue
                if dt[nr][nc] < bestm[1]:
                    bestm = (ch, dt[nr][nc])
            orders.append(bestm[0])
        return orders


class SquatterBot(LocalMap):
    """Paints around itself, refuses to wander far: annoying for far-seekers."""

    name = 'squatter'

    def act(self, obs):
        self.observe(obs)
        orders = []
        taken = set()
        for (uid, r, c) in self.our:
            best = None
            for ch, (dr, dc) in DIRV.items():
                nr, nc = r + dr, c + dc
                if not (0 <= nr < self.R and 0 <= nc < self.C):
                    continue
                if self.terr[nr][nc] == '#':
                    continue
                if (nr, nc) in taken:
                    continue
                p = self.paint[nr][nc]
                v = {3: 3.0, 1: 2.0, 0: 1.5, 2: -0.2 if self.round < self.T - 3 else 0.1}[p]
                v += random.random() * 0.5
                if best is None or v > best[0]:
                    best = (v, ch, nr, nc)
            if best is None:
                orders.append('H')
            else:
                orders.append(best[1])
                taken.add((best[2], best[3]))
        return orders
