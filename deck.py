"""Deck class handling card setup, hidden community cards, and public deck state."""

import random
from typing import List, Dict, Any
from constants import Character, DECK_QUANTITY_PER_CHARACTER, HIDDEN_COMMUNITY_CARDS_COUNT
from player import Player


class Deck:
    """Manages the 15-card deck, hidden community pool, and public remainder."""

    def __init__(self) -> None:
        self.hidden_community: List[Character] = []
        self.public_deck: List[Character] = []
        self.discard_pile: List[Character] = []

    def setup(self, players: List[Player]) -> None:
        """Initialize and distribute deck: 3 copies of each character (15 total).

        Deals 2 cards to each player.
        Puts exactly 3 cards in hidden_community.
        Puts all remaining cards in public_deck.
        """
        # Create full deck of 15 cards
        all_cards: List[Character] = []
        for char in Character:
            all_cards.extend([char] * DECK_QUANTITY_PER_CHARACTER)
        
        # Shuffle
        random.shuffle(all_cards)

        # Clear state
        self.hidden_community = []
        self.public_deck = []
        self.discard_pile = []

        # Deal 2 cards to each active player
        for player in players:
            player.cards = [all_cards.pop(), all_cards.pop()]
            player.revealed_cards = []
            player.is_active = True

        # Assign exactly 3 cards to hidden community
        for _ in range(HIDDEN_COMMUNITY_CARDS_COUNT):
            if all_cards:
                self.hidden_community.append(all_cards.pop())

        # All remaining cards go to the public deck
        self.public_deck = all_cards.copy()
        
        # Shuffle public deck for cleanliness (though it is public)
        random.shuffle(self.public_deck)

    def draw_from_community(self, count: int) -> List[Character]:
        """Draws count cards from the hidden community pool."""
        if len(self.hidden_community) < count:
            raise ValueError(
                f"Not enough cards in hidden community to draw {count}. "
                f"Current count: {len(self.hidden_community)}"
            )
        drawn = [self.hidden_community.pop() for _ in range(count)]
        return drawn

    def return_to_community(self, cards: List[Character]) -> None:
        """Returns cards to the hidden community pool and shuffles it."""
        self.hidden_community.extend(cards)
        random.shuffle(self.hidden_community)

    def add_to_discard(self, card: Character) -> None:
        """Adds a card to the public discard pile (revealed dead card)."""
        self.discard_pile.append(card)

    def to_dict(self) -> Dict[str, Any]:
        """Full representation including hidden community cards."""
        return {
            "hidden_community": [c.value for c in self.hidden_community],
            "public_deck": [c.value for c in self.public_deck],
            "discard_pile": [c.value for c in self.discard_pile],
        }

    def to_public_dict(self) -> Dict[str, Any]:
        """Public view of the deck. Hides individual cards in hidden_community."""
        return {
            "hidden_community_count": len(self.hidden_community),
            "public_deck": [c.value for c in self.public_deck],
            "discard_pile": [c.value for c in self.discard_pile],
        }
