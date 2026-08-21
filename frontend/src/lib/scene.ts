/* SCENE CONSTRUCTION — turning a concept into the board's opening state.
 *
 * A concept in the curriculum is three fields: a name, a duration, and its
 * edges. A lesson is a question and the things that answer it. This module is
 * where the first becomes the second, and it is deliberately the ONLY place
 * that decides what a board opens with, so "what does the learner see first?"
 * has one answer to read rather than one per component.
 *
 * AUTHORED WHERE IT MATTERS, DERIVED EVERYWHERE ELSE. The reference concept has
 * a hand-written scene: a real question, a real variable with real units and
 * limits. Every other concept gets a derived opening that is true but thin — its
 * own name, its own prerequisites, and no invented variables.
 *
 * That asymmetry is honest rather than unfinished. Inventing a temperature for
 * "Remainder theorem" so the board looks uniformly rich would put a number on
 * screen that nothing observed, which is the one thing this project refuses to
 * do. A thin board that is true beats a full board that is fiction.
 */

import type { Concept } from '../types'
import type { OperationLog } from './operations'
import type { VariableStore } from './variables'

export interface ConceptScene {
  question: string
  /** Count of semantic steps recorded while opening. */
  steps: number
}

interface SceneAuthoring {
  question: (concept: Concept) => string
  variables?: (chapterId: string, concept: Concept) => Parameters<VariableStore['declare']>[0][]
}

/* Authored scenes, keyed `chapterId/conceptId`. The reference lesson is Class 9
 * Chemistry, "Matter in Our Surroundings" — curriculum.ts:98 places that chapter
 * in C9. Keying on chapter and concept rather than class keeps the scene bound
 * to the concept itself, so it survives the tables being re-graded. */
const AUTHORED: Record<string, SceneAuthoring> = {
  'matter-in-our-surroundings/change-of-state': {
    question: () => 'Why does heating a solid turn it into a liquid?',
    variables: (chapterId, concept) => [
      {
        variableId: 'temperature',
        chapterId,
        conceptId: concept.id,
        name: 'Temperature',
        symbol: 'T',
        value: 273,
        unit: ' K',
        min: 173,
        max: 573,
        step: 1,
        source: 'curriculum',
      },
    ],
  },
  'matter-in-our-surroundings/states-of-matter': {
    question: () => 'What makes a solid a solid and a gas a gas?',
  },
}

/* The derived opening. A question the concept's own name and edges can support,
 * with no claim the curriculum did not make. */
function derivedQuestion(concept: Concept): string {
  const name = concept.name.trim()
  const prerequisites = concept.edges.filter((e) => e.type === 'prerequisite')
  if (prerequisites.length) return `What is ${lowerFirst(name)}, and why does it follow from what you already know?`
  return `What is ${lowerFirst(name)}?`
}

/* Acronyms and proper nouns must not be lowercased — "HCF and LCM" is not
 * "hCF and LCM", and "Newton's first law" is not "newton's first law". Only a
 * plain capitalised word is safe to lower. */
function lowerFirst(name: string): string {
  const first = name.split(/\s+/)[0] ?? ''
  const isAcronym = first.length > 1 && first === first.toUpperCase()
  const isProperNoun = /^[A-Z][a-z]+'/.test(first)
  if (isAcronym || isProperNoun) return name
  return name.charAt(0).toLowerCase() + name.slice(1)
}

export function buildConceptScene(input: {
  chapterId: string
  concept: Concept
  log: OperationLog
  variables: VariableStore
}): ConceptScene {
  const { chapterId, concept, log, variables } = input
  const authoring = AUTHORED[`${chapterId}/${concept.id}`]
  const question = authoring ? authoring.question(concept) : derivedQuestion(concept)

  // Step 1 — the board writes the question. Every scene begins by naming what
  // it is going to answer, because a board that starts drawing before the
  // learner knows the question is decorating, not teaching.
  log.append({
    chapterId,
    conceptId: concept.id,
    type: 'write',
    source: 'ai',
    payload: { role: 'question', text: question },
  })

  // Step 2 — the concept itself becomes an object on the board.
  log.append({
    chapterId,
    conceptId: concept.id,
    type: 'write',
    source: 'ai',
    payload: { role: 'concept-label', text: concept.name },
  })

  for (const declaration of authoring?.variables?.(chapterId, concept) ?? []) {
    variables.declare(declaration)
  }

  return { question, steps: log.semanticStepCount() }
}

/** Exposed so tests can assert which concepts have an authored scene without
 *  reaching into the module's private state. */
export function hasAuthoredScene(chapterId: string, conceptId: string): boolean {
  return Boolean(AUTHORED[`${chapterId}/${conceptId}`])
}
