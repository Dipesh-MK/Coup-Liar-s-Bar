"""Data structures for Coup actions, blocks, and challenges."""

from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any
from constants import ActionType, BlockType, Character


@dataclass
class Action:
    """Represents a primary turn action chosen by a player."""
    action_type: ActionType
    player_id: str
    target_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert action to dictionary."""
        return {
            "action_type": self.action_type.value,
            "player_id": self.player_id,
            "target_id": self.target_id,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Action":
        """Reconstruct action from dictionary."""
        return cls(
            action_type=ActionType(d["action_type"]),
            player_id=d["player_id"],
            target_id=d.get("target_id"),
        )


@dataclass
class Block:
    """Represents a block attempt in response to an action."""
    block_type: BlockType
    player_id: str
    character: Character

    def to_dict(self) -> Dict[str, Any]:
        """Convert block to dictionary."""
        return {
            "block_type": self.block_type.value,
            "player_id": self.player_id,
            "character": self.character.value,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Block":
        """Reconstruct block from dictionary."""
        return cls(
            block_type=BlockType(d["block_type"]),
            player_id=d["player_id"],
            character=Character(d["character"]),
        )
