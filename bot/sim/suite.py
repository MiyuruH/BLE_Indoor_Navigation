#!/usr/bin/env python3
"""Evaluation suite: one bot vs several opponents over several scenarios."""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import make_game, score_points  # noqa: E402
from bots import SubprocessBot, RandomBot, GreedyBot, SquatterBot  # noqa: E402

CONFIGS = [
    dict(name='t4', R=4, C=4, U=2, V=1, T=15, known=1, wall=0.22),
    dict(name='t5', R=5, C=5, U=2, V=1, T=20, known=1, wall=0.20),
    dict(name='t6', R=6, C=6, U=2, V=1, T=25, known=1, wall=0.22),
    dict(name='s8', R=8, C=8, U=2, V=1, T=25, known=1, wall=0.22),
    dict(name='m10', R=10, C=10, U=2, V=1, T=35, known=1, wall=0.25),
    dict(name='fog', R=8, C=8, U=2, V=1, T=25, known=0, wall=0.22),
    dict(name='vis2', R=8, C=8, U=2, V=2, T=25, known=1, wall=0.22),
    dict(name='u3', R=10, C=10, U=3, V=1, T=35, known=1, wall=0.22),
]
SMALL = ('t4', 't5', 't6')

PY_OPPONENTS = {
    'random': RandomBot,
    'greedy': GreedyBot,
    'squatter': SquatterBot,
}


def one_game(bot_path, opp, cfg, seed, swap):
    g = make_game(seed, R=cfg['R'], C=cfg['C'], U=cfg['U'], V=cfg['V'], T=cfg['T'],
                  known=cfg['known'], wall_prob=cfg['wall'])
    A = SubprocessBot([bot_path], name='A')
    if isinstance(opp, str):
        B = SubprocessBot([opp], name='B')
    else:
        B = opp()
    if swap:
        r = g.play(B, A)
        a, b = r[1], r[0]
        st = (g.stats[2], g.stats[1])
    else:
        r = g.play(A, B)
        a, b = r[0], r[1]
        st = (g.stats[1], g.stats[2])
    return a, b, st


def evaluate(bot_path, seeds=4, configs=CONFIGS, opponents=None, quiet=False):
    """Score = mean judge points (0-100) over every game played."""
    opponents = opponents or (['old'] + list(PY_OPPONENTS))
    cfg_pts = []
    all_pts = []
    t0 = time.time()
    for cfg in configs:
        cfg_p = []
        for oppname in opponents:
            if oppname == 'old':
                opp = OLD_BOT
                if not os.path.exists(opp):
                    continue
            else:
                opp = PY_OPPONENTS[oppname]
            pts = []
            st = dict(new=0, own=0, blocked=0, flip=0, steps=0,
                      block_enemy=0, block_own=0, block_swap=0)
            for seed in range(seeds):
                for swap in (0, 1):
                    a, b, stats = one_game(bot_path, opp, cfg, seed, swap)
                    pts.append(score_points(a, b))
                    for k in st:
                        st[k] += stats[0].get(k, 0)
            sc = 10.0 * sum(pts) / len(pts)
            cfg_p.extend(pts)
            all_pts.extend(pts)
            if not quiet:
                print('  %-7s vs %-9s  score %5.2f/10   [%4.2f..%4.2f]  blocked %d/%d own %d'
                      % (cfg['name'], oppname, sc, min(pts), max(pts),
                         st['blocked'], st['steps'], st['own']))
        cfg_pts.append(10.0 * sum(cfg_p) / len(cfg_p))
    bal = sum(cfg_pts) / len(cfg_pts)
    small = [a for c, a in zip(configs, cfg_pts) if c['name'] in SMALL]
    smallsc = (sum(small) / len(small)) if small else float('nan')
    print('  per-config: ' + '  '.join('%s %5.1f' % (c['name'], a)
                                       for c, a in zip(configs, cfg_pts)))
    print('SCORE small %5.1f   all %5.1f   (%d games, %.1fs)'
          % (smallsc, bal, len(all_pts), time.time() - t0))
    return bal


OLD_BOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'old_bot')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('bot')
    p.add_argument('--seeds', type=int, default=4)
    p.add_argument('--opponents', default='')
    p.add_argument('--configs', default='')
    p.add_argument('--small-only', action='store_true')
    args = p.parse_args()
    opps = args.opponents.split(',') if args.opponents else None
    if getattr(args, 'small_only', False):
        cfgs = [c for c in CONFIGS if c['name'] in SMALL]
        args.configs = ''
    cfgs = CONFIGS
    if args.configs:
        want = args.configs.split(',')
        cfgs = [c for c in CONFIGS if c['name'] in want]
    evaluate(args.bot, seeds=args.seeds, opponents=opps, configs=cfgs)


if __name__ == '__main__':
    main()
