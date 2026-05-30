"""Constants and Enums for the Coup Game Variant."""

from enum import Enum, auto


class Character(str, Enum):
    """Coup Character roles."""
    DUKE = "Duke"
    ASSASSIN = "Assassin"
    CAPTAIN = "Captain"
    AMBASSADOR = "Ambassador"
    CONTESSA = "Contessa"


class ActionType(str, Enum):
    """Actions players can select on their turn."""
    INCOME = "Income"
    FOREIGN_AID = "Foreign Aid"
    COUP = "Coup"
    TAX = "Tax"
    STEAL = "Steal"
    ASSASSINATE = "Assassinate"
    EXCHANGE = "Exchange"


class BlockType(str, Enum):
    """Blocking actions that counter an action."""
    BLOCK_FOREIGN_AID = "Block Foreign Aid"
    BLOCK_STEAL = "Block Steal"
    BLOCK_ASSASSINATE = "Block Assassinate"


class GameStage(str, Enum):
    """The current stage of the game state machine."""
    ACTION_SELECTION = "Action Selection"  # Waiting for current player to take an action
    CHALLENGE_WINDOW = "Challenge Window"  # Waiting for challenges to the active action
    BLOCK_WINDOW = "Block Window"          # Waiting for players to block
    BLOCK_CHALLENGE_WINDOW = "Block Challenge Window"  # Waiting for challenges to the block
    REVEAL_CARD_CHALLENGE = "Reveal Card Challenge"    # Waiting for player to prove they have the role
    REVEAL_CARD_LOSS = "Reveal Card Loss"              # Waiting for player to discard a card
    EXCHANGE_SELECTION = "Exchange Selection"          # Waiting for Ambassador player to select which cards to keep
    GAME_OVER = "Game Over"


# Game Rule Constants
COUP_COST = 7
ASSASSINATE_COST = 3
MANDATORY_COUP_COINS = 10
INITIAL_COINS = 2
DECK_QUANTITY_PER_CHARACTER = 3
HIDDEN_COMMUNITY_CARDS_COUNT = 3

# Action/Block Role Mappings
ACTION_ROLES = {
    ActionType.TAX: Character.DUKE,
    ActionType.STEAL: Character.CAPTAIN,
    ActionType.ASSASSINATE: Character.ASSASSIN,
    ActionType.EXCHANGE: Character.AMBASSADOR,
}

BLOCK_ROLES = {
    BlockType.BLOCK_FOREIGN_AID: [Character.DUKE],
    BlockType.BLOCK_STEAL: [Character.CAPTAIN, Character.AMBASSADOR],
    BlockType.BLOCK_ASSASSINATE: [Character.CONTESSA],
}

# Which action triggers which block type
ACTION_BLOCK_TYPES = {
    ActionType.FOREIGN_AID: BlockType.BLOCK_FOREIGN_AID,
    ActionType.STEAL: BlockType.BLOCK_STEAL,
    ActionType.ASSASSINATE: BlockType.BLOCK_ASSASSINATE,
}
