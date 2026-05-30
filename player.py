"""Player class representing a player in the Coup variant game."""

from typing import List, Dict, Any
from constants import Character, INITIAL_COINS


class Player:
    """Represents a player's hand, coins, and live status."""

    def __init__(self, player_id: str, name: str) -> None:
        self.player_id: str = player_id
        self.name: str = name
        self.cards: List[Character] = []
        self.revealed_cards: List[Character] = []
        self.coins: int = INITIAL_COINS
        self.is_active: bool = True

    @property
    def live_influence_count(self) -> int:
        """Returns the number of active cards/influences the player has."""
        return len(self.cards)

    def lose_influence(self, character: Character) -> None:
        """Reveals a character card, removing it from active hand."""
        if character not in self.cards:
            raise ValueError(f"Player {self.name} does not have card '{character}' in their hand.")
        self.cards.remove(character)
        self.revealed_cards.append(character)
        if len(self.cards) == 0:
            self.is_active = False

    def add_coins(self, amount: int) -> None:
        """Add coins to the player."""
        self.coins += amount

    def remove_coins(self, amount: int) -> None:
        """Remove coins from the player, ensuring they don't go below 0."""
        self.coins = max(0, self.coins - amount)

    def to_dict(self) -> Dict[str, Any]:
        """Full serialization of the player state (including private hand)."""
        return {
            "player_id": self.player_id,
            "name": self.name,
            "cards": [c.value for c in self.cards],
            "revealed_cards": [c.value for c in self.revealed_cards],
            "coins": self.coins,
            "is_active": self.is_active,
        }

    def to_public_dict(self, for_player_id: str = None) -> Dict[str, Any]:
        """Public serialization of player state.

        Hides active cards unless requested by the player themselves.
        """
        show_cards = (for_player_id == self.player_id)
        return {
            "player_id": self.player_id,
            "name": self.name,
            "cards": [c.value for c in self.cards] if show_cards else ["Hidden"] * len(self.cards),
            "cards_count": len(self.cards),
            "revealed_cards": [c.value for c in self.revealed_cards],
            "coins": self.coins,
            "is_active": self.is_active,
        }

    def __repr__(self) -> str:
        return f"Player(id={self.player_id}, name={self.name}, cards={self.cards}, coins={self.coins})"
