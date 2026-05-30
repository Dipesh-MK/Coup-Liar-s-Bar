"""Comprehensive pytest cases for Coup game engine flows, serialization, and edge cases."""

import pytest
from typing import List
from constants import Character, ActionType, GameStage
from coup_engine import Game


class TestExchangeAction:
    """Verifies Ambassador Exchange action with custom hidden community cards rule."""

    def test_exchange_card_conservation(self) -> None:
        """Exchange preserves the 3 hidden community cards pool size and player hand size."""
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p1 = game.state.get_player("p1")
        p1.cards = [Character.DUKE, Character.ASSASSIN]  # 2 active cards

        # Hidden community cards count starts at 3
        assert len(game.state.deck.hidden_community) == 3
        original_community = list(game.state.deck.hidden_community)

        # Alice exchanges, Bob passes challenge
        game.handle_input("p1", {"action": ActionType.EXCHANGE.value})
        game.handle_input("p2", {"action": "pass"})
        assert game.state.stage == GameStage.EXCHANGE_SELECTION
        assert len(game.state.exchange_drawn_cards) == 2

        # 2 cards drawn, so community has 1 left
        assert len(game.state.deck.hidden_community) == 1

        # Keep 2 cards (e.g. Duke and one of the drawn ones)
        drawn = game.state.exchange_drawn_cards
        keep_cards = [Character.DUKE.value, drawn[0].value]

        success, msg = game.handle_input("p1", {"action": "exchange", "keep": keep_cards})
        assert success

        # Hand size is still 2
        assert len(p1.cards) == 2
        assert p1.cards[0] == Character.DUKE
        assert p1.cards[1] == drawn[0]

        # Hidden community size returns to 3
        assert len(game.state.deck.hidden_community) == 3


class TestGameFlow:
    """Tests player turn sequencing, elimination, and win conditions."""

    def test_turn_skips_eliminated_player(self) -> None:
        """Turns skip over players who have been eliminated."""
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p2 = game.state.get_player("p2")
        
        # Eliminate Bob (p2)
        p2.cards = []
        p2.is_active = False

        # Alice takes Income
        game.handle_input("p1", {"action": ActionType.INCOME.value})

        # Turn should skip Bob and go straight to Charlie (p3)
        assert game.state.current_player.player_id == "p3"

    def test_win_condition(self) -> None:
        """Game ends with GAME_OVER stage when only one active player is left."""
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p2 = game.state.get_player("p2")
        
        # Bob starts with only 1 card to test quick elimination
        p2.cards = [Character.AMBASSADOR]

        # Alice coups Bob
        game.state.get_player("p1").coins = 7
        game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p2"})
        
        # Bob reveals his last card
        game.handle_input("p2", {"action": "reveal", "character": Character.AMBASSADOR.value})

        # Game is over and Alice is the winner
        assert not p2.is_active
        assert game.state.stage == GameStage.GAME_OVER


class TestSerialization:
    """Tests serialization and private/public view consistency."""

    def test_get_player_view_hides_private_info(self) -> None:
        """get_player_view() hides other players' hands and community cards but shows own hand."""
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")

        # Get view for Alice
        view_p1 = game.state.get_player_view("p1")

        # Alice sees her own cards
        assert view_p1["players"][0]["cards"] == [c.value for c in p1.cards]
        
        # Alice sees Bob's cards as "Hidden"
        assert view_p1["players"][1]["cards"] == ["Hidden", "Hidden"]
        assert view_p1["players"][1]["cards_count"] == 2

        # Hidden community cards are not exposed (only count is shown)
        assert "hidden_community" not in view_p1["deck"]
        assert view_p1["deck"]["hidden_community_count"] == 3

        # Public deck remainder is visible
        assert len(view_p1["deck"]["public_deck"]) == 8  # 15 - 4 (hands) - 3 (community) = 8
        for card in view_p1["deck"]["public_deck"]:
            assert isinstance(card, str)


class TestEdgeCases:
    """Verifies edge cases and illegal move rejection."""

    def test_illegal_target_self(self) -> None:
        """Players cannot target themselves for Coup, Steal, or Assassination."""
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p1 = game.state.get_player("p1")

        # Try to coup self
        p1.coins = 7
        success, msg = game.handle_input("p1", {"action": ActionType.COUP.value, "target_id": "p1"})
        assert not success
        assert "cannot target yourself" in msg

    def test_play_out_of_turn(self) -> None:
        """Non-active players cannot initiate actions."""
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        
        # Bob (p2) tries to take Income during Alice's turn
        success, msg = game.handle_input("p2", {"action": ActionType.INCOME.value})
        assert not success
        assert "not your turn" in msg

    @pytest.mark.parametrize("player_count", [2, 3, 4, 6])
    def test_multiplayer_setups(self, player_count: int) -> None:
        """Verifies deck distribution formulas hold across multiple player sizes."""
        player_ids = [f"p{i}" for i in range(player_count)]
        player_names = [f"Player{i}" for i in range(player_count)]
        
        game = Game(player_ids, player_names)
        assert len(game.state.players) == player_count
        assert len(game.state.deck.hidden_community) == 3
        
        # Sum of cards check: hands + community + public deck = 15
        total_dealt = sum(len(p.cards) for p in game.state.players)
        total_community = len(game.state.deck.hidden_community)
        total_public = len(game.state.deck.public_deck)
        assert total_dealt + total_community + total_public == 15


class TestChallengeResolutionFix:
    """Verifies rules correctness for action challenge resolutions and block windows."""

    def test_target_challenges_action_loses(self) -> None:
        """TEST 1: Target challenges action, loses -> action executes, no block phase."""
        # 3 players, P1 declares Steal on P2
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")
        
        # P1 has Captain, P2 has Contessa, Duke
        p1.cards = [Character.CAPTAIN, Character.DUKE]
        p2.cards = [Character.CONTESSA, Character.DUKE]
        p1.coins = 2
        p2.coins = 2

        # P1 declares Steal on P2
        game.handle_input("p1", {"action": ActionType.STEAL.value, "target_id": "p2"})
        # P2 challenges P1
        game.handle_input("p2", {"action": "challenge"})
        # P1 reveals Captain (proving claim)
        game.handle_input("p1", {"action": "reveal", "character": Character.CAPTAIN.value})
        # P2 discards Contessa for failed challenge
        game.handle_input("p2", {"action": "reveal", "character": Character.CONTESSA.value})

        # P2 loses 1 influence AND action executes immediately (Steal succeeds, P1 gets 2 coins)
        assert len(p2.cards) == 1
        assert p2.coins == 0
        assert p1.coins == 4
        # Skip block phase entirely -> turn advanced back to ACTION_SELECTION of P2 (if P2 active) or P3
        assert game.state.stage == GameStage.ACTION_SELECTION

    def test_bystander_challenges_action_loses(self) -> None:
        """TEST 2: Bystander challenges action, loses -> block phase still runs for target."""
        # 3 players, P1 declares Steal on P2
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p1 = game.state.get_player("p1")
        p3 = game.state.get_player("p3")
        
        p1.cards = [Character.CAPTAIN, Character.DUKE]
        p1.coins = 2
        p3.cards = [Character.CONTESSA, Character.DUKE]

        # P1 declares Steal on P2
        game.handle_input("p1", {"action": ActionType.STEAL.value, "target_id": "p2"})
        # Bystander P3 challenges P1
        game.handle_input("p3", {"action": "challenge"})
        # P1 reveals Captain (proving claim)
        game.handle_input("p1", {"action": "reveal", "character": Character.CAPTAIN.value})
        # P3 discards Contessa for failed challenge
        game.handle_input("p3", {"action": "reveal", "character": Character.CONTESSA.value})

        # Bystander lost challenge, but target Bob (p2) is now in block window
        assert len(p3.cards) == 1
        assert game.state.stage == GameStage.BLOCK_WINDOW
        assert game.state.pending_block_players == ["p2"]

    def test_target_challenges_loses_eliminated(self) -> None:
        """TEST 3: Target challenges, loses, gets eliminated -> action still executes."""
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")
        
        p1.cards = [Character.CAPTAIN, Character.DUKE]
        p2.cards = [Character.CONTESSA]  # 1 influence remaining
        p1.coins = 2
        p2.coins = 2

        # P1 declares Steal on P2
        game.handle_input("p1", {"action": ActionType.STEAL.value, "target_id": "p2"})
        # Target P2 challenges
        game.handle_input("p2", {"action": "challenge"})
        # P1 reveals Captain
        game.handle_input("p1", {"action": "reveal", "character": Character.CAPTAIN.value})
        # P2 reveals Contessa and gets eliminated
        game.handle_input("p2", {"action": "reveal", "character": Character.CONTESSA.value})

        # P2 should be eliminated
        assert not p2.is_active
        # The Steal action still executes (P1 gets P2's 2 coins)
        assert p2.coins == 0
        assert p1.coins == 4
        # Game moves to P3's turn
        assert game.state.stage == GameStage.ACTION_SELECTION
        assert game.state.current_player.player_id == "p3"

    def test_double_loss_works_correctly(self) -> None:
        """TEST 4: Double-loss still works correctly after the fix."""
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")
        
        # P1 declares Assassinate on P2. P2 has 2 cards.
        p1.cards = [Character.ASSASSIN, Character.DUKE]
        p2.cards = [Character.CAPTAIN, Character.DUKE]
        p1.coins = 3

        # P1 declares Assassinate on P2
        game.handle_input("p1", {"action": ActionType.ASSASSINATE.value, "target_id": "p2"})
        # Both Bob (p2) and Charlie (p3) pass challenge
        game.handle_input("p2", {"action": "pass"})
        game.handle_input("p3", {"action": "pass"})
        # P2 blocks with Contessa (bluffing)
        game.handle_input("p2", {"action": "block", "character": Character.CONTESSA.value})
        # P1 challenges the block
        game.handle_input("p1", {"action": "challenge"})
        # P2 cannot prove Contessa, discards Captain (losing 1 influence for failed block challenge)
        game.handle_input("p2", {"action": "reveal", "character": Character.CAPTAIN.value})

        # Blocker lost the challenge, so block failed, and Assassination succeeds
        # P2 must discard another card for Assassination
        assert game.state.stage == GameStage.REVEAL_CARD_LOSS
        assert game.state.reveal_loss_player_id == "p2"
        assert game.state.reveal_loss_reason == "assassination"

        # P2 discards Duke, gets eliminated (double loss)
        game.handle_input("p2", {"action": "reveal", "character": Character.DUKE.value})
        assert not p2.is_active

    def test_bystander_challenges_loses_target_blocks(self) -> None:
        """TEST 5: Non-target bystander challenges, loses, then TARGET successfully blocks."""
        game = Game(["p1", "p2", "p3"], ["Alice", "Bob", "Charlie"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")
        p3 = game.state.get_player("p3")

        p1.cards = [Character.CAPTAIN, Character.DUKE]
        p2.cards = [Character.CAPTAIN, Character.DUKE]
        p3.cards = [Character.CONTESSA, Character.DUKE]
        p1.coins = 2
        p2.coins = 2

        # P1 declares Steal on P2
        game.handle_input("p1", {"action": ActionType.STEAL.value, "target_id": "p2"})
        # P3 challenges (wrongly)
        game.handle_input("p3", {"action": "challenge"})
        # P1 proves Captain
        game.handle_input("p1", {"action": "reveal", "character": Character.CAPTAIN.value})
        # P3 loses Contessa
        game.handle_input("p3", {"action": "reveal", "character": Character.CONTESSA.value})

        # P3 lost influence. P2 blocks with Captain
        assert game.state.stage == GameStage.BLOCK_WINDOW
        game.handle_input("p2", {"action": "block", "character": Character.CAPTAIN.value})

        # Bystander P3 passes challenge on P2's block, P1 passes challenge
        game.handle_input("p3", {"action": "pass"})
        game.handle_input("p1", {"action": "pass"})

        # Block succeeds, Steal is cancelled, no coins stolen
        assert p1.coins == 2
        assert p2.coins == 2
        assert len(p3.cards) == 1
        assert game.state.stage == GameStage.ACTION_SELECTION

    def test_assassination_caught_bluffing_refunds_coins(self) -> None:
        """TEST 6: If a player bluffs Assassinate and is challenged, they receive their 3 coins back and lose an influence."""
        game = Game(["p1", "p2"], ["Alice", "Bob"])
        p1 = game.state.get_player("p1")
        p2 = game.state.get_player("p2")

        # P1 has Duke, Contessa (no Assassin), P1 has 3 coins
        p1.cards = [Character.DUKE, Character.CONTESSA]
        p2.cards = [Character.CAPTAIN, Character.DUKE]
        p1.coins = 3

        # P1 declares Assassinate on P2 -> P1 coins drop to 0
        game.handle_input("p1", {"action": ActionType.ASSASSINATE.value, "target_id": "p2"})
        assert p1.coins == 0

        # P2 challenges P1
        game.handle_input("p2", {"action": "challenge"})

        # P1 has to reveal/discard. Since P1 has no Assassin, P1 discards Duke (fails challenge)
        # Under the new rule, P1 should be refunded the 3 coins spent on Assassinate
        game.handle_input("p1", {"action": "reveal", "character": Character.DUKE.value})

        # P1 is refunded 3 coins and has 1 card left
        assert p1.coins == 3
        assert len(p1.cards) == 1
        assert p1.cards[0] == Character.CONTESSA
        # The action fails, turn advances
        assert game.state.stage == GameStage.ACTION_SELECTION
        assert game.state.current_player.player_id == "p2"

