# Step 0 — legacy blackboard deletion manifest

Recorded **before** deletion. The single approved destructive migration.

- Backup tag: `backup/pre-blackboard-deletion` → `9462d0d`
- Branch: `canvas/step-0-remove-blackboard`
- Recovery: `git checkout backup/pre-blackboard-deletion -- frontend/src/board`

## Why

The blackboard was disconnected by its author in `7ad4f6d` ("refactor:
disconnect the learning canvas") on the grounds that the design was wrong.
It has been unreachable since. This removes the dead system rather than
leaving 12k lines of unreferenced code to rot beside the new canvas.

## Deleted paths

```
frontend/src/board/BoardView.tsx
frontend/src/board/GalleryView.tsx
frontend/src/board/blocks/CalloutBlock.tsx
frontend/src/board/blocks/ComparisonBlock.tsx
frontend/src/board/blocks/DiagramBlock.tsx
frontend/src/board/blocks/EquationBlock.tsx
frontend/src/board/blocks/ExampleBlock.tsx
frontend/src/board/blocks/ExplanationBlock.tsx
frontend/src/board/blocks/ImageBlock.tsx
frontend/src/board/blocks/ProcessBlock.tsx
frontend/src/board/blocks/QuizBlock.tsx
frontend/src/board/blocks/SimulationBlock.tsx
frontend/src/board/blocks/TableBlock.tsx
frontend/src/board/blocks/TextBlock.tsx
frontend/src/board/blocks/TimelineBlock.tsx
frontend/src/board/blocks/UnknownBlock.tsx
frontend/src/board/blocks/charts/BarChartBlock.tsx
frontend/src/board/blocks/charts/LineChartBlock.tsx
frontend/src/board/blocks/charts/PieChartBlock.tsx
frontend/src/board/blocks/quizLogic.test.ts
frontend/src/board/blocks/quizLogic.ts
frontend/src/board/camera/CameraWorld.tsx
frontend/src/board/camera/camera.test.ts
frontend/src/board/camera/camera.ts
frontend/src/board/camera/useCamera.ts
frontend/src/board/fixtures/biology-cell.ts
frontend/src/board/fixtures/broken-board.ts
frontend/src/board/fixtures/broken-connectors.ts
frontend/src/board/fixtures/change-of-state.ts
frontend/src/board/fixtures/chemistry-periodic-trends.ts
frontend/src/board/fixtures/data-large-table.ts
frontend/src/board/fixtures/data-lesson.ts
frontend/src/board/fixtures/data-long-labels.ts
frontend/src/board/fixtures/data-mobile-stress.ts
frontend/src/board/fixtures/economics-market-structures.ts
frontend/src/board/fixtures/economics-supply-demand.ts
frontend/src/board/fixtures/empty-board.ts
frontend/src/board/fixtures/fixtures.test.ts
frontend/src/board/fixtures/geography-climate.ts
frontend/src/board/fixtures/geography-water-cycle.ts
frontend/src/board/fixtures/history-artifact-image.ts
frontend/src/board/fixtures/history-long-reading.ts
frontend/src/board/fixtures/history-timeline.ts
frontend/src/board/fixtures/index.ts
frontend/src/board/fixtures/invalid-board.ts
frontend/src/board/fixtures/invalid-chart-values.ts
frontend/src/board/fixtures/maths-fractions-quiz.ts
frontend/src/board/fixtures/maths-quadratic.ts
frontend/src/board/fixtures/physics-gas-pressure.ts
frontend/src/board/fixtures/physics-inertia.ts
frontend/src/board/fixtures/physics-motion.ts
frontend/src/board/fixtures/unsupported-blocks.ts
frontend/src/board/hooks/useBoardSource.ts
frontend/src/board/index.ts
frontend/src/board/lib/chartGeometry.perf.test.ts
frontend/src/board/lib/chartGeometry.test.ts
frontend/src/board/lib/chartGeometry.ts
frontend/src/board/lib/diagramLayout.test.ts
frontend/src/board/lib/diagramLayout.ts
frontend/src/board/perf/harness.ts
frontend/src/board/perf/marks.ts
frontend/src/board/progress/hydrate.test.ts
frontend/src/board/progress/hydrate.ts
frontend/src/board/progress/progressStore.test.ts
frontend/src/board/progress/progressStore.ts
frontend/src/board/progress/types.ts
frontend/src/board/progress/useLearnerProgress.ts
frontend/src/board/renderer/BoardRenderer.tsx
frontend/src/board/renderer/blockRegistry.test.ts
frontend/src/board/renderer/blockRegistry.ts
frontend/src/board/renderer/validateBoard.test.ts
frontend/src/board/renderer/validateBoard.ts
frontend/src/board/shell/BlackboardShell.tsx
frontend/src/board/shell/BoardBlock.tsx
frontend/src/board/shell/BoardCanvas.tsx
frontend/src/board/shell/BoardControls.tsx
frontend/src/board/shell/BoardGrid.tsx
frontend/src/board/shell/BoardStates.tsx
frontend/src/board/shell/ConnectorLayer.tsx
frontend/src/board/shell/NoticeBar.tsx
frontend/src/board/shell/board-theme.css
frontend/src/board/teaching/AccessibleLesson.tsx
frontend/src/board/teaching/BoardInteractionContext.tsx
frontend/src/board/teaching/StepView.tsx
frontend/src/board/teaching/TeachingControls.tsx
frontend/src/board/teaching/lessons/change-of-state.lesson.ts
frontend/src/board/teaching/plan.test.ts
frontend/src/board/teaching/plan.ts
frontend/src/board/teaching/reveal.test.ts
frontend/src/board/teaching/reveal.ts
frontend/src/board/teaching/session.test.ts
frontend/src/board/teaching/types.ts
frontend/src/board/teaching/useTeachingSession.ts
frontend/src/board/types/learningBoard.ts
frontend/e2e/canvas-invariants.spec.ts
frontend/e2e/canvas-phase4.spec.ts
frontend/e2e/canvas-phase5.spec.ts
```

## Moved paths

```
frontend/src/board/scene/  ->  frontend/src/canvas/
frontend/src/board/model/  ->  frontend/src/canvas/model/
```

## Cost, accepted in advance

| | Before | After |
|---|---|---|
| Unit tests | 303 | ~44 |
| Vitest files | 17 | 4 |
| Playwright specs | 4 | 1 |

Lost capability: `validateBoard` (570 lines, repair-notice semantics), the
16-type block registry, 24 fixtures, the teaching/reveal session, progress
persistence, and the camera. The Step 2 representation contract must
re-earn the validator's behaviour rather than assume it.

## Not touched

`frontend/src/components/`, `frontend/src/data/`, `frontend/src/styles/`,
`frontend/src/hooks/`, `frontend/src/ui/`, `frontend/src/lib/` — the
dashboard. Verified: it imports nothing from `board/`.
