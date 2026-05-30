"""Property-based and stateful tests for the Coup variant game engine using Hypothesis."""

import random
from typing import List, Dict, Any
import pytest
from hypothesis import given, settings, HealthCheck, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, rule, initialize, precondition

from constants import Character, ActionType, BlockType, GameStage, ACTION_BLOCK_TYPES, BLOCK_ROLES
from coup_engine import Game

import os
settings.register_profile("intense", settings(max_examples=12000, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much]))
settings.register_profile("dev", settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much]))
profile = os.getenv("HYPOTHESIS_PROFILE", "dev")
settings.load_profile(profile)


class CoupGameMachine(RuleBasedStateMachine):
    """Hypothesis stateful testing machine for the Coup rules engine."""

    def __init__(self) -> None:
        super().__init__()
        self.game: Game = None
        self.player_count: int = 0

    @initialize(player_count=st.integers(min_value=2, max_value=6))
    def setup_game(self, player_count: int) -> None:
        """Initialize the game with 2 to 6 players."""
        self.player_count = player_count
        player_ids = [f"p{i}" for i in range(1, player_count + 1)]
        player_names = [f"Player {i}" for i in range(1, player_count + 1)]
        
        self.game = Game(player_ids, player_names)
        self._check_invariants()

    def get_valid_inputs_for_acting_player(self) -> List[Dict[str, Any]]:
        """Finds all legal inputs for the player expected to act in the current stage."""
        stage = self.game.state.stage
        if stage == GameStage.GAME_OVER:
            return []

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

        # Determine inputs
        player = self.game.state.get_player(acting_player_id)
        inputs = []

        if stage == GameStage.ACTION_SELECTION:
            targets = [p.player_id for p in self.game.state.players if p.is_active and p.player_id != acting_player_id]

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
            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})

        elif stage == GameStage.BLOCK_WINDOW:
            inputs.append({"action": "pass"})
            
            action_type = self.game.state.active_action.action_type
            block_type = ACTION_BLOCK_TYPES[action_type]
            allowed_chars = BLOCK_ROLES[block_type]
            
            for char in allowed_chars:
                inputs.append({"action": "block", "character": char.value})

        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})

        elif stage == GameStage.REVEAL_CARD_CHALLENGE:
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})

        elif stage == GameStage.REVEAL_CARD_LOSS:
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})

        elif stage == GameStage.EXCHANGE_SELECTION:
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

    @precondition(lambda self: self.game is not None and self.game.state.stage != GameStage.GAME_OVER)
    @rule(data=st.data())
    def play_turn_step(self, data: Any) -> None:
        """Executes a single valid step generated dynamically."""
        stage = self.game.state.stage
        
        # Identify who acts
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

        # Get valid moves
        valid_moves = self.get_valid_inputs_for_acting_player()
        assert len(valid_moves) > 0, f"No moves available for {acting_player_id} at stage {stage}"

        # Choose a move using Hypothesis strategy
        chosen_move = data.draw(st.sampled_from(valid_moves))
        
        # Execute it
        success, msg = self.game.handle_input(acting_player_id, chosen_move)
        assert success, f"Move failed: {chosen_move} for {acting_player_id} at stage {stage.value}. Reason: {msg}"
        
        # Verify invariants
        self._check_invariants()

    @precondition(lambda self: self.game is not None and self.game.state.stage == GameStage.GAME_OVER)
    @rule()
    def game_over_noop(self) -> None:
        """No-op rule to prevent Hypothesis error when the game is completed."""
        pass

    def _check_invariants(self) -> None:
        """Verifies state invariants that must hold true after every single action."""
        state = self.game.state
        
        # 1. Total Card Conservation (sum must be exactly 15)
        hands_active = sum(len(p.cards) for p in state.players)
        hands_revealed = sum(len(p.revealed_cards) for p in state.players)
        community_count = len(state.deck.hidden_community)
        public_deck_count = len(state.deck.public_deck)
        exchange_in_transit = len(state.exchange_drawn_cards)
        
        total_cards = hands_active + hands_revealed + community_count + public_deck_count + exchange_in_transit
        assert total_cards == 15, (
            f"Card count mismatch! Total: {total_cards}. "
            f"Active: {hands_active}, Revealed: {hands_revealed}, "
            f"Community: {community_count}, Public Deck: {public_deck_count}, "
            f"Exchange In Transit: {exchange_in_transit}"
        )

        # 2. Hidden Community size invariant
        # During exchange selection, 2 cards are drawn by player, so size is 1. Otherwise size must be 3.
        if state.stage == GameStage.EXCHANGE_SELECTION:
            assert len(state.deck.hidden_community) == 1
        else:
            assert len(state.deck.hidden_community) == 3

        # 3. Discard pile matches total revealed cards
        discard_pile_sorted = sorted([c.value for c in state.deck.discard_pile])
        revealed_cards_sorted = sorted([c.value for p in state.players for c in p.revealed_cards])
        assert discard_pile_sorted == revealed_cards_sorted, "Discard pile does not match player revealed cards."

        # 4. Player coins bounds
        for p in state.players:
            assert p.coins >= 0, f"Player {p.name} has negative coins: {p.coins}"

        # 5. Game Over / Win conditions
        active_players = [p for p in state.players if p.is_active]
        if state.stage == GameStage.GAME_OVER:
            assert len(active_players) == 1, f"Game ended but active players count is {len(active_players)}"
        else:
            assert len(active_players) >= 2, f"Game not ended but active players count is {len(active_players)}"

        # 6. Serialization consistency
        for p in state.players:
            view = state.get_player_view(p.player_id)
            assert len(view["players"]) == self.player_count
            assert view["deck"]["hidden_community_count"] == len(state.deck.hidden_community)


# Test runner for the state machine
TestCoupGame = CoupGameMachine.TestCase


class TestBasicActions:
    """Property tests validating primary actions and conservation rules."""

    @given(player_count=st.integers(min_value=2, max_value=6))
    def test_coins_conservation_bounds(self, player_count: int) -> None:
        """Tests that total coins in the game only increase via specific coin-adding actions."""
        player_ids = [f"p{i}" for i in range(1, player_count + 1)]
        player_names = [f"Player {i}" for i in range(1, player_count + 1)]
        
        game = Game(player_ids, player_names)
        initial_coins = sum(p.coins for p in game.state.players)
        assert initial_coins == 2 * player_count

        # Take Income
        game.handle_input("p1", {"action": ActionType.INCOME.value})
        new_coins = sum(p.coins for p in game.state.players)
        assert new_coins == initial_coins + 1


class TestChallengesAndBlocks:
    """Hypothesis tests verifying challenge and block chains."""

    @given(seed=st.integers())
    def test_honest_tax_flow(self, seed: int) -> None:
        """Verifies Duke challenge resolution properties."""
        random.seed(seed)
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")

        # Force honest Duke in Alice's hand
        p1.cards = [Character.DUKE, Character.ASSASSIN]

        # Tax
        game.handle_input("p1", {"action": ActionType.TAX.value})
        # Bob challenges
        game.handle_input("p2", {"action": "challenge"})
        
        # Alice reveals Duke
        game.handle_input("p1", {"action": "reveal", "character": Character.DUKE.value})
        
        # Bob must discard
        bob_card = p2.cards[0]
        game.handle_input("p2", {"action": "reveal", "character": bob_card.value})

        # Alice's hand size must still be 2, Bob's must be 1, Alice gets 3 coins
        assert len(p1.cards) == 2
        assert len(p2.cards) == 1
        assert p1.coins == 5


class TestExchangeAction:
    """Hypothesis tests verifying Ambassador exchange rules."""

    @given(seed=st.integers())
    def test_exchange_invariants(self, seed: int) -> None:
        """Exchange action cannot be blocked and must preserve hand size."""
        random.seed(seed)
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p1 = game.state.get_player("p1")
        original_hand_size = len(p1.cards)

        # Exchange
        game.handle_input("p1", {"action": ActionType.EXCHANGE.value})
        # Bob passes challenge
        game.handle_input("p2", {"action": "pass"})

        # Verify Exchange cannot be blocked -> stage must transition directly to EXCHANGE_SELECTION
        assert game.state.stage == GameStage.EXCHANGE_SELECTION
        assert len(game.state.exchange_drawn_cards) == 2

        # Complete exchange
        drawn = game.state.exchange_drawn_cards
        pool = p1.cards + drawn
        keep = [pool[0].value]
        if original_hand_size == 2:
            keep.append(pool[1].value)

        game.handle_input("p1", {"action": "exchange", "keep": keep})
        assert len(p1.cards) == original_hand_size
        assert len(game.state.deck.hidden_community) == 3


class TestInformationRules:
    """Hypothesis tests verifying public vs hidden information consistency."""

    @given(player_count=st.integers(min_value=2, max_value=6))
    def test_information_leakage_bounds(self, player_count: int) -> None:
        """Verifies get_player_view() does not leak hidden community cards or other hands."""
        player_ids = [f"p{i}" for i in range(1, player_count + 1)]
        player_names = [f"Player {i}" for i in range(1, player_count + 1)]
        game = Game(player_ids, player_names)

        # View for p1
        view = game.state.get_player_view("p1")

        # p1's own cards are known
        assert "Hidden" not in view["players"][0]["cards"]

        # Other players' cards are Hidden
        for other_player in view["players"][1:]:
            assert other_player["cards"] == ["Hidden"] * other_player["cards_count"]

        # Hidden community cards are not in the view
        assert "hidden_community" not in view["deck"]
        assert view["deck"]["hidden_community_count"] == 3


class TestEdgeCases:
    """Hypothesis tests verifying boundary conditions."""

    @given(seed=st.integers())
    def test_assassination_target_dies_before_resolution(self, seed: int) -> None:
        """If target of assassination is eliminated in challenge window, action fizzles gracefully."""
        random.seed(seed)
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")
        
        p1.coins = 3
        p2.cards = [Character.DUKE]  # 1 card left

        # Alice assassinates Bob
        game.handle_input("p1", {"action": ActionType.ASSASSINATE.value, "target_id": "p2"})
        
        # Charlie (p3) challenges Alice's Assassinate. Alice is honest (reveals Assassin)
        p1.cards = [Character.ASSASSIN, Character.CONTESSA]
        game.handle_input("p3", {"action": "challenge"})
        game.handle_input("p1", {"action": "reveal", "character": Character.ASSASSIN.value})
        
        # Charlie loses challenge and discards his card
        charlie_card = game.state.get_player("p3").cards[0]
        game.handle_input("p3", {"action": "reveal", "character": charlie_card.value})

        # Since Bob was target and is still alive, game goes to block window
        assert game.state.stage == GameStage.BLOCK_WINDOW


def run_random_games(n: int = 1000) -> None:
    """Helper function to run thousands of randomized games to ensure stability."""
    success_count = 0
    for i in range(n):
        player_count = random.randint(2, 6)
        player_ids = [f"p{j}" for j in range(1, player_count + 1)]
        player_names = [f"Player {j}" for j in range(1, player_count + 1)]
        
        game = Game(player_ids, player_names)
        steps = 0
        while game.state.stage != GameStage.GAME_OVER and steps < 1000:
            # Re-fetch valid moves based on state machine logic
            stage = game.state.stage
            acting_player_id = ""
            if stage == GameStage.ACTION_SELECTION:
                acting_player_id = game.state.current_player.player_id
            elif stage == GameStage.CHALLENGE_WINDOW:
                acting_player_id = game.state.pending_challenge_players[0]
            elif stage == GameStage.BLOCK_WINDOW:
                acting_player_id = game.state.pending_block_players[0]
            elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
                acting_player_id = game.state.pending_challenge_players[0]
            elif stage == GameStage.REVEAL_CARD_CHALLENGE:
                acting_player_id = game.state.challenge_target_id
            elif stage == GameStage.REVEAL_CARD_LOSS:
                acting_player_id = game.state.reveal_loss_player_id
            elif stage == GameStage.EXCHANGE_SELECTION:
                acting_player_id = game.state.active_action.player_id
            
            # Simple simulation logic helper
            from simulator import GameSimulator
            sim = GameSimulator(player_ids, player_names)
            sim.game = game
            valid_moves = sim.get_valid_inputs(acting_player_id)
            
            chosen_move = random.choice(valid_moves)
            success, msg = game.handle_input(acting_player_id, chosen_move)
            assert success, f"Error in step: {msg}"
            steps += 1
        
        if game.state.stage == GameStage.GAME_OVER:
            success_count += 1
            
    print(f"Successfully simulated {success_count}/{n} random games to completion.")


if __name__ == "__main__":
    run_random_games(100)
