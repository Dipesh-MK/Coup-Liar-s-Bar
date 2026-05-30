"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mocks for React hooks
var state;
var deck = [];
// Track and run timeouts synchronously
var timeouts = [];
var mockSetTimeout = function (fn, delay) {
    timeouts.push(fn);
    return timeouts.length;
};
var mockClearTimeout = function () { };
// Mock React
var mockReact = {
    useState: function (initial) {
        // If it's the game state
        if (initial && "players" in initial) {
            state = initial;
            var setState = function (updater) {
                state = typeof updater === "function" ? updater(state) : updater;
            };
            return [state, setState];
        }
        // If it's the deck state
        var setDeck = function (updater) {
            deck = typeof updater === "function" ? updater(deck) : updater;
        };
        return [deck, setDeck];
    },
    useCallback: function (fn) { return fn; },
    useRef: function (initial) { return ({ current: initial }); },
    useEffect: function () { },
};
// Intercept react require in Node
var Module = require("module");
var originalRequire = Module.prototype.require;
Module.prototype.require = function (name) {
    if (name === "react") {
        return mockReact;
    }
    return originalRequire.apply(this, arguments);
};
// Mock browser objects
global.window = {
    AudioContext: function () {
        return {
            createOscillator: function () { return ({
                connect: function () { },
                start: function () { },
                stop: function () { },
                frequency: { setValueAtTime: function () { } },
            }); },
            createGain: function () { return ({
                connect: function () { },
                gain: { setValueAtTime: function () { }, exponentialRampToValueAtTime: function () { } },
            }); },
            destination: {},
            currentTime: 0,
        };
    },
};
global.setTimeout = mockSetTimeout;
global.clearTimeout = mockClearTimeout;
// Import the hook AFTER patching require
var useCoupState = require("./src/hooks/useCoupState").useCoupState;
// Invariants check
function checkInvariants(st) {
    if (!st || st.players.length === 0)
        return;
    // 1. Check card conservation (hand + revealed + community + public + discard = 15)
    var activeCount = st.players.reduce(function (sum, p) { return sum + p.cards.length; }, 0);
    var revealedCount = st.players.reduce(function (sum, p) { return sum + p.revealedCards.length; }, 0);
    var communityCount = st.piles.community.length;
    var publicCount = st.piles.public.length;
    var discardCount = st.piles.discard.length;
    if (st.communitySecret && st.communitySecret.length !== 3) {
        throw new Error("Community secret deck size violated! Got: ".concat(st.communitySecret.length, ", expected: 3"));
    }
    var total = activeCount + revealedCount + communityCount + publicCount + discardCount;
    if (total !== 15) {
        throw new Error("Card conservation violated! Total: ".concat(total, " (Active: ").concat(activeCount, ", Revealed: ").concat(revealedCount, ", Community: ").concat(communityCount, ", Public: ").concat(publicCount, ", Discard: ").concat(discardCount, ")"));
    }
    // 2. Coins must be non-negative
    for (var _i = 0, _a = st.players; _i < _a.length; _i++) {
        var p = _a[_i];
        if (p.coins < 0) {
            throw new Error("Player ".concat(p.name, " has negative coins: ").concat(p.coins));
        }
    }
    // 3. Current player index must be valid active player
    if (st.stage !== "Game Over" && st.currentPlayerIdx !== -1) {
        var cp = st.players[st.currentPlayerIdx];
        if (!cp.isActive) {
            throw new Error("Current player is inactive: ".concat(cp.name));
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
            throw new Error("Challenger cannot challenge themselves: ".concat(st.challengeTargetId));
        }
    }
    // 5. Validate Card Loss stage targets
    if (st.stage === "Reveal Card Loss") {
        if (!st.revealLossPlayerId) {
            throw new Error("Reveal Card Loss stage but revealLossPlayerId is null");
        }
        var victim = st.players.find(function (p) { return p.id === st.revealLossPlayerId; });
        if (!victim || !victim.isActive) {
            throw new Error("Reveal Card Loss target ".concat(st.revealLossPlayerId, " is invalid or inactive"));
        }
        if (st.revealLossReason === "failed_challenge") {
            if (st.revealLossPlayerId !== st.challengeChallengerId) {
                throw new Error("Failed challenge card loss attributed to wrong player: got ".concat(st.revealLossPlayerId, ", expected challenger ").concat(st.challengeChallengerId));
            }
        }
        else if (st.revealLossReason === "coup" || st.revealLossReason === "assassination") {
            var act = st.activeAction;
            if (!act) {
                throw new Error("Reveal Card Loss due to ".concat(st.revealLossReason, " but activeAction is null"));
            }
            if (st.revealLossPlayerId !== act.targetId) {
                throw new Error("Card loss due to ".concat(st.revealLossReason, " attributed to wrong target: got ").concat(st.revealLossPlayerId, ", expected target ").concat(act.targetId));
            }
        }
    }
}
// Helper to run all pending timeouts
function runPendingTimeouts() {
    var list = __spreadArray([], timeouts, true);
    timeouts.length = 0;
    for (var _i = 0, list_1 = list; _i < list_1.length; _i++) {
        var fn = list_1[_i];
        fn();
    }
}
// Simulate complete games
function runSimulationGame(gameId) {
    var _a;
    var result = useCoupState();
    // 1. Initialize
    result.initGame("Human", "Duke", 4, 3);
    checkInvariants(state);
    var turns = 0;
    var maxTurns = 500;
    var _loop_1 = function () {
        turns++;
        var prevStage = state.stage;
        var cpIdx = state.currentPlayerIdx;
        // Process any timeouts (e.g. AI actions, watchdog, animation delays)
        runPendingTimeouts();
        // If state didn't change and no timeouts, we need to inject client inputs
        if (state.stage === prevStage && state.currentPlayerIdx === cpIdx) {
            // It's the human's turn or human is prompted to act
            if (state.stage === "Action Selection" && state.currentPlayerIdx === 0) {
                // Human action selection
                var human_1 = state.players[0];
                if (human_1.coins >= 10) {
                    result.performAction("Coup", "p1");
                }
                else {
                    // Select randomly among valid actions
                    var actions = ["Income", "Foreign Aid", "Tax", "Exchange", "Steal", "Assassinate"];
                    var validActions = actions.filter(function (a) {
                        if (a === "Assassinate")
                            return human_1.coins >= 3;
                        if (a === "Coup")
                            return human_1.coins >= 7;
                        return true;
                    });
                    var chosen = validActions[Math.floor(Math.random() * validActions.length)];
                    var target = ["Steal", "Assassinate", "Coup"].includes(chosen) ? "p1" : undefined;
                    result.performAction(chosen, target);
                }
            }
            else if (state.stage === "Challenge Window" && state.pendingChallengePlayers.includes("p0")) {
                // Human challenges or passes
                if (Math.random() < 0.2) {
                    result.challengeAction();
                }
                else {
                    result.passAction();
                }
            }
            else if (state.stage === "Block Window" && state.pendingBlockPlayers.includes("p0")) {
                // Human blocks or passes
                if (Math.random() < 0.3) {
                    result.blockAction("Contessa");
                }
                else {
                    result.passAction();
                }
            }
            else if (state.stage === "Block Challenge Window" && state.pendingChallengePlayers.includes("p0")) {
                if (Math.random() < 0.2) {
                    result.challengeAction();
                }
                else {
                    result.passAction();
                }
            }
            else if (state.stage === "Reveal Card Challenge" && state.challengeTargetId === "p0") {
                var card = state.players[0].cards[0];
                if (card)
                    result.revealCard(card);
            }
            else if (state.stage === "Reveal Card Loss" && state.revealLossPlayerId === "p0") {
                var card = state.players[0].cards[0];
                if (card)
                    result.revealCard(card);
            }
            else if (state.stage === "Exchange Selection" && ((_a = state.activeAction) === null || _a === void 0 ? void 0 : _a.playerId) === "p0") {
                var cardsToKeep = [state.players[0].cards[0] || "Duke"];
                result.exchangeSelect(cardsToKeep);
            }
            else if (state.stage === "Shuffle Selection") {
                result.pickShuffledCard();
            }
            else {
                // Fallback progress if stuck
                timeouts.push(function () { return result.passAction(); });
            }
        }
        checkInvariants(state);
    };
    while (state.stage !== "Game Over" && turns < maxTurns) {
        _loop_1();
    }
    console.log("Game ".concat(gameId, " finished in ").concat(turns, " turns. Stage: ").concat(state.stage, ". Winner: ").concat(state.winnerName));
}
console.log("Starting client simulation suite...");
for (var i = 1; i <= 50; i++) {
    runSimulationGame(i);
}
console.log("All 50 simulation games passed successfully with zero invariant failures!");
