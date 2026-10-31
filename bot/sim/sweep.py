#!/usr/bin/env python3
"""Compile solution.cpp with different -D values and score each variant."""

import argparse
import itertools
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import suite  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src', 'solution.cpp')
OUT = '/tmp/sweep_bot'


def build(defs, out=OUT):
    cmd = ['g++', '-O2', '-std=c++17', '-o', out, SRC]
    for k, v in defs.items():
        cmd.insert(1, '-D%s=%s' % (k, v))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[:2000])
        raise SystemExit('build failed')
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--param', default=None, help='comma list of values')
    p.add_argument('--name', default=None)
    p.add_argument('--set', default='', help='fixed defs k=v,k=v')
    p.add_argument('--seeds', type=int, default=4)
    args = p.parse_args()

    fixed = {}
    if args.set:
        for kv in args.set.split(','):
            k, v = kv.split('=')
            fixed[k] = v

    if args.param is None:
        bot = build(fixed)
        suite.evaluate(bot, seeds=args.seeds)
        return

    for v in args.param.split(','):
        defs = dict(fixed)
        defs[args.name] = v
        bot = build(defs)
        print('== %s=%s' % (args.name, v))
        suite.evaluate(bot, seeds=args.seeds)


if __name__ == '__main__':
    main()
