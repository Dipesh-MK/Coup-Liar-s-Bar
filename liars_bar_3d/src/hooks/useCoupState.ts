"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type CardType = "Duke" | "Assassin" | "Captain" | "Ambassador" | "Contessa";

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  coins: number;
  cards: CardType[];
  revealedCards: CardType[];
  isActive: boolean;
  isAI: boolean;
  bodyColor?: string;
  animal?: string;
  bodyType?: "CHUNKY" | "SKINNY" | "MUSCULAR" | "TINY" | "PEAR";
  eyeStyle?: string;
  accessories?: {
    topHat: boolean;
    monocle: boolean;
    bowTie: boolean;
    scarf: boolean;
    vest: boolean;
  };
}


export interface ActiveAction {
  actionType: string;
  playerId: string;
  targetId?: string;
  resolved?: boolean;
}

export interface AnimationEvent {
  id: string;
  type: "income" | "foreign_aid" | "tax" | "steal" | "assassinate" | "coup" | "challenge_reveal" | "block_shield" | "slump";
  actorId: string;
  targetId?: string;
  detail?: string;
}

export interface GamePiles {
  community: string[];
  public: CardType[];
  discard: CardType[];
}

export interface GameState {
  players: PlayerState[];
  currentPlayerIdx: number;
  turnNumber: number;
  stage: "Lobby" | "Action Selection" | "Challenge Window" | "Block Window" | "Block Challenge Window" | "Reveal Card Challenge" | "Reveal Card Loss" | "Exchange Selection" | "Game Over" | "Shuffle Selection";
  activeAction: ActiveAction | null;
  activeBlock: { playerId: string; character: CardType } | null;
  pendingChallengePlayers: string[];
  pendingBlockPlayers: string[];
  challengeTargetId: string | null;
  challengeChallengerId: string | null;
  revealLossPlayerId: string | null;
  revealLossReason: "coup" | "assassination" | "failed_challenge" | null;
  provedCard: CardType | null;
  exchangeDrawnCards: CardType[];
  winnerName: string | null;
  logs: string[];
  cameraFocus: number;
  animationEvent: null | AnimationEvent;
  lastDiscardedCard: CardType | null;
  piles: GamePiles;
  communitySecret: CardType[];
}

const DECK_POOL: CardType[] = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
const BOT_NAMES = ["Lord Hazard", "Slippery Sam", "Lady Sparkles", "Honest Abe", "Picasso of Lies", "Sneaky Pete"];
const BOT_ROLES = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];

// Web Audio sound effect for discards (Low 80Hz sine thud, 0.2s duration)
function playDiscardThud() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (err) {
    console.warn("AudioContext failed to start:", err);
  }
}

// Web Audio sound effect for victory applause
function playApplauseSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Create a white noise buffer
    const bufferSize = ctx.sampleRate * 0.1; // 100ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Play 20 overlapping claps over 2.5 seconds
    for (let i = 0; i < 20; i++) {
      const time = ctx.currentTime + i * 0.12 + Math.random() * 0.05;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.3, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(time);
    }
  } catch (err) {
    console.warn("AudioContext applause failed:", err);
  }
}

// Web Audio sound effect for returning to screen (satisfying upward sweep)
function playReturnToScreenSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.45);
    
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (err) {
    console.warn("AudioContext return sweep failed:", err);
  }
}

export function useCoupState() {
  const [state, setState] = useState<GameState>({
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
  });

  const [deck, setDeck] = useState<CardType[]>([]);

  const aiHonestyRef = useRef<Record<string, boolean>>({});
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTurnWatchdog = useCallback(() => {
    if (turnTimerRef.current) {
      clearTimeout(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  }, []);

  const startTurnWatchdog = useCallback((seatIndex: number) => {
    clearTurnWatchdog();
    turnTimerRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev.stage !== "Action Selection" || prev.currentPlayerIdx !== seatIndex) return prev;
        const player = prev.players[seatIndex];
        if (!player || !player.isActive || !player.isAI) return prev;

        console.warn("Turn timeout for seat", seatIndex, "— forcing Income action");
        
        const act: ActiveAction = { actionType: "Income", playerId: player.id };
        const id = Math.random().toString(36).substring(2, 9);
        
        const updatedPlayers = prev.players.map(p => {
          if (p.id === player.id) {
            return { ...p, coins: p.coins + 1 };
          }
          return p;
        });
        
        let nextIdx = (prev.currentPlayerIdx + 1) % updatedPlayers.length;
        while (!updatedPlayers[nextIdx].isActive) {
          nextIdx = (nextIdx + 1) % updatedPlayers.length;
        }

        return {
          ...prev,
          players: updatedPlayers,
          currentPlayerIdx: nextIdx,
          turnNumber: prev.turnNumber + 1,
          stage: "Action Selection",
          activeAction: null,
          activeBlock: null,
          challengeTargetId: null,
          challengeChallengerId: null,
          revealLossPlayerId: null,
          revealLossReason: null,
          cameraFocus: nextIdx,
          logs: [...prev.logs, `[WATCHDOG] ${player.name} timed out! Forced Income.`, `It is ${updatedPlayers[nextIdx].name}'s turn.`].slice(-40),
          animationEvent: { id, type: "income", actorId: player.id }
        };
      });
    }, 15000);
  }, [clearTurnWatchdog]);

  useEffect(() => {
    if (state.stage === "Action Selection" && state.currentPlayerIdx !== -1) {
      startTurnWatchdog(state.currentPlayerIdx);
    } else {
      clearTurnWatchdog();
    }
    return () => {
      clearTurnWatchdog();
    };
  }, [state.stage, state.currentPlayerIdx, state.turnNumber, startTurnWatchdog, clearTurnWatchdog]);


  // Local helper to add a log entry
  const addLog = useCallback((text: string) => {
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, text].slice(-40),
    }));
  }, []);

  // Helper to trigger a 3D animation event
  const triggerAnimation = useCallback((type: AnimationEvent["type"], actorId: string, targetId?: string, detail?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setState((prev) => ({
      ...prev,
      animationEvent: { id, type, actorId, targetId, detail },
    }));
  }, []);

  // Get seat index for a player ID
  const getSeatIdx = useCallback((playerId: string, players: PlayerState[]) => {
    return players.findIndex((p) => p.id === playerId);
  }, []);

  // Get victory winner if only one active player remains
  const getWinner = useCallback((players: PlayerState[]): PlayerState | null => {
    const active = players.filter((p) => p.isActive);
    return active.length === 1 ? active[0] : null;
  }, []);

  const advanceTurn = useCallback(() => {
    setState((prev) => {
      if (prev.stage === "Game Over" || prev.players.length === 0) return prev;
      let nextIdx = (prev.currentPlayerIdx + 1) % prev.players.length;
      while (!prev.players[nextIdx].isActive) {
        nextIdx = (nextIdx + 1) % prev.players.length;
      }
      return {
        ...prev,
        currentPlayerIdx: nextIdx,
        turnNumber: prev.turnNumber + 1,
        stage: "Action Selection",
        activeAction: null,
        activeBlock: null,
        challengeTargetId: null,
        challengeChallengerId: null,
        revealLossPlayerId: null,
        revealLossReason: null,
        cameraFocus: nextIdx,
        logs: [...prev.logs, `It is ${prev.players[nextIdx].name}'s turn.`].slice(-40)
      };
    });
  }, []);

  // Execute an action immediately
  const executeAction = useCallback((act: ActiveAction) => {
    setState((prev) => {
      if (
        !prev.activeAction ||
        prev.activeAction.resolved ||
        prev.activeAction.actionType !== act.actionType ||
        prev.activeAction.playerId !== act.playerId ||
        prev.activeAction.targetId !== act.targetId
      ) {
        return prev;
      }

      const actor = prev.players.find((p) => p.id === act.playerId);
      if (!actor || !actor.isActive) return prev;

      const updatedPlayers = prev.players.map((p) => ({
        ...p,
        cards: [...p.cards],
        revealedCards: [...p.revealedCards],
      }));

      const actorClone = updatedPlayers.find((p) => p.id === act.playerId)!;
      const targetClone = act.targetId ? updatedPlayers.find((p) => p.id === act.targetId) : null;

      let newLogs = [...prev.logs];
      const animId = Math.random().toString(36).substring(2, 9);
      let animType: AnimationEvent["type"] | null = null;
      let animTargetId: string | undefined = undefined;

      let nextStage: GameState["stage"] = "Action Selection";
      let nextPlayerIdx = prev.currentPlayerIdx;
      let revealLossPlayerId: string | null = null;
      let revealLossReason: GameState["revealLossReason"] = null;
      let exchangeDrawnCards = prev.exchangeDrawnCards;
      let cameraFocus = prev.cameraFocus;

      if (act.actionType === "Income") {
        actorClone.coins += 1;
        newLogs.push(`${actorClone.name} gains 1 coin from Income.`);
        animType = "income";
      } else if (act.actionType === "Foreign Aid") {
        actorClone.coins += 2;
        newLogs.push(`${actorClone.name} gains 2 coins from Foreign Aid.`);
        animType = "foreign_aid";
      } else if (act.actionType === "Tax") {
        actorClone.coins += 3;
        newLogs.push(`${actorClone.name} takes 3 coins (Tax) using the Duke.`);
        animType = "tax";
      } else if (act.actionType === "Steal") {
        if (targetClone && targetClone.isActive) {
          const stolen = Math.min(targetClone.coins, 2);
          targetClone.coins -= stolen;
          actorClone.coins += stolen;
          newLogs.push(`${actorClone.name} steals ${stolen} coins from ${targetClone.name}.`);
          animType = "steal";
          animTargetId = targetClone.id;
        }
      } else if (act.actionType === "Assassinate") {
        if (targetClone && targetClone.isActive) {
          newLogs.push(`${actorClone.name} successfully assassinates ${targetClone.name}!`);
          animType = "assassinate";
          animTargetId = targetClone.id;
          nextStage = "Reveal Card Loss";
          revealLossPlayerId = targetClone.id;
          revealLossReason = "assassination";
          nextPlayerIdx = updatedPlayers.findIndex((p) => p.id === targetClone.id);
          cameraFocus = nextPlayerIdx;
        }
      } else if (act.actionType === "Coup") {
        actorClone.coins -= 7;
        if (targetClone && targetClone.isActive) {
          newLogs.push(`${actorClone.name} performs a Coup on ${targetClone.name}!`);
          animType = "coup";
          animTargetId = targetClone.id;
          nextStage = "Reveal Card Loss";
          revealLossPlayerId = targetClone.id;
          revealLossReason = "coup";
          nextPlayerIdx = updatedPlayers.findIndex((p) => p.id === targetClone.id);
          cameraFocus = nextPlayerIdx;
        }
      } else if (act.actionType === "Exchange") {
        const comm = prev.communitySecret;
        const drawn: CardType[] = [comm[0] as CardType, comm[1] as CardType];
        newLogs.push(`${actorClone.name} draws 2 cards from the community pile for Exchange.`);
        nextStage = "Exchange Selection";
        exchangeDrawnCards = drawn;
        nextPlayerIdx = updatedPlayers.findIndex((p) => p.id === actorClone.id);
        cameraFocus = nextPlayerIdx;
      }

      // If we don't transition to Reveal Card Loss or Exchange Selection, advance the turn
      let nextTurnIdx = prev.currentPlayerIdx;
      if (nextStage === "Action Selection") {
        nextTurnIdx = (prev.currentPlayerIdx + 1) % updatedPlayers.length;
        while (!updatedPlayers[nextTurnIdx].isActive) {
          nextTurnIdx = (nextTurnIdx + 1) % updatedPlayers.length;
        }
        newLogs.push(`It is ${updatedPlayers[nextTurnIdx].name}'s turn.`);
        cameraFocus = nextTurnIdx;
      }

      const winner = getWinner(updatedPlayers);
      const isGameOver = winner !== null;

      return {
        ...prev,
        players: updatedPlayers,
        stage: isGameOver ? "Game Over" : nextStage,
        currentPlayerIdx: isGameOver ? prev.currentPlayerIdx : (nextStage === "Action Selection" ? nextTurnIdx : nextPlayerIdx),
        turnNumber: nextStage === "Action Selection" ? prev.turnNumber + 1 : prev.turnNumber,
        activeAction: nextStage === "Exchange Selection" ? { ...act, resolved: true } : null,
        activeBlock: null,
        challengeTargetId: null,
        challengeChallengerId: null,
        revealLossPlayerId: isGameOver ? null : revealLossPlayerId,
        revealLossReason: isGameOver ? null : revealLossReason,
        winnerName: isGameOver ? winner.name : prev.winnerName,
        exchangeDrawnCards: isGameOver ? [] : exchangeDrawnCards,
        cameraFocus: isGameOver ? prev.currentPlayerIdx : cameraFocus,
        logs: newLogs.slice(-40),
        animationEvent: animType ? { id: animId, type: animType, actorId: actorClone.id, targetId: animTargetId } : prev.animationEvent
      };
    });
  }, [getWinner]);

  // Initialize the game
  const initGame = useCallback((
    playerName: string,
    playerAvatar: string,
    lobbySize: number = 4,
    aiOpponents: number = 3,
    customization?: {
      animal: string;
      bodyColor: string;
      bodyType: "CHUNKY" | "SKINNY" | "MUSCULAR" | "TINY" | "PEAR";
      eyeStyle: string;
      accessories: {
        topHat: boolean;
        monocle: boolean;
        bowTie: boolean;
        scarf: boolean;
        vest: boolean;
      };
    }
  ) => {
    addLog(`Creating lobby with size ${lobbySize}...`);
    
    // Create deck (15 cards)
    const freshDeck: CardType[] = [];
    for (let i = 0; i < 3; i++) {
      freshDeck.push(...DECK_POOL);
    }
    // Fisher-Yates shuffle
    for (let i = freshDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [freshDeck[i], freshDeck[j]] = [freshDeck[j], freshDeck[i]];
    }

    const dealCard = (): CardType => freshDeck.pop()!;

    // Create Human Player
    const human: PlayerState = {
      id: "p0",
      name: playerName || "You",
      avatar: playerAvatar,
      coins: 2,
      cards: [dealCard(), dealCard()],
      revealedCards: [],
      isActive: true,
      isAI: false,
      bodyColor: customization?.bodyColor || "#4a148c",
      animal: customization?.animal || "Bear",
      bodyType: customization?.bodyType || "CHUNKY",
      eyeStyle: customization?.eyeStyle || "Normal",
      accessories: customization?.accessories || { topHat: false, monocle: false, bowTie: false, scarf: false, vest: false },
    };

    // Create AI Players
    const bots: PlayerState[] = [];
    const availableNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const availableRoles = [...BOT_ROLES].sort(() => Math.random() - 0.5);
    const botAnimals = ["Bear", "Rabbit", "Cat", "Fox", "Wolf", "Frog", "Raccoon", "Duck", "Goat", "Panda"];
    const botBodyTypes = ["CHUNKY", "SKINNY", "MUSCULAR", "TINY", "PEAR"] as const;
    const botColors = ["#8e0000", "#0a192f", "#0f5132", "#4a148c", "#e65100", "#111111", "#d7ccc8", "#004d40"];
    const botEyes = ["Normal", "Derpy", "Angry", "Sleepy"];

    for (let i = 0; i < Math.min(aiOpponents, lobbySize - 1); i++) {
      const botId = `p${i + 1}`;
      const randomAnimal = botAnimals[Math.floor(Math.random() * botAnimals.length)];
      const randomBodyType = botBodyTypes[Math.floor(Math.random() * botBodyTypes.length)];
      const randomColor = botColors[Math.floor(Math.random() * botColors.length)];
      const randomEye = botEyes[Math.floor(Math.random() * botEyes.length)];
      
      const accList = ["topHat", "monocle", "bowTie", "scarf", "vest"];
      const chosenAcc = Math.random() < 0.5 ? accList[Math.floor(Math.random() * accList.length)] : null;
      const accessories = {
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
        accessories,
      });
    }

    const allPlayers = [human, ...bots];

    // Deal Community Pile (3 cards)
    const communityCards = [dealCard(), dealCard(), dealCard()];

    // Remaining cards go to Public Pile
    const publicCards: CardType[] = [];
    while (freshDeck.length > 0) {
      publicCards.push(freshDeck.pop()!);
    }

    // Economy checks
    const totalCount = allPlayers.length * 2 + 3 + publicCards.length;
    console.log("Public:", publicCards);
    console.log("Community:", ["HIDDEN", "HIDDEN", "HIDDEN"]);
    console.log("Total:", totalCount);
    if (totalCount !== 15) throw new Error("Card dealing error: deck count mismatch.");

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
      logs: ["The cards are dealt. The spotlight is on.", `It is ${human.name}'s turn.`],
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
  const performAction = useCallback((actionType: string, targetId?: string) => {
    setState((prev) => {
      // Guard: must be in Action Selection stage, it must be the human's turn,
      // and there must be no active action currently pending (prevents double-clicks/double-moves).
      if (prev.stage !== "Action Selection" || prev.currentPlayerIdx !== 0 || prev.activeAction !== null) {
        return prev;
      }

      const actor = prev.players.find((p) => p.id === "p0")!;
      
      if (actor.coins >= 10 && actionType !== "Coup") return prev;
      if (actionType === "Assassinate" && actor.coins < 3) return prev;
      if (actionType === "Coup" && actor.coins < 7) return prev;

      const updatedPlayers = prev.players.map((p) => {
        if (p.id === "p0") {
          let coins = p.coins;
          if (actionType === "Assassinate") coins -= 3;
          return { ...p, coins };
        }
        return p;
      });

      const act: ActiveAction = { actionType, playerId: "p0", targetId };
      const otherPlayers = updatedPlayers.filter((p) => p.isActive && p.id !== "p0").map((p) => p.id);
      const targetPlayer = targetId ? prev.players.find((p) => p.id === targetId) : null;

      let logMessage = "";

      if (actionType === "Income") {
        logMessage = `You take Income (+1 coin).`;
        setTimeout(() => executeAction(act), 800);
        return {
          ...prev,
          players: updatedPlayers,
          activeAction: act,
          logs: [...prev.logs, logMessage].slice(-40)
        };
      }

      if (actionType === "Coup") {
        logMessage = `[COUP] You perform a COUP on ${targetPlayer?.name}!`;
        setTimeout(() => executeAction(act), 800);
        return {
          ...prev,
          players: updatedPlayers,
          activeAction: act,
          logs: [...prev.logs, logMessage].slice(-40)
        };
      }

      if (actionType === "Foreign Aid") {
        logMessage = `You claim Foreign Aid (+2 coins).`;
        return {
          ...prev,
          players: updatedPlayers,
          stage: "Block Window",
          activeAction: act,
          pendingBlockPlayers: otherPlayers,
          cameraFocus: 0,
          logs: [...prev.logs, logMessage].slice(-40)
        };
      }

      if (actionType === "Tax") {
        logMessage = `You claim TAX (+3 coins) using the Duke.`;
      } else if (actionType === "Steal") {
        logMessage = `You attempt to STEAL from ${targetPlayer?.name} (Captain).`;
      } else if (actionType === "Assassinate") {
        logMessage = `You attempt to ASSASSINATE ${targetPlayer?.name} (Assassin).`;
      } else if (actionType === "Exchange") {
        logMessage = `You claim EXCHANGE (Ambassador).`;
      }

      return {
        ...prev,
        players: updatedPlayers,
        stage: "Challenge Window",
        activeAction: act,
        pendingChallengePlayers: otherPlayers,
        cameraFocus: 0,
        logs: [...prev.logs, logMessage].slice(-40)
      };
    });
  }, [executeAction]);

  // Handle passing
  const passAction = useCallback((playerId: string) => {
    setState((prev) => {
      if (!prev.activeAction) return prev;
      const activeStage = prev.stage;

      // Double-pass guard: verify player is in the correct pending list
      if (activeStage === "Challenge Window" || activeStage === "Block Challenge Window") {
        if (!prev.pendingChallengePlayers.includes(playerId)) {
          return prev;
        }
      } else if (activeStage === "Block Window") {
        if (!prev.pendingBlockPlayers.includes(playerId)) {
          return prev;
        }
      } else {
        return prev;
      }

      const nextPendingChallenge = prev.pendingChallengePlayers.filter((id) => id !== playerId);
      const nextPendingBlock = prev.pendingBlockPlayers.filter((id) => id !== playerId);
      let newLogs = [...prev.logs];

      if (activeStage === "Challenge Window") {
        if (nextPendingChallenge.length === 0) {
          const act = prev.activeAction!;
          const targetId = act.targetId;

          if (act.actionType === "Foreign Aid") {
            const activeOthers = prev.players.filter((p) => p.isActive && p.id !== act.playerId).map((p) => p.id);
            newLogs.push(`No one challenged ${prev.players.find(p => p.id === act.playerId)?.name}. Waiting for blocks...`);
            return {
              ...prev,
              stage: "Block Window",
              pendingBlockPlayers: activeOthers,
              pendingChallengePlayers: [],
              logs: newLogs.slice(-40)
            };
          } else if (["Steal", "Assassinate"].includes(act.actionType)) {
            if (targetId) {
              newLogs.push(`No one challenged. Waiting for ${prev.players.find(p => p.id === targetId)?.name} to block...`);
              return {
                ...prev,
                stage: "Block Window",
                pendingBlockPlayers: [targetId],
                pendingChallengePlayers: [],
                cameraFocus: getSeatIdx(targetId, prev.players),
                logs: newLogs.slice(-40)
              };
            }
          }

          newLogs.push("Action proceeds to execution.");
          setTimeout(() => executeAction(act), 500);
          return {
            ...prev,
            stage: "Action Selection",
            pendingChallengePlayers: [],
            logs: newLogs.slice(-40)
          };
        }
        return {
          ...prev,
          pendingChallengePlayers: nextPendingChallenge,
        };
      }

      if (activeStage === "Block Window") {
        if (nextPendingBlock.length === 0) {
          const act = prev.activeAction!;
          newLogs.push("No blocks declared. Action succeeds.");
          setTimeout(() => executeAction(act), 500);
          return {
            ...prev,
            stage: "Action Selection",
            pendingBlockPlayers: [],
            logs: newLogs.slice(-40)
          };
        }
        return {
          ...prev,
          pendingBlockPlayers: nextPendingBlock,
        };
      }

      if (activeStage === "Block Challenge Window") {
        if (nextPendingChallenge.length === 0) {
          const blockActorId = prev.activeBlock!.playerId;
          newLogs.push(`Block by ${prev.players.find(p => p.id === blockActorId)?.name} succeeds. Action is blocked.`);
          
          const animId = Math.random().toString(36).substring(2, 9);
          
          const updatedPlayers = prev.players.map(p => ({ ...p }));
          let nextIdx = (prev.currentPlayerIdx + 1) % updatedPlayers.length;
          while (!updatedPlayers[nextIdx].isActive) {
            nextIdx = (nextIdx + 1) % updatedPlayers.length;
          }
          newLogs.push(`It is ${updatedPlayers[nextIdx].name}'s turn.`);
          
          return {
            ...prev,
            stage: "Action Selection",
            currentPlayerIdx: nextIdx,
            turnNumber: prev.turnNumber + 1,
            pendingChallengePlayers: [],
            activeAction: null,
            activeBlock: null,
            cameraFocus: nextIdx,
            logs: newLogs.slice(-40),
            animationEvent: { id: animId, type: "block_shield", actorId: blockActorId }
          };
        }
        return {
          ...prev,
          pendingChallengePlayers: nextPendingChallenge,
        };
      }

      return prev;
    });
  }, [executeAction, getSeatIdx]);

  // Handle challenge declaration
  const challengeAction = useCallback((challengerId: string) => {
    setState((prev) => {
      const activeStage = prev.stage;
      
      // Guard: challenger must be in pendingChallengePlayers
      if (!prev.pendingChallengePlayers.includes(challengerId)) {
        return prev;
      }

      const challenger = prev.players.find((p) => p.id === challengerId)!;
      let accusedId = "";
      let claimedCharacter: CardType = "Duke";

      if (activeStage === "Challenge Window") {
        accusedId = prev.activeAction!.playerId;
        const actType = prev.activeAction!.actionType;
        if (actType === "Foreign Aid" || actType === "Income" || actType === "Coup") {
          return prev;
        }
        if (actType === "Tax") claimedCharacter = "Duke";
        else if (actType === "Steal") claimedCharacter = "Captain";
        else if (actType === "Assassinate") claimedCharacter = "Assassin";
        else if (actType === "Exchange") claimedCharacter = "Ambassador";
      } else if (activeStage === "Block Challenge Window") {
        accusedId = prev.activeBlock!.playerId;
        claimedCharacter = prev.activeBlock!.character;
      } else {
        return prev;
      }

      const accused = prev.players.find((p) => p.id === accusedId)!;
      let newLogs = [...prev.logs];
      newLogs.push(`⚔️ ${challenger.name} CHALLENGES ${accused.name}'s claim of ${claimedCharacter}!`);

      return {
        ...prev,
        stage: "Reveal Card Challenge",
        challengeTargetId: accused.id,
        challengeChallengerId: challenger.id,
        cameraFocus: getSeatIdx(accused.id, prev.players),
        logs: newLogs.slice(-40)
      };
    });
  }, [getSeatIdx]);

  // Handle block declaration
  const blockAction = useCallback((blockerId: string, character: CardType) => {
    setState((prev) => {
      // Guard: blocker must be in pendingBlockPlayers
      if (!prev.pendingBlockPlayers.includes(blockerId)) {
        return prev;
      }

      const blocker = prev.players.find((p) => p.id === blockerId)!;
      const actorName = prev.players.find((p) => p.id === prev.activeAction?.playerId)?.name || "Player";
      
      let newLogs = [...prev.logs];
      newLogs.push(`🛡️ ${blocker.name} claims ${character} to block ${actorName}'s ${prev.activeAction?.actionType} action.`);

      const activeOthers = prev.players.filter((p) => p.isActive && p.id !== blockerId).map((p) => p.id);

      return {
        ...prev,
        stage: "Block Challenge Window",
        activeBlock: { playerId: blockerId, character },
        pendingChallengePlayers: activeOthers,
        cameraFocus: getSeatIdx(blockerId, prev.players),
        logs: newLogs.slice(-40)
      };
    });
  }, [getSeatIdx]);

  // Handle card reveal (discard and Web Audio integration)
  const revealCard = useCallback((revealerId: string, card: CardType) => {
    setState((prev) => {
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

      const currentPlayers = prev.players.map((p) => ({
        ...p,
        cards: [...p.cards],
        revealedCards: [...p.revealedCards],
      }));

      const actor = currentPlayers.find((p) => p.id === revealerId)!;
      const idx = actor.cards.indexOf(card);
      if (idx === -1) return prev;

      const updatedDiscard = [...prev.piles.discard, card];
      let newLogs = [...prev.logs];

      if (prev.stage === "Reveal Card Challenge") {
        const isBlockChallenge = prev.activeBlock !== null;
        let claimedCharacter: CardType = "Duke";
        const challengerId = prev.challengeChallengerId || "p0";

        if (isBlockChallenge) {
          claimedCharacter = prev.activeBlock!.character;
        } else {
          const actType = prev.activeAction!.actionType;
          if (actType === "Tax") claimedCharacter = "Duke";
          else if (actType === "Steal") claimedCharacter = "Captain";
          else if (actType === "Assassinate") claimedCharacter = "Assassin";
          else if (actType === "Exchange") claimedCharacter = "Ambassador";
        }

        const challenger = currentPlayers.find((p) => p.id === challengerId)!;

        if (card === claimedCharacter) {
          newLogs.push(`[REVEAL MATCHES] ${actor.name} was telling the truth. ${challenger.name} loses the challenge.`);
          actor.cards.splice(idx, 1);

          const animId = Math.random().toString(36).substring(2, 9);

          if (actor.id === "p0") {
            return {
              ...prev,
              players: currentPlayers,
              stage: "Shuffle Selection",
              provedCard: card,
              challengeChallengerId: challenger.id,
              revealLossPlayerId: challenger.id,
              revealLossReason: "failed_challenge",
              cameraFocus: 0,
              logs: newLogs.slice(-40),
              animationEvent: { id: animId, type: "challenge_reveal", actorId: actor.id, detail: card }
            };
          }

          const comm = [...prev.communitySecret];
          comm.push(card);
          comm.sort(() => Math.random() - 0.5);
          actor.cards.push(comm.pop()!);

          return {
            ...prev,
            players: currentPlayers,
            communitySecret: comm,
            stage: "Reveal Card Loss",
            revealLossPlayerId: challenger.id,
            revealLossReason: "failed_challenge",
            challengeChallengerId: challenger.id,
            cameraFocus: getSeatIdx(challenger.id, currentPlayers),
            logs: newLogs.slice(-40),
            animationEvent: { id: animId, type: "challenge_reveal", actorId: actor.id, detail: card }
          };
        } else {
          newLogs.push(`[BLUFF CALLED] ${actor.name} lied about having a ${claimedCharacter}.`);
          actor.cards.splice(idx, 1);
          actor.revealedCards.push(card);

          if (!isBlockChallenge && prev.activeAction?.actionType === "Assassinate") {
            actor.coins += 3;
            newLogs.push(`💰 ${actor.name} gets back 3 coins since their Assassinate action was successfully challenged.`);
          }

          if (actor.cards.length === 0) {
            actor.isActive = false;
            newLogs.push(`[ELIMINATED] ${actor.name} is ELIMINATED!`);
          }

          const winner = getWinner(currentPlayers);
          const isGameOver = winner !== null;
          const animId = Math.random().toString(36).substring(2, 9);

          if (isGameOver) {
            newLogs.push(`[VICTORY] Game over! ${winner.name} wins the match!`);
            return {
              ...prev,
              players: currentPlayers,
              stage: "Game Over",
              winnerName: winner.name,
              cameraFocus: getSeatIdx(winner.id, currentPlayers),
              lastDiscardedCard: card,
              logs: newLogs.slice(-40),
              piles: {
                ...prev.piles,
                discard: updatedDiscard
              },
              animationEvent: { id: animId, type: "slump", actorId: actor.id }
            };
          }

          if (isBlockChallenge) {
            const act = prev.activeAction!;
            setTimeout(() => executeAction(act), 1200);
            return {
              ...prev,
              players: currentPlayers,
              stage: "Action Selection",
              lastDiscardedCard: card,
              logs: newLogs.slice(-40),
              piles: {
                ...prev.piles,
                discard: updatedDiscard
              },
              animationEvent: { id: animId, type: "slump", actorId: actor.id }
            };
          } else {
            let nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
            while (!currentPlayers[nextIdx].isActive) {
              nextIdx = (nextIdx + 1) % currentPlayers.length;
            }
            newLogs.push(`It is ${currentPlayers[nextIdx].name}'s turn.`);
            return {
              ...prev,
              players: currentPlayers,
              stage: "Action Selection",
              currentPlayerIdx: nextIdx,
              turnNumber: prev.turnNumber + 1,
              activeAction: null,
              activeBlock: null,
              cameraFocus: nextIdx,
              lastDiscardedCard: card,
              logs: newLogs.slice(-40),
              piles: {
                ...prev.piles,
                discard: updatedDiscard
              },
              animationEvent: { id: animId, type: "slump", actorId: actor.id }
            };
          }
        }
      }

      if (prev.stage === "Reveal Card Loss") {
        actor.cards.splice(idx, 1);
        actor.revealedCards.push(card);
        
        newLogs.push(`${actor.name} discards ${card} as lost influence.`);

        if (actor.cards.length === 0) {
          actor.isActive = false;
          newLogs.push(`[ELIMINATED] ${actor.name} is ELIMINATED!`);
        }

        const winner = getWinner(currentPlayers);
        const isGameOver = winner !== null;
        const animId = Math.random().toString(36).substring(2, 9);

        if (isGameOver) {
          newLogs.push(`[VICTORY] Game over! ${winner.name} wins the match!`);
          return {
            ...prev,
            players: currentPlayers,
            stage: "Game Over",
            winnerName: winner.name,
            cameraFocus: getSeatIdx(winner.id, currentPlayers),
            lastDiscardedCard: card,
            logs: newLogs.slice(-40),
            piles: {
              ...prev.piles,
              discard: updatedDiscard
            },
            animationEvent: { id: animId, type: "slump", actorId: actor.id }
          };
        }

        const reason = prev.revealLossReason;

        if (reason === "failed_challenge") {
          const isBlockChallenge = prev.activeBlock !== null;
          if (isBlockChallenge) {
            let nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
            while (!currentPlayers[nextIdx].isActive) {
              nextIdx = (nextIdx + 1) % currentPlayers.length;
            }
            newLogs.push(`It is ${currentPlayers[nextIdx].name}'s turn.`);
            return {
              ...prev,
              players: currentPlayers,
              stage: "Action Selection",
              currentPlayerIdx: nextIdx,
              turnNumber: prev.turnNumber + 1,
              activeAction: null,
              activeBlock: null,
              cameraFocus: nextIdx,
              lastDiscardedCard: card,
              logs: newLogs.slice(-40),
              piles: {
                ...prev.piles,
                discard: updatedDiscard
              },
              animationEvent: { id: animId, type: "slump", actorId: actor.id }
            };
          } else {
            const action = prev.activeAction!;
            const targetId = action.targetId;
            const challengerId = prev.challengeChallengerId;

            const targetPlayer = currentPlayers.find(p => p.id === targetId);
            const isTargetActive = targetPlayer && targetPlayer.isActive && targetPlayer.cards.length > 0;

            if (isTargetActive && targetId && ["Steal", "Assassinate"].includes(action.actionType)) {
              return {
                ...prev,
                players: currentPlayers,
                stage: "Block Window",
                pendingBlockPlayers: [targetId],
                cameraFocus: getSeatIdx(targetId, currentPlayers),
                lastDiscardedCard: card,
                logs: newLogs.slice(-40),
                piles: {
                  ...prev.piles,
                  discard: updatedDiscard
                },
                animationEvent: { id: animId, type: "slump", actorId: actor.id }
              };
            } else {
              setTimeout(() => executeAction(action), 1200);
              return {
                ...prev,
                players: currentPlayers,
                stage: "Action Selection",
                lastDiscardedCard: card,
                logs: newLogs.slice(-40),
                piles: {
                  ...prev.piles,
                  discard: updatedDiscard
                },
                animationEvent: { id: animId, type: "slump", actorId: actor.id }
              };
            }
          }
        } else {
          let nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
          while (!currentPlayers[nextIdx].isActive) {
            nextIdx = (nextIdx + 1) % currentPlayers.length;
          }
          newLogs.push(`It is ${currentPlayers[nextIdx].name}'s turn.`);
          return {
            ...prev,
            players: currentPlayers,
            stage: "Action Selection",
            currentPlayerIdx: nextIdx,
            turnNumber: prev.turnNumber + 1,
            activeAction: null,
            activeBlock: null,
            cameraFocus: nextIdx,
            lastDiscardedCard: card,
            logs: newLogs.slice(-40),
            piles: {
              ...prev.piles,
              discard: updatedDiscard
            },
            animationEvent: { id: animId, type: "slump", actorId: actor.id }
          };
        }
      }

      return prev;
    });
  }, [executeAction, getSeatIdx, getWinner]);

  // Handle exchange keeps selection
  const exchangeSelect = useCallback((keep: CardType[]) => {
    setState((prev) => {
      if (!prev.activeAction) return prev;
      const actor = prev.players.find((p) => p.id === prev.activeAction!.playerId)!;
      
      const drawn = prev.exchangeDrawnCards;
      const hand = actor.cards;
      const pool = [...hand, ...drawn];
      
      const keepCounts = {} as Record<CardType, number>;
      keep.forEach(c => keepCounts[c] = (keepCounts[c] || 0) + 1);
      
      const returned: CardType[] = [];
      const tempPool = [...pool];
      tempPool.forEach(c => {
        if (keepCounts[c] && keepCounts[c] > 0) {
          keepCounts[c]--;
        } else {
          returned.push(c);
        }
      });

      const comm = [...prev.communitySecret];
      drawn.forEach(c => {
        const idx = comm.indexOf(c);
        if (idx !== -1) comm.splice(idx, 1);
      });
      comm.push(...returned);
      comm.sort(() => Math.random() - 0.5);

      const currentPlayers = prev.players.map((p) => {
        if (p.id === actor.id) {
          return {
            ...p,
            cards: keep,
          };
        }
        return p;
      });

      let newLogs = [...prev.logs];
      newLogs.push(`${actor.name} completed the Exchange.`);

      let nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
      while (!currentPlayers[nextIdx].isActive) {
        nextIdx = (nextIdx + 1) % currentPlayers.length;
      }
      newLogs.push(`It is ${currentPlayers[nextIdx].name}'s turn.`);

      return {
        ...prev,
        players: currentPlayers,
        communitySecret: comm,
        stage: "Action Selection",
        currentPlayerIdx: nextIdx,
        turnNumber: prev.turnNumber + 1,
        activeAction: null,
        activeBlock: null,
        exchangeDrawnCards: [],
        cameraFocus: nextIdx,
        logs: newLogs.slice(-40),
        piles: {
          ...prev.piles,
          community: prev.piles.community[0] === "HIDDEN" ? ["HIDDEN", "HIDDEN", "HIDDEN"] : comm
        }
      };
    });
  }, []);

  // Kick a player from the game
  const kickPlayer = useCallback((playerId: string) => {
    setState((prev) => {
      if (playerId === "p0") return prev;

      const target = prev.players.find((p) => p.id === playerId);
      if (!target || !target.isActive) return prev;

      let newLogs = [...prev.logs];
      newLogs.push(`[HOST KICK] Host kicked ${target.name} from the game.`);

      const currentPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          return { ...p, isActive: false, cards: [] as CardType[] };
        }
        return p;
      });

      const active = currentPlayers.filter((p) => p.isActive);
      const isGameOver = active.length === 1;
      if (isGameOver) {
        newLogs.push(`[VICTORY] Game over! ${active[0].name} wins the match!`);
      }

      let nextIdx = prev.currentPlayerIdx;
      if (prev.players[prev.currentPlayerIdx]?.id === playerId) {
        nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
        while (!currentPlayers[nextIdx].isActive) {
          nextIdx = (nextIdx + 1) % currentPlayers.length;
        }
        newLogs.push(`It is now ${currentPlayers[nextIdx].name}'s turn.`);
      }

      const pendingChallenge = prev.pendingChallengePlayers.filter((id) => id !== playerId);
      const pendingBlock = prev.pendingBlockPlayers.filter((id) => id !== playerId);

      let stage = prev.stage;
      let challengeTargetId = prev.challengeTargetId;
      let revealLossPlayerId = prev.revealLossPlayerId;
      let activeAction = prev.activeAction;
      let activeBlock = prev.activeBlock;

      if (stage === "Reveal Card Challenge" && challengeTargetId === playerId) {
        stage = "Action Selection";
        challengeTargetId = null;
        activeAction = null;
        activeBlock = null;
      } else if (stage === "Reveal Card Loss" && revealLossPlayerId === playerId) {
        stage = "Action Selection";
        revealLossPlayerId = null;
        activeAction = null;
        activeBlock = null;
      } else if (stage === "Exchange Selection" && activeAction?.playerId === playerId) {
        stage = "Action Selection";
        activeAction = null;
      }

      if (stage === "Challenge Window" && pendingChallenge.length === 0) {
        const act = activeAction!;
        if (act) {
          if (act.actionType === "Foreign Aid") {
            const activeOthers = currentPlayers.filter((p) => p.isActive && p.id !== act.playerId).map((p) => p.id);
            stage = "Block Window";
            return {
              ...prev,
              players: currentPlayers,
              stage: isGameOver ? "Game Over" : stage,
              winnerName: isGameOver ? active[0].name : prev.winnerName,
              currentPlayerIdx: nextIdx,
              pendingChallengePlayers: [],
              pendingBlockPlayers: activeOthers,
              challengeTargetId,
              revealLossPlayerId,
              activeAction,
              activeBlock,
              logs: newLogs.slice(-40)
            };
          } else if (["Steal", "Assassinate"].includes(act.actionType)) {
            if (act.targetId && currentPlayers.find((p) => p.id === act.targetId)?.isActive) {
              stage = "Block Window";
              return {
                ...prev,
                players: currentPlayers,
                stage: isGameOver ? "Game Over" : stage,
                winnerName: isGameOver ? active[0].name : prev.winnerName,
                currentPlayerIdx: nextIdx,
                pendingChallengePlayers: [],
                pendingBlockPlayers: [act.targetId],
                challengeTargetId,
                revealLossPlayerId,
                activeAction,
                activeBlock,
                logs: newLogs.slice(-40)
              };
            }
          }
          setTimeout(() => executeAction(act), 500);
          stage = "Action Selection";
        }
      }

      if (stage === "Block Window" && pendingBlock.length === 0) {
        const act = activeAction!;
        if (act) {
          setTimeout(() => executeAction(act), 500);
          stage = "Action Selection";
        }
      }

      if (stage === "Block Challenge Window" && pendingChallenge.length === 0) {
        const actorId = activeAction!.playerId;
        let nextIdx = (prev.currentPlayerIdx + 1) % currentPlayers.length;
        while (!currentPlayers[nextIdx].isActive) {
          nextIdx = (nextIdx + 1) % currentPlayers.length;
        }
        newLogs.push(`It is ${currentPlayers[nextIdx].name}'s turn.`);
        stage = "Action Selection";
        return {
          ...prev,
          players: currentPlayers,
          stage: isGameOver ? "Game Over" : stage,
          winnerName: isGameOver ? active[0].name : prev.winnerName,
          currentPlayerIdx: nextIdx,
          turnNumber: prev.turnNumber + 1,
          pendingChallengePlayers: [],
          activeAction: null,
          activeBlock: null,
          logs: newLogs.slice(-40)
        };
      }

      return {
        ...prev,
        players: currentPlayers,
        stage: isGameOver ? "Game Over" : stage,
        winnerName: isGameOver ? active[0].name : prev.winnerName,
        currentPlayerIdx: nextIdx,
        pendingChallengePlayers: pendingChallenge,
        pendingBlockPlayers: pendingBlock,
        challengeTargetId,
        revealLossPlayerId,
        activeAction,
        activeBlock,
        logs: newLogs.slice(-40)
      };
    });
  }, [executeAction]);

  // Vote Kick a player
  const voteKickPlayer = useCallback((playerId: string) => {
    if (playerId === "p0") return;
    
    setState((prev) => {
      const target = prev.players.find((p) => p.id === playerId);
      if (!target || !target.isActive) return prev;

      let newLogs = [...prev.logs];
      newLogs.push(`[VOTE KICK] Vote Kick initiated against ${target.name}...`);
      
      const voters = prev.players.filter((p) => p.isActive && p.id !== playerId);
      let yesVotes = 1;
      let noVotes = 0;

      voters.forEach((v) => {
        if (v.id === "p0") return;
        if (Math.random() < 0.8) {
          yesVotes++;
          newLogs.push(`[VOTE] ${v.name} voted YES to kick ${target.name}.`);
        } else {
          noVotes++;
          newLogs.push(`[VOTE] ${v.name} voted NO to kick ${target.name}.`);
        }
      });

      if (yesVotes > noVotes) {
        newLogs.push(`[VOTE PASSED] Vote passed (${yesVotes} vs ${noVotes})! ${target.name} has been kicked.`);
        setTimeout(() => kickPlayer(playerId), 50);
      } else {
        newLogs.push(`[VOTE FAILED] Vote failed (${yesVotes} vs ${noVotes}). ${target.name} remains in the game.`);
      }

      return {
        ...prev,
        logs: newLogs.slice(-40)
      };
    });
  }, [kickPlayer]);  const lastProcessedStateRef = useRef<string>("");
  const botDecisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStateTimeRef = useRef<number>(0);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (botDecisionTimerRef.current) {
        clearTimeout(botDecisionTimerRef.current);
      }
      if (turnTimerRef.current) {
        clearTimeout(turnTimerRef.current);
      }
    };
  }, []);

  // Watchdog deadlock prevention loop to recover from any hangs
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.stage === "Game Over" || state.stage === "Lobby") return;
      const now = Date.now();
      if (lastStateTimeRef.current > 0 && now - lastStateTimeRef.current > 8000) {
        console.warn("Watchdog detected game hang in stage:", state.stage);
        setState((prev) => {
          if (prev.stage === "Challenge Window" || prev.stage === "Block Challenge Window") {
            if (prev.pendingChallengePlayers.length > 0) {
              const stuckPlayerId = prev.pendingChallengePlayers[0];
              if (stuckPlayerId !== "p0") {
                addLog(`[WATCHDOG] Force-passing stuck player ${stuckPlayerId}`);
                setTimeout(() => {
                  passAction(stuckPlayerId);
                }, 50);
              }
            }
          } else if (prev.stage === "Block Window") {
            if (prev.pendingBlockPlayers.length > 0) {
              const stuckPlayerId = prev.pendingBlockPlayers[0];
              if (stuckPlayerId !== "p0") {
                addLog(`[WATCHDOG] Force-passing stuck player ${stuckPlayerId}`);
                setTimeout(() => {
                  passAction(stuckPlayerId);
                }, 50);
              }
            }
          } else if (prev.stage === "Reveal Card Challenge" && prev.challengeTargetId) {
            const stuckPlayerId = prev.challengeTargetId;
            if (stuckPlayerId !== "p0") {
              const p = prev.players.find(pl => pl.id === stuckPlayerId);
              if (p && p.cards.length > 0) {
                addLog(`[WATCHDOG] Force-revealing card for stuck player ${stuckPlayerId}`);
                setTimeout(() => {
                  revealCard(stuckPlayerId, p.cards[0]);
                }, 50);
              }
            }
          } else if (prev.stage === "Reveal Card Loss" && prev.revealLossPlayerId) {
            const stuckPlayerId = prev.revealLossPlayerId;
            if (stuckPlayerId !== "p0") {
              const p = prev.players.find(pl => pl.id === stuckPlayerId);
              if (p && p.cards.length > 0) {
                addLog(`[WATCHDOG] Force-discarding card for stuck player ${stuckPlayerId}`);
                setTimeout(() => {
                  revealCard(stuckPlayerId, p.cards[0]);
                }, 50);
              }
            }
          }
          return prev;
        });
        lastStateTimeRef.current = Date.now();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [state.stage, state.pendingChallengePlayers, state.pendingBlockPlayers, state.challengeTargetId, state.revealLossPlayerId, passAction, revealCard, addLog]);

  // AI BOT DECISION ENGINE
  useEffect(() => {
    if (state.stage === "Game Over" || state.currentPlayerIdx === -1) return;

    const stateKey = `${state.stage}-${state.currentPlayerIdx}-${state.pendingChallengePlayers.join(",")}-${state.pendingBlockPlayers.join(",")}-${state.revealLossPlayerId}-${state.challengeTargetId}`;
    
    if (lastProcessedStateRef.current === stateKey) {
      return;
    }

    if (botDecisionTimerRef.current) {
      clearTimeout(botDecisionTimerRef.current);
      botDecisionTimerRef.current = null;
    }

    lastProcessedStateRef.current = stateKey;
    lastStateTimeRef.current = Date.now();

    const activePlayer = state.players[state.currentPlayerIdx];

    // 1. Action Selection stage
    if (state.stage === "Action Selection") {
      if (activePlayer && activePlayer.isActive && activePlayer.isAI) {
        const botId = activePlayer.id;
        botDecisionTimerRef.current = setTimeout(() => {
          try {
            clearTurnWatchdog();
            const otherActive = state.players.filter((p) => p.isActive && p.id !== botId);
            if (otherActive.length === 0) return;
            const randomTarget = otherActive[Math.floor(Math.random() * otherActive.length)].id;
            
            let action = "Income";
            const isHonest = aiHonestyRef.current[botId];

            if (activePlayer.coins >= 10) {
              action = "Coup";
            } else if (isHonest) {
              const honestOptions = ["Income", "Foreign Aid"];
              if (activePlayer.coins >= 7) honestOptions.push("Coup");
              if (activePlayer.cards.includes("Duke")) honestOptions.push("Tax");
              if (activePlayer.cards.includes("Captain")) honestOptions.push("Steal");
              if (activePlayer.cards.includes("Assassin") && activePlayer.coins >= 3) honestOptions.push("Assassinate");
              if (activePlayer.cards.includes("Ambassador")) honestOptions.push("Exchange");
              
              action = honestOptions[Math.floor(Math.random() * honestOptions.length)];
            } else {
              const dice = Math.random();
              if (activePlayer.coins >= 7 && dice < 0.6) {
                action = "Coup";
              } else if (activePlayer.coins >= 3 && dice < 0.4) {
                action = "Assassinate";
              } else {
                const roll = Math.random();
                if (roll < 0.25) action = "Income";
                else if (roll < 0.5) action = "Foreign Aid";
                else if (roll < 0.7) action = "Tax";
                else if (roll < 0.85) action = "Steal";
                else action = "Exchange";
              }
            }

            clearTurnWatchdog();
            setState((prev) => {
              const act: ActiveAction = {
                actionType: action,
                playerId: botId,
                targetId: (action === "Assassinate" || action === "Steal" || action === "Coup") ? randomTarget : undefined
              };
              const targetPlayer = act.targetId ? prev.players.find(p => p.id === act.targetId) : null;

              if (action === "Income") {
                addLog(`${activePlayer.name} takes Income (+1 coin).`);
              } else if (action === "Coup") {
                addLog(`[COUP] ${activePlayer.name} performs a COUP on ${targetPlayer?.name}!`);
              } else if (action === "Foreign Aid") {
                addLog(`${activePlayer.name} claims Foreign Aid (+2 coins).`);
              } else if (action === "Tax") {
                addLog(`${activePlayer.name} claims TAX (+3 coins) using the Duke.`);
              } else if (action === "Steal") {
                addLog(`${activePlayer.name} attempts to STEAL from ${targetPlayer?.name} (Captain).`);
              } else if (action === "Assassinate") {
                addLog(`${activePlayer.name} attempts to ASSASSINATE ${targetPlayer?.name} (Assassin).`);
              } else if (action === "Exchange") {
                addLog(`${activePlayer.name} claims EXCHANGE (Ambassador).`);
              }

              const updatedPlayers = prev.players.map((p) => {
                if (p.id === botId) {
                  let coins = p.coins;
                  if (action === "Assassinate") coins -= 3;
                  return { ...p, coins };
                }
                return p;
              });

              if (action === "Income" || action === "Coup") {
                setTimeout(() => executeAction(act), 1200);
                return {
                  ...prev,
                  players: updatedPlayers,
                  activeAction: act,
                };
              }

              const otherIds = updatedPlayers.filter((p) => p.isActive && p.id !== botId).map((p) => p.id);

              if (action === "Foreign Aid") {
                return {
                  ...prev,
                  players: updatedPlayers,
                  stage: "Block Window",
                  activeAction: act,
                  pendingBlockPlayers: otherIds,
                };
              }

              return {
                ...prev,
                players: updatedPlayers,
                stage: "Challenge Window",
                activeAction: act,
                pendingChallengePlayers: otherIds,
              };
            });
          } catch (e) {
            console.error("AI Action Selection error:", e);
            // Recovery: force income and advance turn
            try {
              const act: ActiveAction = { actionType: "Income", playerId: botId };
              executeAction(act);
            } catch (innerErr) {
              console.error("Critical inner AI error, forcing nextTurn:", innerErr);
              advanceTurn();
            }
          }
        }, 2000);
      }
    }

    // 2. Challenge / Block Challenge window
    if (state.stage === "Challenge Window" || state.stage === "Block Challenge Window") {
      const activeAIBots = state.players.filter((p) => p.isActive && p.isAI && state.pendingChallengePlayers.includes(p.id));
      if (activeAIBots.length > 0) {
        const bot = activeAIBots[0];
        botDecisionTimerRef.current = setTimeout(() => {
          try {
            const act = state.activeAction;
            if (act && state.stage === "Challenge Window" && act.targetId === bot.id) {
              if (act.actionType === "Assassinate" && bot.cards.includes("Contessa")) {
                addLog(`🛡️ ${bot.name} chooses not to challenge the Assassinate because they hold a Contessa to block it.`);
                passAction(bot.id);
                return;
              }
              if (act.actionType === "Steal" && (bot.cards.includes("Captain") || bot.cards.includes("Ambassador"))) {
                addLog(`🛡️ ${bot.name} chooses not to challenge the Steal because they hold a blocking card.`);
                passAction(bot.id);
                return;
              }
            }

            if (act && act.actionType === "Assassinate" && act.targetId === bot.id && bot.cards.length === 1 && state.stage === "Challenge Window") {
              addLog(`⚡ [LAST STAND] ${bot.name} is in their last life and targeted by Assassinate. Calling a bluff regardless!`);
              challengeAction(bot.id);
              return;
            }

            // Card-counting logic
            let claimedCharacter: CardType | null = null;
            if (state.stage === "Challenge Window" && act) {
              const actType = act.actionType;
              if (actType === "Tax") claimedCharacter = "Duke";
              else if (actType === "Steal") claimedCharacter = "Captain";
              else if (actType === "Assassinate") claimedCharacter = "Assassin";
              else if (actType === "Exchange") claimedCharacter = "Ambassador";
            } else if (state.stage === "Block Challenge Window" && state.activeBlock) {
              claimedCharacter = state.activeBlock.character;
            }

            if (claimedCharacter) {
              const discardCount = state.piles.discard.filter((c) => c === claimedCharacter).length;
              const publicCount = state.piles.public.filter((c) => c === claimedCharacter).length;
              const myHandCount = bot.cards.filter((c) => c === claimedCharacter).length;
              const visibleCopies = discardCount + publicCount + myHandCount;

              if (visibleCopies >= 3) {
                addLog(`🧠 [CARD COUNTING] ${bot.name} knows all copies of ${claimedCharacter} are accounted for. Calling bluff!`);
                challengeAction(bot.id);
                return;
              }
            }

            const liesRoll = Math.random();
            const shouldChallenge = liesRoll < 0.15;

            if (shouldChallenge) {
              challengeAction(bot.id);
            } else {
              passAction(bot.id);
            }
          } catch (e) {
            console.error("AI Challenge Window error:", e);
            passAction(bot.id);
          }
        }, 1500 + Math.random() * 1000);
      }
    }

    // 3. Block Window
    if (state.stage === "Block Window") {
      const activeAIBots = state.players.filter((p) => p.isActive && p.isAI && state.pendingBlockPlayers.includes(p.id));
      if (activeAIBots.length > 0) {
        const bot = activeAIBots[0];
        botDecisionTimerRef.current = setTimeout(() => {
          try {
            const actType = state.activeAction!.actionType;
            const isHonest = aiHonestyRef.current[bot.id];

            let hasDuke = bot.cards.includes("Duke");
            let hasCaptain = bot.cards.includes("Captain");
            let hasAmbassador = bot.cards.includes("Ambassador");
            let hasContessa = bot.cards.includes("Contessa");

            let shouldBlock = false;
            let blockChar: CardType = "Contessa";

            if (actType === "Foreign Aid") {
              blockChar = "Duke";
              if (hasDuke) {
                shouldBlock = true;
              } else if (!isHonest && Math.random() < 0.25) {
                shouldBlock = true;
              }
            } else if (actType === "Steal") {
              if (hasCaptain) {
                blockChar = "Captain";
                shouldBlock = true;
              } else if (hasAmbassador) {
                blockChar = "Ambassador";
                shouldBlock = true;
              } else if (!isHonest && Math.random() < 0.3) {
                blockChar = Math.random() < 0.5 ? "Captain" : "Ambassador";
                shouldBlock = true;
              }
            } else if (actType === "Assassinate") {
              blockChar = "Contessa";
              if (hasContessa) {
                shouldBlock = true;
              } else {
                const isLastLife = bot.cards.length === 1;
                const bluffProb = isLastLife ? (isHonest ? 0.4 : 0.8) : (isHonest ? 0.0 : 0.3);
                if (Math.random() < bluffProb) {
                  shouldBlock = true;
                }
              }
            }

            if (shouldBlock) {
              blockAction(bot.id, blockChar);
            } else {
              passAction(bot.id);
            }
          } catch (e) {
            console.error("AI Block Window error:", e);
            passAction(bot.id);
          }
        }, 1500 + Math.random() * 1000);
      }
    }

    // 4. Reveal Card Challenge
    if (state.stage === "Reveal Card Challenge" && state.challengeTargetId) {
      const targetPlayer = state.players.find((p) => p.id === state.challengeTargetId);
      if (targetPlayer && targetPlayer.isActive && targetPlayer.isAI) {
        const botId = targetPlayer.id;
        botDecisionTimerRef.current = setTimeout(() => {
          try {
            let cardToReveal = targetPlayer.cards[0] || "Duke";
            let claimedCharacter: CardType = "Duke";

            const isBlockChallenge = state.activeBlock !== null;
            if (isBlockChallenge) {
              claimedCharacter = state.activeBlock!.character;
            } else {
              const actType = state.activeAction!.actionType;
              if (actType === "Tax") claimedCharacter = "Duke";
              else if (actType === "Steal") claimedCharacter = "Captain";
              else if (actType === "Assassinate") claimedCharacter = "Assassin";
              else if (actType === "Exchange") claimedCharacter = "Ambassador";
            }

            if (targetPlayer.cards.includes(claimedCharacter)) {
              cardToReveal = claimedCharacter;
            } else if (targetPlayer.cards.length > 0) {
              cardToReveal = targetPlayer.cards[Math.floor(Math.random() * targetPlayer.cards.length)];
            }

            revealCard(botId, cardToReveal);
          } catch (e) {
            console.error("AI Reveal Card Challenge error:", e);
            if (targetPlayer.cards.length > 0) {
              revealCard(botId, targetPlayer.cards[0]);
            } else {
              // Unconditional turn progression fallback
              advanceTurn();
            }
          }
        }, 2000);
      }
    }

    // 5. Reveal Card Loss
    if (state.stage === "Reveal Card Loss" && state.revealLossPlayerId) {
      const targetPlayer = state.players.find((p) => p.id === state.revealLossPlayerId);
      if (targetPlayer && targetPlayer.isActive && targetPlayer.isAI) {
        const botId = targetPlayer.id;
        botDecisionTimerRef.current = setTimeout(() => {
          try {
            const cards = targetPlayer.cards;
            if (cards.length > 0) {
              const cardToLose = cards[Math.floor(Math.random() * cards.length)];
              revealCard(botId, cardToLose);
            } else {
              advanceTurn();
            }
          } catch (e) {
            console.error("AI Reveal Card Loss error:", e);
            if (targetPlayer.cards.length > 0) {
              revealCard(botId, targetPlayer.cards[0]);
            } else {
              advanceTurn();
            }
          }
        }, 1500);
      }
    }

    // 6. Exchange Selection
    if (state.stage === "Exchange Selection" && state.activeAction) {
      const actPlayerId = state.activeAction.playerId;
      const actorPlayer = state.players.find((p) => p.id === actPlayerId);
      if (actorPlayer && actorPlayer.isActive && actorPlayer.isAI) {
        botDecisionTimerRef.current = setTimeout(() => {
          try {
            const hand = actorPlayer.cards;
            const drawn = state.exchangeDrawnCards;
            const pool = [...hand, ...drawn];
            
            const shuffled = pool.sort(() => Math.random() - 0.5);
            const keep = shuffled.slice(0, hand.length);
            
            exchangeSelect(keep);
          } catch (e) {
            console.error("AI Exchange Selection error:", e);
            exchangeSelect(actorPlayer.cards);
          }
        }, 2000);
      }
    }
  }, [state, addLog, executeAction, challengeAction, blockAction, revealCard, exchangeSelect, passAction, clearTurnWatchdog, advanceTurn]);


  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).gameState = state;
    }
  }, [state]);

  // Expose HUD/Global API hook methods
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).advanceTurnTest = async (count: number) => {
      let turnRan = 0;
      for (let i = 0; i < count; i++) {
        setState((prev) => {
          if (prev.stage === "Game Over" || prev.players.length === 0) return prev;
          let nextIdx = (prev.currentPlayerIdx + 1) % prev.players.length;
          while (!prev.players[nextIdx].isActive) {
            nextIdx = (nextIdx + 1) % prev.players.length;
          }
          turnRan++;
          return {
            ...prev,
            currentPlayerIdx: nextIdx,
            turnNumber: prev.turnNumber + 1,
            stage: "Action Selection",
            activeAction: null,
            activeBlock: null,
            challengeTargetId: null,
            challengeChallengerId: null,
            revealLossPlayerId: null,
            revealLossReason: null,
            cameraFocus: nextIdx,
            logs: [...prev.logs, `[TEST] Advanced turn to ${prev.players[nextIdx].name}.`].slice(-40)
          };
        });
        await new Promise(r => setTimeout(r, 60));
      }
      return turnRan === count;
    };

    (window as any).advanceTurn = () => {
      setState((prev) => {
        if (prev.stage === "Game Over" || prev.players.length === 0) return prev;
        let nextIdx = (prev.currentPlayerIdx + 1) % prev.players.length;
        while (!prev.players[nextIdx].isActive) {
          nextIdx = (nextIdx + 1) % prev.players.length;
        }
        return {
          ...prev,
          currentPlayerIdx: nextIdx,
          turnNumber: prev.turnNumber + 1,
          stage: "Action Selection",
          activeAction: null,
          activeBlock: null,
          challengeTargetId: null,
          challengeChallengerId: null,
          revealLossPlayerId: null,
          revealLossReason: null,
          cameraFocus: nextIdx,
          logs: [...prev.logs, `[TEST] Advanced turn to ${prev.players[nextIdx].name}.`].slice(-40)
        };
      });
    };

    (window as any).dealCards = (n: number) => {
      const freshDeck: CardType[] = [];
      const DECK_POOL: CardType[] = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
      for (let i = 0; i < 3; i++) {
        freshDeck.push(...DECK_POOL);
      }
      for (let i = freshDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [freshDeck[i], freshDeck[j]] = [freshDeck[j], freshDeck[i]];
      }

      const dealCard = (): CardType => freshDeck.pop()!;

      const playerCards: CardType[][] = [];
      for (let i = 0; i < n; i++) {
        playerCards.push([dealCard(), dealCard()]);
      }
      const communitySecret = [dealCard(), dealCard(), dealCard()];
      const publicCards: CardType[] = [];
      while (freshDeck.length > 0) {
        publicCards.push(freshDeck.pop()!);
      }

      // Synchronous mock update so TEST 6 asserts instantly
      const mockState = {
        ...(window as any).gameState,
        communitySecret,
        piles: {
          community: ["HIDDEN", "HIDDEN", "HIDDEN"],
          public: publicCards,
          discard: []
        }
      };
      (window as any).gameState = mockState;

      // Asynchronous React state update for component re-renders
      setState((prev) => ({
        ...prev,
        communitySecret,
        piles: {
          community: ["HIDDEN", "HIDDEN", "HIDDEN"],
          public: publicCards,
          discard: []
        }
      }));

      return {
        community: communitySecret,
        public: publicCards
      };
    };

    (window as any).setPlayerCount = (n: number) => {
      initGame("You", (window as any).localPlayerConfig?.avatar || "Duke", n, n - 1);
    };

    (window as any).setPlayerName = (seat: number, name: string) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p, idx) => idx === seat ? { ...p, name } : p)
      }));
    };

    (window as any).setPlayerEliminated = (seat: number) => {
      setState((prev) => {
        const updated = prev.players.map((p, idx) => idx === seat ? { ...p, isActive: false, cards: [] } : p);
        return {
          ...prev,
          players: updated
        };
      });
      if ((window as any).triggerReaction) {
        (window as any).triggerReaction(seat, "eliminated");
      }
    };

    (window as any).highlightActivePlayer = (seat: number) => {
      setState((prev) => ({
        ...prev,
        currentPlayerIdx: seat,
        cameraFocus: seat
      }));
    };

    (window as any).discardCard = (cardName: CardType, fromSeat: number) => {
      playDiscardThud();
      setState((prev) => {
        const player = prev.players[fromSeat];
        if (!player) return prev;

        const currentPlayers = prev.players.map((p, idx) => {
          if (idx === fromSeat) {
            const cards = [...p.cards];
            const rev = [...p.revealedCards];
            const cardIdx = cards.indexOf(cardName);
            if (cardIdx !== -1) {
              cards.splice(cardIdx, 1);
            }
            rev.push(cardName);
            return {
              ...p,
              cards,
              revealedCards: rev,
              isActive: cards.length > 0
            };
          }
          return p;
        });

        const discard = [...prev.piles.discard, cardName];

        return {
          ...prev,
          players: currentPlayers,
          lastDiscardedCard: cardName,
          piles: {
            ...prev.piles,
            discard
          }
        };
      });
    };

    (window as any).revealCommunityCards = () => {
      setState((prev) => ({
        ...prev,
        piles: {
          ...prev.piles,
          community: prev.communitySecret
        }
      }));
    };

    (window as any).hideCommunityCards = () => {
      setState((prev) => ({
        ...prev,
        piles: {
          ...prev.piles,
          community: ["HIDDEN", "HIDDEN", "HIDDEN"]
        }
      }));
    };

    (window as any).swapWithCommunity = (seatIndex: number, cardIndex: number) => {
      setState((prev) => {
        const p = prev.players[seatIndex];
        if (!p || p.cards.length === 0) return prev;

        const pCards = [...p.cards];
        const playerCardToSwap = pCards[0];

        const commCards = [...prev.communitySecret];
        const communityCardToSwap = commCards[cardIndex];

        pCards[0] = communityCardToSwap;
        commCards[cardIndex] = playerCardToSwap;

        const currentPlayers = prev.players.map((pl, idx) => {
          if (idx === seatIndex) {
            return {
              ...pl,
              cards: pCards
            };
          }
          return pl;
        });

        addLog(`${p.name} swapped a card with the community pile.`);

        return {
          ...prev,
          players: currentPlayers,
          communitySecret: commCards,
          piles: {
            ...prev.piles,
            community: prev.piles.community[0] === "HIDDEN" ? ["HIDDEN", "HIDDEN", "HIDDEN"] : commCards
          }
        };
      });
    };

    (window as any).removeFromPublic = (cardName: CardType) => {
      setState((prev) => {
        const pub = [...prev.piles.public];
        const idx = pub.indexOf(cardName);
        if (idx !== -1) {
          pub.splice(idx, 1);
        }
        return {
          ...prev,
          piles: {
            ...prev.piles,
            public: pub
          }
        };
      });
    };
  }, [initGame, addLog]);

  const pickShuffledCard = useCallback(() => {
    setState((prev) => {
      if (prev.stage !== "Shuffle Selection" || !prev.provedCard) return prev;

      // Add proved card to community secret cards
      const commSecret = [...prev.communitySecret];
      commSecret.push(prev.provedCard);

      // Fisher-Yates shuffle the 4 cards
      for (let i = commSecret.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [commSecret[i], commSecret[j]] = [commSecret[j], commSecret[i]];
      }

      // Draw the new card
      const newCard = commSecret.pop()!;

      // Add to human's hand
      const currentPlayers = prev.players.map((p) => {
        if (p.id === "p0") {
          return {
            ...p,
            cards: [...p.cards, newCard]
          };
        }
        return p;
      });

      addLog(`You shuffled your proved ${prev.provedCard} with the community cards and drew a new card.`);

      const challengerId = prev.challengeChallengerId!;

      return {
        ...prev,
        players: currentPlayers,
        communitySecret: commSecret,
        stage: "Reveal Card Loss",
        revealLossPlayerId: challengerId,
        revealLossReason: "failed_challenge",
        challengeChallengerId: challengerId,
        provedCard: null,
        cameraFocus: getSeatIdx(challengerId, currentPlayers),
      };
    });
  }, [addLog, getSeatIdx]);

  // Play synthesized Web Audio C5-E5-G5 jingle for coin counts changes
  const playCoinJingle = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const freqs = [523, 659, 784];
      freqs.forEach((freq, idx) => {
        const time = ctx.currentTime + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, time);
        
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + 0.08);
      });
    } catch (e) {
      console.warn("Web Audio coin jingle failed:", e);
    }
  }, []);

  const lastCoinsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (state.players.length === 0) return;
    let changed = false;
    state.players.forEach((p) => {
      const last = lastCoinsRef.current[p.id];
      if (last !== undefined && last !== p.coins) {
        changed = true;
      }
      lastCoinsRef.current[p.id] = p.coins;
    });
    if (changed) {
      playCoinJingle();
    }
  }, [state.players, playCoinJingle]);

  const returnToLobby = useCallback(() => {
    playReturnToScreenSound();
    if (typeof document !== "undefined" && document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        console.warn("Exit fullscreen rejected:", err);
      });
    }
    setState((prev) => ({
      ...prev,
      stage: "Lobby",
      players: [],
      currentPlayerIdx: -1,
      turnNumber: 0,
      activeAction: null,
      activeBlock: null,
      exchangeDrawnCards: []
    }));
  }, []);

  useEffect(() => {
    if (state.stage === "Game Over") {
      playApplauseSound();
    }
  }, [state.stage]);

  return {
    state,
    deck,
    initGame,
    performAction,
    passAction: () => passAction("p0"),
    challengeAction: () => challengeAction("p0"),
    blockAction: (character: CardType) => blockAction("p0", character),
    revealCard: (card: CardType) => revealCard("p0", card),
    exchangeSelect,
    kickPlayer,
    voteKickPlayer,
    pickShuffledCard,
    returnToLobby,
  };
}
