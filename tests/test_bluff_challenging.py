"""
tests/test_bluff_challenging.py

Tests whether the trained RL model correctly uses the public deck remainder information
to challenge bluffs when it has 100% mathematical certainty (card counting), and checks
whether it sometimes chooses to go passive strategically.
"""

import sys
import pathlib
import json
import numpy as np
import torch

# Ensure project root is on path
_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import Character, ActionType, GameStage
from rl_training.observation import encode_observation, ActionHistory, get_observation_size
from sb3_contrib import MaskablePPO


def test_ai_bluff_challenging():
    models_to_test = ["ppo_coup_best.zip", "ppo_coup_final.zip"]
    
    # -------------------------------------------------------------------------
    # Scenario: 3 Players.
    # p1 (AI): Has 1 Duke and 1 Assassin in hand.
    # p2: Declares Tax (claims Duke).
    # p3 (Human): Has 2 other cards.
    # Public deck remainder: Contains 2 Dukes.
    # Discard pile: Empty.
    #
    # Since there are only 3 Dukes in the game:
    #   - 1 is in p1's (AI) hand.
    #   - 2 are in the public deck remainder.
    # This accounts for all 3 Dukes. Therefore, p2's claim of Tax is a 100% bluff!
    # -------------------------------------------------------------------------

    state_view = {
        "stage": GameStage.CHALLENGE_WINDOW.value,
        "turn_number": 5,
        "current_player_idx": 1,  # p2's turn
        "active_action": {
            "action_type": ActionType.TAX.value,
            "player_id": "p2",
            "target_id": None
        },
        "active_block": None,
        "pending_challenge_players": ["p1", "p3"],
        "players": [
            {
                "player_id": "p1",
                "name": "CoupBot-1",
                "coins": 2,
                "cards": [Character.DUKE.value, Character.ASSASSIN.value],
                "cards_count": 2,
                "revealed_cards": [],
                "is_active": True
            },
            {
                "player_id": "p2",
                "name": "CoupBot-2",
                "coins": 2,
                "cards": ["Hidden", "Hidden"],
                "cards_count": 2,
                "revealed_cards": [],
                "is_active": True
            },
            {
                "player_id": "p3",
                "name": "Dip",
                "coins": 2,
                "cards": ["Hidden", "Hidden"],
                "cards_count": 2,
                "revealed_cards": [],
                "is_active": True
            }
        ],
        "deck": {
            "hidden_community_count": 3,
            "public_deck": [
                Character.DUKE.value,
                Character.DUKE.value,
                Character.CAPTAIN.value,
                Character.AMBASSADOR.value,
                Character.CONTESSA.value
            ],
            "discard_pile": []
        }
    }

    # Encode observation for p1 (AI)
    history = ActionHistory()
    history.push(player_idx=1, action_type=ActionType.TAX.value, challenged=False, succeeded=False)
    obs = encode_observation(state_view, player_id="p1", action_history=history, num_players=3)

    print("\n" + "="*60)
    print("  AI ACTION DECISION UNDER PERFECT INFORMATION")
    print("="*60)
    print(f"  AI Hand              : [Duke, Assassin]")
    print(f"  Public Deck Dukes    : 2")
    print(f"  Total Dukes Accounted: 3 / 3 (Opponent MUST be bluffing)")
    print(f"  Opponent Action      : Tax (Claims Duke)")
    print("-"*60)

    for m_name in models_to_test:
        model_path = _ROOT / "models" / m_name
        if not model_path.exists():
            print(f"  Model {m_name} not found.")
            continue
            
        model = MaskablePPO.load(model_path)
        if model.observation_space.shape[0] != get_observation_size():
            print(f"  Skipping model {m_name} due to dimension mismatch (expected {get_observation_size()}, got {model.observation_space.shape[0]})")
            continue
        
        # Build action mask
        mask = np.zeros(model.action_space.n, dtype=bool)
        mask[13] = True  # challenge
        mask[14] = True  # pass

        obs_tensor = torch.as_tensor(obs, device=model.device).unsqueeze(0)
        mask_tensor = torch.as_tensor(mask, device=model.device).unsqueeze(0)
        
        distribution = model.policy.get_distribution(obs_tensor, action_masks=mask_tensor)
        probs = distribution.distribution.probs[0].cpu().detach().numpy()

        challenge_prob = probs[13]
        pass_prob = probs[14]
        print(f"  Model: {m_name}")
        print(f"    Probability (Challenge) : {challenge_prob:.2%}")
        print(f"    Probability (Pass)      : {pass_prob:.2%}")
        print("-"*60)
        
    # Test AIPlayer wrapper override
    print("Testing AIPlayer class integration (logical card-counting override):")
    from ai_player import AIPlayer
    for m_name in models_to_test:
        model_path = _ROOT / "models" / m_name
        if not model_path.exists():
            continue
        ai_player = AIPlayer(model_path=str(model_path), player_id="p1", num_players=3)
        ai_player.history = history
        chosen_action = ai_player.choose_action(state_view)
        print(f"  [{m_name}] AIPlayer.choose_action() -> {chosen_action}")
    print("="*60 + "\n")
    return


if __name__ == "__main__":
    test_ai_bluff_challenging()
