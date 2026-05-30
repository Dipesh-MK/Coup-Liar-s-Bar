"""
Coup RL Training Pipeline — Human-Defeating Configuration
==========================================================

Design choices for maximum human-beating performance:

1.  BIGGER NETWORK [256, 256, 128]: Coup requires remembering deception history,
    tracking public deck state, and reasoning about opponent bluff tendencies.
    The default [64, 64] is far too small for this.

2.  4 PARALLEL ENVIRONMENTS (DummyVecEnv): Provides 4× more diverse game
    trajectories per wall-clock second, crucial for learning varied bluffing
    and counter-play patterns.

3.  LINEAR LR DECAY (3e-4 → 3e-5): High LR early to explore bluffing strategies
    aggressively; decay late so learned strategies don't get overwritten.

4.  HIGH INITIAL ENTROPY (0.02): Forces the agent to explore the full action
    space (challenges, blocks, deceptive Tax/Steal) rather than collapsing to
    the safe Income-only policy too early.

5.  SELF-PLAY OPPONENT POOL (max 8 snapshots): Agent continuously plays against
    past versions of itself. Prevents exploiting a static random opponent and
    forces learning generalisable strategies.

6.  PROPER ILLEGAL ACTION TRACKING: MaskablePPO never samples illegal actions
    during training (the mask is applied before sampling). The previous metric
    was comparing a post-step mask against a pre-step action — wrong. Removed.

7.  SHAPED REWARDS already incentivise: survival (+0.01/step), coin efficiency
    via Tax/Steal (+0.03/coin), blocking (+0.05), opponent eliminations (+0.15–
    0.20), challenge wins (+0.15), and final win/loss (±1.0).
"""

import pathlib
import time
import json
import csv
import random
import re
import sys
import numpy as np
from typing import Dict, Any, List, Optional, Callable
from collections import deque
from datetime import timedelta

from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv

from constants import ActionType
from rl_training.env import CoupEnv


# ---------------------------------------------------------------------------
# Hyperparameter schedule helper
# ---------------------------------------------------------------------------

def linear_schedule(initial_value: float, final_value: float = 3e-5) -> Callable[[float], float]:
    """Returns a callable that linearly interpolates LR from initial→final over training."""
    def schedule(progress_remaining: float) -> float:
        # progress_remaining goes from 1.0 (start) to 0.0 (end)
        return final_value + progress_remaining * (initial_value - final_value)
    return schedule


# ---------------------------------------------------------------------------
# Human-Defeating PPO Hyperparameter Config
# ---------------------------------------------------------------------------

HUMAN_DEFEATING_CONFIG = {
    "learning_rate": linear_schedule(3e-4, 3e-5),
    "n_steps": 4096,          # Larger rollout buffer: more diverse game data per update
    "batch_size": 256,        # Bigger batches: smoother gradient estimates
    "n_epochs": 10,           # Standard: 10 passes over each collected batch
    "gamma": 0.995,           # High discount: rewards late in game still matter
    "gae_lambda": 0.95,       # Standard GAE smoothing
    "clip_range": 0.2,        # Standard PPO clip
    "ent_coef": 0.05,         # Higher entropy: forces exploration of deception strategies
    "vf_coef": 0.5,           # Standard value loss weight
    "max_grad_norm": 0.5,     # Gradient clip for stability
    "policy_kwargs": {
        "net_arch": [256, 256, 128],   # Deep network for complex multi-step reasoning
    },
}

N_PARALLEL_ENVS = 4           # Number of parallel game simulations
SNAPSHOT_EVERY_STEPS = 25_000 # Save checkpoint + update opponent pool every N steps
MAX_POOL_SIZE = 8             # Keep at most 8 historical opponent snapshots


# ---------------------------------------------------------------------------
# Environment factory
# ---------------------------------------------------------------------------

def _make_env_fn(num_players: int, randomize_players: bool = False) -> Callable:
    """Returns a factory function creating an ActionMasker-wrapped CoupEnv."""
    def _init() -> gym_Env:
        env = CoupEnv(num_players=num_players, randomize_players=randomize_players)
        env = ActionMasker(env, lambda e: e.get_action_mask())
        return env
    return _init


# Import gym.Env for type hint only
try:
    import gymnasium as gym
    gym_Env = gym.Env
except ImportError:
    gym_Env = object


# ---------------------------------------------------------------------------
# Meta Strategy Logger
# ---------------------------------------------------------------------------

class CoupMetaLogger:
    """Analyses completed game results to surface strategic trends over training."""

    def __init__(self, log_dir: str, num_players: int) -> None:
        self.log_dir = pathlib.Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.num_players = num_players
        self.games: List[Dict[str, Any]] = []

    def log_game(self, game_result: dict) -> None:
        self.games.append(game_result)

    def _get_window(self) -> List[Dict[str, Any]]:
        return self.games[-500:]

    def _trend(self, series: List[float]) -> str:
        if len(series) < 10:
            return "stable"
        half = len(series) // 2
        old_mean = sum(series[:half]) / half
        new_mean = sum(series[half:]) / (len(series) - half)
        diff = new_mean - old_mean
        if diff > 0.02:
            return "rising"
        elif diff < -0.02:
            return "falling"
        return "stable"

    def compute_meta_report(self, step: int) -> dict:
        window = self._get_window()
        if not window:
            return {}

        n = len(window)

        # Seat win rates
        seat_wins = {i: 0 for i in range(self.num_players)}
        for g in window:
            w = g.get("winner_id")
            if w:
                try:
                    seat_wins[int(w[1:]) - 1] += 1
                except (ValueError, IndexError):
                    pass
        seat_win_rates = {f"P{i}": seat_wins[i] / n for i in range(self.num_players)}
        max_rate = max(seat_win_rates.values())
        min_rate = min(seat_win_rates.values())
        seat_bias_alert = (max_rate - min_rate) > 0.15

        # Winner vs loser action preferences
        winner_counts: Dict[str, int] = {}
        loser_counts: Dict[str, int] = {}
        for g in window:
            w = g.get("winner_id")
            for pid, stats in g["players_stats"].items():
                target = winner_counts if pid == w else loser_counts
                for act, cnt in stats["action_counts"].items():
                    target[act] = target.get(act, 0) + cnt
        fav_winner = max(winner_counts, key=winner_counts.get) if winner_counts else None
        fav_loser = max(loser_counts, key=loser_counts.get) if loser_counts else None

        # Bluff success rate
        bluff_series = []
        for g in window:
            a = sum(p["bluff_attempts"] for p in g["players_stats"].values())
            s = sum(p["bluff_successes"] for p in g["players_stats"].values())
            bluff_series.append(s / a if a > 0 else 0.0)
        bluff_rate = sum(bluff_series) / len(bluff_series) if bluff_series else 0.0
        bluff_trend = self._trend(bluff_series)

        # Challenge frequency
        chal_series = [len(g["challenges"]) for g in window]
        chal_freq = sum(chal_series) / n
        chal_trend = self._trend([float(x) for x in chal_series])

        # Game length
        len_series = [float(g["length"]) for g in window]
        avg_len = sum(len_series) / n
        len_trend = self._trend(len_series)

        # Dominant action alert
        all_counts: Dict[str, int] = {}
        for g in window:
            for stats in g["players_stats"].values():
                for act, cnt in stats["action_counts"].items():
                    all_counts[act] = all_counts.get(act, 0) + cnt
        total_acts = sum(all_counts.values())
        dominant_action = None
        dominant_pct = 0.0
        if total_acts > 0:
            for act, cnt in all_counts.items():
                pct = cnt / total_acts
                if pct > 0.40:
                    dominant_action = act
                    dominant_pct = pct
                    break

        # Top 3 two-action chains
        chain_counts: Dict[tuple, int] = {}
        for g in window:
            seq = g.get("action_sequence", [])
            for i in range(len(seq) - 1):
                chain = (seq[i]["action"], seq[i + 1]["action"])
                if chain[0] and chain[1]:
                    chain_counts[chain] = chain_counts.get(chain, 0) + 1
        top_chains = [
            {"chain": list(c), "count": cnt}
            for c, cnt in sorted(chain_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        ]

        return {
            "step": step,
            "games_in_window": n,
            "seat_win_rates": seat_win_rates,
            "seat_bias_alert": seat_bias_alert,
            "fav_winner_action": fav_winner,
            "fav_loser_action": fav_loser,
            "bluff_success_rate": bluff_rate,
            "bluff_trend": bluff_trend,
            "challenge_frequency": chal_freq,
            "challenge_trend": chal_trend,
            "avg_game_length": avg_len,
            "length_trend": len_trend,
            "dominant_action": dominant_action,
            "dominant_pct": dominant_pct,
            "top_chains": top_chains,
        }

    def save_report(self, step: int) -> None:
        report = self.compute_meta_report(step)
        if not report:
            return
        json_path = self.log_dir / f"meta_{step}.json"
        with open(json_path, "w") as f:
            json.dump(report, f, indent=4)

        txt_path = self.log_dir / f"meta_{step}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("=" * 65 + "\n")
            f.write(f"  COUP RL META REPORT  |  STEP {step:,}\n")
            f.write("=" * 65 + "\n")
            f.write(f"Games in window : {report['games_in_window']}\n\n")

            f.write("Seat Win Rates:\n")
            for seat, rate in report["seat_win_rates"].items():
                bar = "#" * int(rate * 20)
                f.write(f"  {seat}: {rate:6.1%}  {bar}\n")
            if report["seat_bias_alert"]:
                f.write("  [ALERT] Seat bias > 15% — first-player advantage may be inflating P0 wins.\n")

            f.write(f"\nBluff Success Rate : {report['bluff_success_rate']:.1%}  ({report['bluff_trend']})\n")
            f.write(f"Challenge Freq     : {report['challenge_frequency']:.2f}/game  ({report['challenge_trend']})\n")
            f.write(f"Avg Game Length    : {report['avg_game_length']:.1f} turns  ({report['length_trend']})\n")

            f.write(f"\nWinner fav action  : {report['fav_winner_action']}\n")
            f.write(f"Loser  fav action  : {report['fav_loser_action']}\n")
            if report["dominant_action"]:
                f.write(f"\n[ALERT] Dominant strategy: '{report['dominant_action']}' = {report['dominant_pct']:.0%} of all moves!\n")

            f.write("\nTop action chains:\n")
            for idx, item in enumerate(report["top_chains"]):
                f.write(f"  {idx+1}. {' -> '.join(item['chain'])}  ({item['count']}x)\n")
            f.write("=" * 65 + "\n")


# ---------------------------------------------------------------------------
# Opponent pool helper
# ---------------------------------------------------------------------------

# Opponent pool helper & Fictitious Self-Play Policies
# ---------------------------------------------------------------------------

from rl_training.evaluate import RuleBasedAgent, AggressiveAgent, PassiveAgent, RandomAgent
from rl_training.observation import ActionHistory

def make_opponent_policy(model: MaskablePPO) -> Callable:
    """Wraps a frozen MaskablePPO model as a callable opponent policy."""
    def policy_fn(obs: np.ndarray, mask: np.ndarray, game_state: Any = None, history: Any = None) -> int:
        action, _ = model.predict(obs, action_masks=mask, deterministic=False)
        return int(action)
    return policy_fn

def get_acting_player_id_from_state(state: Any) -> str:
    """Determines who needs to make a decision in the current GameState."""
    from constants import GameStage
    stage = state.stage
    if stage == GameStage.GAME_OVER:
        return ""
    if stage == GameStage.ACTION_SELECTION:
        return state.current_player.player_id
    elif stage == GameStage.CHALLENGE_WINDOW:
        return state.pending_challenge_players[0]
    elif stage == GameStage.BLOCK_WINDOW:
        return state.pending_block_players[0]
    elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
        return state.pending_challenge_players[0]
    elif stage == GameStage.REVEAL_CARD_CHALLENGE:
        return state.challenge_target_id
    elif stage == GameStage.REVEAL_CARD_LOSS:
        return state.reveal_loss_player_id
    elif stage == GameStage.EXCHANGE_SELECTION:
        return state.active_action.player_id
    return ""

def make_heuristic_policy(agent_class: type, player_id: str, action_key_to_index: dict, action_index_to_action: dict) -> Callable:
    """Wraps a heuristic agent as a callable opponent policy."""
    import inspect
    sig = inspect.signature(agent_class.__init__)
    params = list(sig.parameters.keys())
    if "self" in params:
        params.remove("self")
    if len(params) >= 3 or any(p == "player_id" for p in params):
        agent = agent_class(action_key_to_index, action_index_to_action, player_id)
    else:
        agent = agent_class(action_key_to_index, action_index_to_action)
        
    def policy_fn(obs: np.ndarray, mask: np.ndarray, game_state: Any = None, history: Any = None) -> int:
        agent.player_id = get_acting_player_id_from_state(game_state)
        return agent.select_action(obs, mask, game_state)
    return policy_fn

def get_old_action_index(act: dict) -> int:
    name = act.get("action")
    if name == "Income":
        return 0
    elif name == "Foreign Aid":
        return 1
    elif name == "Tax":
        return 2
    elif name == "Exchange":
        return 3
    elif name == "Steal":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 4 + t_idx
    elif name == "Assassinate":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 7 + t_idx
    elif name == "Coup":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 10 + t_idx
    elif name == "challenge":
        return 13
    elif name == "pass":
        return 14
    elif name == "block":
        char = act.get("character")
        chars = ["Duke", "Contessa", "Captain", "Ambassador"]
        return 15 + chars.index(char)
    elif name == "reveal":
        char = act.get("character")
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return 19 + chars.index(char)
    elif name == "exchange":
        keep = act.get("keep")
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        if len(keep) == 1:
            return 24 + chars.index(keep[0])
        else:
            sorted_keep = sorted(keep)
            combos = []
            for i in range(len(chars)):
                for j in range(i, len(chars)):
                    combos.append(sorted([chars[i], chars[j]]))
            return 29 + combos.index(sorted_keep)
    return -1

def get_old_action_from_index(idx_3: int) -> dict:
    if idx_3 == 0:
        return {"action": "Income"}
    elif idx_3 == 1:
        return {"action": "Foreign Aid"}
    elif idx_3 == 2:
        return {"action": "Tax"}
    elif idx_3 == 3:
        return {"action": "Exchange"}
    elif 4 <= idx_3 <= 6:
        return {"action": "Steal", "target_id": f"p{idx_3 - 3}"}
    elif 7 <= idx_3 <= 9:
        return {"action": "Assassinate", "target_id": f"p{idx_3 - 6}"}
    elif 10 <= idx_3 <= 12:
        return {"action": "Coup", "target_id": f"p{idx_3 - 9}"}
    elif idx_3 == 13:
        return {"action": "challenge"}
    elif idx_3 == 14:
        return {"action": "pass"}
    elif 15 <= idx_3 <= 18:
        chars = ["Duke", "Contessa", "Captain", "Ambassador"]
        return {"action": "block", "character": chars[idx_3 - 15]}
    elif 19 <= idx_3 <= 23:
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return {"action": "reveal", "character": chars[idx_3 - 19]}
    elif 24 <= idx_3 <= 28:
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return {"action": "exchange", "keep": [chars[idx_3 - 24]]}
    elif 29 <= idx_3 <= 43:
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        combos = []
        for i in range(len(chars)):
            for j in range(i, len(chars)):
                combos.append([chars[i], chars[j]])
        keep = combos[idx_3 - 29]
        return {"action": "exchange", "keep": keep}
    return None

def encode_observation_old(
    state_dict: dict, player_id: str, action_history: ActionHistory, num_players: int = 3
) -> np.ndarray:
    from rl_training.observation import STAGE_TO_IDX, CARD_TO_IDX, ACTION_TO_IDX
    obs_parts = []
    players = state_dict["players"]
    for p in players:
        obs_parts.append(p["coins"] / 12.0)
    for p in players:
        obs_parts.append(len(p["revealed_cards"]) / 2.0)
    for p in players:
        obs_parts.append(1.0 if p["is_active"] else 0.0)
    curr_player_idx = state_dict["current_player_idx"]
    curr_player_one_hot = np.zeros(num_players, dtype=np.float32)
    if 0 <= curr_player_idx < num_players:
        curr_player_one_hot[curr_player_idx] = 1.0
    obs_parts.extend(curr_player_one_hot.tolist())
    stage_str = state_dict["stage"]
    stage_one_hot = np.zeros(len(STAGE_TO_IDX), dtype=np.float32)
    if stage_str in STAGE_TO_IDX:
        stage_one_hot[STAGE_TO_IDX[stage_str]] = 1.0
    obs_parts.extend(stage_one_hot.tolist())
    agent_player = next(p for p in players if p["player_id"] == player_id)
    agent_cards = agent_player["cards"]
    hand_one_hot = np.zeros(10, dtype=np.float32)
    for i, card in enumerate(agent_cards[:2]):
        if card in CARD_TO_IDX:
            idx = i * 5 + CARD_TO_IDX[card]
            hand_one_hot[idx] = 1.0
    obs_parts.extend(hand_one_hot.tolist())
    history_records = action_history.to_list()
    for rec in history_records:
        actor_idx = rec["player_idx"]
        actor_one_hot = np.zeros(num_players, dtype=np.float32)
        if 0 <= actor_idx < num_players:
            actor_one_hot[actor_idx] = 1.0
        obs_parts.extend(actor_one_hot.tolist())
        act_type = rec["action_type"]
        act_one_hot = np.zeros(len(ACTION_TO_IDX), dtype=np.float32)
        if act_type in ACTION_TO_IDX:
            act_one_hot[ACTION_TO_IDX[act_type]] = 1.0
        obs_parts.extend(act_one_hot.tolist())
        obs_parts.append(1.0 if rec["challenged"] else 0.0)
        obs_parts.append(1.0 if rec["succeeded"] else 0.0)
    obs_vector = np.array(obs_parts, dtype=np.float32)
    assert len(obs_vector) == 102
    return obs_vector

def translate_dict_to_index_53(act: dict) -> int:
    name = act.get("action")
    if name == "Income":
        return 0
    elif name == "Foreign Aid":
        return 1
    elif name == "Tax":
        return 2
    elif name == "Exchange":
        return 3
    elif name == "Steal":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 4 + t_idx
    elif name == "Assassinate":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 10 + t_idx
    elif name == "Coup":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 16 + t_idx
    elif name == "challenge":
        return 22
    elif name == "pass":
        return 23
    elif name == "block":
        char = act.get("character")
        chars = ["Duke", "Contessa", "Captain", "Ambassador"]
        return 24 + chars.index(char)
    elif name == "reveal":
        char = act.get("character")
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return 28 + chars.index(char)
    elif name == "exchange":
        keep = act.get("keep")
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        if len(keep) == 1:
            return 33 + chars.index(keep[0])
        else:
            sorted_keep = sorted(keep)
            combos = []
            for i in range(len(chars)):
                for j in range(i, len(chars)):
                    combos.append(sorted([chars[i], chars[j]]))
            return 38 + combos.index(sorted_keep)
    return -1

def get_legal_actions_from_state(state: Any, player_id: str) -> List[Dict[str, Any]]:
    """Calculates valid inputs/action dictionaries for a player in the current GameState."""
    from constants import GameStage, Character, ActionType, ACTION_BLOCK_TYPES, BLOCK_ROLES
    stage = state.stage
    if stage == GameStage.GAME_OVER:
        return []

    player = state.get_player(player_id)
    if not player.is_active:
        return []

    inputs = []

    if stage == GameStage.ACTION_SELECTION:
        if player_id != state.current_player.player_id:
            return []
        
        targets = [p.player_id for p in state.players if p.is_active and p.player_id != player_id]

        if player.coins >= 10:
            for t in targets:
                inputs.append({"action": ActionType.COUP.value, "target_id": t})
            return inputs

        inputs.append({"action": ActionType.INCOME.value})
        inputs.append({"action": ActionType.FOREIGN_AID.value})
        inputs.append({"action": ActionType.TAX.value})
        inputs.append({"action": ActionType.EXCHANGE.value})
        
        for t in targets:
            inputs.append({"action": ActionType.STEAL.value, "target_id": t})
        
        if player.coins >= 3:
            for t in targets:
                inputs.append({"action": ActionType.ASSASSINATE.value, "target_id": t})
        
        if player.coins >= 7:
            for t in targets:
                inputs.append({"action": ActionType.COUP.value, "target_id": t})

    elif stage == GameStage.CHALLENGE_WINDOW:
        if player_id not in state.pending_challenge_players:
            return []
        inputs.append({"action": "pass"})
        inputs.append({"action": "challenge"})

    elif stage == GameStage.BLOCK_WINDOW:
        if player_id not in state.pending_block_players:
            return []
        inputs.append({"action": "pass"})
        
        action_type = state.active_action.action_type
        block_type = ACTION_BLOCK_TYPES[action_type]
        allowed_chars = BLOCK_ROLES[block_type]
        
        for char in allowed_chars:
            inputs.append({"action": "block", "character": char.value})

    elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
        if player_id not in state.pending_challenge_players:
            return []
        inputs.append({"action": "pass"})
        inputs.append({"action": "challenge"})

    elif stage == GameStage.REVEAL_CARD_CHALLENGE:
        if player_id != state.challenge_target_id:
            return []
        for card in set(player.cards):
            inputs.append({"action": "reveal", "character": card.value})

    elif stage == GameStage.REVEAL_CARD_LOSS:
        if player_id != state.reveal_loss_player_id:
            return []
        for card in set(player.cards):
            inputs.append({"action": "reveal", "character": card.value})

    elif stage == GameStage.EXCHANGE_SELECTION:
        if player_id != state.active_action.player_id:
            return []
        drawn = state.exchange_drawn_cards
        pool = player.cards + drawn
        original_size = len(player.cards)
        
        import itertools
        combos = list(itertools.combinations(range(len(pool)), original_size))
        seen = set()
        for combo in combos:
            combo_cards = tuple(sorted([pool[idx].value for idx in combo]))
            if combo_cards not in seen:
                seen.add(combo_cards)
                inputs.append({"action": "exchange", "keep": list(combo_cards)})

    return inputs

def make_old_model_policy(model_old: MaskablePPO) -> Callable:
    """Wraps the 102-dim specialized model as an opponent policy."""
    def policy_fn(obs: np.ndarray, mask: np.ndarray, game_state: Any = None, history: Any = None) -> int:
        lobby_size = len(game_state.players)
        if lobby_size != 3:
            valid = np.where(mask)[0]
            return int(random.choice(valid))
            
        player_id = get_acting_player_id_from_state(game_state)
        view = game_state.get_player_view(player_id)
        obs_old = encode_observation_old(view, player_id=player_id, action_history=history, num_players=3)
        
        mask_old = np.zeros(44, dtype=bool)
        legal_actions = get_legal_actions_from_state(game_state, player_id)
        for act in legal_actions:
            idx_old = get_old_action_index(act)
            if 0 <= idx_old < 44:
                mask_old[idx_old] = True
                
        act_idx_old, _ = model_old.predict(obs_old, action_masks=mask_old, deterministic=False)
        action_dict = get_old_action_from_index(int(act_idx_old))
        
        idx_53 = translate_dict_to_index_53(action_dict)
        if idx_53 != -1 and mask[idx_53]:
            return idx_53
            
        valid = np.where(mask)[0]
        return int(random.choice(valid))
    return policy_fn


# ---------------------------------------------------------------------------
# Training Callback
# ---------------------------------------------------------------------------

class CoupTrainingCallback(BaseCallback):
    """
    Manages per-step metrics, CSV logging, model checkpointing,
    and opponent pool updates during MaskablePPO training.
    """

    def __init__(
        self,
        total_timesteps: int,
        log_dir: str,
        models_dir: str,
        num_players: int = 3,
        start_step: int = 0,
    ) -> None:
        super().__init__(verbose=0)
        self.total_timesteps = total_timesteps
        self.log_dir = pathlib.Path(log_dir)
        self.models_dir = pathlib.Path(models_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.meta_logger = CoupMetaLogger(str(self.log_dir), num_players)
        self.static_pool: List[Callable] = []
        self.dynamic_pool: List[Callable] = []

        # Pre-populate static pool
        temp_env = CoupEnv(6)
        keys = temp_env.action_key_to_index
        actions = temp_env.action_index_to_action

        self.static_pool.append(make_heuristic_policy(RuleBasedAgent, "p2", keys, actions))
        self.static_pool.append(make_heuristic_policy(AggressiveAgent, "p2", keys, actions))
        self.static_pool.append(make_heuristic_policy(PassiveAgent, "p2", keys, actions))

        old_model_path = pathlib.Path("models/ppo_coup_specialist_3p.zip")
        if old_model_path.exists():
            try:
                model_old = MaskablePPO.load(old_model_path)
                self.static_pool.append(make_old_model_policy(model_old))
                print("  [*] Pre-seeded opponent pool with specialized 3-player model.")
            except Exception as e:
                print(f"  Warning: failed to seed old model: {e}")
        self.best_mean_reward = -float("inf")
        self.step_counter = start_step
        self.start_time: Optional[float] = None

        # Per-episode sliding windows (last 200 episodes for stable metrics)
        self.ep_rewards: deque = deque(maxlen=200)
        self.ep_lengths: deque = deque(maxlen=200)
        self.ep_wins: deque = deque(maxlen=200)
        self.ep_bluff_attempts: deque = deque(maxlen=200)
        self.ep_bluff_successes: deque = deque(maxlen=200)
        self.ep_challenges: deque = deque(maxlen=200)

        self.running_rewards: Dict[int, float] = {}

        self.csv_path = self.log_dir / "training_log.csv"
        self._init_csv()

    def _init_csv(self) -> None:
        if not self.csv_path.exists():
            with open(self.csv_path, mode="w", newline="") as f:
                csv.writer(f).writerow([
                    "step", "mean_reward_200ep", "win_rate_200ep",
                    "bluff_success_rate", "challenge_rate_per_game",
                    "mean_game_length", "pool_size", "fps",
                ])

    def _on_training_start(self) -> None:
        self.start_time = time.time()
        n_envs = self.training_env.num_envs
        self.running_rewards = {i: 0.0 for i in range(n_envs)}
        
        combined_pool = self.static_pool + self.dynamic_pool
        for wrapped in self.training_env.envs:
            inner = wrapped.env if hasattr(wrapped, "env") else wrapped
            inner.opponent_pool = combined_pool

    def _on_step(self) -> bool:
        self.step_counter += 1

        infos = self.locals.get("infos", [])
        rewards = self.locals.get("rewards", [])
        dones = self.locals.get("dones", [])

        for i, (info, rew, done) in enumerate(zip(infos, rewards, dones)):
            self.running_rewards[i] += float(rew)
            if done:
                self.ep_rewards.append(self.running_rewards[i])
                self.running_rewards[i] = 0.0
                result = info.get("game_result")
                if result:
                    self.meta_logger.log_game(result)
                    self.ep_lengths.append(result["length"])
                    self.ep_wins.append(1.0 if result.get("winner_id") == "p1" else 0.0)
                    attempts = sum(p["bluff_attempts"] for p in result["players_stats"].values())
                    successes = sum(p["bluff_successes"] for p in result["players_stats"].values())
                    self.ep_bluff_attempts.append(attempts)
                    self.ep_bluff_successes.append(successes)
                    self.ep_challenges.append(len(result["challenges"]))

        if self.step_counter % 10_000 == 0:
            self._print_progress()

        if self.step_counter % SNAPSHOT_EVERY_STEPS == 0:
            self._save_checkpoint()

        return True

    def _print_progress(self) -> None:
        elapsed = time.time() - self.start_time
        fps = self.step_counter / elapsed if elapsed > 0 else 0
        eta = (self.total_timesteps - self.step_counter) / fps if fps > 0 else 0
        eta_str = str(timedelta(seconds=int(eta)))

        mean_rew = float(np.mean(self.ep_rewards)) if self.ep_rewards else 0.0
        win_rate = float(np.mean(self.ep_wins)) if self.ep_wins else 0.0
        total_bluffs = sum(self.ep_bluff_attempts)
        total_succ = sum(self.ep_bluff_successes)
        bluff_rate = total_succ / total_bluffs if total_bluffs > 0 else 0.0
        chal_rate = float(np.mean(self.ep_challenges)) if self.ep_challenges else 0.0
        mean_len = float(np.mean(self.ep_lengths)) if self.ep_lengths else 0.0

        alerts = ""
        if len(self.meta_logger.games) >= 50:
            r = self.meta_logger.compute_meta_report(self.step_counter)
            if r.get("seat_bias_alert"):
                alerts += " [SEAT BIAS > 15%]"
            if r.get("dominant_action"):
                alerts += f" [DOMINANT: {r['dominant_action']} {r['dominant_pct']:.0%}]"

        pct = self.step_counter / self.total_timesteps * 100
        print("-" * 80)
        print(f"Step {self.step_counter:>7,}/{self.total_timesteps:,}  ({pct:.1f}%)  |  Pool: {len(self.static_pool) + len(self.dynamic_pool)} opponents")
        print(f"  Reward (200ep): {mean_rew:+.4f}  |  Win Rate: {win_rate:.1%}  |  FPS: {fps:.0f}  |  ETA: {eta_str}")
        print(f"  Bluff Success: {bluff_rate:.1%}  |  Challenges/game: {chal_rate:.2f}  |  Avg Length: {mean_len:.1f}{alerts}")
        print("-" * 80)
        sys.stdout.flush()

        with open(self.csv_path, mode="a", newline="") as f:
            csv.writer(f).writerow([
                self.step_counter,
                f"{mean_rew:.5f}",
                f"{win_rate:.4f}",
                f"{bluff_rate:.4f}",
                f"{chal_rate:.4f}",
                f"{mean_len:.2f}",
                len(self.static_pool) + len(self.dynamic_pool),
                f"{fps:.0f}",
            ])

    def _save_checkpoint(self) -> None:
        model_path = self.models_dir / f"ppo_coup_{self.step_counter}.zip"
        self.model.save(model_path)

        # Track best model
        mean_rew = float(np.mean(self.ep_rewards)) if self.ep_rewards else -float("inf")
        if mean_rew > self.best_mean_reward:
            self.best_mean_reward = mean_rew
            self.model.save(self.models_dir / "ppo_coup_best.zip")
            print(f"  [*] New best model at step {self.step_counter:,}  (mean_reward={mean_rew:.4f})")

        # Snapshot as frozen opponent
        opp_model = MaskablePPO.load(model_path)
        self.dynamic_pool.append(make_opponent_policy(opp_model))
        if len(self.dynamic_pool) > MAX_POOL_SIZE:
            self.dynamic_pool.pop(0)

        # Push combined pool to all parallel envs
        combined_pool = self.static_pool + self.dynamic_pool
        for wrapped in self.training_env.envs:
            inner = wrapped.env if hasattr(wrapped, "env") else wrapped
            inner.opponent_pool = combined_pool

        self.meta_logger.save_report(self.step_counter)
        print(f"  [checkpoint] Step {self.step_counter:,}  |  pool size: {len(combined_pool)}  |  saved: {model_path.name}")
        sys.stdout.flush()


# ---------------------------------------------------------------------------
# Environment sanity check
# ---------------------------------------------------------------------------

def run_env_sanity_check(num_players: int = 3, randomize_players: bool = False) -> None:
    """
    Runs 50 random legal steps through CoupEnv to verify:
      - Observation shape matches observation_space
      - Legal action masks always have at least one valid action
      - No exceptions are raised during step/reset
    """
    print("Running environment sanity check...", flush=True)
    env = CoupEnv(num_players=num_players, randomize_players=randomize_players)
    env_wrapped = ActionMasker(env, lambda e: e.get_action_mask())

    obs, info = env_wrapped.reset()
    assert obs.shape == env_wrapped.observation_space.shape, (
        f"Obs shape {obs.shape} != expected {env_wrapped.observation_space.shape}"
    )

    for step_idx in range(50):
        mask = env_wrapped.action_masks()
        valid = np.where(mask)[0]
        assert len(valid) > 0, f"Step {step_idx}: empty action mask — deadlock!"
        act = int(random.choice(valid))
        obs, reward, terminated, truncated, info = env_wrapped.step(act)
        assert obs.shape == env_wrapped.observation_space.shape
        assert reward != -0.5, f"Step {step_idx}: legal action triggered illegal-action penalty!"
        if terminated or truncated:
            obs, info = env_wrapped.reset()

    print("Environment sanity check passed [OK]", flush=True)


# ---------------------------------------------------------------------------
# Training entry point
# ---------------------------------------------------------------------------

def train(total_timesteps: int = 2_000_000, num_players: int = 3, randomize_players: bool = True) -> None:
    """
    Full training run using the human-defeating PPO configuration.

    Directory layout after training:
      models/
        ppo_coup_25000.zip, ppo_coup_50000.zip, ...   (snapshots every 25k steps)
        ppo_coup_best.zip                               (best by mean episode reward)
      rl_training/logs/
        training_log.csv                               (per-10k-step metrics)
        meta_25000.json / .txt, ...                    (strategy analysis reports)
    """
    run_env_sanity_check(num_players, randomize_players=randomize_players)

    log_dir = "rl_training/logs"
    models_dir = "models"
    pathlib.Path(log_dir).mkdir(parents=True, exist_ok=True)
    pathlib.Path(models_dir).mkdir(parents=True, exist_ok=True)

    print(f"\nBuilding {N_PARALLEL_ENVS} parallel environments...", flush=True)
    vec_env = DummyVecEnv([_make_env_fn(num_players, randomize_players=randomize_players) for _ in range(N_PARALLEL_ENVS)])

    callback = CoupTrainingCallback(
        total_timesteps=total_timesteps,
        log_dir=log_dir,
        models_dir=models_dir,
        num_players=6 if randomize_players else num_players,
    )

    print(f"Initialising MaskablePPO with net_arch={HUMAN_DEFEATING_CONFIG['policy_kwargs']['net_arch']}...", flush=True)
    model = MaskablePPO("MlpPolicy", vec_env, verbose=0, **HUMAN_DEFEATING_CONFIG)

    _print_training_plan(total_timesteps, num_players)
    model.learn(total_timesteps=total_timesteps, callback=callback)

    final_path = pathlib.Path(models_dir) / "ppo_coup_final.zip"
    model.save(final_path)
    print(f"\nTraining complete. Final model saved to {final_path}")


def resume_training(model_path: str, additional_timesteps: int = 500_000, randomize_players: bool = True) -> None:
    """Loads a saved checkpoint and continues training, restoring the opponent pool."""
    path = pathlib.Path(model_path)
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    num_players = 3
    vec_env = DummyVecEnv([_make_env_fn(num_players, randomize_players=randomize_players) for _ in range(N_PARALLEL_ENVS)])

    print(f"Loading model from {path.name}...", flush=True)
    model = MaskablePPO.load(path, env=vec_env)

    match = re.search(r"ppo_coup_(\d+)", path.stem)
    start_step = int(match.group(1)) if match else 0
    total_ts = model.num_timesteps + additional_timesteps

    log_dir = "rl_training/logs"
    models_dir = "models"

    callback = CoupTrainingCallback(
        total_timesteps=total_ts,
        log_dir=log_dir,
        models_dir=models_dir,
        num_players=6 if randomize_players else num_players,
        start_step=start_step,
    )

    # Reload last 8 snapshots into pool
    models_path = pathlib.Path(models_dir)
    checkpoints = sorted(
        [p for p in models_path.glob("ppo_coup_[0-9]*.zip")],
        key=lambda p: int(re.search(r"ppo_coup_(\d+)", p.stem).group(1))
        if re.search(r"ppo_coup_(\d+)", p.stem) else 0
    )
    for cp in checkpoints[-MAX_POOL_SIZE:]:
        try:
            m = MaskablePPO.load(cp)
            callback.dynamic_pool.append(make_opponent_policy(m))
        except Exception as ex:
            print(f"  Warning: could not load {cp.name}: {ex}")

    combined_pool = callback.static_pool + callback.dynamic_pool
    for wrapped in vec_env.envs:
        inner = wrapped.env if hasattr(wrapped, "env") else wrapped
        inner.opponent_pool = combined_pool

    print(f"Restored {len(callback.dynamic_pool)} opponent snapshots into pool (combined: {len(combined_pool)}).")
    print(f"Resuming from step {start_step:,}, running {additional_timesteps:,} more steps...", flush=True)
    model.learn(total_timesteps=additional_timesteps, callback=callback, reset_num_timesteps=False)

    final_path = models_path / "ppo_coup_final.zip"
    model.save(final_path)
    print(f"Resume complete. Final model saved to {final_path}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _print_training_plan(total_timesteps: int, num_players: int) -> None:
    eta_seconds = total_timesteps / (1000 * N_PARALLEL_ENVS)  # rough estimate at ~1000 FPS/env
    print("\n" + "=" * 80)
    print("  COUP RL TRAINING  --  HUMAN-DEFEATING CONFIGURATION")
    print("=" * 80)
    print(f"  Players             : {num_players}")
    print(f"  Total timesteps     : {total_timesteps:,}")
    print(f"  Parallel envs       : {N_PARALLEL_ENVS}")
    print(f"  Network arch        : {HUMAN_DEFEATING_CONFIG['policy_kwargs']['net_arch']}")
    print(f"  LR schedule         : 3e-4 -> 3e-5  (linear decay)")
    print(f"  Entropy coef        : {HUMAN_DEFEATING_CONFIG['ent_coef']}  (encourages bluff exploration)")
    print(f"  Snapshot every      : {SNAPSHOT_EVERY_STEPS:,} steps  (opponent pool, max {MAX_POOL_SIZE})")
    print(f"  Estimated wall time : {str(timedelta(seconds=int(eta_seconds)))}")
    print("=" * 80)
    print("  Progress logged every 10,000 steps.")
    print("  Models saved to: models/")
    print("  Meta reports to: rl_training/logs/")
    print("=" * 80 + "\n")
    sys.stdout.flush()
