# The boundary between board progress and dashboard progress

Two things in this repository record how a learner is doing, and they are not
the same thing. This document says which is which, where they touch, and why
the board did not simply use the dashboard's store.

Written at Phase 5 of the Phases 4–7 canvas milestone.

## Two records, two questions

| | Dashboard progress | Board progress |
|---|---|---|
| Question it answers | Has this learner mastered this concept? | Where in this lesson is this learner right now? |
| Lives in | `frontend/src/data/store.ts` | `frontend/src/board/progress/` |
| Storage key | `learning-os/v2` | `learning-canvas/progress/v1` |
| Shape | `ProgressRecord` per chapter/concept | `LearnerProgress` per learner/board |
| Lifetime | The learner's history | One lesson's position |
| Survives a lesson? | Yes — that is the point | Yes, but it describes one board |

A learner can be halfway through the change-of-state board and have no mastery
of change of state; those are different facts, and collapsing them would make
both harder to reason about. Mastery is a judgement about a person. Position is
a bookmark.

## Why the board keeps its own store

The dashboard's `Store` and `Adapter` are extensible in principle — `DB` is a
plain tree, `commitPath` is optional, `touch()` already accepts attempts and
seconds. Adding a `sessions` subtree would have worked. It was not done, for a
measured reason:

`LocalAdapter.commit()` serialises and writes the **entire database** on every
`save()`, and echoes it to every open tab over a `BroadcastChannel`. There is no
debounce and no per-path write. The board saves camera position, so every
settled pan and every released step would become a full-tree write broadcast to
every tab. On a lesson with twenty steps that is twenty whole-database writes
that no other screen asked for.

The choice was therefore between making the dashboard's store worse in order to
borrow it, or giving the board a store shaped for what the board does. The
second is smaller and reversible: if the dashboard's persistence later grows
debouncing and path writes, the board's store can be replaced by an adapter
against it without any component changing, because nothing outside
`board/progress/` knows how the record is stored.

## Where they touch — exactly two places

Both crossings are in `frontend/src/board/BoardView.tsx`.

### 1. Reading who is learning

```ts
await dashboardStore.init()
const scope = dashboardStore.currentId ?? 'anon'
```

Board progress is filed per learner so that two people sharing a machine keep
separate positions. The dashboard already knows who is signed in; asking it is
better than the board inventing a second notion of identity.

**This is awaited, not read.** The dashboard loads its database asynchronously.
Reading `currentId` during the first render returns `null`, and a board that
did so would look for a record under `anon` that had been written under a real
student id — find nothing, and start the lesson over with the record sitting
right there. Nothing is read from board storage until identity is known.

`anon` is the honest fallback when no student is selected, not a default
student.

### 2. Reporting a completed lesson (not yet wired)

When a board carries `chapterId` and `conceptId` in its metadata and the lesson
completes, the board may call the dashboard's existing public method:

```ts
dashboardStore.touch(chapterId, conceptId, { seconds })
```

This is additive: `touch` exists, is public, and already accepts that shape. No
`Store` method is modified, no `Adapter` method is added, and the `DB` shape is
unchanged.

It is deliberately **not** `setConceptState(..., 'completed')`. Finishing a
lesson is evidence, not mastery — the dashboard decides what evidence means,
and a board that declared mastery on its own would be making a judgement it has
no standing to make.

## What the board must never do

- Write to `dashboardStore` from inside a block component. Blocks receive one
  prop and report through `BoardInteractionContext`; a block that reached a
  store could only be rendered by a board that had one, and fixtures, tests and
  the gallery all render blocks without one.
- Store board content in either record. Content comes from the fixture or the
  provider every time. A stored snapshot would resume a learner into a lesson
  that no longer matches the one on disk.
- Assume the dashboard is loaded. See crossing 1.
- Treat `anon` as a person.

## If this needs to change

The board's store is one module with a small interface (`read`, `save`,
`flush`, `clear`). Replacing it with something backed by the dashboard, or by a
server, means writing that interface once. The place to look is
`frontend/src/board/progress/progressStore.ts`; everything above it deals in
`LearnerProgress` and does not know where records go.
