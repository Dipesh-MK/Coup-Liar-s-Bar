"""
play_vs_ai.py — Launch a Coup game where any mix of seats can be human or AI.

Usage examples
--------------
  # 2 AIs vs 1 human (you join manually with client.py after launch)
  python play_vs_ai.py --ai-seats 1 2 --total-players 3

  # All 3 seats AI (watch autonomous game)
  python play_vs_ai.py --ai-seats 1 2 3 --total-players 3

  # 1 AI vs 5 humans (AI is seat 3)
  python play_vs_ai.py --ai-seats 3 --total-players 6

  # Custom model path
  python play_vs_ai.py --ai-seats 1 2 --model models/ppo_coup_25000.zip

The script:
  1. Starts the WebSocket server in a background thread.
  2. Spawns asyncio AI client tasks for each AI seat.
  3. Prints lobby join instructions for human seats.
  4. Waits for the game to finish, then prints the result.
"""

import argparse
import asyncio
import json
import logging
import pathlib
import sys
import threading
import time
from typing import Dict, Any, List, Set, Optional

import websockets

# Project root on path
_ROOT = pathlib.Path(__file__).parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import server as _server_module  # import to reset global state
from ai_player import AIPlayer

DEFAULT_MODEL = "models/ppo_coup_best.zip"
SERVER_HOST = "localhost"
SERVER_PORT = 8765
SERVER_URI = f"ws://{SERVER_HOST}:{SERVER_PORT}"

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("play_vs_ai")


# ---------------------------------------------------------------------------
# Server launcher (runs in a daemon thread)
# ---------------------------------------------------------------------------

def _reset_server_state() -> None:
    """Clears all global server state so the server can be reused between games."""
    _server_module.clients = {}
    _server_module.player_info = []
    _server_module.game = None
    _server_module.game_started = False


def launch_server_thread() -> threading.Thread:
    """Starts the WebSocket server in a daemon thread."""
    _reset_server_state()

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _serve():
            async with websockets.serve(_server_module.handle_client, "0.0.0.0", SERVER_PORT):
                print(f"[Server] Listening on ws://0.0.0.0:{SERVER_PORT}", flush=True)
                await asyncio.Future()  # run forever

        loop.run_until_complete(_serve())

    t = threading.Thread(target=_run, daemon=True, name="CoupServer")
    t.start()
    time.sleep(0.5)  # Let the server bind before clients connect
    return t


# ---------------------------------------------------------------------------
# AI WebSocket client coroutine
# ---------------------------------------------------------------------------

async def run_ai_client(
    seat_number: int,
    model_path: str,
    num_players: int,
    is_host: bool,
    game_done_event: asyncio.Event,
    result_holder: Dict[str, Any],
    ai_name: Optional[str] = None,
    avatar: Optional[str] = None,
) -> None:
    """
    Async coroutine that behaves like a human client.py but driven by AIPlayer.
    seat_number is 1-indexed (matches server's p1, p2, ...).

    Key correctness guarantee: we track a `_last_acted_state` fingerprint so
    that if the server re-broadcasts the same state (e.g. after another client's
    non-state-changing message), this client never sends a duplicate action.
    """
    if ai_name is None:
        ai_name = f"CoupBot-{seat_number}"
    player_id = None
    my_is_host = False
    _last_acted_fingerprint: Optional[str] = None

    ai = AIPlayer(
        model_path=model_path,
        player_id=f"p{seat_number}",
        num_players=num_players,
        name=ai_name,
    )

    def _state_fingerprint(view: Dict[str, Any]) -> str:
        """Unique string identifying 'whose turn it is in what stage'."""
        stage = view.get("stage", "")
        turn = view.get("turn_number", 0)
        reveal_target = view.get("challenge_target_id", "")
        reveal_loss = view.get("reveal_loss_player_id", "")
        exchange_pid = (view.get("active_action") or {}).get("player_id", "")
        curr_idx = view.get("current_player_idx", -1)
        return f"{stage}|{turn}|{curr_idx}|{reveal_target}|{reveal_loss}|{exchange_pid}"

    _received_game_over = False
    pending_task: Optional[asyncio.Task] = None

    try:
        async with websockets.connect(SERVER_URI) as ws:
            # Join the lobby
            join_payload = {"type": "join", "name": ai_name}
            if avatar:
                join_payload["avatar"] = avatar
            await ws.send(json.dumps(join_payload))

            async for raw in ws:
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "welcome":
                    player_id = msg["player_id"]
                    my_is_host = msg.get("is_host", False)
                    ai.player_id = player_id  # Align with server-assigned ID
                    print(f"[{ai_name}] Joined as {player_id} (host={my_is_host})", flush=True)

                elif msg_type == "lobby":
                    players_in_lobby = msg["players"]
                    n_joined = len(players_in_lobby)
                    print(f"[{ai_name}] Lobby: {n_joined}/{num_players} players", flush=True)

                    # Host triggers start once all seats are filled
                    if my_is_host and n_joined == num_players:
                        print(f"[{ai_name}] All seats filled. Starting game...", flush=True)
                        await asyncio.sleep(0.3)  # Brief pause so humans see the lobby
                        await ws.send(json.dumps({"type": "start"}))

                elif msg_type == "state":
                    view = msg["view"]
                    stage = view.get("stage", "")

                    if not _is_my_turn(view, player_id):
                        # Cancel any pending decision if it's no longer our turn
                        if pending_task and not pending_task.done():
                            pending_task.cancel()
                            pending_task = None
                    else:
                        fp = _state_fingerprint(view)
                        if fp != _last_acted_fingerprint:
                            _last_acted_fingerprint = fp
                            
                            # Cancel any previous task (safety check)
                            if pending_task and not pending_task.done():
                                pending_task.cancel()

                            action = ai.choose_action(view)

                            async def send_action_after_delay(action_to_send, current_stage):
                                try:
                                    if current_stage in ("Challenge Window", "Block Challenge Window", "Block Window"):
                                        import random
                                        # Random delay simulating human reaction time
                                        delay = random.uniform(2.0, 3.5)
                                        await asyncio.sleep(delay)
                                    await ws.send(json.dumps({"type": "action", "data": action_to_send}))
                                except asyncio.CancelledError:
                                    pass
                                except Exception as exc:
                                    print(f"[{ai_name}] Action send error: {exc}", flush=True)

                            _log_action(ai_name, stage, action)
                            pending_task = asyncio.create_task(send_action_after_delay(action, stage))

                elif msg_type == "game_over":
                    _received_game_over = True
                    # Only write result once — whichever client receives it first wins
                    if not result_holder:
                        result_holder["winner_id"] = msg.get("winner_id")
                        result_holder["winner_name"] = msg.get("winner_name")
                        result_holder["history"] = msg.get("history", [])
                    game_done_event.set()
                    break

                elif msg_type == "error":
                    # Log silently; errors are usually 'not your turn' from race conditions
                    logger.debug(f"[{ai_name}] Server error: {msg.get('message')}")

    except websockets.exceptions.ConnectionClosed:
        # Server closed connection — this is normal after game_over
        pass
    except Exception as exc:
        print(f"[{ai_name}] Unexpected error: {exc}", flush=True)
    finally:
        # Cancel any pending decision task
        if pending_task and not pending_task.done():
            pending_task.cancel()
        # Only signal done here if game_over was never received
        # (avoids prematurely firing before game_over populates result_holder)
        if not _received_game_over and not game_done_event.is_set():
            game_done_event.set()


def _is_my_turn(view: Dict[str, Any], player_id: str) -> bool:
    """Mirrors client.py's is_my_turn_to_act() for AI."""
    stage = view.get("stage", "")
    players = view.get("players", [])

    if stage == "Action Selection":
        idx = view.get("current_player_idx", -1)
        if 0 <= idx < len(players):
            return players[idx]["player_id"] == player_id
        return False
    elif stage in ("Challenge Window", "Block Challenge Window"):
        return player_id in view.get("pending_challenge_players", [])
    elif stage == "Block Window":
        return player_id in view.get("pending_block_players", [])
    elif stage == "Reveal Card Challenge":
        return view.get("challenge_target_id") == player_id
    elif stage == "Reveal Card Loss":
        return view.get("reveal_loss_player_id") == player_id
    elif stage == "Exchange Selection":
        active = view.get("active_action", {})
        return active.get("player_id") == player_id
    return False


def _log_action(ai_name: str, stage: str, action: Dict[str, Any]) -> None:
    act = action.get("action", "?")
    target = action.get("target_id", "")
    char = action.get("character", "")
    extra = f" -> {target}" if target else (f" as {char}" if char else "")
    print(f"  [{ai_name}] [{stage[:12]:12s}] {act}{extra}", flush=True)


# ---------------------------------------------------------------------------
# Human seat instructions
# ---------------------------------------------------------------------------

def print_human_instructions(human_seats: List[int], total_players: int) -> None:
    if not human_seats:
        return
    print("\n" + "=" * 65)
    print("  HUMAN PLAYERS: Please connect using client.py")
    print("=" * 65)
    print(f"  Run in a separate terminal:  python client.py")
    print(f"  Server address : ws://{SERVER_HOST}:{SERVER_PORT}")
    print(f"  Expected human seats: {['p' + str(s) for s in human_seats]}")
    print(f"  Total players  : {total_players}")
    print("=" * 65 + "\n")


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def run_game(
    ai_seats: List[int],
    total_players: int,
    model_path: str,
    timeout_seconds: int = 300,
) -> Dict[str, Any]:
    """
    Orchestrates a complete game:
      - AI clients for seats in ai_seats
      - Human clients fill remaining seats via client.py
    Returns the result dict: {winner_id, winner_name, history}.
    """
    human_seats = [s for s in range(1, total_players + 1) if s not in ai_seats]
    print_human_instructions(human_seats, total_players)

    game_done = asyncio.Event()
    result: Dict[str, Any] = {}

    # Seat 1 (lowest AI seat) becomes host
    if ai_seats:
        host_seat = min(ai_seats)
    else:
        host_seat = None  # human host

    tasks = []
    for seat in sorted(ai_seats):
        is_host_seat = (seat == host_seat) and not human_seats
        task = asyncio.create_task(
            run_ai_client(
                seat_number=seat,
                model_path=model_path,
                num_players=total_players,
                is_host=is_host_seat,
                game_done_event=game_done,
                result_holder=result,
            )
        )
        tasks.append(task)
        await asyncio.sleep(0.1)  # Stagger connections slightly

    print(f"Waiting for game to finish (timeout: {timeout_seconds}s)...", flush=True)
    try:
        await asyncio.wait_for(game_done.wait(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        print("[WARNING] Game timed out!", flush=True)
        result["timed_out"] = True

    # Cancel remaining tasks cleanly
    for t in tasks:
        if not t.done():
            t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    return result


def print_result(result: Dict[str, Any]) -> None:
    print("\n" + "=" * 65)
    if result.get("timed_out"):
        print("  GAME TIMED OUT")
    elif result.get("winner_id"):
        print(f"  GAME OVER!")
        print(f"  Winner: {result['winner_name']} ({result['winner_id']})")
    else:
        print("  Game ended with no winner recorded.")
    print("=" * 65)
    history = result.get("history", [])
    if history:
        print(f"\nGame history ({len(history)} log entries):")
        for i, entry in enumerate(history[-20:], 1):  # Show last 20
            print(f"  {i:2d}. {entry}")
        if len(history) > 20:
            print(f"  ... ({len(history) - 20} earlier entries truncated)")
    print()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Play Coup with a mix of human and AI players.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--ai-seats", type=int, nargs="+", default=[1, 2, 3],
        metavar="SEAT",
        help="Which seat numbers (1-indexed) should be AI. Default: all 3 seats.",
    )
    parser.add_argument(
        "--total-players", type=int, default=3,
        help="Total number of players (AI + human). Default: 3.",
    )
    parser.add_argument(
        "--model", type=str, default=DEFAULT_MODEL,
        help=f"Path to trained model .zip. Default: {DEFAULT_MODEL}",
    )
    parser.add_argument(
        "--timeout", type=int, default=300,
        help="Seconds before declaring a timeout. Default: 300.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # Validate
    for s in args.ai_seats:
        if not (1 <= s <= args.total_players):
            print(f"Error: seat {s} out of range for {args.total_players} players.")
            sys.exit(1)

    if args.total_players < 2 or args.total_players > 6:
        print("Error: total-players must be between 2 and 6.")
        sys.exit(1)

    print("\n" + "=" * 65)
    print("  COUP vs AI  --  Game Setup")
    print("=" * 65)
    print(f"  Total players : {args.total_players}")
    print(f"  AI seats      : {['p' + str(s) for s in sorted(args.ai_seats)]}")
    human = [s for s in range(1, args.total_players + 1) if s not in args.ai_seats]
    print(f"  Human seats   : {['p' + str(s) for s in human] or 'None (all AI)'}")
    print(f"  Model         : {args.model}")
    print("=" * 65 + "\n")

    # Start server
    launch_server_thread()

    # Run game
    result = asyncio.run(
        run_game(
            ai_seats=args.ai_seats,
            total_players=args.total_players,
            model_path=args.model,
            timeout_seconds=args.timeout,
        )
    )

    print_result(result)


if __name__ == "__main__":
    main()
