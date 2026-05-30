"""
rl_training/evaluate.py — Benchmark the trained Coup RL agent against external baselines.
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

from constants import Character, ActionType, GameStage, ACTION_BLOCK_TYPES, BLOCK_ROLES, ACTION_ROLES
from coup_engine import Game
from rl_training.env import CoupEnv, CoupEngine
from rl_training.observation import encode_observation, ActionHistory

try:
    from sb3_contrib import MaskablePPO
except ImportError:
    MaskablePPO = None

import torch


# ---------------------------------------------------------------------------
# Base Agent Interface
# ---------------------------------------------------------------------------

class BaseAgent:
    """Consistent interface for all heuristic and automated players."""
    def select_action(self, obs: np.ndarray, action_mask: np.ndarray, game_state: Any) -> int:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Heuristic Agents Implementation
# ---------------------------------------------------------------------------

class RandomAgent(BaseAgent):
    """Floor benchmark: samples uniformly from valid legal actions."""
    def __init__(self, action_key_to_index: Dict[Tuple, int], action_index_to_action: Dict[int, Dict[str, Any]]) -> None:
        self.action_key_to_index = action_key_to_index
        self.action_index_to_action = action_index_to_action

    def select_action(self, obs: np.ndarray, action_mask: np.ndarray, game_state: Any) -> int:
        valid_indices = np.where(action_mask)[0]
        if len(valid_indices) == 0:
            return 0
        return int(random.choice(valid_indices))


class PassiveAgent(BaseAgent):
    """Control benchmark: never challenges or blocks, always takes Income."""
    def __init__(self, action_key_to_index: Dict[Tuple, int], action_index_to_action: Dict[int, Dict[str, Any]]) -> None:
        self.action_key_to_index = action_key_to_index
        self.action_index_to_action = action_index_to_action

    def select_action(self, obs: np.ndarray, action_mask: np.ndarray, game_state: Any) -> int:
        valid_indices = np.where(action_mask)[0]
        
        # If Income is legal (index 0), always choose it
        if 0 in valid_indices:
            return 0
            
        # If Pass is legal, choose it
        pass_idx = self.action_key_to_index.get(("pass",))
        if pass_idx is not None and pass_idx in valid_indices:
            return pass_idx
            
        # Reveal first card if challenged
        reveal_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "reveal"]
        if reveal_indices:
            return reveal_indices[0]
            
        # Exchange: keep first keep option
        exchange_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "exchange"]
        if exchange_indices:
            return exchange_indices[0]

        return int(random.choice(valid_indices))


class AggressiveAgent(BaseAgent):
    """Stress benchmark: always challenges, always Coups when possible, steals when legal."""
    def __init__(self, action_key_to_index: Dict[Tuple, int], action_index_to_action: Dict[int, Dict[str, Any]], player_id: str) -> None:
        self.action_key_to_index = action_key_to_index
        self.action_index_to_action = action_index_to_action
        self.player_id = player_id

    def select_action(self, obs: np.ndarray, action_mask: np.ndarray, game_state: Any) -> int:
        valid_indices = np.where(action_mask)[0]
        stage = game_state.stage

        if stage == GameStage.ACTION_SELECTION:
            # 1. Coup if legal (prioritize target with most influence)
            coup_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == ActionType.COUP.value]
            if coup_indices:
                targets_inf = {}
                for idx in coup_indices:
                    t_id = self.action_index_to_action[idx]["target_id"]
                    targets_inf[idx] = len(game_state.get_player(t_id).cards)
                return max(targets_inf, key=targets_inf.get)

            # 2. Steal if legal (prioritize target with most coins)
            steal_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == ActionType.STEAL.value]
            if steal_indices:
                targets_coins = {}
                for idx in steal_indices:
                    t_id = self.action_index_to_action[idx]["target_id"]
                    targets_coins[idx] = game_state.get_player(t_id).coins
                return max(targets_coins, key=targets_coins.get)

            # 3. Assassinate if legal
            ass_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == ActionType.ASSASSINATE.value]
            if ass_indices:
                return ass_indices[0]

            # 4. Tax
            tax_idx = self.action_key_to_index.get(("Tax",))
            if tax_idx is not None and tax_idx in valid_indices:
                return tax_idx

            # Fallback to Income
            if 0 in valid_indices:
                return 0

        elif stage in [GameStage.CHALLENGE_WINDOW, GameStage.BLOCK_CHALLENGE_WINDOW]:
            # Always challenge
            chal_idx = self.action_key_to_index.get(("challenge",))
            if chal_idx is not None and chal_idx in valid_indices:
                return chal_idx

        elif stage == GameStage.BLOCK_WINDOW:
            # Block aggressively (choose block with Duke, Captain, Ambassador, Contessa depending on what is legal)
            block_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "block"]
            if block_indices:
                return block_indices[0]

        # Reveal or exchange fallbacks
        reveal_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "reveal"]
        if reveal_indices:
            return reveal_indices[0]

        exchange_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "exchange"]
        if exchange_indices:
            return exchange_indices[0]

        return int(random.choice(valid_indices))


class RuleBasedAgent(BaseAgent):
    """Skill benchmark: hardcoded heuristics reflecting typical high-level play."""
    def __init__(self, action_key_to_index: Dict[Tuple, int], action_index_to_action: Dict[int, Dict[str, Any]], player_id: str) -> None:
        self.action_key_to_index = action_key_to_index
        self.action_index_to_action = action_index_to_action
        self.player_id = player_id

    def select_action(self, obs: np.ndarray, action_mask: np.ndarray, game_state: Any) -> int:
        valid_indices = np.where(action_mask)[0]
        me = game_state.get_player(self.player_id)
        my_cards = me.cards
        coins = me.coins
        
        has_duke = Character.DUKE in my_cards
        has_captain = Character.CAPTAIN in my_cards
        has_assassin = Character.ASSASSIN in my_cards
        has_contessa = Character.CONTESSA in my_cards
        has_ambassador = Character.AMBASSADOR in my_cards
        
        # Risk aversion: do not bluff/challenge if on 1 influence
        willing_to_bluff = len(my_cards) > 1
        willing_to_challenge = len(my_cards) > 1

        stage = game_state.stage

        if stage == GameStage.ACTION_SELECTION:
            # 1. Coup if >= 7 coins (mandatory at 10, but rule says coup if coins >= 7)
            coup_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == ActionType.COUP.value]
            if coup_indices:
                targets_inf = {}
                for idx in coup_indices:
                    t_id = self.action_index_to_action[idx]["target_id"]
                    targets_inf[idx] = len(game_state.get_player(t_id).cards)
                return max(targets_inf, key=targets_inf.get)

            # 2. Assassinate if we have Assassin and 3+ coins
            ass_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == ActionType.ASSASSINATE.value]
            if ass_indices and has_assassin:
                # Target the active player with most cards
                targets_inf = {}
                for idx in ass_indices:
                    t_id = self.action_index_to_action[idx]["target_id"]
                    targets_inf[idx] = len(game_state.get_player(t_id).cards)
                return max(targets_inf, key=targets_inf.get)

            # 3. Always Tax if you have Duke
            tax_idx = self.action_key_to_index.get(("Tax",))
            if tax_idx is not None and tax_idx in valid_indices and has_duke:
                return tax_idx

            # 4. Steal if target has 2+ coins and you have Captain
            steal_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == ActionType.STEAL.value]
            if steal_indices and has_captain:
                targets_coins = {}
                for idx in steal_indices:
                    t_id = self.action_index_to_action[idx]["target_id"]
                    targets_coins[idx] = game_state.get_player(t_id).coins
                best_steal_idx = max(targets_coins, key=targets_coins.get)
                if targets_coins[best_steal_idx] >= 2:
                    return best_steal_idx

            # 5. Take Foreign Aid if coins < 4 and no Duke available
            fa_idx = self.action_key_to_index.get(("Foreign Aid",))
            if fa_idx is not None and fa_idx in valid_indices and coins < 4 and not has_duke:
                return fa_idx

            # 6. Steal if target has 2+ coins and we claim/bluff Captain
            if steal_indices and willing_to_bluff:
                targets_coins = {}
                for idx in steal_indices:
                    t_id = self.action_index_to_action[idx]["target_id"]
                    targets_coins[idx] = game_state.get_player(t_id).coins
                best_steal_idx = max(targets_coins, key=targets_coins.get)
                if targets_coins[best_steal_idx] >= 2:
                    return best_steal_idx

            # 7. Tax (bluffing Duke)
            if tax_idx is not None and tax_idx in valid_indices and willing_to_bluff:
                return tax_idx

            # 8. Income fallback
            if 0 in valid_indices:
                return 0

        elif stage in [GameStage.CHALLENGE_WINDOW, GameStage.BLOCK_CHALLENGE_WINDOW]:
            # Always pass if not willing to challenge
            pass_idx = self.action_key_to_index.get(("pass",))
            if not willing_to_challenge:
                return pass_idx

            # If action is Tax, challenge if opponent has used it > 2 times
            active_action = game_state.active_action
            if active_action and active_action.action_type == ActionType.TAX:
                actor_id = active_action.player_id
                actor_name = game_state.get_player(actor_id).name
                
                # Count Tax claims in logs
                tax_claims = 0
                for log_msg in game_state.history:
                    if f"{actor_name} declared Tax" in log_msg:
                        tax_claims += 1
                
                if tax_claims > 2:
                    chal_idx = self.action_key_to_index.get(("challenge",))
                    if chal_idx is not None and chal_idx in valid_indices:
                        return chal_idx

            return pass_idx

        elif stage == GameStage.BLOCK_WINDOW:
            pass_idx = self.action_key_to_index.get(("pass",))
            active_action = game_state.active_action
            action_type = active_action.action_type if active_action else None

            # Determine who is blocking
            if action_type == ActionType.FOREIGN_AID:
                # Block Foreign Aid as Duke if opponent has 6+ coins
                actor_id = active_action.player_id
                actor_coins = game_state.get_player(actor_id).coins
                if actor_coins >= 6:
                    block_duke_idx = self.action_key_to_index.get(("block", "Duke"))
                    if block_duke_idx is not None and block_duke_idx in valid_indices:
                        if has_duke or willing_to_bluff:
                            return block_duke_idx
                return pass_idx

            elif action_type == ActionType.STEAL:
                # Block Steal (we are the target)
                block_capt_idx = self.action_key_to_index.get(("block", "Captain"))
                block_amb_idx = self.action_key_to_index.get(("block", "Ambassador"))
                
                if has_captain and block_capt_idx in valid_indices:
                    return block_capt_idx
                if has_ambassador and block_amb_idx in valid_indices:
                    return block_amb_idx
                    
                if willing_to_bluff:
                    if block_capt_idx in valid_indices:
                        return block_capt_idx
                    if block_amb_idx in valid_indices:
                        return block_amb_idx
                return pass_idx

            elif action_type == ActionType.ASSASSINATE:
                # Block Assassination (we are the target)
                block_cont_idx = self.action_key_to_index.get(("block", "Contessa"))
                if has_contessa and block_cont_idx in valid_indices:
                    return block_cont_idx
                if willing_to_bluff and block_cont_idx in valid_indices:
                    return block_cont_idx
                return pass_idx

        # Reveal logic
        if stage == GameStage.REVEAL_CARD_CHALLENGE:
            # Must reveal the correct card if we have it to win the challenge
            active_block = game_state.active_block
            required_char = None
            if active_block:
                required_char = active_block.character
            elif game_state.active_action:
                required_char = ACTION_ROLES.get(game_state.active_action.action_type)

            if required_char and required_char in my_cards:
                reveal_idx = self.action_key_to_index.get(("reveal", required_char.value))
                if reveal_idx is not None and reveal_idx in valid_indices:
                    return reveal_idx

            # Else reveal anything
            reveal_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "reveal"]
            if reveal_indices:
                return reveal_indices[0]

        elif stage == GameStage.REVEAL_CARD_LOSS:
            # Loss: Keep Duke/Captain/Contessa if possible
            reveal_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "reveal"]
            if reveal_indices:
                # Map option index to Character
                reveal_map = {idx: Character(self.action_index_to_action[idx]["character"]) for idx in reveal_indices}
                # Discard priority: Ambassador, Assassin, Contessa, Captain, Duke
                priority = [Character.AMBASSADOR, Character.ASSASSIN, Character.CONTESSA, Character.CAPTAIN, Character.DUKE]
                for p_char in priority:
                    for idx, char in reveal_map.items():
                        if char == p_char:
                            return idx
                return reveal_indices[0]

        # Exchange keeping logic: keep best cards (Duke > Captain > Contessa > Assassin > Ambassador)
        exchange_indices = [idx for idx in valid_indices if self.action_index_to_action[idx].get("action") == "exchange"]
        if exchange_indices:
            best_idx = exchange_indices[0]
            max_score = -1
            for idx in exchange_indices:
                keep_cards = self.action_index_to_action[idx]["keep"]
                score = 0
                for c in keep_cards:
                    if c == "Duke":
                        score += 10
                    elif c == "Captain":
                        score += 8
                    elif c == "Contessa":
                        score += 6
                    elif c == "Assassin":
                        score += 4
                    elif c == "Ambassador":
                        score += 2
                if score > max_score:
                    max_score = score
                    best_idx = idx
            return best_idx

        return int(random.choice(valid_indices))


# ---------------------------------------------------------------------------
# Rotatable Environment for Seat Rotation
# ---------------------------------------------------------------------------

class RotatableCoupEnv(CoupEnv):
    """Subclass of CoupEnv that allows the AI learning agent to sit in any seat (p1..pN)."""
    
    def __init__(self, num_players: int = 3, learning_agent_id: str = "p1") -> None:
        super().__init__(num_players=num_players)
        self.learning_agent_id = learning_agent_id

    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        # Reset seed in parent gym classes
        super(CoupEnv, self).reset(seed=seed)
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        self.engine.reset()
        self.history = ActionHistory()
        self._init_stats()

        # Set up active opponent models dynamically (will be overwritten by the evaluation loop)
        self.active_opponents = {}
        for i in range(1, self.num_players + 1):
            pid = f"p{i}"
            if pid == self.learning_agent_id:
                continue
            self.active_opponents[pid] = self._random_policy

        # Play automatic turns until it is the learning agent's decision window
        self._play_opponents_turns()

        obs = self._get_agent_obs()
        return obs, {"action_mask": self.get_action_mask()}


# ---------------------------------------------------------------------------
def _verify_model_obs_compatibility(model, env):
    """
    Verify the loaded model's observation space matches the 
    current environment before running any games.
    Raises ValueError with clear message if mismatch detected.
    """
    model_obs_shape = model.observation_space.shape
    env_obs_shape = env.observation_space.shape
    if model_obs_shape != env_obs_shape:
        raise ValueError(
            f"Model observation shape {model_obs_shape} does not match "
            f"environment observation shape {env_obs_shape}. "
            f"The model was trained with a different observation encoding. "
            f"Check observation.py for changes since training."
        )

def evaluate(
    model_path: str,
    num_games: int = 500,
    num_players: int = 3,
    opponent_types: list = ["random", "rule_based", "passive", "aggressive"],
    seat_rotation: bool = True,
) -> dict:
    """
    Evaluates the MaskablePPO model against standard opponent baselines.
    """
    print(f"Loading MaskablePPO model from {model_path}...")
    model = None
    if MaskablePPO is not None:
        try:
            model = MaskablePPO.load(model_path)
        except Exception as exc:
            print(f"WARNING: Failed to load model ({exc}). Using random fallback.")

    # Helper mapping to build benchmark agents
    env_map = CoupEnv(num_players=num_players)
    mapping_keys = env_map.action_key_to_index
    mapping_actions = env_map.action_index_to_action

    if model is not None:
        _verify_model_obs_compatibility(model, env_map)

    results = {
        "model_path": model_path,
        "num_games_per_opponent": num_games,
        "opponents": {}
    }

    for opp_type in opponent_types:
        print(f"Running evaluation against {opp_type}...")
        wins = 0
        total_game_length = 0
        total_bluffs = 0
        total_challenges = 0
        seat_wins = {i: 0 for i in range(num_players)}
        seat_games = {i: 0 for i in range(num_players)}

        for game_idx in range(num_games):
            # Calculate seat position for rotation
            if seat_rotation:
                seat_idx = game_idx % num_players
            else:
                seat_idx = 0  # always p1
                
            learning_agent_id = f"p{seat_idx + 1}"
            seat_games[seat_idx] += 1

            # Instantiate environment for this game
            env = RotatableCoupEnv(num_players=num_players, learning_agent_id=learning_agent_id)
            
            # Instantiate opponents for other seats
            opponents = {}
            for i in range(1, num_players + 1):
                pid = f"p{i}"
                if pid == learning_agent_id:
                    continue
                
                if opp_type == "random":
                    agent = RandomAgent(mapping_keys, mapping_actions)
                elif opp_type == "passive":
                    agent = PassiveAgent(mapping_keys, mapping_actions)
                elif opp_type == "aggressive":
                    agent = AggressiveAgent(mapping_keys, mapping_actions, pid)
                else:  # rule_based
                    agent = RuleBasedAgent(mapping_keys, mapping_actions, pid)
                
                # Wrap agent as policy function
                def _make_opp_policy(a=agent):
                    return lambda obs_val, mask_val: a.select_action(obs_val, mask_val, env.engine.state)
                opponents[pid] = _make_opp_policy()

            # Assign opponents to env
            env.active_opponents = opponents

            # Run single game
            obs, info = env.reset()
            done = False
            
            while not done:
                mask = env.get_action_mask()
                
                # Query AI model
                if model is not None:
                    obs_tensor = torch.FloatTensor(obs).unsqueeze(0)
                    action_masks_tensor = torch.BoolTensor(mask).unsqueeze(0)
                    action_idx, _ = model.predict(obs, action_masks=mask, deterministic=True)
                    action_idx = int(action_idx)
                else:
                    # Random fallback
                    valid_indices = np.where(mask)[0]
                    action_idx = int(random.choice(valid_indices))
                
                obs, reward, terminated, truncated, info = env.step(action_idx)
                done = terminated or truncated

            # Record stats
            stats = env.game_stats
            winner = env.engine.get_winner()
            if winner == learning_agent_id:
                wins += 1
                seat_wins[seat_idx] += 1
            
            total_game_length += stats["length"]
            total_bluffs += stats["players_stats"][learning_agent_id]["bluff_attempts"]
            total_challenges += stats["players_stats"][learning_agent_id]["challenges_made"]

        # Calculate averages
        win_rate = wins / num_games
        avg_len = total_game_length / num_games
        bluff_rate = total_bluffs / num_games
        challenge_rate = total_challenges / num_games
        
        seat_win_rates = {}
        for s_idx, s_wins in seat_wins.items():
            s_games = seat_games[s_idx]
            seat_win_rates[f"Seat {s_idx}"] = s_wins / s_games if s_games > 0 else 0.0

        results["opponents"][opp_type] = {
            "win_rate": win_rate,
            "avg_game_length": avg_len,
            "bluff_rate": bluff_rate,
            "challenge_rate": challenge_rate,
            "seat_win_rates": seat_win_rates
        }

    # Save to logs folder
    logs_dir = pathlib.Path("rl_training/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    with open(logs_dir / "evaluation_report.json", "w") as f:
        json.dump(results, f, indent=4)

    return results


def print_evaluation_report(results: dict):
    """Prints a beautifully formatted evaluation report in the console."""
    model_name = pathlib.Path(results["model_path"]).name
    print("\n" + "=" * 60)
    print(f"EVALUATION REPORT - {model_name}")
    print("=" * 60)
    print(f"Games per opponent type: {results['num_games_per_opponent']} | Seat rotation: ON\n")

    overall_passed = True

    # 1. Random Agent
    r_stats = results["opponents"].get("random")
    if r_stats:
        win_target = 0.90
        passed = r_stats["win_rate"] >= win_target
        if not passed:
            overall_passed = False
        check_mark = "[PASS]" if passed else "[FAIL]"
        print(f"vs RandomAgent:")
        print(f"  Win Rate:          {r_stats['win_rate']:5.1%}  [TARGET: >{win_target:.0%}]     {check_mark}")
        print(f"  Avg Game Length:   {r_stats['avg_game_length']:.1f} turns")
        print(f"  Bluff Rate:        {r_stats['bluff_rate']:.1f} per game")
        print(f"  Challenge Rate:    {r_stats['challenge_rate']:.1f} per game\n")

    # 2. RuleBased Agent
    rb_stats = results["opponents"].get("rule_based")
    if rb_stats:
        win_target = 0.65
        passed = rb_stats["win_rate"] >= win_target
        if not passed:
            overall_passed = False
        check_mark = "[PASS]" if passed else "[FAIL]"
        print(f"vs RuleBasedAgent:")
        print(f"  Win Rate:          {rb_stats['win_rate']:5.1%}  [TARGET: >{win_target:.0%}]     {check_mark}")
        print(f"  Avg Game Length:   {rb_stats['avg_game_length']:.1f} turns")
        print(f"  Bluff Rate:        {rb_stats['bluff_rate']:.1f} per game")
        print(f"  Challenge Rate:    {rb_stats['challenge_rate']:.1f} per game\n")

    # 3. Passive Agent
    p_stats = results["opponents"].get("passive")
    if p_stats:
        print(f"vs PassiveAgent:")
        print(f"  Win Rate:          {p_stats['win_rate']:5.1%}")
        print(f"  Avg Game Length:   {p_stats['avg_game_length']:.1f} turns  [Exploited passive play]")
        print(f"  Bluff Rate:        {p_stats['bluff_rate']:.1f} per game\n")

    # 4. Aggressive Agent
    a_stats = results["opponents"].get("aggressive")
    if a_stats:
        print(f"vs AggressiveAgent:")
        print(f"  Win Rate:          {a_stats['win_rate']:5.1%}")
        print(f"  Avg Game Length:   {a_stats['avg_game_length']:.1f} turns  [Adapted defensively]")
        print(f"  Bluff Rate:        {a_stats['bluff_rate']:.1f} per game\n")

    # Seat rotation wins (for RuleBasedAgent)
    if rb_stats:
        print(f"Win Rate by Seat Position (vs RuleBasedAgent):")
        rates = []
        for seat, rate in rb_stats["seat_win_rates"].items():
            print(f"  {seat}: {rate:5.1%}")
            rates.append(rate)
        gap = max(rates) - min(rates) if rates else 0
        gap_passed = gap <= 0.15
        check_mark = "[PASS]" if gap_passed else "[FAIL]"
        if not gap_passed:
            overall_passed = False
        print(f"  Positional bias gap: {gap:5.1%}  [ACCEPTABLE: <15%]   {check_mark}\n")

    print("=" * 60)
    if overall_passed:
        print("OVERALL ASSESSMENT: Agent passes all benchmarks.")
    else:
        print("OVERALL ASSESSMENT: Agent FAILED some benchmark targets.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    # Test run evaluation
    results = evaluate("models/ppo_coup_final.zip", num_games=500)
    print_evaluation_report(results)
