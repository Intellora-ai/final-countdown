import type { LearningBoard } from '../types/learningBoard'

/* EXPLANATION ONLY — the smallest honest lesson.
 *
 * One block, no chart, no diagram, no quiz. It exists because a board that can
 * only look good with a visual is a board that will grow one whether the idea
 * needs it or not, and most of what a teacher says is a sentence.
 */
export const PHYSICS_INERTIA_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-physics-inertia',
  title: 'Why a moving thing keeps moving',
  subtitle: 'Newton’s first law, without the apparatus',
  layout: 'flow',
  blocks: [
    {
      id: 'inertia-1',
      type: 'explanation',
      title: 'Nothing needs a push to keep going',
      content:
        'A ball rolled across a smooth floor slows down and stops, so it is easy to believe that motion needs a constant push. It does not. What stopped the ball was friction — a force acting against it the whole way.\n\nRemove that force and nothing changes the ball’s motion at all. It keeps the speed it had, in the direction it had, until something acts on it. This is inertia: not a force, but the absence of any reason to change.\n\nThat is why a spacecraft between planets can travel for years with its engines off. There is nothing to slow it down, so nothing does.',
    },
  ],
  metadata: { source: 'fixture' },
}
