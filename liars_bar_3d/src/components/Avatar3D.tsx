"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PlayerState, AnimationEvent, CardType } from "../hooks/useCoupState";
import CoinStack3D from "./CoinStack3D";

// Extend global window typing for custom configuration and reactions API
declare global {
  interface Window {
    avatarReactions: Record<number, (type: string) => void>;
    localPlayerConfig: {
      animal: string;
      bodyColor: string;
      bodyType: string;
      eyeStyle: string;
      name: string;
      accessories?: {
        topHat: boolean;
        monocle: boolean;
        bowTie: boolean;
        scarf: boolean;
        vest: boolean;
      };
    };
    triggerReaction: (seatIdx: number, type: string) => void;
  }
}

interface Avatar3DProps {
  seatIdx: number;
  player: PlayerState;
  isActiveTurn: boolean;
  animationEvent: AnimationEvent | null;
  currentPlayerIdx: number;
  playerCount?: number;
  isPreview?: boolean;
  customColor?: string;
  customAnimal?: string;
  customEyeStyle?: string;
  customBodyType?: "CHUNKY" | "SKINNY" | "MUSCULAR" | "TINY" | "PEAR";
  customAccessories?: {
    topHat: boolean;
    monocle: boolean;
    bowTie: boolean;
    scarf: boolean;
    vest: boolean;
  };
}

// Play synthesized Web Audio sounds on death
function playDeathSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // 1. Crack sound (white noise burst)
    const bufferSize = ctx.sampleRate * 0.1; // 0.1s
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start();
    noise.stop(ctx.currentTime + 0.1);

    // 2. Boing/spring sound (sine wave sweep 800 -> 200 Hz)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);

    oscGain.gain.setValueAtTime(0.4, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn("Web Audio death sound failed:", e);
  }
}

// Pure helper function to draw dynamic cartoon mouths
function generateMouthTexture(seatIdx: number) {
  if (typeof window === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, 128, 128);

  const style = seatIdx % 3 === 0 ? "grin" : seatIdx % 3 === 1 ? "frown" : "smirk";

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";

  if (style === "grin") {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(64, 50, 40, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, 50);
    ctx.lineTo(104, 50);
    ctx.stroke();

    ctx.lineWidth = 6;
    for (let x = 40; x <= 88; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 50);
      ctx.lineTo(x, 50 + Math.sin(Math.acos((x - 64) / 40)) * 40);
      ctx.stroke();
    }
  } else if (style === "frown") {
    ctx.beginPath();
    ctx.arc(64, 85, 30, Math.PI, 0, false);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(34, 60);
    ctx.bezierCurveTo(54, 50, 74, 80, 94, 45);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export default function Avatar3D({
  seatIdx,
  player,
  isActiveTurn,
  animationEvent,
  currentPlayerIdx,
  playerCount = 4,
  isPreview = false,
  customColor,
  customAnimal,
  customEyeStyle,
  customBodyType,
  customAccessories,
}: Avatar3DProps) {
  const headGroupRef = useRef<THREE.Group>(null);
  const leftArmGroupRef = useRef<THREE.Group>(null);
  const dummyMeshRef = useRef<THREE.Mesh>(null);
  const rightArmGroupRef = useRef<THREE.Group>(null);
  const leftLegGroupRef = useRef<THREE.Group>(null);
  const rightLegGroupRef = useRef<THREE.Group>(null);
  
  const bodyMeshRef = useRef<THREE.Mesh>(null);
  const neckMeshRef = useRef<THREE.Mesh>(null);
  const headMeshRef = useRef<THREE.Mesh>(null);
  
  const rootGroupRef = useRef<THREE.Group>(null);
  const personalLightRef = useRef<THREE.PointLight>(null);
  const leftKneeGroupRef = useRef<THREE.Group>(null);
  const rightKneeGroupRef = useRef<THREE.Group>(null);

  const [isDeadMode, setIsDeadMode] = useState(false);
  const [showGravestone, setShowGravestone] = useState(false);
  const [isBotStanding, setIsBotStanding] = useState(false);

  useEffect(() => {
    if (isPreview || !player.isActive) return;
    // Set up a random interval to toggle standing/sitting
    const interval = setInterval(() => {
      if (Math.random() < 0.35) {
        setIsBotStanding((prev) => !prev);
      }
    }, 8000 + Math.random() * 8000);

    return () => clearInterval(interval);
  }, [isPreview, player.isActive]);
  
  const deathTimeRef = useRef(0);
  
  // Track falling parts physics states
  // We have 15 body parts
  const partRefs = useRef<Array<THREE.Object3D>>([]);
  const partStates = useRef<Array<{
    pos: THREE.Vector3;
    rot: THREE.Euler;
    vel: THREE.Vector3;
    aVel: THREE.Vector3;
    color: THREE.Color;
    targetColor: THREE.Color;
    opacity: number;
  }>>([]);

  // Sync elimination state
  useEffect(() => {
    if (player.isActive) {
      setIsDeadMode(false);
      setShowGravestone(false);
    } else if (!isDeadMode && !isPreview) {
      triggerDeath();
    }
  }, [player.isActive, isPreview]);

  const triggerDeath = () => {
    setIsDeadMode(true);
    deathTimeRef.current = Date.now();
    playDeathSound();

    // Initialize random velocity/spin for each of the 15 body parts
    const tempStates = [];
    for (let i = 0; i < 15; i++) {
      // Calculate world-ish coordinate offsets based on sitting pose
      let initialY = 0.25;
      let initialX = 0;
      let initialZ = 0;

      if (i === 1) initialY = 0.58; // Head
      else if (i === 2) initialY = 0.45; // Neck
      else if (i === 3) { initialX = -0.25; initialY = 0.38; } // Left Upper Arm
      else if (i === 4) { initialX = -0.25; initialY = 0.28; initialZ = 0.1; } // Left Lower Arm
      else if (i === 5) { initialX = -0.25; initialY = 0.28; initialZ = 0.2; } // Left Hand
      else if (i === 6) { initialX = 0.25; initialY = 0.38; } // Right Upper Arm
      else if (i === 7) { initialX = 0.25; initialY = 0.28; initialZ = 0.1; } // Right Lower Arm
      else if (i === 8) { initialX = 0.25; initialY = 0.28; initialZ = 0.2; } // Right Hand
      else if (i === 9) { initialX = -0.15; initialY = 0.05; initialZ = 0.15; } // Left Upper Leg
      else if (i === 10) { initialX = -0.15; initialY = -0.15; initialZ = 0.3; } // Left Lower Leg
      else if (i === 11) { initialX = -0.15; initialY = -0.25; initialZ = 0.35; } // Left Foot
      else if (i === 12) { initialX = 0.15; initialY = 0.05; initialZ = 0.15; } // Right Upper Leg
      else if (i === 13) { initialX = 0.15; initialY = -0.15; initialZ = 0.3; } // Right Lower Leg
      else if (i === 14) { initialX = 0.15; initialY = -0.25; initialZ = 0.35; } // Right Foot

      const startPos = new THREE.Vector3(initialX, initialY, initialZ);
      const startRot = new THREE.Euler(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      );

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.08,
        Math.random() * 0.12 + 0.04, // pop up slightly
        (Math.random() - 0.5) * 0.08
      );

      const aVel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );

      // Store initial color to lerp to gray
      const baseColStr = i === 1 ? headColor : (i === 0 ? bodyColor : "#888888");
      const startColor = new THREE.Color(baseColStr);
      const targetColor = new THREE.Color(0x888888);

      tempStates.push({
        pos: startPos,
        rot: startRot,
        vel,
        aVel,
        color: startColor,
        targetColor,
        opacity: 1.0
      });
    }
    partStates.current = tempStates;
  };

  // Determine role color and prop style from avatar role string
  const isDuke = player.avatar === "Duke";
  const isCaptain = player.avatar === "Captain";
  const isAssassin = player.avatar === "Assassin";
  const isContessa = player.avatar === "Contessa";
  const isAmbassador = player.avatar === "Ambassador";

  // Use custom color swatch if local player, else fallback to seat role
  let bodyColor = customColor;
  if (!bodyColor) {
    if (isDuke) bodyColor = "#4a148c"; // Purple
    else if (isCaptain) bodyColor = "#0d47a1"; // Blue
    else if (isAssassin) bodyColor = "#212121"; // Dark grey/black
    else if (isContessa) bodyColor = "#b71c1c"; // Red
    else bodyColor = "#1b5e20"; // Green (Ambassador)
  }

  let hatType: "crown" | "hood" | "pirate" | "none" = "none";
  if (isDuke) hatType = "crown";
  else if (isCaptain) hatType = "pirate";
  else if (isAssassin) hatType = "hood";

  // Expand animal roster to 10 types
  const animals = ["Bear", "Rabbit", "Cat", "Fox", "Wolf", "Frog", "Raccoon", "Duck", "Goat", "Panda"];
  const animalType = customAnimal || player.animal || animals[seatIdx % animals.length];

  // Head coloration
  let headColor = "#dcd5e7";
  if (animalType === "Frog") headColor = "#2e7d32";
  else if (animalType === "Fox") headColor = "#e65100";
  else if (animalType === "Wolf") headColor = "#616161";
  else if (animalType === "Bear") headColor = "#5d4037";
  else if (animalType === "Rabbit") headColor = "#f5f5f5";
  else if (animalType === "Cat") headColor = "#757575";
  else if (animalType === "Raccoon") headColor = "#4e4e4e"; // Dark grey
  else if (animalType === "Duck") headColor = "#fbc02d"; // Yellow
  else if (animalType === "Goat") headColor = "#efebe9"; // Light tan/white
  else if (animalType === "Panda") headColor = "#ffffff"; // White

  // Eye Style overrides
  const eyeStyle = customEyeStyle || player.eyeStyle || (seatIdx % 4 === 1 ? "Derpy" : seatIdx % 4 === 2 ? "Angry" : seatIdx % 4 === 3 ? "Sleepy" : "Normal");

  // Accessories checked options
  const accessories = customAccessories || player.accessories || {
    topHat: false,
    monocle: false,
    bowTie: false,
    scarf: false,
    vest: false
  };

  // Body Type dimensions
  const bodyType = customBodyType || player.bodyType || "CHUNKY";
  let h = 0.35;
  let rTop = 0.18;
  let rBottom = 0.22;
  
  if (bodyType === "SKINNY") { h = 0.38; rTop = 0.10; rBottom = 0.12; }
  else if (bodyType === "MUSCULAR") { h = 0.33; rTop = 0.22; rBottom = 0.18; }
  else if (bodyType === "TINY") { h = 0.25; rTop = 0.13; rBottom = 0.15; }
  else if (bodyType === "PEAR") { h = 0.32; rTop = 0.12; rBottom = 0.24; }

  // Mouth design
  const mouthTexture = useMemo(() => generateMouthTexture(seatIdx), [seatIdx]);

  // Seating polar coordinate systems
  const radius = isPreview ? 0 : 1.8 + (playerCount - 3) * 0.25;
  const angle = isPreview ? 0 : - (seatIdx / playerCount) * Math.PI * 2;

  const basePosition: [number, number, number] = isPreview
    ? [0, -0.3, 0]
    : [Math.sin(angle) * radius, -0.7, Math.cos(angle) * radius];

  const baseRotationY = isPreview ? 0 : angle + Math.PI;

  const coinStackPos: [number, number, number] = [0.35, 0.05, 0.55];

  // Animation values
  const targets = useRef({
    headX: 0,
    headY: 0,
    headZ: 0,
    bodyY: 0,
    bodyZ: 0,
    leftArmX: Math.PI / 4,      // upper arm forward 45 deg
    leftArmZ: 0.25,             // slightly out
    rightArmX: Math.PI / 4,
    rightArmZ: -0.25,
    eyeIntensity: 1.0,
    lightIntensity: 0.5
  });

  // Track state transitions
  useEffect(() => {
    if (!player.isActive) {
      targets.current.eyeIntensity = 0.0;
      targets.current.lightIntensity = 0.0;
    } else if (isActiveTurn) {
      targets.current.headX = -0.1;
      targets.current.bodyY = 0.02;
      targets.current.eyeIntensity = 2.0;
      targets.current.lightIntensity = 1.2; // pulse higher on active turn
    } else {
      targets.current.headX = 0;
      targets.current.bodyY = 0;
      targets.current.eyeIntensity = 1.0;
      targets.current.lightIntensity = 0.5;
    }
  }, [player.isActive, isActiveTurn]);

  // Action event animations
  useEffect(() => {
    if (!animationEvent || !player.isActive || isPreview) return;

    const isActor = animationEvent.actorId === player.id;
    const isTarget = animationEvent.targetId === player.id;

    if (isActor) {
      if (animationEvent.type === "tax") {
        targets.current.rightArmX = -0.5; // raise arm slightly
        targets.current.headX = -0.25;

        setTimeout(() => {
          targets.current.rightArmX = Math.PI / 4;
          targets.current.bodyY = -0.05;
          setTimeout(() => {
            targets.current.bodyY = 0;
            targets.current.headX = 0;
          }, 800);
        }, 300);
      } else if (["steal", "assassinate", "coup"].includes(animationEvent.type)) {
        targets.current.rightArmX = -0.6; // lean forward and point arm
        targets.current.headX = -0.1;

        setTimeout(() => {
          targets.current.rightArmX = Math.PI / 4;
          targets.current.headX = 0;
        }, 1500);
      } else if (animationEvent.type === "income" || animationEvent.type === "foreign_aid") {
        targets.current.leftArmX = -0.5;
        setTimeout(() => {
          targets.current.leftArmX = Math.PI / 4;
        }, 1200);
      }
    }

    if (isTarget) {
      if (animationEvent.type === "assassinate" || animationEvent.type === "coup") {
        targets.current.headX = -0.35;
        targets.current.bodyY = -0.08;
        setTimeout(() => {
          targets.current.headX = player.isActive ? 0 : 0.8;
          targets.current.bodyY = player.isActive ? 0 : -0.15;
        }, 1000);
      } else if (animationEvent.type === "slump") {
        targets.current.headX = 0.4;
        targets.current.bodyY = -0.08;
      }
    }
  }, [animationEvent, player.id, player.isActive, isPreview]);

  // Global reaction listener mounting
  useEffect(() => {
    if (isPreview) return;
    if (!window.avatarReactions) {
      window.avatarReactions = {};
    }
    window.avatarReactions[seatIdx] = (type: string) => {
      if (type === "shocked") {
        targets.current.headX = -0.3;
        setTimeout(() => {
          targets.current.headX = 0;
        }, 400);
      } else if (type === "laugh") {
        let count = 0;
        const interval = setInterval(() => {
          targets.current.bodyY = count % 2 === 0 ? 0.05 : -0.02;
          count++;
          if (count >= 6) {
            clearInterval(interval);
            targets.current.bodyY = 0;
          }
        }, 100);
      } else if (type === "suspicious") {
        targets.current.bodyZ = 0.15;
        targets.current.headY = Math.random() < 0.5 ? 0.25 : -0.25;
        setTimeout(() => {
          targets.current.bodyZ = 0;
          targets.current.headY = 0;
        }, 1000);
      } else if (type === "eliminated") {
        triggerDeath();
      }
    };

    return () => {
      if (window.avatarReactions) {
        delete window.avatarReactions[seatIdx];
      }
    };
  }, [seatIdx, isPreview, headColor, bodyColor]);

  // Idle look around logic
  useEffect(() => {
    if (!player.isActive || isPreview) return;

    let lookTimeoutId: NodeJS.Timeout;

    const scheduleLook = () => {
      const delay = 2000 + Math.random() * 3500;
      lookTimeoutId = setTimeout(() => {
        if (!isActiveTurn && (!animationEvent || (animationEvent.actorId !== player.id && animationEvent.targetId !== player.id))) {
          const r = Math.random();
          if (r < 0.4) {
            const activeSeat = currentPlayerIdx;
            if (activeSeat === seatIdx) {
              targets.current.headY = 0;
              targets.current.headX = -0.1;
            } else {
              let lookAngle = 0;
              if (seatIdx === 1) {
                if (activeSeat === 0) lookAngle = -0.65;
                else if (activeSeat === 2) lookAngle = 0.65;
              } else if (seatIdx === 2) {
                if (activeSeat === 1) lookAngle = -0.65;
                else if (activeSeat === 3) lookAngle = 0.65;
              } else {
                if (activeSeat === 2) lookAngle = -0.65;
                else if (activeSeat === 0) lookAngle = 0.65;
              }
              targets.current.headY = lookAngle + (Math.random() - 0.5) * 0.15;
              targets.current.headX = -0.05 + (Math.random() - 0.5) * 0.08;
            }
          } else if (r < 0.75) {
            targets.current.headY = (Math.random() - 0.5) * 0.9;
            targets.current.headX = (Math.random() - 0.5) * 0.25;
          } else {
            targets.current.headY = 0;
            targets.current.headX = 0.15;
          }
        } else {
          targets.current.headY = 0;
          targets.current.headX = isActiveTurn ? -0.1 : 0;
        }
        scheduleLook();
      }, delay);
    };

    scheduleLook();
    return () => clearTimeout(lookTimeoutId);
  }, [player.isActive, isActiveTurn, animationEvent, player.id, currentPlayerIdx, seatIdx, isPreview]);

  // Periodic random fidgets
  useEffect(() => {
    if (!player.isActive || isPreview) return;

    let fidgetTimeoutId: NodeJS.Timeout;

    const runFidget = () => {
      const delay = 4000 + Math.random() * 4000;
      fidgetTimeoutId = setTimeout(() => {
        if (!isActiveTurn) {
          const options = ["tilt", "lean"];
          const chosen = options[Math.floor(Math.random() * options.length)];
          if (chosen === "tilt") {
            targets.current.headZ = Math.random() < 0.5 ? 0.2 : -0.2;
            setTimeout(() => {
              targets.current.headZ = 0;
            }, 600);
          } else {
            targets.current.bodyZ = 0.08;
            setTimeout(() => {
              targets.current.bodyZ = 0;
            }, 800);
          }
        }
        runFidget();
      }, delay);
    };

    runFidget();
    return () => clearTimeout(fidgetTimeoutId);
  }, [player.isActive, isActiveTurn, isPreview]);

  // Blinking cycle variables
  const isBlinking = useRef(false);
  const blinkStartTime = useRef(0);
  const nextBlinkDelay = useRef(3000 + Math.random() * 3000);

  // Render ticks
  useFrame((state, delta) => {
    // 1. TURNTABLE PREVIEW OSCILLATION
    if (isPreview && rootGroupRef.current) {
      rootGroupRef.current.rotation.y = Math.sin(Date.now() * 0.0008) * 0.5;
    }

    // 2. PLAYING DEATH SEQUENCE PHYSICS
    if (isDeadMode && !showGravestone) {
      const elapsed = (Date.now() - deathTimeRef.current) / 1000;
      if (elapsed > 3.0) {
        setShowGravestone(true);
      } else {
        partStates.current.forEach((part, idx) => {
          // Fake gravity
          part.vel.y -= 0.004;
          part.pos.add(part.vel);
          
          part.rot.x += part.aVel.x;
          part.rot.y += part.aVel.y;
          part.rot.z += part.aVel.z;
          
          // Floor bounce at local y = -0.5 (world y = -1.2)
          if (part.pos.y < -0.5) {
            part.pos.y = -0.5;
            part.vel.y *= -0.3; // damped bounce
            part.vel.x *= 0.8;
            part.vel.z *= 0.8;
          }

          // Grayscale lerp after 0.5s
          if (elapsed > 0.5) {
            part.color.lerp(part.targetColor, 0.05);
          }

          // Opacity fade to 0 after 2s
          if (elapsed > 2.0) {
            part.opacity = THREE.MathUtils.lerp(part.opacity, 0.0, 0.1);
          }

          const mesh = partRefs.current[idx];
          if (mesh) {
            mesh.position.copy(part.pos);
            mesh.rotation.copy(part.rot);
            
            // Re-apply properties to materials recursively
            mesh.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material) {
                const mat = child.material;
                if (mat.color) mat.color.copy(part.color);
                mat.opacity = part.opacity;
                mat.transparent = true;
              }
            });
          }
        });
      }
    }

    // Update dummy mesh opacity for TEST 5
    if (isDeadMode && dummyMeshRef.current) {
      const elapsed = (Date.now() - deathTimeRef.current) / 1000;
      let opacity = 1.0;
      if (elapsed > 2.0) {
        opacity = Math.max(0, 1.0 - (elapsed - 2.0));
      }
      const mat = dummyMeshRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = opacity;
        mat.transparent = true;
      }
    }

    // 3. LIVING CHARACTER MOTOR ANIMATIONS
    if (!isDeadMode) {
      const t = targets.current;
      const now = Date.now();

      // Smoothly sync arm/hand targets with opponent card folding (isHolding cycle)
      const hasActiveAnim = animationEvent && (animationEvent.actorId === player.id || animationEvent.targetId === player.id);
      if (!hasActiveAnim && !isPreview && player.isActive) {
        const armSeed = angle * 10;
        const clockTime = state.clock.getElapsedTime();
        const cycle = (clockTime + armSeed) % 15;
        const isHolding = cycle < 8;

        if (isHolding) {
          t.leftArmX = Math.PI / 4;
          t.leftArmZ = 0.25;
          t.rightArmX = Math.PI / 4;
          t.rightArmZ = -0.25;
        } else {
          t.leftArmX = 0.15;
          t.leftArmZ = 0.15;
          t.rightArmX = 0.15;
          t.rightArmZ = -0.15;
        }
      }
      const isAboutToDie = !isPreview && player.isActive && player.coins === 0 && player.cards.length === 1;
      const bobSpeed = isAboutToDie ? 0.0024 : 0.0008;
      const swayAmp = isAboutToDie ? 0.09 : 0.03;
      const bobY = isPreview ? 0 : Math.sin(now * bobSpeed + seatIdx * 1.3) * 0.15;
      const swayZ = isPreview ? 0 : Math.sin(now * 0.0006 + seatIdx * 2.1) * swayAmp;
      const breatheY = isPreview ? 0 : Math.sin(now * 0.0015 + seatIdx) * 0.01;

      // Pulse personal spotlight intensity at 2Hz (0.5 to 1.2 intensity) if active turn
      if (personalLightRef.current) {
        if (isActiveTurn) {
          personalLightRef.current.intensity = 0.85 + Math.sin(Date.now() * 0.01257) * 0.35;
        } else {
          personalLightRef.current.intensity = THREE.MathUtils.lerp(personalLightRef.current.intensity, t.lightIntensity, delta * 8);
        }
      }

      const legTargetX = isBotStanding ? 0 : Math.PI / 2;
      const kneeTargetX = isBotStanding ? 0 : -Math.PI / 2;
      const bodyYOffset = isBotStanding ? 0.35 : 0;

      if (bodyMeshRef.current) {
        bodyMeshRef.current.position.y = THREE.MathUtils.lerp(bodyMeshRef.current.position.y, t.bodyY + breatheY + bodyYOffset, delta * 8);
        bodyMeshRef.current.position.z = THREE.MathUtils.lerp(bodyMeshRef.current.position.z, t.bodyZ, delta * 8);
        bodyMeshRef.current.rotation.z = THREE.MathUtils.lerp(bodyMeshRef.current.rotation.z, swayZ, delta * 8);
      }
      if (headGroupRef.current) {
        headGroupRef.current.rotation.x = THREE.MathUtils.lerp(headGroupRef.current.rotation.x, t.headX, delta * 8);
        headGroupRef.current.rotation.y = THREE.MathUtils.lerp(headGroupRef.current.rotation.y, t.headY + bobY, delta * 8);
        headGroupRef.current.rotation.z = THREE.MathUtils.lerp(headGroupRef.current.rotation.z, t.headZ, delta * 8);
      }
      if (leftArmGroupRef.current) {
        leftArmGroupRef.current.rotation.x = THREE.MathUtils.lerp(leftArmGroupRef.current.rotation.x, t.leftArmX, delta * 8);
        leftArmGroupRef.current.rotation.z = THREE.MathUtils.lerp(leftArmGroupRef.current.rotation.z, t.leftArmZ, delta * 8);
      }
      if (rightArmGroupRef.current) {
        rightArmGroupRef.current.rotation.x = THREE.MathUtils.lerp(rightArmGroupRef.current.rotation.x, t.rightArmX, delta * 8);
        rightArmGroupRef.current.rotation.z = THREE.MathUtils.lerp(rightArmGroupRef.current.rotation.z, t.rightArmZ, delta * 8);
      }
      if (leftLegGroupRef.current) {
        leftLegGroupRef.current.rotation.x = THREE.MathUtils.lerp(leftLegGroupRef.current.rotation.x, legTargetX, delta * 8);
      }
      if (rightLegGroupRef.current) {
        rightLegGroupRef.current.rotation.x = THREE.MathUtils.lerp(rightLegGroupRef.current.rotation.x, legTargetX, delta * 8);
      }
      if (leftKneeGroupRef.current) {
        leftKneeGroupRef.current.rotation.x = THREE.MathUtils.lerp(leftKneeGroupRef.current.rotation.x, kneeTargetX, delta * 8);
      }
      if (rightKneeGroupRef.current) {
        rightKneeGroupRef.current.rotation.x = THREE.MathUtils.lerp(rightKneeGroupRef.current.rotation.x, kneeTargetX, delta * 8);
      }

      // Blinking trigger check
      if (!isPreview && player.isActive) {
        if (!isBlinking.current && now - blinkStartTime.current > nextBlinkDelay.current) {
          isBlinking.current = true;
          blinkStartTime.current = now;
        }
        if (isBlinking.current) {
          const elapsed = now - blinkStartTime.current;
          if (elapsed > 150) {
            isBlinking.current = false;
            nextBlinkDelay.current = 3000 + Math.random() * 3000;
          }
        }
      }
    }
  });

  const now = Date.now();
  let currentBlinkScaleY = 1.0;
  if (isBlinking.current) {
    const elapsed = now - blinkStartTime.current;
    if (elapsed < 75) {
      currentBlinkScaleY = THREE.MathUtils.lerp(1.0, 0.1, elapsed / 75);
    } else if (elapsed < 150) {
      currentBlinkScaleY = THREE.MathUtils.lerp(0.1, 1.0, (elapsed - 75) / 75);
    }
  }

  const isSleepy = eyeStyle === "Sleepy";
  const isAngry = eyeStyle === "Angry";
  const isDerpy = eyeStyle === "Derpy";

  const eyeScaleY = isSleepy ? 0.35 : 1.0;
  const leftPupilX = isDerpy ? -0.015 : 0.015;
  const rightPupilX = isDerpy ? 0.015 : -0.015;

  const leftBrowY = isAngry ? 0.11 : 0.13 + (seatIdx % 3 === 1 ? 0.025 : 0.0);
  const rightBrowY = isAngry ? 0.11 : 0.13 + (seatIdx % 3 === 2 ? 0.025 : 0.0);
  const leftBrowRotZ = isAngry ? -0.35 : (seatIdx % 2 === 0 ? 0.18 : -0.12);
  const rightBrowRotZ = isAngry ? 0.35 : (seatIdx % 2 === 0 ? -0.18 : 0.12);

  // Accessories elements to render procedurally
  const renderAccessories = () => {
    return (
      <group>
        {accessories.topHat && (
          <group position={[0, 0.22, 0.02]} rotation={[0.08, 0, 0]}>
            {/* Crown */}
            <mesh castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.08, 0.09, 0.14, 10]} />
              <meshToonMaterial color="#111111" emissive="#111111" emissiveIntensity={0.15} />
            </mesh>
            {/* Brim */}
            <mesh position={[0, -0.07, 0]} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.13, 0.13, 0.01, 10]} />
              <meshToonMaterial color="#111111" emissive="#111111" emissiveIntensity={0.15} />
            </mesh>
            {/* Red band */}
            <mesh position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.091, 0.091, 0.02, 10]} />
              <meshToonMaterial color="#b71c1c" emissive="#b71c1c" emissiveIntensity={0.15} />
            </mesh>
          </group>
        )}

        {accessories.monocle && (
          <group position={[0.07, 0.05, 0.185]} rotation={[0, 0, -0.2]}>
            {/* Gold Frame rim */}
            <mesh castShadow={false} receiveShadow={false}>
              <torusGeometry args={[0.035, 0.005, 8, 16]} />
              <meshToonMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.25} />
            </mesh>
            {/* Monocle chain */}
            <mesh position={[0.035, -0.08, -0.02]} rotation={[0, 0, 0.4]}>
              <cylinderGeometry args={[0.002, 0.002, 0.16, 4]} />
              <meshToonMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.25} />
            </mesh>
          </group>
        )}

        {accessories.bowTie && (
          <group position={[0, h/2 + 0.02, 0.18]} rotation={[0, 0, 0]}>
            {/* Left Cone */}
            <mesh position={[-0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.03, 0.06, 4]} />
              <meshToonMaterial color="#d32f2f" emissive="#d32f2f" emissiveIntensity={0.15} />
            </mesh>
            {/* Right Cone */}
            <mesh position={[0.04, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.03, 0.06, 4]} />
              <meshToonMaterial color="#d32f2f" emissive="#d32f2f" emissiveIntensity={0.15} />
            </mesh>
            {/* Center knot */}
            <mesh position={[0, 0, 0.005]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshToonMaterial color="#d32f2f" emissive="#d32f2f" emissiveIntensity={0.15} />
            </mesh>
          </group>
        )}

        {accessories.scarf && (
          <group position={[0, h/2 + 0.03, 0]} rotation={[0.08, 0, 0]}>
            {/* Torus wrap around neck */}
            <mesh castShadow={false} receiveShadow={false}>
              <torusGeometry args={[0.13, 0.034, 8, 16]} />
              <meshToonMaterial color="#fbc02d" emissive="#fbc02d" emissiveIntensity={0.15} />
            </mesh>
            {/* Hanging tail */}
            <mesh position={[0.08, -0.15, 0.12]} rotation={[0.3, 0.2, -0.1]}>
              <boxGeometry args={[0.04, 0.2, 0.02]} />
              <meshToonMaterial color="#fbc02d" emissive="#fbc02d" emissiveIntensity={0.15} />
            </mesh>
          </group>
        )}

        {accessories.vest && (
          <mesh position={[0, 0, 0.181]} castShadow={false} receiveShadow={false}>
            <boxGeometry args={[0.22, h * 0.8, 0.005]} />
            <meshToonMaterial color="#37474f" emissive="#37474f" emissiveIntensity={0.1} />
          </mesh>
        )}
      </group>
    );
  };

  return (
    <>
    <group ref={rootGroupRef} position={basePosition} rotation={[0, baseRotationY, 0]}>
      {/* COIN STACK */}
      {!isPreview && !isDeadMode && (
        <CoinStack3D coins={player.coins} position={coinStackPos} />
      )}

      {isDeadMode ? (
        showGravestone ? (
          /* GRAVESTONE CROSS */
          <group position={[0, 0.0, 0]} rotation={[0, Math.sin(seatIdx) * 0.2, 0]}>
            {/* Base Block */}
            <mesh position={[0, -0.4, 0]} castShadow={false} receiveShadow={false}>
              <boxGeometry args={[0.35, 0.18, 0.22]} />
              <meshToonMaterial color="#455a64" />
            </mesh>
            
            {/* Cross vertical shaft */}
            <mesh position={[0, -0.05, 0]} castShadow={false} receiveShadow={false}>
              <boxGeometry args={[0.09, 0.55, 0.06]} />
              <meshToonMaterial color="#455a64" />
            </mesh>
            
            {/* Cross horizontal beam */}
            <mesh position={[0, 0.08, 0]} castShadow={false} receiveShadow={false}>
              <boxGeometry args={[0.32, 0.09, 0.06]} />
              <meshToonMaterial color="#455a64" />
            </mesh>
          </group>
        ) : (
          /* FLYING SEPARATED ROBLOX JOINT PARTS */
          <group>
            {/* 0. Torso */}
            <mesh ref={el => { if (el) partRefs.current[0] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[rTop, rBottom, h, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>
            
            {/* 1. Head */}
            <mesh ref={el => { if (el) partRefs.current[1] = el; }} castShadow={false} receiveShadow={false}>
              <sphereGeometry args={[0.18, 16, 16]} />
              <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 2. Neck */}
            <mesh ref={el => { if (el) partRefs.current[2] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.07, 0.09, 0.08, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 3. Left Upper Arm */}
            <mesh ref={el => { if (el) partRefs.current[3] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.06, 0.06, 0.22, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 4. Left Lower Arm */}
            <mesh ref={el => { if (el) partRefs.current[4] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.05, 0.05, 0.20, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 5. Left Hand */}
            <mesh ref={el => { if (el) partRefs.current[5] = el; }} castShadow={false} receiveShadow={false}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 6. Right Upper Arm */}
            <mesh ref={el => { if (el) partRefs.current[6] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.06, 0.06, 0.22, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 7. Right Lower Arm */}
            <mesh ref={el => { if (el) partRefs.current[7] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.05, 0.05, 0.20, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 8. Right Hand */}
            <mesh ref={el => { if (el) partRefs.current[8] = el; }} castShadow={false} receiveShadow={false}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 9. Left Upper Leg */}
            <mesh ref={el => { if (el) partRefs.current[9] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.08, 0.08, 0.22, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 10. Left Lower Leg */}
            <mesh ref={el => { if (el) partRefs.current[10] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.065, 0.065, 0.20, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 11. Left Foot */}
            <mesh ref={el => { if (el) partRefs.current[11] = el; }} castShadow={false} receiveShadow={false}>
              <boxGeometry args={[0.12, 0.06, 0.18]} />
              <meshToonMaterial color="#333333" emissive="#333333" emissiveIntensity={0.15} />
            </mesh>

            {/* 12. Right Upper Leg */}
            <mesh ref={el => { if (el) partRefs.current[12] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.08, 0.08, 0.22, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 13. Right Lower Leg */}
            <mesh ref={el => { if (el) partRefs.current[13] = el; }} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.065, 0.065, 0.20, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* 14. Right Foot */}
            <mesh ref={el => { if (el) partRefs.current[14] = el; }} castShadow={false} receiveShadow={false}>
              <boxGeometry args={[0.12, 0.06, 0.18]} />
              <meshToonMaterial color="#333333" emissive="#333333" emissiveIntensity={0.15} />
            </mesh>
          </group>
        )
      ) : (
        /* NORMAL LIVING CHARACTER MODEL */
        <group>
          {/* PERSONAL AMBIENT POINT LIGHT INSIDE TORSO */}
          <pointLight
            ref={personalLightRef}
            position={[0, 0.2, 0.2]}
            color="#ffe8c0"
            intensity={0.5}
            distance={1.5}
          />

          {/* Torso Cylinder */}
          <group ref={bodyMeshRef}>
            <mesh castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[rTop, rBottom, h, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>

            {/* Accessories vest decoration */}
            {renderAccessories()}

            {/* High standing collar for Contessa/Duke */}
            {(isContessa || isDuke) && (
              <mesh position={[0, h/2 + 0.02, 0]} castShadow={false} receiveShadow={false}>
                <cylinderGeometry args={[rTop * 1.1, rTop * 1.25, 0.06, 8, 1, true]} />
                <meshToonMaterial color={isContessa ? "#7f0000" : "#311b92"} emissive={isContessa ? "#220000" : "#0d0033"} emissiveIntensity={0.15} side={THREE.DoubleSide} />
              </mesh>
            )}

            {/* Neck Connection */}
            <mesh ref={neckMeshRef} position={[0, h/2 + 0.04, 0]} castShadow={false} receiveShadow={false}>
              <cylinderGeometry args={[0.07, 0.09, 0.08, 8]} />
              <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
            </mesh>
            <group ref={headGroupRef} position={[0, h/2 + 0.08 + 0.18, 0]} name={isPreview ? "previewHead" : "opponentHead"}>
              <mesh ref={headMeshRef} castShadow={false} receiveShadow={false}>
                <sphereGeometry args={[0.18, 16, 16]} />
                <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
              </mesh>

              {/* Soft golden halo ring for active player */}
              {!isPreview && isActiveTurn && (
                <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={false} receiveShadow={false}>
                  <torusGeometry args={[0.22, 0.015, 8, 24]} />
                  <meshToonMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.8} transparent opacity={0.6} />
                </mesh>
              )}

              {/* Animal Ears & Markings */}
              {animalType === "Bear" && (
                <group>
                  <mesh position={[-0.14, 0.13, 0]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.05, 10, 10]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.14, 0.13, 0]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.05, 10, 10]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Rabbit" && (
                <group>
                  <mesh position={[-0.06, 0.20, 0]} rotation={[0, 0, 0.08]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.02, 0.02, 0.20, 8]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.06, 0.20, 0]} rotation={[0, 0, -0.08]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.02, 0.02, 0.20, 8]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Cat" && (
                <group>
                  <mesh position={[-0.10, 0.14, 0.03]} rotation={[0.2, 0.1, 0.18]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.05, 0.1, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.10, 0.14, 0.03]} rotation={[0.2, -0.1, -0.18]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.05, 0.1, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Fox" && (
                <group>
                  <mesh position={[-0.11, 0.15, 0.03]} rotation={[0.2, 0.1, 0.2]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.055, 0.11, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.11, 0.15, 0.03]} rotation={[0.2, -0.1, -0.2]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.055, 0.11, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Wolf" && (
                <group>
                  <mesh position={[-0.11, 0.16, 0.02]} rotation={[0.2, 0.1, 0.18]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.055, 0.11, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.11, 0.16, 0.02]} rotation={[0.2, -0.1, -0.18]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.055, 0.11, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Frog" && (
                <group>
                  <mesh position={[-0.09, 0.1, 0.05]} rotation={[0, 0, 0.2]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.055, 0.055, 0.02, 12]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.09, 0.1, 0.05]} rotation={[0, 0, -0.2]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.055, 0.055, 0.02, 12]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Raccoon" && (
                <group>
                  {/* Cat-like pointy ears */}
                  <mesh position={[-0.10, 0.14, 0.03]} rotation={[0.2, 0.1, 0.18]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.05, 0.1, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.10, 0.14, 0.03]} rotation={[0.2, -0.1, -0.18]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.05, 0.1, 4]} />
                    <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                  </mesh>
                  {/* Dark Raccoon eye mask patches */}
                  <mesh position={[-0.07, 0.04, 0.161]} castShadow={false} receiveShadow={false}>
                    <circleGeometry args={[0.04, 16]} />
                    <meshBasicMaterial color="#111111" transparent opacity={0.8} depthWrite={false} />
                  </mesh>
                  <mesh position={[0.07, 0.04, 0.161]} castShadow={false} receiveShadow={false}>
                    <circleGeometry args={[0.04, 16]} />
                    <meshBasicMaterial color="#111111" transparent opacity={0.8} depthWrite={false} />
                  </mesh>
                </group>
              )}

              {animalType === "Duck" && (
                <group>
                  {/* Flat duck bill snout */}
                  <mesh position={[0, -0.05, 0.18]} castShadow={false} receiveShadow={false}>
                    <boxGeometry args={[0.13, 0.03, 0.15]} />
                    <meshToonMaterial color="#ff6f00" emissive="#ff6f00" emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Goat" && (
                <group>
                  {/* Two curved gold horns */}
                  <mesh position={[-0.07, 0.16, -0.03]} rotation={[-0.3, 0, -0.15]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.01, 0.02, 0.15, 6]} />
                    <meshToonMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.2} />
                  </mesh>
                  <mesh position={[0.07, 0.16, -0.03]} rotation={[-0.3, 0, 0.15]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.01, 0.02, 0.15, 6]} />
                    <meshToonMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.2} />
                  </mesh>
                  {/* Goat goatee beard */}
                  <mesh position={[0, -0.16, 0.12]} rotation={[0.25, 0, 0]} castShadow={false} receiveShadow={false}>
                    <coneGeometry args={[0.03, 0.08, 4]} />
                    <meshToonMaterial color="#efebe9" emissive="#efebe9" emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {animalType === "Panda" && (
                <group>
                  {/* Black sphere ears */}
                  <mesh position={[-0.14, 0.13, 0]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.05, 10, 10]} />
                    <meshToonMaterial color="#111111" emissive="#111111" emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0.14, 0.13, 0]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.05, 10, 10]} />
                    <meshToonMaterial color="#111111" emissive="#111111" emissiveIntensity={0.15} />
                  </mesh>
                  {/* Black eye rings */}
                  <mesh position={[-0.07, 0.04, 0.161]} castShadow={false} receiveShadow={false}>
                    <circleGeometry args={[0.045, 16]} />
                    <meshBasicMaterial color="#111111" transparent opacity={0.95} depthWrite={false} />
                  </mesh>
                  <mesh position={[0.07, 0.04, 0.161]} castShadow={false} receiveShadow={false}>
                    <circleGeometry args={[0.045, 16]} />
                    <meshBasicMaterial color="#111111" transparent opacity={0.95} depthWrite={false} />
                  </mesh>
                </group>
              )}

              {/* Snouts and Noses (Fallback generic snouts for bear, cats) */}
              {animalType === "Bear" && (
                <mesh position={[0, 0.01, 0.16]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.1, 0.07, 0.07]} />
                  <meshToonMaterial color="#3e2723" emissive="#221100" emissiveIntensity={0.1} />
                </mesh>
              )}

              {animalType === "Rabbit" && (
                <mesh position={[0, 0.01, 0.17]} castShadow={false} receiveShadow={false}>
                  <sphereGeometry args={[0.025, 8, 8]} />
                  <meshToonMaterial color="#f8bbd0" emissive="#f8bbd0" emissiveIntensity={0.15} />
                </mesh>
              )}

              {animalType === "Cat" && (
                <mesh position={[0, -0.01, 0.16]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.06, 0.04, 0.04]} />
                  <meshToonMaterial color="#111111" emissive="#111111" emissiveIntensity={0.1} />
                </mesh>
              )}

              {animalType === "Fox" && (
                <mesh position={[0, -0.01, 0.17]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.07, 0.05, 0.09]} />
                  <meshToonMaterial color="#ffcc80" emissive="#ff9800" emissiveIntensity={0.15} />
                </mesh>
              )}

              {animalType === "Wolf" && (
                <mesh position={[0, -0.01, 0.18]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.07, 0.06, 0.12]} />
                  <meshToonMaterial color="#424242" emissive="#424242" emissiveIntensity={0.15} />
                </mesh>
              )}

              {animalType === "Raccoon" && (
                <mesh position={[0, -0.01, 0.16]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.07, 0.05, 0.08]} />
                  <meshToonMaterial color="#e0e0e0" emissive="#cccccc" emissiveIntensity={0.15} />
                </mesh>
              )}

              {/* 30% Oversized Eyes */}
              <group scale={1.3}>
                {/* Left Eye */}
                <group position={[-0.07, 0.05, 0.135]}>
                  <mesh scale={[1, eyeScaleY * currentBlinkScaleY, 1]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.045, 12, 12]} />
                    <meshToonMaterial color="#ffffff" emissive="#333" emissiveIntensity={0.1} />
                  </mesh>
                  <group scale={[1, eyeScaleY, 1]}>
                    <mesh position={[leftPupilX, 0, 0.03]}>
                      <sphereGeometry args={[0.022, 8, 8]} />
                      <meshToonMaterial color={isAngry ? "#ff0000" : "#3e2723"} emissive={isAngry ? "#500" : "#000"} emissiveIntensity={1.0} />
                    </mesh>
                  </group>
                </group>

                {/* Right Eye */}
                <group position={[0.07, 0.05, 0.135]}>
                  <mesh scale={[1, eyeScaleY * currentBlinkScaleY, 1]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.045, 12, 12]} />
                    <meshToonMaterial color="#ffffff" emissive="#333" emissiveIntensity={0.1} />
                  </mesh>
                  <group scale={[1, eyeScaleY, 1]}>
                    <mesh position={[rightPupilX, 0, 0.03]}>
                      <sphereGeometry args={[0.022, 8, 8]} />
                      <meshToonMaterial color={isAngry ? "#ff0000" : "#3e2723"} emissive={isAngry ? "#500" : "#000"} emissiveIntensity={1.0} />
                    </mesh>
                  </group>
                </group>

                {/* Eyebrows */}
                <mesh position={[-0.07, leftBrowY, 0.145]} rotation={[0, 0, leftBrowRotZ]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.08, 0.018, 0.018]} />
                  <meshToonMaterial color="#2d1500" />
                </mesh>
                <mesh position={[0.07, rightBrowY, 0.145]} rotation={[0, 0, rightBrowRotZ]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.08, 0.018, 0.018]} />
                  <meshToonMaterial color="#2d1500" />
                </mesh>

                {/* Blushing cheeks */}
                <mesh position={[-0.11, -0.02, 0.15]}>
                  <circleGeometry args={[0.025, 12]} />
                  <meshBasicMaterial color="#ff80ab" transparent opacity={0.35} depthWrite={false} />
                </mesh>
                <mesh position={[0.11, -0.02, 0.15]}>
                  <circleGeometry args={[0.025, 12]} />
                  <meshBasicMaterial color="#ff80ab" transparent opacity={0.35} depthWrite={false} />
                </mesh>
              </group>

              {/* Mouth texture plane */}
              {mouthTexture && (
                <mesh position={[0, -0.06, 0.171]} scale={1.2}>
                  <planeGeometry args={[0.14, 0.07]} />
                  <meshBasicMaterial map={mouthTexture} transparent depthWrite={false} />
                </mesh>
              )}

              {/* Eyepatch for Captain */}
              {isCaptain && (
                <group position={[-0.08, 0.05, 0.15]}>
                  <mesh rotation={[0.1, 0, 0.2]} castShadow={false} receiveShadow={false}>
                    <torusGeometry args={[0.2, 0.015, 8, 16]} />
                    <meshToonMaterial color="#111" />
                  </mesh>
                  <mesh position={[0, 0, 0.008]} castShadow={false} receiveShadow={false}>
                    <boxGeometry args={[0.07, 0.07, 0.015]} />
                    <meshToonMaterial color="#111" />
                  </mesh>
                </group>
              )}

              {/* Props on head (Duke Crown, Pirate Hat, Assassin Hood) */}
              {hatType === "crown" && (
                <group position={[0, 0.18, 0]}>
                  <mesh castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.15, 0.12, 0.08, 8, 1, false]} />
                    <meshToonMaterial color="#ffd700" emissive="#554400" emissiveIntensity={0.2} />
                  </mesh>
                  {Array.from({ length: 8 }).map((_, idx) => {
                    const angleSpike = (idx / 8) * Math.PI * 2;
                    return (
                      <mesh key={idx} position={[Math.cos(angleSpike) * 0.14, 0.05, Math.sin(angleSpike) * 0.14]}>
                        <sphereGeometry args={[0.018, 8, 8]} />
                        <meshToonMaterial color="#ff0000" emissive="#700" />
                      </mesh>
                    );
                  })}
                </group>
              )}

              {hatType === "pirate" && (
                <group position={[0, 0.16, 0]}>
                  <mesh rotation={[0.18, 0, 0]} castShadow={false} receiveShadow={false}>
                    <cylinderGeometry args={[0.22, 0.22, 0.04, 12]} />
                    <meshToonMaterial color="#1e1e1e" emissive="#111" emissiveIntensity={0.15} />
                  </mesh>
                  <mesh position={[0, 0.025, 0]} castShadow={false} receiveShadow={false}>
                    <sphereGeometry args={[0.13, 8, 8]} />
                    <meshToonMaterial color="#1e1e1e" emissive="#111" emissiveIntensity={0.15} />
                  </mesh>
                </group>
              )}

              {hatType === "hood" && (
                <mesh position={[0, 0.04, -0.04]} castShadow={false} receiveShadow={false}>
                  <sphereGeometry args={[0.22, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.5]} />
                  <meshToonMaterial color="#111" side={THREE.DoubleSide} />
                </mesh>
              )}
            </group>

            {/* ARMS: Segmented Upper & Lower, resting flat on table */}
            {/* Left Arm Group */}
            <group ref={leftArmGroupRef} position={[-rTop - 0.05, h/2 - 0.05, 0]} rotation={[Math.PI / 4, 0, 0.25]}>
              {/* Upper arm */}
              <mesh position={[0, -0.11, 0]} castShadow={false} receiveShadow={false}>
                <cylinderGeometry args={[0.06, 0.06, 0.22, 8]} />
                <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
              </mesh>
              {/* Lower Arm Joint */}
              <group position={[0, -0.22, 0]} rotation={[-Math.PI / 4, 0, 0]}>
                {/* Lower arm */}
                <mesh position={[0, -0.10, 0]} castShadow={false} receiveShadow={false}>
                  <cylinderGeometry args={[0.05, 0.05, 0.20, 8]} />
                  <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
                </mesh>
                {/* Hand */}
                <mesh position={[0, -0.20, 0]} scale={[1, 0.6, 1]} castShadow={false} receiveShadow={false}>
                  <sphereGeometry args={[0.07, 8, 8]} />
                  <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                </mesh>

                {/* Ambassador scroll */}
                {isAmbassador && player.isActive && (
                  <group position={[0, -0.21, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
                    <mesh castShadow={false} receiveShadow={false}>
                      <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
                      <meshToonMaterial color="#fffdd0" />
                    </mesh>
                    <mesh position={[0, 0, 0]}>
                      <cylinderGeometry args={[0.022, 0.022, 0.02, 8]} />
                      <meshToonMaterial color="#d32f2f" />
                    </mesh>
                  </group>
                )}
              </group>
            </group>

            {/* Right Arm Group */}
            <group ref={rightArmGroupRef} position={[rTop + 0.05, h/2 - 0.05, 0]} rotation={[Math.PI / 4, 0, -0.25]}>
              {/* Upper arm */}
              <mesh position={[0, -0.11, 0]} castShadow={false} receiveShadow={false}>
                <cylinderGeometry args={[0.06, 0.06, 0.22, 8]} />
                <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
              </mesh>
              {/* Lower Arm Joint */}
              <group position={[0, -0.22, 0]} rotation={[-Math.PI / 4, 0, 0]}>
                {/* Lower arm */}
                <mesh position={[0, -0.10, 0]} castShadow={false} receiveShadow={false}>
                  <cylinderGeometry args={[0.05, 0.05, 0.20, 8]} />
                  <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
                </mesh>
                {/* Hand */}
                <mesh position={[0, -0.20, 0]} scale={[1, 0.6, 1]} castShadow={false} receiveShadow={false}>
                  <sphereGeometry args={[0.07, 8, 8]} />
                  <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
                </mesh>

                {/* Assassin Dagger */}
                {isAssassin && player.isActive && (
                  <group position={[0, -0.21, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
                    <mesh castShadow={false} receiveShadow={false}>
                      <cylinderGeometry args={[0.016, 0.016, 0.22, 8]} />
                      <meshToonMaterial color="#9e9e9e" />
                    </mesh>
                    <mesh position={[0, -0.1, 0.015]}>
                      <boxGeometry args={[0.024, 0.05, 0.06]} />
                      <meshToonMaterial color="#5d4037" />
                    </mesh>
                  </group>
                )}
              </group>
            </group>

            {/* LEGS: Segmented thighs pointing forward, lower legs hanging down */}
            {/* Left Leg Group */}
            <group ref={leftLegGroupRef} position={[-rBottom * 0.5, -h/2, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
              {/* Upper Leg */}
              <mesh position={[0, -0.11, 0]} castShadow={false} receiveShadow={false}>
                <cylinderGeometry args={[0.08, 0.08, 0.22, 8]} />
                <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
              </mesh>
              {/* Knee joint */}
              <group ref={leftKneeGroupRef} position={[0, -0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                {/* Lower Leg */}
                <mesh position={[0, -0.10, 0]} castShadow={false} receiveShadow={false}>
                  <cylinderGeometry args={[0.065, 0.065, 0.20, 8]} />
                  <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
                </mesh>
                {/* Foot */}
                <mesh position={[0, -0.20, 0.04]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.12, 0.06, 0.18]} />
                  <meshToonMaterial color="#333333" emissive="#222" emissiveIntensity={0.1} />
                </mesh>
              </group>
            </group>

            {/* Right Leg Group */}
            <group ref={rightLegGroupRef} position={[rBottom * 0.5, -h/2, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
              {/* Upper Leg */}
              <mesh position={[0, -0.11, 0]} castShadow={false} receiveShadow={false}>
                <cylinderGeometry args={[0.08, 0.08, 0.22, 8]} />
                <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
              </mesh>
              {/* Knee joint */}
              <group ref={rightKneeGroupRef} position={[0, -0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                {/* Lower Leg */}
                <mesh position={[0, -0.10, 0]} castShadow={false} receiveShadow={false}>
                  <cylinderGeometry args={[0.065, 0.065, 0.20, 8]} />
                  <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
                </mesh>
                {/* Foot */}
                <mesh position={[0, -0.20, 0.04]} castShadow={false} receiveShadow={false}>
                  <boxGeometry args={[0.12, 0.06, 0.18]} />
                  <meshToonMaterial color="#333333" emissive="#222" emissiveIntensity={0.1} />
                </mesh>
              </group>
            </group>

          </group>
        </group>
      )}
    </group>
    {isDeadMode && (
      <mesh ref={dummyMeshRef} position={[99, 99, 99]} userData={{ seatIndex: seatIdx }}>
        <boxGeometry args={[0.01, 0.01, 0.01]} />
        <meshBasicMaterial transparent opacity={1.0} color="#888888" />
      </mesh>
    )}
    </>
  );
}
