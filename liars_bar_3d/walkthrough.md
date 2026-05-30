# 3D "Liar's Bar" Style Coup Client — Walkthrough

We have successfully scaffolded and compiled a Next.js (App Router), React Three Fiber (R3F), and TailwindCSS client for **Coup: Liar's Tavern Edition**. It is located in the subdirectory `liars_bar_3d/` to isolate its package structure.

---

## 1. ATMOSPHERIC PARADIGM & VISUAL STYLE
- **Setting:** Dark, dim, underground tavern lighting with a centered warm-golden spotlight (`spotLight` on felt table) and drifting purple smoky haze particle systems (`SmokyHaze` buffer points).
- **First-Person Camera:** The first-person perspective automatically pans, tilts, and zooms (`CameraController` lerp) to focus on the active player seat whenever an action, block, or challenge is declared, replicating the tension of Liar's Bar.
- **Stylized Low-Poly Avatars:** Built low-poly humanoid characters representing Coup roles with glowing emissive eyes (using cylinder/sphere geometries) that trigger arm-slams for Tax, aggressive prop-pointing (assassinations/steals), and head slumping upon losing influence.

---

## 2. 3D CARD MECHANICS & SPAWNING
- **Physical 3D Cards:** The local player's hand cards are rendered as thick 3D boxes sitting flat face-down on the felt table.
- **Hover Peeking:** Hovering over your hand cards lifts and rotates them towards the camera viewport so only you can peek at the card illustrations.
- **Dynamic Coin Stacks:** Gold coins stack vertically in front of player seats and reorganize into side-by-side stacks (max 5 coins per pile) matching state updates.

---

## 3. HOW TO LAUNCH AND PLAY
To boot the 3D local development server:
```bash
# Navigate to project directory
cd liars_bar_3d

# Install packages (completed)
npm install

# Build client
npm run build

# Boot local server
npm run dev -- -p 3000
```
Open **`http://localhost:3000`** in your browser. Enter your name, pick an avatar emoji, configure the lobby size/bot count, and enter the tavern to start playing!
