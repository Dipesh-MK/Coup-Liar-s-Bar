"""WebSocket server for local network Coup variant multiplayer."""

import asyncio
import json
import logging
import random
import websockets
from typing import Dict, List, Any
from coup_engine import Game
from constants import GameStage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CoupServer")

# Game Server State
clients: Dict[str, Any] = {}  # player_id -> websocket
player_info: List[Dict[str, str]] = []  # List of {"id": player_id, "name": name}
game: Game = None
game_started: bool = False


async def broadcast(message: Dict[str, Any]) -> None:
    """Broadcasts a JSON message to all connected clients."""
    if not clients:
        return
    payload = json.dumps(message)
    await asyncio.gather(
        *(ws.send(payload) for ws in clients.values() if ws.state == websockets.State.OPEN)
    )


async def broadcast_state() -> None:
    """Broadcasts player-specific game state views to each connected client."""
    global game
    if not game:
        return
    for pid, ws in clients.items():
        if ws.state == websockets.State.OPEN:
            view = game.state.get_player_view(pid)
            await ws.send(json.dumps({"type": "state", "view": view}))


async def handle_client(websocket, *args, **kwargs) -> None:
    """Main client handler for incoming WebSocket connections."""
    global game, game_started, clients, player_info
    
    player_id = None
    player_name = None

    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "join":
                if game_started:
                    await websocket.send(json.dumps({"type": "error", "message": "Game already in progress."}))
                    await websocket.close()
                    return

                player_name = data.get("name", f"Player {len(clients) + 1}").strip()
                player_id = f"p{len(clients) + 1}"
                player_avatar = data.get("avatar", "🤖")
                
                clients[player_id] = websocket
                player_info.append({"id": player_id, "name": player_name, "avatar": player_avatar})
                
                logger.info(f"Player {player_name} joined as {player_id}")

                # First player joined is host
                is_host = (len(clients) == 1)
                await websocket.send(json.dumps({
                    "type": "welcome",
                    "player_id": player_id,
                    "name": player_name,
                    "is_host": is_host
                }))

                # Broadcast lobby update
                await broadcast({
                    "type": "lobby",
                    "players": player_info,
                    "host_id": player_info[0]["id"]
                })

            elif msg_type == "configure_lobby":
                # Spawn AI bots dynamically based on client config
                total_players = data.get("total_players", 3)
                ai_count = data.get("ai_count", 2)

                logger.info(f"Configuring lobby: {total_players} players total | {ai_count} AI bots requested")

                FUNNY_NAMES = [
                    "Duke of Hazard", "Slippery Sam", "Contessa Sparkles", 
                    "Bluff Master 9000", "Honest Abe (Not)", "Captain Coinstealer", 
                    "Assassin Creedless", "Ambassador of Absurd", "Card Sharky",
                    "Picasso of Lies", "Sneaky Pete", "Shady Lady"
                ]
                FUNNY_AVATARS = ["🧙‍♂️", "🧛‍♂️", "🦄", "👽", "🤡", "🤠", "🤖", "🦊", "🦁", "🐙", "👻", "💀"]

                random.shuffle(FUNNY_NAMES)
                random.shuffle(FUNNY_AVATARS)

                async def spawn_ai_bots():
                    from play_vs_ai import run_ai_client
                    import asyncio

                    game_done = asyncio.Event()
                    result_holder = {}

                    for i in range(ai_count):
                        seat_number = len(clients) + 1
                        ai_name = FUNNY_NAMES[i % len(FUNNY_NAMES)]
                        ai_avatar = FUNNY_AVATARS[i % len(FUNNY_AVATARS)]

                        # Spawn bot seat in backend asyncio loop
                        asyncio.create_task(
                            run_ai_client(
                                seat_number=seat_number,
                                model_path="models/ppo_coup_final.zip",
                                num_players=total_players,
                                is_host=False,
                                game_done_event=game_done,
                                result_holder=result_holder,
                                ai_name=ai_name,
                                avatar=ai_avatar
                            )
                        )
                        # Brief stagger between spawns
                        await asyncio.sleep(0.2)

                asyncio.create_task(spawn_ai_bots())

            elif msg_type == "start":
                # Only the host can start the game
                if not player_info or player_id != player_info[0]["id"]:
                    await websocket.send(json.dumps({"type": "error", "message": "Only the host can start the game."}))
                    continue
                
                if len(clients) < 2:
                    await websocket.send(json.dumps({"type": "error", "message": "Need at least 2 players to start."}))
                    continue

                logger.info("Starting game...")
                p_ids = [p["id"] for p in player_info]
                p_names = [p["name"] for p in player_info]
                
                game = Game(p_ids, p_names)
                game_started = True
                
                await broadcast({"type": "message", "text": "Game is starting!"})
                await broadcast_state()

            elif msg_type == "action":
                if not game_started or not game:
                    await websocket.send(json.dumps({"type": "error", "message": "Game has not started yet."}))
                    continue

                action_data = data.get("data", {})
                
                # Apply the input action to the game engine
                success, msg = game.handle_input(player_id, action_data)
                
                if not success:
                    await websocket.send(json.dumps({"type": "error", "message": msg}))
                else:
                    logger.info(f"[Action] {player_name} ({player_id}): {msg}")
                    await broadcast({"type": "message", "text": f"{player_name}: {msg}"})
                    await broadcast_state()

                    # Check if game is over
                    if game.state.stage == GameStage.GAME_OVER:
                        winner = [p for p in game.state.players if p.is_active][0]
                        await broadcast({
                            "type": "game_over",
                            "winner_id": winner.player_id,
                            "winner_name": winner.name,
                            "history": game.state.history
                        })
                        # Brief pause so all clients receive game_over before connections drop
                        await asyncio.sleep(0.5)
                        # Reset server state
                        game = None
                        game_started = False
                        player_info = []
                        clients = {}
                        logger.info("Game finished. Resetting server.")
                        break

    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Connection closed for {player_id or 'unknown client'}")
    finally:
        # Handle disconnects
        if player_id in clients:
            del clients[player_id]
            player_info = [p for p in player_info if p["id"] != player_id]
            
            if game_started:
                # If a player disconnects during a live game, end it
                await broadcast({
                    "type": "error",
                    "message": f"Player {player_name} disconnected. Game terminated."
                })
                game = None
                game_started = False
                player_info = []
                clients = {}
            else:
                # Update lobby
                await broadcast({
                    "type": "lobby",
                    "players": player_info,
                    "host_id": player_info[0]["id"] if player_info else None
                })


async def main() -> None:
    # Run server on port 8765, listening on all interfaces
    port = 8765
    async with websockets.serve(handle_client, "0.0.0.0", port):
        logger.info(f"Coup WebSocket Server started on ws://0.0.0.0:{port}")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server stopped.")
