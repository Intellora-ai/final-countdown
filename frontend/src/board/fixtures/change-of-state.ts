import CURRICULUM from '../../data/curriculum'
import type { LearningBoard } from '../types/learningBoard'

/* THE REFERENCE FIXTURE — the Gemini-style composition, as data.
 *
 * Everything the reference image shows a flavour of is here as a BLOCK:
 * explanation, equation, process, diagram, chart, table, callout, simulation,
 * and two relationships. Not one of them knows it is part of this lesson —
 * delete this file and every component still renders any other board.
 *
 * NOT LEARNER DATA, AND SAYS SO: metadata.source 'fixture', no progress read,
 * no progress written. IDS ARE REAL: chemistry / matter-in-our-surroundings /
 * change-of-state exist in curriculum.ts, and the eyebrow/subtitle are looked
 * up so a renamed chapter breaks a test instead of drifting.
 *
 * THE PHYSICS IS THE LESSON'S OWN. Q = m·L is latent heat — the equation FOR
 * melting — not PV = nRT borrowed from the reference image's gas lesson. The
 * heating curve's plateau at the melting point is the equation drawn as data:
 * temperature holds while Q flows into L.
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

export const CHANGE_OF_STATE_EYEBROW = [subject?.name ?? 'Chemistry', concept?.name ?? 'Change of state']
  .join(' · ')
  .toUpperCase()

export const CHANGE_OF_STATE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-change-of-state',
  title: 'Why does heating a solid turn it into a liquid?',
  subtitle: concept ? `${concept.name} · ${concept.minutes} min` : 'Change of state',
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
        'to slide past one another, and the solid becomes a liquid.',
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
      id: 'equation-1',
      type: 'equation',
      eyebrow: 'THE ENERGY OF MELTING',
      title: 'Latent heat',
      layout: { width: 'medium' },
      latex: 'Q = m · L',
      variables: [
        { symbol: 'Q', meaning: 'heat absorbed during melting', unit: 'J' },
        { symbol: 'm', meaning: 'mass of the substance', unit: 'kg' },
        { symbol: 'L', meaning: 'latent heat of fusion', unit: 'J/kg' },
      ],
    },
    {
      id: 'chart-1',
      type: 'line_chart',
      eyebrow: 'MEASURED, NOT IMAGINED',
      title: 'Heating curve of ice',
      layout: { width: 'wide' },
      points: [
        { x: 0, y: -20 }, { x: 10, y: -10 }, { x: 20, y: 0 },
        { x: 30, y: 0 }, { x: 40, y: 0 },
        { x: 50, y: 12 }, { x: 60, y: 25 }, { x: 70, y: 40 },
      ],
      highlightIndex: 3,
      yLabel: 'Temperature (°C)',
      xLabel: 'Heat added (kJ)',
    },
    {
      id: 'process-1',
      type: 'process',
      title: 'What happens, step by step',
      layout: { width: 'wide' },
      steps: [
        { title: 'Heat flows in', detail: 'Energy transfers from the surroundings into the solid.' },
        { title: 'Vibrations grow', detail: 'Particles vibrate further about their fixed positions.' },
        { title: 'The melting point is reached', detail: 'Vibrations are now as large as the fixed arrangement can survive.' },
        { title: 'The arrangement breaks', detail: 'Heat now goes into separating particles — temperature holds steady.' },
        { title: 'The liquid forms', detail: 'Particles slide past one another while staying close together.' },
      ],
    },
    {
      id: 'diagram-1',
      type: 'diagram',
      eyebrow: 'THE THREE STATES',
      title: 'How the states connect',
      layout: { width: 'medium' },
      nodes: [
        { id: 'solid', label: 'Solid', detail: 'fixed arrangement', group: 'states' },
        { id: 'liquid', label: 'Liquid', detail: 'particles slide', group: 'states' },
        { id: 'gas', label: 'Gas', detail: 'particles fly free', group: 'states' },
      ],
      edges: [
        { from: 'solid', to: 'liquid', kind: 'causal', label: 'melting' },
        { from: 'liquid', to: 'gas', kind: 'causal', label: 'evaporation' },
      ],
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
    {
      id: 'sim-1',
      type: 'simulation',
      eyebrow: 'SEE IT MOVE',
      title: 'Particles and temperature',
      layout: { width: 'full' },
      kind: 'particle-box',
      unit: 'K',
      minTemp: 273,
      maxTemp: 450,
      initialTemp: 300,
    },
  ],
  connectors: [
    { id: 'c1', from: 'equation-1', to: 'chart-1', kind: 'reference', label: 'the plateau is Q = m·L' },
    { id: 'c2', from: 'diagram-1', to: 'sim-1', kind: 'reference', label: 'watch the particles' },
  ],
  metadata: { chapterId: CHAPTER_ID, conceptId: CONCEPT_ID, source: 'fixture' },
}
