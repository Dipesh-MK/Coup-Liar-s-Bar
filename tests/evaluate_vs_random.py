import sys
import pathlib

_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from rl_training.evaluate import evaluate, print_evaluation_report

print("Evaluating MaskablePPO model against RandomAgent...")
results = evaluate("models/ppo_coup_final.zip", num_games=200, opponent_types=["random"])
print_evaluation_report(results)
