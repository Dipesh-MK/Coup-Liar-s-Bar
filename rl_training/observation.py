"""Observation encoder for translating Coup game state into flat float32 numpy arrays."""

import numpy as np
from typing import Dict, Any, List
from constants import GameStage, Character, ActionType

# Total Observation Size Formula:
# Coins: num_players
# Revealed Count: num_players
# Is Active: num_players
# Current Player Index One-Hot: num_players
# Stage One-Hot: 8
# Hand Slot 1: 5
# Hand Slot 2: 5
# Action History: 6 slots * (num_players + 7 + 1 + 1) = 6 * num_players + 54
#
# Total size = 10 * num_players + 72
# For 3 players: 10 * 3 + 72 = 102 floats.
# For 2 players: 10 * 2 + 72 = 92 floats.
# For 4 players: 10 * 4 + 72 = 112 floats.

STAGE_TO_IDX = {
    GameStage.ACTION_SELECTION.value: 0,
    GameStage.CHALLENGE_WINDOW.value: 1,
    GameStage.BLOCK_WINDOW.value: 2,
    GameStage.BLOCK_CHALLENGE_WINDOW.value: 3,
    GameStage.REVEAL_CARD_CHALLENGE.value: 4,
    GameStage.REVEAL_CARD_LOSS.value: 5,
    GameStage.EXCHANGE_SELECTION.value: 6,
    GameStage.GAME_OVER.value: 7,
}

CARD_TO_IDX = {
    Character.DUKE.value: 0,
    Character.ASSASSIN.value: 1,
    Character.CAPTAIN.value: 2,
    Character.AMBASSADOR.value: 3,
    Character.CONTESSA.value: 4,
}

ACTION_TO_IDX = {
    ActionType.INCOME.value: 0,
    ActionType.FOREIGN_AID.value: 1,
    ActionType.COUP.value: 2,
    ActionType.TAX.value: 3,
    ActionType.STEAL.value: 4,
    ActionType.ASSASSINATE.value: 5,
    ActionType.EXCHANGE.value: 6,
}


class ActionHistory:
    """Circular buffer tracking the last 6 actions in the game."""

    def __init__(self, size: int = 6) -> None:
        self.size = size
        # Initialize buffer with empty padding records
        self.buffer: List[Dict[str, Any]] = [
            {"player_idx": -1, "action_type": None, "challenged": False, "succeeded": False}
            for _ in range(self.size)
        ]
        self.pointer = 0

    def push(self, player_idx: int, action_type: str, challenged: bool, succeeded: bool) -> None:
        """Pushes a new action record to the circular buffer."""
        self.buffer[self.pointer] = {
            "player_idx": player_idx,
            "action_type": action_type,
            "challenged": challenged,
            "succeeded": succeeded,
        }
        self.pointer = (self.pointer + 1) % self.size

    def to_list(self) -> List[Dict[str, Any]]:
        """Returns the circular buffer ordered from oldest to newest."""
        ordered = []
        for i in range(self.size):
            idx = (self.pointer + i) % self.size
            ordered.append(self.buffer[idx])
        return ordered


MAX_PLAYERS = 6
TARGET_ENCODING_SIZE = 6

def get_observation_size(num_players: int = 6) -> int:
    """Calculates the exact length of the flat observation vector."""
    return 10 * MAX_PLAYERS + 83 + TARGET_ENCODING_SIZE + 4


def encode_observation(
    state_dict: Dict[str, Any], player_id: str, action_history: ActionHistory, num_players: int
) -> np.ndarray:
    """Deterministic encoder converting player view dict into flat float32 array."""
    obs_parts = []

    players = state_dict["players"]
    
    # Pad players list up to MAX_PLAYERS
    padded_players = list(players)
    while len(padded_players) < MAX_PLAYERS:
        padded_players.append({
            "player_id": f"p{len(padded_players) + 1}",
            "name": f"Dummy {len(padded_players) + 1}",
            "coins": 0,
            "cards": [],
            "revealed_cards": [],
            "is_active": False
        })
    
    # 1. Coins, normalized by 12.0
    for p in padded_players:
        obs_parts.append(p["coins"] / 12.0)

    # 2. Revealed count (influences lost), normalized by 2.0
    for p in padded_players:
        obs_parts.append(len(p["revealed_cards"]) / 2.0)

    # 3. Active status
    for p in padded_players:
        obs_parts.append(1.0 if p["is_active"] else 0.0)

    # 4. Current player index one-hot
    curr_player_idx = state_dict["current_player_idx"]
    curr_player_one_hot = np.zeros(MAX_PLAYERS, dtype=np.float32)
    if 0 <= curr_player_idx < MAX_PLAYERS:
        curr_player_one_hot[curr_player_idx] = 1.0
    obs_parts.extend(curr_player_one_hot.tolist())

    # 5. Stage one-hot
    stage_str = state_dict["stage"]
    stage_one_hot = np.zeros(len(STAGE_TO_IDX), dtype=np.float32)
    if stage_str in STAGE_TO_IDX:
        stage_one_hot[STAGE_TO_IDX[stage_str]] = 1.0
    obs_parts.extend(stage_one_hot.tolist())

    # 6. Private cards one-hot (2 slots of size 5)
    agent_player = next(p for p in players if p["player_id"] == player_id)
    agent_cards = agent_player["cards"]
    
    hand_one_hot = np.zeros(10, dtype=np.float32)
    for i, card in enumerate(agent_cards[:2]):
        if card in CARD_TO_IDX:
            idx = i * 5 + CARD_TO_IDX[card]
            hand_one_hot[idx] = 1.0
    obs_parts.extend(hand_one_hot.tolist())

    # 7. Action history buffer (last 6 actions)
    history_records = action_history.to_list()
    for rec in history_records:
        # Who acted (one-hot over MAX_PLAYERS)
        actor_idx = rec["player_idx"]
        actor_one_hot = np.zeros(MAX_PLAYERS, dtype=np.float32)
        if 0 <= actor_idx < MAX_PLAYERS:
            actor_one_hot[actor_idx] = 1.0
        obs_parts.extend(actor_one_hot.tolist())

        # Action type (one-hot over 7 action types)
        act_type = rec["action_type"]
        act_one_hot = np.zeros(len(ACTION_TO_IDX), dtype=np.float32)
        if act_type in ACTION_TO_IDX:
            act_one_hot[ACTION_TO_IDX[act_type]] = 1.0
        obs_parts.extend(act_one_hot.tolist())

        # Challenged
        obs_parts.append(1.0 if rec["challenged"] else 0.0)

        # Succeeded
        obs_parts.append(1.0 if rec["succeeded"] else 0.0)

    # 8. Public deck card counts (5 slots, normalized by 3.0)
    deck_info = state_dict.get("deck", {})
    public_deck = deck_info.get("public_deck", [])
    public_counts = np.zeros(5, dtype=np.float32)
    for card in public_deck:
        if card in CARD_TO_IDX:
            public_counts[CARD_TO_IDX[card]] += 1.0
    obs_parts.extend((public_counts / 3.0).tolist())

    # 9. Discard pile card counts (5 slots, normalized by 3.0)
    discard_pile = deck_info.get("discard_pile", [])
    discard_counts = np.zeros(5, dtype=np.float32)
    for card in discard_pile:
        if card in CARD_TO_IDX:
            discard_counts[CARD_TO_IDX[card]] += 1.0
    obs_parts.extend((discard_counts / 3.0).tolist())

    # 10. Active bluff proven indicator (1 slot: 1.0 if opponent bluff is mathematically proven, 0.0 otherwise)
    bluff_proven = 0.0
    stage = state_dict.get("stage")
    if stage in (GameStage.CHALLENGE_WINDOW.value, GameStage.BLOCK_CHALLENGE_WINDOW.value):
        required_char = None
        if stage == GameStage.CHALLENGE_WINDOW.value:
            action = state_dict.get("active_action") or {}
            action_type_str = action.get("action_type")
            if action_type_str:
                try:
                    from constants import ACTION_ROLES, ActionType
                    act_type = ActionType(action_type_str)
                    if act_type in ACTION_ROLES:
                        required_char = ACTION_ROLES[act_type].value
                except (ValueError, KeyError):
                    pass
        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW.value:
            block = state_dict.get("active_block") or {}
            required_char = block.get("character")

        if required_char:
            # Count visible instances of required_char
            # 1. In player's own hand
            me = next((p for p in players if p["player_id"] == player_id), None)
            my_cards = me.get("cards", []) if me else []
            count = sum(1 for card in my_cards if card == required_char)

            # 2. In public deck remainder
            count += sum(1 for card in public_deck if card == required_char)

            # 3. In discard pile
            count += sum(1 for card in discard_pile if card == required_char)

            if count >= 3:
                bluff_proven = 1.0

    obs_parts.append(bluff_proven)

    # 11. Target encoding one-hot (6 slots)
    active_action = state_dict.get("active_action") or {}
    target_id = active_action.get("target_id")
    target_one_hot = np.zeros(MAX_PLAYERS, dtype=np.float32)
    if target_id:
        try:
            t_idx = int(target_id[1:]) - 1
            if 0 <= t_idx < MAX_PLAYERS:
                target_one_hot[t_idx] = 1.0
        except (ValueError, IndexError):
            pass
    obs_parts.extend(target_one_hot.tolist())

    # 12. Lobby size one-hot (4 slots: 3, 4, 5, 6 players)
    lobby_one_hot = np.zeros(4, dtype=np.float32)
    if 3 <= num_players <= 6:
        lobby_one_hot[num_players - 3] = 1.0
    obs_parts.extend(lobby_one_hot.tolist())

    # Flatten and return float32 array
    obs_vector = np.array(obs_parts, dtype=np.float32)
    
    # Safety size verification
    expected_size = get_observation_size()
    assert len(obs_vector) == expected_size, (
        f"Observation size mismatch! Expected: {expected_size}, got: {len(obs_vector)}"
    )
    
    return obs_vector
