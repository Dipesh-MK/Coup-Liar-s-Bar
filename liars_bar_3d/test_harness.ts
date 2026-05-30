// test_harness.ts — deterministic simulation test for useCoupState client hook
import type { CardType, GameState } from "./src/hooks/useCoupState";

// Mocks for React hooks
let state: GameState;
let deck: CardType[] = [];

// Track and run timeouts synchronously
const timeouts: (() => void)[] = [];
const mockSetTimeout = (fn: any, delay: number) => {
  timeouts.push(fn);
  return timeouts.length;
};
const mockClearTimeout = () => {};

// Mock React
const mockReact = {
  useState: (initial: any) => {
    // If it's the game state
    if (initial && "players" in initial) {
      state = initial;
      const setState = (updater: any) => {
        state = typeof updater === "function" ? updater(state) : updater;
      };
      return [state, setState];
    }
    // If it's the deck state
    const setDeck = (updater: any) => {
      deck = typeof updater === "function" ? updater(deck) : updater;
    };
    return [deck, setDeck];
  },
  useCallback: (fn: any) => fn,
  useRef: (initial: any) => ({ current: initial }),
  useEffect: () => {},
};

// Intercept react require in Node
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (name: string) {
  if (name === "react") {
    return mockReact;
  }
  return originalRequire.apply(this, arguments);
};

// Mock browser objects
(global as any).window = {
  AudioContext: function () {
    return {
      createOscillator: () => ({
        connect() {},
        start() {},
        stop() {},
        frequency: { setValueAtTime() {} },
      }),
      createGain: () => ({
        connect() {},
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      }),
      destination: {},
      currentTime: 0,
    };
  },
};
(global as any).setTimeout = mockSetTimeout;
(global as any).clearTimeout = mockClearTimeout;

// Import the hook AFTER patching require
const { useCoupState } = require("./src/hooks/useCoupState");

// Invariants check
function checkInvariants(st: GameState) {
  if (!st || st.players.length === 0) return;

  // 1. Check card conservation (hand + revealed + community + public + discard = 15)
  const activeCount = st.players.reduce((sum, p) => sum + p.cards.length, 0);
  const revealedCount = st.players.reduce((sum, p) => sum + p.revealedCards.length, 0);
  const communityCount = st.piles.community.length;
  const publicCount = st.piles.public.length;
  const discardCount = st.piles.discard.length;

  if (st.communitySecret && st.communitySecret.length !== 3) {
    throw new Error(
      `Community secret deck size violated! Got: ${st.communitySecret.length}, expected: 3`
    );
  }

  const total = activeCount + revealedCount + communityCount + publicCount + discardCount;
  if (total !== 15) {
    throw new Error(
      `Card conservation violated! Total: ${total} (Active: ${activeCount}, Revealed: ${revealedCount}, Community: ${communityCount}, Public: ${publicCount}, Discard: ${discardCount})`
    );
  }

  // 2. Coins must be non-negative
  for (const p of st.players) {
    if (p.coins < 0) {
      throw new Error(`Player ${p.name} has negative coins: ${p.coins}`);
    }
  }

  // 3. Current player index must be valid active player
  if (st.stage !== "Game Over" && st.currentPlayerIdx !== -1) {
    const cp = st.players[st.currentPlayerIdx];
    if (!cp.isActive) {
      throw new Error(`Current player is inactive: ${cp.name}`);
    }
  }

  // 4. Validate Challenge stage targets
  if (st.stage === "Reveal Card Challenge") {
    if (!st.challengeTargetId) {
      throw new Error("Reveal Card Challenge stage but challengeTargetId is null");
    }
    if (!st.challengeChallengerId) {
      throw new Error("Reveal Card Challenge stage but challengeChallengerId is null");
    }
    if (st.challengeTargetId === st.challengeChallengerId) {
      throw new Error(`Challenger cannot challenge themselves: ${st.challengeTargetId}`);
    }
  }

  // 5. Validate Card Loss stage targets
  if (st.stage === "Reveal Card Loss") {
    if (!st.revealLossPlayerId) {
      throw new Error("Reveal Card Loss stage but revealLossPlayerId is null");
    }
    const victim = st.players.find(p => p.id === st.revealLossPlayerId);
    if (!victim || !victim.isActive) {
      throw new Error(`Reveal Card Loss target ${st.revealLossPlayerId} is invalid or inactive`);
    }

    if (st.revealLossReason === "failed_challenge") {
      if (st.revealLossPlayerId !== st.challengeChallengerId) {
        throw new Error(`Failed challenge card loss attributed to wrong player: got ${st.revealLossPlayerId}, expected challenger ${st.challengeChallengerId}`);
      }
    } else if (st.revealLossReason === "coup" || st.revealLossReason === "assassination") {
      const act = st.activeAction;
      if (!act) {
        throw new Error(`Reveal Card Loss due to ${st.revealLossReason} but activeAction is null`);
      }
      if (st.revealLossPlayerId !== act.targetId) {
        throw new Error(`Card loss due to ${st.revealLossReason} attributed to wrong target: got ${st.revealLossPlayerId}, expected target ${act.targetId}`);
      }
    }
  }
}

// Helper to run all pending timeouts
function runPendingTimeouts() {
  const list = [...timeouts];
  timeouts.length = 0;
  for (const fn of list) {
    fn();
  }
}

// Simulate complete games
function runSimulationGame(gameId: number) {
  const result = useCoupState();
  
  // 1. Initialize
  result.initGame("Human", "Duke", 4, 3);
  checkInvariants(state);

  let turns = 0;
  const maxTurns = 500;

  while (state.stage !== "Game Over" && turns < maxTurns) {
    turns++;
    const prevStage = state.stage;
    const cpIdx = state.currentPlayerIdx;
    
    // Process any timeouts (e.g. AI actions, watchdog, animation delays)
    runPendingTimeouts();

    // If state didn't change and no timeouts, we need to inject client inputs
    if (state.stage === prevStage && state.currentPlayerIdx === cpIdx) {
      // It's the human's turn or human is prompted to act
      if (state.stage === "Action Selection" && state.currentPlayerIdx === 0) {
        // Human action selection
        const human = state.players[0];
        if (human.coins >= 10) {
          result.performAction("Coup", "p1");
        } else {
          // Select randomly among valid actions
          const actions = ["Income", "Foreign Aid", "Tax", "Exchange", "Steal", "Assassinate"];
          const validActions = actions.filter((a) => {
            if (a === "Assassinate") return human.coins >= 3;
            if (a === "Coup") return human.coins >= 7;
            return true;
          });
          const chosen = validActions[Math.floor(Math.random() * validActions.length)];
          const target = ["Steal", "Assassinate", "Coup"].includes(chosen) ? "p1" : undefined;
          result.performAction(chosen, target);
        }
      } else if (state.stage === "Challenge Window" && state.pendingChallengePlayers.includes("p0")) {
        // Human challenges or passes
        if (Math.random() < 0.2) {
          result.challengeAction();
        } else {
          result.passAction();
        }
      } else if (state.stage === "Block Window" && state.pendingBlockPlayers.includes("p0")) {
        // Human blocks or passes
        if (Math.random() < 0.3) {
          result.blockAction("Contessa");
        } else {
          result.passAction();
        }
      } else if (state.stage === "Block Challenge Window" && state.pendingChallengePlayers.includes("p0")) {
        if (Math.random() < 0.2) {
          result.challengeAction();
        } else {
          result.passAction();
        }
      } else if (state.stage === "Reveal Card Challenge" && state.challengeTargetId === "p0") {
        const card = state.players[0].cards[0];
        if (card) result.revealCard(card);
      } else if (state.stage === "Reveal Card Loss" && state.revealLossPlayerId === "p0") {
        const card = state.players[0].cards[0];
        if (card) result.revealCard(card);
      } else if (state.stage === "Exchange Selection" && state.activeAction?.playerId === "p0") {
        const cardsToKeep = [state.players[0].cards[0] || "Duke"];
        result.exchangeSelect(cardsToKeep);
      } else if (state.stage === "Shuffle Selection") {
        result.pickShuffledCard();
      } else {
        // Fallback progress if stuck
        timeouts.push(() => result.passAction());
      }
    }

    checkInvariants(state);
  }

  console.log(`Game ${gameId} finished in ${turns} turns. Stage: ${state.stage}. Winner: ${state.winnerName}`);
}

console.log("Starting client simulation suite...");
for (let i = 1; i <= 50; i++) {
  runSimulationGame(i);
}
console.log("All 50 simulation games passed successfully with zero invariant failures!");
