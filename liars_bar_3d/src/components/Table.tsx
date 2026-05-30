"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { GameState, CardType } from "../hooks/useCoupState";

interface TableProps {
  gameState: GameState;
  isShuffling?: boolean;
}

// Pure helper function to draw card CanvasTextures dynamically
function createCardTexture(role: string) {
  if (typeof window === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let bg = "#0b132b";
  if (role === "Duke") bg = "#4a0e8f";
  else if (role === "Assassin") bg = "#8f0e0e";
  else if (role === "Captain") bg = "#0e2d8f";
  else if (role === "Ambassador") bg = "#0e6b2d";
  else if (role === "Contessa") bg = "#8f0e4a";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 192);

  // Border
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 180);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (role === "HIDDEN" || role === "community_back") {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 40);
    ctx.lineTo(100, 96);
    ctx.lineTo(64, 152);
    ctx.lineTo(28, 96);
    ctx.closePath();
    ctx.stroke();

    ctx.font = "bold 64px 'Courier New', monospace";
    ctx.fillText("?", 64, 96);
  } else {
    ctx.font = "bold 15px 'Courier New', monospace";
    ctx.fillText(role.toUpperCase(), 64, 30);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";

    if (role === "Duke") {
      ctx.beginPath();
      ctx.moveTo(34, 130);
      ctx.lineTo(34, 90);
      ctx.lineTo(49, 110);
      ctx.lineTo(64, 80);
      ctx.lineTo(79, 110);
      ctx.lineTo(94, 90);
      ctx.lineTo(94, 130);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (role === "Assassin") {
      ctx.beginPath();
      ctx.moveTo(64, 60);
      ctx.lineTo(74, 110);
      ctx.lineTo(68, 110);
      ctx.lineTo(68, 125);
      ctx.lineTo(80, 125);
      ctx.lineTo(80, 131);
      ctx.lineTo(48, 131);
      ctx.lineTo(48, 125);
      ctx.lineTo(60, 125);
      ctx.lineTo(60, 110);
      ctx.lineTo(54, 110);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.fillRect(60, 131, 8, 18);
      ctx.beginPath();
      ctx.arc(64, 153, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (role === "Captain") {
      ctx.beginPath();
      ctx.arc(64, 80, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(62, 90, 4, 50);
      ctx.fillRect(48, 105, 32, 4);
      ctx.beginPath();
      ctx.arc(64, 120, 24, 0.1 * Math.PI, 0.9 * Math.PI, false);
      ctx.stroke();
    } else if (role === "Ambassador") {
      ctx.beginPath();
      ctx.moveTo(64, 70);
      ctx.lineTo(64, 140);
      ctx.moveTo(34, 90);
      ctx.lineTo(94, 90);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(34, 115, 12, 0, Math.PI, false);
      ctx.moveTo(34, 90);
      ctx.lineTo(34, 103);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(94, 115, 12, 0, Math.PI, false);
      ctx.moveTo(94, 90);
      ctx.lineTo(94, 103);
      ctx.stroke();
    } else if (role === "Contessa") {
      ctx.beginPath();
      ctx.moveTo(64, 60);
      ctx.lineTo(94, 90);
      ctx.lineTo(94, 115);
      ctx.lineTo(64, 145);
      ctx.lineTo(34, 115);
      ctx.lineTo(34, 90);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  return new THREE.CanvasTexture(canvas);
}

export default function Table({ gameState, isShuffling = false }: TableProps) {
  const coinBoxRef = useRef<THREE.Group>(null);
  const { camera, scene } = useThree();

  const [tableTop, setTableTop] = useState(-0.75); // default fallback Y
  const [pilesBuilt, setPilesBuilt] = useState(false);

  const buildPiles = useCallback(() => {
    setPilesBuilt(true);
  }, []);

  // Raycast from camera downward to find tableTop Y
  useEffect(() => {
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
    let tableMesh: THREE.Object3D | null = null;
    
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.receiveShadow && child.geometry instanceof THREE.CylinderGeometry) {
        tableMesh = child;
      }
    });

    if (tableMesh) {
      const hits = raycaster.intersectObject(tableMesh, true);
      const topY = hits.length ? hits[0].point.y : -0.75;
      console.log("Calculated tableTop Y at runtime:", topY);
      setTableTop(topY);
      buildPiles();
    } else {
      // Fallback build if not found immediately
      const timer = setTimeout(() => {
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.receiveShadow && child.geometry instanceof THREE.CylinderGeometry) {
            tableMesh = child;
          }
        });
        if (tableMesh) {
          const hits = raycaster.intersectObject(tableMesh, true);
          const topY = hits.length ? hits[0].point.y : -0.75;
          console.log("Calculated tableTop Y at deferred runtime:", topY);
          setTableTop(topY);
        }
        buildPiles();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scene, buildPiles]);

  // Log all pile positions on change for debugging
  useEffect(() => {
    if (pilesBuilt) {
      console.log("COMMUNITY pos:", [0, tableTop + 0.015, -0.3]);
      console.log("PUBLIC pos:", [-0.75, tableTop + 0.015, -0.3]);
      console.log("GRAVEYARD pos:", [0.75, tableTop + 0.015, -0.3]);
    }
  }, [pilesBuilt, tableTop]);

  // Generate role card textures using actual image files
  const textures = {
    Duke: useTexture("/assets/duke.png"),
    Assassin: useTexture("/assets/assassin.png"),
    Captain: useTexture("/assets/captain.png"),
    Ambassador: useTexture("/assets/ambassador.png"),
    Contessa: useTexture("/assets/contessa.png"),
    card_back: useTexture("/assets/card_back.png"),
  };

  // Community cards rotation state
  const commRotX = useRef<number[]>([Math.PI, Math.PI, Math.PI]);

  // Deal animation start timer
  const dealStartTime = useRef(Date.now());

  useFrame((state, delta) => {
    // 1. Rotate Coin Treasury chest to face the camera
    if (coinBoxRef.current && camera) {
      const boxGlobalX = 0;
      const boxGlobalZ = -0.6;
      coinBoxRef.current.rotation.y = Math.atan2(camera.position.x - boxGlobalX, camera.position.z - boxGlobalZ);
    }

    // 2. Animate Community Cards flipping
    for (let i = 0; i < 3; i++) {
      const isRevealed = gameState.piles.community[i] !== "HIDDEN";
      const targetX = isRevealed ? 0 : Math.PI;
      commRotX.current[i] = THREE.MathUtils.lerp(commRotX.current[i], targetX, delta * 6);
    }
  });

  const commPile = gameState.piles.community;
  const pubPile = gameState.piles.public;
  const discPile = gameState.piles.discard;

  const publicMatWidth = Math.max(1.2, pubPile.length * 0.35 + 0.15);
  const graveyardMatWidth = Math.max(0.6, discPile.length * 0.12 + 0.3);

  // Compute local relative positions
  // Table group is at [0, -0.8, 0].
  // tableTop is at world coordinate, relative coordinate in table group is tableTop - (-0.8)
  const relativeTableTop = tableTop + 0.8;
  const relativeCardY = relativeTableTop + 0.015;

  return (
    <group position={[0, -0.8, 0]}>
      {/* 3D Circular Poker Table Felt */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[4, 4, 0.1, 64]} />
        <meshStandardMaterial color="#062211" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* 3D Mahogany Wood Table Rim */}
      <mesh receiveShadow position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4, 4.4, 64]} />
        <meshStandardMaterial color="#2a1204" roughness={0.3} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* Table Rim Outer Edge Lip */}
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <cylinderGeometry args={[4.4, 4.4, 0.2, 64, 1, true]} />
        <meshStandardMaterial color="#1a0a02" roughness={0.4} />
      </mesh>

      {/* Decorative Inner Gold Ring */}
      <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.8, 3.82, 64]} />
        <meshStandardMaterial color="#ffd700" roughness={0.2} metalness={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* CENTER TABLE ASSETS */}
      <group position={[0, 0.05, 0]}>
        {/* Treasury Chest - Aligned Facing Camera */}
        <group ref={coinBoxRef} position={[0, 0.1, -0.6]}>
          <mesh castShadow>
            <boxGeometry args={[0.7, 0.35, 0.5]} />
            <meshStandardMaterial color="#4d3300" roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.72, 0.04, 0.52]} />
            <meshStandardMaterial color="#ffd700" roughness={0.2} metalness={0.9} />
          </mesh>
          <mesh castShadow position={[0, 0.2, -0.05]} rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.7, 0.15, 0.5]} />
            <meshStandardMaterial color="#ffd700" roughness={0.3} metalness={0.7} />
          </mesh>
          
          {/* Gold coins cylinder grid inside chest */}
          {[-0.1, 0, 0.1].map((zVal, rowIdx) =>
            [-0.2, -0.1, 0, 0.1, 0.2].map((xVal, colIdx) => (
              <group key={`coin-${rowIdx}-${colIdx}`} position={[xVal, 0.06, zVal]}>
                {Array.from({ length: 3 }).map((_, stackIdx) => (
                  <mesh
                    key={stackIdx}
                    position={[0, stackIdx * 0.009, 0]}
                    rotation={[0, Math.sin(rowIdx + colIdx) * 0.5, 0]}
                    castShadow
                  >
                    <cylinderGeometry args={[0.04, 0.04, 0.008, 12]} />
                    <meshStandardMaterial color="#ffd700" metalness={1.0} roughness={0.2} />
                  </mesh>
                ))}
              </group>
            ))
          )}
        </group>

        {pilesBuilt && (
          <group>
            {/* PILE 1: COMMUNITY PILE (Center, X=0, Z=0.2) */}
            <group position={[0, relativeCardY, 0.2]} ref={el => { if (el) (window as any).communityGroup = el; }}>
              {/* Flat green felt mat tray under community pile */}
              <mesh position={[0, -0.013, 0]}>
                <boxGeometry args={[1.15, 0.005, 0.6]} />
                <meshStandardMaterial color="#1b5e20" roughness={0.6} />
              </mesh>
              {/* Gold border frame */}
              <mesh position={[0, -0.013, 0]}>
                <boxGeometry args={[1.17, 0.004, 0.62]} />
                <meshStandardMaterial color="#ffd700" roughness={0.2} metalness={0.8} />
              </mesh>

              {commPile.map((card, idx) => {
                const isRevealed = card !== "HIDDEN";
                const cardTexture = isRevealed ? (textures[card as CardType] || textures.Duke) : textures.card_back;
                const xOffset = (idx - 1) * 0.35;

                return (
                  <group
                    key={`comm-card-${idx}`}
                    position={[xOffset, 0, 0]}
                    rotation={[commRotX.current[idx], 0, 0]}
                  >
                    {/* Glowing Green Under-Rim */}
                    <mesh position={[0, -0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[0.4, 0.56]} />
                      <meshBasicMaterial color="#00e5ff" transparent opacity={0.22} depthWrite={false} />
                    </mesh>

                    {/* Card Base */}
                    <mesh castShadow>
                      <boxGeometry args={[0.36, 0.01, 0.52]} />
                      <meshStandardMaterial color="#1e0f33" roughness={0.4} metalness={0.2} />
                    </mesh>

                    {/* Card Top Face (Front or Back based on flip) */}
                    <mesh position={[0, 0.0051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[0.35, 0.5]} />
                      <meshStandardMaterial map={cardTexture} roughness={0.2} metalness={0.1} side={THREE.DoubleSide} />
                    </mesh>

                    {/* Card Bottom Face (Original back) */}
                    <mesh position={[0, -0.0051, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[0.35, 0.5]} />
                      <meshStandardMaterial map={textures.card_back} roughness={0.3} side={THREE.DoubleSide} />
                    </mesh>
                  </group>
                );
              })}

              <Html distanceFactor={1.8} position={[0, 0.40, 0]} center>
                <div
                  className="group/comm pointer-events-auto cursor-help select-none"
                  title="3 hidden cards. Used by Ambassador or to swap an exposed card."
                >
                  <div className="bg-black/95 backdrop-blur-md text-cyan-400 border border-cyan-500/40 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider whitespace-nowrap shadow-lg font-bold">
                    COMMUNITY
                  </div>
                </div>
              </Html>
              <pointLight position={[0, 0.4, 0]} intensity={5.0} distance={1.5} color="#ffffff" />
            </group>

            {/* PILE 2: PUBLIC PILE (Left, X=-1.25, Z=0.2) */}
            <group position={[-1.25, relativeCardY, 0.2]} ref={el => { if (el) (window as any).publicGroup = el; }}>
              {/* Flat gold mat tray under public pile */}
              <mesh position={[0, -0.013, 0]}>
                <boxGeometry args={[publicMatWidth, 0.005, 0.6]} />
                <meshStandardMaterial color="#ffab00" roughness={0.6} />
              </mesh>
              {/* Gold border frame */}
              <mesh position={[0, -0.013, 0]}>
                <boxGeometry args={[publicMatWidth + 0.02, 0.004, 0.62]} />
                <meshStandardMaterial color="#ffd700" roughness={0.2} metalness={0.8} />
              </mesh>

              {pubPile.length === 0 ? (
                <Html distanceFactor={1.8} position={[0, 0.02, 0]} center>
                  <span className="text-[8px] text-white/30 italic font-mono uppercase tracking-wider whitespace-nowrap select-none">
                    ALL CARDS IN PLAY
                  </span>
                </Html>
              ) : (
                pubPile.map((card, idx) => {
                  const cardTexture = textures[card] || textures.Duke;
                  const cardStartTime = dealStartTime.current + idx * 100;
                  const elapsed = Date.now() - cardStartTime;
                  const progress = Math.min(1, Math.max(0, elapsed / 600));
                  const ease = progress * progress * (3 - 2 * progress);

                  // Slide in from off-screen right
                  const targetX = (idx - (pubPile.length - 1) / 2) * 0.35;
                  const xVal = THREE.MathUtils.lerp(1.5, targetX, ease);
                  const yVal = THREE.MathUtils.lerp(0.5, 0, ease);

                  // Loose fan tilt
                  const tiltY = Math.sin(idx * 4.5) * 0.08;
                  const tiltZ = Math.cos(idx * 3.2) * 0.08;

                  return (
                    <group
                      key={`pub-card-${idx}`}
                      position={[xVal, yVal, 0]}
                      rotation={[0, tiltY, tiltZ]}
                    >
                      <mesh castShadow>
                        <boxGeometry args={[0.36, 0.01, 0.52]} />
                        <meshStandardMaterial color="#1e0f33" roughness={0.4} metalness={0.2} />
                      </mesh>
                      <mesh position={[0, 0.0051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.35, 0.5]} />
                        <meshStandardMaterial map={cardTexture} roughness={0.2} metalness={0.1} />
                      </mesh>
                    </group>
                  );
                })
              )}

              <Html distanceFactor={1.8} position={[0, 0.40, 0]} center>
                <div
                  className="pointer-events-auto cursor-help select-none"
                  title="These cards are known to all players."
                >
                  <div className="bg-black/95 backdrop-blur-md text-yellow-400 border border-yellow-500/40 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider whitespace-nowrap shadow-lg font-bold">
                    PUBLIC
                  </div>
                </div>
              </Html>
              <pointLight position={[0, 0.4, 0]} intensity={5.0} distance={1.5} color="#ffffff" />
            </group>

            {/* PILE 3: DISCARD PILE (Right, X=1.25, Z=0.2) */}
            <group position={[1.25, relativeCardY, 0.2]} ref={el => { if (el) (window as any).graveyardGroup = el; }}>
              {/* Flat dark red mat tray under discard pile */}
              <mesh position={[0, -0.013, 0]}>
                <boxGeometry args={[graveyardMatWidth, 0.005, 0.6]} />
                <meshStandardMaterial color="#b71c1c" roughness={0.6} />
              </mesh>
              {/* Gold border frame */}
              <mesh position={[0, -0.013, 0]}>
                <boxGeometry args={[graveyardMatWidth + 0.02, 0.004, 0.62]} />
                <meshStandardMaterial color="#ffd700" roughness={0.2} metalness={0.8} />
              </mesh>

              {discPile.map((card, idx) => {
                const cardTexture = textures[card] || textures.Duke;
                const xOffset = (idx - (discPile.length - 1) / 2) * 0.12;
                const yOffset = idx * 0.005;
                const rotY = (idx - (discPile.length - 1) / 2) * 0.08;

                return (
                  <group
                    key={`disc-card-${idx}`}
                    position={[xOffset, yOffset, 0]}
                    rotation={[0, rotY, 0]}
                  >
                    <mesh castShadow>
                      <boxGeometry args={[0.36, 0.01, 0.52]} />
                      <meshStandardMaterial color="#111" roughness={0.6} metalness={0.1} />
                    </mesh>
                    <mesh position={[0, 0.0051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[0.35, 0.5]} />
                      <meshStandardMaterial map={cardTexture} roughness={0.5} metalness={0.1} />
                    </mesh>
                    {/* Dead dark overlay */}
                    <mesh position={[0, 0.0055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <planeGeometry args={[0.35, 0.5]} />
                      <meshBasicMaterial color="#000000" transparent opacity={0.45} />
                    </mesh>
                  </group>
                );
              })}

              <Html distanceFactor={1.8} position={[0, 0.40, 0]} center>
                <div
                  className="pointer-events-auto cursor-help select-none flex items-center gap-1.5"
                  title="Cards lost by eliminated or challenged players."
                >
                  <div className="bg-black/95 backdrop-blur-md text-red-500 border border-red-500/40 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider whitespace-nowrap shadow-lg font-bold flex items-center gap-1">
                    <span>GRAVEYARD</span>
                    <span className="bg-red-500/20 text-[7px] text-red-400 px-1 rounded-full font-bold ml-0.5">
                      {discPile.length} cards
                    </span>
                  </div>
                </div>
              </Html>
            </group>
          </group>
        )}
      </group>
    </group>
  );
}

