"""
test_vs_llm.py
Simulates a Coup game matchup where the trained RL Agent plays against an LLM-driven player.
Since we don't have internet access to call external APIs, we implement a robust 
MockLLM agent that generates text reasoning and JSON actions, simulates typical 
LLM hallucinations (malformed JSON, illegal moves), and runs inside a feedback loop 
that feeds errors back to the LLM until it chooses a valid action.
"""

import sys
import pathlib
import json
import random
import re
import numpy as np
import torch

_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import Character, ActionType, GameStage
from rl_training.env import CoupEngine, CoupEnv
from rl_training.observation import encode_observation, ActionHistory
from sb3_contrib import MaskablePPO

# Setup log file
LOG_PATH = pathlib.Path(__file__).parent / "llm_vs_agent.log"
print(f"Writing test logs to: {LOG_PATH}")

def log_to_file(msg: str):
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)

# Clear log
with open(LOG_PATH, "w", encoding="utf-8") as f:
    f.write("=== LLM vs RL Agent Matchup Simulation ===\n\n")

class MockLLMEngine:
    """Simulates an LLM playing Coup. Can be set to deliberately hallucinate on its first attempt."""
    
    def __init__(self, player_id: str, hallucinate_prob: float = 0.25):
        self.player_id = player_id
        self.hallucinate_prob = hallucinate_prob
        self.attempt_counts = {}

    def generate_response(self, state_text: str, legal_actions: list, error_msg: str = None) -> str:
        state_key = hash(state_text)
        attempt = self.attempt_counts.get(state_key, 0)
        self.attempt_counts[state_key] = attempt + 1

        if error_msg:
            valid_action = legal_actions[0] if legal_actions else {"action": "income"}
            reasoning = f"Apologies. I received an error: '{error_msg}'. I will correct my action."
            response = f"""Reasoning: {reasoning}
Action: {json.dumps(valid_action)}"""
            return response

        if attempt == 0 and random.random() < self.hallucinate_prob:
            hallucination_type = random.choice(["malformed_json", "illegal_action", "invalid_target"])
            if hallucination_type == "malformed_json":
                return """Reasoning: I want to take Income but I will output broken JSON.
Action: {"action": "income", """
            elif hallucination_type == "illegal_action":
                return """Reasoning: I want to dominate the game. I will Coup Player 1.
Action: {"action": "coup", "target_id": "p1"}"""
            else:
                return """Reasoning: I will assassinate player p99.
Action: {"action": "assassinate", "target_id": "p99"}"""

        has_duke = "Duke" in state_text
        has_captain = "Captain" in state_text
        has_contessa = "Contessa" in state_text
        has_assassin = "Assassin" in state_text

        chosen_action = None
        reasoning = ""
        
        coup_actions = [a for a in legal_actions if a.get("action") == "coup"]
        ass_actions = [a for a in legal_actions if a.get("action") == "assassinate"]
        tax_actions = [a for a in legal_actions if a.get("action") == "Tax"]
        steal_actions = [a for a in legal_actions if a.get("action") == "Steal"]
        block_actions = [a for a in legal_actions if a.get("action") == "block"]
        challenge_actions = [a for a in legal_actions if a.get("action") == "challenge"]
        pass_actions = [a for a in legal_actions if a.get("action") == "pass"]

        if coup_actions:
            chosen_action = random.choice(coup_actions)
            reasoning = f"I have 7+ coins. I will Coup target {chosen_action.get('target_id')} to eliminate their influence."
        elif ass_actions and (has_assassin or random.random() < 0.3):
            chosen_action = random.choice(ass_actions)
            role = "Assassin" if has_assassin else "bluffing Assassin"
            reasoning = f"I will assassinate target {chosen_action.get('target_id')} claiming {role}."
        elif tax_actions and (has_duke or random.random() < 0.4):
            chosen_action = tax_actions[0]
            role = "Duke" if has_duke else "bluffing Duke"
            reasoning = f"I will claim Tax using my {role} to get 3 coins."
        elif steal_actions and (has_captain or random.random() < 0.3):
            chosen_action = random.choice(steal_actions)
            role = "Captain" if has_captain else "bluffing Captain"
            reasoning = f"I will steal from target {chosen_action.get('target_id')} claiming {role}."
        elif block_actions:
            if has_contessa and any(b.get("character") == "Contessa" for b in block_actions):
                chosen_action = next(b for b in block_actions if b.get("character") == "Contessa")
                reasoning = "I am being assassinated. I will block as Contessa."
            elif has_captain and any(b.get("character") == "Captain" for b in block_actions):
                chosen_action = next(b for b in block_actions if b.get("character") == "Captain")
                reasoning = "I am being stolen from. I will block as Captain."
            else:
                if random.random() < 0.5:
                    chosen_action = random.choice(block_actions)
                    reasoning = f"I will bluff block as {chosen_action.get('character')}."
                elif pass_actions:
                    chosen_action = pass_actions[0]
                    reasoning = "I will pass and accept the action."
        elif challenge_actions:
            if random.random() < 0.2:
                chosen_action = challenge_actions[0]
                reasoning = "I suspect they are bluffing. Challenge!"
            elif pass_actions:
                chosen_action = pass_actions[0]
                reasoning = "I will pass the challenge window."
        
        if not chosen_action and legal_actions:
            chosen_action = random.choice(legal_actions)
            reasoning = f"Picking fallback action: {chosen_action.get('action')}"

        if not chosen_action:
            chosen_action = {"action": "income"}
            reasoning = "No legal actions found, taking Income."

        return f"""Reasoning: {reasoning}
Action: {json.dumps(chosen_action)}"""

def parse_llm_response(response: str) -> tuple:
    reasoning_match = re.search(r"Reasoning:\s*(.*)", response)
    action_match = re.search(r"Action:\s*(\{.*\})", response)
    
    reasoning = reasoning_match.group(1).strip() if reasoning_match else "None"
    
    if not action_match:
        return reasoning, None, "Malformed output: Action JSON not found."
    
    action_json = action_match.group(1).strip()
    try:
        action_dict = json.loads(action_json)
        return reasoning, action_dict, None
    except json.JSONDecodeError:
        return reasoning, None, "Malformed JSON syntax in action field."

def format_state_for_prompt(state: dict, player_id: str, legal_actions: list) -> str:
    me = next(p for p in state["players"] if p["player_id"] == player_id)
    other_players = [p for p in state["players"] if p["player_id"] != player_id]
    
    prompt = f"--- STATE VIEW FOR {player_id} ---\n"
    prompt += f"Stage: {state['stage']}\n"
    prompt += f"Turn: {state['turn_number']}\n"
    prompt += f"My Hand: {', '.join(me['cards'])}\n"
    prompt += f"My Coins: {me['coins']}\n"
    prompt += "Other Players:\n"
    for op in other_players:
        prompt += f"  - {op['player_id']}: {op['coins']} coins | {op['cards_count']} active cards | revealed: {', '.join(op['revealed_cards']) or 'none'}\n"
    
    active_action = state.get("active_action")
    if active_action:
        prompt += f"Active Action: {active_action.get('player_id')} declared {active_action.get('action_type')} targeting {active_action.get('target_id') or 'none'}\n"
        
    prompt += f"Legal Actions: {json.dumps(legal_actions)}\n"
    return prompt

def run_matchup():
    model_path = _ROOT / "models" / "ppo_coup_final.zip"
    if not model_path.exists():
        log_to_file("ERROR: RL Agent model not found.")
        return None
    model = MaskablePPO.load(model_path)
    log_to_file("Successfully loaded RL Agent from ppo_coup_final.zip")

    num_players = 3
    engine = CoupEngine(num_players)
    llm_agent = MockLLMEngine("p2", hallucinate_prob=0.3)
    
    history = ActionHistory()
    
    state = engine.reset()
    done = False
    
    log_to_file("\n" + "="*60)
    log_to_file("  MATCHUP START: RL Agent (p1) vs LLM Agent (p2) vs Rule-Based (p3)")
    log_to_file("="*60 + "\n")
    
    step_count = 0
    while not done:
        step_count += 1
        if step_count > 1000:
            log_to_file("ERROR: Game exceeded 1000 steps, possible infinite loop detected. Ending game.")
            break
        acting_pid = engine.get_acting_player_id()
        if not acting_pid:
            break
            
        legal_actions = engine.get_legal_actions(acting_pid)
        if not legal_actions:
            engine.step({"action": "pass"})
            continue
            
        action_dict = None
        
        if acting_pid == "p1":
            # --- RL AGENT TURN ---
            view = engine.game.state.get_player_view("p1")
            obs = encode_observation(view, player_id="p1", action_history=history, num_players=3)
            env_map = CoupEnv(3)
            mask = np.zeros(env_map.action_space.n, dtype=bool)
            
            for act in legal_actions:
                for idx, a_dict in env_map.action_index_to_action.items():
                    if a_dict.get("action") != act.get("action"):
                        continue
                    if a_dict.get("target_id") != act.get("target_id"):
                        continue
                    if a_dict.get("character") != act.get("character"):
                        continue
                    a_keep = a_dict.get("keep")
                    act_keep = act.get("keep")
                    if (a_keep is not None) or (act_keep is not None):
                        if a_keep is None or act_keep is None:
                            continue
                        if sorted(a_keep) != sorted(act_keep):
                            continue
                    mask[idx] = True
                    break
            
            action_idx, _ = model.predict(obs, action_masks=mask, deterministic=False)
            action_dict = env_map.action_index_to_action[int(action_idx)]
            log_to_file(f"[RL Agent p1] Decided: {action_dict}")

        elif acting_pid == "p2":
            # --- LLM AGENT TURN WITH CORRECTION LOOP ---
            view = engine.game.state.get_player_view("p2")
            prompt = format_state_for_prompt(view, "p2", legal_actions)
            
            error_msg = None
            loop_count = 0
            
            while True:
                loop_count += 1
                if loop_count > 10:
                    log_to_file("  [LLM Error] Exceeded max loop count. Picking fallback action.")
                    action_dict = legal_actions[0]
                    break
                
                log_to_file(f"--- Prompting LLM Agent p2 (Attempt {loop_count}) ---")
                response = llm_agent.generate_response(prompt, legal_actions, error_msg)
                log_to_file(f"  [LLM Output]\n{response}")
                
                reasoning, parsed_action, parse_error = parse_llm_response(response)
                
                if parse_error:
                    log_to_file(f"  [LLM Hallucinated] Parsing Error: {parse_error}")
                    error_msg = f"Parsing Error: {parse_error}. Please format response as: Reasoning: <text> \\n Action: <JSON>"
                    continue
                
                is_legal = False
                for la in legal_actions:
                    if la.get("action") == parsed_action.get("action"):
                        if la.get("target_id") == parsed_action.get("target_id"):
                            if la.get("character") == parsed_action.get("character"):
                                is_legal = True
                                action_dict = la
                                break
                
                if not is_legal:
                    log_to_file(f"  [LLM Hallucinated] Action {parsed_action} is NOT legal right now.")
                    error_msg = f"Action {parsed_action} is not a valid legal action in the current state. Choose from: {json.dumps(legal_actions)}"
                    continue
                
                log_to_file(f"  [LLM Success] Validated action: {action_dict}")
                break

        else:
            # --- RULE-BASED AGENT (p3) ---
            view = engine.game.state.get_player_view("p3")
            from rl_training.evaluate import RuleBasedAgent
            env_temp = CoupEnv(3)
            agent_rb = RuleBasedAgent(env_temp.action_key_to_index, env_temp.action_index_to_action, "p3")
            obs_temp = encode_observation(view, player_id="p3", action_history=history, num_players=3)
            mask_temp = np.zeros(env_temp.action_space.n, dtype=bool)
            
            for act in legal_actions:
                for idx, a_dict in env_temp.action_index_to_action.items():
                    if a_dict.get("action") == act.get("action") and a_dict.get("target_id") == act.get("target_id") and a_dict.get("character") == act.get("character"):
                        mask_temp[idx] = True
                        break
            
            act_idx = agent_rb.select_action(obs_temp, mask_temp, engine.state)
            action_dict = env_temp.action_index_to_action[act_idx]
            log_to_file(f"[Rule Agent p3] Decided: {action_dict}")

        success, msg = engine.step(action_dict)
        if not success:
            log_to_file(f"  [Engine Error] Step failed for action {action_dict}: {msg}")
        else:
            history.push(
                player_idx=int(acting_pid[1:]) - 1,
                action_type=action_dict.get("action"),
                challenged=False,
                succeeded=True
            )
            
        if engine.state.stage == GameStage.GAME_OVER:
            done = True
            
    winner = engine.get_winner()
    winner_name = next(p["name"] for p in engine.state.to_dict()["players"] if p["player_id"] == winner)
    
    log_to_file("\n" + "="*60)
    log_to_file(f"  MATCHUP OVER! Winner is: {winner_name} ({winner})")
    log_to_file("="*60 + "\n")
    return winner

if __name__ == "__main__":
    winners = {"p1": 0, "p2": 0, "p3": 0}
    for i in range(10):  # Simulate 10 games
        log_to_file(f"\n<<< RUNNING GAME MATCHUP {i+1} >>>\n")
        try:
            winner = run_matchup()
            if winner in winners:
                winners[winner] += 1
        except Exception as exc:
            log_to_file(f"Game error: {exc}")
            
    log_to_file("\n" + "="*60)
    log_to_file("  FINAL MATCHUP SCORE (10 Games)")
    log_to_file("="*60)
    log_to_file(f"  RL Agent (p1)   : {winners['p1']} wins")
    log_to_file(f"  LLM Agent (p2)  : {winners['p2']} wins")
    log_to_file(f"  Rule Agent (p3) : {winners['p3']} wins")
    log_to_file("="*60 + "\n")
