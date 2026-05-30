"""
rl_training/personality_trainer.py — Fine-tune base Coup RL agent into specialized personality variants.
"""

import sys
import pathlib
import re
import random
from typing import Dict, Any, List, Tuple, Optional, Callable

# Ensure project root is in path
_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import Character, ActionType, GameStage, ACTION_BLOCK_TYPES, BLOCK_ROLES
from coup_engine import Game
from rl_training.env import CoupEnv, ActionHistory
from rl_training.train_ppo import CoupTrainingCallback

try:
    from sb3_contrib import MaskablePPO
    from sb3_contrib.common.wrappers import ActionMasker
    from stable_baselines3.common.vec_env import DummyVecEnv
except ImportError:
    MaskablePPO = None
    ActionMasker = None
    DummyVecEnv = None


# ---------------------------------------------------------------------------
# Personality Custom Environments
# ---------------------------------------------------------------------------

class BlufferCoupEnv(CoupEnv):
    """Encourages bluffing and risk-taking."""
    def _calculate_shaped_reward(
        self, player_id: str, action_dict: Dict[str, Any], prev_stage: GameStage, prev_action: Any,
        pre_coins: Dict[str, int], pre_cards: Dict[str, int], pre_active: Dict[str, bool],
        challenge_target: Optional[str], challenge_challenger: Optional[str]
    ) -> float:
        reward = super()._calculate_shaped_reward(
            player_id, action_dict, prev_stage, prev_action, pre_coins, pre_cards, pre_active, challenge_target, challenge_challenger
        )
        state = self.engine.state

        # Modify challenge outcome rewards
        if prev_stage == GameStage.REVEAL_CARD_CHALLENGE:
            if challenge_target == player_id:
                if state.reveal_loss_player_id == challenge_challenger:
                    # Successful bluff / truth proved: +0.4 (was +0.15, diff = +0.25)
                    reward += 0.25
                else:
                    # Caught bluffing: -0.1 (was -0.2, diff = +0.1)
                    reward += 0.1
            elif challenge_challenger == player_id:
                if state.reveal_loss_player_id == challenge_target:
                    # Successful challenge of opponent: +0.05 (was +0.15, diff = -0.1)
                    reward += -0.1

        # Income action penalty
        if action_dict.get("action") == ActionType.INCOME.value:
            reward += -0.02

        return reward


class AggressorCoupEnv(CoupEnv):
    """Encourages aggressive play and early eliminations."""
    def __init__(self, num_players: int = 3) -> None:
        super().__init__(num_players=num_players)
        self.my_eliminations = 0

    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[Any, Dict[str, Any]]:
        self.my_eliminations = 0
        return super().reset(seed=seed, options=options)

    def _calculate_shaped_reward(
        self, player_id: str, action_dict: Dict[str, Any], prev_stage: GameStage, prev_action: Any,
        pre_coins: Dict[str, int], pre_cards: Dict[str, int], pre_active: Dict[str, bool],
        challenge_target: Optional[str], challenge_challenger: Optional[str]
    ) -> float:
        reward = super()._calculate_shaped_reward(
            player_id, action_dict, prev_stage, prev_action, pre_coins, pre_cards, pre_active, challenge_target, challenge_challenger
        )
        state = self.engine.state
        player = state.get_player(player_id)

        # Track our eliminations
        for pid in pre_active:
            if pid != player_id and pre_active[pid] and not state.get_player(pid).is_active:
                if prev_action and prev_action.player_id == player_id:
                    self.my_eliminations += 1
                    if prev_action.action_type == ActionType.COUP:
                        # Coup action executed: +0.4 (was +0.2, diff = +0.2)
                        reward += 0.2
                    elif prev_action.action_type == ActionType.ASSASSINATE:
                        # Assassinate eliminates opponent: +0.35 (was +0.15, diff = +0.2)
                        reward += 0.2

        # Steal successful: +0.1 per coin (was +0.03, diff = +0.07)
        coin_diff = player.coins - pre_coins[player_id]
        if coin_diff > 0:
            action_name = action_dict.get("action")
            if action_name == ActionType.STEAL.value or (prev_action and prev_action.action_type == ActionType.STEAL):
                reward += 0.07 * coin_diff

        # Surviving past turn 25 without eliminating anyone: -0.05 per turn
        if player.is_active and state.turn_number > 25 and self.my_eliminations == 0:
            reward += -0.05

        # Income action penalty
        if action_dict.get("action") == ActionType.INCOME.value:
            reward += -0.03

        return reward


class ManipulatorCoupEnv(CoupEnv):
    """Encourages blocking and forcing opponents to waste resources."""
    def _calculate_shaped_reward(
        self, player_id: str, action_dict: Dict[str, Any], prev_stage: GameStage, prev_action: Any,
        pre_coins: Dict[str, int], pre_cards: Dict[str, int], pre_active: Dict[str, bool],
        challenge_target: Optional[str], challenge_challenger: Optional[str]
    ) -> float:
        reward = super()._calculate_shaped_reward(
            player_id, action_dict, prev_stage, prev_action, pre_coins, pre_cards, pre_active, challenge_target, challenge_challenger
        )
        state = self.engine.state
        player = state.get_player(player_id)

        # Block success: +0.2 (was +0.05, diff = +0.15)
        # Also award +0.1 for forcing opponent to waste coins
        if action_dict.get("action") == "block" and state.active_block:
            reward += 0.25

        # Challenge outcomes
        if prev_stage == GameStage.REVEAL_CARD_CHALLENGE:
            if challenge_target == player_id:
                # Opponent fails challenge against you: +0.25 (was +0.15, diff = +0.1)
                if state.reveal_loss_player_id == challenge_challenger:
                    reward += 0.1
            elif challenge_challenger == player_id:
                # Correct challenge: +0.02
                if state.reveal_loss_player_id == challenge_target:
                    reward += 0.02

        # Reach 10+ coins without Coup-ing: +0.1
        if player.coins >= 10:
            reward += 0.1

        return reward


# ---------------------------------------------------------------------------
# Fine-Tuning Execution
# ---------------------------------------------------------------------------

def finetune_personality(
    base_model_path: str,
    personality: str,
    additional_steps: int = 500_000,
    num_players: int = 3,
) -> str:
    """Loads base model and trains it for additional steps with personality rewards."""
    if MaskablePPO is None:
        print("sb3_contrib is not installed. Skipping fine-tuning.")
        return ""

    print(f"Fine-tuning {personality} for {additional_steps} steps...")
    
    # 1. Environment factory
    def _make_env():
        if personality == "bluffer":
            env = BlufferCoupEnv(num_players=num_players)
        elif personality == "aggressor":
            env = AggressorCoupEnv(num_players=num_players)
        else:
            env = ManipulatorCoupEnv(num_players=num_players)
        env = ActionMasker(env, lambda e: e.get_action_mask())
        return env

    vec_env = DummyVecEnv([_make_env for _ in range(4)])

    # 2. Load model
    model = MaskablePPO.load(base_model_path, env=vec_env)

    # 3. Setup callback and opponent pool
    log_dir = "rl_training/logs"
    models_dir = "models"
    
    callback = CoupTrainingCallback(
        total_timesteps=model.num_timesteps + additional_steps,
        log_dir=log_dir,
        models_dir=models_dir,
        num_players=num_players,
        start_step=model.num_timesteps
    )

    # Load opponent checkpoints
    checkpoints = sorted(
        [p for p in pathlib.Path(models_dir).glob("ppo_coup_[0-9]*.zip")],
        key=lambda p: int(re.search(r"ppo_coup_(\d+)", p.stem).group(1)) if re.search(r"ppo_coup_(\d+)", p.stem) else 0
    )
    for cp in checkpoints[-8:]:
        try:
            m = MaskablePPO.load(cp)
            def _opp_policy(obs_val, mask_val, model_opp=m):
                act, _ = model_opp.predict(obs_val, action_masks=mask_val, deterministic=False)
                return int(act)
            callback.pool.append(_opp_policy)
        except Exception as exc:
            print(f"Warning: could not load cp {cp.name}: {exc}")

    # Set pools
    for wrapped in vec_env.envs:
        inner = wrapped.env if hasattr(wrapped, "env") else wrapped
        inner.opponent_pool = list(callback.pool)

    # 4. Train
    model.learn(total_timesteps=additional_steps, callback=callback)
    
    save_path = f"models/ppo_coup_{personality}.zip"
    model.save(save_path)
    print(f"Personality {personality} saved to {save_path}")
    return save_path


def train_all_personalities(base_model_path: str):
    """Sequentially trains Bluffer, Aggressor, and Manipulator."""
    for personality in ["bluffer", "aggressor", "manipulator"]:
        finetune_personality(base_model_path, personality, additional_steps=100000) # Shortened for testing, but can be scaled


if __name__ == "__main__":
    if len(sys.argv) > 1:
        base_path = sys.argv[1]
    else:
        base_path = "models/ppo_coup_final.zip"
        
    train_all_personalities(base_path)
