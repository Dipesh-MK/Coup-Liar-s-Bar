"""
rl_training/meta_analyzer.py — Deep analysis of what strategies actually emerged.
"""

import sys
import pathlib
import json
import random
from collections import defaultdict
import numpy as np
from typing import Dict, Any, List, Tuple, Optional

# Ensure project root is in path
_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import Character, ActionType, GameStage, ACTION_ROLES, BLOCK_ROLES
from coup_engine import Game
from rl_training.env import CoupEnv
from rl_training.observation import encode_observation, ActionHistory
from rl_training.evaluate import (
    BaseAgent, RandomAgent, PassiveAgent, AggressiveAgent, RuleBasedAgent
)

try:
    from sb3_contrib import MaskablePPO
except ImportError:
    MaskablePPO = None


# ---------------------------------------------------------------------------
# Deep Strategy Analyzer
# ---------------------------------------------------------------------------

def analyze_learned_strategy(model_path: str, num_games: int = 500) -> dict:
    """
    Play games, record everything, and compute action distributions, bluffing
    patterns, challenge behavior, and adaptive profiles for the target agent.
    """
    print(f"Analyzing strategy for model: {model_path}")
    
    # 1. Load PPO model
    model = None
    if MaskablePPO is not None:
        if pathlib.Path(model_path).exists():
            try:
                model = MaskablePPO.load(model_path)
                print("Model loaded successfully.")
            except Exception as e:
                print(f"Warning: failed to load model ({e}). Using rule-based fallback.")
        else:
            print(f"Warning: model path {model_path} does not exist. Using rule-based fallback.")

    num_players = 3
    
    # Action mapping references
    env_map = CoupEnv(num_players=num_players)
    mapping_keys = env_map.action_key_to_index
    mapping_actions = env_map.action_index_to_action

    # Target Agent data structure to gather statistics
    stats = {
        "action_selection_count": 0,
        "actions": {act.value: 0 for act in ActionType},
        "actions_by_coins": {
            "less_than_5": {act.value: 0 for act in ActionType},
            "5_or_more": {act.value: 0 for act in ActionType}
        },
        "actions_by_influence": {
            "1_influence": {act.value: 0 for act in ActionType},
            "2_influence": {act.value: 0 for act in ActionType}
        },
        "bluff_attempts": {char.value: 0 for char in Character},
        "bluff_successes": {char.value: 0 for char in Character},
        "bluff_total_claims": {char.value: 0 for char in Character},
        "bluff_by_stage": {
            "early": {"attempts": 0, "total_actions": 0},  # turns 1-8
            "mid": {"attempts": 0, "total_actions": 0},    # turns 9-18
            "late": {"attempts": 0, "total_actions": 0}     # turns 19+
        },
        "bluff_by_opponent_type": {
            "rule_based": {"attempts": 0, "total_actions": 0},
            "passive": {"attempts": 0, "total_actions": 0},
            "aggressive": {"attempts": 0, "total_actions": 0}
        },
        "challenges": {
            "total_opportunities": 0,
            "made": 0,
            "won": 0,
            "challenges_by_action": defaultdict(int),
            "challenge_by_opponent_action_count": {
                "used_0_1_times": {"opportunities": 0, "challenges": 0},
                "used_2_plus_times": {"opportunities": 0, "challenges": 0}
            },
            "challenge_by_influence": {
                "1_influence": {"opportunities": 0, "challenges": 0},
                "2_influence": {"opportunities": 0, "challenges": 0}
            }
        },
        "blocks": {
            "total_opportunities": 0,
            "made": 0,
            "passed": 0,
            "by_character": {char.value: 0 for char in Character}
        },
        "adaptive": {
            "stage_actions": {
                "early": {act.value: 0 for act in ActionType},
                "mid": {act.value: 0 for act in ActionType},
                "late": {act.value: 0 for act in ActionType}
            },
            "winning_actions": {act.value: 0 for act in ActionType},
            "losing_actions": {act.value: 0 for act in ActionType},
            "steals_by_opponent_coins": {
                "richest": 0,
                "other": 0
            },
            "duke_claims_after_challenged_loss": 0,
            "duke_claims_total_after_challenged_loss": 0
        }
    }

    # Running tournament loop
    for game_idx in range(num_games):
        # Rotate seat index
        seat_idx = game_idx % num_players
        target_pid = f"p{seat_idx + 1}"
        
        # Decide opponent profile for this game (60/20/20 mix)
        opp_roll = game_idx % 5
        if opp_roll < 3:
            opp_type = "rule_based"
        elif opp_roll == 3:
            opp_type = "passive"
        else:
            opp_type = "aggressive"

        player_ids = ["p1", "p2", "p3"]
        player_names = [f"Player {i}" for i in range(1, 4)]
        game = Game(player_ids, player_names)
        
        # Setup policies
        policies = {}
        for s_idx in range(num_players):
            pid = f"p{s_idx + 1}"
            if pid == target_pid:
                # Target AI policy
                if model is not None:
                    class ModelAgent(BaseAgent):
                        def __init__(self, m, p_id):
                            self.m = m
                            self.p_id = p_id
                        def select_action(self, obs, action_mask, game_state):
                            act, _ = self.m.predict(obs, action_masks=action_mask, deterministic=True)
                            return int(act)
                    policies[pid] = ModelAgent(model, pid)
                else:
                    # Heuristic RuleBased as a proxy if PPO model not found
                    policies[pid] = RuleBasedAgent(mapping_keys, mapping_actions, pid)
            else:
                # Opponent policy
                if opp_type == "rule_based":
                    policies[pid] = RuleBasedAgent(mapping_keys, mapping_actions, pid)
                elif opp_type == "passive":
                    policies[pid] = PassiveAgent(mapping_keys, mapping_actions)
                elif opp_type == "aggressive":
                    policies[pid] = AggressiveAgent(mapping_keys, mapping_actions, pid)

        # Track turn history logs within this game
        history = ActionHistory()
        steps = 0
        
        # Keep track of bluffs in progress
        # Key: (turn_number, pid, claimed_char, category) -> True if bluff
        bluffs_in_progress = {}
        
        # Keep track of active challenges by target
        active_challenge = None  # (challenger_pid, defender_pid, action_name, log_len_before)

        # Count Duke claims after being challenged and losing
        target_lost_duke_challenge_this_game = False

        while game.state.stage != GameStage.GAME_OVER and steps < 1000:
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

            # Get acting player state
            me = game.state.get_player(acting_pid)
            my_cards = me.cards
            coins = me.coins
            turn = game.state.turn_number

            # Determine stage key
            if turn <= 8:
                stage_key = "early"
            elif turn <= 18:
                stage_key = "mid"
            else:
                stage_key = "late"

            # Reconstruct mask
            _temp_env = CoupEnv(num_players=num_players)
            _temp_env.engine.game = game
            mask_val = _temp_env.get_action_mask()
            
            view = game.state.get_player_view(acting_pid)
            obs_val = encode_observation(view, acting_pid, history, num_players)

            action_idx = policies[acting_pid].select_action(obs_val, mask_val, game.state)
            action_dict = _temp_env.action_index_to_action[action_idx]

            # Let's intercept BEFORE taking the step if it's the target agent
            if acting_pid == target_pid:
                action_name = action_dict.get("action")
                
                if stage == GameStage.ACTION_SELECTION:
                    stats["action_selection_count"] += 1
                    if action_name in stats["actions"]:
                        stats["actions"][action_name] += 1
                        
                    # 1. Action distribution by coins
                    coin_bucket = "less_than_5" if coins < 5 else "5_or_more"
                    if action_name in stats["actions_by_coins"][coin_bucket]:
                        stats["actions_by_coins"][coin_bucket][action_name] += 1
                        
                    # 2. Action distribution by influence
                    inf_bucket = "1_influence" if len(my_cards) == 1 else "2_influence"
                    if action_name in stats["actions_by_influence"][inf_bucket]:
                        stats["actions_by_influence"][inf_bucket][action_name] += 1

                    # 3. Action distribution by stage
                    if action_name in stats["adaptive"]["stage_actions"][stage_key]:
                        stats["adaptive"]["stage_actions"][stage_key][action_name] += 1

                    # 4. Action distribution by winning/losing
                    other_active = [p for p in game.state.players if p.is_active and p.player_id != target_pid]
                    avg_opp_cards = np.mean([len(p.cards) for p in other_active]) if other_active else 0
                    if len(my_cards) > avg_opp_cards:
                        if action_name in stats["adaptive"]["winning_actions"]:
                            stats["adaptive"]["winning_actions"][action_name] += 1
                    elif len(my_cards) < avg_opp_cards:
                        if action_name in stats["adaptive"]["losing_actions"]:
                            stats["adaptive"]["losing_actions"][action_name] += 1

                    # 5. Steals by opponent coins
                    if action_name == ActionType.STEAL.value:
                        target_id = action_dict.get("target_id")
                        target_player = game.state.get_player(target_id)
                        richest_opp = max(other_active, key=lambda p: p.coins) if other_active else None
                        if richest_opp and target_player.coins >= richest_opp.coins:
                            stats["adaptive"]["steals_by_opponent_coins"]["richest"] += 1
                        else:
                            stats["adaptive"]["steals_by_opponent_coins"]["other"] += 1

                    # 6. Duke claims after challenged loss
                    if action_name == ActionType.TAX.value:
                        stats["adaptive"]["duke_claims_total_after_challenged_loss"] += 1
                        if target_lost_duke_challenge_this_game:
                            stats["adaptive"]["duke_claims_after_challenged_loss"] += 1

                    # 7. Bluffing pattern analysis (Action)
                    claimed_char = None
                    if action_name == ActionType.TAX.value:
                        claimed_char = Character.DUKE
                    elif action_name == ActionType.STEAL.value:
                        claimed_char = Character.CAPTAIN
                    elif action_name == ActionType.ASSASSINATE.value:
                        claimed_char = Character.ASSASSIN
                    elif action_name == ActionType.EXCHANGE.value:
                        claimed_char = Character.AMBASSADOR

                    if claimed_char:
                        stats["bluff_total_claims"][claimed_char.value] += 1
                        stats["bluff_by_stage"][stage_key]["total_actions"] += 1
                        stats["bluff_by_opponent_type"][opp_type]["total_actions"] += 1
                        
                        is_bluff = claimed_char not in my_cards
                        if is_bluff:
                            stats["bluff_attempts"][claimed_char.value] += 1
                            stats["bluff_by_stage"][stage_key]["attempts"] += 1
                            stats["bluff_by_opponent_type"][opp_type]["attempts"] += 1
                            # Register bluff
                            bluffs_in_progress[(turn, target_pid, claimed_char.value)] = True

                elif stage == GameStage.BLOCK_WINDOW:
                    stats["blocks"]["total_opportunities"] += 1
                    if action_name == "block":
                        stats["blocks"]["made"] += 1
                        block_char = action_dict.get("character")
                        if block_char in stats["blocks"]["by_character"]:
                            stats["blocks"]["by_character"][block_char] += 1
                            
                        # Bluff check for block
                        claimed_char = Character(block_char)
                        stats["bluff_total_claims"][claimed_char.value] += 1
                        stats["bluff_by_stage"][stage_key]["total_actions"] += 1
                        stats["bluff_by_opponent_type"][opp_type]["total_actions"] += 1
                        
                        is_bluff = claimed_char not in my_cards
                        if is_bluff:
                            stats["bluff_attempts"][claimed_char.value] += 1
                            stats["bluff_by_stage"][stage_key]["attempts"] += 1
                            stats["bluff_by_opponent_type"][opp_type]["attempts"] += 1
                            bluffs_in_progress[(turn, target_pid, claimed_char.value)] = True
                    else:
                        stats["blocks"]["passed"] += 1

                elif stage in [GameStage.CHALLENGE_WINDOW, GameStage.BLOCK_CHALLENGE_WINDOW]:
                    stats["challenges"]["total_opportunities"] += 1
                    
                    # 1. Challenge by influence
                    inf_bucket = "1_influence" if len(my_cards) == 1 else "2_influence"
                    stats["challenges"]["challenge_by_influence"][inf_bucket]["opportunities"] += 1
                    if action_name == "challenge":
                        stats["challenges"]["challenge_by_influence"][inf_bucket]["challenges"] += 1

                    # 2. Challenge by opponent action count
                    opp_action_type = ""
                    opponent_pid = ""
                    if stage == GameStage.CHALLENGE_WINDOW:
                        active_act = game.state.active_action
                        opp_action_type = active_act.action_type.value
                        opponent_pid = active_act.player_id
                    else:
                        active_blk = game.state.active_block
                        opp_action_type = f"block {active_blk.character.value}"
                        opponent_pid = active_blk.player_id
                        
                    opp_name = game.state.get_player(opponent_pid).name
                    
                    # Count how many times they used this action previously
                    opp_claims_count = sum(1 for log_msg in game.state.history if f"{opp_name} declared {opp_action_type}" in log_msg or f"{opp_name} blocked" in log_msg)
                    
                    freq_bucket = "used_0_1_times" if opp_claims_count < 2 else "used_2_plus_times"
                    stats["challenges"]["challenge_by_opponent_action_count"][freq_bucket]["opportunities"] += 1

                    if action_name == "challenge":
                        stats["challenges"]["challenge_by_opponent_action_count"][freq_bucket]["challenges"] += 1
                        stats["challenges"]["made"] += 1
                        stats["challenges"]["challenges_by_action"][opp_action_type] += 1
                        # Track this challenge to see who wins
                        active_challenge = (target_pid, opponent_pid, opp_action_type, len(game.state.history))

            # Step the engine
            success, msg = game.handle_input(acting_pid, action_dict)
            steps += 1

            if success:
                # Update history log references
                p_idx = int(acting_pid[1:]) - 1
                name = action_dict.get("action")
                if name not in ["challenge", "pass", "block", "reveal", "exchange"]:
                    challenged = (game.state.challenge_challenger_id is not None)
                    succeeded = True
                    history.push(p_idx, name, challenged, succeeded)

            # Check if active challenge resolved
            if active_challenge is not None:
                # Look at history for winner
                challenger_pid, defender_pid, opp_action, prev_hist_len = active_challenge
                new_logs = game.state.history[prev_hist_len:]
                challenge_resolved = False
                challenge_won = False
                
                for log_msg in new_logs:
                    if "failed to prove claim" in log_msg:
                        challenge_resolved = True
                        challenge_won = True  # We challenged, defender failed -> we won
                    elif "proved their claim" in log_msg:
                        challenge_resolved = True
                        challenge_won = False # We challenged, defender proved -> we lost
                        
                if challenge_resolved:
                    if challenge_won:
                        stats["challenges"]["won"] += 1
                    active_challenge = None

            # Check if any bluff resolved (action/block succeeded unchallenged, or failed challenged)
            resolved_bluffs = []
            for (bluff_turn, b_pid, b_char) in bluffs_in_progress:
                # A bluff fails if it gets challenged. If it's challenged, there will be a log showing challenge.
                # If the game moves to next player's turn or another action selection, the bluff succeeded!
                # To be precise, if the challenge stage for that action is over and no challenge was made:
                # Or if we check the logs for this turn.
                # Let's inspect the game history to see if the bluff was challenged.
                # If there's a log: "X challenged Y's claim" or "X challenged Y's block"
                actor_name = game.state.get_player(b_pid).name
                is_challenged = False
                is_resolved = False
                
                # Check history
                for log_msg in game.state.history:
                    # If challenged:
                    if f"challenged {actor_name}'s claim" in log_msg or f"challenged {actor_name}'s block" in log_msg:
                        is_challenged = True
                        is_resolved = True
                
                # If turn advanced or action selection reset and not challenged:
                if game.state.stage == GameStage.ACTION_SELECTION and game.state.current_player.player_id != b_pid:
                    is_resolved = True

                if is_resolved:
                    resolved_bluffs.append((bluff_turn, b_pid, b_char))
                    if not is_challenged:
                        stats["bluff_successes"][b_char] += 1
                    else:
                        # If the bluff was challenged, since we bluffed, we lost the challenge!
                        # If we lost a Duke/Tax challenge, record it for adaptation tracking
                        if b_char == Character.DUKE.value:
                            target_lost_duke_challenge_this_game = True

            for key in resolved_bluffs:
                if key in bluffs_in_progress:
                    del bluffs_in_progress[key]

    # Save full analysis data to logs
    model_name = pathlib.Path(model_path).name
    results_path = pathlib.Path("rl_training/logs") / f"meta_analysis_{model_name.replace('.zip', '')}.json"
    
    # Convert defaultdicts to regular dicts for JSON
    stats["challenges"]["challenges_by_action"] = dict(stats["challenges"]["challenges_by_action"])
    
    with open(results_path, "w") as f:
        json.dump(stats, f, indent=4)
        
    return stats


def print_strategy_profile(analysis: dict, model_name: str):
    """Prints a beautiful strategic profile based on the analyzed telemetry."""
    print("\n" + "=" * 60)
    print(f"STRATEGY PROFILE: {model_name}")
    print("=" * 60)

    # 1. Favorite Actions
    actions = analysis["actions"]
    total_acts = sum(actions.values())
    if total_acts > 0:
        fav_action = max(actions, key=actions.get)
        fav_pct = actions[fav_action] / total_acts
        print(f"Primary Strategy:   {fav_action.upper()}-HEAVY (used in {fav_pct:.1%} of turns)")
    else:
        print("Primary Strategy:   None (no actions recorded)")

    # 2. Block Rate
    blocks = analysis["blocks"]
    block_rate = (blocks["made"] / blocks["total_opportunities"]) if blocks["total_opportunities"] > 0 else 0.0
    print(f"Secondary Strategy: DEFENSIVE BLOCKING (block rate {block_rate:.1%})")
    print(f"  Block opportunities: {blocks['total_opportunities']} | Blocks made: {blocks['made']}")

    # 3. Game Stage Breakdown
    print("\nEarly Game (turns 1-8):")
    early_acts = analysis["adaptive"]["stage_actions"]["early"]
    early_tot = sum(early_acts.values())
    if early_tot > 0:
        sorted_early = sorted(early_acts.items(), key=lambda x: x[1], reverse=True)
        print(f"  Dominant action:  {sorted_early[0][0]} ({sorted_early[0][1]/early_tot:.1%}), {sorted_early[1][0]} ({sorted_early[1][1]/early_tot:.1%})")
    
    early_bluffs = analysis["bluff_by_stage"]["early"]["attempts"]
    early_claims = analysis["bluff_by_stage"]["early"]["total_actions"]
    early_bluff_rate = (early_bluffs / early_claims) if early_claims > 0 else 0.0
    print(f"  Bluff rate:       {early_bluff_rate:.1%} of character claims")

    print("\nMid Game (turns 9-18):")
    mid_acts = analysis["adaptive"]["stage_actions"]["mid"]
    mid_tot = sum(mid_acts.values())
    if mid_tot > 0:
        sorted_mid = sorted(mid_acts.items(), key=lambda x: x[1], reverse=True)
        print(f"  Dominant action:  {sorted_mid[0][0]} ({sorted_mid[0][1]/mid_tot:.1%}), {sorted_mid[1][0]} ({sorted_mid[1][1]/mid_tot:.1%})")
    
    mid_bluffs = analysis["bluff_by_stage"]["mid"]["attempts"]
    mid_claims = analysis["bluff_by_stage"]["mid"]["total_actions"]
    mid_bluff_rate = (mid_bluffs / mid_claims) if mid_claims > 0 else 0.0
    print(f"  Bluff rate:       {mid_bluff_rate:.1%} of character claims")

    print("\nLate Game (turns 19+):")
    late_acts = analysis["adaptive"]["stage_actions"]["late"]
    late_tot = sum(late_acts.values())
    if late_tot > 0:
        sorted_late = sorted(late_acts.items(), key=lambda x: x[1], reverse=True)
        print(f"  Dominant action:  {sorted_late[0][0]} ({sorted_late[0][1]/late_tot:.1%}), {sorted_late[1][0]} ({sorted_late[1][1]/late_tot:.1%})")
    
    # Coup frequency at 7+ coins in late game
    late_coup_count = late_acts.get("Coup", 0)
    print(f"  Coup frequency:   {late_coup_count} actions in late stage")

    # 4. Bluffing success
    print("\nKey Bluffing Insights:")
    for char in ["Duke", "Captain", "Assassin", "Ambassador", "Contessa"]:
        char_bluffs = analysis["bluff_attempts"].get(char, 0)
        char_successes = analysis["bluff_successes"].get(char, 0)
        char_rate = (char_successes / char_bluffs) if char_bluffs > 0 else 0.0
        print(f"  - {char:<10} bluffed {char_bluffs:3d} times | Success Rate: {char_rate:.1%}")

    # 5. Challenge behavior
    print("\nChallenge Behavior Analysis:")
    chals = analysis["challenges"]
    chal_rate = (chals["made"] / chals["total_opportunities"]) if chals["total_opportunities"] > 0 else 0.0
    chal_win_rate = (chals["won"] / chals["made"]) if chals["made"] > 0 else 0.0
    print(f"  - Overall Challenge Rate: {chal_rate:.1%} | Win Rate: {chal_win_rate:.1%}")
    
    # Challenges by influence count
    c_1inf = chals["challenge_by_influence"]["1_influence"]
    c_1inf_rate = (c_1inf["challenges"] / c_1inf["opportunities"]) if c_1inf["opportunities"] > 0 else 0.0
    c_2inf = chals["challenge_by_influence"]["2_influence"]
    c_2inf_rate = (c_2inf["challenges"] / c_2inf["opportunities"]) if c_2inf["opportunities"] > 0 else 0.0
    print(f"  - Challenge rate on 1 influence: {c_1inf_rate:.1%} vs 2 influence: {c_2inf_rate:.1%}")

    # Challenges by frequency
    c_freq_0_1 = chals["challenge_by_opponent_action_count"]["used_0_1_times"]
    c_freq_0_1_rate = (c_freq_0_1["challenges"] / c_freq_0_1["opportunities"]) if c_freq_0_1["opportunities"] > 0 else 0.0
    c_freq_2 = chals["challenge_by_opponent_action_count"]["used_2_plus_times"]
    c_freq_2_rate = (c_freq_2["challenges"] / c_freq_2["opportunities"]) if c_freq_2["opportunities"] > 0 else 0.0
    print(f"  - Challenge rate vs 0-1 claims: {c_freq_0_1_rate:.1%} vs 2+ claims: {c_freq_2_rate:.1%}")

    # 6. Adaptation patterns
    print("\nAdaptive Behavior Insights:")
    steals = analysis["adaptive"]["steals_by_opponent_coins"]
    steal_richest_pct = (steals["richest"] / (steals["richest"] + steals["other"])) if (steals["richest"] + steals["other"]) > 0 else 0.0
    print(f"  - Targets richest opponent for Steal: {steal_richest_pct:.1%} of the time")
    
    total_duke_after_loss = analysis["adaptive"]["duke_claims_total_after_challenged_loss"]
    duke_claims_after_loss = analysis["adaptive"]["duke_claims_after_challenged_loss"]
    duke_loss_pct = (duke_claims_after_loss / total_duke_after_loss) if total_duke_after_loss > 0 else 0.0
    print(f"  - Duke claim rate drops after being challenged once in a game: {duke_loss_pct:.1%}")
    print("=" * 60 + "\n")


def compare_personalities(model_paths: dict, num_games: int = 300):
    """Runs analyze_learned_strategy on all models and prints a side-by-side comparison table."""
    results = {}
    for name, path in model_paths.items():
        results[name] = analyze_learned_strategy(path, num_games=num_games)
        
    print("\n" + "=" * 80)
    print("PERSONALITY COMPARISON MATRIX")
    print("=" * 80)
    
    metrics = [
        ("Duke Bluff Rate", lambda r: sum(r["bluff_attempts"]["Duke"] for char in [Character.DUKE.value]) / max(1, sum(r["bluff_total_claims"]["Duke"] for char in [Character.DUKE.value]))),
        ("Captain Bluff Rate", lambda r: sum(r["bluff_attempts"]["Captain"] for char in [Character.CAPTAIN.value]) / max(1, sum(r["bluff_total_claims"]["Captain"] for char in [Character.CAPTAIN.value]))),
        ("Assassinate Rate", lambda r: r["actions"].get("Assassinate", 0) / max(1, r["action_selection_count"])),
        ("Coup Rate", lambda r: r["actions"].get("Coup", 0) / max(1, r["action_selection_count"])),
        ("Income Rate", lambda r: r["actions"].get("Income", 0) / max(1, r["action_selection_count"])),
        ("Block Rate", lambda r: r["blocks"]["made"] / max(1, r["blocks"]["total_opportunities"])),
        ("Challenge Rate", lambda r: r["challenges"]["made"] / max(1, r["challenges"]["total_opportunities"])),
    ]
    
    header = f"{'Metric':<30}"
    for name in results.keys():
        header += f"{name:>12}"
    print(header)
    print("-" * 80)
    
    for label, getter in metrics:
        row = f"{label:<30}"
        for name, r in results.items():
            val = getter(r)
            row += f"{val:11.1%}"
        print(row)
    print("=" * 80 + "\n")


if __name__ == "__main__":
    # Test run
    base_model = "models/ppo_coup_final.zip"
    analysis = analyze_learned_strategy(base_model, num_games=100)
    print_strategy_profile(analysis, "ppo_coup_final")
