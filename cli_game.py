"""Hotseat Command Line Interface for testing and playing Coup variant."""

import os
import sys
from typing import Dict, Any, List
from constants import GameStage, Character, ActionType, BlockType
from coup_engine import Game


def clear_screen() -> None:
    """Clears the terminal screen."""
    os.system("cls" if os.name == "nt" else "clear")


def print_public_state(game: Game) -> None:
    """Prints the publicly known state of the game."""
    print("=" * 60)
    print(f" TURN {game.state.turn_number} | Stage: {game.state.stage.value}")
    print("=" * 60)
    
    # Players
    print("\nPLAYERS:")
    for idx, p in enumerate(game.state.players):
        curr_marker = " -> " if idx == game.state.current_player_idx else "    "
        status_marker = "" if p.is_active else " [ELIMINATED]"
        revealed_str = ", ".join(p.revealed_cards) if p.revealed_cards else "None"
        
        print(f"{curr_marker}{p.name} ({p.player_id}): {p.coins} coins | {len(p.cards)} active cards | Revealed: {revealed_str}{status_marker}")

    # Deck and Discard
    print("\nPUBLIC DECK REMAINDER (Face-up cards not in hands/community/discard):")
    print(f"  {', '.join([c for c in game.state.deck.public_deck]) or 'None'}")
    
    print("\nDISCARD PILE:")
    print(f"  {', '.join([c for c in game.state.deck.discard_pile]) or 'None'}")
    
    print(f"\nHIDDEN COMMUNITY CARDS COUNT: {len(game.state.deck.hidden_community)}")
    print("=" * 60)


def prompt_player_private(game: Game, player_id: str) -> None:
    """Prompt the player to reveal their private hand."""
    player = game.state.get_player(player_id)
    print(f"\n[PRIVATE] Action required by player {player.name} ({player.player_id}).")
    input("Press Enter to reveal your hand and choices (make sure other players look away)...")
    clear_screen()
    print("=" * 60)
    print(f"PLAYER: {player.name} | YOUR PRIVATE HAND: {', '.join([c.value for c in player.cards])}")
    print("=" * 60)


def get_action_selection_input(game: Game, player_id: str) -> Dict[str, Any]:
    """Gets action selection from the active player."""
    player = game.state.get_player(player_id)
    
    print("\nChoose an action:")
    options = []
    
    # Check if 10 coin mandatory coup applies
    if player.coins >= 10:
        print("1. Coup (Mandatory: you have 10+ coins)")
        options = [ActionType.COUP]
    else:
        print("1. Income (+1 coin, unblockable)")
        print("2. Foreign Aid (+2 coins, blockable by Duke)")
        print("3. Tax (+3 coins, Duke, challengeable)")
        options = [ActionType.INCOME, ActionType.FOREIGN_AID, ActionType.TAX]
        
        idx = 4
        if player.coins >= 3:
            print(f"{idx}. Assassinate (-3 coins, Assassin, blockable by Contessa, challengeable)")
            options.append(ActionType.ASSASSINATE)
            idx += 1
            
        print(f"{idx}. Steal (Steal 2 coins, Captain, blockable by Captain/Ambassador, challengeable)")
        options.append(ActionType.STEAL)
        idx += 1
        
        print(f"{idx}. Exchange (Draw 2 from community, Ambassador, challengeable)")
        options.append(ActionType.EXCHANGE)
        idx += 1
        
        if player.coins >= 7:
            print(f"{idx}. Coup (-7 coins, unblockable)")
            options.append(ActionType.COUP)

    while True:
        try:
            choice = int(input(f"\nEnter choice (1-{len(options)}): "))
            if 1 <= choice <= len(options):
                action = options[choice - 1]
                break
        except ValueError:
            pass
        print("Invalid choice. Try again.")

    target_id = None
    if action in [ActionType.COUP, ActionType.STEAL, ActionType.ASSASSINATE]:
        print("\nSelect a target player:")
        targets = [p for p in game.state.players if p.is_active and p.player_id != player_id]
        for idx, t in enumerate(targets):
            print(f"{idx + 1}. {t.name} ({t.player_id})")
        
        while True:
            try:
                choice = int(input(f"Enter target (1-{len(targets)}): "))
                if 1 <= choice <= len(targets):
                    target_id = targets[choice - 1].player_id
                    break
            except ValueError:
                pass
            print("Invalid target choice. Try again.")

    return {"action": action.value, "target_id": target_id}


def get_challenge_window_input(game: Game, player_id: str) -> Dict[str, Any]:
    """Gets challenge/pass input from players."""
    action = game.state.active_action
    actor = game.state.get_player(action.player_id)
    print(f"\n{actor.name} is attempting action: {action.action_type.value}")
    if action.target_id:
        target = game.state.get_player(action.target_id)
        print(f"Targeting: {target.name}")
        
    print("\nDo you want to challenge this action?")
    print("1. Pass")
    print("2. Challenge (Accuse them of bluffing)")
    
    while True:
        try:
            choice = int(input("Enter choice (1-2): "))
            if choice == 1:
                return {"action": "pass"}
            elif choice == 2:
                return {"action": "challenge"}
        except ValueError:
            pass
        print("Invalid choice. Try again.")


def get_block_window_input(game: Game, player_id: str) -> Dict[str, Any]:
    """Gets block/pass input from players."""
    action = game.state.active_action
    actor = game.state.get_player(action.player_id)
    print(f"\n{actor.name} is performing action: {action.action_type.value}")
    
    print("\nDo you want to block this action?")
    print("1. Pass")
    
    blocks_allowed = []
    if action.action_type == ActionType.FOREIGN_AID:
        print("2. Block with Duke")
        blocks_allowed = [(BlockType.BLOCK_FOREIGN_AID, Character.DUKE)]
    elif action.action_type == ActionType.STEAL:
        print("2. Block with Captain")
        print("3. Block with Ambassador")
        blocks_allowed = [
            (BlockType.BLOCK_STEAL, Character.CAPTAIN),
            (BlockType.BLOCK_STEAL, Character.AMBASSADOR),
        ]
    elif action.action_type == ActionType.ASSASSINATE:
        print("2. Block with Contessa")
        blocks_allowed = [(BlockType.BLOCK_ASSASSINATE, Character.CONTESSA)]

    while True:
        try:
            choice = int(input(f"Enter choice (1-{len(blocks_allowed) + 1}): "))
            if choice == 1:
                return {"action": "pass"}
            elif 2 <= choice <= len(blocks_allowed) + 1:
                block_type, character = blocks_allowed[choice - 2]
                return {"action": "block", "character": character.value}
        except ValueError:
            pass
        print("Invalid choice. Try again.")


def get_block_challenge_window_input(game: Game, player_id: str) -> Dict[str, Any]:
    """Gets challenge/pass input for blocks."""
    block = game.state.active_block
    blocker = game.state.get_player(block.player_id)
    print(f"\n{blocker.name} claims to block with: {block.character.value}")

    print("\nDo you want to challenge this block?")
    print("1. Pass")
    print("2. Challenge (Accuse them of bluffing)")

    while True:
        try:
            choice = int(input("Enter choice (1-2): "))
            if choice == 1:
                return {"action": "pass"}
            elif choice == 2:
                return {"action": "challenge"}
        except ValueError:
            pass
        print("Invalid choice. Try again.")


def get_reveal_card_input(game: Game, player_id: str) -> Dict[str, Any]:
    """Gets which card a player reveals (for challenge or influence loss)."""
    player = game.state.get_player(player_id)
    
    # Custom message based on why they are revealing
    if game.state.stage == GameStage.REVEAL_CARD_CHALLENGE:
        print(f"\nYou have been challenged!")
        if game.state.active_block:
            print(f"You claimed to block with: {game.state.active_block.character.value}")
        else:
            print(f"You claimed to perform action using role: {game.state.active_action.action_type.value}")
        print("Select a card to reveal. If you show the correct card, you win the challenge.")
    else:
        print(f"\nYou must lose an influence! (Reason: {game.state.reveal_loss_reason})")
        print("Select an active card to reveal and lose permanently:")

    for idx, c in enumerate(player.cards):
        print(f"{idx + 1}. {c.value}")

    while True:
        try:
            choice = int(input(f"Enter choice (1-{len(player.cards)}): "))
            if 1 <= choice <= len(player.cards):
                return {"action": "reveal", "character": player.cards[choice - 1].value}
        except ValueError:
            pass
        print("Invalid choice. Try again.")


def get_exchange_selection_input(game: Game, player_id: str) -> Dict[str, Any]:
    """Gets which cards the Ambassador player wants to keep."""
    player = game.state.get_player(player_id)
    drawn = game.state.exchange_drawn_cards
    
    pool = player.cards + drawn
    print(f"\nAmbassador Exchange: Select which cards to keep.")
    print(f"Your original hand size is: {len(player.cards)}")
    print("Available cards in pool:")
    for idx, c in enumerate(pool):
        print(f"{idx + 1}. {c.value}")

    keep = []
    needed = len(player.cards)
    available_indices = list(range(len(pool)))

    for i in range(needed):
        while True:
            try:
                choice = int(input(f"Select card {i+1} to keep (indexes available: {[idx+1 for idx in available_indices]}): ")) - 1
                if choice in available_indices:
                    keep.append(pool[choice].value)
                    available_indices.remove(choice)
                    break
            except ValueError:
                pass
            print("Invalid card choice. Try again.")

    return {"action": "exchange", "keep": keep}


def run_cli_game() -> None:
    """Main CLI game loop."""
    clear_screen()
    print("=" * 60)
    print("              WELCOME TO COUP (VARIANT)")
    print("=" * 60)
    
    # Player count selection
    num_players = 0
    while True:
        try:
            num_players = int(input("Enter number of players (2-6): "))
            if 2 <= num_players <= 6:
                break
        except ValueError:
            pass
        print("Invalid input. Please enter a number between 2 and 6.")

    player_ids = []
    player_names = []
    for i in range(num_players):
        name = input(f"Enter name for Player {i+1}: ").strip()
        if not name:
            name = f"Player{i+1}"
        player_ids.append(f"p{i+1}")
        player_names.append(name)

    game = Game(player_ids, player_names)
    
    # Wait for enter before starting
    input("\nSetup complete! Press Enter to start the game...")

    # Main state loop
    while game.state.stage != GameStage.GAME_OVER:
        clear_screen()
        print_public_state(game)
        
        # Display game history logs
        print("\nRECAP LOGS:")
        # Show last 5 log messages
        for log_msg in game.state.history[-6:]:
            print(f"  * {log_msg}")
        print("-" * 60)

        # Decide whose input we need
        stage = game.state.stage
        
        if stage == GameStage.ACTION_SELECTION:
            player_id = game.state.current_player.player_id
            prompt_player_private(game, player_id)
            input_data = get_action_selection_input(game, player_id)
            
        elif stage == GameStage.CHALLENGE_WINDOW:
            # We take challenges sequentially from pending players
            player_id = game.state.pending_challenge_players[0]
            prompt_player_private(game, player_id)
            input_data = get_challenge_window_input(game, player_id)
            
        elif stage == GameStage.BLOCK_WINDOW:
            # We take block decisions from pending players
            player_id = game.state.pending_block_players[0]
            prompt_player_private(game, player_id)
            input_data = get_block_window_input(game, player_id)
            
        elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
            # We take block challenges from pending players
            player_id = game.state.pending_challenge_players[0]
            prompt_player_private(game, player_id)
            input_data = get_block_challenge_window_input(game, player_id)
            
        elif stage == GameStage.REVEAL_CARD_CHALLENGE:
            player_id = game.state.challenge_target_id
            prompt_player_private(game, player_id)
            input_data = get_reveal_card_input(game, player_id)
            
        elif stage == GameStage.REVEAL_CARD_LOSS:
            player_id = game.state.reveal_loss_player_id
            prompt_player_private(game, player_id)
            input_data = get_reveal_card_input(game, player_id)
            
        elif stage == GameStage.EXCHANGE_SELECTION:
            player_id = game.state.active_action.player_id
            prompt_player_private(game, player_id)
            input_data = get_exchange_selection_input(game, player_id)
            
        else:
            print("Fatal Error: Unknown Game Stage.")
            sys.exit(1)

        # Apply to engine
        success, msg = game.handle_input(player_id, input_data)
        if not success:
            print(f"\n[ERROR] {msg}")
            input("Press Enter to continue...")
        else:
            # Display result of action
            print(f"\n[SUCCESS] {msg}")
            input("Press Enter to continue...")

    # Game over screen
    clear_screen()
    print_public_state(game)
    print("\n" + "=" * 60)
    print("                    GAME OVER!")
    print("=" * 60)
    for log_msg in game.state.history[-5:]:
        print(f"  * {log_msg}")
    print("=" * 60)


if __name__ == "__main__":
    run_cli_game()
