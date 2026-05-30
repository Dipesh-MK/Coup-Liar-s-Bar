"""
run_training.py — One command to start training a human-defeating Coup AI.

Usage:
    python run_training.py                      # 2,000,000 steps (recommended)
    python run_training.py --steps 500000       # shorter run
    python run_training.py --resume models/ppo_coup_500000.zip   # resume from checkpoint

After training, run the agent against the WebSocket server:
    python play_vs_ai.py    (see instructions at bottom of this file)
"""

import argparse
import sys
import pathlib

# Ensure project root is on path
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from rl_training.train_ppo import train, resume_training


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a human-defeating Coup AI via self-play MaskablePPO.")
    parser.add_argument(
        "--steps", type=int, default=2_000_000,
        help="Total training timesteps (default: 2,000,000)"
    )
    parser.add_argument(
        "--players", type=int, default=3, choices=[2, 3, 4, 5, 6],
        help="Number of players in training games (default: 3)"
    )
    parser.add_argument(
        "--resume", type=str, default=None,
        help="Path to a saved .zip checkpoint to resume from"
    )
    parser.add_argument(
        "--extra-steps", type=int, default=500_000,
        help="If --resume is set, how many additional steps to train (default: 500,000)"
    )
    args = parser.parse_args()

    if args.resume:
        resume_training(args.resume, additional_timesteps=args.extra_steps)
    else:
        train(total_timesteps=args.steps, num_players=args.players)


if __name__ == "__main__":
    main()
