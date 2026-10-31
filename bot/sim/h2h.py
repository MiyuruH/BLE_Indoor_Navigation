#!/usr/bin/env python3
"""Head to head: two compiled bots play each other over a set of scenarios."""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import make_game  # noqa: E402
from bots import SubprocessBot  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument('botA')
    p.add_argument('botB')
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
    p.add_argument('--swap', type=int, default=1, help='play both sides')
    p.add_argument('-v', action='store_true')
    args = p.parse_args()

    margins = []
    t0 = time.time()
    for seed in range(args.seeds):
        for sw in (range(2) if args.swap else [0]):
            g = make_game(seed + args.seed_offset, R=args.R, C=args.C, U=args.U, V=args.V,
                          T=args.T, known=args.known, wall_prob=args.wall,
                          corridor=args.corridor)
            A = SubprocessBot([args.botA], name='A')
            B = SubprocessBot([args.botB], name='B')
            if sw:
                r = g.play(B, A)
                a, b = r[1], r[0]
            else:
                r = g.play(A, B)
                a, b = r[0], r[1]
            margins.append(a - b)
            if args.v:
                print('seed %2d swap %d -> %2d : %2d' % (seed, sw, a, b))

    n = len(margins)
    w = sum(1 for m in margins if m > 0)
    d = sum(1 for m in margins if m == 0)
    l = sum(1 for m in margins if m < 0)
    print('A=%s  B=%s' % (os.path.basename(args.botA), os.path.basename(args.botB)))
    print('games %d   A wins %d  draws %d  A losses %d   avg margin %+0.2f  (%.1fs)'
          % (n, w, d, l, sum(margins) / n, time.time() - t0))


if __name__ == '__main__':
    main()
