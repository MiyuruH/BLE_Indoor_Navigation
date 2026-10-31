#!/usr/bin/env python3
"""Benchmark harness: plays a compiled bot against reference bots / other bots."""

import argparse
import statistics
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import make_game  # noqa: E402
from bots import SubprocessBot, RandomBot, GreedyBot, SquatterBot  # noqa: E402

STATS = []

OPPONENTS = {
    'random': RandomBot,
    'greedy': GreedyBot,
    'squatter': SquatterBot,
}


def play_pair(bot_cmd_a, bot_cmd_b, seed, args, swap=False):
    g = make_game(seed, R=args.R, C=args.C, U=args.U, V=args.V, T=args.T,
                  known=args.known, wall_prob=args.wall, corridor=args.corridor)
    A = SubprocessBot([bot_cmd_a], name='A')
    B = SubprocessBot([bot_cmd_b], name='B') if bot_cmd_b else OPPONENTS[args.opponent]()
    if swap:
        res = g.play(B, A)
        a_cells, b_cells = res[1], res[0]
        STATS.append((g.stats[2], g.stats[1]))
    else:
        res = g.play(A, B)
        a_cells, b_cells = res[0], res[1]
        STATS.append((g.stats[1], g.stats[2]))
    return a_cells, b_cells


def run(cmd, args, label=None):
    label = label or os.path.basename(cmd)
    margins = []
    wins = draws = losses = 0
    for seed in range(args.seeds):
        for swap in ([False] if args.no_swap else [False, True]):
            if args.opponent == 'self':
                a, b = play_pair(cmd, cmd, seed + args.seed_offset, args, swap=swap)
            else:
                a, b = play_pair(cmd, None, seed + args.seed_offset, args, swap=swap)
            margins.append(a - b)
            if a > b:
                wins += 1
            elif a == b:
                draws += 1
            else:
                losses += 1
    agg = (dict(new=0, own=0, blocked=0, flip=0, steps=0, block_enemy=0, block_own=0, block_swap=0),
           dict(new=0, own=0, blocked=0, flip=0, steps=0, block_enemy=0, block_own=0, block_swap=0))
    for st in STATS:
        for side in (0, 1):
            for k in agg[side]:
                agg[side][k] += st[side][k]
    STATS.clear()
    n = len(margins)
    total = sum(margins)
    d = agg[0]
    o = agg[1]
    print('%-16s W/D/L %3d/%3d/%3d   avg margin %+6.2f   total %+5d   min %+3d max %+3d'
          % (label, wins, draws, losses, total / n, total, min(margins), max(margins)))
    print('%-16s   paint %d  own-repaint %d  blocked %d (own %d / enemy %d / swap %d)  flips %d  (steps %d)'
          % ('', d['new'], d['own'], d['blocked'], d['block_own'], d['block_enemy'],
             d['block_swap'], d['flip'], d['steps']))
    return margins


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--bot', default='./sim/new_bot')
    p.add_argument('--bot2', default=None, help='second bot (comparison)')
    p.add_argument('--opponent', default='greedy', choices=list(OPPONENTS) + ['self'])
    p.add_argument('--seeds', type=int, default=20)
    p.add_argument('--seed-offset', type=int, default=0)
    p.add_argument('--R', type=int, default=8)
    p.add_argument('--C', type=int, default=8)
    p.add_argument('--U', type=int, default=2)
    p.add_argument('--V', type=int, default=1)
    p.add_argument('--T', type=int, default=30)
    p.add_argument('--known', type=int, default=1)
    p.add_argument('--wall', type=float, default=0.22)
    p.add_argument('--corridor', action='store_true')
    p.add_argument('--no-swap', action='store_true')
    p.add_argument('--only-old', action='store_true')
    args = p.parse_args()

    if not args.only_old:
        run(args.bot, args, label=os.path.basename(args.bot))
    if args.bot2:
        run(args.bot2, args, label=os.path.basename(args.bot2))


if __name__ == '__main__':
    main()
