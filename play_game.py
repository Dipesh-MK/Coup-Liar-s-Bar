"""
play_game.py
Launcher script for the Coup Animated Web Edition.
Serves the web client on port 8000, runs the game server on port 8765, 
spawns AI bots, and opens the game automatically in the browser.
"""

import os
import sys
import argparse
import asyncio
import http.server
import socketserver
import threading
import time
import pathlib
import webbrowser
from typing import List

# Ensure project root is in path
_ROOT = pathlib.Path(__file__).parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from play_vs_ai import launch_server_thread, run_ai_client, SERVER_PORT, SERVER_URI

def start_http_server():
    """Serves the web_ui static files on port 8000 in a daemon thread."""
    web_ui_dir = _ROOT / "web_ui"
    
    class DualStackServer(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            # Always serve files relative to the web_ui directory
            super().__init__(*args, directory=str(web_ui_dir), **kwargs)
            
        def log_message(self, format, *args):
            # Suppress HTTP traffic logs to keep terminal output clean
            pass

    def _run():
        socketserver.TCPServer.allow_reuse_address = True
        try:
            with socketserver.TCPServer(("", 8000), DualStackServer) as httpd:
                print("[HTTP Server] Serving Web Client at http://localhost:8000", flush=True)
                httpd.serve_forever()
        except Exception as e:
            print(f"[HTTP Server] Error: {e}", flush=True)

    t = threading.Thread(target=_run, daemon=True, name="CoupHTTPServer")
    t.start()
    return t

async def main():
    parser = argparse.ArgumentParser(description="Launch Coup Web UI and Server")
    parser.add_argument(
        "--ai-seats",
        type=int,
        nargs="+",
        default=[],
        help="Seat numbers (1-indexed) occupied by AI players (default: [])"
    )
    parser.add_argument(
        "--total-players",
        type=int,
        default=3,
        help="Total number of players in the game (default: 3)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="models/ppo_coup_final.zip",
        help="Path to the trained MaskablePPO model checkpoint"
    )
    args = parser.parse_args()

    # Sanity checks
    ai_seats = args.ai-seats if hasattr(args, "ai-seats") else args.ai_seats
    total_players = args.total_players
    model_path = args.model

    if not pathlib.Path(model_path).exists():
        print(f"ERROR: Model checkpoint not found at: {model_path}")
        sys.exit(1)

    print("\n" + "="*65)
    print("  LAUNCHING COUP WEB EDITION (ANIMATED)")
    print("="*65)
    print(f"  Total players  : {total_players}")
    print(f"  AI seats       : {['p' + str(s) for s in ai_seats]}")
    print(f"  Human seats    : {['p' + str(s) for s in range(1, total_players + 1) if s not in ai_seats]}")
    print(f"  Model loaded   : {model_path}")
    print("="*65 + "\n")

    # 1. Start WebSocket Game Server
    launch_server_thread()

    # 2. Start HTTP Web UI Server
    start_http_server()
    time.sleep(0.5)

    # 3. Auto-open web client in browser
    print("[Launcher] Auto-opening game client in default browser...", flush=True)
    webbrowser.open("http://localhost:8000")

    # 4. Spawn AI clients in the main event loop
    game_done = asyncio.Event()
    result_holder = {}
    ai_tasks = []

    # Lowest numbered AI will trigger game start as host once lobby is full
    host_seat = min(ai_seats) if ai_seats else None

    for seat in ai_seats:
        is_host = (seat == host_seat)
        task = asyncio.create_task(
            run_ai_client(
                seat_number=seat,
                model_path=model_path,
                num_players=total_players,
                is_host=is_host,
                game_done_event=game_done,
                result_holder=result_holder
            )
        )
        ai_tasks.append(task)

    print("[Launcher] Game is ready! Enter your name in the browser client and click Join to play.", flush=True)
    
    # Wait for the game to complete
    await game_done.wait()
    
    # Cool down period and cleanup
    await asyncio.sleep(2.0)
    
    if result_holder:
        print("\n" + "="*65)
        print(f"  GAME FINISHED! Winner is: {result_holder.get('winner_name')} ({result_holder.get('winner_id')})")
        print("="*65 + "\n")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Launcher] Shutting down...")
