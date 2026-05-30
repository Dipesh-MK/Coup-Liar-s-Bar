"use client";
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
exports.useCoupState = useCoupState;
var react_1 = require("react");
var DECK_POOL = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
var BOT_NAMES = ["Lord Hazard", "Slippery Sam", "Lady Sparkles", "Honest Abe", "Picasso of Lies", "Sneaky Pete"];
var BOT_ROLES = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
// Web Audio sound effect for discards (Low 80Hz sine thud, 0.2s duration)
function playDiscardThud() {
    if (typeof window === "undefined")
        return;
    try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass)
            return;
        var ctx = new AudioContextClass();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }
    catch (err) {
        console.warn("AudioContext failed to start:", err);
    }
}
function useCoupState() {
    var _this = this;
    var _a = (0, react_1.useState)({
        players: [],
        currentPlayerIdx: -1,
        turnNumber: 0,
        stage: "Lobby",
        activeAction: null,
        activeBlock: null,
        pendingChallengePlayers: [],
        pendingBlockPlayers: [],
        challengeTargetId: null,
        challengeChallengerId: null,
        revealLossPlayerId: null,
        revealLossReason: null,
        provedCard: null,
        exchangeDrawnCards: [],
        winnerName: null,
        logs: ["Welcome to the smoky underground tavern. Choose your avatar and join."],
        cameraFocus: 0,
        animationEvent: null,
        lastDiscardedCard: null,
        piles: {
            community: ["HIDDEN", "HIDDEN", "HIDDEN"],
            public: [],
            discard: []
        },
        communitySecret: []
    }), state = _a[0], setState = _a[1];
    var _b = (0, react_1.useState)([]), deck = _b[0], setDeck = _b[1];
    var aiHonestyRef = (0, react_1.useRef)({});
    var turnTimerRef = (0, react_1.useRef)(null);
    var clearTurnWatchdog = (0, react_1.useCallback)(function () {
        if (turnTimerRef.current) {
            clearTimeout(turnTimerRef.current);
            turnTimerRef.current = null;
        }
    }, []);
    var startTurnWatchdog = (0, react_1.useCallback)(function (seatIndex) {
        clearTurnWatchdog();
        turnTimerRef.current = setTimeout(function () {
            setState(function (prev) {
                if (prev.stage !== "Action Selection" || prev.currentPlayerIdx !== seatIndex)
                    return prev;
                var player = prev.players[seatIndex];
                if (!player || !player.isActive || !player.isAI)
                    return prev;
                console.warn("Turn timeout for seat", seatIndex, "— forcing Income action");
                var act = { actionType: "Income", playerId: player.id };
                var id = Math.random().toString(36).substring(2, 9);
                var updatedPlayers = prev.players.map(function (p) {
                    if (p.id === player.id) {
                        return __assign(__assign({}, p), { coins: p.coins + 1 });
                    }
                    return p;
                });
                var nextIdx = (prev.currentPlayerIdx + 1) % updatedPlayers.length;
                while (!updatedPlayers[nextIdx].isActive) {
                    nextIdx = (nextIdx + 1) % updatedPlayers.length;
                }
                return __assign(__assign({}, prev), { players: updatedPlayers, currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, stage: "Action Selection", activeAction: null, activeBlock: null, challengeTargetId: null, challengeChallengerId: null, revealLossPlayerId: null, revealLossReason: null, cameraFocus: nextIdx, logs: __spreadArray(__spreadArray([], prev.logs, true), ["[WATCHDOG] ".concat(player.name, " timed out! Forced Income."), "It is ".concat(updatedPlayers[nextIdx].name, "'s turn.")], false).slice(-40), animationEvent: { id: id, type: "income", actorId: player.id } });
            });
        }, 15000);
    }, [clearTurnWatchdog]);
    (0, react_1.useEffect)(function () {
        if (state.stage === "Action Selection" && state.currentPlayerIdx !== -1) {
            startTurnWatchdog(state.currentPlayerIdx);
        }
        else {
            clearTurnWatchdog();
        }
        return function () {
            clearTurnWatchdog();
        };
    }, [state.stage, state.currentPlayerIdx, state.turnNumber, startTurnWatchdog, clearTurnWatchdog]);
    // Local helper to add a log entry
    var addLog = (0, react_1.useCallback)(function (text) {
        setState(function (prev) { return (__assign(__assign({}, prev), { logs: __spreadArray(__spreadArray([], prev.logs, true), [text], false).slice(-40) })); });
    }, []);
    // Helper to trigger a 3D animation event
    var triggerAnimation = (0, react_1.useCallback)(function (type, actorId, targetId, detail) {
        var id = Math.random().toString(36).substring(2, 9);
        setState(function (prev) { return (__assign(__assign({}, prev), { animationEvent: { id: id, type: type, actorId: actorId, targetId: targetId, detail: detail } })); });
    }, []);
    // Get seat index for a player ID
    var getSeatIdx = (0, react_1.useCallback)(function (playerId, players) {
        return players.findIndex(function (p) { return p.id === playerId; });
    }, []);
    // Get victory winner if only one active player remains
    var getWinner = (0, react_1.useCallback)(function (players) {
        var active = players.filter(function (p) { return p.isActive; });
        return active.length === 1 ? active[0] : null;
    }, []);
    var advanceTurn = (0, react_1.useCallback)(function () {
        setState(function (prev) {
            if (prev.stage === "Game Over" || prev.players.length === 0)
                return prev;
            var nextIdx = (prev.currentPlayerIdx + 1) % prev.players.length;
            while (!prev.players[nextIdx].isActive) {
                nextIdx = (nextIdx + 1) % prev.players.length;
            }
            return __assign(__assign({}, prev), { currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, stage: "Action Selection", activeAction: null, activeBlock: null, challengeTargetId: null, challengeChallengerId: null, revealLossPlayerId: null, revealLossReason: null, cameraFocus: nextIdx, logs: __spreadArray(__spreadArray([], prev.logs, true), ["It is ".concat(prev.players[nextIdx].name, "'s turn.")], false).slice(-40) });
        });
    }, []);
    // Execute an action immediately
    var executeAction = (0, react_1.useCallback)(function (act) {
        setState(function (prev) {
            if (!prev.activeAction ||
                prev.activeAction.resolved ||
                prev.activeAction.actionType !== act.actionType ||
                prev.activeAction.playerId !== act.playerId ||
                prev.activeAction.targetId !== act.targetId) {
                return prev;
            }
            var actor = prev.players.find(function (p) { return p.id === act.playerId; });
            if (!actor || !actor.isActive)
                return prev;
            var updatedPlayers = prev.players.map(function (p) { return (__assign(__assign({}, p), { cards: __spreadArray([], p.cards, true), revealedCards: __spreadArray([], p.revealedCards, true) })); });
            var actorClone = updatedPlayers.find(function (p) { return p.id === act.playerId; });
            var targetClone = act.targetId ? updatedPlayers.find(function (p) { return p.id === act.targetId; }) : null;
            var newLogs = __spreadArray([], prev.logs, true);
            var animId = Math.random().toString(36).substring(2, 9);
            var animType = null;
            var animTargetId = undefined;
            var nextStage = "Action Selection";
            var nextPlayerIdx = prev.currentPlayerIdx;
            var revealLossPlayerId = null;
            var revealLossReason = null;
            var exchangeDrawnCards = prev.exchangeDrawnCards;
            var cameraFocus = prev.cameraFocus;
            if (act.actionType === "Income") {
                actorClone.coins += 1;
                newLogs.push("".concat(actorClone.name, " gains 1 coin from Income."));
                animType = "income";
            }
            else if (act.actionType === "Foreign Aid") {
                actorClone.coins += 2;
                newLogs.push("".concat(actorClone.name, " gains 2 coins from Foreign Aid."));
                animType = "foreign_aid";
            }
            else if (act.actionType === "Tax") {
                actorClone.coins += 3;
                newLogs.push("".concat(actorClone.name, " takes 3 coins (Tax) using the Duke."));
                animType = "tax";
            }
            else if (act.actionType === "Steal") {
                if (targetClone && targetClone.isActive) {
                    var stolen = Math.min(targetClone.coins, 2);
                    targetClone.coins -= stolen;
                    actorClone.coins += stolen;
                    newLogs.push("".concat(actorClone.name, " steals ").concat(stolen, " coins from ").concat(targetClone.name, "."));
                    animType = "steal";
                    animTargetId = targetClone.id;
                }
            }
            else if (act.actionType === "Assassinate") {
                if (targetClone && targetClone.isActive) {
                    newLogs.push("".concat(actorClone.name, " successfully assassinates ").concat(targetClone.name, "!"));
                    animType = "assassinate";
                    animTargetId = targetClone.id;
                    nextStage = "Reveal Card Loss";
                    revealLossPlayerId = targetClone.id;
                    revealLossReason = "assassination";
                    nextPlayerIdx = updatedPlayers.findIndex(function (p) { return p.id === targetClone.id; });
                    cameraFocus = nextPlayerIdx;
                }
            }
            else if (act.actionType === "Coup") {
                actorClone.coins -= 7;
                if (targetClone && targetClone.isActive) {
                    newLogs.push("".concat(actorClone.name, " performs a Coup on ").concat(targetClone.name, "!"));
                    animType = "coup";
                    animTargetId = targetClone.id;
                    nextStage = "Reveal Card Loss";
                    revealLossPlayerId = targetClone.id;
                    revealLossReason = "coup";
                    nextPlayerIdx = updatedPlayers.findIndex(function (p) { return p.id === targetClone.id; });
                    cameraFocus = nextPlayerIdx;
                }
            }
            else if (act.actionType === "Exchange") {
                var comm = prev.communitySecret;
                var drawn = [comm[0], comm[1]];
                newLogs.push("".concat(actorClone.name, " draws 2 cards from the community pile for Exchange."));
                nextStage = "Exchange Selection";
                exchangeDrawnCards = drawn;
                nextPlayerIdx = updatedPlayers.findIndex(function (p) { return p.id === actorClone.id; });
                cameraFocus = nextPlayerIdx;
            }
            // If we don't transition to Reveal Card Loss or Exchange Selection, advance the turn
            var nextTurnIdx = prev.currentPlayerIdx;
            if (nextStage === "Action Selection") {
                nextTurnIdx = (prev.currentPlayerIdx + 1) % updatedPlayers.length;
                while (!updatedPlayers[nextTurnIdx].isActive) {
                    nextTurnIdx = (nextTurnIdx + 1) % updatedPlayers.length;
                }
                newLogs.push("It is ".concat(updatedPlayers[nextTurnIdx].name, "'s turn."));
                cameraFocus = nextTurnIdx;
            }
            var winner = getWinner(updatedPlayers);
            var isGameOver = winner !== null;
            return __assign(__assign({}, prev), { players: updatedPlayers, stage: isGameOver ? "Game Over" : nextStage, currentPlayerIdx: isGameOver ? prev.currentPlayerIdx : (nextStage === "Action Selection" ? nextTurnIdx : nextPlayerIdx), turnNumber: nextStage === "Action Selection" ? prev.turnNumber + 1 : prev.turnNumber, activeAction: nextStage === "Exchange Selection" ? __assign(__assign({}, act), { resolved: true }) : null, activeBlock: null, challengeTargetId: null, challengeChallengerId: null, revealLossPlayerId: isGameOver ? null : revealLossPlayerId, revealLossReason: isGameOver ? null : revealLossReason, winnerName: isGameOver ? winner.name : prev.winnerName, exchangeDrawnCards: isGameOver ? [] : exchangeDrawnCards, cameraFocus: isGameOver ? prev.currentPlayerIdx : cameraFocus, logs: newLogs.slice(-40), animationEvent: animType ? { id: animId, type: animType, actorId: actorClone.id, targetId: animTargetId } : prev.animationEvent });
        });
    }, [getWinner]);
    // Initialize the game
    var initGame = (0, react_1.useCallback)(function (playerName, playerAvatar, lobbySize, aiOpponents, customization) {
        var _a;
        if (lobbySize === void 0) { lobbySize = 4; }
        if (aiOpponents === void 0) { aiOpponents = 3; }
        addLog("Creating lobby with size ".concat(lobbySize, "..."));
        // Create deck (15 cards)
        var freshDeck = [];
        for (var i = 0; i < 3; i++) {
            freshDeck.push.apply(freshDeck, DECK_POOL);
        }
        // Fisher-Yates shuffle
        for (var i = freshDeck.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            _a = [freshDeck[j], freshDeck[i]], freshDeck[i] = _a[0], freshDeck[j] = _a[1];
        }
        var dealCard = function () { return freshDeck.pop(); };
        // Create Human Player
        var human = {
            id: "p0",
            name: playerName || "You",
            avatar: playerAvatar,
            coins: 2,
            cards: [dealCard(), dealCard()],
            revealedCards: [],
            isActive: true,
            isAI: false,
            bodyColor: (customization === null || customization === void 0 ? void 0 : customization.bodyColor) || "#4a148c",
            animal: (customization === null || customization === void 0 ? void 0 : customization.animal) || "Bear",
            bodyType: (customization === null || customization === void 0 ? void 0 : customization.bodyType) || "CHUNKY",
            eyeStyle: (customization === null || customization === void 0 ? void 0 : customization.eyeStyle) || "Normal",
            accessories: (customization === null || customization === void 0 ? void 0 : customization.accessories) || { topHat: false, monocle: false, bowTie: false, scarf: false, vest: false },
        };
        // Create AI Players
        var bots = [];
        var availableNames = __spreadArray([], BOT_NAMES, true).sort(function () { return Math.random() - 0.5; });
        var availableRoles = __spreadArray([], BOT_ROLES, true).sort(function () { return Math.random() - 0.5; });
        var botAnimals = ["Bear", "Rabbit", "Cat", "Fox", "Wolf", "Frog", "Raccoon", "Duck", "Goat", "Panda"];
        var botBodyTypes = ["CHUNKY", "SKINNY", "MUSCULAR", "TINY", "PEAR"];
        var botColors = ["#8e0000", "#0a192f", "#0f5132", "#4a148c", "#e65100", "#111111", "#d7ccc8", "#004d40"];
        var botEyes = ["Normal", "Derpy", "Angry", "Sleepy"];
        for (var i = 0; i < Math.min(aiOpponents, lobbySize - 1); i++) {
            var botId = "p".concat(i + 1);
            var randomAnimal = botAnimals[Math.floor(Math.random() * botAnimals.length)];
            var randomBodyType = botBodyTypes[Math.floor(Math.random() * botBodyTypes.length)];
            var randomColor = botColors[Math.floor(Math.random() * botColors.length)];
            var randomEye = botEyes[Math.floor(Math.random() * botEyes.length)];
            var accList = ["topHat", "monocle", "bowTie", "scarf", "vest"];
            var chosenAcc = Math.random() < 0.5 ? accList[Math.floor(Math.random() * accList.length)] : null;
            var accessories = {
                topHat: chosenAcc === "topHat",
                monocle: chosenAcc === "monocle",
                bowTie: chosenAcc === "bowTie",
                scarf: chosenAcc === "scarf",
                vest: chosenAcc === "vest",
            };
            aiHonestyRef.current[botId] = Math.random() > 0.4;
            bots.push({
                id: botId,
                name: availableNames[i % availableNames.length],
                avatar: availableRoles[i % availableRoles.length],
                coins: 2,
                cards: [dealCard(), dealCard()],
                revealedCards: [],
                isActive: true,
                isAI: true,
                bodyColor: randomColor,
                animal: randomAnimal,
                bodyType: randomBodyType,
                eyeStyle: randomEye,
                accessories: accessories,
            });
        }
        var allPlayers = __spreadArray([human], bots, true);
        // Deal Community Pile (3 cards)
        var communityCards = [dealCard(), dealCard(), dealCard()];
        // Remaining cards go to Public Pile
        var publicCards = [];
        while (freshDeck.length > 0) {
            publicCards.push(freshDeck.pop());
        }
        // Economy checks
        var totalCount = allPlayers.length * 2 + 3 + publicCards.length;
        console.log("Public:", publicCards);
        console.log("Community:", ["HIDDEN", "HIDDEN", "HIDDEN"]);
        console.log("Total:", totalCount);
        if (totalCount !== 15)
            throw new Error("Card dealing error: deck count mismatch.");
        setDeck(freshDeck);
        setState({
            players: allPlayers,
            currentPlayerIdx: 0,
            turnNumber: 1,
            stage: "Action Selection",
            activeAction: null,
            activeBlock: null,
            pendingChallengePlayers: [],
            pendingBlockPlayers: [],
            challengeTargetId: null,
            challengeChallengerId: null,
            revealLossPlayerId: null,
            revealLossReason: null,
            provedCard: null,
            exchangeDrawnCards: [],
            winnerName: null,
            logs: ["The cards are dealt. The spotlight is on.", "It is ".concat(human.name, "'s turn.")],
            cameraFocus: 0,
            animationEvent: null,
            lastDiscardedCard: null,
            piles: {
                community: ["HIDDEN", "HIDDEN", "HIDDEN"],
                public: publicCards,
                discard: []
            },
            communitySecret: communityCards
        });
    }, []);
    // Handle client action request
    var performAction = (0, react_1.useCallback)(function (actionType, targetId) {
        setState(function (prev) {
            // Guard: must be in Action Selection stage, it must be the human's turn,
            // and there must be no active action currently pending (prevents double-clicks/double-moves).
            if (prev.stage !== "Action Selection" || prev.currentPlayerIdx !== 0 || prev.activeAction !== null) {
                return prev;
            }
            var actor = prev.players.find(function (p) { return p.id === "p0"; });
            if (actionType === "Assassinate" && actor.coins < 3)
                return prev;
            if (actionType === "Coup" && actor.coins < 7)
                return prev;
            var updatedPlayers = prev.players.map(function (p) {
                if (p.id === "p0") {
                    var coins = p.coins;
                    if (actionType === "Assassinate")
                        coins -= 3;
                    return __assign(__assign({}, p), { coins: coins });
                }
                return p;
            });
            var act = { actionType: actionType, playerId: "p0", targetId: targetId };
            var otherPlayers = updatedPlayers.filter(function (p) { return p.isActive && p.id !== "p0"; }).map(function (p) { return p.id; });
            var targetPlayer = targetId ? prev.players.find(function (p) { return p.id === targetId; }) : null;
            var logMessage = "";
            if (actionType === "Income") {
                logMessage = "You take Income (+1 coin).";
                setTimeout(function () { return executeAction(act); }, 800);
                return __assign(__assign({}, prev), { players: updatedPlayers, activeAction: act, logs: __spreadArray(__spreadArray([], prev.logs, true), [logMessage], false).slice(-40) });
            }
            if (actionType === "Coup") {
                logMessage = "[COUP] You perform a COUP on ".concat(targetPlayer === null || targetPlayer === void 0 ? void 0 : targetPlayer.name, "!");
                setTimeout(function () { return executeAction(act); }, 800);
                return __assign(__assign({}, prev), { players: updatedPlayers, activeAction: act, logs: __spreadArray(__spreadArray([], prev.logs, true), [logMessage], false).slice(-40) });
            }
            if (actionType === "Foreign Aid") {
                logMessage = "You claim Foreign Aid (+2 coins).";
                return __assign(__assign({}, prev), { players: updatedPlayers, stage: "Block Window", activeAction: act, pendingBlockPlayers: otherPlayers, cameraFocus: 0, logs: __spreadArray(__spreadArray([], prev.logs, true), [logMessage], false).slice(-40) });
            }
            if (actionType === "Tax") {
                logMessage = "You claim TAX (+3 coins) using the Duke.";
            }
            else if (actionType === "Steal") {
                logMessage = "You attempt to STEAL from ".concat(targetPlayer === null || targetPlayer === void 0 ? void 0 : targetPlayer.name, " (Captain).");
            }
            else if (actionType === "Assassinate") {
                logMessage = "You attempt to ASSASSINATE ".concat(targetPlayer === null || targetPlayer === void 0 ? void 0 : targetPlayer.name, " (Assassin).");
            }
            else if (actionType === "Exchange") {
                logMessage = "You claim EXCHANGE (Ambassador).";
            }
            return __assign(__assign({}, prev), { players: updatedPlayers, stage: "Challenge Window", activeAction: act, pendingChallengePlayers: otherPlayers, cameraFocus: 0, logs: __spreadArray(__spreadArray([], prev.logs, true), [logMessage], false).slice(-40) });
        });
    }, [executeAction]);
    // Handle passing
    var passAction = (0, react_1.useCallback)(function (playerId) {
        setState(function (prev) {
            var _a, _b, _c;
            if (!prev.activeAction)
                return prev;
            var activeStage = prev.stage;
            // Double-pass guard: verify player is in the correct pending list
            if (activeStage === "Challenge Window" || activeStage === "Block Challenge Window") {
                if (!prev.pendingChallengePlayers.includes(playerId)) {
                    return prev;
                }
            }
            else if (activeStage === "Block Window") {
                if (!prev.pendingBlockPlayers.includes(playerId)) {
                    return prev;
                }
            }
            else {
                return prev;
            }
            var nextPendingChallenge = prev.pendingChallengePlayers.filter(function (id) { return id !== playerId; });
            var nextPendingBlock = prev.pendingBlockPlayers.filter(function (id) { return id !== playerId; });
            var newLogs = __spreadArray([], prev.logs, true);
            if (activeStage === "Challenge Window") {
                if (nextPendingChallenge.length === 0) {
                    var act_1 = prev.activeAction;
                    var targetId_1 = act_1.targetId;
                    if (act_1.actionType === "Foreign Aid") {
                        var activeOthers = prev.players.filter(function (p) { return p.isActive && p.id !== act_1.playerId; }).map(function (p) { return p.id; });
                        newLogs.push("No one challenged ".concat((_a = prev.players.find(function (p) { return p.id === act_1.playerId; })) === null || _a === void 0 ? void 0 : _a.name, ". Waiting for blocks..."));
                        return __assign(__assign({}, prev), { stage: "Block Window", pendingBlockPlayers: activeOthers, pendingChallengePlayers: [], logs: newLogs.slice(-40) });
                    }
                    else if (["Steal", "Assassinate"].includes(act_1.actionType)) {
                        if (targetId_1) {
                            newLogs.push("No one challenged. Waiting for ".concat((_b = prev.players.find(function (p) { return p.id === targetId_1; })) === null || _b === void 0 ? void 0 : _b.name, " to block..."));
                            return __assign(__assign({}, prev), { stage: "Block Window", pendingBlockPlayers: [targetId_1], pendingChallengePlayers: [], cameraFocus: getSeatIdx(targetId_1, prev.players), logs: newLogs.slice(-40) });
                        }
                    }
                    newLogs.push("Action proceeds to execution.");
                    setTimeout(function () { return executeAction(act_1); }, 500);
                    return __assign(__assign({}, prev), { stage: "Action Selection", pendingChallengePlayers: [], logs: newLogs.slice(-40) });
                }
                return __assign(__assign({}, prev), { pendingChallengePlayers: nextPendingChallenge });
            }
            if (activeStage === "Block Window") {
                if (nextPendingBlock.length === 0) {
                    var act_2 = prev.activeAction;
                    newLogs.push("No blocks declared. Action succeeds.");
                    setTimeout(function () { return executeAction(act_2); }, 500);
                    return __assign(__assign({}, prev), { stage: "Action Selection", pendingBlockPlayers: [], logs: newLogs.slice(-40) });
                }
                return __assign(__assign({}, prev), { pendingBlockPlayers: nextPendingBlock });
            }
            if (activeStage === "Block Challenge Window") {
                if (nextPendingChallenge.length === 0) {
                    var blockActorId_1 = prev.activeBlock.playerId;
                    newLogs.push("Block by ".concat((_c = prev.players.find(function (p) { return p.id === blockActorId_1; })) === null || _c === void 0 ? void 0 : _c.name, " succeeds. Action is blocked."));
                    var animId = Math.random().toString(36).substring(2, 9);
                    var updatedPlayers = prev.players.map(function (p) { return (__assign({}, p)); });
                    var nextIdx = (prev.currentPlayerIdx + 1) % updatedPlayers.length;
                    while (!updatedPlayers[nextIdx].isActive) {
                        nextIdx = (nextIdx + 1) % updatedPlayers.length;
                    }
                    newLogs.push("It is ".concat(updatedPlayers[nextIdx].name, "'s turn."));
                    return __assign(__assign({}, prev), { stage: "Action Selection", currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, pendingChallengePlayers: [], activeAction: null, activeBlock: null, cameraFocus: nextIdx, logs: newLogs.slice(-40), animationEvent: { id: animId, type: "block_shield", actorId: blockActorId_1 } });
                }
                return __assign(__assign({}, prev), { pendingChallengePlayers: nextPendingChallenge });
            }
            return prev;
        });
    }, [executeAction, getSeatIdx]);
    // Handle challenge declaration
    var challengeAction = (0, react_1.useCallback)(function (challengerId) {
        setState(function (prev) {
            var activeStage = prev.stage;
            // Guard: challenger must be in pendingChallengePlayers
            if (!prev.pendingChallengePlayers.includes(challengerId)) {
                return prev;
            }
            var challenger = prev.players.find(function (p) { return p.id === challengerId; });
            var accusedId = "";
            var claimedCharacter = "Duke";
            if (activeStage === "Challenge Window") {
                accusedId = prev.activeAction.playerId;
                var actType = prev.activeAction.actionType;
                if (actType === "Foreign Aid" || actType === "Income" || actType === "Coup") {
                    return prev;
                }
                if (actType === "Tax")
                    claimedCharacter = "Duke";
                else if (actType === "Steal")
                    claimedCharacter = "Captain";
                else if (actType === "Assassinate")
                    claimedCharacter = "Assassin";
                else if (actType === "Exchange")
                    claimedCharacter = "Ambassador";
            }
            else if (activeStage === "Block Challenge Window") {
                accusedId = prev.activeBlock.playerId;
                claimedCharacter = prev.activeBlock.character;
            }
            else {
                return prev;
            }
            var accused = prev.players.find(function (p) { return p.id === accusedId; });
            var newLogs = __spreadArray([], prev.logs, true);
            newLogs.push("\u2694\uFE0F ".concat(challenger.name, " CHALLENGES ").concat(accused.name, "'s claim of ").concat(claimedCharacter, "!"));
            return __assign(__assign({}, prev), { stage: "Reveal Card Challenge", challengeTargetId: accused.id, challengeChallengerId: challenger.id, cameraFocus: getSeatIdx(accused.id, prev.players), logs: newLogs.slice(-40) });
        });
    }, [getSeatIdx]);
    // Handle block declaration
    var blockAction = (0, react_1.useCallback)(function (blockerId, character) {
        setState(function (prev) {
            var _a, _b;
            // Guard: blocker must be in pendingBlockPlayers
            if (!prev.pendingBlockPlayers.includes(blockerId)) {
                return prev;
            }
            var blocker = prev.players.find(function (p) { return p.id === blockerId; });
            var actorName = ((_a = prev.players.find(function (p) { var _a; return p.id === ((_a = prev.activeAction) === null || _a === void 0 ? void 0 : _a.playerId); })) === null || _a === void 0 ? void 0 : _a.name) || "Player";
            var newLogs = __spreadArray([], prev.logs, true);
            newLogs.push("\uD83D\uDEE1\uFE0F ".concat(blocker.name, " claims ").concat(character, " to block ").concat(actorName, "'s ").concat((_b = prev.activeAction) === null || _b === void 0 ? void 0 : _b.actionType, " action."));
            var activeOthers = prev.players.filter(function (p) { return p.isActive && p.id !== blockerId; }).map(function (p) { return p.id; });
            return __assign(__assign({}, prev), { stage: "Block Challenge Window", activeBlock: { playerId: blockerId, character: character }, pendingChallengePlayers: activeOthers, cameraFocus: getSeatIdx(blockerId, prev.players), logs: newLogs.slice(-40) });
        });
    }, [getSeatIdx]);
    // Handle card reveal (discard and Web Audio integration)
    var revealCard = (0, react_1.useCallback)(function (revealerId, card) {
        setState(function (prev) {
            var _a;
            if (prev.stage !== "Reveal Card Challenge" && prev.stage !== "Reveal Card Loss") {
                return prev;
            }
            if (prev.stage === "Reveal Card Challenge" && prev.challengeTargetId !== revealerId) {
                return prev;
            }
            if (prev.stage === "Reveal Card Loss" && prev.revealLossPlayerId !== revealerId) {
                return prev;
            }
            playDiscardThud();
            var currentPlayers = prev.players.map(function (p) { return (__assign(__assign({}, p), { cards: __spreadArray([], p.cards, true), revealedCards: __spreadArray([], p.revealedCards, true) })); });
            var actor = currentPlayers.find(function (p) { return p.id === revealerId; });
            var idx = actor.cards.indexOf(card);
            if (idx === -1)
                return prev;
            var updatedDiscard = __spreadArray(__spreadArray([], prev.piles.discard, true), [card], false);
            var newLogs = __spreadArray([], prev.logs, true);
            if (prev.stage === "Reveal Card Challenge") {
                var isBlockChallenge = prev.activeBlock !== null;
                var claimedCharacter = "Duke";
                var challengerId_1 = prev.challengeChallengerId || "p0";
                if (isBlockChallenge) {
                    claimedCharacter = prev.activeBlock.character;
                }
                else {
                    var actType = prev.activeAction.actionType;
                    if (actType === "Tax")
                        claimedCharacter = "Duke";
                    else if (actType === "Steal")
                        claimedCharacter = "Captain";
                    else if (actType === "Assassinate")
                        claimedCharacter = "Assassin";
                    else if (actType === "Exchange")
                        claimedCharacter = "Ambassador";
                }
                var challenger = currentPlayers.find(function (p) { return p.id === challengerId_1; });
                if (card === claimedCharacter) {
                    newLogs.push("[REVEAL MATCHES] ".concat(actor.name, " was telling the truth. ").concat(challenger.name, " loses the challenge."));
                    actor.cards.splice(idx, 1);
                    var animId = Math.random().toString(36).substring(2, 9);
                    if (actor.id === "p0") {
                        return __assign(__assign({}, prev), { players: currentPlayers, stage: "Shuffle Selection", provedCard: card, challengeChallengerId: challenger.id, revealLossPlayerId: challenger.id, revealLossReason: "failed_challenge", cameraFocus: 0, logs: newLogs.slice(-40), animationEvent: { id: animId, type: "challenge_reveal", actorId: actor.id, detail: card } });
                    }
                    var comm = __spreadArray([], prev.communitySecret, true);
                    comm.push(card);
                    comm.sort(function () { return Math.random() - 0.5; });
                    actor.cards.push(comm.pop());
                    return __assign(__assign({}, prev), { players: currentPlayers, communitySecret: comm, stage: "Reveal Card Loss", revealLossPlayerId: challenger.id, revealLossReason: "failed_challenge", challengeChallengerId: challenger.id, cameraFocus: getSeatIdx(challenger.id, currentPlayers), logs: newLogs.slice(-40), animationEvent: { id: animId, type: "challenge_reveal", actorId: actor.id, detail: card } });
                }
                else {
                    newLogs.push("[BLUFF CALLED] ".concat(actor.name, " lied about having a ").concat(claimedCharacter, "."));
                    actor.cards.splice(idx, 1);
                    actor.revealedCards.push(card);
                    if (!isBlockChallenge && ((_a = prev.activeAction) === null || _a === void 0 ? void 0 : _a.actionType) === "Assassinate") {
                        actor.coins += 3;
                        newLogs.push("\uD83D\uDCB0 ".concat(actor.name, " gets back 3 coins since their Assassinate action was successfully challenged."));
                    }
                    if (actor.cards.length === 0) {
                        actor.isActive = false;
                        newLogs.push("[ELIMINATED] ".concat(actor.name, " is ELIMINATED!"));
                    }
                    var winner = getWinner(currentPlayers);
                    var isGameOver = winner !== null;
                    var animId = Math.random().toString(36).substring(2, 9);
                    if (isGameOver) {
                        newLogs.push("[VICTORY] Game over! ".concat(winner.name, " wins the match!"));
                        return __assign(__assign({}, prev), { players: currentPlayers, stage: "Game Over", winnerName: winner.name, cameraFocus: getSeatIdx(winner.id, currentPlayers), lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                    }
                    if (isBlockChallenge) {
                        var act_3 = prev.activeAction;
                        setTimeout(function () { return executeAction(act_3); }, 1200);
                        return __assign(__assign({}, prev), { players: currentPlayers, stage: "Action Selection", lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                    }
                    else {
                        var nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
                        while (!currentPlayers[nextIdx].isActive) {
                            nextIdx = (nextIdx + 1) % currentPlayers.length;
                        }
                        newLogs.push("It is ".concat(currentPlayers[nextIdx].name, "'s turn."));
                        return __assign(__assign({}, prev), { players: currentPlayers, stage: "Action Selection", currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, activeAction: null, activeBlock: null, cameraFocus: nextIdx, lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                    }
                }
            }
            if (prev.stage === "Reveal Card Loss") {
                actor.cards.splice(idx, 1);
                actor.revealedCards.push(card);
                newLogs.push("".concat(actor.name, " discards ").concat(card, " as lost influence."));
                if (actor.cards.length === 0) {
                    actor.isActive = false;
                    newLogs.push("[ELIMINATED] ".concat(actor.name, " is ELIMINATED!"));
                }
                var winner = getWinner(currentPlayers);
                var isGameOver = winner !== null;
                var animId = Math.random().toString(36).substring(2, 9);
                if (isGameOver) {
                    newLogs.push("[VICTORY] Game over! ".concat(winner.name, " wins the match!"));
                    return __assign(__assign({}, prev), { players: currentPlayers, stage: "Game Over", winnerName: winner.name, cameraFocus: getSeatIdx(winner.id, currentPlayers), lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                }
                var reason = prev.revealLossReason;
                if (reason === "failed_challenge") {
                    var isBlockChallenge = prev.activeBlock !== null;
                    if (isBlockChallenge) {
                        var nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
                        while (!currentPlayers[nextIdx].isActive) {
                            nextIdx = (nextIdx + 1) % currentPlayers.length;
                        }
                        newLogs.push("It is ".concat(currentPlayers[nextIdx].name, "'s turn."));
                        return __assign(__assign({}, prev), { players: currentPlayers, stage: "Action Selection", currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, activeAction: null, activeBlock: null, cameraFocus: nextIdx, lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                    }
                    else {
                        var action_1 = prev.activeAction;
                        var targetId = action_1.targetId;
                        var challengerId = prev.challengeChallengerId;
                        if (targetId && challengerId === targetId) {
                            setTimeout(function () { return executeAction(action_1); }, 1200);
                            return __assign(__assign({}, prev), { players: currentPlayers, stage: "Action Selection", lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                        }
                        else {
                            if (targetId && ["Steal", "Assassinate"].includes(action_1.actionType)) {
                                return __assign(__assign({}, prev), { players: currentPlayers, stage: "Block Window", pendingBlockPlayers: [targetId], cameraFocus: getSeatIdx(targetId, currentPlayers), lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                            }
                            else {
                                setTimeout(function () { return executeAction(action_1); }, 1200);
                                return __assign(__assign({}, prev), { players: currentPlayers, stage: "Action Selection", lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                            }
                        }
                    }
                }
                else {
                    var nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
                    while (!currentPlayers[nextIdx].isActive) {
                        nextIdx = (nextIdx + 1) % currentPlayers.length;
                    }
                    newLogs.push("It is ".concat(currentPlayers[nextIdx].name, "'s turn."));
                    return __assign(__assign({}, prev), { players: currentPlayers, stage: "Action Selection", currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, activeAction: null, activeBlock: null, cameraFocus: nextIdx, lastDiscardedCard: card, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { discard: updatedDiscard }), animationEvent: { id: animId, type: "slump", actorId: actor.id } });
                }
            }
            return prev;
        });
    }, [executeAction, getSeatIdx, getWinner]);
    // Handle exchange keeps selection
    var exchangeSelect = (0, react_1.useCallback)(function (keep) {
        setState(function (prev) {
            if (!prev.activeAction)
                return prev;
            var actor = prev.players.find(function (p) { return p.id === prev.activeAction.playerId; });
            var drawn = prev.exchangeDrawnCards;
            var hand = actor.cards;
            var pool = __spreadArray(__spreadArray([], hand, true), drawn, true);
            var keepCounts = {};
            keep.forEach(function (c) { return keepCounts[c] = (keepCounts[c] || 0) + 1; });
            var returned = [];
            var tempPool = __spreadArray([], pool, true);
            tempPool.forEach(function (c) {
                if (keepCounts[c] && keepCounts[c] > 0) {
                    keepCounts[c]--;
                }
                else {
                    returned.push(c);
                }
            });
            var comm = __spreadArray([], prev.communitySecret, true);
            drawn.forEach(function (c) {
                var idx = comm.indexOf(c);
                if (idx !== -1)
                    comm.splice(idx, 1);
            });
            comm.push.apply(comm, returned);
            comm.sort(function () { return Math.random() - 0.5; });
            var currentPlayers = prev.players.map(function (p) {
                if (p.id === actor.id) {
                    return __assign(__assign({}, p), { cards: keep });
                }
                return p;
            });
            var newLogs = __spreadArray([], prev.logs, true);
            newLogs.push("".concat(actor.name, " completed the Exchange."));
            var nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
            while (!currentPlayers[nextIdx].isActive) {
                nextIdx = (nextIdx + 1) % currentPlayers.length;
            }
            newLogs.push("It is ".concat(currentPlayers[nextIdx].name, "'s turn."));
            return __assign(__assign({}, prev), { players: currentPlayers, communitySecret: comm, stage: "Action Selection", currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, activeAction: null, activeBlock: null, exchangeDrawnCards: [], cameraFocus: nextIdx, logs: newLogs.slice(-40), piles: __assign(__assign({}, prev.piles), { community: prev.piles.community[0] === "HIDDEN" ? ["HIDDEN", "HIDDEN", "HIDDEN"] : comm }) });
        });
    }, []);
    // Kick a player from the game
    var kickPlayer = (0, react_1.useCallback)(function (playerId) {
        setState(function (prev) {
            var _a, _b;
            if (playerId === "p0")
                return prev;
            var target = prev.players.find(function (p) { return p.id === playerId; });
            if (!target || !target.isActive)
                return prev;
            var newLogs = __spreadArray([], prev.logs, true);
            newLogs.push("[HOST KICK] Host kicked ".concat(target.name, " from the game."));
            var currentPlayers = prev.players.map(function (p) {
                if (p.id === playerId) {
                    return __assign(__assign({}, p), { isActive: false, cards: [] });
                }
                return p;
            });
            var active = currentPlayers.filter(function (p) { return p.isActive; });
            var isGameOver = active.length === 1;
            if (isGameOver) {
                newLogs.push("[VICTORY] Game over! ".concat(active[0].name, " wins the match!"));
            }
            var nextIdx = prev.currentPlayerIdx;
            if (((_a = prev.players[prev.currentPlayerIdx]) === null || _a === void 0 ? void 0 : _a.id) === playerId) {
                nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
                while (!currentPlayers[nextIdx].isActive) {
                    nextIdx = (nextIdx + 1) % currentPlayers.length;
                }
                newLogs.push("It is now ".concat(currentPlayers[nextIdx].name, "'s turn."));
            }
            var pendingChallenge = prev.pendingChallengePlayers.filter(function (id) { return id !== playerId; });
            var pendingBlock = prev.pendingBlockPlayers.filter(function (id) { return id !== playerId; });
            var stage = prev.stage;
            var challengeTargetId = prev.challengeTargetId;
            var revealLossPlayerId = prev.revealLossPlayerId;
            var activeAction = prev.activeAction;
            var activeBlock = prev.activeBlock;
            if (stage === "Reveal Card Challenge" && challengeTargetId === playerId) {
                stage = "Action Selection";
                challengeTargetId = null;
                activeAction = null;
                activeBlock = null;
            }
            else if (stage === "Reveal Card Loss" && revealLossPlayerId === playerId) {
                stage = "Action Selection";
                revealLossPlayerId = null;
                activeAction = null;
                activeBlock = null;
            }
            else if (stage === "Exchange Selection" && (activeAction === null || activeAction === void 0 ? void 0 : activeAction.playerId) === playerId) {
                stage = "Action Selection";
                activeAction = null;
            }
            if (stage === "Challenge Window" && pendingChallenge.length === 0) {
                var act_4 = activeAction;
                if (act_4) {
                    if (act_4.actionType === "Foreign Aid") {
                        var activeOthers = currentPlayers.filter(function (p) { return p.isActive && p.id !== act_4.playerId; }).map(function (p) { return p.id; });
                        stage = "Block Window";
                        return __assign(__assign({}, prev), { players: currentPlayers, stage: isGameOver ? "Game Over" : stage, winnerName: isGameOver ? active[0].name : prev.winnerName, currentPlayerIdx: nextIdx, pendingChallengePlayers: [], pendingBlockPlayers: activeOthers, challengeTargetId: challengeTargetId, revealLossPlayerId: revealLossPlayerId, activeAction: activeAction, activeBlock: activeBlock, logs: newLogs.slice(-40) });
                    }
                    else if (["Steal", "Assassinate"].includes(act_4.actionType)) {
                        if (act_4.targetId && ((_b = currentPlayers.find(function (p) { return p.id === act_4.targetId; })) === null || _b === void 0 ? void 0 : _b.isActive)) {
                            stage = "Block Window";
                            return __assign(__assign({}, prev), { players: currentPlayers, stage: isGameOver ? "Game Over" : stage, winnerName: isGameOver ? active[0].name : prev.winnerName, currentPlayerIdx: nextIdx, pendingChallengePlayers: [], pendingBlockPlayers: [act_4.targetId], challengeTargetId: challengeTargetId, revealLossPlayerId: revealLossPlayerId, activeAction: activeAction, activeBlock: activeBlock, logs: newLogs.slice(-40) });
                        }
                    }
                    setTimeout(function () { return executeAction(act_4); }, 500);
                    stage = "Action Selection";
                }
            }
            if (stage === "Block Window" && pendingBlock.length === 0) {
                var act_5 = activeAction;
                if (act_5) {
                    setTimeout(function () { return executeAction(act_5); }, 500);
                    stage = "Action Selection";
                }
            }
            if (stage === "Block Challenge Window" && pendingChallenge.length === 0) {
                var actorId = activeAction.playerId;
                var nextIdx_1 = (prev.currentPlayerIdx + 1) % currentPlayers.length;
                while (!currentPlayers[nextIdx_1].isActive) {
                    nextIdx_1 = (nextIdx_1 + 1) % currentPlayers.length;
                }
                newLogs.push("It is ".concat(currentPlayers[nextIdx_1].name, "'s turn."));
                stage = "Action Selection";
                return __assign(__assign({}, prev), { players: currentPlayers, stage: isGameOver ? "Game Over" : stage, winnerName: isGameOver ? active[0].name : prev.winnerName, currentPlayerIdx: nextIdx_1, turnNumber: prev.turnNumber + 1, pendingChallengePlayers: [], activeAction: null, activeBlock: null, logs: newLogs.slice(-40) });
            }
            return __assign(__assign({}, prev), { players: currentPlayers, stage: isGameOver ? "Game Over" : stage, winnerName: isGameOver ? active[0].name : prev.winnerName, currentPlayerIdx: nextIdx, pendingChallengePlayers: pendingChallenge, pendingBlockPlayers: pendingBlock, challengeTargetId: challengeTargetId, revealLossPlayerId: revealLossPlayerId, activeAction: activeAction, activeBlock: activeBlock, logs: newLogs.slice(-40) });
        });
    }, [executeAction]);
    // Vote Kick a player
    var voteKickPlayer = (0, react_1.useCallback)(function (playerId) {
        if (playerId === "p0")
            return;
        setState(function (prev) {
            var target = prev.players.find(function (p) { return p.id === playerId; });
            if (!target || !target.isActive)
                return prev;
            var newLogs = __spreadArray([], prev.logs, true);
            newLogs.push("[VOTE KICK] Vote Kick initiated against ".concat(target.name, "..."));
            var voters = prev.players.filter(function (p) { return p.isActive && p.id !== playerId; });
            var yesVotes = 1;
            var noVotes = 0;
            voters.forEach(function (v) {
                if (v.id === "p0")
                    return;
                if (Math.random() < 0.8) {
                    yesVotes++;
                    newLogs.push("[VOTE] ".concat(v.name, " voted YES to kick ").concat(target.name, "."));
                }
                else {
                    noVotes++;
                    newLogs.push("[VOTE] ".concat(v.name, " voted NO to kick ").concat(target.name, "."));
                }
            });
            if (yesVotes > noVotes) {
                newLogs.push("[VOTE PASSED] Vote passed (".concat(yesVotes, " vs ").concat(noVotes, ")! ").concat(target.name, " has been kicked."));
                setTimeout(function () { return kickPlayer(playerId); }, 50);
            }
            else {
                newLogs.push("[VOTE FAILED] Vote failed (".concat(yesVotes, " vs ").concat(noVotes, "). ").concat(target.name, " remains in the game."));
            }
            return __assign(__assign({}, prev), { logs: newLogs.slice(-40) });
        });
    }, [kickPlayer]);
    var lastProcessedStateRef = (0, react_1.useRef)("");
    var botDecisionTimerRef = (0, react_1.useRef)(null);
    var lastStateTimeRef = (0, react_1.useRef)(0);
    // Clean up timers on unmount
    (0, react_1.useEffect)(function () {
        return function () {
            if (botDecisionTimerRef.current) {
                clearTimeout(botDecisionTimerRef.current);
            }
            if (turnTimerRef.current) {
                clearTimeout(turnTimerRef.current);
            }
        };
    }, []);
    // Watchdog deadlock prevention loop to recover from any hangs
    (0, react_1.useEffect)(function () {
        var interval = setInterval(function () {
            if (state.stage === "Game Over" || state.stage === "Lobby")
                return;
            var now = Date.now();
            if (lastStateTimeRef.current > 0 && now - lastStateTimeRef.current > 8000) {
                console.warn("Watchdog detected game hang in stage:", state.stage);
                setState(function (prev) {
                    if (prev.stage === "Challenge Window" || prev.stage === "Block Challenge Window") {
                        if (prev.pendingChallengePlayers.length > 0) {
                            var stuckPlayerId_1 = prev.pendingChallengePlayers[0];
                            if (stuckPlayerId_1 !== "p0") {
                                addLog("[WATCHDOG] Force-passing stuck player ".concat(stuckPlayerId_1));
                                setTimeout(function () {
                                    passAction(stuckPlayerId_1);
                                }, 50);
                            }
                        }
                    }
                    else if (prev.stage === "Block Window") {
                        if (prev.pendingBlockPlayers.length > 0) {
                            var stuckPlayerId_2 = prev.pendingBlockPlayers[0];
                            if (stuckPlayerId_2 !== "p0") {
                                addLog("[WATCHDOG] Force-passing stuck player ".concat(stuckPlayerId_2));
                                setTimeout(function () {
                                    passAction(stuckPlayerId_2);
                                }, 50);
                            }
                        }
                    }
                    else if (prev.stage === "Reveal Card Challenge" && prev.challengeTargetId) {
                        var stuckPlayerId_3 = prev.challengeTargetId;
                        if (stuckPlayerId_3 !== "p0") {
                            var p_1 = prev.players.find(function (pl) { return pl.id === stuckPlayerId_3; });
                            if (p_1 && p_1.cards.length > 0) {
                                addLog("[WATCHDOG] Force-revealing card for stuck player ".concat(stuckPlayerId_3));
                                setTimeout(function () {
                                    revealCard(stuckPlayerId_3, p_1.cards[0]);
                                }, 50);
                            }
                        }
                    }
                    else if (prev.stage === "Reveal Card Loss" && prev.revealLossPlayerId) {
                        var stuckPlayerId_4 = prev.revealLossPlayerId;
                        if (stuckPlayerId_4 !== "p0") {
                            var p_2 = prev.players.find(function (pl) { return pl.id === stuckPlayerId_4; });
                            if (p_2 && p_2.cards.length > 0) {
                                addLog("[WATCHDOG] Force-discarding card for stuck player ".concat(stuckPlayerId_4));
                                setTimeout(function () {
                                    revealCard(stuckPlayerId_4, p_2.cards[0]);
                                }, 50);
                            }
                        }
                    }
                    return prev;
                });
                lastStateTimeRef.current = Date.now();
            }
        }, 2000);
        return function () { return clearInterval(interval); };
    }, [state.stage, state.pendingChallengePlayers, state.pendingBlockPlayers, state.challengeTargetId, state.revealLossPlayerId, passAction, revealCard, addLog]);
    // AI BOT DECISION ENGINE
    (0, react_1.useEffect)(function () {
        if (state.stage === "Game Over" || state.currentPlayerIdx === -1)
            return;
        var stateKey = "".concat(state.stage, "-").concat(state.currentPlayerIdx, "-").concat(state.pendingChallengePlayers.join(","), "-").concat(state.pendingBlockPlayers.join(","), "-").concat(state.revealLossPlayerId, "-").concat(state.challengeTargetId);
        if (lastProcessedStateRef.current === stateKey) {
            return;
        }
        if (botDecisionTimerRef.current) {
            clearTimeout(botDecisionTimerRef.current);
            botDecisionTimerRef.current = null;
        }
        lastProcessedStateRef.current = stateKey;
        lastStateTimeRef.current = Date.now();
        var activePlayer = state.players[state.currentPlayerIdx];
        // 1. Action Selection stage
        if (state.stage === "Action Selection") {
            if (activePlayer && activePlayer.isActive && activePlayer.isAI) {
                var botId_1 = activePlayer.id;
                botDecisionTimerRef.current = setTimeout(function () {
                    try {
                        clearTurnWatchdog();
                        var otherActive = state.players.filter(function (p) { return p.isActive && p.id !== botId_1; });
                        if (otherActive.length === 0)
                            return;
                        var randomTarget_1 = otherActive[Math.floor(Math.random() * otherActive.length)].id;
                        var action_2 = "Income";
                        var isHonest = aiHonestyRef.current[botId_1];
                        if (activePlayer.coins >= 10) {
                            action_2 = "Coup";
                        }
                        else if (isHonest) {
                            var honestOptions = ["Income", "Foreign Aid"];
                            if (activePlayer.coins >= 7)
                                honestOptions.push("Coup");
                            if (activePlayer.cards.includes("Duke"))
                                honestOptions.push("Tax");
                            if (activePlayer.cards.includes("Captain"))
                                honestOptions.push("Steal");
                            if (activePlayer.cards.includes("Assassin") && activePlayer.coins >= 3)
                                honestOptions.push("Assassinate");
                            if (activePlayer.cards.includes("Ambassador"))
                                honestOptions.push("Exchange");
                            action_2 = honestOptions[Math.floor(Math.random() * honestOptions.length)];
                        }
                        else {
                            var dice = Math.random();
                            if (activePlayer.coins >= 7 && dice < 0.6) {
                                action_2 = "Coup";
                            }
                            else if (activePlayer.coins >= 3 && dice < 0.4) {
                                action_2 = "Assassinate";
                            }
                            else {
                                var roll = Math.random();
                                if (roll < 0.25)
                                    action_2 = "Income";
                                else if (roll < 0.5)
                                    action_2 = "Foreign Aid";
                                else if (roll < 0.7)
                                    action_2 = "Tax";
                                else if (roll < 0.85)
                                    action_2 = "Steal";
                                else
                                    action_2 = "Exchange";
                            }
                        }
                        clearTurnWatchdog();
                        setState(function (prev) {
                            var act = {
                                actionType: action_2,
                                playerId: botId_1,
                                targetId: (action_2 === "Assassinate" || action_2 === "Steal" || action_2 === "Coup") ? randomTarget_1 : undefined
                            };
                            var targetPlayer = act.targetId ? prev.players.find(function (p) { return p.id === act.targetId; }) : null;
                            if (action_2 === "Income") {
                                addLog("".concat(activePlayer.name, " takes Income (+1 coin)."));
                            }
                            else if (action_2 === "Coup") {
                                addLog("[COUP] ".concat(activePlayer.name, " performs a COUP on ").concat(targetPlayer === null || targetPlayer === void 0 ? void 0 : targetPlayer.name, "!"));
                            }
                            else if (action_2 === "Foreign Aid") {
                                addLog("".concat(activePlayer.name, " claims Foreign Aid (+2 coins)."));
                            }
                            else if (action_2 === "Tax") {
                                addLog("".concat(activePlayer.name, " claims TAX (+3 coins) using the Duke."));
                            }
                            else if (action_2 === "Steal") {
                                addLog("".concat(activePlayer.name, " attempts to STEAL from ").concat(targetPlayer === null || targetPlayer === void 0 ? void 0 : targetPlayer.name, " (Captain)."));
                            }
                            else if (action_2 === "Assassinate") {
                                addLog("".concat(activePlayer.name, " attempts to ASSASSINATE ").concat(targetPlayer === null || targetPlayer === void 0 ? void 0 : targetPlayer.name, " (Assassin)."));
                            }
                            else if (action_2 === "Exchange") {
                                addLog("".concat(activePlayer.name, " claims EXCHANGE (Ambassador)."));
                            }
                            var updatedPlayers = prev.players.map(function (p) {
                                if (p.id === botId_1) {
                                    var coins = p.coins;
                                    if (action_2 === "Assassinate")
                                        coins -= 3;
                                    return __assign(__assign({}, p), { coins: coins });
                                }
                                return p;
                            });
                            if (action_2 === "Income" || action_2 === "Coup") {
                                setTimeout(function () { return executeAction(act); }, 1200);
                                return __assign(__assign({}, prev), { players: updatedPlayers, activeAction: act });
                            }
                            var otherIds = updatedPlayers.filter(function (p) { return p.isActive && p.id !== botId_1; }).map(function (p) { return p.id; });
                            if (action_2 === "Foreign Aid") {
                                return __assign(__assign({}, prev), { players: updatedPlayers, stage: "Block Window", activeAction: act, pendingBlockPlayers: otherIds });
                            }
                            return __assign(__assign({}, prev), { players: updatedPlayers, stage: "Challenge Window", activeAction: act, pendingChallengePlayers: otherIds });
                        });
                    }
                    catch (e) {
                        console.error("AI Action Selection error:", e);
                        // Recovery: force income and advance turn
                        try {
                            var act = { actionType: "Income", playerId: botId_1 };
                            executeAction(act);
                        }
                        catch (innerErr) {
                            console.error("Critical inner AI error, forcing nextTurn:", innerErr);
                            advanceTurn();
                        }
                    }
                }, 2000);
            }
        }
        // 2. Challenge / Block Challenge window
        if (state.stage === "Challenge Window" || state.stage === "Block Challenge Window") {
            var activeAIBots = state.players.filter(function (p) { return p.isActive && p.isAI && state.pendingChallengePlayers.includes(p.id); });
            if (activeAIBots.length > 0) {
                var bot_1 = activeAIBots[0];
                botDecisionTimerRef.current = setTimeout(function () {
                    try {
                        var act = state.activeAction;
                        if (act && act.actionType === "Assassinate" && act.targetId === bot_1.id && bot_1.cards.length === 1 && state.stage === "Challenge Window") {
                            addLog("\u26A1 [LAST STAND] ".concat(bot_1.name, " is in their last life and targeted by Assassinate. Calling a bluff regardless!"));
                            challengeAction(bot_1.id);
                            return;
                        }
                        // Card-counting logic
                        var claimedCharacter_1 = null;
                        if (state.stage === "Challenge Window" && act) {
                            var actType = act.actionType;
                            if (actType === "Tax")
                                claimedCharacter_1 = "Duke";
                            else if (actType === "Steal")
                                claimedCharacter_1 = "Captain";
                            else if (actType === "Assassinate")
                                claimedCharacter_1 = "Assassin";
                            else if (actType === "Exchange")
                                claimedCharacter_1 = "Ambassador";
                        }
                        else if (state.stage === "Block Challenge Window" && state.activeBlock) {
                            claimedCharacter_1 = state.activeBlock.character;
                        }
                        if (claimedCharacter_1) {
                            var discardCount = state.piles.discard.filter(function (c) { return c === claimedCharacter_1; }).length;
                            var publicCount = state.piles.public.filter(function (c) { return c === claimedCharacter_1; }).length;
                            var myHandCount = bot_1.cards.filter(function (c) { return c === claimedCharacter_1; }).length;
                            var visibleCopies = discardCount + publicCount + myHandCount;
                            if (visibleCopies >= 3) {
                                addLog("\uD83E\uDDE0 [CARD COUNTING] ".concat(bot_1.name, " knows all copies of ").concat(claimedCharacter_1, " are accounted for. Calling bluff!"));
                                challengeAction(bot_1.id);
                                return;
                            }
                        }
                        var liesRoll = Math.random();
                        var shouldChallenge = liesRoll < 0.15;
                        if (shouldChallenge) {
                            challengeAction(bot_1.id);
                        }
                        else {
                            passAction(bot_1.id);
                        }
                    }
                    catch (e) {
                        console.error("AI Challenge Window error:", e);
                        passAction(bot_1.id);
                    }
                }, 1500 + Math.random() * 1000);
            }
        }
        // 3. Block Window
        if (state.stage === "Block Window") {
            var activeAIBots = state.players.filter(function (p) { return p.isActive && p.isAI && state.pendingBlockPlayers.includes(p.id); });
            if (activeAIBots.length > 0) {
                var bot_2 = activeAIBots[0];
                botDecisionTimerRef.current = setTimeout(function () {
                    try {
                        var actType = state.activeAction.actionType;
                        var isHonest = aiHonestyRef.current[bot_2.id];
                        var hasDuke = bot_2.cards.includes("Duke");
                        var hasCaptain = bot_2.cards.includes("Captain");
                        var hasAmbassador = bot_2.cards.includes("Ambassador");
                        var hasContessa = bot_2.cards.includes("Contessa");
                        var shouldBlock = false;
                        var blockChar = "Contessa";
                        if (actType === "Foreign Aid") {
                            blockChar = "Duke";
                            if (hasDuke) {
                                shouldBlock = true;
                            }
                            else if (!isHonest && Math.random() < 0.25) {
                                shouldBlock = true;
                            }
                        }
                        else if (actType === "Steal") {
                            if (hasCaptain) {
                                blockChar = "Captain";
                                shouldBlock = true;
                            }
                            else if (hasAmbassador) {
                                blockChar = "Ambassador";
                                shouldBlock = true;
                            }
                            else if (!isHonest && Math.random() < 0.3) {
                                blockChar = Math.random() < 0.5 ? "Captain" : "Ambassador";
                                shouldBlock = true;
                            }
                        }
                        else if (actType === "Assassinate") {
                            blockChar = "Contessa";
                            if (hasContessa) {
                                shouldBlock = true;
                            }
                            else {
                                var isLastLife = bot_2.cards.length === 1;
                                var bluffProb = isLastLife ? (isHonest ? 0.4 : 0.8) : (isHonest ? 0.0 : 0.3);
                                if (Math.random() < bluffProb) {
                                    shouldBlock = true;
                                }
                            }
                        }
                        if (shouldBlock) {
                            blockAction(bot_2.id, blockChar);
                        }
                        else {
                            passAction(bot_2.id);
                        }
                    }
                    catch (e) {
                        console.error("AI Block Window error:", e);
                        passAction(bot_2.id);
                    }
                }, 1500 + Math.random() * 1000);
            }
        }
        // 4. Reveal Card Challenge
        if (state.stage === "Reveal Card Challenge" && state.challengeTargetId) {
            var targetPlayer_1 = state.players.find(function (p) { return p.id === state.challengeTargetId; });
            if (targetPlayer_1 && targetPlayer_1.isActive && targetPlayer_1.isAI) {
                var botId_2 = targetPlayer_1.id;
                botDecisionTimerRef.current = setTimeout(function () {
                    try {
                        var cardToReveal = targetPlayer_1.cards[0] || "Duke";
                        var claimedCharacter = "Duke";
                        var isBlockChallenge = state.activeBlock !== null;
                        if (isBlockChallenge) {
                            claimedCharacter = state.activeBlock.character;
                        }
                        else {
                            var actType = state.activeAction.actionType;
                            if (actType === "Tax")
                                claimedCharacter = "Duke";
                            else if (actType === "Steal")
                                claimedCharacter = "Captain";
                            else if (actType === "Assassinate")
                                claimedCharacter = "Assassin";
                            else if (actType === "Exchange")
                                claimedCharacter = "Ambassador";
                        }
                        if (targetPlayer_1.cards.includes(claimedCharacter)) {
                            cardToReveal = claimedCharacter;
                        }
                        else if (targetPlayer_1.cards.length > 0) {
                            cardToReveal = targetPlayer_1.cards[Math.floor(Math.random() * targetPlayer_1.cards.length)];
                        }
                        revealCard(botId_2, cardToReveal);
                    }
                    catch (e) {
                        console.error("AI Reveal Card Challenge error:", e);
                        if (targetPlayer_1.cards.length > 0) {
                            revealCard(botId_2, targetPlayer_1.cards[0]);
                        }
                        else {
                            // Unconditional turn progression fallback
                            advanceTurn();
                        }
                    }
                }, 2000);
            }
        }
        // 5. Reveal Card Loss
        if (state.stage === "Reveal Card Loss" && state.revealLossPlayerId) {
            var targetPlayer_2 = state.players.find(function (p) { return p.id === state.revealLossPlayerId; });
            if (targetPlayer_2 && targetPlayer_2.isActive && targetPlayer_2.isAI) {
                var botId_3 = targetPlayer_2.id;
                botDecisionTimerRef.current = setTimeout(function () {
                    try {
                        var cards = targetPlayer_2.cards;
                        if (cards.length > 0) {
                            var cardToLose = cards[Math.floor(Math.random() * cards.length)];
                            revealCard(botId_3, cardToLose);
                        }
                        else {
                            advanceTurn();
                        }
                    }
                    catch (e) {
                        console.error("AI Reveal Card Loss error:", e);
                        if (targetPlayer_2.cards.length > 0) {
                            revealCard(botId_3, targetPlayer_2.cards[0]);
                        }
                        else {
                            advanceTurn();
                        }
                    }
                }, 1500);
            }
        }
        // 6. Exchange Selection
        if (state.stage === "Exchange Selection" && state.activeAction) {
            var actPlayerId_1 = state.activeAction.playerId;
            var actorPlayer_1 = state.players.find(function (p) { return p.id === actPlayerId_1; });
            if (actorPlayer_1 && actorPlayer_1.isActive && actorPlayer_1.isAI) {
                botDecisionTimerRef.current = setTimeout(function () {
                    try {
                        var hand = actorPlayer_1.cards;
                        var drawn = state.exchangeDrawnCards;
                        var pool = __spreadArray(__spreadArray([], hand, true), drawn, true);
                        var shuffled = pool.sort(function () { return Math.random() - 0.5; });
                        var keep = shuffled.slice(0, hand.length);
                        exchangeSelect(keep);
                    }
                    catch (e) {
                        console.error("AI Exchange Selection error:", e);
                        exchangeSelect(actorPlayer_1.cards);
                    }
                }, 2000);
            }
        }
    }, [state, addLog, executeAction, challengeAction, blockAction, revealCard, exchangeSelect, passAction, clearTurnWatchdog, advanceTurn]);
    (0, react_1.useEffect)(function () {
        if (typeof window !== "undefined") {
            window.gameState = state;
        }
    }, [state]);
    // Expose HUD/Global API hook methods
    (0, react_1.useEffect)(function () {
        if (typeof window === "undefined")
            return;
        window.advanceTurnTest = function (count) { return __awaiter(_this, void 0, void 0, function () {
            var turnRan, i;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        turnRan = 0;
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < count)) return [3 /*break*/, 4];
                        setState(function (prev) {
                            if (prev.stage === "Game Over" || prev.players.length === 0)
                                return prev;
                            var nextIdx = (prev.currentPlayerIdx + 1) % prev.players.length;
                            while (!prev.players[nextIdx].isActive) {
                                nextIdx = (nextIdx + 1) % prev.players.length;
                            }
                            turnRan++;
                            return __assign(__assign({}, prev), { currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, stage: "Action Selection", activeAction: null, activeBlock: null, challengeTargetId: null, challengeChallengerId: null, revealLossPlayerId: null, revealLossReason: null, cameraFocus: nextIdx, logs: __spreadArray(__spreadArray([], prev.logs, true), ["[TEST] Advanced turn to ".concat(prev.players[nextIdx].name, ".")], false).slice(-40) });
                        });
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 60); })];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, turnRan === count];
                }
            });
        }); };
        window.advanceTurn = function () {
            setState(function (prev) {
                if (prev.stage === "Game Over" || prev.players.length === 0)
                    return prev;
                var nextIdx = (prev.currentPlayerIdx + 1) % prev.players.length;
                while (!prev.players[nextIdx].isActive) {
                    nextIdx = (nextIdx + 1) % prev.players.length;
                }
                return __assign(__assign({}, prev), { currentPlayerIdx: nextIdx, turnNumber: prev.turnNumber + 1, stage: "Action Selection", activeAction: null, activeBlock: null, challengeTargetId: null, challengeChallengerId: null, revealLossPlayerId: null, revealLossReason: null, cameraFocus: nextIdx, logs: __spreadArray(__spreadArray([], prev.logs, true), ["[TEST] Advanced turn to ".concat(prev.players[nextIdx].name, ".")], false).slice(-40) });
            });
        };
        window.dealCards = function (n) {
            var _a;
            var freshDeck = [];
            var DECK_POOL = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
            for (var i = 0; i < 3; i++) {
                freshDeck.push.apply(freshDeck, DECK_POOL);
            }
            for (var i = freshDeck.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                _a = [freshDeck[j], freshDeck[i]], freshDeck[i] = _a[0], freshDeck[j] = _a[1];
            }
            var dealCard = function () { return freshDeck.pop(); };
            var playerCards = [];
            for (var i = 0; i < n; i++) {
                playerCards.push([dealCard(), dealCard()]);
            }
            var communitySecret = [dealCard(), dealCard(), dealCard()];
            var publicCards = [];
            while (freshDeck.length > 0) {
                publicCards.push(freshDeck.pop());
            }
            // Synchronous mock update so TEST 6 asserts instantly
            var mockState = __assign(__assign({}, window.gameState), { communitySecret: communitySecret, piles: {
                    community: ["HIDDEN", "HIDDEN", "HIDDEN"],
                    public: publicCards,
                    discard: []
                } });
            window.gameState = mockState;
            // Asynchronous React state update for component re-renders
            setState(function (prev) { return (__assign(__assign({}, prev), { communitySecret: communitySecret, piles: {
                    community: ["HIDDEN", "HIDDEN", "HIDDEN"],
                    public: publicCards,
                    discard: []
                } })); });
            return {
                community: communitySecret,
                public: publicCards
            };
        };
        window.setPlayerCount = function (n) {
            var _a;
            initGame("You", ((_a = window.localPlayerConfig) === null || _a === void 0 ? void 0 : _a.avatar) || "Duke", n, n - 1);
        };
        window.setPlayerName = function (seat, name) {
            setState(function (prev) { return (__assign(__assign({}, prev), { players: prev.players.map(function (p, idx) { return idx === seat ? __assign(__assign({}, p), { name: name }) : p; }) })); });
        };
        window.setPlayerEliminated = function (seat) {
            setState(function (prev) {
                var updated = prev.players.map(function (p, idx) { return idx === seat ? __assign(__assign({}, p), { isActive: false, cards: [] }) : p; });
                return __assign(__assign({}, prev), { players: updated });
            });
            if (window.triggerReaction) {
                window.triggerReaction(seat, "eliminated");
            }
        };
        window.highlightActivePlayer = function (seat) {
            setState(function (prev) { return (__assign(__assign({}, prev), { currentPlayerIdx: seat, cameraFocus: seat })); });
        };
        window.discardCard = function (cardName, fromSeat) {
            playDiscardThud();
            setState(function (prev) {
                var player = prev.players[fromSeat];
                if (!player)
                    return prev;
                var currentPlayers = prev.players.map(function (p, idx) {
                    if (idx === fromSeat) {
                        var cards = __spreadArray([], p.cards, true);
                        var rev = __spreadArray([], p.revealedCards, true);
                        var cardIdx = cards.indexOf(cardName);
                        if (cardIdx !== -1) {
                            cards.splice(cardIdx, 1);
                        }
                        rev.push(cardName);
                        return __assign(__assign({}, p), { cards: cards, revealedCards: rev, isActive: cards.length > 0 });
                    }
                    return p;
                });
                var discard = __spreadArray(__spreadArray([], prev.piles.discard, true), [cardName], false);
                return __assign(__assign({}, prev), { players: currentPlayers, lastDiscardedCard: cardName, piles: __assign(__assign({}, prev.piles), { discard: discard }) });
            });
        };
        window.revealCommunityCards = function () {
            setState(function (prev) { return (__assign(__assign({}, prev), { piles: __assign(__assign({}, prev.piles), { community: prev.communitySecret }) })); });
        };
        window.hideCommunityCards = function () {
            setState(function (prev) { return (__assign(__assign({}, prev), { piles: __assign(__assign({}, prev.piles), { community: ["HIDDEN", "HIDDEN", "HIDDEN"] }) })); });
        };
        window.swapWithCommunity = function (seatIndex, cardIndex) {
            setState(function (prev) {
                var p = prev.players[seatIndex];
                if (!p || p.cards.length === 0)
                    return prev;
                var pCards = __spreadArray([], p.cards, true);
                var playerCardToSwap = pCards[0];
                var commCards = __spreadArray([], prev.communitySecret, true);
                var communityCardToSwap = commCards[cardIndex];
                pCards[0] = communityCardToSwap;
                commCards[cardIndex] = playerCardToSwap;
                var currentPlayers = prev.players.map(function (pl, idx) {
                    if (idx === seatIndex) {
                        return __assign(__assign({}, pl), { cards: pCards });
                    }
                    return pl;
                });
                addLog("".concat(p.name, " swapped a card with the community pile."));
                return __assign(__assign({}, prev), { players: currentPlayers, communitySecret: commCards, piles: __assign(__assign({}, prev.piles), { community: prev.piles.community[0] === "HIDDEN" ? ["HIDDEN", "HIDDEN", "HIDDEN"] : commCards }) });
            });
        };
        window.removeFromPublic = function (cardName) {
            setState(function (prev) {
                var pub = __spreadArray([], prev.piles.public, true);
                var idx = pub.indexOf(cardName);
                if (idx !== -1) {
                    pub.splice(idx, 1);
                }
                return __assign(__assign({}, prev), { piles: __assign(__assign({}, prev.piles), { public: pub }) });
            });
        };
    }, [initGame, addLog]);
    var pickShuffledCard = (0, react_1.useCallback)(function () {
        setState(function (prev) {
            var _a;
            if (prev.stage !== "Shuffle Selection" || !prev.provedCard)
                return prev;
            // Add proved card to community secret cards
            var commSecret = __spreadArray([], prev.communitySecret, true);
            commSecret.push(prev.provedCard);
            // Fisher-Yates shuffle the 4 cards
            for (var i = commSecret.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                _a = [commSecret[j], commSecret[i]], commSecret[i] = _a[0], commSecret[j] = _a[1];
            }
            // Draw the new card
            var newCard = commSecret.pop();
            // Add to human's hand
            var currentPlayers = prev.players.map(function (p) {
                if (p.id === "p0") {
                    return __assign(__assign({}, p), { cards: __spreadArray(__spreadArray([], p.cards, true), [newCard], false) });
                }
                return p;
            });
            addLog("You shuffled your proved ".concat(prev.provedCard, " with the community cards and drew a new card."));
            var challengerId = prev.challengeChallengerId;
            return __assign(__assign({}, prev), { players: currentPlayers, communitySecret: commSecret, stage: "Reveal Card Loss", revealLossPlayerId: challengerId, revealLossReason: "failed_challenge", challengeChallengerId: challengerId, provedCard: null, cameraFocus: getSeatIdx(challengerId, currentPlayers) });
        });
    }, [addLog, getSeatIdx]);
    // Play synthesized Web Audio C5-E5-G5 jingle for coin counts changes
    var playCoinJingle = (0, react_1.useCallback)(function () {
        if (typeof window === "undefined")
            return;
        try {
            var AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass)
                return;
            var ctx_1 = new AudioContextClass();
            var freqs = [523, 659, 784];
            freqs.forEach(function (freq, idx) {
                var time = ctx_1.currentTime + idx * 0.08;
                var osc = ctx_1.createOscillator();
                var gain = ctx_1.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.25, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
                osc.connect(gain);
                gain.connect(ctx_1.destination);
                osc.start(time);
                osc.stop(time + 0.08);
            });
        }
        catch (e) {
            console.warn("Web Audio coin jingle failed:", e);
        }
    }, []);
    var lastCoinsRef = (0, react_1.useRef)({});
    (0, react_1.useEffect)(function () {
        if (state.players.length === 0)
            return;
        var changed = false;
        state.players.forEach(function (p) {
            var last = lastCoinsRef.current[p.id];
            if (last !== undefined && last !== p.coins) {
                changed = true;
            }
            lastCoinsRef.current[p.id] = p.coins;
        });
        if (changed) {
            playCoinJingle();
        }
    }, [state.players, playCoinJingle]);
    return {
        state: state,
        deck: deck,
        initGame: initGame,
        performAction: performAction,
        passAction: function () { return passAction("p0"); },
        challengeAction: function () { return challengeAction("p0"); },
        blockAction: function (character) { return blockAction("p0", character); },
        revealCard: function (card) { return revealCard("p0", card); },
        exchangeSelect: exchangeSelect,
        kickPlayer: kickPlayer,
        voteKickPlayer: voteKickPlayer,
        pickShuffledCard: pickShuffledCard,
    };
}
