#!/usr/bin/env python3
"""Final report: old bot vs new bot against the same opponents, many scenarios."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import make_game  # noqa: E402
from bots import SubprocessBot, RandomBot, GreedyBot, SquatterBot  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OLD = os.path.join(HERE, 'old_bot')

SCENARIOS = [
    ('4x4   U2 V1 T15', dict(R=4, C=4, U=2, V=1, T=15, known=1, wall=0.22)),
    ('5x5   U2 V1 T20', dict(R=5, C=5, U=2, V=1, T=20, known=1, wall=0.20)),
    ('6x6   U2 V1 T25', dict(R=6, C=6, U=2, V=1, T=25, known=1, wall=0.22)),
    ('8x8   U2 V1 T25', dict(R=8, C=8, U=2, V=1, T=25, known=1, wall=0.22)),
    ('8x8   U2 V1 T40', dict(R=8, C=8, U=2, V=1, T=40, known=1, wall=0.22)),
    ('10x10 U2 V1 T35', dict(R=10, C=10, U=2, V=1, T=35, known=1, wall=0.25)),
    ('12x12 U2 V2 T45', dict(R=12, C=12, U=2, V=2, T=45, known=1, wall=0.22)),
    ('8x8   U2 V1 T25 fog', dict(R=8, C=8, U=2, V=1, T=25, known=0, wall=0.22)),
    ('10x10 U3 V1 T35', dict(R=10, C=10, U=3, V=1, T=35, known=1, wall=0.22)),
    ('6x6   U4 V1 T25', dict(R=6, C=6, U=4, V=1, T=25, known=1, wall=0.22)),
]

OPPS = [('old bot', 'bin'), ('greedy', GreedyBot), ('squatter', SquatterBot),
        ('random', RandomBot)]


def run(bot_path, opp, sc, seeds):
    m = []
    for seed in range(seeds):
        for swap in (0, 1):
            g = make_game(seed, R=sc['R'], C=sc['C'], U=sc['U'], V=sc['V'], T=sc['T'],
                          known=sc['known'], wall_prob=sc['wall'])
            A = SubprocessBot([bot_path])
            B = SubprocessBot([OLD]) if opp == 'bin' else opp()
            if swap:
                r = g.play(B, A)
                m.append(r[1] - r[0])
            else:
                r = g.play(A, B)
                m.append(r[0] - r[1])
    return sum(m) / len(m)


def main():
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    new = os.path.join(HERE, 'new_bot')
    hdr = '%-22s' % 'scenario'
    for name, _ in OPPS:
        hdr += '%14s' % name
    print(hdr)
    tot_old = 0.0
    tot_new = 0.0
    n = 0
    for label, sc in SCENARIOS:
        line = '%-22s' % label
        for name, opp in OPPS:
            o = run(OLD, opp, sc, seeds)
            nw = run(new, opp, sc, seeds)
            tot_old += o
            tot_new += nw
            n += 1
            line += '%7.2f->%5.2f' % (o, nw)
        print(line)
    print('%-22s' % 'MEAN', ' ' * 6 + 'old %.2f  new %.2f' % (tot_old / n, tot_new / n))


if __name__ == '__main__':
    main()
