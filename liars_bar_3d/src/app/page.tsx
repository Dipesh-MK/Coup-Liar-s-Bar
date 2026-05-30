"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCoupState } from "../hooks/useCoupState";
import GameScene from "../components/GameScene";
import GameHUD from "../components/GameHUD";
import Avatar3D from "../components/Avatar3D";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

const ROLE_OPTIONS = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];

// Preset body color swatches
const COLOR_SWATCHES = [
  { name: "Deep Red", hex: "#8e0000" },
  { name: "Navy", hex: "#0a192f" },
  { name: "Forest Green", hex: "#0f5132" },
  { name: "Purple", hex: "#4a148c" },
  { name: "Orange", hex: "#e65100" },
  { name: "Black", hex: "#111111" },
  { name: "Tan", hex: "#d7ccc8" },
  { name: "Teal", hex: "#004d40" }
];

// Animals list
const ANIMAL_TYPES = ["Bear", "Rabbit", "Cat", "Fox", "Wolf", "Frog", "Raccoon", "Duck", "Goat", "Panda"];

// Body Types
const BODY_TYPES = ["CHUNKY", "SKINNY", "MUSCULAR", "TINY", "PEAR"] as const;

// Eye Styles
const EYE_STYLES = ["Normal", "Derpy", "Angry", "Sleepy"];

// Dynamic 2D Embers Effect
function EmberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      opacity: number;
      fadeSpeed: number;
    }> = [];

    const spawnParticle = () => {
      if (particles.length < 50) {
        particles.push({
          x: Math.random() * width,
          y: height + 10,
          size: Math.random() * 2.5 + 0.5,
          speedY: -(Math.random() * 1.2 + 0.3),
          speedX: (Math.random() - 0.5) * 0.6,
          opacity: Math.random() * 0.6 + 0.2,
          fadeSpeed: Math.random() * 0.002 + 0.001,
        });
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      spawnParticle();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.speedY;
        p.x += p.speedX;
        p.opacity -= p.fadeSpeed;

        if (p.y < 0 || p.opacity <= 0) {
          particles.splice(i, 1);
          i--;
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 146, 60, ${p.opacity})`;
        ctx.shadowBlur = p.size * 2;
        ctx.shadowColor = "rgba(239, 68, 68, 0.4)";
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[1]" />;
}

export default function Home() {
  const {
    state,
    deck,
    initGame,
    performAction,
    passAction,
    challengeAction,
    blockAction,
    revealCard,
    exchangeSelect,
    kickPlayer,
    voteKickPlayer,
    pickShuffledCard,
    returnToLobby,
  } = useCoupState();

  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("Duke");
  const [selectedAnimal, setSelectedAnimal] = useState("Bear");
  const [selectedBodyColor, setSelectedBodyColor] = useState("#4a148c"); // Purple
  const [selectedEyeStyle, setSelectedEyeStyle] = useState("Normal");
  const [selectedBodyType, setSelectedBodyType] = useState<"CHUNKY" | "SKINNY" | "MUSCULAR" | "TINY" | "PEAR">("CHUNKY");
  const [selectedAccessories, setSelectedAccessories] = useState({
    topHat: false,
    monocle: false,
    bowTie: false,
    scarf: false,
    vest: false
  });
  
  const [lobbySize, setLobbySize] = useState(4);
  const [aiCount, setAiCount] = useState(3);
  const [showTutorial, setShowTutorial] = useState(false);
  const [multiplayerAlert, setMultiplayerAlert] = useState(false);
  const [isPeekHand, setIsPeekHand] = useState(false);
  const [isStanding, setIsStanding] = useState(false);

  const [showDebug, setShowDebug] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ name: string; status: "PENDING" | "RUNNING" | "PASS" | "FAIL"; details?: string }>>([
    { name: "TEST 1 — PLAYER COUNT", status: "PENDING" },
    { name: "TEST 2 — CARD ECONOMY", status: "PENDING" },
    { name: "TEST 3 — PILE VISIBILITY", status: "PENDING" },
    { name: "TEST 4 — TURN LOOP", status: "PENDING" },
    { name: "TEST 5 — DEATH ANIMATION", status: "PENDING" },
    { name: "TEST 6 — ANTI-CHEAT", status: "PENDING" },
    { name: "TEST 7 — CAMERA HEIGHT", status: "PENDING" },
  ]);
  const [isRunningTests, setIsRunningTests] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
      
      // Toggle fullscreen on 'f' / 'F' key press
      if (e.key.toLowerCase() === "f") {
        // Prevent toggle if user is typing in an input/textarea
        if (
          document.activeElement &&
          (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
            console.warn("Fullscreen request rejected:", err);
          });
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch((err) => {
              console.warn("Exit fullscreen rejected:", err);
            });
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setIsPeekHand(false);
    setIsStanding(false);
  }, [state.currentPlayerIdx]);

  const runTests = async () => {
    if (isRunningTests) return;
    setIsRunningTests(true);

    const tempResults = [
      { name: "TEST 1 — PLAYER COUNT", status: "PENDING" as const },
      { name: "TEST 2 — CARD ECONOMY", status: "PENDING" as const },
      { name: "TEST 3 — PILE VISIBILITY", status: "PENDING" as const },
      { name: "TEST 4 — TURN LOOP", status: "PENDING" as const },
      { name: "TEST 5 — DEATH ANIMATION", status: "PENDING" as const },
      { name: "TEST 6 — ANTI-CHEAT", status: "PENDING" as const },
      { name: "TEST 7 — CAMERA HEIGHT", status: "PENDING" as const },
    ];
    setTestResults([...tempResults]);

    const logAssert = (cond: boolean, msg: string) => {
      if (!cond) {
        console.error("ASSERTION FAILED: " + msg);
        throw new Error(msg);
      } else {
        console.log("ASSERTION PASSED: " + msg);
      }
    };

    const updateTestStatus = (name: string, status: "RUNNING" | "PASS" | "FAIL", details?: string) => {
      setTestResults(prev => prev.map(t => t.name === name ? { ...t, status, details } : t));
    };

    // TEST 1 — PLAYER COUNT
    try {
      updateTestStatus("TEST 1 — PLAYER COUNT", "RUNNING");
      console.log("Starting TEST 1 — PLAYER COUNT...");
      const scene = (window as any).scene;
      const setPlayerCount = (window as any).setPlayerCount;
      if (!scene || !setPlayerCount) throw new Error("WebGL scene or setPlayerCount function not initialized");

      for (let n = 3; n <= 6; n++) {
        setPlayerCount(n);
        await new Promise(r => setTimeout(r, 200));
        const visible = (window as any).scene.children.filter((c: any) => c.userData.isCharacter).length;
        logAssert(visible === n - 1, `FAIL: playerCount=${n} should show ${n - 1} characters, got ${visible}`);
      }
      updateTestStatus("TEST 1 — PLAYER COUNT", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 1 — PLAYER COUNT", "FAIL", e.message);
    }

    // TEST 2 — CARD ECONOMY
    try {
      updateTestStatus("TEST 2 — CARD ECONOMY", "RUNNING");
      console.log("Starting TEST 2 — CARD ECONOMY...");
      const dealCards = (window as any).dealCards;
      if (!dealCards) throw new Error("dealCards function not bound to window");
      for (let n = 3; n <= 6; n++) {
        const result = dealCards(n);
        const total = n * 2 + result.community.length + result.public.length;
        logAssert(total === 15, `FAIL: playerCount=${n} card total=${total}, expected 15`);
        logAssert(result.community.length === 3, `FAIL: community must always be 3`);
      }
      updateTestStatus("TEST 2 — CARD ECONOMY", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 2 — CARD ECONOMY", "FAIL", e.message);
    }

    // TEST 3 — PILE VISIBILITY
    try {
      updateTestStatus("TEST 3 — PILE VISIBILITY", "RUNNING");
      console.log("Starting TEST 3 — PILE VISIBILITY...");
      const camera = (window as any).camera;
      if (!camera) throw new Error("camera not bound to window");
      ['communityGroup', 'publicGroup', 'graveyardGroup'].forEach(name => {
        const group = (window as any)[name];
        logAssert(group && group.children.length > 0, `FAIL: ${name} has no children`);
        logAssert(group.visible === true, `FAIL: ${name} is not visible`);
        const cam = camera.position;
        const dist = group.position.distanceTo(cam);
        logAssert(dist < 6, `FAIL: ${name} is too far from camera (${dist.toFixed(2)} units)`);
      });
      updateTestStatus("TEST 3 — PILE VISIBILITY", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 3 — PILE VISIBILITY", "FAIL", e.message);
    }

    // TEST 4 — TURN LOOP
    try {
      updateTestStatus("TEST 4 — TURN LOOP", "RUNNING");
      console.log("Starting TEST 4 — TURN LOOP...");
      const origAdvance = (window as any).advanceTurn;
      if (!origAdvance) throw new Error("advanceTurn function not bound to window");

      let turnCount = 0;
      const maxTurns = 20;

      const runLoop = new Promise<void>((resolve, reject) => {
        const checkAndAdvance = () => {
          turnCount++;
          if (turnCount > maxTurns) {
            console.log("PASS: Turn loop ran 20 turns without freezing");
            (window as any).advanceTurn = origAdvance;
            resolve();
          } else {
            origAdvance();
            setTimeout(checkAndAdvance, 50);
          }
        };
        (window as any).advanceTurn = checkAndAdvance;
        checkAndAdvance();
      });

      await runLoop;
      updateTestStatus("TEST 4 — TURN LOOP", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 4 — TURN LOOP", "FAIL", e.message);
    }

    // TEST 5 — DEATH ANIMATION
    try {
      updateTestStatus("TEST 5 — DEATH ANIMATION", "RUNNING");
      console.log("Starting TEST 5 — DEATH ANIMATION...");
      const scene = (window as any).scene;
      const setPlayerEliminated = (window as any).setPlayerEliminated;
      if (!scene || !setPlayerEliminated) throw new Error("WebGL scene or setPlayerEliminated function not bound to window");

      setPlayerEliminated(1);
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          try {
            const seat1Parts = scene.children.filter((c: any) => c.userData.seatIndex === 1);
            logAssert(seat1Parts.length > 0, "FAIL: No eliminated player parts found in scene");
            const allFaded = seat1Parts.every((p: any) => p.material.opacity < 0.1);
            logAssert(allFaded, "FAIL: Eliminated player parts should be faded out after 3s");
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 3600);
      });
      updateTestStatus("TEST 5 — DEATH ANIMATION", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 5 — DEATH ANIMATION", "FAIL", e.message);
    }

    // TEST 6 — ANTI-CHEAT
    try {
      updateTestStatus("TEST 6 — ANTI-CHEAT", "RUNNING");
      console.log("Starting TEST 6 — ANTI-CHEAT...");
      const dealCards = (window as any).dealCards;
      const gameState = (window as any).gameState;
      if (!dealCards || !gameState) throw new Error("dealCards function or gameState not initialized");

      dealCards(4);
      logAssert(JSON.stringify(gameState.piles.community) === '["HIDDEN","HIDDEN","HIDDEN"]', "FAIL: Community cards exposed on client before reveal");
      updateTestStatus("TEST 6 — ANTI-CHEAT", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 6 — ANTI-CHEAT", "FAIL", e.message);
    }

    // TEST 7 — CAMERA HEIGHT
    try {
      updateTestStatus("TEST 7 — CAMERA HEIGHT", "RUNNING");
      console.log("Starting TEST 7 — CAMERA HEIGHT...");
      const scene = (window as any).scene;
      const camera = (window as any).camera;
      if (!scene || !camera) throw new Error("WebGL scene or camera not initialized");

      const opponentHeads = scene.children.filter((c: any) => c.userData.isHead);
      if (opponentHeads.length > 0) {
        const headY = opponentHeads[0].getWorldPosition(new THREE.Vector3()).y;
        const camY = camera.position.y;
        logAssert(Math.abs(headY - camY) < 0.15, `FAIL: Camera Y (${camY.toFixed(2)}) not aligned with opponent head Y (${headY.toFixed(2)})`);
      } else {
        throw new Error("No opponent heads found in scene children to align camera height");
      }
      updateTestStatus("TEST 7 — CAMERA HEIGHT", "PASS");
    } catch (e: any) {
      updateTestStatus("TEST 7 — CAMERA HEIGHT", "FAIL", e.message);
    }

    setIsRunningTests(false);
  };

  // Maintain local player config globally
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localPlayerConfig = {
        animal: selectedAnimal,
        bodyColor: selectedBodyColor,
        bodyType: selectedBodyType,
        eyeStyle: selectedEyeStyle,
        name: name || "You",
        accessories: selectedAccessories
      };
    }
  }, [selectedAnimal, selectedBodyColor, selectedBodyType, selectedEyeStyle, name, selectedAccessories]);

  const handleStartGame = () => {
    if (typeof document !== "undefined" && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request rejected:", err);
      });
    }
    initGame(name || "You", selectedAvatar, lobbySize, aiCount, {
      animal: selectedAnimal,
      bodyColor: selectedBodyColor,
      bodyType: selectedBodyType,
      eyeStyle: selectedEyeStyle,
      accessories: selectedAccessories
    });
  };

  const isLobby = state.stage === "Lobby";

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050308] text-[#f3effa] font-sans">
      {isLobby ? (
        /* Cinematic Lobby customization overlay */
        <div className="absolute inset-0 z-10 flex flex-col justify-between p-6 md:p-12 overflow-hidden select-none">
          <div
            className="absolute inset-0 bg-cover bg-center animate-kenburns scale-105 pointer-events-none"
            style={{
              backgroundImage: "url('/assets/login_bg.jpg')",
              filter: "brightness(0.4) contrast(1.1)",
            }}
          />

          {/* Floating Embers Particle Canvas */}
          <EmberCanvas />

          {/* Sconces/Lantern dark bar gradients */}
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#050308]/90 to-transparent pointer-events-none z-[2]" />
          <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#050308] via-[#050308]/70 to-transparent pointer-events-none z-[2]" />

          {/* LOBBY PANEL VIEW */}
          <div className="relative z-[3] flex-1 flex flex-col lg:flex-row items-center justify-center lg:justify-between max-w-7xl w-full mx-auto gap-8 mt-12 md:mt-0">
            
            <div className="flex flex-col text-center lg:text-left max-w-xl">
              <h1 className="logo-title font-cinzel text-6xl md:text-8xl tracking-[0.25em] font-extrabold uppercase select-none text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">
                COUP
              </h1>
              <p className="text-sm md:text-base tracking-[0.4em] font-bold text-amber-400 uppercase select-none mb-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                CONTROL. BLUFF. SURVIVE.
              </p>
              <div className="hidden lg:block border-l-2 border-cyan-400 pl-4 py-2 mt-4 bg-black/30 backdrop-blur-sm rounded-r-xl border-y border-r border-white/5 max-w-md">
                <p className="text-cyan-400 font-mono text-[11px] uppercase tracking-wider">
                  THE ILLUSION OF FREE WILL IS THE ULTIMATE TRAP.
                </p>
                <p className="text-white/60 font-sans text-xs mt-1 leading-relaxed">
                  Welcome back, Gambler. Take a seat around the circular wooden table under the warm golden spotlight. Hold your cards close, and choose when to slide your coins.
                </p>
              </div>
            </div>

            {/* Registration Customize Terminal */}
            <div className="glass-panel p-6 rounded-2xl max-w-md w-full border border-white/10 shadow-2xl relative flex flex-col gap-4 bg-[#0d0717]/85 backdrop-blur-xl animate-fade-in-scale max-h-[85vh] overflow-hidden">
              <div className="border-b border-cyan-400/20 pb-2 flex justify-between items-center shrink-0">
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest neon-glow-cyan font-bold">
                  GAMBLER CUSTOMIZER TERMINAL
                </span>
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              </div>

              {/* 3D Centered Preview Canvas (280x280px) */}
              <div className="flex justify-center w-full my-1 shrink-0">
                <div className="w-[280px] h-[280px] bg-[#1a1a2e] border-2 border-cyan-400/40 rounded-2xl overflow-hidden relative shadow-2xl">
                  <Canvas
                    camera={{ position: [0, 0.5, 1.8], fov: 45 }}
                    onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}
                  >
                    <color attach="background" args={["#1a1a2e"]} />
                    <ambientLight intensity={0.4} />
                    <directionalLight position={[-2, 2, 2]} intensity={1.5} />
                    <directionalLight position={[2, 1, 1]} intensity={0.8} />
                    <directionalLight position={[0, 2, -2]} intensity={1.2} />
                    <Avatar3D
                      seatIdx={0}
                      player={{
                        id: "p0",
                        name: name || "You",
                        avatar: selectedAvatar,
                        coins: 0,
                        cards: [],
                        revealedCards: [],
                        isActive: true,
                        isAI: false
                      }}
                      isActiveTurn={false}
                      animationEvent={null}
                      currentPlayerIdx={0}
                      isPreview={true}
                      customAnimal={selectedAnimal}
                      customColor={selectedBodyColor}
                      customEyeStyle={selectedEyeStyle}
                      customBodyType={selectedBodyType}
                      customAccessories={selectedAccessories}
                    />
                  </Canvas>
                  <div className="absolute bottom-2 left-0 right-0 text-center text-[7px] font-mono text-cyan-400 tracking-widest uppercase select-none pointer-events-none font-bold">
                    3D TURNTABLE PREVIEW UNIT
                  </div>
                </div>
              </div>

              {/* Scrollable controls area */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 scrollbar-thin">
                {/* Name Input */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Alias Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.substring(0, 16))}
                    placeholder="Enter handle..."
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-cyan-400 focus:bg-black/70 transition duration-200 text-center font-semibold text-white placeholder-white/20"
                    maxLength={16}
                  />
                </div>

                {/* Choose Animal Head - Grid of 10 */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Choose Animal Head</label>
                  <div className="grid grid-cols-5 gap-1">
                    {ANIMAL_TYPES.map((animal) => (
                      <button
                        key={animal}
                        type="button"
                        onClick={() => setSelectedAnimal(animal)}
                        className={`py-1 rounded border text-[9px] font-bold uppercase transition ${
                          selectedAnimal === animal
                            ? "border-cyan-400 bg-cyan-950/40 text-cyan-300"
                            : "border-white/10 hover:border-white/20 bg-black/30 text-white/70"
                        }`}
                      >
                        {animal}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Body color swatches */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Body Color Swatch</label>
                  <div className="grid grid-cols-8 gap-1.5 py-0.5">
                    {COLOR_SWATCHES.map((sw) => (
                      <button
                        key={sw.hex}
                        type="button"
                        onClick={() => setSelectedBodyColor(sw.hex)}
                        title={sw.name}
                        style={{ backgroundColor: sw.hex }}
                        className={`h-6 rounded border transition scale-100 ${
                          selectedBodyColor === sw.hex
                            ? "border-cyan-400 scale-110 shadow-lg shadow-cyan-400/20"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Choose Body Type */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Body Shape</label>
                  <div className="grid grid-cols-5 gap-1">
                    {BODY_TYPES.map((bt) => (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => setSelectedBodyType(bt)}
                        className={`py-1 rounded border text-[9px] font-bold uppercase transition ${
                          selectedBodyType === bt
                            ? "border-cyan-400 bg-cyan-950/40 text-cyan-300"
                            : "border-white/10 hover:border-white/20 bg-black/30 text-white/70"
                        }`}
                      >
                        {bt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accessories Checklist */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Accessories</label>
                  <div className="grid grid-cols-3 gap-2 py-1">
                    {Object.keys(selectedAccessories).map((acc) => {
                      const label = acc.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                      return (
                        <label key={acc} className="flex items-center gap-1.5 text-[10px] text-white/80 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={(selectedAccessories as any)[acc]}
                            onChange={(e) => setSelectedAccessories(prev => ({ ...prev, [acc]: e.target.checked }))}
                            className="w-3.5 h-3.5 accent-cyan-400 bg-black/40 border border-white/20 rounded cursor-pointer"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Eye styles */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Eye Style</label>
                  <div className="grid grid-cols-4 gap-1">
                    {EYE_STYLES.map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setSelectedEyeStyle(style)}
                        className={`py-1 rounded border text-[9px] font-bold uppercase transition ${
                          selectedEyeStyle === style
                            ? "border-cyan-400 bg-cyan-950/40 text-cyan-300"
                            : "border-white/10 hover:border-white/20 bg-black/30 text-white/70"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lobby and Identity Setup */}
                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Seating Limit</label>
                    <select
                      value={lobbySize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLobbySize(val);
                        setAiCount(val - 1);
                      }}
                      className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer font-medium text-white focus:border-cyan-400"
                    >
                      <option value={3} className="bg-[#110722]">3 Players</option>
                      <option value={4} className="bg-[#110722]">4 Players</option>
                      <option value={5} className="bg-[#110722]">5 Players</option>
                      <option value={6} className="bg-[#110722]">6 Players</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Active Bots</label>
                    <select
                      value={aiCount}
                      onChange={(e) => setAiCount(parseInt(e.target.value, 10))}
                      className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer font-medium text-white focus:border-cyan-400"
                    >
                      {Array.from({ length: lobbySize - 1 }).map((_, i) => (
                        <option key={i + 1} value={i + 1} className="bg-[#110722]">
                          {i + 1} AI Bots
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Role cards selection */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Identity Card Role</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ROLE_OPTIONS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setSelectedAvatar(role)}
                        className={`relative rounded-lg overflow-hidden border transition-all duration-200 cursor-pointer flex flex-col items-center gap-1 p-1 bg-black/40 ${
                          selectedAvatar === role
                            ? "border-cyan-400 bg-cyan-950/30 scale-105 shadow shadow-cyan-400/30"
                            : "border-white/10 hover:border-white/30 hover:bg-black/60"
                        }`}
                      >
                        <div
                          className="w-10 h-12 bg-cover bg-center rounded-md"
                          style={{ backgroundImage: `url('/assets/${role.toLowerCase()}.png')` }}
                        />
                        <span className="text-[8px] font-bold uppercase tracking-tighter truncate w-full text-center text-white/90">
                          {role}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Toast */}
          {multiplayerAlert && (
            <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 glass px-6 py-3.5 rounded-xl border border-red-500/30 text-red-300 text-xs font-mono text-center shadow-lg shadow-black flex items-center gap-2 animate-bounce">
              <span>⚠️ SECURE SERVER ACCESS DENIED: OFFLINE DEMO MODE ACTIVE</span>
              <button
                onClick={() => setMultiplayerAlert(false)}
                className="ml-3 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Tab Menu */}
          <div className="relative z-[3] flex justify-center w-full mt-auto mb-4 pointer-events-auto">
            <div className="flex items-center justify-center -space-x-4 max-w-3xl w-full">
              <button
                onClick={() => setShowTutorial(true)}
                className="cyber-btn h-14 w-1/3 flex items-center justify-center font-bold text-xs uppercase tracking-widest text-[#00f0ff] hover:text-white cursor-pointer"
              >
                <span className="relative z-10">TUTORIAL</span>
              </button>

              {/* SIT DOWN Starts Game and Tween */}
              <button
                onClick={handleStartGame}
                className="cyber-btn h-16 w-1/3 flex items-center justify-center font-extrabold text-sm uppercase tracking-widest text-amber-400 hover:text-white cursor-pointer"
              >
                <span className="relative z-10">SIT DOWN</span>
              </button>

              <button
                onClick={() => setMultiplayerAlert(true)}
                className="cyber-btn h-14 w-1/3 flex items-center justify-center font-bold text-xs uppercase tracking-widest text-[#00f0ff] hover:text-white cursor-pointer"
              >
                <span className="relative z-10">MULTIPLAYER</span>
              </button>
            </div>
          </div>

          {/* Tutorial Overlay */}
          {showTutorial && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="glass max-w-xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 rounded-2xl border border-cyan-400/20 shadow-2xl flex flex-col gap-5 text-left pointer-events-auto">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <h3 className="font-cinzel text-xl font-bold tracking-widest text-amber-400 uppercase">
                    Tavern Rulebook & Guide
                  </h3>
                  <button
                    onClick={() => setShowTutorial(false)}
                    className="text-white/60 hover:text-white text-xl font-bold cursor-pointer p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-col gap-4 text-sm leading-relaxed text-white/80 font-sans pr-1 overflow-y-auto scrollbar-thin">
                  <div className="border-l-2 border-amber-400 pl-3">
                    <h4 className="font-bold text-amber-400 uppercase tracking-wider text-xs">Coup Core Goal</h4>
                    <p className="text-xs text-white/70 mt-0.5">
                      Be the last player standing with influence (undiscarded cards). You begin with 2 coins and 2 face-down cards.
                    </p>
                  </div>

                  <div className="border-l-2 border-cyan-400 pl-3">
                    <h4 className="font-bold text-cyan-400 uppercase tracking-wider text-xs">How To Play</h4>
                    <p className="text-xs text-white/70 mt-0.5">
                      On your turn, declare any action. You do not need to hold the corresponding card. However, other players can challenge you (call your bluff) or block your action. If a challenge succeeds, the liar discards 1 card. If the challenger is wrong, the challenger discards 1 card.
                    </p>
                  </div>

                  <h5 className="font-bold text-white uppercase text-xs tracking-widest mt-2 border-b border-white/5 pb-1">
                    Character Roles & Actions
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="font-bold text-amber-400 text-xs flex justify-between">
                        <span>DUKE</span>
                        <span>TAX (+3 COINS)</span>
                      </div>
                      <p className="text-[10px] text-white/60 mt-1">
                        Collects 3 coins from Treasury. Blocks Foreign Aid blocks.
                      </p>
                    </div>

                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="font-bold text-purple-400 text-xs flex justify-between">
                        <span>ASSASSIN</span>
                        <span>ASSASSINATE (costs 3 COINS)</span>
                      </div>
                      <p className="text-[10px] text-white/60 mt-1">
                        Deducts 3 coins to eliminate another player&apos;s card. Blockable by Contessa.
                      </p>
                    </div>

                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="font-bold text-blue-400 text-xs flex justify-between">
                        <span>CAPTAIN</span>
                        <span>STEAL (+2 COINS)</span>
                      </div>
                      <p className="text-[10px] text-white/60 mt-1">
                        Takes 2 coins from another player. Blockable by Captain or Ambassador.
                      </p>
                    </div>

                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="font-bold text-green-400 text-xs flex justify-between">
                        <span>AMBASSADOR</span>
                        <span>EXCHANGE (Swap Hand)</span>
                      </div>
                      <p className="text-[10px] text-white/60 mt-1">
                        Draws 2 cards from deck, swaps with any of your cards. Blocks Steals.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="font-bold text-red-400 text-xs">CONTESSA (Blocks Assassination)</div>
                    <p className="text-[10px] text-white/60 mt-1">
                      Does not have an active turn action, but can block Assassinations directed at you.
                    </p>
                  </div>

                  <div className="p-3 bg-red-950/20 rounded-xl border border-red-500/20 text-red-300">
                    <div className="font-bold text-xs">KICK PROTOCOLS</div>
                    <p className="text-[10px] text-red-200/80 mt-1">
                      If an AI bot halts play or hangs, click the Host Kick button to instantly eliminate them, or Vote Kick to start a player voting block.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowTutorial(false)}
                  className="w-full mt-2 py-3 rounded-xl font-bold bg-amber-400 text-black hover:bg-amber-300 transition duration-200 text-xs uppercase cursor-pointer"
                >
                  Close Rulebook
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* GAME IN PROGRESS VIEW */
        <div className="relative w-full h-full">
          <GameScene gameState={state} deck={deck} onRevealCard={revealCard} isPeekHand={isPeekHand} isStanding={isStanding} />
          <GameHUD
            gameState={state}
            onPerformAction={performAction}
            onPass={passAction}
            onChallenge={challengeAction}
            onBlock={blockAction}
            onReveal={revealCard}
            onExchangeSelect={exchangeSelect}
            onKickPlayer={kickPlayer}
            onVoteKickPlayer={voteKickPlayer}
            onShufflePick={pickShuffledCard}
            isPeekHand={isPeekHand}
            onTogglePeekHand={() => setIsPeekHand(prev => !prev)}
            isStanding={isStanding}
            onToggleStanding={() => setIsStanding(prev => !prev)}
            onReturnToLobby={returnToLobby}
          />
        </div>
      )}

      {/* Ctrl+Shift+D Debug Panel Overlay */}
      {showDebug && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass max-w-lg w-full p-6 md:p-8 rounded-2xl border border-cyan-400/30 shadow-2xl flex flex-col gap-5 text-left font-mono">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-xs font-bold tracking-widest text-cyan-400 uppercase neon-glow-cyan">
                🔧 AUTOMATED TEST PANEL
              </h3>
              <button
                onClick={() => setShowDebug(false)}
                className="text-white/60 hover:text-white text-base font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {testResults.map((t, idx) => {
                let badgeColor = "bg-white/10 text-white/50";
                if (t.status === "RUNNING") badgeColor = "bg-cyan-500/20 text-cyan-400 animate-pulse";
                else if (t.status === "PASS") badgeColor = "bg-green-500/20 text-green-400 font-bold border border-green-500/30";
                else if (t.status === "FAIL") badgeColor = "bg-red-500/20 text-red-400 font-bold border border-red-500/30";

                return (
                  <div key={idx} className="p-3 bg-black/40 rounded-xl border border-white/5 flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white/90">{t.name}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold ${badgeColor}`}>
                        {t.status}
                      </span>
                    </div>
                    {t.details && (
                      <p className="text-[10px] text-red-400/80 leading-relaxed pl-2 border-l border-red-500/20 mt-1 whitespace-pre-wrap">
                        {t.details}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between gap-4 mt-2 shrink-0">
              <div className="text-[10px] text-white/60 flex items-center">
                Results: {testResults.filter(t => t.status === "PASS").length} / {testResults.length} Passed
              </div>
              <div className="flex gap-2">
                <button
                  onClick={runTests}
                  disabled={isRunningTests}
                  className="px-4 py-2 rounded-xl font-bold bg-cyan-400 text-black hover:bg-cyan-300 disabled:bg-white/10 disabled:text-white/40 transition duration-200 text-xs uppercase cursor-pointer"
                >
                  {isRunningTests ? "Running..." : "Run Tests"}
                </button>
                <button
                  onClick={() => setShowDebug(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-white/10 text-white hover:bg-white/20 transition duration-200 text-xs uppercase cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
