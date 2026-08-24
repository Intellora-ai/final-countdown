# Learning OS — dynamic data requirements

What the frontend now needs from a backend, and what it deliberately refuses to
store. Written against `domain/data-layer.js`, which is the only file that
touches learner data. The UI reads through `LEARNING_STORE` and never holds
learner state of its own.

---

## 1. The adapter contract

Five methods. Implement them against any backend and the UI does not change.

| Method | Returns | Contract |
| --- | --- | --- |
| `load()` | `Promise<db>` | Full tree once, at boot. `null` on first run triggers seeding. |
| `subscribe(cb)` | `unsubscribe` | `cb(db)` on **every** remote change. This is what makes the UI live. |
| `commitPath(path, value)` | `Promise` | Granular write. Optional but strongly preferred. |
| `commit(db)` | `Promise` | Whole-tree write. Fallback when `commitPath` is absent. |
| `close()` | — | Tear down listeners. |

Shipped: `LocalAdapter` — localStorage for durability, `BroadcastChannel` +
`storage` events for live sync. Two open tabs are already a two-device test:
mark a concept mastered in one, the other updates with no refresh.

`FirebaseAdapter` and the Supabase equivalent are written out as comments in
`data-layer.js`; both are under 20 lines because the contract is small.

---

## 2. Data to track

### `students/{studentId}`
| Field | Type | Source |
| --- | --- | --- |
| `id`, `name`, `avatarHue` | string / int | account |
| `cls` | `"Class 9"…"Class 12"` | setup step 1 |
| `stream` | string \| null | setup step 2, Class 11–12 only |
| `subjects` | `[subjectId]` | setup step 3 |
| `minutes` | `90 \| 120 \| 150 \| 180` | setup step 4 — **total across all subjects** |
| `deadlines` | `{ [subjectId]: "YYYY-MM-DD" }` | setup step 5, one per subject |
| `createdAt`, `lastActiveAt` | epoch ms | system |

### `progress/{studentId}/{chapterId}/{conceptId}`
| Field | Type | Notes |
| --- | --- | --- |
| `state` | `notStarted \| inProgress \| completed \| mastered` | the only status the UI displays |
| `source` | `system \| declared` | provenance of the mastery claim — never merged |
| `attempts` | int | observed |
| `hints` | int | observed |
| `revisits` | int | observed — reopened after `completed` |
| `secondsSpent` | int | observed |
| `firstSeenAt`, `lastTouchedAt`, `completedAt`, `declaredAt` | epoch ms | |
| `prevState` | string | restore target for Undo mastery |

### `activity/{studentId}/{eventId}`
`{ at, type, chapterId, conceptId, from, to }` — append-only, capped at 60 in
the local adapter. Drives the resume entry and any future audit view.

### Not stored
No confidence, no predicted mastery, no accuracy %, no cognitive or engagement
score, no learning IQ. The four raw signals above are stored; nothing derives a
number from them behind the learner's back.

---

## 3. Real-time updates

Everything below re-renders on `subscribe` with no refresh and no polling.

| What | Trigger |
| --- | --- |
| Concept state on the chapter map | `setState` / `declare` / `undeclare` |
| Node glow, edge liveness, prerequisite chips | any state change |
| Chapter counts in the sidebar (`3/10`) | any state change in that chapter |
| Subject roll-up (`18/35`) | any state change in that subject |
| Today's plan — membership, order, and minutes | state change, plan edit, date rollover |
| Allocation bar (`75 of 120 min`) | plan edit or capacity change |
| Signed-in-as list, per-student done counts | any student's progress |
| Cross-device / second tab | adapter `subscribe` |

The plan is **derived, never stored** — `store.plan()` recomputes from progress
on every render, so it cannot drift from reality.

---

## 4. Personalization and adaptive behavior

All of it is implemented in `data-layer.js`, not in the view:

- **Prerequisite gating** — `prereqsMet()`; a concept is never offered before
  its dependencies are `completed` or `mastered`.
- **Resume first** — the in-progress concept sorts to the top of Today.
- **Deadline pressure** — remaining subjects order by days until their own
  deadline, not one global date.
- **Every subject, every day** — the hard rule; a finished subject falls back to
  a review entry rather than disappearing.
- **Capacity respected** — allocation trims to `minutes`, reserving 10 for
  misconception practice. Never over budget.
- **Returning learner skips setup** — `hasPlan()` decides; a learner with no
  plan lands on step 1.
- **Blocking prerequisite surfaced** — `blockingDeps()` names what stands in the
  way instead of just disabling the node.

---

## 5. The one open decision

"Weak area" needs a definition, and the earlier spec forbids invented metrics.
So the signals are recorded and the judgement is isolated:

```js
LEARNING_STORE.weaknessHook = function (observed, concept) {
  // observed = { attempts, hints, revisits, seconds, firstSeenAt, lastTouchedAt }
  // return null, or { reason, since }
};
```

It returns `null` today, so nothing in the UI claims a weakness. Define the
policy here and every surface picks it up at once. Return a **reason**, not a
score — the UI is built to show evidence, not percentages.

---

## 6. Handing this to Claude Code

1. Provision Firebase/Supabase, then paste the config into a new adapter file.
2. `LEARNING_STORE.init(new FirebaseAdapter(app))` — one line in the DC's
   `ensureStore()`. Nothing else in the UI changes.
3. Add security rules scoped to `students/{uid}` and `progress/{uid}`.
4. Replace `seed()` with account creation.
5. Define `weaknessHook` once the measurement is agreed.
