import React from 'react'
import { useNavigate } from 'react-router-dom'
import { store } from '../data/store'
import { Button } from '../ui/Button'
import { SUBCOL } from '../lib/format'
import { createAlmanacClient, dayRequestFor, type AlmanacClient, type DayPlan } from '../almanac/client'
import { resolveItems, type ResolvedRow } from '../almanac/resolve'
import { loadPlannedSubjects } from '../almanac/curriculum'

/**
 * Today's learning, as Almanac wrote it down.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *   This screen used to recompute the day on every render. Nothing was written
 *   anywhere, so nothing could remember yesterday, and "done" had no home. The
 *   list is now fetched from the planner, which writes each day once and never
 *   rewrites it.
 *
 *   Three consequences worth stating plainly:
 *
 *   - Work not marked done comes back tomorrow, labelled BACKLOG with the day
 *     it was first set. That label is the student's only warning that they are
 *     falling behind, so it is red and it names the date.
 *   - DONE is the only control that records completion. Almanac never marks
 *     anything itself; if it could, "never repeat a finished topic" would be a
 *     promise the student did not make.
 *   - When the planner cannot be reached this screen SAYS SO and shows no
 *     list. A locally computed fallback would look identical to a real day,
 *     and the student would work through a plan the ledger never heard of,
 *     mark it done into nothing, and find it all back tomorrow. An honest
 *     error beats a convincing fiction.
 *
 * The Misconception row below is independent of the planner and stays up even
 * when the planner is down, because it is driven by the student's own recorded
 * struggles rather than by a day plan.
 */

/** The reserve the dashboard has always held back for misconception practice. */
const MISCONCEPTION_MINUTES = 10

/** Today, in the student's OWN timezone.
 *
 *  `toISOString()` would be UTC: a student in India opening the app at 01:00
 *  would be shown the previous day's plan, and marking work done would write
 *  it against the wrong date in the ledger. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

type Load =
  | { phase: 'loading' }
  | { phase: 'ready'; day: DayPlan; rows: ResolvedRow[] }
  | { phase: 'blocked'; reason: string }

export function TodayView({
  almanac,
  today,
}: {
  /** Injected in tests. Production uses the same-origin client. */
  almanac?: AlmanacClient
  today?: string
} = {}) {
  const nav = useNavigate()
  const student = store.student()!

  const client = React.useMemo(() => almanac ?? createAlmanacClient(), [almanac])
  const date = today ?? localDate()

  const [load, setLoad] = React.useState<Load>({ phase: 'loading' })
  const [done, setDone] = React.useState<ReadonlySet<string>>(new Set())
  const [problem, setProblem] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    const prepared = dayRequestFor(student, date)
    if (!prepared.ok) {
      setLoad({ phase: 'blocked', reason: prepared.reason })
      return
    }
    void (async () => {
      /* The plan and the names it is labelled with come from the SAME
       * curriculum. The dashboard's older `data/curriculum` module describes
       * different subjects entirely -- it has a class 9 `physics`, which CBSE
       * does not -- so naming rows from it would print "Unknown" on every row
       * the planner produced. */
      const [result, subjects] = await Promise.all([
        client.day(prepared.request),
        loadPlannedSubjects(student.cls),
      ])
      if (!live) return
      if (!result.ok) {
        setLoad({ phase: 'blocked', reason: result.reason })
        return
      }
      setLoad({ phase: 'ready', day: result.day, rows: resolveItems(result.day.items, subjects) })
    })()
    return () => {
      live = false
    }
  }, [client, date, student])

  /* The ONLY writer of completion in this application. */
  const markDone = async (conceptId: string) => {
    const result = await client.markDone(student.id, conceptId)
    if (!result.ok) {
      /* Not swallowed and not retried silently. A row shown as finished when
       * the ledger never heard is the failure this whole screen guards
       * against, so the student is told instead. */
      setProblem(result.reason)
      return
    }
    setProblem(null)
    setDone((current) => new Set(current).add(conceptId))
  }

  return (
    <div className="td-wrap" data-shell="pad">
      <h1 className="td-h1">Today's learning</h1>
      <p className="td-sub">Your next learning actions for today.</p>

      {load.phase === 'ready' && (
        <div className="td-alloc">
          <span className="mono-crumb" style={{ letterSpacing: '.18em' }}>Allocated</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--foreground)' }}>
            {load.day.allocated + MISCONCEPTION_MINUTES} of {load.day.capacity} min
          </span>
          <span style={{ flex: 1, minWidth: 120, height: 4, borderRadius: 3, background: 'var(--muted)', overflow: 'hidden', display: 'flex' }}>
            {load.rows.map((row) => (
              <span
                key={row.item.conceptId}
                style={{
                  display: 'block', height: 4,
                  width: ((row.item.minutes / load.day.capacity) * 100).toFixed(2) + '%',
                  background: row.backlog ? 'var(--destructive)' : SUBCOL[row.item.subjectId] || 'var(--agabi-neutral-300)',
                }}
              />
            ))}
            <span style={{ display: 'block', height: 4, width: ((MISCONCEPTION_MINUTES / load.day.capacity) * 100).toFixed(2) + '%', background: 'var(--warning)' }} />
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)' }}>
            This day is set. Anything you don't finish moves to tomorrow.
          </span>
        </div>
      )}

      {load.phase === 'loading' && <p className="td-sub">Asking Almanac for today…</p>}

      {load.phase === 'blocked' && (
        <p
          className="td-sub"
          role="alert"
          style={{ color: 'var(--destructive)' }}
        >
          {load.reason}
        </p>
      )}

      {problem !== null && (
        <p className="td-sub" role="alert" style={{ color: 'var(--destructive)' }}>{problem}</p>
      )}

      {load.phase === 'ready' && load.rows.length === 0 && (
        <p className="td-sub">Nothing left for today. Every topic Almanac planned is marked done.</p>
      )}

      {load.phase === 'ready' && load.rows.map((row) => (
        <div
          key={row.item.conceptId}
          className="td-row"
          data-testid="day-row"
          data-concept={row.item.conceptId}
          data-backlog={row.backlog ? 'true' : 'false'}
        >
          <div className="td-subj">
            <div className="s1" style={{ color: SUBCOL[row.item.subjectId] || 'var(--agabi-neutral-300)' }}>{row.subjectName}</div>
            <div className="s2">{row.chapterName}</div>
          </div>
          <div className="td-main">
            <div className="td-concept">{row.conceptName}</div>
            <div className="td-state">
              {row.backlog && (
                /* Red, from the token layer. Law 4 forbids a colour literal
                 * anywhere outside tokens.ts, and `--destructive` already
                 * exists in the dashboard's palette, so nothing new is
                 * introduced here. */
                <span style={{ color: 'var(--destructive)', fontWeight: 600 }}>
                  Backlog — set on {row.item.carriedFrom}.{' '}
                </span>
              )}
              {done.has(row.item.conceptId) ? 'Done' : row.chapterName}
              {!row.resolved && ' · this topic is not in the curriculum this device has'}
            </div>
          </div>
          <div className="td-min">{row.item.minutes} min</div>
          <Button size="md" onClick={() => nav(`/learn/${row.item.conceptId}`)}>Start</Button>
          <Button
            size="md"
            variant="secondary"
            disabled={done.has(row.item.conceptId)}
            onClick={() => void markDone(row.item.conceptId)}
          >
            {done.has(row.item.conceptId) ? 'Done ✓' : 'Done'}
          </Button>
        </div>
      ))}

      <div className="td-row">
        <div className="td-subj"><div className="s1" style={{ color: 'var(--warning)' }}>Misconception</div></div>
        <div className="td-main">
          <div className="td-concept">Misconception practice</div>
          <div className="td-state">Practice the concept you are currently struggling with.</div>
        </div>
        <div className="td-min">{MISCONCEPTION_MINUTES} min</div>
        <Button size="md" variant="secondary" onClick={() => nav('/misconception')}>Start</Button>
      </div>
    </div>
  )
}
