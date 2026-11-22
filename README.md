![SIGIL Banner](https://raw.githubusercontent.com/mynameisprem-pj/SIGIL-Daily-Geometric-Ritual/main/assets/banner.jpg)

# SIGIL — Daily Geometric Reconstruction for Reddit

**SIGIL** is a daily spatial-reconstruction ritual built natively on **Devvit Web** (`React 19`, `Hono`, `Devvit Redis`, and `Devvit Journeys`).

Every UTC day, the entire subreddit receives an identical set of scattered, rotated lapidary strokes surrounding a carved basalt astrolabe altar—and reconstructs the hidden sacred rune by dragging and rotating pieces into inlaid stone grooves.

---

## Core Design Pillars

### Sub-3-Second Comprehension, Zero Tutorial Walls

- Tapping **Begin Ritual** on the inline Reddit feed card launches directly into Today's Main Daily puzzle.
- A subtle dashed orbital hint appears on the first stroke.
- Zero modal clutter.

### True Geometric Physics (`src/client/engine/`)

- **Length-Weighted Wire Centroids:** Asymmetric hooks, spears, and crescents rotate around their true center of mass rather than naive bounding-box midpoints.
- **Hausdorff Point-Cloud Symmetry & Congruence:** Automatically detects `180°` / `90°` rotational self-symmetry and allows congruent mirrored wings to snap into either matching slot without invisible ID frustration.
- **Instantaneous Drag + `140ms` Spring Rotation:** Separates outer SVG translation (`0ms` 1:1 pointer tracking) from inner monotonic angle unwrapping (`140ms` cubic-bezier spring on non-dragging taps).

### Calibrated Daily Content (`src/client/engine/dailyPack.ts`)

- **Weekly Cadence:**
  - Accessible `6-stroke` flow on Mon–Tue.
  - Balanced `7-stroke` rituals on Wed–Fri.
  - `8-stroke` weekend seals on Sat–Sun.
- **Depth Without Clutter:** Completing Today's Main Daily unlocks:
  - **Bonus I (`7–8p`)**
  - **Bonus II (`8–9p` Master Seal)**
  - **Zen Sanctuary** — endless untimed flow.
  - **Practice Archive** — past editions + Founders' Prelude seals.

### Precious Material Craft & Procedural Audio

- **WCAG AAA-verified Basalt + Alabaster + Molten Brass palette**, reserving **Pale Jade (`#6BC4A6`) exclusively for Perfect Reconstructions** (solved within `+2` moves of geometric par).
- **Zero-asset Web Audio synthesizer** generating ascending D-pentatonic lock chimes and an arpeggiated ignition chord on completion.

### Authentic Reddit Rituals (`src/server/`)

- **One-Tap Ritual Ledger Comments:** Players inscribe spoiler-free `◈◈◈◈◈◈` seals directly under a pinned **Daily Ritual Ledger** comment (`runAs: 'USER'`, per-post idempotent).
- **First-Attempt Daily Leaderboard & UTC Streaks:** Tamper-validated Hono + Redis sorted sets featuring:
  - Top 10 leaderboard.
  - Personal rank.
  - `Top X%` percentile.
  - Subreddit **Community Pulse** averages.
- **Automated `00:00 UTC` Daily Post Cron & Prestige Subreddit Flairs:** Self-sustaining daily subreddit operation with `◈ Grand Lapidary` streak flairs.

---

## Architecture

```text
src/
├── shared/          # Shared types, deterministic combined scoring, spoiler-free Markdown/ASCII formatters
├── client/
│   ├── audio/       # Lazy user-gesture Web Audio procedural pentatonic synthesizer
│   ├── components/ # SigilStage, SigilPiece, single authoritative ResultCard, SanctumDrawer
│   ├── engine/     # Seeded PRNG, wire-centroid geometry, Hausdorff snap solver, sacred-geometry generator
│   ├── hooks/      # Controlled one-shot ignition state machine, daily pack & Redis session hooks
│   └── telemetry/  # Fault-isolated Devvit Journeys (@devvit/analytics) funnel instrumentation
└── server/
    ├── routes/     # Hono REST API (/api/session, /api/complete, /api/leaderboard, /api/share-comment, /api/telemetry)
    └── services/  # Pure UTC streak rules, Redis persistence, pinned Ledger comments & midnight UTC scheduler
```

---

## Local Development & Verification

```bash
npm install

npm run test:unit    # Runs 20+ unit & property checks across 90+ generated daily puzzles, solver & streaks
npm run test:types   # Strict TypeScript build verification across client, server, and shared
npm run lint         # ESLint v10 + React 19 Compiler & Hooks verification
npm run build        # Bundles CSP-safe self-hosted variable fonts, client entrypoints, and Hono server
npm run dev          # Live playtest in r/sigil_game_dev
```
