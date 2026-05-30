"""
ai_player.py — Trained MaskablePPO AI that speaks the Coup WebSocket protocol.

This module provides:
  AIPlayer          — loads a trained model and converts server view dicts into actions
  random_legal_action — pure-random legal-action picker (testing / fallback)

The module is intentionally import-safe: if sb3_contrib or the model file is
absent, AIPlayer degrades to random_legal_action with a warning rather than crashing.
"""

import pathlib
import random
import sys
from typing import Dict, Any, List, Optional

import numpy as np

# Ensure project root is importable when running from anywhere
_PROJECT_ROOT = pathlib.Path(__file__).parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from constants import GameStage, ActionType, ACTION_BLOCK_TYPES, BLOCK_ROLES
from rl_training.env import CoupEnv
from rl_training.observation import encode_observation, ActionHistory


# ---------------------------------------------------------------------------
# Pure-random fallback (no model required)
# ---------------------------------------------------------------------------

def random_legal_action(view: Dict[str, Any], player_id: str, num_players: int = 3) -> Dict[str, Any]:
    """
    Picks a random legal action for `player_id` given the server's player-view dict.
    Used for testing and as a fallback when no model is available.
    Returns an action dict compatible with game.handle_input().
    """
    legal = get_legal_actions_from_view(view, player_id)
    if not legal:
        return {"action": "pass"}
    return random.choice(legal)


def get_legal_actions_from_view(view: Dict[str, Any], player_id: str) -> List[Dict[str, Any]]:
    """
    Derives legal actions from the server view dict using stage + pending lists.
    This is a pure-logic computation that does not require a live engine.
    """
    stage_str = view.get("stage", "")
    players = view.get("players", [])
    me = next((p for p in players if p["player_id"] == player_id), None)
    if me is None or not me.get("is_active", False):
        return []

    if stage_str == GameStage.GAME_OVER.value:
        return []

    if stage_str == GameStage.ACTION_SELECTION.value:
        current_idx = view.get("current_player_idx", -1)
        if current_idx < 0 or current_idx >= len(players):
            return []
        if players[current_idx]["player_id"] != player_id:
            return []
        return _action_selection_options(me, players, player_id)

    if stage_str in (GameStage.CHALLENGE_WINDOW.value, GameStage.BLOCK_CHALLENGE_WINDOW.value):
        if player_id not in view.get("pending_challenge_players", []):
            return []
        return [{"action": "pass"}, {"action": "challenge"}]

    if stage_str == GameStage.BLOCK_WINDOW.value:
        if player_id not in view.get("pending_block_players", []):
            return []
        actions = [{"action": "pass"}]
        active_action = view.get("active_action", {})
        act_type_str = active_action.get("action_type", "")
        try:
            act_type = ActionType(act_type_str)
            block_type = ACTION_BLOCK_TYPES[act_type]
            for char in BLOCK_ROLES[block_type]:
                actions.append({"action": "block", "character": char.value})
        except (ValueError, KeyError):
            pass
        return actions

    if stage_str == GameStage.REVEAL_CARD_CHALLENGE.value:
        if view.get("challenge_target_id") != player_id:
            return []
        return [{"action": "reveal", "character": c} for c in set(me.get("cards", []))]

    if stage_str == GameStage.REVEAL_CARD_LOSS.value:
        if view.get("reveal_loss_player_id") != player_id:
            return []
        return [{"action": "reveal", "character": c} for c in set(me.get("cards", []))]

    if stage_str == GameStage.EXCHANGE_SELECTION.value:
        active_action = view.get("active_action", {})
        if active_action.get("player_id") != player_id:
            return []
        drawn = view.get("exchange_drawn_cards", [])
        pool = me.get("cards", []) + drawn
        original_size = len(me.get("cards", []))
        import itertools
        seen = set()
        actions = []
        for combo in itertools.combinations(range(len(pool)), original_size):
            key = tuple(sorted(pool[i] for i in combo))
            if key not in seen:
                seen.add(key)
                actions.append({"action": "exchange", "keep": list(key)})
        return actions

    return []


def _action_selection_options(
    me: Dict[str, Any], players: List[Dict[str, Any]], player_id: str
) -> List[Dict[str, Any]]:
    """Computes valid primary actions for the action-selection stage."""
    coins = me.get("coins", 0)
    targets = [p["player_id"] for p in players if p.get("is_active") and p["player_id"] != player_id]
    actions = []

    if coins >= 10:
        return [{"action": ActionType.COUP.value, "target_id": t} for t in targets]

    actions.append({"action": ActionType.INCOME.value})
    actions.append({"action": ActionType.FOREIGN_AID.value})
    actions.append({"action": ActionType.TAX.value})
    actions.append({"action": ActionType.EXCHANGE.value})
    for t in targets:
        actions.append({"action": ActionType.STEAL.value, "target_id": t})
    if coins >= 3:
        for t in targets:
            actions.append({"action": ActionType.ASSASSINATE.value, "target_id": t})
    if coins >= 7:
        for t in targets:
            actions.append({"action": ActionType.COUP.value, "target_id": t})
    return actions



# ---------------------------------------------------------------------------
# Observation builder from raw server view dict
# ---------------------------------------------------------------------------

def _view_to_obs(view: Dict[str, Any], player_id: str,
                 history: ActionHistory, num_players: int) -> np.ndarray:
    """Convert a server's view dict into the flat float32 obs vector used during training."""
    return encode_observation(view, player_id, history, num_players)


# ---------------------------------------------------------------------------
# CoupEnv-based legal action resolver (no engine reconstruction needed)
# ---------------------------------------------------------------------------

class _LegalActionResolver:
    """
    Resolves legal actions directly from a server view dict by rebuilding
    the action mask using a temporary CoupEnv.

    We keep a persistent CoupEnv per resolver and sync its state from the view dict
    on every call — this avoids re-creating the env each time.
    """

    def __init__(self, num_players: int) -> None:
        self.num_players = num_players
        self._env = CoupEnv(num_players=num_players)

    def get_legal_action_dicts(self, view: Dict[str, Any], player_id: str) -> List[Dict[str, Any]]:
        """
        Returns the list of legal action dicts for player_id by inspecting the
        CoupEngine directly — bypasses the need to deserialize full game state.
        """
        stage_str = view.get("stage", "")
        try:
            stage = GameStage(stage_str)
        except ValueError:
            return [{"action": "pass"}]

        # Delegate to the engine's own legal-action computation
        # NOTE: We cannot reconstruct the full engine from a partial view, so we
        # instead ask the *live* env for its legal actions only when it's our turn.
        # For all other purposes (AI uses env-based training loop), this is fine.
        return self._env.engine.get_legal_actions(player_id)


# ---------------------------------------------------------------------------
# Main AIPlayer class
# ---------------------------------------------------------------------------

class AIPlayer:
    """
    An AI-controlled Coup player that uses a trained MaskablePPO model to
    select actions given the current server view dict.

    Parameters
    ----------
    model_path : str
        Path to a saved MaskablePPO .zip checkpoint (e.g. 'models/ppo_coup_best.zip').
        If the file does not exist, the player falls back to random legal actions.
    player_id : str
        The player's ID on the server (e.g. 'p2').
    num_players : int
        Total number of players in the game (must match training config).
    name : str
        Display name for logs and the server lobby.
    """

    def __init__(
        self,
        model_path: str,
        player_id: str,
        num_players: int = 3,
        name: str = "CoupBot",
    ) -> None:
        self.player_id = player_id
        self.num_players = num_players
        self.name = name
        self.model = None
        self.history = ActionHistory()

        # Build a persistent env solely for action-mask computation
        self._env = CoupEnv(num_players=num_players)

        model_file = pathlib.Path(model_path)
        if model_file.exists():
            try:
                from sb3_contrib import MaskablePPO
                self.model = MaskablePPO.load(model_file)
                print(f"[AIPlayer:{name}] Model loaded from {model_file.name}", flush=True)
            except Exception as exc:
                print(f"[AIPlayer:{name}] WARNING: Failed to load model ({exc}). Using random policy.", flush=True)
        else:
            print(f"[AIPlayer:{name}] Model not found at {model_path}. Using random policy.", flush=True)

    def reset(self) -> None:
        """Resets the internal action history at the start of a new game."""
        self.history = ActionHistory()

    def choose_action(self, view: Dict[str, Any]) -> Dict[str, Any]:
        """
        Given the server's player-view dict, returns the action dict to send.

        Strategy:
        1. Compute legal actions from the view.
        2. If model is available, build obs + mask and call model.predict().
        3. Map the predicted action index back to an action dict.
        4. Validate the action is legal; fall back to random if not.
        """
        # Override rule: if in last life and targeted by an Assassinate action, call a bluff (challenge) regardless
        stage_str = view.get("stage", "")
        if stage_str == "Challenge Window":
            active_action = view.get("active_action", {})
            if active_action and active_action.get("action_type") == "Assassinate" and active_action.get("target_id") == self.player_id:
                players = view.get("players", [])
                me = next((p for p in players if p["player_id"] == self.player_id), None)
                if me and len(me.get("cards", [])) == 1:
                    print(f"[AIPlayer:{self.name}] Target of Assassinate at 1 life: CALLING A BLUFF REGARDLESS!", flush=True)
                    return {"action": "challenge"}

        legal_actions = self._get_legal_actions(view)
        if not legal_actions:
            return {"action": "pass"}

        if self.model is None:
            return random.choice(legal_actions)

        try:
            obs = _view_to_obs(view, self.player_id, self.history, self.num_players)
            mask = self._build_mask_from_legal(legal_actions)
            action_idx, _ = self.model.predict(obs, action_masks=mask, deterministic=False)
            action_dict = self._env.action_index_to_action.get(int(action_idx))

            # Safety: validate the chosen action is actually legal
            if action_dict and self._is_legal(action_dict, legal_actions):
                return action_dict

            # Fallback: random from legal
            return random.choice(legal_actions)

        except Exception as exc:
            print(f"[AIPlayer:{self.name}] predict error: {exc}. Using random.", flush=True)
            return random.choice(legal_actions)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_legal_actions(self, view: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Derives legal actions from the server view dict using stage + pending lists.
        This is a pure-logic computation that does not require a live engine.
        """
        return get_legal_actions_from_view(view, self.player_id)


    def _build_mask_from_legal(self, legal_actions: List[Dict[str, Any]]) -> np.ndarray:
        """Constructs a boolean action mask from a list of legal action dicts."""
        mask = np.zeros(self._env.action_space.n, dtype=bool)
        for act in legal_actions:
            key = self._env._action_to_key(act)
            idx = self._env.action_key_to_index.get(key)
            if idx is not None:
                mask[idx] = True
        # If no mask entries found, allow all (safe fallback)
        if not mask.any():
            mask[:] = True
        return mask

    def _is_legal(self, action_dict: Dict[str, Any], legal_actions: List[Dict[str, Any]]) -> bool:
        """Checks whether an action dict appears in the legal actions list."""
        key = self._env._action_to_key(action_dict)
        for legal in legal_actions:
            if self._env._action_to_key(legal) == key:
                return True
        return False

    def notify_action(self, actor_idx: int, action_type: str,
                      challenged: bool = False, succeeded: bool = True) -> None:
        """
        Push an observed action into the history buffer.
        Call this after each game step so the obs encoding stays up to date.
        """
        self.history.push(actor_idx, action_type, challenged, succeeded)
