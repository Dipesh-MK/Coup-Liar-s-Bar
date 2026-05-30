"use client";

import React from "react";

interface CoinStack3DProps {
  coins: number;
  position: [number, number, number];
}

export default function CoinStack3D({ coins, position }: CoinStack3DProps) {
  // Cap visual coins representation at 15 for performance
  const count = Math.min(coins, 15);
  if (count <= 0) return null;

  // We stack coins up to 5 coins per pile, then spawn a secondary pile next to it
  const piles: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const pileSize = Math.min(remaining, 5);
    piles.push(pileSize);
    remaining -= pileSize;
  }

  return (
    <group position={position}>
      {piles.map((pileSize, pIdx) => {
        // Offset each secondary pile slightly in X and Z directions
        const offsetX = pIdx * 0.22;
        const offsetZ = pIdx * -0.05;

        return (
          <group key={pIdx} position={[offsetX, 0, offsetZ]}>
            {Array.from({ length: pileSize }).map((_, cIdx) => {
              const coinHeight = 0.025;
              // Stack vertically
              const yPos = cIdx * coinHeight;

              return (
                <mesh key={cIdx} castShadow position={[0, yPos, 0]}>
                  {/* Flat cylinder representing a gold coin */}
                  <cylinderGeometry args={[0.1, 0.1, coinHeight, 16]} />
                  <meshStandardMaterial
                    color="#ffd700" // Shiny Casino Gold
                    metalness={0.9}
                    roughness={0.15}
                  />
                  {/* Raised inner ring detail */}
                  <mesh position={[0, coinHeight / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.07, 0.08, 16]} />
                    <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.3} />
                  </mesh>
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
