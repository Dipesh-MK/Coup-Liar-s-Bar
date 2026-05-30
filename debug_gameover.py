"""Debug: trace game_over message delivery."""
import asyncio, json, sys, pathlib, threading, time
sys.path.insert(0, str(pathlib.Path(__file__).parent))

import server as _server_module
import websockets

_server_module.clients = {}
_server_module.player_info = []
_server_module.game = None
_server_module.game_started = False

received = {}

def run_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    async def _serve():
        async with websockets.serve(_server_module.handle_client, "0.0.0.0", 8766):
            await asyncio.Future()
    loop.run_until_complete(_serve())

t = threading.Thread(target=run_server, daemon=True)
t.start()
time.sleep(0.4)

async def client(name, seat):
    async with websockets.connect("ws://localhost:8766") as ws:
        await ws.send(json.dumps({"type": "join", "name": name}))
        async for raw in ws:
            msg = json.loads(raw)
            mtype = msg.get("type")
            print(f"[{name}] got: {mtype}", flush=True)
            if mtype == "lobby" and seat == 1 and len(msg["players"]) == 2:
                await asyncio.sleep(0.1)
                await ws.send(json.dumps({"type": "start"}))
            elif mtype == "state":
                view = msg["view"]
                stage = view.get("stage", "")
                players = view.get("players", [])
                curr_idx = view.get("current_player_idx", -1)
                my_id = f"p{seat}"
                is_my_turn = (stage == "Action Selection" and 0 <= curr_idx < len(players) and players[curr_idx]["player_id"] == my_id)
                if is_my_turn:
                    await ws.send(json.dumps({"type": "action", "data": {"action": "Income"}}))
            elif mtype == "game_over":
                print(f"[{name}] GAME OVER! winner={msg.get('winner_id')}", flush=True)
                received[name] = msg
                break

async def main():
    await asyncio.gather(client("A", 1), client("B", 2))

asyncio.run(main())
print("received:", received.keys())
