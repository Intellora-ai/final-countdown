# Handoff: Learning OS Dashboard

## Overview
The approved Learning OS Dashboard for Agabi/Blackboard: a student sets up a learning
plan (class → stream → subjects → total daily time → per-subject deadlines → confirm),
then lands in a one-page app with a persistent curriculum sidebar, a "Today's learning"
surface (one concept per subject minimum, filled to the daily budget with a 10-minute
misconception-practice reserve), and per-chapter atomic-concept maps (layered DAG with
four observable states, pan/zoom, an anchored concept box, manual mastery with undo).
Learning Canvas, Practice, Quick Question and Misconception Practice are intentional
"Not designed yet" placeholders.

## About the design files
Everything in `reference/` is a **design reference created in HTML** — the approved,
runnable prototype, not production code to copy directly. `reference/Learning OS
Dashboard.dc.html` is the pixel truth: every measurement in this README comes from it.
The task is to recreate this design in the target codebase's environment using its
established patterns. **`app/` is a complete componentized React + TypeScript + Vite
implementation of that recreation**, provided as the starting point: if the target app
is React, take it wholesale; if not, treat it as the exact spec of markup, styles,
state and data flow.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, shadows, states and interactions are
final and taken verbatim from the approved mockup. Recreate pixel-perfectly.

## Verification honesty
This package was produced in a design environment with **no package manager or Node
runtime**, so `npm run build` was NOT executed here. The source was ported directly
from the running prototype (same logic, same styles) and reviewed file-by-file, but
treat the first local build as a required verification step, not a formality. The
reference HTML runs as-is in any browser and is the behavioral ground truth if the
port and the reference ever disagree.

## Run it
```
cd app
npm install
npm run dev        # Vite dev server
npm run build      # tsc + production build
```
No environment variables. Data persists to localStorage under `learning-os/v2`
(same key and schema as the prototype).

## Project tree
```
app/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.tsx            entry, HashRouter
    App.tsx             shell: drawer logic, topbar, routes
    types.ts            full data contract (Student, Concept, PlanItem, Adapter…)
    data/curriculum.ts  curriculum model + layered-DAG layout + memoization
    data/store.ts       Store + LocalAdapter + planner + seed (mock data)
    hooks/useStore.ts   React binding: init once, re-render on every emit
    lib/format.ts       SUBCOL, nodeStyle, stateLabel, date helpers
    ui/Button.tsx       visual contract of the Agabi Button (swap for real lib)
    components/
      SetupFlow.tsx  Sidebar.tsx  TodayView.tsx  ChapterView.tsx  Placeholder.tsx
    styles/
      index.css  globals.css (resets, container queries, keyframes)
      components.css (class-per-region port of the mockup's styles)
      tokens/    (verbatim Agabi token sheets: colors, type, spacing, depth, motion)
reference/
  Learning OS Dashboard.dc.html   the approved prototype (pixel truth)
  domain/curriculum.js  domain/data-layer.js   original domain source
  REQUIREMENTS.md                 backend schema notes (Firebase/Supabase/relational)
```

## Component map (visual region → file)
- Goal setup (intro / 6 questions / confirm) → `SetupFlow.tsx`
- Left curriculum sidebar: Today row, subject→chapter tree with counts, Practice +
  Quick question, profile switcher, daily budget + Edit plan → `Sidebar.tsx`
- Sticky topbar: drawer toggle, breadcrumb, class line → `App.tsx` (TopBar)
- Today's learning: allocation line + per-subject bar + concept rows + misconception
  row → `TodayView.tsx`
- Chapter view: header (eyebrow, h1, Start-concept pill, meta + legend, mastery
  links), concept map (edges, nodes, halo, keyboard ops), zoom cluster, anchored
  concept box, mastery confirm modal → `ChapterView.tsx`
- "Not designed yet" surfaces → `Placeholder.tsx`

## Data contract (what each component consumes)
- `SetupFlow`: `CURRICULUM.classes/streams/dayOptions/subjectsFor`; writes
  `store.savePlan({cls, stream, subjects, minutes, deadlines})`
- `Sidebar`: `store.student()`, `store.rollups()` (per-chapter/subject done counts),
  `store.plan().items.length`, `store.students()`, `store.switchStudent(id)`
- `TodayView`: `store.plan()` → `{items[], allocated, capacity, reserve}`; writes
  `store.setConceptState(chapterId, conceptId, 'inProgress', 'session')` on Start
- `ChapterView`: `CURRICULUM.layout(concepts)`, `store.stateOf`, `store.prereqsMet`,
  `store.sourceOf`; writes `setConceptState`, `declare`, `undeclare`
- All components re-render via one `store.subscribe` (see `useStore`) — local click,
  another tab, or a future remote adapter all arrive the same way.

## State management
- One store singleton (`data/store.ts`), one adapter behind it. `LocalAdapter`
  persists to localStorage and syncs across tabs (BroadcastChannel + storage events).
  `Adapter` interface in `types.ts` is the swap point for Firebase/Supabase —
  `reference/domain/data-layer.js` contains a commented Firebase adapter.
- Observable states only: notStarted / inProgress / completed / mastered, plus
  `source: 'declared' | 'system'` — a student's manual declaration is never conflated
  with observed evidence. No invented metrics (no accuracy %, confidence, IQ).
- Today's plan is DERIVED by the store (planner in `store.ts`): every selected subject
  gets ≥1 concept; allocation never exceeds `minutes`; a 10-min misconception reserve
  is owned by the planner; spare capacity buys MORE concepts round-robin, never longer
  ones; in-progress first, then nearest deadline.

## Interactions & behavior
- Setup: single-select class/stream/time, multi-select subjects, one date per subject;
  Continue disabled until the step is answered; Back on step 0 returns to the
  dashboard when a plan exists (never a dead end); Edit plan re-enters the flow.
- Graph: drag pans; wheel zooms ONLY with ctrl/cmd/shift (page keeps its scroll);
  zoom buttons ×1.18, range 0.5–2.4; Fit resets. viewBox frames the graph's own
  bounds so zoom 1 fits every chapter. Nodes are keyboard buttons (Tab, Enter/Space)
  with full aria labels. Clicking empty map closes the box.
- Concept box: 244×62, seeks the least-obstructed berth of four around the node
  (scored at clamped position; covering its own node is worst), leader line to the
  nearest edge, edge color = node state color. Start/Continue/Review by state.
- Start (anywhere) = write first, navigate second: concept → inProgress, then to the
  canvas placeholder. Sidebar counts, Today and node state move together.
- Mastery: link opens confirm modal ("kept separate from observed evidence"), OK
  → `declare` (state mastered, source declared); Undo restores `prevState`.
- Drawer: below 900px (container query) the sidebar overlays with scrim, starts
  closed, closes on navigation, resets on breakpoint cross. Tap targets ≥44px on
  narrow shells (`[data-tap]` rules).
- Motion: osIn .3s entries, osPop .19s for the box, cubic-bezier(.16,1,.3,1)
  everywhere; `prefers-reduced-motion` collapses all of it.

## Design tokens
All under `app/src/styles/tokens/` — verbatim Agabi sheets. Key values:
- Ground `--agabi-neutral-900` #0C0E16 (dark shell via `.dark` remap); ink
  `--agabi-neutral-25`; card #1A1F3B-derived `--card`; hairline `--border`.
- Accent teal `--accent` (#1AADA6 family) carries ALL concept-state encoding (fill/
  border weight, one hue); primary indigo `--primary` #3B55D4 for Start actions
  (hover `--agabi-indigo-600`); `--warning` amber for the misconception reserve.
- Type: Fraunces (`--font-display`) 46/38/36/34/23/21px headings; DM Sans
  (`--font-sans`) 17/16/15.5/13.5/12.5px; JetBrains Mono (`--font-mono`) eyebrows
  9–14px, tracked .14–.2em uppercase. Google Fonts via tokens/fonts.css.
- Radii: 16 modal, 12 cards/nodes/buttons, 9–10 small controls. Node 176×46 rx12.
- Subject colors: SUBCOL in `lib/format.ts` (maths teal-300, physics indigo-300,
  chemistry indigo-200, biology green-500, accountancy amber-500…).

## Mock data
`seed()` in `data/store.ts` (and the curriculum tables in `data/curriculum.ts`)
reproduce the approved demo state exactly: Arya Menon (Class 10, Maths+Physics,
120 min, 55% through), Ishan Rao (three subjects, 150 min, 18%), New learner (no
plan → setup). Components never invent data — delete the seed and supply a real
adapter and the UI runs unchanged.

## Learning Canvas preparation
`/canvas` is the integration point: Start actions already write `inProgress` and
navigate there. Replace `Placeholder kind="canvas"` with the real surface; the
concept identity arrives via the store's `lastTouched()` or extend the route to
`/canvas/:chapterId/:conceptId`. Practice / Quick question / Misconception plug in
the same way.

## Dependencies (and why)
- react, react-dom — the UI runtime
- react-router-dom — the 7 routes (HashRouter so it also works from file://)
- vite + @vitejs/plugin-react + typescript — build/dev tooling
Nothing else. The Agabi component library should replace `ui/Button.tsx` at
integration; props are aligned.

## Assets
No images. Fonts load from Google Fonts (Fraunces, DM Sans, JetBrains Mono) exactly
as the design system does; replace `tokens/fonts.css` with licensed `@font-face`
files if Agabi owns them. The brand mark is drawn (accent tile + dot), matching the
mockup — no logo asset exists in the source design system.
