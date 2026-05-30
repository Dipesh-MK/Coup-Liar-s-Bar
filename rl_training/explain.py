import pathlib
import json
import re
import matplotlib.pyplot as plt
from typing import Dict, Any, List, Optional
from collections import defaultdict


def analyze_strategy_evolution(log_dir: str) -> None:
    """Loads all meta_*.json logs, prints a strategy timeline, and plots evolutionary trends."""
    log_path = pathlib.Path(log_dir)
    files = list(log_path.glob("meta_*.json"))
    if not files:
        print("No meta reports found in log directory.")
        return

    # Sort files by step number
    reports = {}
    for f in files:
        match = re.search(r"meta_(\d+)\.json", f.name)
        if match:
            step = int(match.group(1))
            with open(f, "r") as file:
                reports[step] = json.load(file)

    sorted_steps = sorted(reports.keys())

    print("=" * 80)
    print("STRATEGY EVOLUTION TIMELINE")
    print("=" * 80)

    for step in sorted_steps:
        r = reports[step]
        winner_act = r.get("most_used_winner")
        bluff_rate = r.get("bluff_success_rate", 0.0)
        bluff_trend = r.get("bluff_success_rate_trend", "stable")
        chal_freq = r.get("challenge_frequency", 0.0)
        chal_trend = r.get("challenge_frequency_trend", "stable")
        avg_len = r.get("average_game_length", 0.0)
        len_trend = r.get("average_game_length_trend", "stable")

        print(f"Step {step:6d} | Winner Fav Action: {winner_act:12s} | Bluff Success: {bluff_rate:6.1%} ({bluff_trend:7s}) | Challenges: {chal_freq:.2f}/game ({chal_trend:7s}) | Avg Length: {avg_len:5.1f} turns ({len_trend})")
        
        # Print alerts if present
        if r.get("seat_bias_alert"):
            rates_str = ", ".join(f"{k}: {v:.1%}" for k, v in r["seat_win_rates"].items())
            print(f"            [ALERT] High seat bias detected in win rates: {rates_str}")
        if r.get("dominant_action_alert"):
            print(f"            [ALERT] Dominant strategy emerged: '{r['dominant_action_alert']}' represents {r['dominant_action_pct']:.1%} of all moves")
        
        # Print top action chains
        top_chains = r.get("top_3_chains", [])
        if top_chains:
            chain_strs = []
            for item in top_chains:
                chain_strs.append(" -> ".join(item["chain"]))
            print(f"            Top Chains: {', '.join(chain_strs)}")
        print("-" * 80)

    # Plot metrics
    steps = []
    bluff_rates = []
    chal_freqs = []
    game_lengths = []
    
    sample_report = reports[sorted_steps[0]]
    seats = sorted(sample_report["seat_win_rates"].keys())
    seat_rates = {seat: [] for seat in seats}

    for step in sorted_steps:
        r = reports[step]
        steps.append(step)
        bluff_rates.append(r.get("bluff_success_rate", 0.0))
        chal_freqs.append(r.get("challenge_frequency", 0.0))
        game_lengths.append(r.get("average_game_length", 0.0))
        for seat in seats:
            seat_rates[seat].append(r["seat_win_rates"].get(seat, 0.0))

    fig, axs = plt.subplots(2, 2, figsize=(14, 10))

    # 1. Bluff success rate over steps
    axs[0, 0].plot(steps, bluff_rates, marker="o", color="blue", linewidth=2, label="Bluff Success Rate")
    axs[0, 0].set_title("Bluff Success Rate over Training Steps")
    axs[0, 0].set_xlabel("Steps")
    axs[0, 0].set_ylabel("Success Rate")
    axs[0, 0].grid(True)
    axs[0, 0].legend()

    # 2. Challenge frequency over steps
    axs[0, 1].plot(steps, chal_freqs, marker="s", color="orange", linewidth=2, label="Challenge Frequency")
    axs[0, 1].set_title("Challenge Frequency over Training Steps")
    axs[0, 1].set_xlabel("Steps")
    axs[0, 1].set_ylabel("Challenges per Game")
    axs[0, 1].grid(True)
    axs[0, 1].legend()

    # 3. Win rate per seat position
    for seat, rates in seat_rates.items():
        axs[1, 0].plot(steps, rates, marker="x", linewidth=2, label=f"Seat {seat}")
    axs[1, 0].set_title("Win Rate per Seat Position over Time")
    axs[1, 0].set_xlabel("Steps")
    axs[1, 0].set_ylabel("Win Rate")
    axs[1, 0].grid(True)
    axs[1, 0].legend()

    # 4. Mean game length
    axs[1, 1].plot(steps, game_lengths, marker="^", color="green", linewidth=2, label="Mean Game Length")
    axs[1, 1].set_title("Mean Game Length over Time")
    axs[1, 1].set_xlabel("Steps")
    axs[1, 1].set_ylabel("Turns")
    axs[1, 1].grid(True)
    axs[1, 1].legend()

    plt.tight_layout()
    plot_path = log_path / "strategy_evolution.png"
    plt.savefig(plot_path)
    print(f"\nSaved strategy evolution plot to {plot_path}")


def explain_single_game(game_result: dict) -> None:
    """Narrates a single game step-by-step from raw game results and displays player summaries."""
    print("=" * 80)
    print("GAME NARRATION")
    print("=" * 80)

    # Group action records by turn number
    actions_by_turn = defaultdict(list)
    for act in game_result.get("action_sequence", []):
        actions_by_turn[act["turn"]].append(act)

    sorted_turns = sorted(actions_by_turn.keys())

    # Map player IDs to readable seat indices (e.g. p1 -> P0, p2 -> P1)
    def map_pid(pid: Optional[str]) -> str:
        if not pid:
            return ""
        try:
            return f"P{int(pid[1:]) - 1}"
        except Exception:
            return pid

    for turn in sorted_turns:
        turn_actions = actions_by_turn[turn]
        turn_challenges = [c for c in game_result.get("challenges", []) if c["turn"] == turn]
        turn_losses = [l for l in game_result.get("revealed_influences", []) if l["turn"] == turn]

        narrative_parts = []
        for act in turn_actions:
            pid_str = map_pid(act["player_id"])
            action_name = act["action"]
            target_str = map_pid(act["target_id"])
            char_str = act["character"]

            if action_name == "Income":
                narrative_parts.append(f"{pid_str} claims Income")
            elif action_name == "Foreign Aid":
                narrative_parts.append(f"{pid_str} claims Foreign Aid")
            elif action_name == "Coup":
                narrative_parts.append(f"{pid_str} Coups {target_str}")
            elif action_name == "Tax":
                narrative_parts.append(f"{pid_str} Claims Duke -> Tax")
            elif action_name == "Steal":
                narrative_parts.append(f"{pid_str} Claims Captain -> Steals from {target_str}")
            elif action_name == "Assassinate":
                narrative_parts.append(f"{pid_str} Claims Assassin -> Assassinates {target_str}")
            elif action_name == "Exchange":
                narrative_parts.append(f"{pid_str} Claims Ambassador -> Exchange")
            elif action_name == "block":
                narrative_parts.append(f"{pid_str} Blocks as {char_str}")
            elif action_name == "reveal":
                narrative_parts.append(f"{pid_str} Reveals {char_str}")
            elif action_name == "exchange":
                keep_str = ", ".join(act.get("keep", []))
                narrative_parts.append(f"{pid_str} keeps [{keep_str}]")
            elif action_name == "pass":
                # Only add pass to narration if it is block/challenge pass, to keep it clean
                pass
            elif action_name == "challenge":
                # Will be narrated explicitly via challenges list
                pass

        for chal in turn_challenges:
            challenger = map_pid(chal["challenger"])
            target = map_pid(chal["target"])
            won = chal["won"]
            outcome = "WINS (bluff caught)" if won else "FAILS (target was honest)"
            narrative_parts.append(f"{challenger} Challenges {target} -> {outcome}")

        for loss in turn_losses:
            loss_p = map_pid(loss["player_id"])
            lost_card = loss["card"]
            narrative_parts.append(f"{loss_p} loses {lost_card} influence")

        if narrative_parts:
            steps_str = " | ".join(narrative_parts)
            print(f"Turn {turn:2d} | {steps_str}")

    print("\n" + "=" * 80)
    print("PLAYER STRATEGY SUMMARIES")
    print("=" * 80)
    
    for pid, stats in game_result.get("players_stats", {}).items():
        p_seat = map_pid(pid)
        bluffs = stats["bluff_attempts"]
        bluff_succ = stats["bluff_successes"]
        bluff_pct = (bluff_succ / bluffs) if bluffs > 0 else 0.0

        chals = stats["challenges_made"]
        chal_won = stats["challenges_won"]
        chal_pct = (chal_won / chals) if chals > 0 else 0.0

        is_winner = (game_result["winner_id"] == pid)
        status = "WINNER" if is_winner else f"ELIMINATED on Turn {stats['eliminated_turn']}"

        act_counts = stats["action_counts"]
        favorite_action = max(act_counts, key=act_counts.get) if any(act_counts.values()) else "None"

        print(f"Player {p_seat} ({pid}) - {status}")
        print(f"  Favorite Action:    {favorite_action}")
        print(f"  Bluff Attempts:     {bluffs} ({bluff_pct:.1%} success rate)")
        print(f"  Challenges Made:    {chals} ({chal_pct:.1%} success rate)")
        print(f"  Blocks Made:        {stats['blocks_made']}")
        print(f"  Final Coins:        {stats['final_coins']}")
        print("-" * 80)
