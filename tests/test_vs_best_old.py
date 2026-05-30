"""
matchup_models.py
Matchup between the newly trained dynamic model (149-dim) and the old best model (102-dim).
Uses custom observation and action space mapping to allow them to play in the same 3-player game.
"""

import os
import sys
import pathlib
import random
import numpy as np
import torch

# Ensure project root is in path
_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import Character, ActionType, GameStage
from coup_engine import Game
from rl_training.env import CoupEngine, CoupEnv
from rl_training.observation import encode_observation, ActionHistory, STAGE_TO_IDX, CARD_TO_IDX, ACTION_TO_IDX
from rl_training.evaluate import RuleBasedAgent
from sb3_contrib import MaskablePPO

def get_old_action_index(act: dict) -> int:
    name = act.get("action")
    if name == "Income":
        return 0
    elif name == "Foreign Aid":
        return 1
    elif name == "Tax":
        return 2
    elif name == "Exchange":
        return 3
    elif name == "Steal":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 4 + t_idx
    elif name == "Assassinate":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 7 + t_idx
    elif name == "Coup":
        target = act.get("target_id")
        t_idx = int(target[1:]) - 1
        return 10 + t_idx
    elif name == "challenge":
        return 13
    elif name == "pass":
        return 14
    elif name == "block":
        char = act.get("character")
        chars = ["Duke", "Contessa", "Captain", "Ambassador"]
        return 15 + chars.index(char)
    elif name == "reveal":
        char = act.get("character")
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return 19 + chars.index(char)
    elif name == "exchange":
        keep = act.get("keep")
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        if len(keep) == 1:
            return 24 + chars.index(keep[0])
        else:
            sorted_keep = sorted(keep)
            combos = []
            for i in range(len(chars)):
                for j in range(i, len(chars)):
                    combos.append(sorted([chars[i], chars[j]]))
            return 29 + combos.index(sorted_keep)
    return -1

def get_old_action_from_index(idx_3: int) -> dict:
    if idx_3 == 0:
        return {"action": "Income"}
    elif idx_3 == 1:
        return {"action": "Foreign Aid"}
    elif idx_3 == 2:
        return {"action": "Tax"}
    elif idx_3 == 3:
        return {"action": "Exchange"}
    elif 4 <= idx_3 <= 6:
        return {"action": "Steal", "target_id": f"p{idx_3 - 3}"}
    elif 7 <= idx_3 <= 9:
        return {"action": "Assassinate", "target_id": f"p{idx_3 - 6}"}
    elif 10 <= idx_3 <= 12:
        return {"action": "Coup", "target_id": f"p{idx_3 - 9}"}
    elif idx_3 == 13:
        return {"action": "challenge"}
    elif idx_3 == 14:
        return {"action": "pass"}
    elif 15 <= idx_3 <= 18:
        chars = ["Duke", "Contessa", "Captain", "Ambassador"]
        return {"action": "block", "character": chars[idx_3 - 15]}
    elif 19 <= idx_3 <= 23:
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return {"action": "reveal", "character": chars[idx_3 - 19]}
    elif 24 <= idx_3 <= 28:
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        return {"action": "exchange", "keep": [chars[idx_3 - 24]]}
    elif 29 <= idx_3 <= 43:
        chars = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
        combos = []
        for i in range(len(chars)):
            for j in range(i, len(chars)):
                combos.append([chars[i], chars[j]])
        keep = combos[idx_3 - 29]
        return {"action": "exchange", "keep": keep}
    return None

# Old 102-dimension observation encoder
def encode_observation_old(
    state_dict: dict, player_id: str, action_history: ActionHistory, num_players: int = 3
) -> np.ndarray:
    obs_parts = []
    players = state_dict["players"]
    for p in players:
        obs_parts.append(p["coins"] / 12.0)
    for p in players:
        obs_parts.append(len(p["revealed_cards"]) / 2.0)
    for p in players:
        obs_parts.append(1.0 if p["is_active"] else 0.0)
    curr_player_idx = state_dict["current_player_idx"]
    curr_player_one_hot = np.zeros(num_players, dtype=np.float32)
    if 0 <= curr_player_idx < num_players:
        curr_player_one_hot[curr_player_idx] = 1.0
    obs_parts.extend(curr_player_one_hot.tolist())
    stage_str = state_dict["stage"]
    stage_one_hot = np.zeros(len(STAGE_TO_IDX), dtype=np.float32)
    if stage_str in STAGE_TO_IDX:
        stage_one_hot[STAGE_TO_IDX[stage_str]] = 1.0
    obs_parts.extend(stage_one_hot.tolist())
    agent_player = next(p for p in players if p["player_id"] == player_id)
    agent_cards = agent_player["cards"]
    hand_one_hot = np.zeros(10, dtype=np.float32)
    for i, card in enumerate(agent_cards[:2]):
        if card in CARD_TO_IDX:
            idx = i * 5 + CARD_TO_IDX[card]
            hand_one_hot[idx] = 1.0
    obs_parts.extend(hand_one_hot.tolist())
    history_records = action_history.to_list()
    for rec in history_records:
        actor_idx = rec["player_idx"]
        actor_one_hot = np.zeros(num_players, dtype=np.float32)
        if 0 <= actor_idx < num_players:
            actor_one_hot[actor_idx] = 1.0
        obs_parts.extend(actor_one_hot.tolist())
        act_type = rec["action_type"]
        act_one_hot = np.zeros(len(ACTION_TO_IDX), dtype=np.float32)
        if act_type in ACTION_TO_IDX:
            act_one_hot[ACTION_TO_IDX[act_type]] = 1.0
        obs_parts.extend(act_one_hot.tolist())
        obs_parts.append(1.0 if rec["challenged"] else 0.0)
        obs_parts.append(1.0 if rec["succeeded"] else 0.0)
    obs_vector = np.array(obs_parts, dtype=np.float32)
    assert len(obs_vector) == 102
    return obs_vector

def run_matchup(num_games: int = 300):
    model_new_path = _ROOT / "models" / "ppo_coup_final.zip"
    model_old_path = _ROOT / "models" / "ppo_coup_specialist_3p.zip"
    
    if not model_new_path.exists() or not model_old_path.exists():
        print("ERROR: Models not found.")
        return
        
    model_new = MaskablePPO.load(model_new_path)
    model_old = MaskablePPO.load(model_old_path)
    print("Loaded models successfully.")

    env_3 = CoupEnv(3)
    env_6 = CoupEnv(6)
    
    winners = {"new_model": 0, "old_model": 0, "rule_based": 0}
    
    for game_idx in range(num_games):
        rot = game_idx % 3
        roles = {}
        if rot == 0:
            roles = {"p1": "new_model", "p2": "old_model", "p3": "rule_based"}
        elif rot == 1:
            roles = {"p1": "rule_based", "p2": "new_model", "p3": "old_model"}
        else:
            roles = {"p1": "old_model", "p2": "rule_based", "p3": "new_model"}

        engine = CoupEngine(3)
        history = ActionHistory()
        rb_agent = RuleBasedAgent(env_3.action_key_to_index, env_3.action_index_to_action, "")
        
        state = engine.reset()
        done = False
        step_count = 0
        
        # Only print first game's steps for brevity
        verbose = (game_idx == 0)
        
        while not done:
            step_count += 1
            if step_count > 1000:
                print("\n=== INFINITE LOOP DETECTED ===")
                print(f"Game Index: {game_idx}")
                print(f"Current Stage: {engine.game.state.stage}")
                print(f"Current Player: {engine.game.state.current_player.player_id if engine.game.state.current_player else 'None'}")
                print(f"Acting Player: {engine.get_acting_player_id()}")
                print(f"Pending Challenges List: {engine.game.state.pending_challenge_players}")
                print(f"Pending Blocks List: {engine.game.state.pending_block_players}")
                print(f"Challenge target: {engine.game.state.challenge_target_id}, challenger: {engine.game.state.challenge_challenger_id}")
                print(f"Last 15 logs:")
                for log in engine.game.state.history[-15:]:
                    print(f"  {log}")
                raise RuntimeError("Game exceeded 1000 steps - infinite loop suspected!")
                
            acting_pid = engine.get_acting_player_id()
            if not acting_pid:
                break
                
            legal_actions = engine.get_legal_actions(acting_pid)
            if not legal_actions:
                if verbose:
                    print(f"[Step {step_count}] Player {acting_pid} has no legal actions. Sending pass.")
                success, msg = engine.step({"action": "pass"})
                if not success:
                    raise RuntimeError(f"Null action 'pass' failed: {msg}")
                continue
                
            role = roles[acting_pid]
            action_dict = None
            
            if role == "new_model":
                view = engine.game.state.get_player_view(acting_pid)
                obs = encode_observation(view, player_id=acting_pid, action_history=history, num_players=3)
                mask = np.zeros(env_6.action_space.n, dtype=bool)
                for act in legal_actions:
                    act_copy = dict(act)
                    key = env_3._action_to_key(act_copy)
                    idx_6 = env_6.action_key_to_index.get(key)
                    if idx_6 is not None:
                        mask[idx_6] = True
                act_idx_6, _ = model_new.predict(obs, action_masks=mask, deterministic=False)
                action_dict = env_6.action_index_to_action[int(act_idx_6)]
                
            elif role == "old_model":
                view = engine.game.state.get_player_view(acting_pid)
                obs = encode_observation_old(view, player_id=acting_pid, action_history=history, num_players=3)
                mask = np.zeros(44, dtype=bool)
                for act in legal_actions:
                    idx_old = get_old_action_index(act)
                    if 0 <= idx_old < 44:
                        mask[idx_old] = True
                act_idx_3, _ = model_old.predict(obs, action_masks=mask, deterministic=False)
                action_dict = get_old_action_from_index(int(act_idx_3))
                
            else:
                rb_agent.player_id = acting_pid
                view = engine.game.state.get_player_view(acting_pid)
                obs = encode_observation_old(view, player_id=acting_pid, action_history=history, num_players=3)
                mask = np.zeros(env_3.action_space.n, dtype=bool)
                for act in legal_actions:
                    key = env_3._action_to_key(act)
                    idx_3 = env_3.action_key_to_index.get(key)
                    if idx_3 is not None:
                        mask[idx_3] = True
                act_idx_3 = rb_agent.select_action(obs, mask, engine.state)
                action_dict = env_3.action_index_to_action[act_idx_3]

            if verbose:
                print(f"[Step {step_count}] Player {acting_pid} ({role}) attempting {action_dict}. Stage={engine.game.state.stage.value}")
                
            success, msg = engine.step(action_dict)
            if not success:
                raise RuntimeError(
                    f"Step failed for player {acting_pid} ({role}) at stage {engine.state.stage.value}.\n"
                    f"Action attempted: {action_dict}\n"
                    f"Legal actions were: {legal_actions}\n"
                    f"Error: {msg}"
                )
                
            history.push(
                player_idx=int(acting_pid[1:]) - 1,
                action_type=action_dict.get("action"),
                challenged=False,
                succeeded=True
            )
                
            if engine.state.stage == GameStage.GAME_OVER:
                done = True
                
        winner = engine.get_winner()
        if winner:
            winners[roles[winner]] += 1
            
        if (game_idx + 1) % 10 == 0 or game_idx == 0:
            print(f"Completed Game {game_idx + 1}/{num_games}... Current Wins: {winners}")
            sys.stdout.flush()
            
    print("\n" + "=" * 60)
    print(f"  HEAD-TO-HEAD MATCHUP RESULTS ({num_games} Games)")
    print("=" * 60)
    for role, wins in winners.items():
        print(f"  {role:15}: {wins:4} wins ({wins/num_games:5.1%})")
    print("=" * 60 + "\n")
    sys.stdout.flush()
    
    return winners

if __name__ == "__main__":
    run_matchup()
