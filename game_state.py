"""GameState class representing the complete game state and public/private views."""

from typing import List, Dict, Any, Optional
from constants import GameStage, Character
from player import Player
from deck import Deck
from actions import Action, Block


class GameState:
    """Represents the complete serializable game state."""

    def __init__(self, players: List[Player]) -> None:
        self.players: List[Player] = players
        self.deck: Deck = Deck()
        self.current_player_idx: int = 0
        self.stage: GameStage = GameStage.ACTION_SELECTION
        self.turn_number: int = 1
        
        # State tracking for action/challenge/block resolution
        self.active_action: Optional[Action] = None
        self.active_block: Optional[Block] = None
        
        # Lists of players yet to respond for a window
        self.pending_challenge_players: List[str] = []
        self.pending_block_players: List[str] = []
        
        # Details of the current challenge in progress
        self.challenge_challenger_id: Optional[str] = None
        self.challenge_target_id: Optional[str] = None  # Who is being challenged (must reveal card)
        
        # Details of who must lose a card
        self.reveal_loss_player_id: Optional[str] = None
        self.reveal_loss_reason: Optional[str] = None  # "coup", "assassination", "failed_challenge", "failed_block"
        
        # Cards drawn during Ambassador Exchange (private to active player)
        self.exchange_drawn_cards: List[Character] = []
        
        # Game log/history
        self.history: List[str] = []

    def get_player(self, player_id: str) -> Player:
        """Helper to get a player by ID."""
        for p in self.players:
            if p.player_id == player_id:
                return p
        raise ValueError(f"Player ID '{player_id}' not found.")

    def log(self, message: str) -> None:
        """Adds a message to the game log/history."""
        self.history.append(message)

    @property
    def current_player(self) -> Player:
        """Returns the player whose turn it is."""
        return self.players[self.current_player_idx]

    def to_dict(self) -> Dict[str, Any]:
        """Fully serializes the state, including hidden information."""
        return {
            "players": [p.to_dict() for p in self.players],
            "deck": self.deck.to_dict(),
            "current_player_idx": self.current_player_idx,
            "stage": self.stage.value,
            "turn_number": self.turn_number,
            "active_action": self.active_action.to_dict() if self.active_action else None,
            "active_block": self.active_block.to_dict() if self.active_block else None,
            "pending_challenge_players": self.pending_challenge_players,
            "pending_block_players": self.pending_block_players,
            "challenge_challenger_id": self.challenge_challenger_id,
            "challenge_target_id": self.challenge_target_id,
            "reveal_loss_player_id": self.reveal_loss_player_id,
            "reveal_loss_reason": self.reveal_loss_reason,
            "exchange_drawn_cards": [c.value for c in self.exchange_drawn_cards],
            "history": self.history,
        }

    def get_player_view(self, for_player_id: str) -> Dict[str, Any]:
        """Provides a filtered state view from a specific player's perspective.

        Hides:
        - Other players' active hand cards.
        - Hidden community cards (only shows count).
        - exchange_drawn_cards (unless for_player_id is the active player in exchange stage).
        """
        # Determine if we should show exchange cards to this player
        show_exchange = (
            self.stage == GameStage.EXCHANGE_SELECTION and
            self.active_action is not None and
            self.active_action.player_id == for_player_id
        )

        return {
            "players": [p.to_public_dict(for_player_id) for p in self.players],
            "deck": self.deck.to_public_dict(),
            "current_player_idx": self.current_player_idx,
            "stage": self.stage.value,
            "turn_number": self.turn_number,
            "active_action": self.active_action.to_dict() if self.active_action else None,
            "active_block": self.active_block.to_dict() if self.active_block else None,
            "pending_challenge_players": self.pending_challenge_players,
            "pending_block_players": self.pending_block_players,
            "challenge_challenger_id": self.challenge_challenger_id,
            "challenge_target_id": self.challenge_target_id,
            "reveal_loss_player_id": self.reveal_loss_player_id,
            "reveal_loss_reason": self.reveal_loss_reason,
            "exchange_drawn_cards": (
                [c.value for c in self.exchange_drawn_cards] if show_exchange else []
            ),
            "history": self.history,
        }
