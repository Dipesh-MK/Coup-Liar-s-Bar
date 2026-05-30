"""
rl_training/tournament.py — Round-robin tournament between Coup models and heuristics with Elo tracking.
"""

import sys
import pathlib
import json
import random
import numpy as np
from typing import Dict, Any, List, Tuple, Optional, Callable

# Ensure project root is in path
_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import Character, ActionType, GameStage
from coup_engine import Game
from rl_training.env import CoupEnv
from rl_training.observation import encode_observation, ActionHistory
from rl_training.evaluate import (
    BaseAgent, RandomAgent, PassiveAgent, AggressiveAgent, RuleBasedAgent, RotatableCoupEnv
)

try:
    from sb3_contrib import MaskablePPO
except ImportError:
    MaskablePPO = None


# ---------------------------------------------------------------------------
# Elo Rating System Helpers
# ---------------------------------------------------------------------------

def calculate_elo_updates(ratings: List[float], winner_idx: int, k_factor: float = 32.0) -> List[float]:
    """
    Computes multiplayer Elo rating adjustments.
    Uses Bradley-Terry model extension: expected score is proportional to 10^(R/400).
    """
    transformed = [10.0 ** (r / 400.0) for r in ratings]
    total_transformed = sum(transformed)
    
    expected = [t / total_transformed for t in transformed]
    actual = [0.0] * len(ratings)
    actual[winner_idx] = 1.0
    
    updates = [k_factor * (act - exp) for act, exp in zip(actual, expected)]
    return updates


# ---------------------------------------------------------------------------
# Tournament Execution
# ---------------------------------------------------------------------------

def run_tournament(
    model_paths: dict,
    games_per_matchup: int = 500,
    num_players: int = 3,
    include_rule_based: bool = True,
) -> dict:
    """Runs a round-robin tournament between all models and a rule-based baseline."""
    print("Initializing tournament...")
    
    # 1. Load PPO models
    models = {}
    if MaskablePPO is not None:
        for name, path in model_paths.items():
            if pathlib.Path(path).exists():
                try:
                    models[name] = MaskablePPO.load(path)
                    print(f"Loaded model '{name}' from {path}")
                except Exception as exc:
                    print(f"Warning: failed to load model '{name}' ({exc}).")
            else:
                print(f"Model path {path} for '{name}' does not exist.")

    # 2. Add RuleBased as a pseudo-model
    participants = list(models.keys())
    if include_rule_based:
        participants.append("RuleBased")

    # Initialize Elo ratings at 1000
    elo_ratings = {name: 1000.0 for name in participants}
    
    # Record stats
    matchup_wins = {name: {other: 0 for other in participants} for name in participants}
    matchup_games = {name: {other: 0 for other in participants} for name in participants}
    total_wins = {name: 0 for name in participants}
    total_games = {name: 0 for name in participants}

    # Action mapping references
    env_map = CoupEnv(num_players=num_players)
    mapping_keys = env_map.action_key_to_index
    mapping_actions = env_map.action_index_to_action

    # 3. Matchup loops (combinations of players)
    # Generate all unique combinations of 3 participants (with replacement allowed if list is small,
    # but standard is unique combinations to keep it clean)
    import itertools
    all_combos = []
    
    # For 3 players, we find all combinations of size 3 from our participant list
    # (or permutations if we want to test all seats, but we handle seat rotation inside)
    if len(participants) >= 3:
        combos = list(itertools.combinations(participants, 3))
    else:
        # Fallback if less than 3 participants: fill with RuleBased or Random
        print("Not enough participants. Filling combinations with RuleBased.")
        needed = 3 - len(participants)
        temp_list = list(participants)
        for _ in range(needed):
            temp_list.append("RuleBased")
        combos = [tuple(temp_list)]

    print(f"Running round-robin matchups for {len(combos)} player groups...")

    for combo in combos:
        # Run games_per_matchup games for each group combo
        print(f"Matchup: {combo}")
        
        for game_idx in range(games_per_matchup):
            # Rotate seats to neutralize positional advantage
            seat_rotation = [combo[(game_idx + offset) % 3] for offset in range(3)]
            
            # Setup environment for this seat configuration
            # We pick the base env, p1 is always the learning agent, but we can map
            # our participants to the respective seats
            # To do this, we run a custom game loop directly on a Game object!
            # It's cleaner than modifying learning_agent_id inside tournament.
            player_ids = ["p1", "p2", "p3"]
            player_names = seat_rotation
            game = Game(player_ids, player_names)
            
            # Instantiate policies for each seat
            policies = {}
            for seat_idx, name in enumerate(seat_rotation):
                pid = f"p{seat_idx + 1}"
                
                if name == "RuleBased":
                    policies[pid] = RuleBasedAgent(mapping_keys, mapping_actions, pid)
                elif name in models:
                    # Model agent wrapper
                    model_obj = models[name]
                    class ModelAgent(BaseAgent):
                        def __init__(self, m, p_id):
                            self.m = m
                            self.p_id = p_id
                        def select_action(self, obs, action_mask, game_state):
                            act, _ = self.m.predict(obs, action_masks=action_mask, deterministic=True)
                            return int(act)
                    policies[pid] = ModelAgent(model_obj, pid)
                else:
                    # Fallback Random
                    policies[pid] = RandomAgent(mapping_keys, mapping_actions)

            # Run game
            history = ActionHistory()
            steps = 0
            
            while game.state.stage != GameStage.GAME_OVER and steps < 1000:
                # Find acting player
                stage = game.state.stage
                acting_pid = ""
                if stage == GameStage.ACTION_SELECTION:
                    acting_pid = game.state.current_player.player_id
                elif stage == GameStage.CHALLENGE_WINDOW:
                    acting_pid = game.state.pending_challenge_players[0]
                elif stage == GameStage.BLOCK_WINDOW:
                    acting_pid = game.state.pending_block_players[0]
                elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
                    acting_pid = game.state.pending_challenge_players[0]
                elif stage == GameStage.REVEAL_CARD_CHALLENGE:
                    acting_pid = game.state.challenge_target_id
                elif stage == GameStage.REVEAL_CARD_LOSS:
                    acting_pid = game.state.reveal_loss_player_id
                elif stage == GameStage.EXCHANGE_SELECTION:
                    acting_pid = game.state.active_action.player_id

                if not acting_pid:
                    break

                # Get view & obs
                view = game.state.get_player_view(acting_pid)
                obs_val = encode_observation(view, acting_pid, history, num_players)
                
                # Get action mask
                mask_val = np.zeros(3 * num_players + 35, dtype=bool)
                legal_acts = []
                # Re-compute mask using engine logic
                # For simplicity, instantiate temporary env
                _temp_env = CoupEnv(num_players=num_players)
                _temp_env.engine.game = game
                mask_val = _temp_env.get_action_mask()
                
                # Query policy
                action_idx = policies[acting_pid].select_action(obs_val, mask_val, game.state)
                action_dict = _temp_env.action_index_to_action[action_idx]

                # Step engine
                prev_stage = game.state.stage
                prev_action = game.state.active_action
                success, msg = game.handle_input(acting_pid, action_dict)
                
                if success:
                    # Update history logs
                    p_idx = int(acting_pid[1:]) - 1
                    name = action_dict.get("action")
                    if name not in ["challenge", "pass", "block", "reveal", "exchange"]:
                        challenged = (game.state.challenge_challenger_id is not None)
                        succeeded = True
                        if name == ActionType.TAX.value and challenged:
                            succeeded = (game.state.reveal_loss_reason != "failed_challenge_loss")
                        history.push(p_idx, name, challenged, succeeded)
                
                steps += 1

            # Game finished, find winner
            active_players = [p for p in game.state.players if p.is_active]
            if len(active_players) == 1:
                winner_pid = active_players[0].player_id
                winner_seat_idx = int(winner_pid[1:]) - 1
                winner_name = seat_rotation[winner_seat_idx]
                
                # Update stats
                total_wins[winner_name] += 1
                for seat_idx, name in enumerate(seat_rotation):
                    total_games[name] += 1
                    if name != winner_name:
                        matchup_wins[winner_name][name] += 1
                    for other in seat_rotation:
                        if name != other:
                            matchup_games[name][other] += 1

                # Update Elo
                current_ratings = [elo_ratings[name] for name in seat_rotation]
                updates = calculate_elo_updates(current_ratings, winner_seat_idx)
                for seat_idx, name in enumerate(seat_rotation):
                    elo_ratings[name] += updates[seat_idx]

    # Save to logs
    results = {
        "participants": elo_ratings,
        "total_wins": total_wins,
        "total_games": total_games,
        "matchup_matrix": {name: {other: (matchup_wins[name][other] / matchup_games[name][other] if matchup_games[name][other] > 0 else 0.0) for other in participants} for name in participants}
    }
    
    logs_dir = pathlib.Path("rl_training/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    with open(logs_dir / "tournament_results.json", "w") as f:
        json.dump(results, f, indent=4)

    return results


def print_tournament_results(results: dict):
    """Formats and prints the Elo leaderboard and head-to-head matchup matrix."""
    print("\n" + "=" * 60)
    print("TOURNAMENT RESULTS")
    print("=" * 60)
    
    # Leaderboard
    leaderboard = sorted(results["participants"].items(), key=lambda x: x[1], reverse=True)
    print("Leaderboard (Elo-style rating):")
    for idx, (name, elo) in enumerate(leaderboard, 1):
        wins = results["total_wins"].get(name, 0)
        games = results["total_games"].get(name, 0)
        win_rate = wins / games if games > 0 else 0.0
        print(f"  {idx}. {name:<12} {int(elo):4d} pts   Win Rate: {win_rate:.1%}")

    # Matchup matrix
    print("\nHead-to-Head Win Rates:")
    names = list(results["participants"].keys())
    
    # Print headers
    header_str = " " * 12
    for n in names:
        header_str += f"{n[:8]:>10}"
    print(header_str)
    
    # Print rows
    for r_name in names:
        row_str = f"{r_name[:10]:<12}"
        for c_name in names:
            if r_name == c_name:
                row_str += f"{'-':>10}"
            else:
                val = results["matchup_matrix"][r_name][c_name]
                row_str += f"{val:9.1%}"
        print(row_str)

    print("=" * 60 + "\n")


if __name__ == "__main__":
    # Test tournament run
    model_paths = {
        "Base": "models/ppo_coup_final.zip",
        "Bluffer": "models/ppo_coup_bluffer.zip",
        "Aggressor": "models/ppo_coup_aggressor.zip",
        "Manipulator": "models/ppo_coup_manipulator.zip"
    }
    # Create dummy files if they don't exist for test purposes
    # For actual evaluation, they must be trained
    for name, p in model_paths.items():
        if not pathlib.Path(p).exists() and pathlib.Path("models/ppo_coup_final.zip").exists():
            # Copy base to others for testing
            import shutil
            shutil.copy("models/ppo_coup_final.zip", p)
            
    results = run_tournament(model_paths, games_per_matchup=50)
    print_tournament_results(results)
