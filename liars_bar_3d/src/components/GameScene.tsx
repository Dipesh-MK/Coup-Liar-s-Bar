"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GameState, CardType } from "../hooks/useCoupState";
import Table from "./Table";
import Card3D from "./Card3D";
import Avatar3D from "./Avatar3D";
import CoinStack3D from "./CoinStack3D";

// 10 Procedural caricture portraits generator
function createFramedPortraitTexture(idx: number) {
  if (typeof window === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#1e122b";
  ctx.fillRect(0, 0, 256, 320);

  const useGold = idx % 2 === 0;
  ctx.fillStyle = useGold ? "#d4af37" : "#5c4033"; // Gold or dark wood frame
  ctx.fillRect(0, 0, 256, 320);

  ctx.fillStyle = "#120a1c";
  ctx.fillRect(16, 16, 224, 288);

  ctx.strokeStyle = useGold ? "#aa7c11" : "#3d251a";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 240, 304);

  ctx.save();
  ctx.beginPath();
  ctx.rect(16, 16, 224, 288);
  ctx.clip();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (idx === 0) {
    // sir reginald
    ctx.fillStyle = "#5d4037";
    ctx.beginPath();
    ctx.arc(128, 170, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8d6e63";
    ctx.beginPath();
    ctx.arc(128, 185, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.fillRect(120, 172, 16, 10);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(150, 150, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(166, 150);
    ctx.lineTo(200, 210);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(106, 150, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(106, 150, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111111";
    ctx.fillRect(88, 70, 80, 50);
    ctx.fillRect(72, 115, 112, 10);
    ctx.fillStyle = "#b71c1c";
    ctx.fillRect(88, 108, 80, 7);
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.moveTo(128, 195);
    ctx.quadraticCurveTo(158, 185, 168, 205);
    ctx.quadraticCurveTo(158, 215, 128, 200);
    ctx.quadraticCurveTo(98, 215, 88, 205);
    ctx.quadraticCurveTo(98, 185, 128, 195);
    ctx.fill();
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillText("Sir Reginald Bearsworth III", 128, 275);
  } else if (idx === 1) {
    // last bluff
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 220);
    ctx.lineTo(224, 220);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(70, 160, 12, 0, Math.PI * 2);
    ctx.moveTo(70, 172);
    ctx.lineTo(70, 210);
    ctx.moveTo(70, 185);
    ctx.lineTo(95, 195);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(170, 160, 12, 0, Math.PI * 2);
    ctx.moveTo(170, 172);
    ctx.lineTo(170, 210);
    ctx.moveTo(170, 185);
    ctx.lineTo(150, 182);
    ctx.moveTo(170, 185);
    ctx.lineTo(195, 150);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.save();
    ctx.translate(130, 140);
    ctx.rotate(0.4);
    ctx.fillRect(-8, -12, 16, 24);
    ctx.restore();
    ctx.save();
    ctx.translate(145, 165);
    ctx.rotate(-0.3);
    ctx.fillRect(-8, -12, 16, 24);
    ctx.restore();
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText("Turn 7, Circa 1842", 128, 275);
  } else if (idx === 2) {
    // motivational poster
    ctx.fillStyle = "#000000";
    ctx.fillRect(16, 16, 224, 288);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 16);
    ctx.lineTo(128, 110);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 122, 10, 0, Math.PI * 2);
    ctx.moveTo(128, 132);
    ctx.lineTo(128, 175);
    ctx.moveTo(128, 110);
    ctx.lineTo(128, 132);
    ctx.moveTo(128, 150);
    ctx.lineTo(110, 140);
    ctx.moveTo(128, 150);
    ctx.lineTo(146, 140);
    ctx.moveTo(128, 175);
    ctx.lineTo(115, 205);
    ctx.moveTo(128, 175);
    ctx.lineTo(141, 205);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillText("HANG IN THERE", 128, 240);
    ctx.font = "italic 9px 'Courier New', monospace";
    ctx.fillText("(I have the Contessa, honest)", 128, 265);
  } else if (idx === 3) {
    // anatomy
    ctx.fillStyle = "#eceff1";
    ctx.fillRect(16, 16, 224, 288);
    ctx.fillStyle = "#b0bec5";
    ctx.beginPath();
    ctx.arc(128, 120, 30, 0, Math.PI * 2);
    ctx.arc(128, 185, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(118, 80, 10, 35, 0, 0, Math.PI * 2);
    ctx.ellipse(138, 80, 10, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff1744";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(35, 80);
    ctx.lineTo(120, 110);
    ctx.stroke();
    ctx.fillStyle = "#ff1744";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText("Overthinking Cortex", 65, 72);
    ctx.beginPath();
    ctx.moveTo(210, 120);
    ctx.lineTo(135, 130);
    ctx.stroke();
    ctx.fillStyle = "#ff1744";
    ctx.fillText("Bluffing Glands", 175, 112);
    ctx.beginPath();
    ctx.moveTo(40, 230);
    ctx.lineTo(105, 200);
    ctx.stroke();
    ctx.fillStyle = "#ff1744";
    ctx.fillText("Coin Pouches", 65, 240);
    ctx.fillStyle = "#263238";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillText("ANATOMY OF A LIAR", 128, 275);
  } else if (idx === 4) {
    // employee
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(16, 16, 224, 288);
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(45, 45, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a0e8f";
    ctx.fillRect(80, 80, 96, 110);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(96, 110, 16, 16);
    ctx.fillRect(144, 110, 16, 16);
    ctx.fillStyle = "#111";
    ctx.fillRect(102, 116, 8, 8);
    ctx.fillRect(150, 116, 8, 8);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(88, 64, 80, 16);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.fillText("EMPLOYEE OF THE MONTH", 128, 215);
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillText("Name: The Duke", 128, 235);
    ctx.fillText("Reason: Tax Evasion", 128, 255);
  } else if (idx === 5) {
    // abstract
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(16, 16, 224, 288);
    ctx.lineWidth = 5;
    const colors = ["#ff3d00", "#e040fb", "#00e5ff", "#ffeb3b", "#00e676"];
    for (let s = 0; s < 15; s++) {
      ctx.strokeStyle = colors[s % colors.length];
      ctx.beginPath();
      ctx.moveTo(30 + Math.random() * 190, 30 + Math.random() * 200);
      ctx.bezierCurveTo(
        30 + Math.random() * 190, 30 + Math.random() * 200,
        30 + Math.random() * 190, 30 + Math.random() * 200,
        30 + Math.random() * 190, 30 + Math.random() * 200
      );
      ctx.stroke();
    }
    ctx.fillStyle = "#000000";
    ctx.font = "italic 8px Arial, sans-serif";
    ctx.fillText("Untitled (Ambassador's Regret)", 128, 255);
    ctx.font = "8px Arial, sans-serif";
    ctx.fillText("Oil on Canvas, $4,000", 128, 270);
  } else if (idx === 6) {
    // wanted
    ctx.fillStyle = "#d7ccc8";
    ctx.fillRect(16, 16, 224, 288);
    ctx.fillStyle = "#3e2723";
    ctx.font = "bold 24px 'Courier New', monospace";
    ctx.fillText("WANTED", 128, 50);
    ctx.fillStyle = "#5d4037";
    ctx.beginPath();
    ctx.moveTo(90, 120);
    ctx.lineTo(128, 90);
    ctx.lineTo(166, 120);
    ctx.lineTo(166, 180);
    ctx.lineTo(90, 180);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(98, 110);
    ctx.lineTo(90, 80);
    ctx.lineTo(112, 100);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(158, 110);
    ctx.lineTo(166, 80);
    ctx.lineTo(144, 100);
    ctx.fill();
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.fillText("FOR IMPERSONATING AN ASSASSIN", 128, 215);
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillText("REWARD: 7 COINS", 128, 245);
  } else if (idx === 7) {
    // birthday
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.fillStyle = "#ff4081";
    ctx.fillRect(100, 195, 56, 30);
    ctx.fillStyle = "#ffeb3b";
    ctx.fillRect(110, 180, 5, 15);
    ctx.fillRect(125, 180, 5, 15);
    ctx.fillRect(140, 180, 5, 15);
    ctx.beginPath();
    ctx.arc(80, 160, 10, 0, Math.PI * 2);
    ctx.moveTo(80, 170);
    ctx.lineTo(80, 210);
    ctx.moveTo(80, 180);
    ctx.lineTo(100, 190);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(175, 155, 10, 0, Math.PI * 2);
    ctx.moveTo(175, 165);
    ctx.lineTo(175, 210);
    ctx.moveTo(175, 175);
    ctx.lineTo(135, 175);
    ctx.stroke();
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.fillText("He claimed to be the Contessa.", 128, 275);
  } else if (idx === 8) {
    // Swimsuit Cat Calendar (Goofy/NSFW)
    ctx.fillStyle = "#ff69b4"; // Bright hot pink background
    ctx.fillRect(16, 16, 224, 288);
    
    // Draw cat ears
    ctx.fillStyle = "#3a221d";
    ctx.beginPath();
    ctx.moveTo(90, 100);
    ctx.lineTo(80, 60);
    ctx.lineTo(105, 85);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(166, 100);
    ctx.lineTo(176, 60);
    ctx.lineTo(151, 85);
    ctx.closePath();
    ctx.fill();

    // Draw cat face circle
    ctx.beginPath();
    ctx.arc(128, 115, 45, 0, Math.PI * 2);
    ctx.fill();

    // Cat muzzle and nose
    ctx.fillStyle = "#e5c158";
    ctx.beginPath();
    ctx.arc(128, 125, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(128, 122);
    ctx.lineTo(125, 118);
    ctx.lineTo(131, 118);
    ctx.closePath();
    ctx.fill();

    // Goofy derpy eyes
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(110, 105, 10, 0, Math.PI * 2);
    ctx.arc(146, 105, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff0000"; // Crossed derp pupils
    ctx.beginPath();
    ctx.arc(114, 105, 4, 0, Math.PI * 2);
    ctx.arc(142, 105, 4, 0, Math.PI * 2);
    ctx.fill();

    // Whiskers
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(85, 125); ctx.lineTo(60, 122);
    ctx.moveTo(85, 131); ctx.lineTo(58, 133);
    ctx.moveTo(171, 125); ctx.lineTo(196, 122);
    ctx.moveTo(171, 131); ctx.lineTo(198, 133);
    ctx.stroke();

    // Bikini body
    ctx.fillStyle = "#3a221d";
    ctx.fillRect(115, 160, 26, 60); // body stem

    // Bikini Top (bright green polka dot circles)
    ctx.fillStyle = "#00ff00";
    ctx.beginPath();
    ctx.arc(112, 175, 12, 0, Math.PI * 2);
    ctx.arc(144, 175, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff"; // dots
    ctx.beginPath();
    ctx.arc(112, 175, 3, 0, Math.PI * 2);
    ctx.arc(144, 175, 3, 0, Math.PI * 2);
    ctx.fill();

    // Bikini Bottoms
    ctx.fillStyle = "#00ff00";
    ctx.beginPath();
    ctx.moveTo(112, 210);
    ctx.lineTo(144, 210);
    ctx.lineTo(128, 225);
    ctx.closePath();
    ctx.fill();

    // Text labels
    ctx.fillStyle = "#000000";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillText("GOOFY CALENDAR: MISS MEOW", 128, 40);
    ctx.font = "italic 9px 'Courier New', monospace";
    ctx.fillText("NSFW: EXTREMELY FURRY!", 128, 245);

    // Draw grid lines below it for calendar
    ctx.strokeStyle = "#880e4f";
    ctx.lineWidth = 1;
    for (let c = 40; c <= 216; c += 22) {
      ctx.beginPath();
      ctx.moveTo(c, 255);
      ctx.lineTo(c, 295);
      ctx.stroke();
    }
    for (let r = 255; r <= 295; r += 10) {
      ctx.beginPath();
      ctx.moveTo(40, r);
      ctx.lineTo(216, r);
      ctx.stroke();
    }
  } else if (idx === 9) {
    // Platter Roast Chicken (Naked/NSFW)
    ctx.fillStyle = "#3e2723"; // Dark wood wall backdrop
    ctx.fillRect(16, 16, 224, 288);

    // Draw golden metal platter
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.ellipse(128, 160, 80, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw platter inner shadow
    ctx.fillStyle = "#daa520";
    ctx.beginPath();
    ctx.ellipse(128, 160, 72, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw the roasted chicken body (naked body shape, round breasts, golden brown)
    ctx.fillStyle = "#d2691e"; // Golden roasted brown
    ctx.beginPath();
    ctx.ellipse(128, 155, 45, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw left wing
    ctx.beginPath();
    ctx.ellipse(88, 150, 16, 10, -0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw right wing
    ctx.beginPath();
    ctx.ellipse(168, 150, 16, 10, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Draw left leg pointing up/out
    ctx.fillStyle = "#cd853f";
    ctx.beginPath();
    ctx.ellipse(108, 180, 18, 10, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff"; // Bone tip
    ctx.beginPath();
    ctx.arc(93, 192, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw right leg pointing up/out
    ctx.fillStyle = "#cd853f";
    ctx.beginPath();
    ctx.ellipse(148, 180, 18, 10, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff"; // Bone tip
    ctx.beginPath();
    ctx.arc(163, 192, 5, 0, Math.PI * 2);
    ctx.fill();

    // Title text
    ctx.fillStyle = "#ff3d00"; // Spicy hot red
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillText("NSFW: HOT NAKED POULTRY", 128, 240);
    ctx.fillStyle = "#ffd700";
    ctx.font = "italic 9px 'Courier New', monospace";
    ctx.fillText("Oil on Canvas, Chef's Special", 128, 265);
  } else if (idx === 10) {
    // Captain Woof: Debt Collector
    ctx.fillStyle = "#2e7d32"; // Dark green background
    ctx.fillRect(16, 16, 224, 288);

    // Dog face circle
    ctx.fillStyle = "#8d6e63"; // Brown
    ctx.beginPath();
    ctx.arc(128, 140, 42, 0, Math.PI * 2);
    ctx.fill();

    // Dog snout
    ctx.fillStyle = "#d7ccc8"; // Cream snout
    ctx.beginPath();
    ctx.arc(128, 152, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000"; // nose
    ctx.beginPath();
    ctx.arc(128, 144, 6, 0, Math.PI * 2);
    ctx.fill();

    // Dog ears
    ctx.fillStyle = "#5d4037"; // Dark brown ears hanging down
    ctx.beginPath();
    ctx.ellipse(82, 135, 14, 30, 0.2, 0, Math.PI * 2);
    ctx.ellipse(174, 135, 14, 30, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eyes: one with monocle
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(112, 125, 8, 0, Math.PI * 2);
    ctx.arc(144, 125, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(114, 125, 4, 0, Math.PI * 2);
    ctx.arc(142, 125, 4, 0, Math.PI * 2);
    ctx.fill();

    // Monocle on right eye
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(144, 125, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(156, 125);
    ctx.lineTo(190, 180);
    ctx.stroke();

    // Captain's Hat
    ctx.fillStyle = "#111111"; // black cap
    ctx.beginPath();
    ctx.moveTo(86, 102);
    ctx.lineTo(170, 102);
    ctx.lineTo(156, 75);
    ctx.lineTo(100, 75);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff"; // white cap top
    ctx.beginPath();
    ctx.ellipse(128, 76, 32, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd700"; // gold badge
    ctx.beginPath();
    ctx.arc(128, 88, 6, 0, Math.PI * 2);
    ctx.fill();

    // Title text
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillText("CAPTAIN WOOF: DEBT COLLECTOR", 128, 245);
    ctx.font = "italic 9px 'Courier New', monospace";
    ctx.fillText("Oil on Canvas, Anonymous", 128, 270);
  } else if (idx === 11) {
    // Naked Squealer Roast Pig
    ctx.fillStyle = "#7a1c1c"; // Crimson wall background
    ctx.fillRect(16, 16, 224, 288);

    // Silver Platter
    ctx.fillStyle = "#b0bec5";
    ctx.beginPath();
    ctx.ellipse(128, 160, 85, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Roasted Piggy body
    ctx.fillStyle = "#ff8a80"; // Roasted pinkish brown
    ctx.beginPath();
    ctx.ellipse(128, 155, 45, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pig face/snout (pointing left)
    ctx.beginPath();
    ctx.arc(88, 150, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5252"; // snout tip
    ctx.beginPath();
    ctx.ellipse(72, 150, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000"; // nostrils
    ctx.beginPath();
    ctx.arc(72, 147, 2, 0, Math.PI * 2);
    ctx.arc(72, 153, 2, 0, Math.PI * 2);
    ctx.fill();

    // Apple in mouth
    ctx.fillStyle = "#d50000"; // Red apple
    ctx.beginPath();
    ctx.arc(76, 162, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#00e676"; // green leaf
    ctx.beginPath();
    ctx.ellipse(76, 152, 3, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Piggy ears
    ctx.fillStyle = "#ff8a80";
    ctx.beginPath();
    ctx.ellipse(100, 136, 6, 12, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Closed eye
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(92, 142, 4, Math.PI, 0, false);
    ctx.stroke();

    // Piggy curly tail
    ctx.strokeStyle = "#ff5252";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(174, 150, 10, 0, Math.PI * 1.5, false);
    ctx.stroke();

    // Roast pig legs
    ctx.fillStyle = "#ff8a80";
    ctx.beginPath();
    ctx.ellipse(112, 172, 14, 8, 0.4, 0, Math.PI * 2);
    ctx.ellipse(144, 172, 14, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Title text
    ctx.fillStyle = "#ffeb3b"; // Goofy bright yellow
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText("NSFW: THE NAKED SQUEALER", 128, 245);
    ctx.font = "italic 9px 'Courier New', monospace";
    ctx.fillText("Roast Pig on Platter, Circa 1890", 128, 270);
  }

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const portraitsData = [
  { idx: 0, pos: [-2.2, 1.5, -4.11] as [number, number, number], rotY: 0, tiltZ: 0.04, w: 0.75, h: 0.95 },
  { idx: 1, pos: [2.2, 1.5, -4.11] as [number, number, number], rotY: 0, tiltZ: -0.05, w: 0.75, h: 0.95 },
  { idx: 2, pos: [-1.0, 2.1, -4.11] as [number, number, number], rotY: 0, tiltZ: 0.02, w: 0.6, h: 0.75 },
  { idx: 3, pos: [1.0, 2.1, -4.11] as [number, number, number], rotY: 0, tiltZ: -0.03, w: 0.6, h: 0.75 },
  { idx: 4, pos: [-4.11, 1.6, -1.8] as [number, number, number], rotY: Math.PI / 2, tiltZ: 0.05, w: 0.7, h: 0.9 },
  { idx: 5, pos: [-4.11, 1.5, 0.8] as [number, number, number], rotY: Math.PI / 2, tiltZ: -0.06, w: 0.85, h: 1.05 },
  { idx: 6, pos: [-4.11, 1.4, 2.2] as [number, number, number], rotY: Math.PI / 2, tiltZ: 0.03, w: 0.75, h: 0.95 },
  { idx: 7, pos: [4.11, 1.5, -2.0] as [number, number, number], rotY: -Math.PI / 2, tiltZ: -0.04, w: 0.7, h: 0.9 },
  { idx: 8, pos: [4.11, 1.4, 0.2] as [number, number, number], rotY: -Math.PI / 2, tiltZ: 0.05, w: 0.75, h: 0.95 },
  { idx: 9, pos: [4.11, 1.6, 2.0] as [number, number, number], rotY: -Math.PI / 2, tiltZ: -0.02, w: 0.8, h: 1.0 },
  { idx: 10, pos: [-2.2, 1.5, 4.11] as [number, number, number], rotY: Math.PI, tiltZ: -0.04, w: 0.75, h: 0.95 },
  { idx: 11, pos: [2.2, 1.5, 4.11] as [number, number, number], rotY: Math.PI, tiltZ: 0.05, w: 0.75, h: 0.95 }
];

function headColorOfAnimal(animalType: string) {
  let headColor = "#dcd5e7";
  if (animalType === "Frog") headColor = "#2e7d32";
  else if (animalType === "Fox") headColor = "#e65100";
  else if (animalType === "Wolf") headColor = "#616161";
  else if (animalType === "Bear") headColor = "#5d4037";
  else if (animalType === "Rabbit") headColor = "#f5f5f5";
  else if (animalType === "Cat") headColor = "#757575";
  else if (animalType === "Raccoon") headColor = "#4e4e4e";
  else if (animalType === "Duck") headColor = "#fbc02d";
  else if (animalType === "Goat") headColor = "#efebe9";
  else if (animalType === "Panda") headColor = "#ffffff";
  return headColor;
}

interface FirstPersonBodyProps {
  bodyColor: string;
  headColor: string;
  isActiveTurn: boolean;
  accessories?: {
    topHat: boolean;
    monocle: boolean;
    bowTie: boolean;
    scarf: boolean;
    vest: boolean;
  };
}

function FirstPersonBody({ bodyColor, headColor, isActiveTurn, accessories }: FirstPersonBodyProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const torsoLightRef = useRef<THREE.PointLight>(null);
  const { camera } = useThree();
  const reachVal = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.copy(camera.position);
    groupRef.current.quaternion.copy(camera.quaternion);

    const targetReach = isActiveTurn ? 1.0 : 0.0;
    reachVal.current = THREE.MathUtils.lerp(reachVal.current, targetReach, delta * 8);

    if (torsoLightRef.current) {
      if (isActiveTurn) {
        torsoLightRef.current.intensity = 0.5 + Math.sin(Date.now() * 0.01) * 0.35;
      } else {
        torsoLightRef.current.intensity = THREE.MathUtils.lerp(torsoLightRef.current.intensity, 0.5, delta * 8);
      }
    }

    if (leftArmRef.current) {
      leftArmRef.current.position.x = -0.25 + reachVal.current * 0.05;
      leftArmRef.current.position.y = -0.22 + reachVal.current * 0.04;
      leftArmRef.current.position.z = -0.45 - reachVal.current * 0.12;

      leftArmRef.current.rotation.x = Math.PI / 4 + reachVal.current * 0.2;
      leftArmRef.current.rotation.y = reachVal.current * 0.1;
      leftArmRef.current.rotation.z = 0.2 + reachVal.current * 0.05;
    }

    if (rightArmRef.current) {
      rightArmRef.current.position.x = 0.25 - reachVal.current * 0.05;
      rightArmRef.current.position.y = -0.22 + reachVal.current * 0.04;
      rightArmRef.current.position.z = -0.45 - reachVal.current * 0.12;

      rightArmRef.current.rotation.x = Math.PI / 4 + reachVal.current * 0.2;
      rightArmRef.current.rotation.y = -reachVal.current * 0.1;
      rightArmRef.current.rotation.z = -0.2 - reachVal.current * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Torso PointLight */}
      <pointLight ref={torsoLightRef} position={[0, -0.2, 0.1]} color="#ffe8c0" intensity={0.5} distance={1.5} />

      {/* Left First-Person Arm */}
      <group ref={leftArmRef}>
        <mesh castShadow={false} receiveShadow={false}>
          <cylinderGeometry args={[0.04, 0.04, 0.18, 8]} />
          <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
        </mesh>
        <group position={[0, -0.09, 0]} rotation={[-Math.PI / 4, 0, 0]}>
          <mesh castShadow={false} receiveShadow={false}>
            <cylinderGeometry args={[0.035, 0.035, 0.16, 8]} />
            <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, -0.08, 0]} scale={[1, 0.6, 1]} castShadow={false} receiveShadow={false}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
          </mesh>
        </group>
      </group>

      {/* Right First-Person Arm */}
      <group ref={rightArmRef}>
        <mesh castShadow={false} receiveShadow={false}>
          <cylinderGeometry args={[0.04, 0.04, 0.18, 8]} />
          <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
        </mesh>
        <group position={[0, -0.09, 0]} rotation={[-Math.PI / 4, 0, 0]}>
          <mesh castShadow={false} receiveShadow={false}>
            <cylinderGeometry args={[0.035, 0.035, 0.16, 8]} />
            <meshToonMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, -0.08, 0]} scale={[1, 0.6, 1]} castShadow={false} receiveShadow={false}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshToonMaterial color={headColor} emissive={headColor} emissiveIntensity={0.15} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

interface GameSceneProps {
  gameState: GameState;
  deck: CardType[];
  onRevealCard: (card: CardType) => void;
  isPeekHand?: boolean;
  isStanding?: boolean;
}

// First-Person Camera Controller that sits fixed at Seat 0 and handles look-around
// Also triggers camera intro tween: elevated overview -> seated eye level over 1.5s
interface CameraControllerProps {
  playerCount: number;
  isStanding: boolean;
}

function CameraController({ playerCount, isStanding }: CameraControllerProps) {
  const { camera, gl, scene } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(-0.15); // Look down slightly towards the center table
  const isDragging = useRef(false);
  const introDuration = 1.5;

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging.current = true;
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        yaw.current -= e.movementX * 0.0022;
        pitch.current -= e.movementY * 0.0022;
      } else if (isDragging.current) {
        yaw.current -= e.movementX * 0.0035;
        pitch.current -= e.movementY * 0.0035;
      }
      pitch.current = Math.max(-0.52, Math.min(0.70, pitch.current));
    };

    const handleCanvasClick = () => {
      if (document.pointerLockElement !== canvas) {
        try {
          const promise = canvas.requestPointerLock() as any;
          if (promise && typeof promise.catch === "function") {
            promise.catch((err: any) => {
              console.warn("Pointer lock request failed (ignored):", err);
            });
          }
        } catch (err) {
          console.warn("Pointer lock request error (ignored):", err);
        }
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleCanvasClick);

    const lastTouchX = { current: 0 };
    const lastTouchY = { current: 0 };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchX.current = e.touches[0].clientX;
        lastTouchY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX.current;
        const dy = e.touches[0].clientY - lastTouchY.current;

        yaw.current -= dx * 0.0055;
        pitch.current -= dy * 0.0055;
        pitch.current = Math.max(-0.52, Math.min(0.70, pitch.current));

        lastTouchX.current = e.touches[0].clientX;
        lastTouchY.current = e.touches[0].clientY;
      }
    };

    canvas.addEventListener("touchstart", handleTouchStart);
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, [gl]);

  useFrame((state, delta) => {
    // Find opponent head Y height dynamically
    let opponentHead = scene.getObjectByName("opponentHead");
    let opponentEyeY = -0.265; // fallback eye height Y
    if (opponentHead) {
      const worldPos = new THREE.Vector3();
      opponentHead.getWorldPosition(worldPos);
      opponentEyeY = worldPos.y;
    }

    const seatRadius = 1.8 + (playerCount - 3) * 0.25;
    const targetY = isStanding ? 0.65 : opponentEyeY;
    const targetZ = seatRadius; // Camera directly on the table edge (seat 0)

    const elapsed = state.clock.getElapsedTime();
    if (elapsed < introDuration) {
      // Ease-in-out camera intro tween
      const progress = elapsed / introDuration;
      const ease = progress * progress * (3 - 2 * progress);
      
      const px = 0;
      const py = THREE.MathUtils.lerp(3.8, targetY, ease);
      const pz = THREE.MathUtils.lerp(4.5, targetZ, ease);
      camera.position.set(px, py, pz);

      const currentPitch = THREE.MathUtils.lerp(-0.4, pitch.current, ease);
      const targetRotation = new THREE.Euler(currentPitch, yaw.current, 0, "YXZ");
      camera.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRotation), delta * 8);
    } else {
      const currentY = THREE.MathUtils.lerp(camera.position.y, targetY, delta * 5);
      camera.position.set(0, currentY, targetZ);
      const targetRotation = new THREE.Euler(pitch.current, yaw.current, 0, "YXZ");
      camera.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRotation), delta * 8);
    }
  });

  return null;
}

// Low-poly drifting smoke particles
function generateSmokyHazeParticles(particleCount: number) {
  const pos = new Float32Array(particleCount * 3);
  const sp = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 6;
    pos[i * 3 + 1] = Math.random() * 3 - 1.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    sp[i] = 0.05 + Math.random() * 0.15;
  }
  return [pos, sp] as const;
}

function SmokyHaze() {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = 120;
  const [positions, speeds] = useMemo(() => generateSmokyHazeParticles(120), []);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        arr[i * 3 + 1] += speeds[i] * delta;
        if (arr[i * 3 + 1] > 2) {
          arr[i * 3 + 1] = -1.5;
          arr[i * 3] = (Math.random() - 0.5) * 6;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
        }
      }
      geo.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#bb86fc"
        size={0.035}
        transparent
        opacity={0.15}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Ceiling fan component rotating on Y
function CeilingFan() {
  const fanRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (fanRef.current) {
      fanRef.current.rotation.y += 0.3 * delta;
    }
  });

  return (
    <group position={[0, 3.3, -2.95]}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.3, 8]} />
        <meshStandardMaterial color="#111" metalness={0.8} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 8]} />
        <meshStandardMaterial color="#222" metalness={0.7} />
      </mesh>
      <group ref={fanRef}>
        {Array.from({ length: 4 }).map((_, idx) => {
          const angle = (idx / 4) * Math.PI * 2;
          return (
            <mesh key={idx} position={[Math.cos(angle) * 0.45, 0, Math.sin(angle) * 0.45]} rotation={[0, -angle, 0.15]}>
              <boxGeometry args={[0.8, 0.01, 0.08]} />
              <meshStandardMaterial color="#1a0a03" roughness={0.7} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

// Fireplace component with dynamic orange-red flame
function Fireplace() {
  const lightRef = useRef<THREE.PointLight>(null);
  
  const { canvas, ctx } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    return { canvas: c, ctx: c.getContext("2d")! };
  }, []);

  const texture = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);

  useFrame(() => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#ff5722";
    ctx.beginPath();
    ctx.moveTo(10, 64);
    ctx.lineTo(20, 10 + Math.random() * 20);
    ctx.lineTo(32, 5 + Math.random() * 15);
    ctx.lineTo(44, 10 + Math.random() * 20);
    ctx.lineTo(54, 64);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffeb3b";
    ctx.beginPath();
    ctx.moveTo(20, 64);
    ctx.lineTo(28, 20 + Math.random() * 15);
    ctx.lineTo(32, 15 + Math.random() * 10);
    ctx.lineTo(36, 20 + Math.random() * 15);
    ctx.lineTo(44, 64);
    ctx.closePath();
    ctx.fill();

    texture.needsUpdate = true;

    if (lightRef.current) {
      lightRef.current.intensity = 2.0 + Math.sin(Date.now() * 0.015) * 0.2 + Math.random() * 0.05;
    }
  });

  return (
    <group position={[-3.8, -0.2, -3.8]} rotation={[0, Math.PI / 4, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.2, 1.4, 0.4]} />
        <meshStandardMaterial color="#37474f" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.2, 0.1]}>
        <boxGeometry args={[0.8, 0.8, 0.3]} />
        <meshStandardMaterial color="#1a1a1a" roughness={1.0} />
      </mesh>
      <mesh position={[0, -0.4, 0.16]}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
      <mesh position={[0, -0.5, 0.18]} rotation={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 6]} />
        <meshStandardMaterial color="#3e2723" roughness={0.9} />
      </mesh>
      <pointLight ref={lightRef} position={[0, -0.1, 0.2]} color="#ff5500" distance={5.0} intensity={2.0} />
    </group>
  );
}

// Side wall Bookshelf component
function Bookshelf() {
  const books = useMemo(() => {
    const list = [];
    const shelfY = [0.05, 0.55, 1.05];
    const colors = ["#b71c1c", "#0d47a1", "#1b5e20", "#e65100", "#4a148c", "#37474f", "#e6c300", "#795548"];
    for (const y of shelfY) {
      for (let x = -0.55; x <= 0.55; x += 0.07) {
        const height = 0.18 + Math.random() * 0.1;
        const width = 0.04 + Math.random() * 0.025;
        const depth = 0.2;
        const tilt = Math.random() < 0.15 ? (Math.random() - 0.5) * 0.3 : 0;
        const col = colors[Math.floor(Math.random() * colors.length)];
        list.push({ x, y, height, width, depth, tilt, col });
      }
    }
    return list;
  }, []);

  return (
    <group position={[-3.95, 0.0, -1.8]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.3, 1.6, 0.3]} />
        <meshStandardMaterial color="#2d1500" roughness={0.9} />
      </mesh>
      {[-0.45, 0.05, 0.55].map((y, idx) => (
        <mesh key={idx} position={[0, y, 0.02]} castShadow>
          <boxGeometry args={[1.22, 0.04, 0.26]} />
          <meshStandardMaterial color="#1a0a03" roughness={0.8} />
        </mesh>
      ))}
      {books.map((b, idx) => (
        <mesh
          key={idx}
          position={[b.x, b.y - 0.45 + b.height / 2 + 0.02, 0.04]}
          rotation={[0, 0, b.tilt]}
          castShadow
        >
          <boxGeometry args={[b.width, b.height, b.depth]} />
          <meshStandardMaterial color={b.col} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// Generate stone joint floor texture
function generateFloorTexture() {
  if (typeof window === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#160a22";
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = "#381254";
  ctx.lineWidth = 4;
  
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

function generateTavernBottles() {
  const b = [];
  const colors = ["#d50000", "#00c853", "#ffab00", "#2962ff", "#aa00ff", "#00e5ff"];
  for (let s = 0; s < 3; s++) {
    const y = -0.3 + s * 0.7;
    for (let i = 0; i < 8; i++) {
      const x = -3.2 + i * 0.9 + (Math.random() - 0.5) * 0.15;
      const h = 0.25 + Math.random() * 0.18;
      const r = 0.05 + Math.random() * 0.03;
      const col = colors[(s * 8 + i) % colors.length];
      const shape = (s * 8 + i) % 2 === 0 ? "cylinder" : "box";
      b.push({ id: `bottle-${s}-${i}`, x, y, h, r, col, shape });
    }
  }
  return b;
}

function TavernBarBackground() {
  const questionMarkTexture = useMemo(() => {
    if (typeof window === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#0c051a";
    ctx.fillRect(0, 0, 256, 256);
    
    ctx.font = "bold 160px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00f0ff";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 15;
    ctx.fillText("?", 128, 128);
    
    return new THREE.CanvasTexture(canvas);
  }, []);
 
  const string1Points = useMemo(() => [new THREE.Vector3(-0.35, 1.15, -3.2), new THREE.Vector3(-2.5, -0.15, 0.4)], []);
  const string2Points = useMemo(() => [new THREE.Vector3(0, 1.15, -3.2), new THREE.Vector3(0, -0.15, -2.5)], []);
  const string3Points = useMemo(() => [new THREE.Vector3(0.35, 1.15, -3.2), new THREE.Vector3(2.5, -0.15, 0.4)], []);
 
  const bottles = useMemo(() => generateTavernBottles(), []);
  const floorTexture = useMemo(() => generateFloorTexture(), []);

  // 12 Framed animal portraits textures
  const portraitTextures = useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      list.push(createFramedPortraitTexture(i));
    }
    return list;
  }, []);

  return (
    <group>
      {/* 1. DARK STONE-TILE FLOOR WITH SPECULAR SHEEN */}
      <mesh position={[0, -1.21, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial map={floorTexture || undefined} color="#0c070f" roughness={0.35} metalness={0.15} emissive="#ffffff" emissiveIntensity={0.05} />
      </mesh>
      <gridHelper args={[12, 8, "#2d0b42", "#13051d"]} position={[0, -1.2, 0]} />

      {/* 2. CEILING WITH EXPOSED WOODEN BEAMS */}
      <mesh position={[0, 3.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.08} roughness={0.9} />
      </mesh>
      {[-2.8, -0.9, 0.9, 2.8].map((z, idx) => (
        <mesh key={`beam-${idx}`} position={[0, 3.4, z]} castShadow>
          <boxGeometry args={[10, 0.16, 0.16]} />
          <meshStandardMaterial color="#1a0a03" roughness={0.8} />
        </mesh>
      ))}

      {/* 3. THREE CEILING LANTERNS */}
      {[
        { pos: [-1.8, 2.3, 0.8] as [number, number, number], col: "#ffa726" },
        { pos: [1.8, 2.3, 0.8] as [number, number, number], col: "#ffa726" },
        { pos: [0, 2.5, -1.4] as [number, number, number], col: "#ff9100" }
      ].map((l, idx) => (
        <group key={`lantern-${idx}`} position={l.pos}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
            <meshStandardMaterial color="#111" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 0.05, 6]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#ffe082" />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.08, 0.06, 0.18, 6]} />
            <meshStandardMaterial color="#ffe082" transparent opacity={0.3} roughness={0.1} />
          </mesh>
        </group>
      ))}

      {/* 4. WALL PANELS & DECORATIONS */}
      {/* BACK WALL */}
      <mesh position={[0, 1.15, -4.2]} receiveShadow>
        <boxGeometry args={[9.0, 5.0, 0.15]} />
        <meshStandardMaterial color="#0f0714" roughness={0.8} metalness={0.0} emissive="#0a0805" emissiveIntensity={0.03} />
      </mesh>
      {/* LEFT WALL */}
      <mesh position={[-4.2, 1.15, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[9.0, 5.0, 0.15]} />
        <meshStandardMaterial color="#0f0714" roughness={0.8} metalness={0.0} emissive="#0a0805" emissiveIntensity={0.03} />
      </mesh>
      {/* RIGHT WALL */}
      <mesh position={[4.2, 1.15, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[9.0, 5.0, 0.15]} />
        <meshStandardMaterial color="#0f0714" roughness={0.8} metalness={0.0} emissive="#0a0805" emissiveIntensity={0.03} />
      </mesh>
      {/* FRONT WALL */}
      <mesh position={[0, 1.15, 4.2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <boxGeometry args={[9.0, 5.0, 0.15]} />
        <meshStandardMaterial color="#0f0714" roughness={0.8} metalness={0.0} emissive="#0a0805" emissiveIntensity={0.03} />
      </mesh>

      <mesh position={[-4.2, 1.15, -4.1]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 5.0, 0.35]} />
        <meshStandardMaterial color="#0c0510" roughness={0.8} />
      </mesh>
      <mesh position={[4.2, 1.15, -4.1]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 5.0, 0.35]} />
        <meshStandardMaterial color="#0c0510" roughness={0.8} />
      </mesh>

      {/* STAINED-GLASS PANEL ON RIGHT WALL */}
      <group position={[4.05, 1.2, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.5, 2.2, 0.1]} />
          <meshStandardMaterial color="#140702" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.051]}>
          <planeGeometry args={[1.3, 2.0]} />
          <meshStandardMaterial
            color="#8e24aa"
            emissive="#5e35b1"
            emissiveIntensity={1.5}
            transparent
            opacity={0.85}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* DARTBOARD ON LEFT WALL */}
      <group position={[-4.05, 1.2, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.4, 1.4, 0.05]} />
          <meshStandardMaterial color="#0c0717" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.03]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.02, 32]} />
          <meshStandardMaterial color="#0e2a14" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0, 0.032]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.5, 32]} />
          <meshStandardMaterial color="#d32f2f" roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.041]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.011, 16]} />
          <meshStandardMaterial color="#ffd700" roughness={0.2} metalness={0.8} />
        </mesh>
      </group>

      {/* 6 WALL SCONCES AT HEIGHT 1.8M */}
      {[
        { pos: [-4.0, 1.8, 1.5] as [number, number, number], rot: [0, Math.PI/2, 0.2] as [number, number, number] },
        { pos: [4.0, 1.8, 1.5] as [number, number, number], rot: [0, -Math.PI/2, 0.2] as [number, number, number] },
        { pos: [-3.5, 1.8, -3.8] as [number, number, number], rot: [0, 0, 0.2] as [number, number, number] },
        { pos: [3.5, 1.8, -3.8] as [number, number, number], rot: [0, 0, 0.2] as [number, number, number] },
        { pos: [-3.5, 1.8, 4.0] as [number, number, number], rot: [0, Math.PI, 0.2] as [number, number, number] },
        { pos: [3.5, 1.8, 4.0] as [number, number, number], rot: [0, Math.PI, 0.2] as [number, number, number] }
      ].map((s, idx) => (
        <group key={`sconce-${idx}`} position={s.pos} rotation={s.rot}>
          <mesh castShadow>
            <boxGeometry args={[0.06, 0.2, 0.15]} />
            <meshStandardMaterial color="#111" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.1, 0.08]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
            <meshStandardMaterial color="#ffecb3" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.19, 0.08]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshBasicMaterial color="#ff9100" />
          </mesh>
          <pointLight position={[0, 0.22, 0.08]} distance={6.0} intensity={1.2} color="#ff9944" castShadow />
        </group>
      ))}

      {/* 10 FRAMED WALL PORTRAITS */}
      {portraitsData.map((p) => {
        const tex = portraitTextures[p.idx];
        if (!tex) return null;
        return (
          <group key={`portrait-${p.idx}`} position={p.pos} rotation={[0, p.rotY, p.tiltZ]}>
            <mesh castShadow={false} receiveShadow={false}>
              <boxGeometry args={[p.w + 0.06, p.h + 0.06, 0.02]} />
              <meshStandardMaterial color={p.idx % 2 === 0 ? "#ffd700" : "#2a1204"} roughness={0.5} metalness={p.idx % 2 === 0 ? 0.8 : 0.1} />
            </mesh>
            <mesh position={[0, 0, 0.011]}>
              <planeGeometry args={[p.w, p.h]} />
              <meshBasicMaterial map={tex} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}

      {/* BOOKSHELF */}
      <Bookshelf />

      {/* BRASS DECAL CLOCK ON BACK WALL */}
      <group position={[0, 2.0, -3.8]} rotation={[0, 0, 0]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.04, 32]} />
          <meshStandardMaterial color="#8d6e63" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.48, 0.48, 0.005, 32]} />
          <meshStandardMaterial color="#efebe9" roughness={0.9} />
        </mesh>
        <mesh position={[-0.1, 0.08, 0.026]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.02, 0.22, 0.002]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0.08, -0.04, 0.026]} rotation={[0, 0, 1.2]}>
          <boxGeometry args={[0.02, 0.16, 0.002]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0, 0, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.006, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      {/* 5. LONG WOODEN BAR COUNTER */}
      <group position={[0, -0.85, -2.95]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[7.8, 0.72, 0.4]} />
          <meshStandardMaterial color="#120601" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.38, -0.06]} castShadow>
          <boxGeometry args={[8.0, 0.08, 0.54]} />
          <meshStandardMaterial color="#2d1305" roughness={0.3} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.31, -0.28]}>
          <boxGeometry args={[7.8, 0.02, 0.04]} />
          <meshBasicMaterial color="#ffe082" />
        </mesh>
      </group>

      {/* ROTATING CEILING FAN */}
      <CeilingFan />

      {/* FIREPLACE */}
      <Fireplace />

      {/* 6. SCATTERED FOREGROUND STOOLS/TABLES */}
      {/* Background Table 1 (Left) */}
      <group position={[-2.8, -1.2, 1.8]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.6, 16]} />
          <meshStandardMaterial color="#1a0a03" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.8, 8]} />
          <meshStandardMaterial color="#0e0502" />
        </mesh>
        {[-0.9, 0.9].map((offset, cIdx) => (
          <group key={`chair-t1-${cIdx}`} position={[offset, -0.2, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.22, 0.22, 0.05, 8]} />
              <meshStandardMaterial color="#0e0502" />
            </mesh>
            <mesh position={[offset * 0.1, 0.25, 0]}>
              <boxGeometry args={[0.05, 0.45, 0.28]} />
              <meshStandardMaterial color="#0e0502" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Background Table 2 (Right) */}
      <group position={[2.8, -1.2, 1.8]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.6, 16]} />
          <meshStandardMaterial color="#1a0a03" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.8, 8]} />
          <meshStandardMaterial color="#0e0502" />
        </mesh>
        {[-0.9, 0.9].map((offset, cIdx) => (
          <group key={`chair-t2-${cIdx}`} position={[0, -0.2, offset]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.22, 0.22, 0.05, 8]} />
              <meshStandardMaterial color="#0e0502" />
            </mesh>
            <mesh position={[0, 0.25, offset * 0.1]}>
              <boxGeometry args={[0.28, 0.45, 0.05]} />
              <meshStandardMaterial color="#0e0502" />
            </mesh>
          </group>
        ))}
      </group>

      {/* 7. SHELVES AND BOTTLES */}
      <mesh position={[0, -0.4, -3.75]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 0.06, 0.38]} />
        <meshStandardMaterial color="#1a0a24" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -3.75]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 0.06, 0.38]} />
        <meshStandardMaterial color="#1a0a24" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.0, -3.75]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 0.06, 0.38]} />
        <meshStandardMaterial color="#1a0a24" roughness={0.7} />
      </mesh>

      <pointLight position={[0, -0.35, -3.6]} distance={4.5} intensity={0.4} color="#ffa726" />
      <pointLight position={[0, 0.35, -3.6]} distance={4.5} intensity={0.4} color="#ffa726" />
      <pointLight position={[0, 1.05, -3.6]} distance={4.5} intensity={0.4} color="#ffa726" />

      {bottles.map((b) => (
        <group key={b.id} position={[b.x, b.y + b.h / 2 + 0.03, -3.7]}>
          <mesh castShadow>
            {b.shape === "cylinder" ? (
              <cylinderGeometry args={[b.r, b.r, b.h, 12]} />
            ) : (
              <boxGeometry args={[b.r * 1.8, b.h, b.r * 1.8]} />
            )}
            <meshStandardMaterial
              color={b.col}
              roughness={0.1}
              metalness={0.1}
              transparent
              opacity={0.75}
              emissive={b.col}
              emissiveIntensity={0.35}
            />
          </mesh>
          <mesh position={[0, b.h / 2 + 0.06, 0]} castShadow>
            <cylinderGeometry args={[b.r * 0.3, b.r * 0.3, 0.12, 8]} />
            <meshStandardMaterial color={b.col} roughness={0.1} metalness={0.1} transparent opacity={0.8} />
          </mesh>
          <mesh position={[0, b.h / 2 + 0.125, 0]}>
            <cylinderGeometry args={[b.r * 0.35, b.r * 0.35, 0.02, 8]} />
            <meshStandardMaterial color="#ffd700" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* 8. PUPPET MASTER DEALER */}
      <group position={[0, 0.7, -3.3]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.3, 0.55, 1.2, 10]} />
          <meshStandardMaterial color="#08040b" roughness={0.95} />
        </mesh>
        <group position={[0, 0.75, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.35, 16, 16]} />
            <meshStandardMaterial color="#08040b" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <sphereGeometry args={[0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI / 1.5]} />
            <meshStandardMaterial color="#000000" roughness={1.0} side={THREE.DoubleSide} />
          </mesh>
          {questionMarkTexture && (
            <mesh position={[0, -0.02, 0.28]} rotation={[0, 0, 0]}>
              <planeGeometry args={[0.26, 0.26]} />
              <meshStandardMaterial
                map={questionMarkTexture}
                emissive="#00ffff"
                emissiveIntensity={3.5}
                color="#00ffff"
                transparent
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>
        <mesh position={[-0.45, 0.4, 0.2]} rotation={[0.4, 0, 0.2]} castShadow>
          <cylinderGeometry args={[0.06, 0.04, 0.6, 8]} />
          <meshStandardMaterial color="#08040b" roughness={0.9} />
        </mesh>
        <mesh position={[0.45, 0.4, 0.2]} rotation={[0.4, 0, -0.2]} castShadow>
          <cylinderGeometry args={[0.06, 0.04, 0.6, 8]} />
          <meshStandardMaterial color="#08040b" roughness={0.9} />
        </mesh>
        <line>
          <bufferGeometry attach="geometry" onUpdate={(self) => self.setFromPoints(string1Points)} />
          <lineBasicMaterial attach="material" color="#ffab00" transparent opacity={0.65} />
        </line>
        <line>
          <bufferGeometry attach="geometry" onUpdate={(self) => self.setFromPoints(string2Points)} />
          <lineBasicMaterial attach="material" color="#ffab00" transparent opacity={0.65} />
        </line>
        <line>
          <bufferGeometry attach="geometry" onUpdate={(self) => self.setFromPoints(string3Points)} />
          <lineBasicMaterial attach="material" color="#ffab00" transparent opacity={0.65} />
        </line>
      </group>

      {/* BACK WALL CABINET / SHELF DECORATION */}
      <group position={[0, 1.2, 4.05]} rotation={[0, Math.PI, 0]}>
        {/* Large wooden cabinet frame */}
        <mesh castShadow>
          <boxGeometry args={[3.2, 2.2, 0.25]} />
          <meshStandardMaterial color="#211005" roughness={0.9} />
        </mesh>
        {/* Glowing glass shelves */}
        {[-0.6, 0.0, 0.6].map((shelfYVal, shelfIdx) => (
          <group key={`back-shelf-${shelfIdx}`} position={[0, shelfYVal, 0.1]}>
            <mesh>
              <boxGeometry args={[3.0, 0.04, 0.15]} />
              <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.0} transparent opacity={0.6} />
            </mesh>
            {/* Some decorative bottle cylinders on each shelf */}
            {[-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2].map((bottleX, bIdx) => (
              <mesh key={`back-bottle-${bIdx}`} position={[bottleX, 0.14, 0]} castShadow>
                <cylinderGeometry args={[0.04, 0.05, 0.24, 8]} />
                <meshStandardMaterial
                  color={["#d50000", "#00c853", "#ffab00", "#2962ff", "#aa00ff"][bIdx % 5]}
                  roughness={0.1}
                  metalness={0.9}
                  transparent
                  opacity={0.7}
                />
              </mesh>
            ))}
          </group>
        ))}
        {/* Warm back-glow behind the shelves */}
        <pointLight position={[0, 0, 0.2]} distance={4.0} intensity={2.5} color="#ffa726" />
      </group>
    </group>
  );
}

// 3 candle PointLights on table that flicker
function TableCandle({ position }: { position: [number, number, number] }) {
  const lightRef = useRef<THREE.PointLight>(null);
  
  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.intensity = 0.8 + Math.sin(Date.now() * 0.005) * 0.08 + Math.random() * 0.04;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 8]} />
        <meshStandardMaterial color="#fffdd0" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.015, 4]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color="#ff9100" />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.16, 0]}
        color="#ffcc44"
        distance={2.5}
        intensity={0.8}
        castShadow
      />
    </group>
  );
}

function SceneTracker() {
  const { scene: threeScene, camera: threeCamera } = useThree();
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).threeScene = threeScene;
      (window as any).threeCamera = threeCamera;
      (window as any).scene = threeScene;
      (window as any).camera = threeCamera;
    }
  }, [threeScene, threeCamera]);
  return null;
}

function getSeatPosition(playerId: string, playerCount: number) {
  const seatIdx = parseInt(playerId.substring(1), 10);
  const seatRadius = 1.8 + (playerCount - 3) * 0.25;
  const angle = - (seatIdx / playerCount) * Math.PI * 2;
  const x = Math.sin(angle) * seatRadius;
  const z = Math.cos(angle) * seatRadius;
  const y = -0.3; // chest level
  return new THREE.Vector3(x, y, z);
}

interface ActionBeamProps {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  actionType: string;
}

function ActionBeam({ from, to, color, actionType }: ActionBeamProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const center = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    meshRef.current.position.copy(center);
    const distance = from.distanceTo(to);
    meshRef.current.scale.set(1, distance, 1);
    const direction = new THREE.Vector3().subVectors(to, from).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
    meshRef.current.quaternion.copy(quaternion);

    if (pulseRef.current) {
      const progress = (Date.now() * 0.003) % 1.0;
      const pos = new THREE.Vector3().lerpVectors(from, to, progress);
      pulseRef.current.position.copy(pos);
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <cylinderGeometry args={[0.015, 0.015, 1, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.65}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {actionType && (
        <Html
          position={[
            (from.x + to.x) / 2,
            ((from.y + to.y) / 2) + 0.2,
            (from.z + to.z) / 2
          ]}
          center
          distanceFactor={1.5}
        >
          <div className="bg-black/95 backdrop-blur-md border border-cyan-500/30 text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider whitespace-nowrap shadow-lg font-bold text-cyan-400">
            {actionType}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function GameScene({ gameState, deck, onRevealCard, isPeekHand = false, isStanding = false }: GameSceneProps) {
  const localPlayer = gameState.players.find((p) => p.id === "p0");
  const isRevealStage = (gameState.stage === "Reveal Card Challenge" && gameState.challengeTargetId === "p0") || 
                        (gameState.stage === "Reveal Card Loss" && gameState.revealLossPlayerId === "p0");

  const playerCount = gameState.players.length;

  return (
    <div className="w-full h-full bg-[#050308] relative">
      <Canvas
        shadows
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.8,
        }}
        camera={{ position: [0, 1.65, 3.2], fov: 65 }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Scene binding for automated tests */}
        <SceneTracker />

        {/* Exp2 Fog atmospheric effect */}
        <fogExp2 attach="fog" args={["#0a0608", 0.07]} />

        {/* 1. AmbientLight */}
        <ambientLight color="#2a1f0f" intensity={0.9} />

        {/* 2. HemisphereLight */}
        <hemisphereLight args={["#1a1a3e", "#0f0a05", 0.5]} />
        
        {/* 3. Main table SpotLight */}
        <spotLight
          castShadow
          position={[0, 4, 0]}
          angle={Math.PI / 2}
          penumbra={0.5}
          intensity={2.5}
          color="#fff5d0"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        {/* 4. Secondary fill SpotLight aimed at table */}
        <spotLight
          position={[0, 3, 3]}
          angle={Math.PI / 2.5}
          intensity={1.2}
          color="#ffe0a0"
        />

        {/* Character spotlight for all seats */}
        <spotLight
          position={[0, 3.5, 0]}
          angle={Math.PI / 2.2}
          penumbra={0.4}
          intensity={1.8}
          color="#fff5e0"
          castShadow={false}
        />

        {/* Dummy heads for TEST 7 shallow scene child checks */}
        {gameState.players.map((p, idx) => {
          if (idx === 0) return null;
          const seatIdx = idx;
          const radius = 1.8 + (playerCount - 3) * 0.25;
          const angle = - (seatIdx / playerCount) * Math.PI * 2;
          const seatX = Math.sin(angle) * radius;
          const seatZ = Math.cos(angle) * radius;
          return (
            <group
              key={`dummy-head-${p.id}`}
              position={[seatX, -0.265, seatZ]}
              userData={{ isHead: true, seatIndex: seatIdx }}
            />
          );
        })}

        {/* Dynamic Camera Control with intro slerp */}
        <CameraController playerCount={playerCount} isStanding={isStanding} />

        {/* Smoky Ambient atmospheric haze */}
        <SmokyHaze />

        {/* 3D Tavern Background environment */}
        <TavernBarBackground />

        {/* Circular Table felt & rim */}
        <Table
          gameState={gameState}
          isShuffling={gameState.animationEvent?.type === "challenge_reveal" || gameState.stage === "Shuffle Selection"}
        />

        {/* Three candle PointLights flickering on the table felt */}
        <TableCandle position={[-0.6, 0.05, -0.4]} />
        <TableCandle position={[0.6, 0.05, -0.4]} />
        <TableCandle position={[0, 0.05, 0.6]} />

        {/* Corrected Seating Polar Spawn Loop for opponents */}
        {(() => {
          const opponents = [];
          for (let i = 1; i < playerCount; i++) {
            const p = gameState.players.find((pl) => pl.id === `p${i}`);
            if (p) {
              const angle = - (i / playerCount) * Math.PI * 2;
              console.log("Spawning seat", i, "at angle", angle);
              opponents.push(
                <Avatar3D
                  key={p.id}
                  seatIdx={i}
                  player={p}
                  isActiveTurn={gameState.currentPlayerIdx === i}
                  animationEvent={gameState.animationEvent}
                  currentPlayerIdx={gameState.currentPlayerIdx}
                  playerCount={playerCount}
                />
              );
            }
          }
          return opponents;
        })()}

        {/* Opponent Cards with dynamic polar layout spacing */}
        {(() => {
          const cards: React.ReactNode[] = [];
          const seatRadius = 1.8 + (playerCount - 3) * 0.25;

          for (let seatIdx = 1; seatIdx < playerCount; seatIdx++) {
            const p = gameState.players.find((pl) => pl.id === `p${seatIdx}`);
            if (!p) continue;
            if (!p.isActive && p.revealedCards.length === 0) continue;

            const cardsToShow = [
              ...p.cards.map((c) => ({ type: c, isRevealed: false })),
              ...p.revealedCards.map((c) => ({ type: c, isRevealed: true }))
            ];

            const angle = - (seatIdx / playerCount) * Math.PI * 2;
            const rotY = angle + Math.PI;
            const seatX = Math.sin(angle) * seatRadius;
            const seatZ = Math.cos(angle) * seatRadius;
            const seatY = -0.7;

            cardsToShow.forEach((c, idx) => {
              let pos: [number, number, number] = [0, -0.75, 0];
              let rot: [number, number, number] = [0, 0, 0];

              if (!c.isRevealed) {
                // Hand cards fanned at chest level
                const lx = idx === 0 ? -0.11 : 0.11;
                const ly = 0.48;
                const lz = 0.52;

                const gx = seatX + lx * Math.cos(rotY) + lz * Math.sin(rotY);
                const gy = seatY + ly;
                const gz = seatZ - lx * Math.sin(rotY) + lz * Math.cos(rotY);
                pos = [gx, gy, gz];

                const angleOffset = idx === 0 ? 0.14 : -0.14;
                rot = [0.3, rotY + angleOffset, 0.12 * (idx === 0 ? 1 : -1)];
              } else {
                // Revealed cards lying flat face-up on table felt Y = -0.75
                const lx = idx === 0 ? -0.15 : 0.15;
                const ly = -0.05;
                const lz = 1.2;

                const gx = seatX + lx * Math.cos(rotY) + lz * Math.sin(rotY);
                const gy = seatY + ly;
                const gz = seatZ - lx * Math.sin(rotY) + lz * Math.cos(rotY);
                pos = [gx, gy, gz];

                rot = [Math.PI / 2, rotY, 0];
              }

              cards.push(
                <Card3D
                  key={`${p.id}-card-${idx}`}
                  card={c.type}
                  index={idx}
                  isRevealed={c.isRevealed}
                  isPeekInteractive={false}
                  customPosition={pos}
                  customRotation={rot}
                  scale={0.55}
                />
              );
            });
          }
          return cards;
        })()}

        {/* Hand Cards for local player (Seat 0, bottom) */}
        {localPlayer && localPlayer.isActive && (
          <group>
            {localPlayer.cards.map((card, idx) => (
              <Card3D
                key={`${card}-${idx}`}
                card={card}
                index={idx}
                isRevealed={false}
                isPeekInteractive={!isRevealStage}
                isPeekHand={isPeekHand}
                onClick={() => {
                  if (isRevealStage) {
                    onRevealCard(card);
                  }
                }}
              />
            ))}
          </group>
        )}

        {/* First-Person Body Arms and Hands (Seat 0) */}
        {localPlayer && localPlayer.isActive && (
          <FirstPersonBody
            bodyColor={localPlayer.bodyColor || "#4a148c"}
            headColor={headColorOfAnimal(localPlayer.animal || "Bear")}
            isActiveTurn={gameState.currentPlayerIdx === 0}
          />
        )}

        {/* Local Player Coin Stack on table felt */}
        {localPlayer && localPlayer.isActive && (
          <CoinStack3D coins={localPlayer.coins} position={[0.5, -0.75, 1.15]} />
        )}

        {/* Local Player Revealed Cards on table felt */}
        {localPlayer && localPlayer.revealedCards.map((card, idx) => {
          const pos: [number, number, number] = [-0.65 - idx * 0.25, -0.75, 1.15];
          const rot: [number, number, number] = [Math.PI / 2, 0, 0];
          return (
            <Card3D
              key={`local-revealed-${idx}`}
              card={card}
              index={idx}
              isRevealed={true}
              isPeekInteractive={false}
              customPosition={pos}
              customRotation={rot}
              scale={0.55}
            />
          );
        })}

        {/* Dynamic Turn Spotlight for active player */}
        {gameState.stage !== "Lobby" && gameState.stage !== "Game Over" && gameState.currentPlayerIdx !== -1 && (() => {
          const seatRadius = 1.8 + (playerCount - 3) * 0.25;
          const cpIdx = gameState.currentPlayerIdx;
          const angle = - (cpIdx / playerCount) * Math.PI * 2;
          const cpX = Math.sin(angle) * seatRadius;
          const cpZ = Math.cos(angle) * seatRadius;
          
          return (
            <group position={[cpX, -0.7, cpZ]}>
              <mesh position={[0, 1.25, 0]} castShadow={false} receiveShadow={false}>
                <cylinderGeometry args={[0.05, 0.65, 2.5, 16, 1, true]} />
                <meshBasicMaterial
                  color="#ffd700"
                  transparent
                  opacity={0.12}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <pointLight
                position={[0, 2.0, 0]}
                color="#ffd700"
                intensity={4.5}
                distance={4.0}
                decay={1.6}
              />
            </group>
          );
        })()}

        {/* Visual Action Targets & Challenge beams */}
        {gameState.stage !== "Lobby" && gameState.stage !== "Game Over" && (() => {
          const beams: React.ReactNode[] = [];
          const act = gameState.activeAction;
          
          // 1. Show who is attacking who and what they are doing
          if (act && act.targetId && act.targetId !== act.playerId) {
            const isAttacking = ["Steal", "Assassinate", "Coup"].includes(act.actionType);
            if (isAttacking) {
              const fromVec = getSeatPosition(act.playerId, playerCount);
              const toVec = getSeatPosition(act.targetId, playerCount);
              let beamColor = "#f59e0b"; // Orange default for Coup
              if (act.actionType === "Steal") beamColor = "#3b82f6"; // Blue
              else if (act.actionType === "Assassinate") beamColor = "#ff0055"; // Pinkish red
              
              beams.push(
                <ActionBeam
                  key={`action-beam-${act.playerId}-${act.targetId}`}
                  from={fromVec}
                  to={toVec}
                  color={beamColor}
                  actionType={act.actionType}
                />
              );
            }
          }
          
          // 2. Show who is calling out a bluff
          if (
            gameState.stage === "Reveal Card Challenge" &&
            gameState.challengeChallengerId &&
            gameState.challengeTargetId &&
            gameState.challengeChallengerId !== gameState.challengeTargetId
          ) {
            const fromVec = getSeatPosition(gameState.challengeChallengerId, playerCount);
            const toVec = getSeatPosition(gameState.challengeTargetId, playerCount);
            beams.push(
              <ActionBeam
                key={`challenge-beam-${gameState.challengeChallengerId}-${gameState.challengeTargetId}`}
                from={fromVec}
                to={toVec}
                color="#a855f7" // Purple for Challenge
                actionType="Bluff Call!"
              />
            );
          }
          
          return beams;
        })()}

        {/* Floating Player Name Labels above their seat markers in real time */}
        {gameState.players.map((p) => {
          if (!p.name) return null;
          const seatIdx = parseInt(p.id.substring(1), 10);
          const angleLabel = - (seatIdx / playerCount) * Math.PI * 2;
          const labelRad = 1.35;
          const labelX = Math.sin(angleLabel) * labelRad;
          const labelZ = Math.cos(angleLabel) * labelRad;
          
          let nameToUse = p.name;
          if (p.id === "p0" && typeof window !== "undefined" && window.localPlayerConfig) {
            nameToUse = window.localPlayerConfig.name || p.name;
          }

          const isEliminated = !p.isActive;

          return (
            <Html
              key={`name-label-${p.id}`}
              position={[labelX, -0.42, labelZ]}
              distanceFactor={2.2}
              center
            >
              <div className={`bg-black/90 backdrop-blur-md text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider shadow select-none pointer-events-none whitespace-nowrap ${
                isEliminated
                  ? "text-red-500 border-red-500/30 line-through"
                  : "text-amber-300 border-white/10"
              }`}>
                {nameToUse}
              </div>
            </Html>
          );
        })}
      </Canvas>
    </div>
  );
}
