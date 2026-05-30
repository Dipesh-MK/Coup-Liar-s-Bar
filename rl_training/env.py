"""Gymnasium Environment wrapping the Coup Game Engine for RL self-play."""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
import random

from constants import Character, ActionType, BlockType, GameStage, ACTION_BLOCK_TYPES, BLOCK_ROLES, ACTION_ROLES
from coup_engine import Game
from rl_training.observation import encode_observation, get_observation_size, ActionHistory

# ==============================================================================
# ACTION SPACE MAPPING REFERENCE (For num_players = N)
# Size of action space = 3*N + 35
# Index Mapping:
# 0: Income (no target)
# 1: Foreign Aid (no target)
# 2: Tax (no target)
# 3: Exchange (no target)
# 4 to (4 + N - 1): Steal target p{j+1}
# (4 + N) to (4 + 2N - 1): Assassinate target p{j+1}
# (4 + 2N) to (4 + 3N - 1): Coup target p{j+1}
# (4 + 3N): Challenge
# (4 + 3N + 1): Pass
# (4 + 3N + 2): Block as Duke
# (4 + 3N + 3): Block as Contessa
# (4 + 3N + 4): Block as Captain
# (4 + 3N + 5): Block as Ambassador
# (4 + 3N + 6) to (4 + 3N + 10): Reveal card (Duke, Assassin, Captain, Ambassador, Contessa)
# (4 + 3N + 11) to (4 + 3N + 15): Keep 1 card (Duke, Assassin, Captain, Ambassador, Contessa)
# (4 + 3N + 16) to (4 + 3N + 30): Keep 2 cards (combinations of Duke, Assassin, Captain, Ambassador, Contessa)
# ==============================================================================


class CoupEngine:
    """Wrapper around the engine's Game class to expose expected RL interfaces."""

    def __init__(self, num_players: int) -> None:
        self.num_players = num_players
        self.player_ids = [f"p{i}" for i in range(1, num_players + 1)]
        self.player_names = [f"Player {i}" for i in range(1, num_players + 1)]
        self.game = Game(self.player_ids, self.player_names)

    def reset(self) -> Dict[str, Any]:
        """Resets the game state and returns the public view of the start."""
        self.game = Game(self.player_ids, self.player_names)
        return self.game.state.to_dict()

    @property
    def state(self) -> Any:
        return self.game.state

    def get_winner(self) -> Optional[str]:
        """Returns the winner player_id if game is over."""
        if self.game.state.stage == GameStage.GAME_OVER:
            active = [p for p in self.game.state.players if p.is_active]
            if active:
                return active[0].player_id
        return None

    def get_acting_player_id(self) -> str:
        """Determines who needs to make a decision in the current stage."""
        stage = self.game.state.stage
        if stage == GameStage.GAME_OVER:
            return ""
        if stage == GameStage.ACTION_SELECTION:
            return self.game.state.current_player.player_id
        elif stage == GameStage.CHALLENGE_WINDOW:
            return self.game.state.pending_challenge_players[0]
        elif stage == GameStage.BLOCK_WINDOW:
            return self.game.state.pending_block_players[0]
        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
            return self.game.state.pending_challenge_players[0]
        elif stage == GameStage.REVEAL_CARD_CHALLENGE:
            return self.game.state.challenge_target_id
        elif stage == GameStage.REVEAL_CARD_LOSS:
            return self.game.state.reveal_loss_player_id
        elif stage == GameStage.EXCHANGE_SELECTION:
            return self.game.state.active_action.player_id
        return ""

    def get_legal_actions(self, player_id: str) -> List[Dict[str, Any]]:
        """Calculates valid inputs/action dictionaries for a player in the current state."""
        stage = self.game.state.stage
        if stage == GameStage.GAME_OVER:
            return []

        player = self.game.state.get_player(player_id)
        if not player.is_active:
            return []

        inputs = []

        if stage == GameStage.ACTION_SELECTION:
            if player_id != self.game.state.current_player.player_id:
                return []
            
            targets = [p.player_id for p in self.game.state.players if p.is_active and p.player_id != player_id]

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
            if player_id not in self.game.state.pending_challenge_players:
                return []
            
            # Heuristic override: if in last life and targeted by an Assassinate action, call a bluff (challenge) regardless
            active_action = self.game.state.active_action
            if active_action and active_action.action_type == ActionType.ASSASSINATE and active_action.target_id == player_id:
                if len(player.cards) == 1:
                    return [{"action": "challenge"}]

            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})

        elif stage == GameStage.BLOCK_WINDOW:
            if player_id not in self.game.state.pending_block_players:
                return []
            inputs.append({"action": "pass"})
            
            action_type = self.game.state.active_action.action_type
            block_type = ACTION_BLOCK_TYPES[action_type]
            allowed_chars = BLOCK_ROLES[block_type]
            
            for char in allowed_chars:
                inputs.append({"action": "block", "character": char.value})

        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
            if player_id not in self.game.state.pending_challenge_players:
                return []
            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})

        elif stage == GameStage.REVEAL_CARD_CHALLENGE:
            if player_id != self.game.state.challenge_target_id:
                return []
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})

        elif stage == GameStage.REVEAL_CARD_LOSS:
            if player_id != self.game.state.reveal_loss_player_id:
                return []
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})

        elif stage == GameStage.EXCHANGE_SELECTION:
            if player_id != self.game.state.active_action.player_id:
                return []
            drawn = self.game.state.exchange_drawn_cards
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

    def step(self, action_dict: Dict[str, Any]) -> Tuple[bool, str]:
        """Executes action in the rules engine for the currently acting player."""
        acting_player_id = self.get_acting_player_id()
        if not acting_player_id:
            return False, "No acting player found."
        return self.game.handle_input(acting_player_id, action_dict)


class CoupEnv(gym.Env):
    """Gymnasium Environment wrapping CoupEngine for single-agent training against self-play opponents."""
    
    metadata = {"render_modes": ["human", "ansi"]}

    def __init__(self, num_players: int = 3, render_mode: Optional[str] = None, randomize_players: bool = False) -> None:
        super().__init__()
        self.num_players = num_players
        self.render_mode = render_mode
        self.learning_agent_id = "p1"  # Agent always plays as Player 1
        self.randomize_players = randomize_players
        
        self.engine = CoupEngine(num_players)
        self.history = ActionHistory()
        
        # Build action space mappings
        self._build_action_mappings()
        
        # Spaces definition
        from rl_training.observation import MAX_PLAYERS
        obs_size = get_observation_size()
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(obs_size,), dtype=np.float32)
        self.action_space = spaces.Discrete(3 * MAX_PLAYERS + 35)

        # Opponent policies pool (player_id -> policy function)
        self.opponent_pool: List[Any] = []
        self.active_opponents: Dict[str, Any] = {}
        
        # Stats tracking
        self.game_stats: Dict[str, Any] = {}
        self._active_bluff: Optional[str] = None
        self.my_eliminations = 0
        self._init_stats()

    def _init_stats(self) -> None:
        """Initializes empty stats dict for logging."""
        self.game_stats = {
            "winner_id": None,
            "length": 0,
            "players_stats": {
                pid: {
                    "action_counts": {act.value: 0 for act in ActionType},
                    "bluff_attempts": 0,
                    "bluff_successes": 0,
                    "challenges_made": 0,
                    "challenges_won": 0,
                    "blocks_made": 0,
                    "final_coins": 0,
                    "eliminated_turn": None
                } for pid in self.engine.player_ids
            },
            "revealed_influences": [],
            "challenges": [],
            "action_sequence": []
        }
        self._active_bluff = None

    def _action_to_key(self, act: Dict[str, Any]) -> Tuple:
        """Utility converting action dict into a hashable key for quick mapping lookup."""
        name = act.get("action")
        if name in [ActionType.INCOME.value, ActionType.FOREIGN_AID.value, ActionType.TAX.value, ActionType.EXCHANGE.value]:
            return (name,)
        elif name in [ActionType.STEAL.value, ActionType.ASSASSINATE.value, ActionType.COUP.value]:
            return (name, act.get("target_id"))
        elif name in ["challenge", "pass"]:
            return (name,)
        elif name == "block":
            return ("block", act.get("character"))
        elif name == "reveal":
            return ("reveal", act.get("character"))
        elif name == "exchange":
            return ("exchange", tuple(sorted(act.get("keep"))))
        return (None,)

    def _build_action_mappings(self) -> None:
        """Constructs bidirectional action mappings between integer IDs and engine actions."""
        self.action_index_to_action = {
            0: {"action": "Income"},
            1: {"action": "Foreign Aid"},
            2: {"action": "Tax"},
            3: {"action": "Exchange"},
        }
        from rl_training.observation import MAX_PLAYERS
        N = MAX_PLAYERS
        for j in range(N):
            self.action_index_to_action[4 + j] = {"action": "Steal", "target_id": f"p{j+1}"}
            self.action_index_to_action[4 + N + j] = {"action": "Assassinate", "target_id": f"p{j+1}"}
            self.action_index_to_action[4 + 2 * N + j] = {"action": "Coup", "target_id": f"p{j+1}"}
        
        base = 4 + 3 * N
        self.action_index_to_action[base] = {"action": "challenge"}
        self.action_index_to_action[base + 1] = {"action": "pass"}
        self.action_index_to_action[base + 2] = {"action": "block", "character": "Duke"}
        self.action_index_to_action[base + 3] = {"action": "block", "character": "Contessa"}
        self.action_index_to_action[base + 4] = {"action": "block", "character": "Captain"}
        self.action_index_to_action[base + 5] = {"action": "block", "character": "Ambassador"}
        
        self.action_index_to_action[base + 6] = {"action": "reveal", "character": "Duke"}
        self.action_index_to_action[base + 7] = {"action": "reveal", "character": "Assassin"}
        self.action_index_to_action[base + 8] = {"action": "reveal", "character": "Captain"}
        self.action_index_to_action[base + 9] = {"action": "reveal", "character": "Ambassador"}
        self.action_index_to_action[base + 10] = {"action": "reveal", "character": "Contessa"}
        
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        for idx, char in enumerate(chars):
            self.action_index_to_action[base + 11 + idx] = {"action": "exchange", "keep": [char]}
            
        combo_idx = 0
        for i in range(len(chars)):
            for j in range(i, len(chars)):
                self.action_index_to_action[base + 16 + combo_idx] = {
                    "action": "exchange",
                    "keep": [chars[i], chars[j]]
                }
                combo_idx += 1

        self.action_key_to_index = {}
        for idx, act in self.action_index_to_action.items():
            self.action_key_to_index[self._action_to_key(act)] = idx

    def get_action_mask(self) -> np.ndarray:
        """Returns binary mask indicating legal actions for the current actor."""
        mask = np.zeros(self.action_space.n, dtype=bool)
        acting_player_id = self.engine.get_acting_player_id()
        if not acting_player_id:
            return mask
        
        legal_actions = self.engine.get_legal_actions(acting_player_id)
        for act in legal_actions:
            key = self._action_to_key(act)
            if key in self.action_key_to_index:
                mask[self.action_key_to_index[key]] = True
        return mask

    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Resets the environment, sampling new opponent policies and playing until agent turn."""
        super().reset(seed=seed)
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        if self.randomize_players:
            self.num_players = random.randint(3, 6)
            self.engine = CoupEngine(self.num_players)
        else:
            self.engine.reset()

        self.history = ActionHistory()
        self.my_eliminations = 0
        self._init_stats()

        # Set up active opponent models
        self.active_opponents = {}
        for i in range(2, self.num_players + 1):
            pid = f"p{i}"
            if self.opponent_pool and random.random() > 0.35:
                # 65% chance to choose a trained opponent model from pool
                self.active_opponents[pid] = random.choice(self.opponent_pool)
            else:
                # 35% fallback (or pool empty) to random choice policy
                self.active_opponents[pid] = self._random_policy

        # Play automatic turns until it is the learning agent's decision window
        self._play_opponents_turns()

        obs = self._get_agent_obs()
        return obs, {"action_mask": self.get_action_mask()}

    def _random_policy(self, obs: np.ndarray, mask: np.ndarray, *args, **kwargs) -> int:
        """Default policy choosing actions uniformly from valid mask indices."""
        valid_indices = np.where(mask)[0]
        if len(valid_indices) == 0:
            return 0  # Fallback
        return int(random.choice(valid_indices))

    def _play_opponents_turns(self) -> None:
        """Executes actions for other players in the game loop until the agent needs to act."""
        opp_steps = 0
        while self.engine.state.stage != GameStage.GAME_OVER:
            acting_player_id = self.engine.get_acting_player_id()
            if acting_player_id == self.learning_agent_id:
                break  # Stop to wait for learning agent input

            opp_steps += 1
            if opp_steps > 200:
                self.engine.state.stage = GameStage.GAME_OVER
                break

            # It's an opponent player's turn. Query their policy.
            opponent_policy = self.active_opponents[acting_player_id]
            opp_obs = encode_observation(
                self.engine.state.get_player_view(acting_player_id),
                acting_player_id,
                self.history,
                self.num_players
            )
            
            # Action mask for opponent
            opp_mask = self.get_action_mask()
            action_idx = opponent_policy(opp_obs, opp_mask, self.engine.state, self.history)
            
            # Map index and step
            action_dict = self.action_index_to_action[action_idx]
            
            # Extract parameters for action history tracking before resolving
            prev_stage = self.engine.state.stage
            prev_action = self.engine.state.active_action
            
            # Track player coin, card, and elimination states before executing
            opp_pre_coins = {p.player_id: p.coins for p in self.engine.state.players}
            opp_pre_cards = {p.player_id: len(p.cards) for p in self.engine.state.players}
            opp_pre_active = {p.player_id: p.is_active for p in self.engine.state.players}
            opp_challenge_target = self.engine.state.challenge_target_id
            opp_challenge_challenger = self.engine.state.challenge_challenger_id

            success, msg = self.engine.step(action_dict)
            if success:
                self._update_action_history(acting_player_id, action_dict, prev_stage, prev_action)
                self._track_action_execution(
                    acting_player_id,
                    action_dict,
                    opp_pre_cards,
                    opp_pre_coins,
                    opp_pre_active,
                    opp_challenge_target,
                    opp_challenge_challenger
                )

    def _get_agent_obs(self) -> np.ndarray:
        """Fetches the state observation array for the learning agent."""
        view = self.engine.state.get_player_view(self.learning_agent_id)
        return encode_observation(view, self.learning_agent_id, self.history, self.num_players)

    def step(self, action_index: int) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """Applies agent's decision, calculates rewards, and steps opponents until next agent decision."""
        # Check action mask validation
        mask = self.get_action_mask()
        if not mask[action_index]:
            # Illegal action penalty
            obs = self._get_agent_obs()
            return obs, -0.5, False, False, {"action_mask": mask}

        action_dict = self.action_index_to_action[action_index]
        
        # Save states before execution to compute shaped reward
        prev_stage = self.engine.state.stage
        prev_action = self.engine.state.active_action
        
        # Track player coin, card, and elimination states before executing
        pre_coins = {p.player_id: p.coins for p in self.engine.state.players}
        pre_cards = {p.player_id: len(p.cards) for p in self.engine.state.players}
        pre_active = {p.player_id: p.is_active for p in self.engine.state.players}
        
        # Setup challenge context if resolving challenge
        challenge_target = self.engine.state.challenge_target_id
        challenge_challenger = self.engine.state.challenge_challenger_id

        # Step the engine
        success, msg = self.engine.step(action_dict)
        assert success, f"Sanitized mask was True but step failed: {msg}"

        # Record action in history queue
        self._update_action_history(self.learning_agent_id, action_dict, prev_stage, prev_action)

        # Track execution stats
        self._track_action_execution(
            self.learning_agent_id,
            action_dict,
            pre_cards,
            pre_coins,
            pre_active,
            challenge_target,
            challenge_challenger
        )

        # Compute immediate action reward for the agent
        reward = self._calculate_shaped_reward(
            self.learning_agent_id,
            action_dict,
            prev_stage,
            prev_action,
            pre_coins,
            pre_cards,
            pre_active,
            challenge_target,
            challenge_challenger
        )

        # Step opponents until game ends or the learning agent needs to act again
        self._play_opponents_turns()

        # Check termination & win rewards
        terminated = (self.engine.state.stage == GameStage.GAME_OVER) or (not self.engine.state.get_player(self.learning_agent_id).is_active)
        
        # Survival/Elimination status check
        post_active = {p.player_id: p.is_active for p in self.engine.state.players}
        if pre_active[self.learning_agent_id] and not post_active[self.learning_agent_id]:
            reward += -1.0  # Elimination penalty
        
        winner_id = self.engine.get_winner()
        if winner_id == self.learning_agent_id:
            reward += 1.0  # Winner reward

        obs = self._get_agent_obs()
        
        # Pack game stats inside info dict if terminated
        info = {"action_mask": self.get_action_mask()}
        if terminated:
            info["game_result"] = self.game_stats

        return obs, reward, terminated, False, info

    def _track_action_execution(
        self, acting_player_id: str, action_dict: Dict[str, Any],
        pre_cards: Dict[str, int], pre_coins: Dict[str, int], pre_active: Dict[str, bool],
        challenge_target: Optional[str], challenge_challenger: Optional[str]
    ) -> None:
        """Tracks detailed gameplay metrics for training and strategy analysis."""
        state = self.engine.state
        turn = state.turn_number
        self.game_stats["length"] = turn
        action_name = action_dict.get("action")
        
        self.game_stats["action_sequence"].append({
            "turn": turn,
            "player_id": acting_player_id,
            "action": action_name,
            "target_id": action_dict.get("target_id"),
            "character": action_dict.get("character"),
            "keep": action_dict.get("keep")
        })

        # 1. Action counts & Bluff attempts
        is_primary = action_name in [a.value for a in ActionType]
        if is_primary:
            if action_name in self.game_stats["players_stats"][acting_player_id]["action_counts"]:
                self.game_stats["players_stats"][acting_player_id]["action_counts"][action_name] += 1
            
            # Check if this action is a bluff
            try:
                act_type = ActionType(action_name)
                if act_type in ACTION_ROLES:
                    req_char = ACTION_ROLES[act_type]
                    player = state.get_player(acting_player_id)
                    if req_char not in player.cards:
                        self.game_stats["players_stats"][acting_player_id]["bluff_attempts"] += 1
                        self._active_bluff = acting_player_id
            except ValueError:
                pass

        # 2. Block counts & bluff attempts
        if action_name == "block":
            self.game_stats["players_stats"][acting_player_id]["blocks_made"] += 1
            block_char_str = action_dict.get("character")
            if block_char_str:
                block_char = Character(block_char_str)
                player = state.get_player(acting_player_id)
                if block_char not in player.cards:
                    self.game_stats["players_stats"][acting_player_id]["bluff_attempts"] += 1
                    self._active_bluff = acting_player_id

        # 3. Challenges made & won
        if action_name == "challenge":
            self.game_stats["players_stats"][acting_player_id]["challenges_made"] += 1

        # 4. Bluff success check
        if action_name == "pass" and self._active_bluff:
            if not state.pending_challenge_players:
                self.game_stats["players_stats"][self._active_bluff]["bluff_successes"] += 1
                self._active_bluff = None

        # 5. Challenge resolution (during reveal challenge)
        if challenge_target and challenge_challenger:
            if state.reveal_loss_player_id == challenge_challenger:
                # Target won challenge (honest)
                self.game_stats["players_stats"][challenge_target]["challenges_won"] += 1
                self.game_stats["challenges"].append({
                    "turn": turn, "challenger": challenge_challenger, "target": challenge_target, "won": False
                })
            elif state.reveal_loss_player_id == challenge_target:
                # Challenger won challenge (bluff caught)
                self.game_stats["players_stats"][challenge_challenger]["challenges_won"] += 1
                self.game_stats["challenges"].append({
                    "turn": turn, "challenger": challenge_challenger, "target": challenge_target, "won": True
                })
            self._active_bluff = None

        # 6. Card losses & Eliminations
        for pid in pre_active:
            player = state.get_player(pid)
            post_card_count = len(player.cards)
            if post_card_count < pre_cards[pid]:
                if player.revealed_cards:
                    lost_card = player.revealed_cards[-1]
                    self.game_stats["revealed_influences"].append({
                        "card": lost_card.value, "turn": turn, "player_id": pid
                    })
                
                if pre_active[pid] and not player.is_active:
                    self.game_stats["players_stats"][pid]["eliminated_turn"] = turn
                    self.game_stats["players_stats"][pid]["final_coins"] = player.coins

        # 7. Winner
        winner_id = self.engine.get_winner()
        if winner_id:
            self.game_stats["winner_id"] = winner_id
            for p in state.players:
                if p.is_active:
                    self.game_stats["players_stats"][p.player_id]["final_coins"] = p.coins

    def _update_action_history(self, player_id: str, action_dict: Dict[str, Any], prev_stage: GameStage, prev_action: Any) -> None:
        """Pushes action descriptions to history log."""
        p_idx = int(player_id[1:]) - 1
        name = action_dict.get("action")
        
        # Map sub-actions to root actions for clean logs
        if name in ["challenge", "pass", "block", "reveal", "exchange"]:
            if name == "challenge" and prev_action:
                self.history.push(p_idx, f"Challenge {prev_action.action_type.value}", True, True)
            return

        challenged = (self.engine.state.challenge_challenger_id is not None)
        succeeded = True
        if name == ActionType.TAX.value and challenged:
            succeeded = (self.engine.state.reveal_loss_reason != "failed_challenge_loss")

        self.history.push(p_idx, name, challenged, succeeded)

    def _calculate_shaped_reward(
        self, player_id: str, action_dict: Dict[str, Any], prev_stage: GameStage, prev_action: Any,
        pre_coins: Dict[str, int], pre_cards: Dict[str, int], pre_active: Dict[str, bool],
        challenge_target: Optional[str], challenge_challenger: Optional[str]
    ) -> float:
        """Applies rules rewards matching the customized target benchmarks."""
        reward = 0.0
        state = self.engine.state
        player = state.get_player(player_id)
        
        # Survival reward
        if player.is_active:
            reward += 0.01

        # 1. Tax & Steal coin gains
        coin_diff = player.coins - pre_coins[player_id]
        if coin_diff > 0:
            action_name = action_dict.get("action")
            if action_name == ActionType.TAX.value:
                reward += 0.03 * coin_diff
            elif action_name == ActionType.STEAL.value or (prev_action and prev_action.action_type == ActionType.STEAL):
                reward += 0.03 * coin_diff

        # 2. Block success
        if action_dict.get("action") == "block" and state.active_block:
            reward += 0.05

        # 3. Eliminations and tracker update
        for pid in pre_active:
            if pid != player_id and pre_active[pid] and not state.get_player(pid).is_active:
                if prev_action and prev_action.player_id == player_id:
                    self.my_eliminations += 1
                    if prev_action.action_type == ActionType.COUP:
                        reward += 0.2
                    elif prev_action.action_type == ActionType.ASSASSINATE:
                        reward += 0.15

        # 4. Challenge outcomes (rebalanced)
        if prev_stage == GameStage.REVEAL_CARD_CHALLENGE:
            if challenge_target == player_id:
                if state.reveal_loss_player_id == challenge_challenger:
                    reward += 0.1  # Won challenge (proved card): +0.1
                else:
                    reward += -0.35  # Caught bluffing: -0.35
            elif challenge_challenger == player_id:
                if state.reveal_loss_player_id == challenge_target:
                    reward += 0.3  # Successful challenge of bluff: +0.3
                else:
                    reward += -0.08  # Failed challenge (had card): -0.08

        # 5. Discourage passive Foreign Aid loop when Duke is in hand
        if action_dict.get("action") == ActionType.FOREIGN_AID.value and Character.DUKE in player.cards:
            reward += -0.05

        # 6. Mild pressure against extreme passivity early game
        if action_dict.get("action") == ActionType.INCOME.value and pre_coins[player_id] < 3 and prev_stage == GameStage.ACTION_SELECTION:
            reward += -0.02

        # 7. Penalty for passive survival past turn 30 without eliminations
        if player.is_active and state.turn_number > 30 and self.my_eliminations == 0:
            reward += -0.03

        return reward

    def render(self, mode: str = "human") -> Optional[str]:
        """Prints or returns readable visualization of the game state."""
        state = self.engine.game.state
        output = []
        output.append("=" * 60)
        output.append(f"Coup Env | Turn {state.turn_number} | Stage: {state.stage.value}")
        for p in state.players:
            hand_str = ", ".join([c.value for c in p.cards]) if p.player_id == self.learning_agent_id else f"{len(p.cards)} Cards"
            output.append(f"  * {p.name} ({p.player_id}): {p.coins} coins | hand: [{hand_str}] | alive: {p.is_active}")
        output.append("=" * 60)
        
        rendered = "\n".join(output)
        if mode == "human":
            print(rendered)
            return None
        return rendered
