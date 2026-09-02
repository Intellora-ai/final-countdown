import { describe, expect, it } from 'vitest'

import { prerequisitesOf, topicNamed } from './topic'
import type { SubjectLike } from './resolve'

/**
 * ONE canvas per TOPIC. A topic's id is the canvas's address, and the canvas
 * needs the topic's NAME to teach it -- sending the id would ask the model to
 * teach a database key. This is the one reader that turns the address back
 * into the words, and it answers null rather than guessing, so the screen can
 * say "this device does not know a topic called x" instead of teaching x.
 */

const subjects: readonly SubjectLike[] = [
  {
    id: 'mathematics',
    name: 'Mathematics',
    chapters: [
      {
        id: 'real-numbers',
        name: 'Real Numbers',
        concepts: [
          { id: 'fta', name: 'Fundamental Theorem of Arithmetic' },
          { id: 'irrational', name: 'Proofs of irrationality' },
        ],
      },
    ],
  },
  {
    id: 'science',
    name: 'Science',
    chapters: [{ id: 'life', name: 'Life Processes', concepts: [{ id: 'photosynthesis', name: 'Photosynthesis' }] }],
  },
]

describe('naming the topic a canvas is for', () => {
  it('finds a topic by id and names its chapter and subject', () => {
    expect(topicNamed(subjects, 'photosynthesis')).toEqual({
      id: 'photosynthesis',
      name: 'Photosynthesis',
      chapter: 'Life Processes',
      subject: 'Science',
    })
  })

  it('is null for an id no subject holds, so the screen can say so instead of guessing', () => {
    expect(topicNamed(subjects, 'nope')).toBeNull()
    expect(topicNamed(subjects, '')).toBeNull()
  })

  it('matches only a topic id -- never a name, a chapter id or a subject id', () => {
    expect(topicNamed(subjects, 'Photosynthesis')).toBeNull()
    expect(topicNamed(subjects, 'life')).toBeNull()
    expect(topicNamed(subjects, 'science')).toBeNull()
  })
})

describe('D3 — what the curriculum says comes first, scoped to its own subject', () => {
  /* The curriculum carries 506-1252 real `deps` edges per class. A physics
     prerequisite never applies to a biology concept, so a dep id that does not
     resolve INSIDE this topic's own subject is dropped, not guessed at. */
  const physics = {
    id: 'physics',
    name: 'Physics',
    chapters: [
      {
        id: 'units',
        name: 'Units',
        concepts: [
          { id: 'units--systems', name: 'Systems of units', deps: [] },
          { id: 'units--dimensions', name: 'Dimensional analysis', deps: ['units--systems', 'biology--cells'] },
        ],
      },
    ],
  }
  const biology = {
    id: 'biology',
    name: 'Biology',
    chapters: [{ id: 'cell', name: 'The cell', concepts: [{ id: 'biology--cells', name: 'Cells', deps: [] }] }],
  }

  it('names each listed prerequisite that this subject actually has', () => {
    expect(prerequisitesOf([physics, biology], 'units--dimensions')).toEqual([
      { id: 'units--systems', name: 'Systems of units' },
    ])
  })

  it('a topic with no listed prerequisite has none, and none is invented', () => {
    expect(prerequisitesOf([physics, biology], 'units--systems')).toEqual([])
    expect(prerequisitesOf([physics, biology], 'no-such-topic')).toEqual([])
  })
})
