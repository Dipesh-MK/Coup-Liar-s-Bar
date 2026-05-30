"use client";

import React, { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture, Html } from "@react-three/drei";
import * as THREE from "three";
import { CardType } from "../hooks/useCoupState";

let globalShimmerTexture: THREE.CanvasTexture | null = null;

function getShimmerTexture() {
  if (globalShimmerTexture) return globalShimmerTexture;
  if (typeof window === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  
  // Create diagonal linear gradient
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "rgba(255, 255, 255, 0)");
  grad.addColorStop(0.35, "rgba(255, 255, 255, 0)");
  grad.addColorStop(0.5, "rgba(0, 240, 255, 0.9)"); // Glowing neon cyan streak
  grad.addColorStop(0.65, "rgba(255, 255, 255, 0)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  globalShimmerTexture = tex;
  return tex;
}

function evaluateCubicBezierY(u: number): number {
  const y1 = 1.56;
  const y2 = 1.0;
  const t = Math.max(0, Math.min(1, u));
  return 3 * Math.pow(1 - t, 2) * t * y1 + 3 * (1 - t) * Math.pow(t, 2) * y2 + Math.pow(t, 3);
}

interface Card3DProps {
  card: CardType;
  index: number; // 0 or 1
  isRevealed: boolean;
  isPeekInteractive: boolean;
  onClick?: () => void;
  // Optional custom transformations for opponent players
  customPosition?: [number, number, number];
  customRotation?: [number, number, number];
  scale?: number;
  isPeekHand?: boolean;
}

export default function Card3D({
  card,
  index,
  isRevealed,
  isPeekInteractive,
  onClick,
  customPosition,
  customRotation,
  scale = 1,
  isPeekHand = false,
}: Card3DProps) {
  const rootRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const animTime = useRef(0); // 0 = table mode, 0.6 = peek mode

  // Load textures for card faces
  const textures = {
    Duke: useTexture("/assets/duke.png"),
    Assassin: useTexture("/assets/assassin.png"),
    Captain: useTexture("/assets/captain.png"),
    Ambassador: useTexture("/assets/ambassador.png"),
    Contessa: useTexture("/assets/contessa.png"),
  };

  const cardTexture = textures[card] || textures.Duke;
  const cardBackTexture = useTexture("/assets/card_back.png");

  // If it's an opponent card and not revealed, show back texture on both sides!
  const isOpponentHidden = !isPeekInteractive && !isRevealed;
  const frontTexture = isOpponentHidden ? cardBackTexture : cardTexture;

  // Custom holographic shimmer texture
  const shimmerTexture = getShimmerTexture();

  // Position setup: local player cards start flat face down on table, then fan up
  const startX = index === 0 ? -0.18 : 0.18;
  const startY = -0.74;
  const startZ = 1.15;
  const startRotX = -Math.PI / 2;
  const startRotY = index === 0 ? 0.08 : -0.08;
  const startRotZ = index === 0 ? 0.03 : -0.03;

  // Holographic shimmer opacity
  const shimmerOpacity = hovered ? 0.75 : (isRevealed ? 0.25 : 0.0);

  useFrame((state, delta) => {
    // Slowly animate the shimmer texture offset
    const texture = getShimmerTexture();
    if (texture) {
      texture.offset.x -= delta * 0.45;
      texture.offset.y -= delta * 0.45;
    }

    // Direct group manipulation for high performance animation
    if (!customPosition && rootRef.current) {
      const targetTime = isPeekHand ? 0.6 : 0.0;
      if (animTime.current !== targetTime) {
        if (isPeekHand) {
          animTime.current = Math.min(0.6, animTime.current + delta);
        } else {
          animTime.current = Math.max(0.0, animTime.current - delta);
        }
      }

      const u = animTime.current / 0.6;
      const easeVal = evaluateCubicBezierY(u);

      // Start values (table mode, u = 0)
      const startXVal = index === 0 ? -0.18 : 0.18;
      const startYVal = -0.74;
      const startZVal = 1.15;
      const startRotXVal = isRevealed ? -Math.PI / 2 : Math.PI / 2;
      const startRotYVal = isRevealed ? 0 : (index === 0 ? 0.08 : -0.08);
      const startRotZVal = isRevealed ? 0 : (index === 0 ? 0.03 : -0.03);

      // End values (peek mode, u = 1)
      const endXVal = index === 0 ? -0.22 : 0.22;
      const endYVal = -0.45;
      const endZVal = 1.25;
      const endRotXVal = isRevealed ? -Math.PI / 2 : 0.55;
      const endRotYVal = isRevealed ? 0 : (index === 0 ? 0.25 : -0.25);
      const endRotZVal = isRevealed ? 0 : (index === 0 ? 0.15 : -0.15);

      // Interpolate base values
      rootRef.current.position.x = startXVal + (endXVal - startXVal) * easeVal;
      rootRef.current.position.y = startYVal + (endYVal - startYVal) * easeVal;
      rootRef.current.position.z = startZVal + (endZVal - startZVal) * easeVal;

      rootRef.current.rotation.x = startRotXVal + (endRotXVal - startRotXVal) * easeVal;
      rootRef.current.rotation.y = startRotYVal + (endRotYVal - startRotYVal) * easeVal;
      rootRef.current.rotation.z = startRotZVal + (endRotZVal - startRotZVal) * easeVal;
    } else if (customPosition && rootRef.current) {
      let targetPos = [...customPosition] as [number, number, number];
      let targetRot = customRotation ? [...customRotation] as [number, number, number] : [0, 0, 0] as [number, number, number];

      // If it's an opponent card and not revealed, simulate human behavior
      if (!isPeekInteractive && !isRevealed) {
        // Use seat angle as seed
        const seed = Math.atan2(customPosition[0], customPosition[2]) * 10;
        const time = state.clock.getElapsedTime();
        const cycle = (time + seed) % 15; // 15-second loop
        const isHolding = cycle < 8; // Hold for 8s, put down for 7s

        if (!isHolding) {
          // Move flat to table Y felt (-0.79)
          targetPos[1] = -0.79;
          // Lay flat face-down
          targetRot[0] = Math.PI / 2;
          targetRot[2] = 0;
        }
      }

      rootRef.current.position.x = THREE.MathUtils.lerp(rootRef.current.position.x, targetPos[0], delta * 4);
      rootRef.current.position.y = THREE.MathUtils.lerp(rootRef.current.position.y, targetPos[1], delta * 4);
      rootRef.current.position.z = THREE.MathUtils.lerp(rootRef.current.position.z, targetPos[2], delta * 4);

      rootRef.current.rotation.x = THREE.MathUtils.lerp(rootRef.current.rotation.x, targetRot[0], delta * 4);
      rootRef.current.rotation.y = THREE.MathUtils.lerp(rootRef.current.rotation.y, targetRot[1], delta * 4);
      rootRef.current.rotation.z = THREE.MathUtils.lerp(rootRef.current.rotation.z, targetRot[2], delta * 4);
    }

    if (meshRef.current) {
      // Local target relative positions
      const targetX = 0;
      const targetYCoord = hovered && isPeekInteractive && isPeekHand ? 0.15 : 0;
      const targetZCoord = hovered && isPeekInteractive && isPeekHand ? -0.2 : 0;

      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, delta * 12);
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetYCoord, delta * 12);
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, targetZCoord, delta * 12);

      // Local target relative rotations
      const rotX = hovered && isPeekInteractive && isPeekHand && !isRevealed ? -0.3 : 0;
      const rotY = hovered && isPeekInteractive && isPeekHand && !isRevealed ? (index === 0 ? -0.13 : 0.13) : 0;
      const rotZ = hovered && isPeekInteractive && isPeekHand && !isRevealed ? (index === 0 ? -0.07 : 0.07) : 0;

      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, rotX, delta * 12);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, rotY, delta * 12);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, rotZ, delta * 12);
    }
  });

  const defaultPos: [number, number, number] = customPosition || [startX, startY, startZ];
  const defaultRot: [number, number, number] = customRotation || [startRotX, startRotY, startRotZ];

  return (
    <group
      ref={rootRef}
      position={defaultPos}
      rotation={defaultRot}
      scale={scale}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (isPeekInteractive && isPeekHand) setHovered(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (isPeekInteractive) setHovered(false);
        if (isPeekInteractive) setHovered(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
      }}
    >
      <group ref={meshRef}>
        {/* 3D Physical Card Base */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.72, 0.015]} />
          <meshStandardMaterial
            color="#1e0f33" // Deep violet card side/back color
            roughness={0.4}
            metalness={0.2}
          />
        </mesh>

        {/* Card Back Decorative Face */}
        <mesh position={[0, 0, -0.008]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.48, 0.7]} />
          <meshStandardMaterial
            map={cardBackTexture}
            roughness={0.4}
            metalness={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Card Front Face (Character Portrait) */}
        <mesh position={[0, 0, 0.008]}>
          <planeGeometry args={[0.48, 0.7]} />
          <meshStandardMaterial
            map={frontTexture}
            roughness={0.2}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Holographic Shimmer Overlay */}
        {shimmerTexture && shimmerOpacity > 0 && (
          <mesh position={[0, 0, 0.009]}>
            <planeGeometry args={[0.48, 0.7]} />
            <meshStandardMaterial
              map={shimmerTexture}
              transparent
              opacity={shimmerOpacity}
              blending={THREE.AdditiveBlending}
              roughness={0.1}
              metalness={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
      </group>

      {/* Name Label for local player cards or revealed cards */}
      {(!customPosition || isRevealed) && (
        <Html
          distanceFactor={1.5}
          position={[0, 0.45, 0.01]}
          center
        >
          <div className="bg-black/90 backdrop-blur-md text-amber-400 border border-amber-500/40 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider whitespace-nowrap shadow-lg select-none pointer-events-none font-bold">
            {card}
          </div>
        </Html>
      )}
    </group>
  );
}
