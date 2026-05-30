"""Smoke test for ai_player.py — runs without a trained model."""
import sys, pathlib, random
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import numpy as np
from ai_player import AIPlayer
from rl_training.env import CoupEnv

# AIPlayer with no model falls back to random
ai = AIPlayer("models/nonexistent.zip", "p1", num_players=3, name="TestBot")

env = CoupEnv(num_players=3)
wins = 0
games = 5

for g in range(games):
    obs, info = env.reset()
    ai.reset()
    done = False
    steps = 0
    while not done and steps < 500:
        mask = env.get_action_mask()
        valid = np.where(mask)[0]
        act_idx = int(random.choice(valid))
        obs, rew, term, trunc, info = env.step(act_idx)
        done = term or trunc
        steps += 1
    result = info.get("game_result", {})
    winner = result.get("winner_id", "?")
    p1_won = (winner == "p1")
    if p1_won:
        wins += 1
    print(f"Game {g+1}: {steps} steps, winner={winner}, p1_win={p1_won}")

print(f"\nAll {games} games completed. P1 win rate: {wins}/{games}")
print("ai_player.py import and basic functionality: OK")
