#!/usr/bin/env python3
"""Run one game with BOT A in debug mode (its stderr goes to the console)."""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import make_game
from bots import SubprocessBot, GreedyBot, RandomBot, SquatterBot

p = argparse.ArgumentParser()
p.add_argument('bot')
p.add_argument('--opp', default='old')
p.add_argument('--seed', type=int, default=1)
p.add_argument('--R', type=int, default=5); p.add_argument('--C', type=int, default=5)
p.add_argument('--U', type=int, default=2); p.add_argument('--V', type=int, default=1)
p.add_argument('--T', type=int, default=20); p.add_argument('--known', type=int, default=1)
p.add_argument('--wall', type=float, default=0.2)
a = p.parse_args()

g = make_game(a.seed, R=a.R, C=a.C, U=a.U, V=a.V, T=a.T, known=a.known, wall_prob=a.wall)
A = SubprocessBot([a.bot], devnull_err=False)
if a.opp == 'old':
    B = SubprocessBot([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'old_bot')])
else:
    B = {'greedy': GreedyBot, 'random': RandomBot, 'squatter': SquatterBot}[a.opp]()
print('FINAL', g.play(A, B))
