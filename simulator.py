"""Simulator for running random and scripted games to stress-test the Coup rules engine."""

import random
from typing import List, Dict, Any, Tuple
from constants import GameStage, Character, ActionType, BlockType, ACTION_BLOCK_TYPES, BLOCK_ROLES
from coup_engine import Game


class GameSimulator:
    """Runs automated simulations of the Coup variant game."""

    def __init__(self, player_ids: List[str], player_names: List[str]) -> None:
        self.player_ids = player_ids
        self.player_names = player_names
        self.game = Game(player_ids, player_names)

    def get_valid_inputs(self, player_id: str) -> List[Dict[str, Any]]:
        """Determines all valid inputs/decisions a player can make in the current state."""
        stage = self.game.state.stage
        
        # If game is over, no inputs
        if stage == GameStage.GAME_OVER:
            return []

        # Verify player is active and is the one expected to respond
        player = self.game.state.get_player(player_id)
        if not player.is_active:
            return []

        inputs = []

        if stage == GameStage.ACTION_SELECTION:
            # Only the current active player can make a move
            if player_id != self.game.state.current_player.player_id:
                return []
            
            targets = [p.player_id for p in self.game.state.players if p.is_active and p.player_id != player_id]

            # 10 coins rule
            if player.coins >= 10:
                for t in targets:
                    inputs.append({"action": ActionType.COUP.value, "target_id": t})
                return inputs

            # General Actions
            inputs.append({"action": ActionType.INCOME.value})
            inputs.append({"action": ActionType.FOREIGN_AID.value})
            inputs.append({"action": ActionType.TAX.value})
            inputs.append({"action": ActionType.EXCHANGE.value})
            
            # Steal (requires target)
            for t in targets:
                inputs.append({"action": ActionType.STEAL.value, "target_id": t})
            
            # Assassinate (requires target & coins)
            if player.coins >= 3:
                for t in targets:
                    inputs.append({"action": ActionType.ASSASSINATE.value, "target_id": t})
            
            # Coup (requires target & coins)
            if player.coins >= 7:
                for t in targets:
                    inputs.append({"action": ActionType.COUP.value, "target_id": t})

        elif stage == GameStage.CHALLENGE_WINDOW:
            if player_id not in self.game.state.pending_challenge_players:
                return []
            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})

        elif stage == GameStage.BLOCK_WINDOW:
            if player_id not in self.game.state.pending_block_players:
                return []
            
            inputs.append({"action": "pass"})
            
            # Look up which character blocks are valid for the active action
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
            # Player can choose to reveal any card in their hand
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})

        elif stage == GameStage.REVEAL_CARD_LOSS:
            if player_id != self.game.state.reveal_loss_player_id:
                return []
            # Player must reveal and lose a card in hand
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})

        elif stage == GameStage.EXCHANGE_SELECTION:
            if player_id != self.game.state.active_action.player_id:
                return []
            
            # Ambassador card selection
            drawn = self.game.state.exchange_drawn_cards
            pool = player.cards + drawn
            original_size = len(player.cards)
            
            # Generate all unique combinations of cards of size original_size
            import itertools
            # Use indexes to handle duplicate cards correctly
            combos = list(itertools.combinations(range(len(pool)), original_size))
            seen = set()
            for combo in combos:
                combo_cards = tuple(sorted([pool[idx].value for idx in combo]))
                if combo_cards not in seen:
                    seen.add(combo_cards)
                    inputs.append({"action": "exchange", "keep": list(combo_cards)})

        return inputs

    def step_random(self) -> Tuple[str, Dict[str, Any], bool, str]:
        """Identifies who needs to act, makes a random valid choice, and applies it.

        Returns:
            Tuple[str, Dict[str, Any], bool, str]: (Acting Player ID, input data, success, output message)
        """
        # Determine who should act
        stage = self.game.state.stage
        if stage == GameStage.GAME_OVER:
            raise RuntimeError("Cannot step a completed game.")

        acting_player_id = ""
        if stage == GameStage.ACTION_SELECTION:
            acting_player_id = self.game.state.current_player.player_id
        elif stage == GameStage.CHALLENGE_WINDOW:
            acting_player_id = self.game.state.pending_challenge_players[0]
        elif stage == GameStage.BLOCK_WINDOW:
            acting_player_id = self.game.state.pending_block_players[0]
        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
            acting_player_id = self.game.state.pending_challenge_players[0]
        elif stage == GameStage.REVEAL_CARD_CHALLENGE:
            acting_player_id = self.game.state.challenge_target_id
        elif stage == GameStage.REVEAL_CARD_LOSS:
            acting_player_id = self.game.state.reveal_loss_player_id
        elif stage == GameStage.EXCHANGE_SELECTION:
            acting_player_id = self.game.state.active_action.player_id

        # Get all valid inputs
        valid_moves = self.get_valid_inputs(acting_player_id)
        if not valid_moves:
            raise RuntimeError(
                f"Deadlock! No valid moves found for player {acting_player_id} at stage {stage.value}."
            )

        # Pick one at random
        chosen_move = random.choice(valid_moves)

        # Apply it
        success, msg = self.game.handle_input(acting_player_id, chosen_move)
        if not success:
            raise RuntimeError(
                f"Failed to execute randomly selected move {chosen_move} "
                f"for player {acting_player_id} at stage {stage.value}. Error: {msg}"
            )

        return acting_player_id, chosen_move, success, msg

    def run_to_completion(self, max_steps: int = 1000) -> Tuple[bool, str]:
        """Runs the simulation until the game is completed."""
        steps = 0
        while self.game.state.stage != GameStage.GAME_OVER and steps < max_steps:
            self.step_random()
            steps += 1

        if self.game.state.stage == GameStage.GAME_OVER:
            # Find winner
            winner = [p for p in self.game.state.players if p.is_active][0]
            return True, f"Game completed in {steps} steps. Winner: {winner.name} ({winner.player_id})"
        else:
            return False, f"Game reached maximum steps ({max_steps}) without completing."


def simulate_many_games(num_games: int = 1000) -> Dict[str, Any]:
    """Runs a batch of simulations and aggregates results."""
    success_count = 0
    winner_stats = {}
    total_steps = 0
    
    for i in range(num_games):
        num_players = random.randint(2, 6)
        player_ids = [f"p{j}" for j in range(1, num_players + 1)]
        player_names = [f"Player {j}" for j in range(1, num_players + 1)]
        
        sim = GameSimulator(player_ids, player_names)
        try:
            completed, msg = sim.run_to_completion()
            if completed:
                success_count += 1
                # Extract winner from msg
                winner_part = msg.split("Winner: ")[1]
                winner_stats[winner_part] = winner_stats.get(winner_part, 0) + 1
                
                # Extract steps
                steps_part = int(msg.split("completed in ")[1].split(" steps")[0])
                total_steps += steps_part
        except Exception as e:
            print(f"Error on game {i+1}: {e}")
            raise e

    return {
        "games_run": num_games,
        "completed_successfully": success_count,
        "average_steps": total_steps / success_count if success_count > 0 else 0,
    }
