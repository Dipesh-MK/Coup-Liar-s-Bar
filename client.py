"""WebSocket client for Coup variant multiplayer."""

import asyncio
import json
import os
import sys
from typing import Dict, Any, List

import websockets

# Client state
my_id = ""
my_name = ""
is_host = False
game_started = False
current_view = None
last_action_sent_key = (None, None)
prompt_active = False
start_prompt_active = False


def clear_screen() -> None:
    """Clears the terminal screen."""
    os.system("cls" if os.name == "nt" else "clear")


async def get_async_input(prompt: str) -> str:
    """Blocking console input wrapper for asyncio to prevent event loop blocking."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: input(prompt))


def print_lobby(players: List[Dict[str, str]], host_id: str) -> None:
    """Renders the current multiplayer lobby."""
    clear_screen()
    print("=" * 60)
    print("                 COUP MULTIPLAYER LOBBY")
    print("=" * 60)
    print("\nConnected Players:")
    for p in players:
        role = " (Host)" if p["id"] == host_id else ""
        me = " [YOU]" if p["id"] == my_id else ""
        print(f"  * {p['name']} ({p['id']}){role}{me}")
    print("\nWaiting for host to start...")
    print("=" * 60)


def print_game_state(view: Dict[str, Any]) -> None:
    """Displays the game board from the player's view."""
    clear_screen()
    print("=" * 60)
    print(f" TURN {view['turn_number']} | Stage: {view['stage']}")
    print("=" * 60)
    
    # Players
    print("\nPLAYERS:")
    players_list = view["players"]
    current_idx = view["current_player_idx"]
    active_player_id = players_list[current_idx]["player_id"]
    
    for idx, p in enumerate(players_list):
        curr_marker = " -> " if p["player_id"] == active_player_id else "    "
        status_marker = "" if p["is_active"] else " [ELIMINATED]"
        revealed_str = ", ".join(p["revealed_cards"]) if p["revealed_cards"] else "None"
        
        # Display hand cards (will be "Hidden" for other players)
        cards_str = ", ".join(p["cards"])
        me_marker = " [YOU]" if p["player_id"] == my_id else ""
        
        print(f"{curr_marker}{p['name']} ({p['player_id']}){me_marker}: {p['coins']} coins | Hand: [{cards_str}] | Revealed: {revealed_str}{status_marker}")

    # Deck and Discard
    print("\nPUBLIC DECK REMAINDER:")
    print(f"  {', '.join(view['deck']['public_deck']) or 'None'}")
    
    print("\nDISCARD PILE:")
    print(f"  {', '.join(view['deck']['discard_pile']) or 'None'}")
    
    print(f"\nHIDDEN COMMUNITY CARDS COUNT: {view['deck']['hidden_community_count']}")
    print("=" * 60)


def is_my_turn_to_act(view: Dict[str, Any]) -> bool:
    """Determines if the player needs to make a decision based on the view state."""
    stage = view["stage"]
    
    if stage == "Action Selection":
        current_idx = view["current_player_idx"]
        active_id = view["players"][current_idx]["player_id"]
        return active_id == my_id
        
    elif stage == "Challenge Window":
        return my_id in view["pending_challenge_players"]
        
    elif stage == "Block Window":
        return my_id in view["pending_block_players"]
        
    elif stage == "Block Challenge Window":
        return my_id in view["pending_challenge_players"]
        
    elif stage == "Reveal Card Challenge":
        return view["challenge_target_id"] == my_id
        
    elif stage == "Reveal Card Loss":
        return view["reveal_loss_player_id"] == my_id
        
    elif stage == "Exchange Selection":
        return view["active_action"]["player_id"] == my_id
        
    return False


async def prompt_user_action(view: Dict[str, Any]) -> Dict[str, Any]:
    """Prompts the user for action based on current stage and returns data payload."""
    stage = view["stage"]
    players = view["players"]
    me = next(p for p in players if p["player_id"] == my_id)

    if stage == "Action Selection":
        print("\nChoose an action:")
        options = []
        
        if me["coins"] >= 10:
            print("1. Coup (Mandatory: you have 10+ coins)")
            options = ["Coup"]
        else:
            print("1. Income (+1 coin, unblockable)")
            print("2. Foreign Aid (+2 coins, blockable by Duke)")
            print("3. Tax (+3 coins, Duke, challengeable)")
            options = ["Income", "Foreign Aid", "Tax"]
            
            idx = 4
            if me["coins"] >= 3:
                print(f"{idx}. Assassinate (-3 coins, Assassin, blockable by Contessa, challengeable)")
                options.append("Assassinate")
                idx += 1
                
            print(f"{idx}. Steal (Steal 2 coins, Captain, blockable by Captain/Ambassador, challengeable)")
            options.append("Steal")
            idx += 1
            
            print(f"{idx}. Exchange (Draw 2 from community, Ambassador, challengeable)")
            options.append("Exchange")
            idx += 1
            
            if me["coins"] >= 7:
                print(f"{idx}. Coup (-7 coins, unblockable)")
                options.append("Coup")

        while True:
            try:
                choice = int(await get_async_input(f"\nEnter choice (1-{len(options)}): "))
                if 1 <= choice <= len(options):
                    action = options[choice - 1]
                    break
            except ValueError:
                pass
            print("Invalid choice. Try again.")

        target_id = None
        if action in ["Coup", "Steal", "Assassinate"]:
            print("\nSelect a target player:")
            targets = [p for p in players if p["is_active"] and p["player_id"] != my_id]
            for idx, t in enumerate(targets):
                print(f"{idx + 1}. {t['name']} ({t['player_id']})")
            
            while True:
                try:
                    choice = int(await get_async_input(f"Enter target (1-{len(targets)}): "))
                    if 1 <= choice <= len(targets):
                        target_id = targets[choice - 1]["player_id"]
                        break
                except ValueError:
                    pass
                print("Invalid target choice. Try again.")

        return {"action": action, "target_id": target_id}

    elif stage in ["Challenge Window", "Block Challenge Window"]:
        # Print description of action/block
        action = view["active_action"]
        actor_name = next(p["name"] for p in players if p["player_id"] == action["player_id"])
        
        if stage == "Challenge Window":
            print(f"\n{actor_name} is performing: {action['action_type']}")
            print("Do you want to challenge?")
        else:
            block = view["active_block"]
            blocker_name = next(p["name"] for p in players if p["player_id"] == block["player_id"])
            print(f"\n{blocker_name} claims to block with {block['character']}")
            print("Do you want to challenge this block?")
            
        print("1. Pass")
        print("2. Challenge")
        
        while True:
            try:
                choice = int(await get_async_input("Enter choice (1-2): "))
                if choice == 1:
                    return {"action": "pass"}
                elif choice == 2:
                    return {"action": "challenge"}
            except ValueError:
                pass
            print("Invalid choice. Try again.")

    elif stage == "Block Window":
        action = view["active_action"]
        actor_name = next(p["name"] for p in players if p["player_id"] == action["player_id"])
        print(f"\n{actor_name} is performing: {action['action_type']}")
        
        print("Do you want to block this action?")
        print("1. Pass")
        
        blocks_allowed = []
        if action["action_type"] == "Foreign Aid":
            print("2. Block with Duke")
            blocks_allowed = ["Duke"]
        elif action["action_type"] == "Steal":
            print("2. Block with Captain")
            print("3. Block with Ambassador")
            blocks_allowed = ["Captain", "Ambassador"]
        elif action["action_type"] == "Assassinate":
            print("2. Block with Contessa")
            blocks_allowed = ["Contessa"]

        while True:
            try:
                choice = int(await get_async_input(f"Enter choice (1-{len(blocks_allowed) + 1}): "))
                if choice == 1:
                    return {"action": "pass"}
                elif 2 <= choice <= len(blocks_allowed) + 1:
                    return {"action": "block", "character": blocks_allowed[choice - 2]}
            except ValueError:
                pass
            print("Invalid choice. Try again.")

    elif stage == "Reveal Card Challenge":
        print("\nYou have been challenged!")
        if view["active_block"]:
            print(f"You claimed to block with: {view['active_block']['character']}")
        else:
            print(f"You claimed to perform: {view['active_action']['action_type']}")
        print("Select a card to reveal:")
        for idx, c in enumerate(me["cards"]):
            print(f"{idx + 1}. {c}")

        while True:
            try:
                choice = int(await get_async_input(f"Enter choice (1-{len(me['cards'])}): "))
                if 1 <= choice <= len(me["cards"]):
                    return {"action": "reveal", "character": me["cards"][choice - 1]}
            except ValueError:
                pass
            print("Invalid choice. Try again.")

    elif stage == "Reveal Card Loss":
        print(f"\nYou must lose an influence! (Reason: {view['reveal_loss_reason']})")
        print("Select a card to discard permanently:")
        for idx, c in enumerate(me["cards"]):
            print(f"{idx + 1}. {c}")

        while True:
            try:
                choice = int(await get_async_input(f"Enter choice (1-{len(me['cards'])}): "))
                if 1 <= choice <= len(me["cards"]):
                    return {"action": "reveal", "character": me["cards"][choice - 1]}
            except ValueError:
                pass
            print("Invalid choice. Try again.")

    elif stage == "Exchange Selection":
        drawn = view["exchange_drawn_cards"]
        pool = me["cards"] + drawn
        print("\nAmbassador Exchange: Select which cards to keep.")
        print(f"Your original hand size is: {len(me['cards'])}")
        for idx, c in enumerate(pool):
            print(f"{idx + 1}. {c}")

        keep = []
        needed = len(me["cards"])
        available_indices = list(range(len(pool)))

        for i in range(needed):
            while True:
                try:
                    choice = int(await get_async_input(f"Select card {i+1} to keep: ")) - 1
                    if choice in available_indices:
                        keep.append(pool[choice])
                        available_indices.remove(choice)
                        break
                except ValueError:
                    pass
                print("Invalid card choice. Try again.")

        return {"action": "exchange", "keep": keep}

    return {}


async def check_and_prompt(websocket) -> None:
    """Checks if it's the player's turn and prompts for action if not already prompted/acted."""
    global last_action_sent_key, prompt_active, current_view
    if not current_view:
        return
    if is_my_turn_to_act(current_view):
        key = (current_view["stage"], current_view["turn_number"])
        if key != last_action_sent_key and not prompt_active:
            prompt_active = True
            try:
                action_payload = await prompt_user_action(current_view)
                # Record that we have sent an action for this stage & turn
                last_action_sent_key = key
                await websocket.send(json.dumps({
                    "type": "action",
                    "data": action_payload
                }))
            except Exception as e:
                print(f"\nError sending action: {e}")
            finally:
                prompt_active = False
    else:
        print("\nWaiting for other players to act...")


async def main() -> None:
    global my_id, my_name, is_host, game_started, start_prompt_active, current_view, last_action_sent_key

    # Connection config
    host = "localhost"
    if len(sys.argv) > 1:
        host = sys.argv[1]
    uri = f"ws://{host}:8765"

    print(f"Connecting to server at {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Please enter your name:")
            name = await get_async_input("Name: ")
            await websocket.send(json.dumps({"type": "join", "name": name}))

            async for message in websocket:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "welcome":
                    my_id = data["player_id"]
                    my_name = data["name"]
                    is_host = data["is_host"]
                    print(f"Welcome {my_name}! Your ID is {my_id}.")

                elif msg_type == "lobby":
                    players = data["players"]
                    host_id = data["host_id"]
                    is_host = (my_id == host_id)
                    print_lobby(players, host_id)
                    
                    if is_host and not start_prompt_active:
                        start_prompt_active = True
                        print("You are the host. Type 'start' to begin the game.")
                        async def check_start():
                            global start_prompt_active
                            try:
                                cmd = await get_async_input("")
                                if cmd.strip().lower() == "start":
                                    await websocket.send(json.dumps({"type": "start"}))
                                else:
                                    start_prompt_active = False
                            except Exception:
                                start_prompt_active = False
                        
                        asyncio.create_task(check_start())

                elif msg_type == "message":
                    print(f"\nLOG: {data['text']}")

                elif msg_type == "error":
                    print(f"\n[ERROR] {data['message']}")
                    # Reset last_action_sent_key to allow repeating action input on same state
                    last_action_sent_key = (None, None)
                    await check_and_prompt(websocket)

                elif msg_type == "state":
                    game_started = True
                    view = data["view"]
                    current_view = view
                    print_game_state(view)
                    await check_and_prompt(websocket)

                elif msg_type == "game_over":
                    print("\n" + "=" * 60)
                    print(f"GAME OVER! Winner: {data['winner_name']} ({data['winner_id']})")
                    print("=" * 60)
                    print("\nTurn Logs:")
                    for idx, log_msg in enumerate(data["history"]):
                        print(f"  {idx+1}. {log_msg}")
                    break

    except KeyboardInterrupt:
        print("\nExiting client.")
    except Exception as e:
        print(f"\nConnection error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
