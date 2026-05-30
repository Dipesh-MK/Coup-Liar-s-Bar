// WebSocket state manager & UI controller
let socket = null;
let myId = null;
let myName = "";
let isHost = false;
let previousState = null;
let selectedAvatar = "🧙‍♂️";
const playerAvatars = {};

// DOM Cache
const lobbyScreen = document.getElementById("lobby-screen");
const gameScreen = document.getElementById("game-screen");
const joinForm = document.getElementById("join-form");
const lobbyWaiting = document.getElementById("lobby-waiting");
const playerNameInput = document.getElementById("player-name-input");
const joinBtn = document.getElementById("join-btn");
const playersList = document.getElementById("players-list");
const startBtn = document.getElementById("start-btn");

const logConsole = document.getElementById("log-console");
const seatsContainer = document.getElementById("seats-container");
const actionOptions = document.getElementById("action-options");
const actionPanel = document.getElementById("action-panel");

const hudTurn = document.getElementById("hud-turn");
const hudStage = document.getElementById("hud-stage");
const hudActiveAction = document.getElementById("hud-active-action");

const targetModal = document.getElementById("target-modal");
const targetModalTitle = document.getElementById("target-modal-title");
const targetButtons = document.getElementById("target-buttons");
const targetCancelBtn = document.getElementById("target-cancel-btn");

const exchangeModal = document.getElementById("exchange-modal");
const exchangeCardsContainer = document.getElementById("exchange-cards-container");
const exchangeSubmitBtn = document.getElementById("exchange-submit-btn");

const animationLayer = document.getElementById("animation-layer");
const deckPile = document.getElementById("deck-pile");
const discardPile = document.getElementById("discard-pile");

// Initialize websocket
function initSocket() {
    const wsUri = `ws://${window.location.hostname}:8765`;
    socket = new WebSocket(wsUri);

    socket.onopen = () => {
        console.log("WebSocket connected successfully.");
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed.");
        // Auto-refresh lobby if disconnected
        setTimeout(() => window.location.reload(), 3000);
    };
}

// Router for server messages
function handleServerMessage(msg) {
    switch (msg.type) {
        case "welcome":
            myId = msg.player_id;
            myName = msg.name;
            isHost = msg.is_host;
            joinForm.classList.add("hidden");
            lobbyWaiting.classList.remove("hidden");
            if (isHost) {
                const totalSelect = document.getElementById("total-players-select");
                const aiSelect = document.getElementById("ai-count-select");
                const totalPlayers = totalSelect ? parseInt(totalSelect.value, 10) : 3;
                const aiCount = aiSelect ? parseInt(aiSelect.value, 10) : 2;
                socket.send(JSON.stringify({
                    "type": "configure_lobby",
                    "total_players": totalPlayers,
                    "ai_count": aiCount
                }));
            }
            break;

        case "lobby":
            updateLobby(msg.players, msg.host_id);
            break;

        case "message":
            addLogMessage(msg.text);
            break;

        case "state":
            renderGameState(msg.view);
            break;

        case "game_over":
            handleGameOver(msg);
            break;

        case "error":
            alert(msg.message);
            break;
    }
}

// Lobby rendering
function updateLobby(players, hostId) {
    playersList.innerHTML = "";
    players.forEach(p => {
        if (p.avatar) {
            playerAvatars[p.id] = p.avatar;
        }

        const li = document.createElement("li");
        
        // Render avatar emoji prefix
        const avatarSpan = document.createElement("span");
        avatarSpan.style.marginRight = "10px";
        avatarSpan.textContent = p.avatar || "🤖";
        li.appendChild(avatarSpan);

        const nameSpan = document.createElement("span");
        nameSpan.textContent = p.name + (p.id === myId ? " [YOU]" : "");
        nameSpan.style.fontWeight = p.id === myId ? "800" : "400";
        li.appendChild(nameSpan);

        if (p.id === hostId) {
            const roleSpan = document.createElement("span");
            roleSpan.className = "player-role";
            roleSpan.textContent = "Host";
            li.appendChild(roleSpan);
        }
        playersList.appendChild(li);
    });

    if (myId === hostId && isHost) {
        startBtn.classList.remove("hidden");
    } else {
        startBtn.classList.add("hidden");
    }
}

// Logging sidebar messages
function addLogMessage(text) {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    
    if (text.includes("challenged") || text.includes("Challenge")) {
        entry.classList.add("challenge-log");
    } else if (text.includes("blocked") || text.includes("Block")) {
        entry.classList.add("block-log");
    } else if (text.includes("eliminated")) {
        entry.classList.add("eliminated-log");
    }
    
    entry.textContent = text;
    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
}

// Main Game Rendering Loop
function renderGameState(view) {
    if (!gameScreen.classList.contains("active")) {
        lobbyScreen.classList.remove("active");
        gameScreen.classList.add("active");
        addLogMessage("The game has commenced!");
    }

    // 1. HUD and stage details
    hudTurn.textContent = `Turn ${view.turn_number}`;
    hudStage.textContent = view.stage;
    
    if (view.active_action) {
        const actionType = view.active_action.action_type;
        const actorId = view.active_action.player_id;
        const actorName = getPlayerName(view, actorId);
        const targetId = view.active_action.target_id;
        const targetStr = targetId ? ` targeting ${getPlayerName(view, targetId)}` : "";
        hudActiveAction.textContent = `${actorName} declared ${actionType}${targetStr}`;
        hudActiveAction.classList.remove("hidden");
    } else {
        hudActiveAction.textContent = "No Active Action";
        hudActiveAction.classList.add("hidden");
    }

    // 2. Center deck remainder
    const deckCountEl = document.querySelector(".deck-count");
    if (deckCountEl) {
        deckCountEl.textContent = view.deck.hidden_community_count + view.deck.public_deck.length;
    }

    // 2b. Public cards remainder
    const publicContainer = document.getElementById("public-cards-container");
    if (publicContainer) {
        publicContainer.innerHTML = "";
        const publicDeck = view.deck.public_deck || [];
        if (publicDeck.length > 0) {
            document.getElementById("public-cards-area").classList.remove("hidden");
            publicDeck.forEach(card => {
                const cardEl = document.createElement("div");
                cardEl.className = `public-card-item card-${card}`;
                cardEl.textContent = card;
                publicContainer.appendChild(cardEl);
            });
        } else {
            document.getElementById("public-cards-area").classList.add("hidden");
        }
    }

    // 3. Center Discard pile
    const discardPileEl = document.getElementById("discard-pile");
    if (discardPileEl) {
        if (view.deck.discard_pile && view.deck.discard_pile.length > 0) {
            discardPileEl.className = "discard-pile has-card";
            const lastDiscard = view.deck.discard_pile[view.deck.discard_pile.length - 1];
            discardPileEl.innerHTML = `<div class="card-face card-${lastDiscard}">${lastDiscard}</div>`;
        } else {
            discardPileEl.className = "discard-pile empty";
            discardPileEl.innerHTML = `<div class="card-face">None</div>`;
        }
    }

    // 4. Position players around circular felt table
    renderSeats(view);

    // 5. Diff-based animations
    if (previousState) {
        triggerDiffAnimations(previousState, view);
    }

    // 6. Action selections
    renderActionPanel(view);

    // Save state for comparison
    previousState = view;
}

function getPlayerName(view, pid) {
    const player = view.players.find(p => p.player_id === pid);
    return player ? player.name : pid;
}

// Position players around the table dynamically. Local client sits at bottom (Seat 0).
function renderSeats(view) {
    seatsContainer.innerHTML = "";
    
    const players = view.players;
    const numPlayers = players.length;
    
    // Find local player index in view.players
    let myIndex = players.findIndex(p => p.player_id === myId);
    if (myIndex === -1) myIndex = 0; // fallback if specator

    // We mapping seats around the board:
    // Bottom index is always local player, rest clock-wise
    const seatPositions = getSeatLayoutMap(numPlayers);

    players.forEach((player, idx) => {
        // Relative index
        const relativeIdx = (idx - myIndex + numPlayers) % numPlayers;
        const seatNum = seatPositions[relativeIdx];

        const seatDiv = document.createElement("div");
        seatDiv.className = `seat seat-${seatNum}`;
        if (!player.is_active) {
            seatDiv.classList.add("eliminated");
        }
        
        // Highlights whose turn it is
        const currentIdx = view.current_player_idx;
        if (currentIdx !== -1 && players[currentIdx].player_id === player.player_id && view.stage === "Action Selection") {
            seatDiv.classList.add("active-turn");
        } else if (
            (view.stage === "Challenge Window" && view.pending_challenge_players.includes(player.player_id)) ||
            (view.stage === "Block Window" && view.pending_block_players.includes(player.player_id)) ||
            (view.stage === "Block Challenge Window" && view.pending_challenge_players.includes(player.player_id)) ||
            (view.stage === "Reveal Card Challenge" && view.challenge_target_id === player.player_id) ||
            (view.stage === "Reveal Card Loss" && view.reveal_loss_player_id === player.player_id) ||
            (view.stage === "Exchange Selection" && view.active_action.player_id === player.player_id)
        ) {
            seatDiv.classList.add("active-turn");
        }

        // Info card
        const cardDiv = document.createElement("div");
        cardDiv.className = "seat-card";
        cardDiv.id = `seat-card-${player.player_id}`;

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = playerAvatars[player.player_id] || (player.name ? player.name[0].toUpperCase() : "?");
        cardDiv.appendChild(avatar);

        const details = document.createElement("div");
        details.className = "seat-details";

        const nameSpan = document.createElement("div");
        nameSpan.className = "seat-name";
        nameSpan.textContent = player.name + (player.player_id === myId ? " [YOU]" : "");
        details.appendChild(nameSpan);

        const coinsSpan = document.createElement("div");
        coinsSpan.className = "seat-coins";
        coinsSpan.innerHTML = `🪙 <span class="coin-count">${player.coins}</span>`;
        details.appendChild(coinsSpan);

        cardDiv.appendChild(details);
        seatDiv.appendChild(cardDiv);

        // Hand cards
        const cardsDiv = document.createElement("div");
        cardsDiv.className = "seat-cards";

        player.cards.forEach((card, cIdx) => {
            const cardItem = document.createElement("div");
            cardItem.className = "seat-card-item";
            
            if (player.player_id === myId) {
                // Front view for local client hand cards
                cardItem.classList.add(`card-${card}`);
                
                const cardFront = document.createElement("div");
                cardFront.className = "card-face-front";
                
                const title = document.createElement("div");
                title.className = "card-title";
                title.textContent = card;
                
                const art = document.createElement("div");
                art.className = "card-art";
                art.textContent = getCardArtIcon(card);

                const desc = document.createElement("div");
                desc.className = "card-role-desc";
                desc.textContent = getCardRoleDesc(card);

                cardFront.appendChild(title);
                cardFront.appendChild(art);
                cardFront.appendChild(desc);
                cardItem.appendChild(cardFront);

                // Reveal card interactions (for challenges / losses)
                if (
                    (view.stage === "Reveal Card Challenge" && view.challenge_target_id === myId) ||
                    (view.stage === "Reveal Card Loss" && view.reveal_loss_player_id === myId)
                ) {
                    cardItem.classList.add("peek-interactive");
                    cardItem.addEventListener("click", () => {
                        sendAction({"action": "reveal", "character": card});
                    });
                }
            } else {
                // Opponent card back
                cardItem.classList.add("card-hidden");
            }
            cardsDiv.appendChild(cardItem);
        });

        // Discarded/revealed cards
        player.revealed_cards.forEach(card => {
            const cardItem = document.createElement("div");
            cardItem.className = `seat-card-item card-revealed card-${card}`;
            
            const lbl = document.createElement("div");
            lbl.className = "card-lbl";
            lbl.textContent = card;
            cardItem.appendChild(lbl);
            
            cardsDiv.appendChild(cardItem);
        });

        seatDiv.appendChild(cardsDiv);
        seatsContainer.appendChild(seatDiv);
    });
}

function getSeatLayoutMap(numPlayers) {
    // Balances visual seating layouts depending on lobby size
    if (numPlayers === 2) return [0, 3];
    if (numPlayers === 3) return [0, 2, 4];
    if (numPlayers === 4) return [0, 1, 3, 5];
    if (numPlayers === 5) return [0, 1, 2, 4, 5];
    return [0, 1, 2, 3, 4, 5];
}

function getCardArtIcon(card) {
    switch (card) {
        case "Duke": return "👑";
        case "Assassin": return "🗡️";
        case "Captain": return "⚓";
        case "Ambassador": return "📜";
        case "Contessa": return "🛡️";
        default: return "🃏";
    }
}

function getCardRoleDesc(card) {
    switch (card) {
        case "Duke": return "Draws 3 coins (Tax). Blocks Foreign Aid.";
        case "Assassin": return "Costs 3 coins to assassinate another player.";
        case "Captain": return "Steals 2 coins from another. Blocks Steals.";
        case "Ambassador": return "Draws 2 cards to exchange. Blocks Steals.";
        case "Contessa": return "Blocks Assassination actions.";
        default: return "";
    }
}

// Action panels button builder
function renderActionPanel(view) {
    actionOptions.innerHTML = "";

    const activePid = view.players[view.current_player_idx]?.player_id;
    const isMyTurn = isMyTurnToAct(view);

    if (!isMyTurn) {
        actionPanel.classList.add("disabled");
        actionOptions.innerHTML = `<div class="waiting-turn-hud">Waiting for player turns...</div>`;
        return;
    }

    actionPanel.classList.remove("disabled");

    const stage = view.stage;
    const player = view.players.find(p => p.player_id === myId);

    if (stage === "Action Selection") {
        const coins = player.coins;
        const targets = view.players.filter(p => p.is_active && p.player_id !== myId);

        if (coins >= 10) {
            // Mandatory Coup
            targets.forEach(t => {
                createActionButton("Coup", `Target ${t.name}`, () => {
                    sendAction({"action": "Coup", "target_id": t.player_id});
                });
            });
            return;
        }

        // Standard actions
        createActionButton("Income", "Gain 1 Coin (Safe)", () => sendAction({"action": "Income"}));
        
        createActionButton("Foreign Aid", "Gain 2 Coins (Blockable)", () => sendAction({"action": "Foreign Aid"}));
        
        createActionButton("Tax", "Gain 3 Coins (Claim Duke)", () => sendAction({"action": "Tax"}));
        
        createActionButton("Exchange", "Draw 2 Cards (Claim Ambassador)", () => sendAction({"action": "Exchange"}));

        // Target selections
        createActionButton("Steal", "Steal 2 Coins (Claim Captain)", () => {
            openTargetModal("Steal", targets, (tId) => {
                sendAction({"action": "Steal", "target_id": tId});
            });
        });

        if (coins >= 3) {
            createActionButton("Assassinate", "Kill 1 Influence (Costs 3, Claim Assassin)", () => {
                openTargetModal("Assassinate", targets, (tId) => {
                    sendAction({"action": "Assassinate", "target_id": tId});
                });
            });
        }

        if (coins >= 7) {
            createActionButton("Coup", "Kill 1 Influence (Costs 7, Safe)", () => {
                openTargetModal("Coup", targets, (tId) => {
                    sendAction({"action": "Coup", "target_id": tId});
                });
            });
        }

    } else if (stage === "Challenge Window" || stage === "Block Challenge Window") {
        createActionButton("Pass", "Accept action", () => sendAction({"action": "pass"}));
        createActionButton("Challenge", "Suspect bluff!", () => sendAction({"action": "challenge"}));

    } else if (stage === "Block Window") {
        createActionButton("Pass", "Accept action", () => sendAction({"action": "pass"}));
        
        const actionType = view.active_action.action_type;
        if (actionType === "Foreign Aid") {
            createActionButton("Block: Duke", "Claim Duke to block", () => sendAction({"action": "block", "character": "Duke"}));
        } else if (actionType === "Steal") {
            createActionButton("Block: Captain", "Claim Captain", () => sendAction({"action": "block", "character": "Captain"}));
            createActionButton("Block: Ambassador", "Claim Ambassador", () => sendAction({"action": "block", "character": "Ambassador"}));
        } else if (actionType === "Assassinate") {
            createActionButton("Block: Contessa", "Claim Contessa", () => sendAction({"action": "block", "character": "Contessa"}));
        }

    } else if (stage === "Reveal Card Challenge" || stage === "Reveal Card Loss") {
        actionOptions.innerHTML = `<div class="waiting-turn-hud select-card-blink">CLICK A CARD IN YOUR HAND BELOW TO REVEAL IT</div>`;
        
    } else if (stage === "Exchange Selection") {
        // Exchange selection uses the special wide modal
        openExchangeModal(view);
    }
}

function createActionButton(title, description, callback) {
    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.innerHTML = `${title} <span class="btn-desc">${description}</span>`;
    btn.addEventListener("click", callback);
    actionOptions.appendChild(btn);
}

function isMyTurnToAct(view) {
    const stage = view.stage;
    const players = view.players;

    if (stage === "Action Selection") {
        const idx = view.current_player_idx;
        return idx !== -1 && players[idx].player_id === myId;
    } else if (stage === "Challenge Window" || stage === "Block Challenge Window") {
        return view.pending_challenge_players.includes(myId);
    } else if (stage === "Block Window") {
        return view.pending_block_players.includes(myId);
    } else if (stage === "Reveal Card Challenge") {
        return view.challenge_target_id === myId;
    } else if (stage === "Reveal Card Loss") {
        return view.reveal_loss_player_id === myId;
    } else if (stage === "Exchange Selection") {
        return view.active_action.player_id === myId;
    }
    return false;
}

// Modal handling
function openTargetModal(actionName, targets, confirmCallback) {
    targetModalTitle.textContent = `${actionName}: Select Target`;
    targetButtons.innerHTML = "";
    
    targets.forEach(t => {
        const btn = document.createElement("button");
        btn.className = "target-btn";
        btn.textContent = `${t.name} (${t.coins} coins | ${t.cards_count} cards)`;
        btn.addEventListener("click", () => {
            targetModal.classList.add("hidden");
            confirmCallback(t.player_id);
        });
        targetButtons.appendChild(btn);
    });

    targetModal.classList.remove("hidden");
}

targetCancelBtn.addEventListener("click", () => {
    targetModal.classList.add("hidden");
});

// Exchange select modal
function openExchangeModal(view) {
    const player = view.players.find(p => p.player_id === myId);
    const handCards = player.cards;
    const drawnCards = view.exchange_drawn_cards || [];
    const pool = [...handCards, ...drawnCards];
    const originalSize = handCards.length;

    exchangeCardsContainer.innerHTML = "";
    let selectedIndices = [];

    exchangeSubmitBtn.className = "btn primary-btn disabled";
    exchangeSubmitBtn.disabled = true;

    pool.forEach((card, idx) => {
        const cardItem = document.createElement("div");
        cardItem.className = `seat-card-item card-${card}`;
        cardItem.style.width = "90px";
        cardItem.style.height = "135px";
        
        const cardFront = document.createElement("div");
        cardFront.className = "card-face-front";
        
        const title = document.createElement("div");
        title.className = "card-title";
        title.textContent = card;
        
        const art = document.createElement("div");
        art.className = "card-art";
        art.textContent = getCardArtIcon(card);

        cardFront.appendChild(title);
        cardFront.appendChild(art);
        cardItem.appendChild(cardFront);

        cardItem.addEventListener("click", () => {
            if (selectedIndices.includes(idx)) {
                selectedIndices = selectedIndices.filter(i => i !== idx);
                cardItem.classList.remove("selected");
            } else {
                if (selectedIndices.length < originalSize) {
                    selectedIndices.push(idx);
                    cardItem.classList.add("selected");
                }
            }

            if (selectedIndices.length === originalSize) {
                exchangeSubmitBtn.className = "btn primary-btn";
                exchangeSubmitBtn.disabled = false;
            } else {
                exchangeSubmitBtn.className = "btn primary-btn disabled";
                exchangeSubmitBtn.disabled = true;
            }
        });

        exchangeCardsContainer.appendChild(cardItem);
    });

    exchangeSubmitBtn.onclick = () => {
        const keepCards = selectedIndices.map(i => pool[i]);
        exchangeModal.classList.add("hidden");
        sendAction({"action": "exchange", "keep": keepCards});
    };

    exchangeModal.classList.remove("hidden");
}

// Send websocket payloads
function sendAction(actionData) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(jsonStr = JSON.stringify({
            "type": "action",
            "data": actionData
        }));
    }
}

// Coin & Card Dealing animations layer
function triggerDiffAnimations(prev, curr) {
    curr.players.forEach(p => {
        const oldP = prev.players.find(o => o.player_id === p.player_id);
        if (!oldP) return;

        // 1. Coin changes
        if (p.coins > oldP.coins) {
            // Player gained coins
            // Find coordinates
            const diff = p.coins - oldP.coins;
            animateCoinsFlow("bank", p.player_id, diff);
        } else if (p.coins < oldP.coins) {
            // Player lost coins
            const diff = oldP.coins - p.coins;
            // If it is an assassination or coup, fly to bank, else to the actor (steal)
            if (curr.active_action && curr.active_action.action_type === "Steal" && curr.active_action.target_id === p.player_id) {
                animateCoinsFlow(p.player_id, curr.active_action.player_id, diff);
            } else {
                animateCoinsFlow(p.player_id, "bank", diff);
            }
        }

        // 2. Discard/reveal animations
        if (p.revealed_cards.length > oldP.revealed_cards.length) {
            const newlyDiscarded = p.revealed_cards.find(c => !oldP.revealed_cards.includes(c));
            if (newlyDiscarded) {
                animateCardToDiscard(p.player_id);
            }
        }
    });

    // 3. Special action visual overlays
    const prevAction = prev.active_action;
    const currAction = curr.active_action;

    if (currAction && (!prevAction || prevAction.player_id !== currAction.player_id || prevAction.action_type !== currAction.action_type)) {
        // Trigger action screen visual effects
        if (currAction.action_type === "Assassinate" && currAction.target_id) {
            triggerSlashEffect(currAction.target_id);
        } else if (currAction.action_type === "Coup" && currAction.target_id) {
            triggerExplosionEffect(currAction.target_id);
        }
    }

    // 4. Block/challenge overlays
    if (curr.active_block && (!prev.active_block || prev.active_block.player_id !== curr.active_block.player_id)) {
        triggerShieldEffect(curr.active_block.player_id);
    }
}

// Coordinate calculation utilities (uses relative DOM bounds)
function getElementCenterCoords(elId) {
    const el = document.getElementById(elId);
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const rect = el.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function getBankCoords() {
    const box = document.getElementById("treasury-box");
    if (!box) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const rect = box.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function animateCoinsFlow(sourceId, targetId, count) {
    const countToSpawn = Math.min(count, 5); // cap visual performance
    for (let i = 0; i < countToSpawn; i++) {
        setTimeout(() => {
            const coin = document.createElement("div");
            coin.className = "animated-coin";
            
            let start = sourceId === "bank" ? getBankCoords() : getElementCenterCoords(`seat-card-${sourceId}`);
            let end = targetId === "bank" ? getBankCoords() : getElementCenterCoords(`seat-card-${targetId}`);
            
            coin.style.setProperty("--tx-start", `${start.x}px`);
            coin.style.setProperty("--ty-start", `${start.y}px`);
            coin.style.setProperty("--tx-end", `${end.x}px`);
            coin.style.setProperty("--ty-end", `${end.y}px`);
            
            animationLayer.appendChild(coin);
            setTimeout(() => coin.remove(), 800);
        }, i * 150);
    }
}

function animateCardToDiscard(player_id) {
    const start = getElementCenterCoords(`seat-card-${player_id}`);
    const discard = document.getElementById("discard-pile");
    const rect = discard.getBoundingClientRect();
    const end = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    const animCard = document.createElement("div");
    animCard.className = "animated-card";
    
    animCard.style.setProperty("--tx-start", `${start.x}px`);
    animCard.style.setProperty("--ty-start", `${start.y}px`);
    animCard.style.setProperty("--tx-end", `${end.x}px`);
    animCard.style.setProperty("--ty-end", `${end.y}px`);

    animationLayer.appendChild(animCard);
    setTimeout(() => animCard.remove(), 800);
}

// Special Overlay Effects
function triggerSlashEffect(targetId) {
    const seat = document.getElementById(`seat-card-${targetId}`);
    if (!seat) return;

    const slash = document.createElement("div");
    slash.className = "assassinate-slash-effect";
    seat.appendChild(slash);
    
    // Seat shake
    seat.style.animation = "slashStrike 0.2s 3 alternate";
    setTimeout(() => {
        slash.remove();
        seat.style.animation = "";
    }, 600);
}

function triggerExplosionEffect(targetId) {
    const end = getElementCenterCoords(`seat-card-${targetId}`);
    
    const explosion = document.createElement("div");
    explosion.className = "coup-explosion-effect";
    explosion.style.left = `${end.x}px`;
    explosion.style.top = `${end.y}px`;

    animationLayer.appendChild(explosion);
    setTimeout(() => explosion.remove(), 600);
}

function triggerShieldEffect(playerId) {
    const seat = document.getElementById(`seat-card-${playerId}`);
    if (!seat) return;

    const shield = document.createElement("div");
    shield.className = "shield-effect";
    seat.appendChild(shield);
    setTimeout(() => shield.remove(), 1200);
}

// End game handler
function handleGameOver(msg) {
    addLogMessage(`======================================`);
    addLogMessage(`  GAME OVER! Winner: ${msg.winner_name} (${msg.winner_id})`);
    addLogMessage(`======================================`);

    setTimeout(() => {
        alert(`Game Over! Winner: ${msg.winner_name}`);
        window.location.reload();
    }, 5000);
}

// Hook up avatar selection grid click handlers
const avatarOptions = document.querySelectorAll(".avatar-option");
avatarOptions.forEach(opt => {
    opt.addEventListener("click", () => {
        avatarOptions.forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        selectedAvatar = opt.getAttribute("data-avatar");
    });
});

// Lobby connection trigger
joinBtn.addEventListener("click", () => {
    const nameVal = playerNameInput.value.trim();
    if (!nameVal) return;
    
    // Connect and Join
    initSocket();
    setTimeout(() => {
        socket.send(JSON.stringify({
            "type": "join",
            "name": nameVal,
            "avatar": selectedAvatar
        }));
    }, 500);
});

startBtn.addEventListener("click", () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            "type": "start"
        }));
    }
});

// Auto focus input
playerNameInput.focus();
playerNameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinBtn.click();
});
