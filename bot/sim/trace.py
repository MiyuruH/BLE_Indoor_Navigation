#!/usr/bin/env python3
"""Print a full game trace (board + orders + score) for debugging."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import make_game  # noqa: E402
from bots import SubprocessBot, RandomBot, GreedyBot, SquatterBot  # noqa: E402


class TraceGame:
    pass


def render(g, bot_moves):
    R, C = g.R, g.C
    occA = {(u.r, u.c): u.id for u in g.units_of(1)}
    occB = {(u.r, u.c): u.id for u in g.units_of(2)}
    out = []
    for r in range(R):
        line = ''
        for c in range(C):
            if g.grid[r][c] == '#':
                line += '##'
                continue
            ch = '  '
            p = g.paint[r][c]
            ch = '..' if p == 0 else ('++' if p == 1 else '--')
            if (r, c) in occA:
                ch = 'A%d' % occA[(r, c)]
            if (r, c) in occB:
                ch = 'B%d' % occB[(r, c)]
            line += ch
        out.append(line)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('botA')
    p.add_argument('botB')
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--R', type=int, default=8)
    p.add_argument('--C', type=int, default=8)
    p.add_argument('--U', type=int, default=2)
    p.add_argument('--V', type=int, default=1)
    p.add_argument('--T', type=int, default=30)
    p.add_argument('--known', type=int, default=1)
    p.add_argument('--wall', type=float, default=0.22)
    p.add_argument('--every', type=int, default=1)
    args = p.parse_args()

    g = make_game(args.seed, R=args.R, C=args.C, U=args.U, V=args.V, T=args.T,
                  known=args.known, wall_prob=args.wall)
    def mk(name, label):
        return SubprocessBot([name], name=label) if os.path.exists(name) else \
            {'squatter': SquatterBot, 'greedy': GreedyBot, 'random': RandomBot}[name]()
    A = mk(args.botA, 'A')
    B = mk(args.botB, 'B')
    A.start(g.header(1))
    B.start(g.header(2))
    for rnd in range(1, args.T + 1):
        g.round = rnd
        oA = A.act(g.observation(1))
        oB = B.act(g.observation(2))
        g.resolve({1: oA, 2: oB})
        if rnd % args.every == 0 or rnd == args.T:
            print('--- round %d   A=%s %s   B=%s %s   cells %d : %d'
                  % (rnd, sorted((u.r, u.c) for u in g.units_of(1)), oA,
                     sorted((u.r, u.c) for u in g.units_of(2)), oB, g.count(1), g.count(2)))
            for line in render(g, None):
                print(line)
    print('FINAL %d : %d' % (g.count(1), g.count(2)))


if __name__ == '__main__':
    main()
