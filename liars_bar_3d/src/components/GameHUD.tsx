"use client";

import React, { useState } from "react";
import { GameState, CardType } from "../hooks/useCoupState";

function formatLogText(log: string) {
  const parts = log.split(/(Duke|Assassin|Captain|Ambassador|Contessa)/g);
  return parts.map((part, i) => {
    if (part === "Duke") return <span key={i} className="text-purple-400 font-semibold">Duke</span>;
    if (part === "Assassin") return <span key={i} className="text-white font-semibold">Assassin</span>;
    if (part === "Captain") return <span key={i} className="text-blue-400 font-semibold">Captain</span>;
    if (part === "Ambassador") return <span key={i} className="text-green-400 font-semibold">Ambassador</span>;
    if (part === "Contessa") return <span key={i} className="text-red-400 font-semibold">Contessa</span>;
    return part;
  });
}

interface GameHUDProps {
  gameState: GameState;
  onPerformAction: (actionType: string, targetId?: string) => void;
  onPass: () => void;
  onChallenge: () => void;
  onBlock: (character: CardType) => void;
  onReveal: (card: CardType) => void;
  onExchangeSelect: (keep: CardType[]) => void;
  onKickPlayer?: (playerId: string) => void;
  onVoteKickPlayer?: (playerId: string) => void;
  onShufflePick: () => void;
  isPeekHand: boolean;
  onTogglePeekHand: () => void;
  isStanding: boolean;
  onToggleStanding: () => void;
  onReturnToLobby: () => void;
}

export default function GameHUD({
  gameState,
  onPerformAction,
  onPass,
  onChallenge,
  onBlock,
  onReveal,
  onExchangeSelect,
  onKickPlayer,
  onVoteKickPlayer,
  onShufflePick,
  isPeekHand,
  onTogglePeekHand,
  isStanding,
  onToggleStanding,
  onReturnToLobby,
}: GameHUDProps) {
  const { stage, players, currentPlayerIdx, activeAction, activeBlock, pendingChallengePlayers, pendingBlockPlayers, challengeTargetId, revealLossPlayerId, exchangeDrawnCards } = gameState;

  const localPlayer = players.find((p) => p.id === "p0")!;
  const isActivePlayer = players[currentPlayerIdx]?.id === "p0" && stage === "Action Selection";
  
  const [showTargetModal, setShowTargetModal] = useState<string | null>(null); // Action name
  const [selectedExchangeIndices, setSelectedExchangeIndices] = useState<number[]>([]);
  const [showControls, setShowControls] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showLogsArchive, setShowLogsArchive] = useState(false);
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [gameState.logs]);
  const [clueNotes, setClueNotes] = useState<Record<string, Record<string, string>>>(() => {
    const initialNotes: Record<string, Record<string, string>> = {};
    ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"].forEach((role) => {
      initialNotes[role] = {};
    });
    return initialNotes;
  });

  React.useEffect(() => {
    if (stage === "Lobby") {
      setClueNotes({
        Duke: {},
        Assassin: {},
        Captain: {},
        Ambassador: {},
        Contessa: {}
      });
    }
  }, [stage]);

  const cycleNoteValue = (role: string, colId: string) => {
    setClueNotes(prev => {
      const current = prev[role]?.[colId] || "";
      let next = "";
      if (current === "") next = "✗";
      else if (current === "✗") next = "✓";
      else if (current === "✓") next = "?";
      else next = "";
      
      return {
        ...prev,
        [role]: {
          ...prev[role],
          [colId]: next
        }
      };
    });
  };

  // Targets picker logic
  const activeOpponents = players.filter((p) => p.isActive && p.id !== "p0");

  const handleActionClick = (actionName: string) => {
    if (["Steal", "Assassinate", "Coup"].includes(actionName)) {
      setShowTargetModal(actionName);
    } else {
      onPerformAction(actionName);
    }
  };

  const handleTargetSelect = (targetId: string) => {
    if (showTargetModal) {
      onPerformAction(showTargetModal, targetId);
      setShowTargetModal(null);
    }
  };

  // Challenge / block interaction checks
  const canChallenge = (stage === "Challenge Window" || stage === "Block Challenge Window") && pendingChallengePlayers.includes("p0");
  const canBlock = stage === "Block Window" && pendingBlockPlayers.includes("p0");
  const mustRevealChallenge = stage === "Reveal Card Challenge" && challengeTargetId === "p0";
  const mustRevealLoss = stage === "Reveal Card Loss" && revealLossPlayerId === "p0";

  // Action status message
  let statusText = `Waiting for ${players[currentPlayerIdx]?.name || "player"}...`;
  if (stage === "Game Over") statusText = "GAME OVER - The match has ended!";
  else if (isActivePlayer) statusText = "YOUR TURN - Choose an action";
  else if (canChallenge) statusText = "CHALLENGE WINDOW - Do you suspect a bluff?";
  else if (canBlock) statusText = "BLOCK WINDOW - Do you want to declare a block?";
  else if (mustRevealChallenge) statusText = "REVEAL CARD CHALLENGE - Prove your claim!";
  else if (mustRevealLoss) statusText = "REVEAL CARD LOSS - Choose a card to discard";
  else if (stage === "Exchange Selection" && activeAction?.playerId === "p0") statusText = "EXCHANGE - Choose cards to keep";
  else if (stage === "Shuffle Selection") statusText = "⚡ SUCCESSFUL CHALLENGE - Shuffle & Pick a new card!";

  // Exchange select logic helper
  const handleExchangeToggle = (idx: number, maxCount: number) => {
    setSelectedExchangeIndices((prev) => {
      if (prev.includes(idx)) {
        return prev.filter((i) => i !== idx);
      }
      if (prev.length < maxCount) {
        return [...prev, idx];
      }
      return prev;
    });
  };

  const submitExchange = () => {
    const hand = localPlayer.cards;
    const drawn = exchangeDrawnCards;
    const pool = [...hand, ...drawn];
    const keep = selectedExchangeIndices.map((i) => pool[i]);
    onExchangeSelect(keep);
    setSelectedExchangeIndices([]);
  };

  // Map detailed action messages
  let actionMsg = "";
  if (activeAction) {
    const actorName = players.find((p) => p.id === activeAction.playerId)?.name || "Player";
    const targetPlayerName = activeAction.targetId ? players.find((p) => p.id === activeAction.targetId)?.name : "";

    if (activeAction.actionType === "Steal") {
      actionMsg = `${actorName} is attempting to STEAL 2 coins from ${targetPlayerName}!`;
    } else if (activeAction.actionType === "Assassinate") {
      actionMsg = `${actorName} is attempting to ASSASSINATE ${targetPlayerName}!`;
    } else if (activeAction.actionType === "Coup") {
      actionMsg = `${actorName} launched a COUP on ${targetPlayerName}!`;
    } else if (activeAction.actionType === "Tax") {
      actionMsg = `${actorName} is claiming TAX (+3 coins).`;
    } else if (activeAction.actionType === "Foreign Aid") {
      actionMsg = `${actorName} is taking FOREIGN AID (+2 coins).`;
    } else if (activeAction.actionType === "Exchange") {
      actionMsg = `${actorName} is performing an Exchange.`;
    } else if (activeAction.actionType === "Income") {
      actionMsg = `${actorName} takes Income (+1 coin).`;
    } else {
      actionMsg = `${actorName} declared ${activeAction.actionType}.`;
    }
  }

  const noteColumns = [
    { id: "p0", label: "You", isEliminated: false },
    ...players.filter(p => p.id !== "p0").map(p => ({ id: p.id, label: p.name, isEliminated: !p.isActive })),
    { id: "piles", label: "Piles", isEliminated: false }
  ];

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6 pb-16">
      {/* TOP HEADER DETAILS */}
      <div className="flex justify-between items-start w-full">
        {/* Game Stats & Players list */}
        <div className="glass p-4 rounded-xl flex flex-col gap-3 pointer-events-auto border border-white/10 select-none text-sm w-72">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-amber-400 font-bold tracking-wide">COUP: LIAR&apos;S TAVERN</div>
              <div className="text-white/50 text-[10px]">
                Turn: <span className="text-white font-semibold">{gameState.turnNumber}</span> | Stage:{" "}
                <span className="text-amber-400 font-semibold">{stage}</span>
              </div>
            </div>
            <button
              onClick={() => setShowControls(true)}
              className="p-1 px-2 rounded bg-amber-400/10 hover:bg-amber-400/25 border border-amber-400/20 text-amber-300 text-[9px] font-bold tracking-wider transition cursor-pointer pointer-events-auto"
            >
              CONTROLS
            </button>
          </div>

          <div className="flex flex-col gap-2 border-t border-white/5 pt-2">
            <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Players</div>
            {players.map((p) => {
              const isTurn = players[currentPlayerIdx]?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-1.5 rounded-lg transition ${
                    isTurn ? "bg-amber-400/10 border border-amber-400/20" : "border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-10 bg-cover bg-center rounded border border-white/10 shrink-0"
                      style={{ backgroundImage: `url('/assets/${p.avatar.toLowerCase()}.png')` }}
                    />
                    <div className="flex flex-col">
                      <span className={`text-xs font-semibold ${p.isActive ? "text-white" : "text-white/30 line-through"}`}>
                        {p.name} {p.id === "p0" && " (You)"}
                      </span>
                      {p.isActive ? (
                        <span className="text-[9px] text-white/50">COINS: {p.coins} | CARDS: {p.cards.length}</span>
                      ) : (
                        <span className="text-[9px] text-red-500/70 font-semibold">ELIMINATED</span>
                      )}
                    </div>
                  </div>

                  {/* Kick buttons (Only show for active opponent bots) */}
                  {p.id !== "p0" && p.isActive && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => onVoteKickPlayer?.(p.id)}
                        title="Vote Kick"
                        className="p-1 px-2 rounded bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/20 text-cyan-300 text-[9px] font-bold tracking-wider transition cursor-pointer pointer-events-auto"
                      >
                        VOTE
                      </button>
                      <button
                        onClick={() => onKickPlayer?.(p.id)}
                        title="Host Kick (Instant)"
                        className="p-1 px-2 rounded bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-300 text-[9px] font-bold tracking-wider transition cursor-pointer pointer-events-auto"
                      >
                        KICK
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Action Announcements */}
        {activeAction && (
          <div className="glass px-6 py-3 rounded-full flex flex-col items-center gap-0.5 border border-cyan-500/20 shadow-lg shadow-cyan-950/20 select-none max-w-md text-center pointer-events-auto">
            <div className="text-xs uppercase tracking-widest text-cyan-400 font-semibold neon-glow-cyan">Active Declaration</div>
            <div className="text-sm font-bold text-white">
              {actionMsg}
            </div>
            {activeBlock && (
              <div className="text-xs text-red-400 mt-0.5 font-bold">
                ⚠️ Blocked by {players.find((p) => p.id === activeBlock.playerId)?.name} claiming{" "}
                <span className={`font-extrabold ${
                  activeBlock.character === "Duke" ? "text-purple-400" :
                  activeBlock.character === "Assassin" ? "text-white" :
                  activeBlock.character === "Captain" ? "text-blue-400" :
                  activeBlock.character === "Ambassador" ? "text-green-400" :
                  "text-red-400"
                }`}>
                  {activeBlock.character}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Logs & Graveyard Column */}
        <div className="flex flex-col gap-3 w-72 pointer-events-auto">
          {/* Quick HUD Log drawer toggle */}
          <div
            ref={logsContainerRef}
            onClick={() => setShowLogsArchive(true)}
            title="Click to expand logs history"
            className="glass max-h-44 p-3 overflow-y-auto rounded-xl border border-white/10 text-[11px] leading-relaxed text-white/70 flex flex-col gap-1.5 select-none scrollbar-thin scrollbar-thumb-white/10 cursor-pointer hover:border-amber-400/30 hover:bg-white/5 transition duration-150"
          >
            <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider sticky top-0 bg-[#0d0717]/95 pb-1 flex justify-between items-center">
              <span>Tavern Logs</span>
              <span className="text-[8px] text-white/40 normal-case">(Click to Expand)</span>
            </div>
            {gameState.logs.map((log, idx) => (
              <div key={idx} className="border-l-2 border-amber-400/50 pl-1.5">
                {formatLogText(log)}
              </div>
            ))}
          </div>

          {/* Graveyard (Discarded Cards) */}
          <div className="glass p-3 rounded-xl border border-white/10 text-[11px] leading-relaxed text-white/70 flex flex-col gap-1.5 select-none">
            <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider pb-1 border-b border-white/5">
              Graveyard (Public Cards)
            </div>
            {players.flatMap(p => p.revealedCards.map(c => ({ card: c, owner: p.name }))).length === 0 ? (
              <div className="text-white/30 italic text-center py-2 text-[10px]">No cards discarded yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5 py-1">
                {players.flatMap(p => p.revealedCards.map((c, i) => ({ card: c, owner: p.name, id: `${p.id}-${c}-${i}` }))).map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                      item.card === "Duke" ? "bg-purple-950/40 text-purple-300 border-purple-500/30" :
                      item.card === "Assassin" ? "bg-white/10 text-white border-white/30" :
                      item.card === "Captain" ? "bg-blue-950/40 text-blue-300 border-blue-500/30" :
                      item.card === "Ambassador" ? "bg-green-950/40 text-green-300 border-green-500/30" :
                      "bg-red-950/40 text-red-300 border-red-500/30"
                    }`}
                    title={`Discarded by ${item.owner}`}
                  >
                    <span className={`w-1 h-1 rounded-full ${
                      item.card === "Duke" ? "bg-purple-500" :
                      item.card === "Assassin" ? "bg-white" :
                      item.card === "Captain" ? "bg-blue-500" :
                      item.card === "Ambassador" ? "bg-green-500" :
                      "bg-red-500"
                    }`} />
                    <span>{item.card}</span>
                    <span className="text-white/40 text-[7px] font-normal">({item.owner})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Public Cards Pile */}
          <div className="glass p-3 rounded-xl border border-white/10 text-[11px] leading-relaxed text-white/70 flex flex-col gap-1.5 select-none">
            <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider pb-1 border-b border-white/5">
              Public Pile (Face Up)
            </div>
            {gameState.piles.public.length === 0 ? (
              <div className="text-white/30 italic text-center py-2 text-[10px]">No public cards.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5 py-1">
                {gameState.piles.public.map((card, idx) => (
                  <div
                    key={`hud-public-${idx}`}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                      card === "Duke" ? "bg-purple-950/40 text-purple-300 border-purple-500/30" :
                      card === "Assassin" ? "bg-white/10 text-white border-white/30" :
                      card === "Captain" ? "bg-blue-950/40 text-blue-300 border-blue-500/30" :
                      card === "Ambassador" ? "bg-green-950/40 text-green-300 border-green-500/30" :
                      "bg-red-950/40 text-red-300 border-red-500/30"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      card === "Duke" ? "bg-purple-500" :
                      card === "Assassin" ? "bg-white" :
                      card === "Captain" ? "bg-blue-500" :
                      card === "Ambassador" ? "bg-green-500" :
                      "bg-red-500"
                    }`} />
                    <span>{card}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Community Cards Pile */}
          <div className="glass p-3 rounded-xl border border-white/10 text-[11px] leading-relaxed text-white/70 flex flex-col gap-1.5 select-none">
            <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider pb-1 border-b border-white/5">
              Community Pile (Face Down)
            </div>
            <div className="flex items-center gap-2 py-1">
              {gameState.piles.community.map((card, idx) => (
                <div
                  key={`hud-community-${idx}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border bg-cyan-950/40 text-cyan-300 border-cyan-500/30 font-bold"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <span>{card === "HIDDEN" ? "HIDDEN" : card}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MID-SCREEN ACTION OVERLAYS */}
      <div className="flex flex-col items-center justify-center gap-4 flex-1">
        {/* Status text banner */}
        <div className="glass px-5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-amber-300 pointer-events-auto border border-amber-400/10 shadow shadow-amber-950/20 select-none animate-pulse">
          {statusText}
        </div>

        {/* Modal Target Selection Overlay */}
        {showTargetModal && (
          <div className="glass p-5 rounded-2xl border border-white/10 max-w-sm w-full flex flex-col gap-3 pointer-events-auto shadow-2xl">
            <h3 className="text-sm font-bold text-amber-400 text-center uppercase tracking-wider">Select Target</h3>
            <div className="flex flex-col gap-2">
              {activeOpponents.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTargetSelect(t.id)}
                  className="w-full py-2 rounded-lg border border-white/5 bg-white/5 hover:bg-cyan-400/20 hover:border-cyan-400/30 text-white font-medium transition duration-200 text-xs flex justify-between px-3 items-center"
                >
                  <span className="flex items-center gap-1.5">
                    <div
                      className="w-6 h-8 bg-cover bg-center rounded"
                      style={{ backgroundImage: `url('/assets/${t.avatar.toLowerCase()}.png')` }}
                    />
                    <span>{t.name}</span>
                  </span>
                  <span className="text-cyan-300 text-[10px]">COINS: {t.coins} | CARDS: {t.cards.length}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTargetModal(null)}
              className="w-full py-2 rounded-lg border border-white/10 text-white/60 hover:text-white bg-white/0 hover:bg-white/5 text-xs transition duration-200"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Exchange Modal Selection Overlay */}
        {stage === "Exchange Selection" && activeAction?.playerId === "p0" && (
          <div className="glass p-6 rounded-2xl border border-white/10 max-w-lg w-full flex flex-col items-center gap-4 pointer-events-auto shadow-2xl">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Card Exchange Choice</h3>
            <p className="text-xs text-white/60 text-center leading-relaxed">
              Choose exactly <span className="text-white font-bold">{localPlayer.cards.length}</span> cards to KEEP in your hand:
            </p>
            <div className="flex gap-3 justify-center">
              {[...localPlayer.cards, ...exchangeDrawnCards].map((card, idx) => {
                const isSelected = selectedExchangeIndices.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => handleExchangeToggle(idx, localPlayer.cards.length)}
                    className={`relative w-28 h-40 rounded-xl border overflow-hidden flex flex-col justify-end p-2.5 transition duration-300 shadow-lg ${
                      isSelected
                        ? "border-amber-400 shadow-amber-400/30 scale-105 ring-2 ring-amber-400/50"
                        : "border-white/10 bg-neutral-900 hover:border-white/30 hover:scale-102"
                    }`}
                    style={{
                      backgroundImage: card ? `linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%), url('/assets/${card.toLowerCase()}.png')` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  >
                    {/* Character Label */}
                    <div className="w-full text-center">
                      <span className={`text-[10px] font-extrabold tracking-wider uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                        card === "Duke" ? "text-purple-400" :
                        card === "Assassin" ? "text-white" :
                        card === "Captain" ? "text-blue-400" :
                        card === "Ambassador" ? "text-green-400" :
                        "text-red-400"
                      }`}>
                        {card || "Unknown"}
                      </span>
                    </div>

                    {/* Small indicator dot in top-right */}
                    <div className="absolute top-2 right-2 flex items-center justify-center">
                      <span className={`w-2 h-2 rounded-full shadow-lg ${
                        card === "Duke" ? "bg-purple-500 shadow-purple-500/50" :
                        card === "Assassin" ? "bg-white shadow-white/50" :
                        card === "Captain" ? "bg-blue-500 shadow-blue-500/50" :
                        card === "Ambassador" ? "bg-green-500 shadow-green-500/50" :
                        "bg-red-500 shadow-red-500/50"
                      }`} />
                    </div>

                    {/* Selection Checkmark overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-amber-400/10 border-2 border-amber-400 rounded-xl pointer-events-none flex items-center justify-center">
                        <div className="bg-amber-400 text-black rounded-full p-0.5 shadow-md shadow-amber-400/30">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={submitExchange}
              disabled={selectedExchangeIndices.length !== localPlayer.cards.length}
              className={`w-full py-3 rounded-xl font-bold transition duration-300 text-xs shadow-md ${
                selectedExchangeIndices.length === localPlayer.cards.length
                  ? "bg-amber-400 text-black hover:bg-amber-300 shadow-amber-400/20 cursor-pointer"
                  : "bg-white/5 text-white/30 border border-white/5 cursor-not-allowed"
              }`}
            >
              Confirm Selection
            </button>
          </div>
        )}

        {/* Shuffle Selection Overlay */}
        {stage === "Shuffle Selection" && (
          <div className="glass p-6 rounded-2xl border border-white/10 max-w-lg w-full flex flex-col items-center gap-4 pointer-events-auto shadow-2xl">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-t-transparent border-amber-400 rounded-full" />
              Interactive Shuffling
            </h3>
            <p className="text-xs text-white/60 text-center leading-relaxed">
              Your proved{" "}
              <span className={`font-extrabold ${
                gameState.provedCard === "Duke" ? "text-purple-400 shadow-[0_0_8px_#a855f7]" :
                gameState.provedCard === "Assassin" ? "text-white shadow-[0_0_8px_#ffffff]" :
                gameState.provedCard === "Captain" ? "text-blue-400 shadow-[0_0_8px_#3b82f6]" :
                gameState.provedCard === "Ambassador" ? "text-green-400 shadow-[0_0_8px_#22c55e]" :
                "text-red-400 shadow-[0_0_8px_#ef4444]"
              }`}>
                {gameState.provedCard}
              </span>{" "}
              is shuffled back into the deck.
              <br />
              Select one of the community cards below to pick your new card:
            </p>
            
            <div className="flex gap-4 justify-center py-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={onShufflePick}
                  className="group relative px-4 py-6 rounded-xl border border-white/10 bg-gradient-to-b from-[#1e0f33] to-[#0c051a] hover:border-amber-400 text-white flex flex-col items-center gap-2 w-24 h-36 justify-center shadow-lg hover:shadow-amber-400/20 transition duration-300 scale-100 hover:scale-105 cursor-pointer pointer-events-auto overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-amber-400/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  <div
                    className="w-12 h-18 bg-cover bg-center rounded border border-white/5 opacity-80 group-hover:opacity-100 transition duration-300"
                    style={{ backgroundImage: "url('/assets/card_back.png')" }}
                  />
                  <span className="text-[8px] text-white/40 group-hover:text-amber-400 font-mono tracking-wider font-bold">CARD {idx + 1}</span>
                </button>
              ))}
            </div>
            
            <div className="text-[10px] text-white/40 italic">The deck is wiggling on the table felt! Shuffle and pick.</div>
          </div>
        )}
      </div>

      {/* BOTTOM USER DASHBOARD PANEL */}
      <div className="w-full flex justify-center mt-auto pointer-events-auto">
        <div className="glass max-w-4xl w-full p-4 rounded-2xl border border-white/10 flex flex-col gap-3 shadow-2xl">
          {/* User Status Bar */}
          <div className="flex justify-between items-center px-2 text-xs border-b border-white/5 pb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-8 bg-cover bg-center rounded border border-white/10"
                style={{ backgroundImage: `url('/assets/${localPlayer?.avatar.toLowerCase()}.png')` }}
              />
              <span className="font-bold text-white">{localPlayer?.name} [YOU — {localPlayer?.avatar}]</span>
            </div>
            <div className="flex items-center gap-4">
               <button
                onClick={onTogglePeekHand}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition duration-200 pointer-events-auto cursor-pointer ${
                  isPeekHand
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-lg shadow-cyan-400/10"
                    : "bg-white/5 text-white/70 border-white/10 hover:border-white/20"
                }`}
              >
                {isPeekHand ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
                <span>{isPeekHand ? "Put Down" : "Peek Hand"}</span>
              </button>

              <button
                onClick={onToggleStanding}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition duration-200 pointer-events-auto cursor-pointer ${
                  isStanding
                    ? "bg-amber-500/20 text-amber-300 border-amber-400/40 shadow-lg shadow-amber-400/10"
                    : "bg-white/5 text-white/70 border-white/10 hover:border-white/20"
                }`}
              >
                {isStanding ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11.25l-3-3m0 0l-3 3m3-3v11.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{isStanding ? "Sit Down" : "Stand Up"}</span>
              </button>

              <div className="text-amber-400 font-bold">COINS: {localPlayer?.coins}</div>
              <div className="text-white/60">
                Hand:{" "}
                {localPlayer?.cards.map((c, i) => (
                  <span
                    key={i}
                    className={`font-semibold mr-1.5 ${
                      c === "Duke" ? "text-purple-400" :
                      c === "Assassin" ? "text-white" :
                      c === "Captain" ? "text-blue-400" :
                      c === "Ambassador" ? "text-green-400" :
                      "text-red-400"
                    }`}
                  >
                    {c}
                  </span>
                ))}
                {localPlayer?.revealedCards.map((c, i) => (
                  <span key={i} className="text-white/30 line-through mr-1.5">{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* User Interaction Controls */}
          <div className="flex gap-2 flex-wrap items-center justify-center">
            {isActivePlayer && (
              localPlayer.coins >= 10 ? (
                <button onClick={() => handleActionClick("Coup")} className="hud-btn bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-400 font-bold px-12 py-3 scale-105">
                  Coup <span className="hud-btn-desc font-bold text-red-300">Must Coup (10+ coins)</span>
                </button>
              ) : (
                <>
                  <button onClick={() => handleActionClick("Income")} className="hud-btn bg-white/5 hover:bg-white/10 border-white/10">
                    Income <span className="hud-btn-desc">+1 coin (safe)</span>
                  </button>
                  <button onClick={() => handleActionClick("Foreign Aid")} className="hud-btn bg-white/5 hover:bg-white/10 border-white/10">
                    Foreign Aid <span className="hud-btn-desc">+2 coins (blockable)</span>
                  </button>
                  <button onClick={() => handleActionClick("Tax")} className="hud-btn bg-amber-400/10 hover:bg-amber-400/20 border-amber-400/30 text-amber-300">
                    Tax <span className="hud-btn-desc">+3 coins (Duke)</span>
                  </button>
                  <button onClick={() => handleActionClick("Exchange")} className="hud-btn bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-400">
                    Exchange <span className="hud-btn-descSwap">Swap (Ambassador)</span>
                  </button>
                  <button onClick={() => handleActionClick("Steal")} className="hud-btn bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400">
                    Steal <span className="hud-btn-desc">Take 2 (Captain)</span>
                  </button>
                  
                  {localPlayer.coins >= 3 && (
                    <button onClick={() => handleActionClick("Assassinate")} className="hud-btn bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-400">
                      Assassinate <span className="hud-btn-desc">Kill 1 (costs 3)</span>
                    </button>
                  )}
                  {localPlayer.coins >= 7 && (
                    <button onClick={() => handleActionClick("Coup")} className="hud-btn bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-400 font-bold">
                      Coup <span className="hud-btn-desc">Kill 1 (costs 7)</span>
                    </button>
                  )}
                </>
              )
            )}

            {canChallenge && (
              <>
                <button onClick={onPass} className="hud-btn bg-white/5 hover:bg-white/10 border-white/10 px-8">
                  Pass <span className="hud-btn-desc">Accept action</span>
                </button>
                <button onClick={onChallenge} className="hud-btn bg-red-500/25 hover:bg-red-500/40 border-red-500/40 text-red-300 font-bold px-8">
                  Challenge <span className="hud-btn-desc">Call their bluff!</span>
                </button>
              </>
            )}

            {canBlock && (
              <>
                <button onClick={onPass} className="hud-btn bg-white/5 hover:bg-white/10 border-white/10 px-6">
                  Pass <span className="hud-btn-desc">Accept action</span>
                </button>
                {activeAction?.actionType === "Foreign Aid" && (
                  <button onClick={() => onBlock("Duke")} className="hud-btn bg-amber-400/20 hover:bg-amber-400/30 border-amber-400/40 text-amber-300 px-6">
                    Block: Duke <span className="hud-btn-desc">Claim Duke</span>
                  </button>
                )}
                {activeAction?.actionType === "Steal" && (
                  <>
                    <button onClick={() => onBlock("Captain")} className="hud-btn bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/40 text-blue-300 px-6">
                      Block: Captain <span className="hud-btn-desc">Claim Captain</span>
                    </button>
                    <button onClick={() => onBlock("Ambassador")} className="hud-btn bg-green-500/20 hover:bg-green-500/30 border-green-500/40 text-green-300 px-6">
                      Block: Ambassador <span className="hud-btn-desc">Claim Ambassador</span>
                    </button>
                  </>
                )}
                {activeAction?.actionType === "Assassinate" && (
                  <button onClick={() => onBlock("Contessa")} className="hud-btn bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-300 px-6">
                    Block: Contessa <span className="hud-btn-desc">Claim Contessa</span>
                  </button>
                )}
              </>
            )}

            {(mustRevealChallenge || mustRevealLoss) && (
              <div className="flex gap-2 items-center justify-center">
                {localPlayer.cards.map((card, idx) => (
                  <button
                    key={idx}
                    onClick={() => onReveal(card)}
                    className="px-8 py-3.5 rounded-xl border border-red-500/30 bg-red-950/20 hover:bg-red-500/20 text-red-300 hover:border-red-400 font-bold uppercase transition duration-200 text-xs shadow-md cursor-pointer flex flex-col items-center gap-1.5"
                  >
                    <span className={`w-3 h-3 rounded-full ${
                      card === "Duke" ? "bg-purple-500 shadow-[0_0_8px_#a855f7]" :
                      card === "Assassin" ? "bg-white shadow-[0_0_8px_#ffffff]" :
                      card === "Captain" ? "bg-blue-500 shadow-[0_0_8px_#3b82f6]" :
                      card === "Ambassador" ? "bg-green-500 shadow-[0_0_8px_#22c55e]" :
                      "bg-red-500 shadow-[0_0_8px_#ef4444]"
                    }`} />
                    <span>Reveal {card}</span>
                  </button>
                ))}
              </div>
            )}

            {!isActivePlayer && !canChallenge && !canBlock && !mustRevealChallenge && !mustRevealLoss && stage !== "Lobby" && (
              <div className="text-white/40 italic py-2 text-xs">Waiting for other players to complete their choices...</div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Notes Toggle Tab */}
      {stage !== "Lobby" && (
        <button
          onClick={() => setShowNotes(prev => !prev)}
          className="fixed left-0 top-[40%] -translate-y-1/2 z-40 bg-amber-400 hover:bg-amber-300 text-black font-black uppercase py-4 px-2 rounded-r-xl border border-l-0 border-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.35)] pointer-events-auto cursor-pointer flex flex-col items-center gap-2 hover:scale-105 active:scale-95 transition-all select-none"
        >
          <span className="text-sm">📝</span>
          <span className="text-[9px] tracking-widest font-black [writing-mode:vertical-lr] uppercase">
            Clue Notes
          </span>
        </button>
      )}

      {/* Clue Notes Side Drawer */}
      {showNotes && stage !== "Lobby" && (
        <div className="fixed inset-y-0 left-0 w-[420px] bg-[#0d0717]/95 backdrop-blur-xl border-r border-white/10 z-50 flex flex-col p-6 shadow-2xl pointer-events-auto animate-slide-in-left">
          <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
            <h3 className="font-cinzel text-sm font-bold tracking-widest text-amber-400 uppercase flex items-center gap-2">
              📝 CLUE-STYLE NOTES
            </h3>
            <button
              onClick={() => setShowNotes(false)}
              className="text-white/60 hover:text-white text-base font-bold cursor-pointer p-1"
            >
              ✕
            </button>
          </div>

          <p className="text-[10px] text-white/50 mb-4 leading-relaxed">
            Track card locations. Click cells to cycle state:
            <br />
            <span className="text-white/70 font-semibold">Empty</span> (Unknown) ➔{" "}
            <span className="text-red-400 font-bold">✗</span> (No) ➔{" "}
            <span className="text-green-400 font-bold">✓</span> (Yes) ➔{" "}
            <span className="text-yellow-400 font-bold">?</span> (Suspected)
          </p>

          <div className="flex-1 overflow-x-auto overflow-y-auto pr-1">
            <table className="w-full text-[11px] border-collapse select-none">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-[9px] uppercase tracking-wider">
                  <th className="py-2 text-left font-bold">Role / Card</th>
                  {noteColumns.map((col) => (
                    <th
                      key={col.id}
                      className={`py-2 px-1 text-center font-bold max-w-[80px] truncate ${
                        col.isEliminated ? "line-through text-red-500/50" : ""
                      }`}
                      title={col.label}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["Duke", "Assassin", "Captain", "Ambassador", "Contessa"].map((role) => (
                  <tr key={role} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className={`py-3 font-bold ${
                      role === "Duke" ? "text-purple-400" :
                      role === "Assassin" ? "text-white" :
                      role === "Captain" ? "text-blue-400" :
                      role === "Ambassador" ? "text-green-400" :
                      "text-red-400"
                    }`}>
                      {role}
                    </td>
                    {noteColumns.map((col) => {
                      const val = clueNotes[role]?.[col.id] || "";
                      return (
                        <td key={col.id} className="p-1 text-center">
                          <button
                            onClick={() => cycleNoteValue(role, col.id)}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition duration-150 cursor-pointer ${
                              val === "✗" ? "bg-red-500/20 border-red-500/40 text-red-400" :
                              val === "✓" ? "bg-green-500/20 border-green-500/40 text-green-400" :
                              val === "?" ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-400" :
                              "bg-black/20 border-white/5 hover:border-white/20 text-white/10 hover:text-white/30"
                            }`}
                          >
                            {val || "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 pt-4 mt-4 flex gap-3">
            <button
              onClick={() => {
                setClueNotes({
                  Duke: {},
                  Assassin: {},
                  Captain: {},
                  Ambassador: {},
                  Contessa: {}
                });
              }}
              className="w-1/2 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-white/70 hover:text-white transition text-xs font-bold uppercase cursor-pointer"
            >
              Reset Sheet
            </button>
            <button
              onClick={() => setShowNotes(false)}
              className="w-1/2 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black transition text-xs font-bold uppercase cursor-pointer"
            >
              Close Notes
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {stage === "Game Over" && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 pointer-events-auto">
          <div className="glass max-w-md w-full p-8 rounded-2xl border border-amber-400/30 shadow-2xl flex flex-col items-center gap-6 text-center animate-fade-in-scale">
            <div className="w-20 h-20 rounded-full bg-amber-400/10 border-2 border-amber-400 flex items-center justify-center animate-bounce shadow-[0_0_20px_rgba(251,191,36,0.35)]">
              {gameState.winnerName === localPlayer?.name ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-amber-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3-3V13.5m-12 5.25a3 3 0 0 0-3-3V13.5m15 0V10.5a3 3 0 0 0-3-3h-9a3 3 0 0 0-3 3v3m15 0h-1.5m-12 0h-1.5M15 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-red-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              )}
            </div>

            <div>
              <h2 className="font-cinzel text-3xl font-extrabold tracking-widest text-white uppercase drop-shadow">
                {gameState.winnerName === localPlayer?.name ? "Victory!" : "Defeated"}
              </h2>
              <p className="text-xs text-white/50 tracking-widest uppercase mt-1">
                The game has concluded
              </p>
            </div>

            <div className="w-full border-y border-white/10 py-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Ultimate Victor</span>
              <span className="text-xl font-bold text-amber-400">{gameState.winnerName || "Unknown"}</span>
            </div>

            <button
              onClick={onReturnToLobby}
              className="w-full py-3.5 rounded-xl font-extrabold bg-amber-400 text-black hover:bg-amber-300 transition duration-200 text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-400/20 hover:shadow-amber-400/30 transform hover:-translate-y-0.5 active:translate-y-0 pointer-events-auto"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

      {/* CONTROLS MODAL POPUP */}
      {showControls && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 pointer-events-auto">
          <div className="glass max-w-lg w-full p-6 md:p-8 rounded-2xl border border-cyan-400/25 shadow-2xl flex flex-col gap-5 text-left">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="font-cinzel text-lg font-bold tracking-widest text-amber-400 uppercase">
                Tavern Settings & Controls Guide
              </h3>
              <button
                onClick={() => setShowControls(false)}
                className="text-white/60 hover:text-white text-xl font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-4 text-xs leading-relaxed text-white/80 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="border-l-2 border-cyan-400 pl-3">
                <h4 className="font-bold text-cyan-400 uppercase tracking-wider text-[10px]">Head-Look (Mouse Look)</h4>
                <p className="text-white/70 mt-1">
                  • <strong>Desktop:</strong> Left-click and drag anywhere on the 3D screen, or click once on the canvas to engage <strong>Pointer Lock</strong> (which hides your cursor for raw mouse looking). Press <strong>Escape</strong> to release lock.<br/>
                  • <strong>Mobile / Touch:</strong> Swipe/drag a single finger to look around the bar counter. No WASD keys required.
                </p>
              </div>

              <div className="border-l-2 border-amber-400 pl-3">
                <h4 className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">Interactive Card Peeking</h4>
                <p className="text-white/70 mt-1">
                  Hover your mouse cursor over your cards at the bottom of the screen. They will elevate and face you privately. Hover out to return them face down.
                </p>
              </div>

              <div className="border-l-2 border-purple-400 pl-3">
                <h4 className="font-bold text-purple-400 uppercase tracking-wider text-[10px]">Community Cards & Shuffling</h4>
                <p className="text-white/70 mt-1">
                  • <strong>Visibility:</strong> The central wooden poker table features a physical Community Deck and Discard Spot marked with glowing floating HTML badges.<br/>
                  • <strong>Challenge Shuffle:</strong> Proving your card in a challenge vibrates the deck felt. Click any of the 3 community card buttons on the screen to draw a new card at random.
                </p>
              </div>

              <div className="border-l-2 border-red-400 pl-3">
                <h4 className="font-bold text-red-400 uppercase tracking-wider text-[10px]">Lobby Seating & Kick Options</h4>
                <p className="text-white/70 mt-1">
                  • Change total players and bot levels in the Lobby.<br/>
                  • If an opponent AI bot hordes turn time, click the **Host Kick** button in the list to instantly eliminate them, or **Vote Kick** to start a player vote.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowControls(false)}
              className="w-full mt-2 py-3 rounded-xl font-bold bg-amber-400 text-black hover:bg-amber-300 transition duration-200 text-xs uppercase cursor-pointer"
            >
              Back to Game
            </button>
          </div>
        </div>
      )}

      {/* Tavern Logs Archive Modal */}
      {showLogsArchive && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 pointer-events-auto">
          <div className="glass max-w-2xl w-full p-6 md:p-8 rounded-2xl border border-amber-400/25 shadow-2xl flex flex-col gap-4 max-h-[85vh] text-left animate-fade-in-scale">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 shrink-0">
              <h3 className="font-cinzel text-lg font-bold tracking-widest text-amber-400 uppercase flex items-center gap-2">
                📜 Tavern Log Archives
              </h3>
              <button
                onClick={() => setShowLogsArchive(false)}
                className="text-white/60 hover:text-white text-xl font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2 scrollbar-thin text-xs text-white/80 max-h-[60vh] select-text">
              {gameState.logs.map((log, idx) => (
                <div key={idx} className="border-l-2 border-amber-400 pl-3 py-1.5 bg-white/5 rounded-r">
                  {formatLogText(log)}
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowLogsArchive(false)}
              className="w-full py-3 rounded-xl font-bold bg-amber-400 text-black hover:bg-amber-300 transition duration-200 text-xs uppercase cursor-pointer shrink-0"
            >
              Back to Tavern
            </button>
          </div>
        </div>
      )}

      {/* Global Embedded HUD Styles */}
      <style jsx global>{`
        .glass {
          background: rgba(13, 6, 23, 0.7);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        .hud-btn {
          flex: 1;
          min-width: 130px;
          max-width: 180px;
          padding: 8px 12px;
          border-radius: 10px;
          border-width: 1px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          cursor: pointer;
          pointer-events: auto;
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .hud-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .hud-btn-desc {
          font-size: 8px;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.4);
          text-transform: none;
        }
        @keyframes slideInLeft {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in-scale {
          animation: fadeInScale 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }
      `}</style>
    </div>
  );
}
