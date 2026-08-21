import CURRICULUM from '../../data/curriculum'
import type { LearningBoard } from '../types/learningBoard'

/* THE PHASE 1 FIXTURE — one answer, in the content language.
 *
 * IT IS NOT LEARNER DATA AND SAYS SO. `metadata.source: 'fixture'` is set, and
 * the board reads no progress record, writes nothing, and claims nothing about
 * anyone's mastery. It exists to prove the renderer, and it is labelled so it
 * can never be mistaken for something observed.
 *
 * THE IDS ARE REAL. `chemistry`, `matter-in-our-surroundings` and
 * `change-of-state` all exist in curriculum.ts. The eyebrow and subtitle below
 * are LOOKED UP rather than typed out, which means this file cannot drift from
 * the curriculum silently — if a chapter is renamed or re-graded, the label
 * changes with it. That is also what makes metadata load-bearing from day one
 * rather than a field somebody remembers to fill in later.
 *
 * IT FALLS BACK RATHER THAN THROWING. A missing concept is a reason to render a
 * plain label, not to take the route down.
 */

const FIXTURE_CLASS = 'Class 9'
const SUBJECT_ID = 'chemistry'
const CHAPTER_ID = 'matter-in-our-surroundings'
const CONCEPT_ID = 'change-of-state'

function lookup() {
  try {
    const subject = CURRICULUM.subjectsFor(FIXTURE_CLASS, null).find((s) => s.id === SUBJECT_ID)
    const chapter = subject?.chapters.find((c) => c.id === CHAPTER_ID)
    const concept = chapter?.concepts.find((c) => c.id === CONCEPT_ID)
    return { subject, chapter, concept }
  } catch {
    return { subject: undefined, chapter: undefined, concept: undefined }
  }
}

const { subject, concept } = lookup()

/** e.g. "CHEMISTRY · CHANGE OF STATE" */
export const CHANGE_OF_STATE_EYEBROW = [subject?.name ?? 'Chemistry', concept?.name ?? 'Change of state']
  .join(' · ')
  .toUpperCase()

const SUBTITLE = concept
  ? `${concept.name} · ${concept.minutes} min`
  : 'Change of state'

export const CHANGE_OF_STATE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-change-of-state',
  title: 'Why does heating a solid turn it into a liquid?',
  subtitle: SUBTITLE,
  layout: 'grid',
  blocks: [
    {
      id: 'explanation-1',
      type: 'explanation',
      title: 'The main idea',
      layout: { width: 'wide' },
      content:
        'Heating a solid does not change what its particles are. It changes how much energy ' +
        'they have. In a solid the particles sit in a fixed arrangement and can only vibrate ' +
        'about their own positions, and adding heat makes those vibrations larger.\n\n' +
        'At the melting point the vibrations are strong enough to overcome the forces holding ' +
        'that arrangement together. The particles break out of their fixed positions and begin ' +
        'to slide past one another, and the solid becomes a liquid. Nothing is created or ' +
        'destroyed along the way: the same particles are simply held together less rigidly.',
    },
    {
      id: 'callout-1',
      type: 'callout',
      tone: 'key',
      layout: { width: 'medium' },
      content:
        'While something is melting its temperature does not rise. The heat being supplied goes ' +
        'into breaking the fixed arrangement, not into making the particles hotter.',
    },
    {
      id: 'table-1',
      type: 'table',
      title: 'What changes between the three states',
      layout: { width: 'full' },
      columns: ['State', 'Particle arrangement', 'Movement', 'Shape and volume'],
      rows: [
        ['Solid', 'Fixed, closely packed', 'Vibrate about fixed positions', 'Fixed shape, fixed volume'],
        ['Liquid', 'Close together, disordered', 'Slide past one another', 'Takes the container shape, fixed volume'],
        ['Gas', 'Far apart, no order', 'Move freely and quickly', 'Fills the container completely'],
      ],
    },
  ],
  connectors: [],
  metadata: {
    chapterId: CHAPTER_ID,
    conceptId: CONCEPT_ID,
    source: 'fixture',
  },
}
