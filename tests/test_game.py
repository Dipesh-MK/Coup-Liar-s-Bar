"""Unit tests for general Coup game state, rules, win conditions, and edge cases."""

import pytest
from constants import Character, ActionType, BlockType, GameStage
from coup_engine import Game


def test_ten_coins_mandatory_coup() -> None:
    """A player with 10 or more coins must perform a Coup."""
    game = Game(["p1", "p2"], ["Alice", "Bob"])
    p1 = game.state.get_player("p1")
    p1.coins = 10
    
    # Try income -> should fail
    success, msg = game.handle_input("p1", {"action": ActionType.INCOME.value})
    assert not success
    assert "must perform a Coup" in msg
    
    # Try coup -> should succeed
    success, msg = game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p2"})
    assert success
    assert game.state.stage == GameStage.REVEAL_CARD_LOSS


def test_zero_coins_coup_attempt() -> None:
    """A player cannot coup if they have fewer than 7 coins."""
    game = Game(["p1", "p2"], ["Alice", "Bob"])
    p1 = game.state.get_player("p1")
    p1.coins = 5
    
    success, msg = game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p2"})
    assert not success
    assert "Coup costs 7 coins" in msg


def test_double_loss_assassination() -> None:
    """Tests double influence loss during assassination block challenge failure.

    Player A assassinates Player B. Player B blocks with Contessa (bluffing).
    Player A challenges. Player B fails the challenge, losing 1 influence.
    Because the block failed, the assassination goes through and Player B loses
    their second influence (eliminated).
    """
    game = Game(["p1", "p2"], ["Alice", "Bob"])
    p1 = game.state.get_player("p1")
    p2 = game.state.get_player("p2")
    
    # Setup hands and coins
    p1.cards = [Character.ASSASSIN, Character.DUKE]
    p1.coins = 3
    p2.cards = [Character.DUKE, Character.CAPTAIN]  # No Contessa
    p2.coins = 2
    
    # Alice assassinates Bob
    success, msg = game.handle_input("p1", {"action": ActionType.ASSASSINATE.value, "target_id": "p2"})
    assert success
    
    # Bob passes challenge on action
    success, msg = game.handle_input("p2", {"action": "pass"})
    
    # Bob blocks with Contessa (bluff)
    success, msg = game.handle_input("p2", {"action": "block", "character": Character.CONTESSA.value})
    assert success
    
    # Alice challenges Bob's block
    success, msg = game.handle_input("p1", {"action": "challenge"})
    assert success
    assert game.state.stage == GameStage.REVEAL_CARD_CHALLENGE
    assert game.state.challenge_target_id == "p2"
    
    # Bob reveals Captain (incorrect card, challenge succeeds)
    success, msg = game.handle_input("p2", {"action": "reveal", "character": Character.CAPTAIN.value})
    assert success
    
    # Challenge succeeded: Bob loses Captain.
    # Because the block failed, the Assassination now succeeds.
    # Since Bob is still alive (has Duke), Bob must now discard his remaining card.
    assert game.state.stage == GameStage.REVEAL_CARD_LOSS
    assert game.state.reveal_loss_player_id == "p2"
    assert game.state.reveal_loss_reason == "assassination"
    assert len(p2.cards) == 1
    assert p2.cards == [Character.DUKE]
    
    # Bob reveals Duke to satisfy assassination loss
    success, msg = game.handle_input("p2", {"action": "reveal", "character": Character.DUKE.value})
    assert success
    
    # Bob is now eliminated, game is over, Alice wins
    assert len(p2.cards) == 0
    assert not p2.is_active
    assert game.state.stage == GameStage.GAME_OVER
    assert "wins the game" in game.state.history[-1]


def test_win_conditions_and_turn_skipping() -> None:
    """Tests player elimination, turn sequence skipping dead players, and final win."""
    game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
    p1 = game.state.get_player("p1")
    p2 = game.state.get_player("p2")
    p3 = game.state.get_player("p3")
    
    # Kill Bob immediately
    p2.cards = []
    p2.is_active = False
    
    # Alice takes income
    success, msg = game.handle_input("p1", {"action": ActionType.INCOME.value})
    assert success
    
    # Turn should skip Bob (dead) and go directly to Charlie (p3)
    assert game.state.current_player.player_id == "p3"
    
    # Charlie takes income
    success, msg = game.handle_input("p3", {"action": ActionType.INCOME.value})
    assert success
    
    # Turn goes back to Alice
    assert game.state.current_player.player_id == "p1"
    
    # Alice coups Charlie
    p1.coins = 7
    success, msg = game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p3"})
    assert success
    
    # Charlie discards card 1
    char_card = p3.cards[0]
    success, msg = game.handle_input("p3", {"action": "reveal", "character": char_card.value})
    
    # Check Charlie is not dead yet (had 2 cards)
    assert p3.is_active
    
    # Turn advances to Charlie
    assert game.state.current_player.player_id == "p3"
    
    # Charlie coups Alice
    p3.coins = 7
    success, msg = game.handle_input("p3", {"action": ActionType.COUP.value, "target_id": "p1"})
    assert success
    
    # Alice discards card 1
    alice_card = p1.cards[0]
    success, msg = game.handle_input("p1", {"action": "reveal", "character": alice_card.value})
    
    # Turn advances to Alice
    assert game.state.current_player.player_id == "p1"
    
    # Alice coups Charlie again (force coins)
    p1.coins = 7
    success, msg = game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p3"})
    
    # Charlie discards his last card
    last_card = p3.cards[0]
    success, msg = game.handle_input("p3", {"action": "reveal", "character": last_card.value})
    assert success
    
    # Charlie eliminated, game over, Alice wins
    assert not p3.is_active
    assert game.state.stage == GameStage.GAME_OVER
    assert game.state.get_player("p1").is_active
