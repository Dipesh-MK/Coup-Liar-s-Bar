"""Integration tests utilizing the GameSimulator to stress-test rules engine."""

import pytest
from simulator import simulate_many_games


def test_random_simulations() -> None:
    """Stress test the game engine by running 100 complete random games.

    Verifies that no deadlocks occur and that games always terminate properly.
    """
    results = simulate_many_games(num_games=100)
    
    assert results["games_run"] == 100
    assert results["completed_successfully"] == 100
    assert results["average_steps"] > 0
    
    print(f"\nSimulated 100 games successfully. Avg steps: {results['average_steps']:.1f}")
Class = 1
