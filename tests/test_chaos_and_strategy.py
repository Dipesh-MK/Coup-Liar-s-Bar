import random
import logging
from typing import List, Dict, Any, Tuple
import pytest
import itertools

from constants import Character, ActionType, BlockType, GameStage, ACTION_ROLES, BLOCK_ROLES, ACTION_BLOCK_TYPES
from coup_engine import Game
from player import Player

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_invariants(game: Game, expected_player_count: int) -> None:
    """Verifies state invariants that must hold true at every single game state."""
    state = game.state
    
    # 1. Total Card Conservation (sum must be exactly 15)
    hands_active = sum(len(p.cards) for p in state.players)
    hands_revealed = sum(len(p.revealed_cards) for p in state.players)
    community_count = len(state.deck.hidden_community)
    public_deck_count = len(state.deck.public_deck)
    exchange_in_transit = len(state.exchange_drawn_cards)
    
    total_cards = hands_active + hands_revealed + community_count + public_deck_count + exchange_in_transit
    assert total_cards == 15, (
        f"Card count mismatch! Total: {total_cards}. "
        f"Active: {hands_active}, Revealed: {hands_revealed}, "
        f"Community: {community_count}, Public Deck: {public_deck_count}, "
        f"Exchange In Transit: {exchange_in_transit}"
    )

    # 2. Hidden Community size invariant
    if state.stage == GameStage.EXCHANGE_SELECTION:
        assert len(state.deck.hidden_community) == 1
    else:
        assert len(state.deck.hidden_community) == 3

    # 3. Discard pile matches total revealed cards
    discard_pile_sorted = sorted([c.value for c in state.deck.discard_pile])
    revealed_cards_sorted = sorted([c.value for p in state.players for c in p.revealed_cards])
    assert discard_pile_sorted == revealed_cards_sorted, (
        f"Discard pile does not match player revealed cards. "
        f"Discard: {discard_pile_sorted}, Revealed: {revealed_cards_sorted}"
    )

    # 4. Player coins bounds
    for p in state.players:
        assert p.coins >= 0, f"Player {p.name} has negative coins: {p.coins}"

    # 5. Game Over / Win conditions
    active_players = [p for p in state.players if p.is_active]
    if state.stage == GameStage.GAME_OVER:
        assert len(active_players) <= 1, f"Game ended but active players count is {len(active_players)}"
    else:
        assert len(active_players) >= 2, f"Game not ended but active players count is {len(active_players)}"


def get_strategic_decision(game: Game, player_id: str) -> Dict[str, Any]:
    """Returns a realistic strategic action based on the player's actual hand and game state."""
    state = game.state
    stage = state.stage
    player = state.get_player(player_id)
    
    active_opponents = [p.player_id for p in state.players if p.is_active and p.player_id != player_id]
    if not active_opponents:
        return {"action": "pass"}

    if stage == GameStage.ACTION_SELECTION:
        # Mandatory Coup at 10+ coins
        if player.coins >= 10:
            return {"action": ActionType.COUP.value, "target_id": random.choice(active_opponents)}
        
        # 7+ coins: Coup
        if player.coins >= 7 and random.random() < 0.8:
            return {"action": ActionType.COUP.value, "target_id": random.choice(active_opponents)}
        
        # Honestly play Duke if in hand
        if Character.DUKE in player.cards:
            return {"action": ActionType.TAX.value}
            
        # Honestly play Captain if in hand
        if Character.CAPTAIN in player.cards:
            # target someone who has coins
            targetable = [o for o in active_opponents if state.get_player(o).coins > 0]
            target = random.choice(targetable) if targetable else random.choice(active_opponents)
            return {"action": ActionType.STEAL.value, "target_id": target}
            
        # Honestly play Assassin if in hand & has coins
        if Character.ASSASSIN in player.cards and player.coins >= 3:
            return {"action": ActionType.ASSASSINATE.value, "target_id": random.choice(active_opponents)}
            
        # Honestly play Ambassador if in hand
        if Character.AMBASSADOR in player.cards:
            return {"action": ActionType.EXCHANGE.value}

        # Otherwise, choose based on probabilities
        choices = [
            ActionType.INCOME.value,
            ActionType.FOREIGN_AID.value,
        ]
        # Bluff Tax (Duke)
        if random.random() < 0.2:
            choices.append(ActionType.TAX.value)
        # Bluff Exchange (Ambassador)
        if random.random() < 0.1:
            choices.append(ActionType.EXCHANGE.value)
        # Bluff Steal (Captain)
        if random.random() < 0.1:
            choices.append(ActionType.STEAL.value)

        act = random.choice(choices)
        if act == ActionType.STEAL.value:
            return {"action": act, "target_id": random.choice(active_opponents)}
        elif act == ActionType.ASSASSINATE.value:
            if player.coins >= 3:
                return {"action": act, "target_id": random.choice(active_opponents)}
            else:
                return {"action": ActionType.INCOME.value}
        return {"action": act}

    elif stage == GameStage.CHALLENGE_WINDOW:
        # Challenge bluffs with some probability
        active_action = state.active_action
        actor = state.get_player(active_action.player_id)
        action_type = active_action.action_type
        
        required_role = ACTION_ROLES.get(action_type)
        if required_role:
            # We suspect a bluff if actor doesn't have it (cheat inspection for strategic testing)
            is_bluff = required_role not in actor.cards
            challenge_prob = 0.4 if is_bluff else 0.05
            # If we are the target of Steal or Assassination and don't have block cards, challenge more aggressively
            if active_action.target_id == player_id:
                if action_type == ActionType.ASSASSINATE and Character.CONTESSA not in player.cards:
                    challenge_prob = max(challenge_prob, 0.6)
                if action_type == ActionType.STEAL and not any(c in player.cards for c in [Character.CAPTAIN, Character.AMBASSADOR]):
                    challenge_prob = max(challenge_prob, 0.4)
            
            if random.random() < challenge_prob:
                return {"action": "challenge"}
        return {"action": "pass"}

    elif stage == GameStage.BLOCK_WINDOW:
        active_action = state.active_action
        action_type = active_action.action_type
        
        # We are targeted or it is foreign aid (any player can block)
        if action_type == ActionType.FOREIGN_AID:
            # Block with Duke honestly if we have it
            if Character.DUKE in player.cards:
                return {"action": "block", "character": Character.DUKE.value}
            # Bluff block Duke
            if random.random() < 0.15:
                return {"action": "block", "character": Character.DUKE.value}
            return {"action": "pass"}
            
        elif action_type == ActionType.STEAL:
            # Block Steal with Captain or Ambassador honestly
            if Character.CAPTAIN in player.cards:
                return {"action": "block", "character": Character.CAPTAIN.value}
            if Character.AMBASSADOR in player.cards:
                return {"action": "block", "character": Character.AMBASSADOR.value}
            # Bluff block
            if random.random() < 0.3:
                return {"action": "block", "character": random.choice([Character.CAPTAIN.value, Character.AMBASSADOR.value])}
            return {"action": "pass"}
            
        elif action_type == ActionType.ASSASSINATE:
            # Block Assassination with Contessa honestly
            if Character.CONTESSA in player.cards:
                return {"action": "block", "character": Character.CONTESSA.value}
            # Bluff block (since otherwise we lose influence anyway)
            if random.random() < 0.8:
                return {"action": "block", "character": Character.CONTESSA.value}
            return {"action": "pass"}
            
        return {"action": "pass"}

    elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
        # Challenge blocker bluffs
        active_block = state.active_block
        blocker = state.get_player(active_block.player_id)
        block_role = active_block.character
        
        is_bluff = block_role not in blocker.cards
        challenge_prob = 0.4 if is_bluff else 0.05
        # If we are the active player whose action was blocked, challenge blocker more aggressively
        if state.active_action.player_id == player_id:
            challenge_prob = max(challenge_prob, 0.5)
            
        if random.random() < challenge_prob:
            return {"action": "challenge"}
        return {"action": "pass"}

    elif stage == GameStage.REVEAL_CARD_CHALLENGE:
        # Defender has to reveal.
        required_role = None
        if state.active_block is not None:
            required_role = state.active_block.character
        else:
            required_role = ACTION_ROLES[state.active_action.action_type]
            
        # Reveal required_role if we have it to win the challenge
        if required_role in player.cards:
            return {"action": "reveal", "character": required_role.value}
        # Otherwise reveal a random card
        return {"action": "reveal", "character": random.choice(player.cards).value}

    elif stage == GameStage.REVEAL_CARD_LOSS:
        # Must choose card to discard.
        # Strategically keep better cards if possible.
        # Prefer keeping: Duke, Captain, Contessa, Assassin, Ambassador
        card_preferences = [Character.DUKE, Character.CAPTAIN, Character.CONTESSA, Character.ASSASSIN, Character.AMBASSADOR]
        sorted_cards = sorted(player.cards, key=lambda c: card_preferences.index(c) if c in card_preferences else 99, reverse=True)
        # Discard the least preferred one (which is at the end)
        return {"action": "reveal", "character": sorted_cards[-1].value}

    elif stage == GameStage.EXCHANGE_SELECTION:
        # Keep original hand size from the pool of current + drawn
        original_size = len(player.cards)
        pool = player.cards + state.exchange_drawn_cards
        # Preference sort
        card_preferences = [Character.DUKE, Character.CAPTAIN, Character.CONTESSA, Character.ASSASSIN, Character.AMBASSADOR]
        sorted_pool = sorted(pool, key=lambda c: card_preferences.index(c) if c in card_preferences else 99)
        keep = [c.value for c in sorted_pool[:original_size]]
        return {"action": "exchange", "keep": keep}

    return {"action": "pass"}


def get_all_legal_inputs(game: Game, player_id: str) -> List[Dict[str, Any]]:
    """Returns a list of all legal moves/decisions for player_id in the current stage."""
    state = game.state
    stage = state.stage
    
    if stage == GameStage.GAME_OVER:
        return []
        
    try:
        player = state.get_player(player_id)
    except ValueError:
        return []
        
    if not player.is_active:
        return []
        
    inputs = []
    
    if stage == GameStage.ACTION_SELECTION:
        if player_id != state.current_player.player_id:
            return []
        targets = [p.player_id for p in state.players if p.is_active and p.player_id != player_id]
        
        if player.coins >= 10:
            for t in targets:
                inputs.append({"action": ActionType.COUP.value, "target_id": t})
            return inputs
            
        inputs.append({"action": ActionType.INCOME.value})
        inputs.append({"action": ActionType.FOREIGN_AID.value})
        inputs.append({"action": ActionType.TAX.value})
        inputs.append({"action": ActionType.EXCHANGE.value})
        
        for t in targets:
            inputs.append({"action": ActionType.STEAL.value, "target_id": t})
            if player.coins >= 3:
                inputs.append({"action": ActionType.ASSASSINATE.value, "target_id": t})
            if player.coins >= 7:
                inputs.append({"action": ActionType.COUP.value, "target_id": t})
                
    elif stage == GameStage.CHALLENGE_WINDOW:
        if player_id in state.pending_challenge_players:
            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})
            
    elif stage == GameStage.BLOCK_WINDOW:
        if player_id in state.pending_block_players:
            inputs.append({"action": "pass"})
            action_type = state.active_action.action_type
            block_type = ACTION_BLOCK_TYPES[action_type]
            allowed_chars = BLOCK_ROLES[block_type]
            for char in allowed_chars:
                inputs.append({"action": "block", "character": char.value})
                
    elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
        if player_id in state.pending_challenge_players:
            inputs.append({"action": "pass"})
            inputs.append({"action": "challenge"})
            
    elif stage == GameStage.REVEAL_CARD_CHALLENGE:
        if player_id == state.challenge_target_id:
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})
                
    elif stage == GameStage.REVEAL_CARD_LOSS:
        if player_id == state.reveal_loss_player_id:
            for card in set(player.cards):
                inputs.append({"action": "reveal", "character": card.value})
                
    elif stage == GameStage.EXCHANGE_SELECTION:
        if player_id == state.active_action.player_id:
            drawn = state.exchange_drawn_cards
            pool = player.cards + drawn
            original_size = len(player.cards)
            
            combos = list(itertools.combinations(range(len(pool)), original_size))
            seen = set()
            for combo in combos:
                combo_cards = tuple(sorted([pool[idx].value for idx in combo]))
                if combo_cards not in seen:
                    seen.add(combo_cards)
                    inputs.append({"action": "exchange", "keep": list(combo_cards)})
                    
    return inputs


def generate_chaos_inputs(game: Game) -> List[Tuple[str, Dict[str, Any]]]:
    """Generates a list of invalid, malformed, or out-of-order inputs for testing fuzzer."""
    state = game.state
    player_ids = [p.player_id for p in state.players]
    active_player_ids = [p.player_id for p in state.players if p.is_active]
    dead_player_ids = [p.player_id for p in state.players if not p.is_active]
    
    chaos = []
    
    # 1. Invalid player IDs
    chaos.append(("invalid_player", {"action": "income"}))
    chaos.append(("", {"action": "income"}))
    
    # 2. Dead player trying to act
    if dead_player_ids:
        chaos.append((dead_player_ids[0], {"action": "income"}))
        chaos.append((dead_player_ids[0], {"action": "pass"}))

    # 3. Actions selection chaos
    # Choose a player whose turn it is not
    not_current_turn_players = [p for p in active_player_ids if p != state.current_player.player_id]
    if not_current_turn_players:
        chaos.append((not_current_turn_players[0], {"action": "income"}))
        chaos.append((not_current_turn_players[0], {"action": "tax"}))
        
    # 4. Malformed dictionaries / types
    current = state.current_player.player_id
    chaos.append((current, {}))
    chaos.append((current, {"action": 1234}))
    chaos.append((current, {"action": "invalid_action_type_string"}))
    chaos.append((current, {"action": "coup"}))  # missing target
    chaos.append((current, {"action": "coup", "target_id": "non_existent_player"}))
    chaos.append((current, {"action": "coup", "target_id": current}))  # targeting self
    if dead_player_ids:
        chaos.append((current, {"action": "coup", "target_id": dead_player_ids[0]}))  # targeting dead player

    # 5. Challenge window chaos (actions when not expected)
    for p in active_player_ids:
        chaos.append((p, {"action": "challenge"}))
        chaos.append((p, {"action": "pass"}))
            
    # 6. Block window chaos
    for p in active_player_ids:
        chaos.append((p, {"action": "block", "character": Character.DUKE.value}))
            
    # 7. Exchange selections
    if state.stage == GameStage.EXCHANGE_SELECTION:
        # Invalid keep list structure
        chaos.append((state.active_action.player_id, {"action": "exchange"}))
        chaos.append((state.active_action.player_id, {"action": "exchange", "keep": "not_a_list"}))
        # Keep too few / too many cards
        original_size = len(state.get_player(state.active_action.player_id).cards)
        chaos.append((state.active_action.player_id, {"action": "exchange", "keep": ["Duke"] * (original_size + 1)}))
        chaos.append((state.active_action.player_id, {"action": "exchange", "keep": ["Duke"] * max(0, original_size - 1)}))
        # Keep cards not in pool
        chaos.append((state.active_action.player_id, {"action": "exchange", "keep": ["invalid_card_type"] * original_size}))
    else:
        # Try exchange selection in wrong stage
        for p in active_player_ids:
            chaos.append((p, {"action": "exchange", "keep": ["Duke"]}))

    # 8. Reveal loss in wrong stage
    for p in active_player_ids:
        if len(state.get_player(p).cards) > 0:
            card = state.get_player(p).cards[0].value
            chaos.append((p, {"action": "reveal", "character": card}))
                
    # 9. Reveal card not owned by player
    if state.stage in [GameStage.REVEAL_CARD_LOSS, GameStage.REVEAL_CARD_CHALLENGE]:
        reveal_p_id = (state.reveal_loss_player_id if state.stage == GameStage.REVEAL_CARD_LOSS 
                       else state.challenge_target_id)
        if reveal_p_id:
            # Find a card character not in player hand
            p_cards = state.get_player(reveal_p_id).cards
            all_chars = [c for c in Character]
            missing_chars = [c for c in all_chars if c not in p_cards]
            if missing_chars:
                chaos.append((reveal_p_id, {"action": "reveal", "character": missing_chars[0].value}))
            chaos.append((reveal_p_id, {"action": "reveal", "character": "InvalidCharacter"}))
            
    # 10. Pass or Challenge when not in pending lists
    for np_p in active_player_ids:
        chaos.append((np_p, {"action": "pass"}))
        chaos.append((np_p, {"action": "challenge"}))
            
    for np_p in active_player_ids:
        chaos.append((np_p, {"action": "pass"}))
        chaos.append((np_p, {"action": "block", "character": Character.DUKE.value}))

    # Filter out actually legal inputs
    filtered_chaos = []
    for pid, data in chaos:
        legals = get_all_legal_inputs(game, pid)
        if data not in legals:
            filtered_chaos.append((pid, data))
            
    return filtered_chaos


def test_strategic_simulations() -> None:
    """Runs 100 fully strategic games to completion, verifying rules invariants at each step."""
    logger.info("Starting strategic simulation tests...")
    
    for game_idx in range(1000):
        # Randomize player count between 2 and 6
        num_players = random.randint(2, 6)
        player_ids = [f"p{i}" for i in range(1, num_players + 1)]
        player_names = [f"Player {i}" for i in range(1, num_players + 1)]
        
        game = Game(player_ids, player_names)
        check_invariants(game, num_players)
        
        steps = 0
        while game.state.stage != GameStage.GAME_OVER and steps < 2000:
            # Determine whose turn/action it is
            stage = game.state.stage
            acting_player_id = ""
            if stage == GameStage.ACTION_SELECTION:
                acting_player_id = game.state.current_player.player_id
            elif stage == GameStage.CHALLENGE_WINDOW:
                acting_player_id = game.state.pending_challenge_players[0]
            elif stage == GameStage.BLOCK_WINDOW:
                acting_player_id = game.state.pending_block_players[0]
            elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
                acting_player_id = game.state.pending_challenge_players[0]
            elif stage == GameStage.REVEAL_CARD_CHALLENGE:
                acting_player_id = game.state.challenge_target_id
            elif stage == GameStage.REVEAL_CARD_LOSS:
                acting_player_id = game.state.reveal_loss_player_id
            elif stage == GameStage.EXCHANGE_SELECTION:
                acting_player_id = game.state.active_action.player_id
            
            # Make strategic decision
            decision = get_strategic_decision(game, acting_player_id)
            
            # Execute input
            success, msg = game.handle_input(acting_player_id, decision)
            assert success, f"Failed strategic move: {decision} for {acting_player_id} at {stage.value}. Reason: {msg}"
            
            check_invariants(game, num_players)
            steps += 1
            
        assert game.state.stage == GameStage.GAME_OVER, f"Game {game_idx} did not finish in 2000 steps."
        logger.info(f"Strategic Game {game_idx} finished successfully in {steps} steps.")


def test_chaos_fuzzing() -> None:
    """Runs 100 games where at each turn, 20 invalid chaos inputs are tested and verified to fail without state mutation, before a valid strategic input advances the game."""
    logger.info("Starting chaos fuzzing tests...")
    
    for game_idx in range(1000):
        # Randomize player count
        num_players = random.randint(2, 6)
        player_ids = [f"p{i}" for i in range(1, num_players + 1)]
        player_names = [f"Player {i}" for i in range(1, num_players + 1)]
        
        game = Game(player_ids, player_names)
        check_invariants(game, num_players)
        
        steps = 0
        while game.state.stage != GameStage.GAME_OVER and steps < 2000:
            # Re-verify invariants
            check_invariants(game, num_players)
            
            # Generate chaos inputs
            chaos_list = generate_chaos_inputs(game)
            # Sample 20 random chaos inputs (or take all if less than 20)
            sample_size = min(20, len(chaos_list))
            chaos_samples = random.sample(chaos_list, sample_size) if chaos_list else []
            
            for pid, data in chaos_samples:
                # Capture deep copy of critical state properties before trying chaos to ensure no side-effects
                prev_stage = game.state.stage
                prev_current_player_idx = game.state.current_player_idx
                prev_coins = {p.player_id: p.coins for p in game.state.players}
                prev_cards = {p.player_id: list(p.cards) for p in game.state.players}
                prev_revealed = {p.player_id: list(p.revealed_cards) for p in game.state.players}
                prev_community = list(game.state.deck.hidden_community)
                prev_discard = list(game.state.deck.discard_pile)
                
                # Execute chaos input
                try:
                    success, msg = game.handle_input(pid, data)
                except Exception as e:
                    logger.error(f"CRITICAL CRASH: Game crashed on chaos input {data} by player '{pid}' at stage {prev_stage.value}.")
                    raise e
                
                # Verify that chaos was rejected
                assert not success, f"Chaos input was accepted! Player: {pid}, Data: {data}, Stage: {prev_stage.value}, Msg: {msg}"
                
                # Verify no side-effects occurred in the game state
                assert game.state.stage == prev_stage, "Game stage changed on failed chaos input."
                assert game.state.current_player_idx == prev_current_player_idx, "Current player index changed on failed chaos input."
                assert len(game.state.deck.hidden_community) == len(prev_community), "Hidden community changed on failed chaos input."
                assert len(game.state.deck.discard_pile) == len(prev_discard), "Discard pile changed on failed chaos input."
                
                for p in game.state.players:
                    assert p.coins == prev_coins[p.player_id], f"Player {p.player_id} coins changed from {prev_coins[p.player_id]} to {p.coins} on failed chaos."
                    assert p.cards == prev_cards[p.player_id], f"Player {p.player_id} cards changed on failed chaos."
                    assert p.revealed_cards == prev_revealed[p.player_id], f"Player {p.player_id} revealed cards changed on failed chaos."
            
            # Now, perform a valid strategic move to advance the game
            stage = game.state.stage
            acting_player_id = ""
            if stage == GameStage.ACTION_SELECTION:
                acting_player_id = game.state.current_player.player_id
            elif stage == GameStage.CHALLENGE_WINDOW:
                acting_player_id = game.state.pending_challenge_players[0]
            elif stage == GameStage.BLOCK_WINDOW:
                acting_player_id = game.state.pending_block_players[0]
            elif stage == GameStage.BLOCK_CHALLENGE_WINDOW:
                acting_player_id = game.state.pending_challenge_players[0]
            elif stage == GameStage.REVEAL_CARD_CHALLENGE:
                acting_player_id = game.state.challenge_target_id
            elif stage == GameStage.REVEAL_CARD_LOSS:
                acting_player_id = game.state.reveal_loss_player_id
            elif stage == GameStage.EXCHANGE_SELECTION:
                acting_player_id = game.state.active_action.player_id
            
            decision = get_strategic_decision(game, acting_player_id)
            success, msg = game.handle_input(acting_player_id, decision)
            assert success, f"Heuristic move failed: {decision} for {acting_player_id} at stage {stage.value}. Reason: {msg}"
            
            steps += 1
            
        assert game.state.stage == GameStage.GAME_OVER, f"Game {game_idx} did not finish in 2000 steps."
        logger.info(f"Chaos Game {game_idx} finished successfully in {steps} steps.")
