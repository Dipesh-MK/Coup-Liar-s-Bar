"""Comprehensive pytest cases for Coup actions, blocks, and challenges."""

import pytest
from typing import List
from constants import Character, ActionType, BlockType, GameStage
from coup_engine import Game


@pytest.fixture
def fresh_game() -> Game:
    """Fixture for a fresh 3-player game."""
    return Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])


class TestActions:
    """Tests basic action validation and application."""

    @pytest.mark.parametrize(
        "action,target,cost,expected_coins",
        [
            (ActionType.INCOME, None, 0, 3),
            (ActionType.TAX, None, 0, 5),  # Assuming Tax is unchallenged
        ]
    )
    def test_basic_actions_unchallenged(self, fresh_game: Game, action: ActionType, target: str, cost: int, expected_coins: int) -> None:
        """Verifies Income and Tax (when passed) correctly update coins."""
        p1 = fresh_game.state.get_player("p1")
        assert p1.coins == 2
        
        success, msg = fresh_game.handle_input("p1", {"action": action.value, "target_id": target})
        assert success
        
        # If the action requires a challenge pass
        if fresh_game.state.stage == GameStage.CHALLENGE_WINDOW:
            # Let Bob and Charlie pass
            fresh_game.handle_input("p2", {"action": "pass"})
            fresh_game.handle_input("p3", {"action": "pass"})
            
        assert p1.coins == expected_coins

    def test_foreign_aid_flow(self, fresh_game: Game) -> None:
        """Tests Foreign Aid transition and application (when passed)."""
        p1 = fresh_game.state.get_player("p1")
        success, msg = fresh_game.handle_input("p1", {"action": ActionType.FOREIGN_AID.value})
        assert success
        assert fresh_game.state.stage == GameStage.BLOCK_WINDOW
        
        # Other players pass block
        fresh_game.handle_input("p2", {"action": "pass"})
        fresh_game.handle_input("p3", {"action": "pass"})
        
        assert p1.coins == 4
        assert fresh_game.state.stage == GameStage.ACTION_SELECTION

    def test_coup_validation_and_resolution(self, fresh_game: Game) -> None:
        """Coup requires 7 coins, deducts them immediately, and causes target card loss."""
        p1 = fresh_game.state.get_player("p1")
        p2 = fresh_game.state.get_player("p2")
        
        # Test coup with insufficient coins
        p1.coins = 5
        success, msg = fresh_game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p2"})
        assert not success
        
        # Test coup with sufficient coins
        p1.coins = 7
        success, msg = fresh_game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p2"})
        assert success
        assert p1.coins == 0
        assert fresh_game.state.stage == GameStage.REVEAL_CARD_LOSS
        assert fresh_game.state.reveal_loss_player_id == "p2"
        
        # Target Bob reveals a card to lose
        card_to_lose = p2.cards[0]
        success, msg = fresh_game.handle_input("p2", {"action": "reveal", "character": card_to_lose.value})
        assert success
        assert len(p2.cards) == 1
        assert card_to_lose in p2.revealed_cards
        assert fresh_game.state.stage == GameStage.ACTION_SELECTION  # Advanced to Bob's turn


class TestChallenges:
    """Tests action and block challenges."""

    def test_action_challenge_success_bluff(self, fresh_game: Game) -> None:
        """If a player bluffs (no Duke) and gets challenged on Tax, they lose influence."""
        p1 = fresh_game.state.get_player("p1")
        p2 = fresh_game.state.get_player("p2")
        
        # Force hand with no Duke
        p1.cards = [Character.ASSASSIN, Character.CONTESSA]
        
        # Alice taxes, Bob challenges
        fresh_game.handle_input("p1", {"action": ActionType.TAX.value})
        success, msg = fresh_game.handle_input("p2", {"action": "challenge"})
        assert success
        assert fresh_game.state.stage == GameStage.REVEAL_CARD_CHALLENGE
        
        # Alice reveals Assassin (invalid for Duke)
        success, msg = fresh_game.handle_input("p1", {"action": "reveal", "character": Character.ASSASSIN.value})
        assert success
        
        # Alice loses Assassin, coins not added, turn advanced to Bob
        assert len(p1.cards) == 1
        assert p1.coins == 2
        assert Character.ASSASSIN in p1.revealed_cards
        assert fresh_game.state.current_player.player_id == "p2"

    def test_action_challenge_failure_honest(self, fresh_game: Game) -> None:
        """If challenged player is honest, challenger loses influence, and card is replaced."""
        p1 = fresh_game.state.get_player("p1")
        p2 = fresh_game.state.get_player("p2")
        
        # Force hand with Duke
        p1.cards = [Character.DUKE, Character.CONTESSA]
        
        # Alice taxes, Bob challenges
        fresh_game.handle_input("p1", {"action": ActionType.TAX.value})
        fresh_game.handle_input("p2", {"action": "challenge"})
        
        # Alice reveals Duke (proves claim)
        success, msg = fresh_game.handle_input("p1", {"action": "reveal", "character": Character.DUKE.value})
        assert success
        assert fresh_game.state.stage == GameStage.REVEAL_CARD_LOSS
        assert fresh_game.state.reveal_loss_player_id == "p2"
        
        # Bob discards a card
        bob_card = p2.cards[0]
        success, msg = fresh_game.handle_input("p2", {"action": "reveal", "character": bob_card.value})
        assert success
        
        # Bob lost influence, Alice got 3 coins from Tax, and turn advanced
        assert len(p2.cards) == 1
        assert p1.coins == 5
        assert len(p1.cards) == 2
        # Verify Alice's hand still has 2 cards but Duke was replaced/shuffled
        assert len(fresh_game.state.deck.hidden_community) == 3


class TestBlocks:
    """Tests blocking scenarios and block challenges."""

    def test_steal_block_by_captain(self, fresh_game: Game) -> None:
        """Steal can be blocked by Captain. Block is unchallenged."""
        p1 = fresh_game.state.get_player("p1")
        p2 = fresh_game.state.get_player("p2")
        p2.coins = 2
        
        # Alice steals from Bob, Bob passes challenge, Bob blocks with Captain
        fresh_game.handle_input("p1", {"action": ActionType.STEAL.value, "target_id": "p2"})
        fresh_game.handle_input("p2", {"action": "pass"})
        fresh_game.handle_input("p3", {"action": "pass"})
        
        success, msg = fresh_game.handle_input("p2", {"action": "block", "character": Character.CAPTAIN.value})
        assert success
        assert fresh_game.state.stage == GameStage.BLOCK_CHALLENGE_WINDOW
        
        # Alice passes challenge to block
        fresh_game.handle_input("p1", {"action": "pass"})
        fresh_game.handle_input("p3", {"action": "pass"})
        
        # Steal blocked, no coins transferred, turn advanced
        assert p1.coins == 2
        assert p2.coins == 2
        assert fresh_game.state.current_player.player_id == "p2"

    def test_assassinate_block_by_contessa_challenged_failed(self, fresh_game: Game) -> None:
        """Assassination blocked by Contessa. Block is challenged, blocker fails (bluffed)."""
        p1 = fresh_game.state.get_player("p1")
        p2 = fresh_game.state.get_player("p2")
        p1.coins = 3
        p2.cards = [Character.DUKE, Character.CAPTAIN]  # No Contessa
        
        # Alice assassinates Bob
        fresh_game.handle_input("p1", {"action": ActionType.ASSASSINATE.value, "target_id": "p2"})
        fresh_game.handle_input("p2", {"action": "pass"})
        fresh_game.handle_input("p3", {"action": "pass"})
        
        # Bob blocks with Contessa (bluff)
        fresh_game.handle_input("p2", {"action": "block", "character": Character.CONTESSA.value})
        
        # Alice challenges the block
        fresh_game.handle_input("p1", {"action": "challenge"})
        assert fresh_game.state.stage == GameStage.REVEAL_CARD_CHALLENGE
        assert fresh_game.state.challenge_target_id == "p2"
        
        # Bob reveals Duke (incorrect block card, challenge succeeds)
        fresh_game.handle_input("p2", {"action": "reveal", "character": Character.DUKE.value})
        
        # Bob loses Duke. The block failed, so assassination succeeds. Bob must lose second card.
        assert len(p2.cards) == 1
        assert fresh_game.state.stage == GameStage.REVEAL_CARD_LOSS
        assert fresh_game.state.reveal_loss_player_id == "p2"
        assert fresh_game.state.reveal_loss_reason == "assassination"
        
        # Bob discards Captain (second card), eliminating him
        fresh_game.handle_input("p2", {"action": "reveal", "character": Character.CAPTAIN.value})
        assert not p2.is_active
        assert fresh_game.state.stage == GameStage.ACTION_SELECTION
