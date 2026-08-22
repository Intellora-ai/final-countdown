/* THE SCENARIO GALLERY — every board this build can teach, in one place.
 *
 * This view renders LINKS and nothing else. It does not validate a board, does
 * not compile a plan, does not mount a block. That restraint is the point:
 * the gallery must not become a second way to render a lesson, because then
 * there would be two renderers to keep honest instead of one. Choosing a
 * scenario navigates to /canvas?fixture=<id>, and the board takes over through
 * exactly the path it always uses.
 *
 * It also means opening the gallery costs nothing: no fixture module is
 * fetched until a learner picks one, which is the same loading discipline the
 * lesson itself keeps.
 */
import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FIXTURES, REQUIRED_SCENARIOS, type FixtureEntry, type FixtureSubject, type ScenarioTag } from './fixtures'

const SUBJECT_LABELS: Record<FixtureSubject, string> = {
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  history: 'History',
  geography: 'Geography',
  economics: 'Economics',
  data: 'Data interpretation',
  none: 'Validator behaviour',
}

/* Subjects first, in teaching order; the validator demonstrations last,
 * because they are about the board rather than about a subject. */
const SUBJECT_ORDER: FixtureSubject[] = [
  'mathematics', 'physics', 'chemistry', 'biology',
  'history', 'geography', 'economics', 'data', 'none',
]

const SCENARIO_LABELS: Partial<Record<ScenarioTag, string>> = {
  'explanation-only': 'explanation only',
  'explanation-equation': 'explanation + equation',
  'table-heavy': 'table-heavy',
  'pie-chart': 'pie chart',
  'bar-chart': 'bar chart',
  'line-chart': 'line chart',
  'multiple-connected-blocks': 'connected blocks',
  'empty-content': 'empty content',
  'long-text': 'long text',
  'long-labels': 'long labels',
  'large-tables': 'large table',
  'invalid-chart-values': 'invalid chart values',
  'unsupported-block-types': 'unsupported block types',
  'broken-connectors': 'broken connectors',
  'mobile-layout': 'mobile layout',
  'reduced-motion': 'reduced motion',
  'progressive-teaching': 'progressive teaching',
}

const scenarioLabel = (tag: ScenarioTag) => SCENARIO_LABELS[tag] ?? tag

/* What the badge says, in the learner's terms rather than the validator's. */
const EXPECTATION_TEXT: Record<FixtureEntry['expect'], string> = {
  ok: 'Renders cleanly',
  repaired: 'Repairs visibly',
  failed: 'Refused at the door',
}

export function GalleryView() {
  const groups = useMemo(() => {
    return SUBJECT_ORDER
      .map((subject) => [subject, FIXTURES.filter((f) => f.subject === subject)] as const)
      .filter(([, entries]) => entries.length > 0)
  }, [])

  const covered = useMemo(() => new Set(FIXTURES.flatMap((f) => f.scenarios)), [])
  const missing = REQUIRED_SCENARIOS.filter((s) => !covered.has(s))

  return (
    <div data-board="gallery">
      <header data-board="gallery-head">
        <p data-board="gallery-eyebrow">SCENARIO GALLERY</p>
        <h1 data-board="gallery-title">Every board this build can teach</h1>
        <p data-board="gallery-lede">
          {FIXTURES.length} scenarios across {groups.length - (groups.some(([s]) => s === 'none') ? 1 : 0)} subjects.
          Each one opens in the same board, through the same validator and the same renderer.
        </p>
        {/* Stated on the page rather than only in a test: if coverage ever
          * regresses, it is visible to whoever opens the gallery. */}
        {missing.length > 0 && (
          <p data-board="gallery-warning" role="status">
            {missing.length} required scenario{missing.length === 1 ? '' : 's'} not yet covered:{' '}
            {missing.map(scenarioLabel).join(', ')}.
          </p>
        )}
      </header>

      {groups.map(([subject, entries]) => (
        <section key={subject} data-board="gallery-group" aria-labelledby={`gallery-${subject}`}>
          <h2 id={`gallery-${subject}`} data-board="gallery-group-title">{SUBJECT_LABELS[subject]}</h2>
          <ul data-board="gallery-list">
            {entries.map((f) => (
              <li key={f.id}>
                <Link to={`/canvas?fixture=${encodeURIComponent(f.id)}`} data-board="gallery-card">
                  <span data-board="gallery-card-label">{f.label}</span>
                  <span data-board="gallery-card-eyebrow">{f.eyebrow || SUBJECT_LABELS[f.subject]}</span>
                  <span data-board="gallery-badge" data-expect={f.expect}>
                    {EXPECTATION_TEXT[f.expect]}
                  </span>
                  {f.scenarios.length > 0 && (
                    <span data-board="gallery-tags">
                      {f.scenarios.map((s) => (
                        <span key={s} data-board="gallery-tag">{scenarioLabel(s)}</span>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
