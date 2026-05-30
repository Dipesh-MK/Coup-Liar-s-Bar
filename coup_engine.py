"""Core Coup rules engine and Game state manager."""

import random
from typing import List, Tuple, Dict, Any, Optional
from constants import (
    Character, ActionType, BlockType, GameStage,
    COUP_COST, ASSASSINATE_COST, MANDATORY_COUP_COINS,
    ACTION_ROLES, BLOCK_ROLES, ACTION_BLOCK_TYPES
)
from player import Player
from deck import Deck
from actions import Action, Block
from game_state import GameState


class Game:
    """Core Coup game rules engine managing turn lifecycle and state transitions."""

    def __init__(self, player_ids: List[str], player_names: List[str]) -> None:
        if len(player_ids) < 2 or len(player_ids) > 6:
            raise ValueError("Coup variant supports 2 to 6 players.")
        if len(player_ids) != len(player_names):
            raise ValueError("Must provide the same number of player IDs and names.")

        players = [Player(pid, name) for pid, name in zip(player_ids, player_names)]
        self.state = GameState(players)
        self.state.deck.setup(self.state.players)
        
        # Log start
        self.state.log("Game started!")
        for p in self.state.players:
            self.state.log(f"Player {p.name} joined with 2 coins.")
        
        self.state.current_player_idx = 0
        self.state.stage = GameStage.ACTION_SELECTION
        self.state.log(f"It is {self.state.current_player.name}'s turn.")

    def handle_input(self, player_id: str, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Receives input from a player and drives the game state machine forward.

        Returns:
            Tuple[bool, str]: (Success status, detailed status message)
        """
        # Validate that the game isn't already over
        if self.state.stage == GameStage.GAME_OVER:
            return False, "The game is already over."

        # Validate player existence and active status
        try:
            player = self.state.get_player(player_id)
        except ValueError:
            return False, f"Player '{player_id}' is not in the game."

        if not player.is_active and self.state.stage != GameStage.GAME_OVER:
            return False, f"Player {player.name} is eliminated and cannot perform actions."

        # Dispatch based on current game stage
        stage = self.state.stage

        if stage == GameStage.ACTION_SELECTION:
            return self._handle_action_selection(player, data)
        elif stage == GameStage.CHALLENGE_WINDOW:
            return self._handle_challenge_window(player, data)
        elif stage == GameStage.BLOCK_WINDOW:
            return self._handle_block_window(player, data)
        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
            return self._handle_block_challenge_window(player, data)
        elif stage == GameStage.REVEAL_CARD_CHALLENGE:
            return self._handle_reveal_card_challenge(player, data)
        elif stage == GameStage.REVEAL_CARD_LOSS:
            return self._handle_reveal_card_loss(player, data)
        elif stage == GameStage.EXCHANGE_SELECTION:
            return self._handle_exchange_selection(player, data)

        return False, "Invalid game stage."

    # --- Turn lifecycle helper methods ---

    def _handle_action_selection(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Processes the active player's choice of action."""
        if player.player_id != self.state.current_player.player_id:
            return False, "It is not your turn."

        action_str = data.get("action")
        if not action_str:
            return False, "Missing action type."

        try:
            action_type = ActionType(action_str)
        except ValueError:
            return False, f"Invalid action type '{action_str}'."

        # 10 coins rule: must coup
        if player.coins >= MANDATORY_COUP_COINS and action_type != ActionType.COUP:
            return False, f"You have {player.coins} coins. You must perform a Coup."

        # Target verification
        target_id = data.get("target_id")
        target: Optional[Player] = None
        if action_type in [ActionType.COUP, ActionType.STEAL, ActionType.ASSASSINATE]:
            if not target_id:
                return False, f"Action {action_type.value} requires a target player."
            try:
                target = self.state.get_player(target_id)
            except ValueError:
                return False, f"Target player '{target_id}' does not exist."
            if not target.is_active:
                return False, f"Target player {target.name} is eliminated."
            if target.player_id == player.player_id:
                return False, "You cannot target yourself."

        # Action-specific cost verification
        if action_type == ActionType.COUP:
            if player.coins < COUP_COST:
                return False, f"Coup costs {COUP_COST} coins. You only have {player.coins}."
            player.remove_coins(COUP_COST)
            self.state.log(f"{player.name} performed a Coup on {target.name}.")
        elif action_type == ActionType.ASSASSINATE:
            if player.coins < ASSASSINATE_COST:
                return False, f"Assassination costs {ASSASSINATE_COST} coins. You only have {player.coins}."
            player.remove_coins(ASSASSINATE_COST)
            self.state.log(f"{player.name} declared Assassination on {target.name}.")
        elif action_type == ActionType.STEAL:
            self.state.log(f"{player.name} declared Steal on {target.name}.")
        elif action_type == ActionType.TAX:
            self.state.log(f"{player.name} declared Tax (claiming Duke).")
        elif action_type == ActionType.EXCHANGE:
            self.state.log(f"{player.name} declared Exchange (claiming Ambassador).")
        elif action_type == ActionType.INCOME:
            self.state.log(f"{player.name} took Income.")
        elif action_type == ActionType.FOREIGN_AID:
            self.state.log(f"{player.name} declared Foreign Aid.")

        # Construct Action object
        self.state.active_action = Action(action_type, player.player_id, target_id)

        # Handle Immediate execution vs Challenge/Block windows
        if action_type == ActionType.INCOME:
            player.add_coins(1)
            self._advance_turn()
            return True, "Income completed."
        elif action_type == ActionType.COUP:
            self.state.stage = GameStage.REVEAL_CARD_LOSS
            self.state.reveal_loss_player_id = target.player_id
            self.state.reveal_loss_reason = "coup"
            return True, f"Coup initiated on {target.name}."
        elif action_type == ActionType.FOREIGN_AID:
            # Blockable by Duke, not challengeable
            self.state.stage = GameStage.BLOCK_WINDOW
            self.state.pending_block_players = [
                p.player_id for p in self.state.players if p.is_active and p.player_id != player.player_id
            ]
            return True, "Foreign Aid declared. Waiting for blocks."
        else:
            # Tax, Exchange, Steal, Assassinate are challengeable
            self.state.stage = GameStage.CHALLENGE_WINDOW
            self.state.pending_challenge_players = [
                p.player_id for p in self.state.players if p.is_active and p.player_id != player.player_id
            ]
            random.shuffle(self.state.pending_challenge_players)
            return True, f"{action_type.value} declared. Waiting for challenges."

    def _handle_challenge_window(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Resolves players passing or challenging the active action."""
        if player.player_id not in self.state.pending_challenge_players:
            return False, "You cannot challenge or pass at this moment."

        response = data.get("action")
        if response not in ["challenge", "pass"]:
            return False, "Invalid response. Must be 'challenge' or 'pass'."

        if response == "challenge":
            # Player challenges
            self.state.pending_challenge_players.clear()
            self.state.challenge_challenger_id = player.player_id
            self.state.challenge_target_id = self.state.active_action.player_id
            self.state.stage = GameStage.REVEAL_CARD_CHALLENGE
            self.state.log(f"{player.name} challenged {self.state.current_player.name}'s claim.")
            return True, "Challenge declared. Waiting for defender to reveal a card."
        else:
            # Player passes
            self.state.pending_challenge_players.remove(player.player_id)
            if not self.state.pending_challenge_players:
                # Everyone passed the challenge window
                action_type = self.state.active_action.action_type
                if action_type in ACTION_BLOCK_TYPES:
                    # Action is blockable (Steal, Assassinate)
                    self.state.stage = GameStage.BLOCK_WINDOW
                    target_id = self.state.active_action.target_id
                    self.state.pending_block_players = [target_id]
                    return True, "No challenges. Waiting for block decisions."
                else:
                    # Action is not blockable (Tax, Exchange). Apply effects now.
                    return self._apply_active_action()

            return True, "Pass recorded."

    def _handle_block_window(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Processes block or pass choices during the block window."""
        if player.player_id not in self.state.pending_block_players:
            return False, "You cannot block or pass at this moment."

        response = data.get("action")
        if response not in ["block", "pass"]:
            return False, "Invalid response. Must be 'block' or 'pass'."

        action_type = self.state.active_action.action_type

        if response == "block":
            claimed_char_str = data.get("character")
            if not claimed_char_str:
                return False, "Block action requires specifying a claiming character."
            try:
                claimed_char = Character(claimed_char_str)
            except ValueError:
                return False, f"Invalid character '{claimed_char_str}'."

            # Verify character is allowed for this block type
            block_type = ACTION_BLOCK_TYPES[action_type]
            allowed_chars = BLOCK_ROLES[block_type]
            if claimed_char not in allowed_chars:
                return False, f"Cannot block {action_type.value} with {claimed_char.value}."

            self.state.pending_block_players.clear()
            self.state.active_block = Block(block_type, player.player_id, claimed_char)
            self.state.stage = GameStage.BLOCK_CHALLENGE_WINDOW
            self.state.pending_challenge_players = [
                p.player_id for p in self.state.players if p.is_active and p.player_id != player.player_id
            ]
            random.shuffle(self.state.pending_challenge_players)
            self.state.log(f"{player.name} blocked with {claimed_char.value}.")
            return True, f"Block declared with {claimed_char.value}. Waiting for challenges to the block."
        else:
            # Player passed block window
            self.state.pending_block_players.remove(player.player_id)
            if not self.state.pending_block_players:
                # Block window ended without block. Apply the original action.
                return self._apply_active_action()

            return True, "Pass recorded."

    def _handle_block_challenge_window(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Resolves players passing or challenging a block attempt."""
        if player.player_id not in self.state.pending_challenge_players:
            return False, "You cannot challenge or pass the block at this moment."

        response = data.get("action")
        if response not in ["challenge", "pass"]:
            return False, "Invalid response. Must be 'challenge' or 'pass'."

        if response == "challenge":
            self.state.pending_challenge_players.clear()
            self.state.challenge_challenger_id = player.player_id
            self.state.challenge_target_id = self.state.active_block.player_id
            self.state.stage = GameStage.REVEAL_CARD_CHALLENGE
            blocker_name = self.state.get_player(self.state.active_block.player_id).name
            self.state.log(f"{player.name} challenged {blocker_name}'s block.")
            return True, "Block challenged. Waiting for defender to reveal a card."
        else:
            self.state.pending_challenge_players.remove(player.player_id)
            if not self.state.pending_challenge_players:
                # Block goes through unchallenged! Action fails.
                self.state.log("Block succeeded. Action cancelled.")
                self._advance_turn()
                return True, "Block unchallenged. Turn advanced."

            return True, "Pass recorded."

    def _handle_reveal_card_challenge(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Resolves the challenged player revealing a card."""
        if player.player_id != self.state.challenge_target_id:
            return False, "You are not the player being challenged."

        action_str = data.get("action")
        if action_str != "reveal":
            return False, "Invalid response. Must be 'reveal'."

        char_str = data.get("character")
        if not char_str:
            return False, "Must specify which character card to reveal."

        try:
            reveal_char = Character(char_str)
        except ValueError:
            return False, f"Invalid character '{char_str}'."

        if reveal_char not in player.cards:
            return False, f"You do not have a {reveal_char.value} in your hand."

        # Determine the required role for the challenge
        required_role: Optional[Character] = None
        if self.state.active_block is not None:
            # Block challenge
            required_role = self.state.active_block.character
        else:
            # Action challenge
            required_role = ACTION_ROLES[self.state.active_action.action_type]

        challenger = self.state.get_player(self.state.challenge_challenger_id)

        if reveal_char == required_role:
            # --- DEFENDER WINS (THE CLAIM WAS TRUTHFUL) ---
            self.state.log(f"{player.name} showed {reveal_char.value} and proved their claim.")
            
            # Put card back in community pool and redraw privately
            player.cards.remove(reveal_char)
            self.state.deck.return_to_community([reveal_char])
            new_card = self.state.deck.draw_from_community(1)[0]
            player.cards.append(new_card)
            
            # Challenger loses an influence
            self.state.stage = GameStage.REVEAL_CARD_LOSS
            self.state.reveal_loss_player_id = challenger.player_id
            self.state.reveal_loss_reason = "failed_challenge"
            self.state.log(f"{challenger.name} lost the challenge and must discard a card.")
            return True, f"Proven! {challenger.name} must lose an influence."
        else:
            # --- DEFENDER LOSES (BLUFF REVEALED or wrong card shown) ---
            self.state.log(f"{player.name} failed to prove claim (discarded {reveal_char.value}).")
            
            # Refund coins if caught bluffing on action selection
            if self.state.active_block is None:
                if self.state.active_action.action_type == ActionType.ASSASSINATE:
                    player.add_coins(ASSASSINATE_COST)
                    self.state.log(f"{player.name} was refunded {ASSASSINATE_COST} coins from failed Assassination.")

            # Remove revealed card permanently (add to discard)
            player.lose_influence(reveal_char)
            self.state.deck.add_to_discard(reveal_char)

            # Check if defender is eliminated
            if not player.is_active:
                self.state.log(f"{player.name} is eliminated!")

            # Evaluate final outcome since the challenge succeeded
            if self.state.active_block is not None:
                # Block challenge succeeded: Block fails! The original action succeeds.
                self.state.log(f"Block failed. {self.state.current_player.name}'s action succeeds.")
                return self._apply_active_action()
            else:
                # Action challenge succeeded: Action fails! Turn ends.
                self.state.log(f"Action failed. Turn ends.")
                self._advance_turn()
                return True, "Action challenged successfully. Turn advanced."

    def _handle_reveal_card_loss(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Resolves a player choosing a card to discard/lose permanently."""
        if player.player_id != self.state.reveal_loss_player_id:
            return False, "You are not the player who needs to discard a card."

        action_str = data.get("action")
        if action_str != "reveal":
            return False, "Invalid response. Must be 'reveal'."

        char_str = data.get("character")
        if not char_str:
            return False, "Must specify which card to discard."

        try:
            discard_char = Character(char_str)
        except ValueError:
            return False, f"Invalid character '{char_str}'."

        if discard_char not in player.cards:
            return False, f"You do not have a {discard_char.value} in your hand."

        # Discard the card
        player.lose_influence(discard_char)
        self.state.deck.add_to_discard(discard_char)
        self.state.log(f"{player.name} revealed and lost {discard_char.value}.")

        if not player.is_active:
            self.state.log(f"{player.name} is eliminated!")

        # Check if the game is over
        if self._check_game_over():
            return True, "Game over."

        # Determine next stage based on why the card was lost
        reason = self.state.reveal_loss_reason

        if reason in ["coup", "assassination"]:
            # Attacking actions completed. Turn ends.
            self._advance_turn()
            return True, f"Discard complete. Turn advanced."

        elif reason == "failed_challenge":
            # The challenger of the action/block lost their card.
            if self.state.active_block is not None:
                # Block challenge failed: Block succeeds! Action fails.
                self.state.log("Block succeeded. Action cancelled.")
                self._advance_turn()
                return True, "Block challenge failed. Turn advanced."
            else:
                # Action challenge failed: Action proceeds!
                challenger_id = self.state.challenge_challenger_id
                target_id = self.state.active_action.target_id

                if target_id and challenger_id == target_id:
                    # CASE 2A — The challenger was the ACTION TARGET:
                    # Target lost their challenge opportunity. Skip block phase entirely.
                    # Execute the action immediately against the target.
                    return self._apply_active_action()
                else:
                    # CASE 2B — The challenger was a NON-TARGET bystander:
                    # Bystander lost their challenge, discards influence.
                    # Ensure the target (if any) is still alive before continuing.
                    if target_id:
                        target_player = self.state.get_player(target_id)
                        if not target_player.is_active:
                            self.state.log(f"Target {target_player.name} is eliminated. Action fizzled.")
                            self._advance_turn()
                            return True, "Target eliminated. Turn advanced."

                    # Block phase still proceeds normally for the target.
                    action_type = self.state.active_action.action_type
                    if action_type in ACTION_BLOCK_TYPES:
                        self.state.stage = GameStage.BLOCK_WINDOW
                        self.state.pending_block_players = [target_id]
                        return True, "Challenge failed. Waiting for block decisions."
                    else:
                        return self._apply_active_action()

        return False, "Unknown discard reason."

    def _handle_exchange_selection(self, player: Player, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Resolves Ambassador exchange card selection."""
        if player.player_id != self.state.active_action.player_id:
            return False, "You are not the player performing the Exchange."

        action_str = data.get("action")
        if action_str != "exchange":
            return False, "Invalid response. Must be 'exchange'."

        keep_list_str = data.get("keep")
        if keep_list_str is None:
            return False, "Must specify a list of cards to keep."

        try:
            keep_list = [Character(c) for c in keep_list_str]
        except ValueError:
            return False, "Invalid character in keep list."

        # The count of cards kept must match the original hand size
        original_hand_size = len(player.cards)
        if len(keep_list) != original_hand_size:
            return False, f"Must keep exactly {original_hand_size} cards. Received {len(keep_list)}."

        # Combine hand and drawn cards to check validation
        pool = player.cards + self.state.exchange_drawn_cards
        pool_copy = pool.copy()

        # Validate that all chosen cards are in the pool
        for char in keep_list:
            if char in pool_copy:
                pool_copy.remove(char)
            else:
                return False, f"Card {char.value} is not available in the exchange pool."

        # Apply the exchange
        player.cards = keep_list
        # Return the remaining cards in the pool to the hidden community
        self.state.deck.return_to_community(pool_copy)
        self.state.exchange_drawn_cards = []

        self.state.log(f"{player.name} completed the Exchange.")
        self._advance_turn()
        return True, "Exchange completed."

    # --- Engine helper execution logic ---

    def _apply_active_action(self) -> Tuple[bool, str]:
        """Applies the effects of the active action after all challenges/blocks pass."""
        action = self.state.active_action
        actor = self.state.get_player(action.player_id)
        action_type = action.action_type

        if action_type == ActionType.TAX:
            actor.add_coins(3)
            self.state.log(f"{actor.name} Tax succeeded (+3 coins).")
            self._advance_turn()
            return True, "Tax applied."

        elif action_type == ActionType.EXCHANGE:
            # Draw 2 cards from hidden community
            self.state.exchange_drawn_cards = self.state.deck.draw_from_community(2)
            self.state.stage = GameStage.EXCHANGE_SELECTION
            return True, "Exchange cards drawn. Waiting for selection."

        elif action_type == ActionType.STEAL:
            target = self.state.get_player(action.target_id)
            stolen = min(2, target.coins)
            target.remove_coins(stolen)
            actor.add_coins(stolen)
            self.state.log(f"{actor.name} stole {stolen} coins from {target.name}.")
            self._advance_turn()
            return True, "Steal applied."

        elif action_type == ActionType.ASSASSINATE:
            target = self.state.get_player(action.target_id)
            if target.is_active:
                self.state.stage = GameStage.REVEAL_CARD_LOSS
                self.state.reveal_loss_player_id = target.player_id
                self.state.reveal_loss_reason = "assassination"
                return True, f"Assassination successful. Waiting for {target.name} to discard."
            else:
                self.state.log(f"Target {target.name} is already eliminated. Assassination fizzled.")
                self._advance_turn()
                return True, "Target already eliminated."

        elif action_type == ActionType.FOREIGN_AID:
            actor.add_coins(2)
            self.state.log(f"{actor.name} received Foreign Aid (+2 coins).")
            self._advance_turn()
            return True, "Foreign Aid applied."

        return False, "Invalid action type for direct application."

    def _advance_turn(self) -> None:
        """Finds the next active player and resets turn state variables."""
        if self._check_game_over():
            return

        # Find next active player
        num_players = len(self.state.players)
        idx = (self.state.current_player_idx + 1) % num_players
        while not self.state.players[idx].is_active:
            idx = (idx + 1) % num_players

        self.state.current_player_idx = idx
        self.state.stage = GameStage.ACTION_SELECTION
        self.state.turn_number += 1
        
        # Reset state trackers
        self.state.active_action = None
        self.state.active_block = None
        self.state.pending_challenge_players = []
        self.state.pending_block_players = []
        self.state.challenge_challenger_id = None
        self.state.challenge_target_id = None
        self.state.reveal_loss_player_id = None
        self.state.reveal_loss_reason = None
        self.state.exchange_drawn_cards = []

        self.state.log(f"It is {self.state.current_player.name}'s turn.")

    def _check_game_over(self) -> bool:
        """Checks if only 1 active player remains, setting stage to GAME_OVER."""
        active_players = [p for p in self.state.players if p.is_active]
        if len(active_players) == 1:
            self.state.stage = GameStage.GAME_OVER
            winner = active_players[0]
            self.state.log(f"{winner.name} wins the game!")
            return True
        elif len(active_players) == 0:
            # Fallback (should not happen in proper game)
            self.state.stage = GameStage.GAME_OVER
            self.state.log("All players eliminated. Draw!")
            return True
        return False
