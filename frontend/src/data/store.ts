/* Learning OS — data layer. Faithful port of the approved mockup's
 * domain/data-layer.js (kept verbatim in reference/). The UI never holds
 * learner data: it reads from the store and writes through it. The store
 * talks to ONE adapter — swap LocalAdapter for Firebase/Supabase, keep the UI.
 * WEAKNESS IS NOT STORED: raw signals are; "weak" is a policy hook. */
import CURRICULUM from './curriculum'
import type { Adapter, DB, Student, ProgressRecord, ConceptState, Chapter, Concept, Subject, TodayPlan, PlanItem, PlanDraft, ActivityEvent } from '../types'

const KEY = 'learning-os/v2'
const CHAN = 'learning-os-sync'
const now = () => Date.now()
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

export class LocalAdapter implements Adapter {
  private chan: BroadcastChannel | null
  private subs: Array<(db: DB) => void> = []
  constructor() {
    this.chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHAN) : null
    if (this.chan) this.chan.onmessage = (e) => {
      if (!e.data || e.data.k !== KEY) return
      this.subs.forEach((cb) => cb(e.data.db))
    }
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY || !e.newValue) return
      try { const db = JSON.parse(e.newValue); this.subs.forEach((cb) => cb(db)) } catch { /* ignore */ }
    })
  }
  load() {
    try { const raw = localStorage.getItem(KEY); return Promise.resolve(raw ? JSON.parse(raw) as DB : null) }
    catch { return Promise.resolve(null) }
  }
  subscribe(cb: (db: DB) => void) {
    this.subs.push(cb)
    return () => { this.subs = this.subs.filter((f) => f !== cb) }
  }
  commit(db: DB) {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* storage full/blocked */ }
    if (this.chan) { try { this.chan.postMessage({ k: KEY, db }) } catch { /* closed */ } }
    return Promise.resolve()
  }
  close() { if (this.chan) this.chan.close() }
}

/* ---------------- derivation: today's plan (verbatim logic) --------------- */
function planFor(store: Store, student: Student | null): TodayPlan {
  if (!student) return { items: [], allocated: 0, capacity: 0, reserve: 10, usable: 0 }
  const subs = CURRICULUM.subjectsFor(student.cls, student.stream)
    .filter((s) => student.subjects.indexOf(s.id) >= 0)
  const cap0 = student.minutes || 0
  if (!subs.length) return { items: [], allocated: 0, capacity: cap0, reserve: 10, usable: Math.max(0, cap0 - 10) }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const daysLeft = (sid: string) => {
    const d = student.deadlines && student.deadlines[sid]
    if (!d) return 999
    return Math.max(0, Math.round((new Date(d).getTime() - today.getTime()) / 86400000))
  }

  // HARD RULE: every selected subject gets at least one concept.
  const picks: PlanItem[] = []
  subs.forEach((sb) => {
    let found: PlanItem | null = null
    for (let ci = 0; ci < sb.chapters.length && !found; ci++) {
      const ch = sb.chapters[ci]
      for (let i = 0; i < ch.concepts.length && !found; i++) {
        const c = ch.concepts[i]
        const st = store.stateOf(ch.id, c.id)
        if (st === 'completed' || st === 'mastered') continue
        if (!store.prereqsMet(ch, c)) continue                 // adaptive: respect the graph
        found = { subject: sb, chapter: ch, concept: c, minutes: 0, daysLeft: 0 }
      }
    }
    if (!found) {                                              // subject finished — offer review
      const last = sb.chapters[sb.chapters.length - 1]
      found = { subject: sb, chapter: last, concept: last.concepts[last.concepts.length - 1], minutes: 0, daysLeft: 0, review: true }
    }
    found.daysLeft = daysLeft(sb.id)
    found.resume = store.stateOf(found.chapter.id, found.concept.id) === 'inProgress'
    picks.push(found)
  })

  // adaptive ordering: in-progress first, then nearest deadline
  picks.sort((a, b) => {
    if (!!a.resume !== !!b.resume) return a.resume ? -1 : 1
    return a.daysLeft - b.daysLeft
  })

  /* Allocate within TOTAL daily capacity, never over. The misconception-practice
   * reserve is held here so capacity arithmetic lives in exactly one place. */
  const cap = student.minutes || 120
  const reserve = 10
  const usable = Math.max(10, cap - reserve)
  const base = Math.floor(usable / picks.length)
  let alloc = 0
  picks.forEach((p, i) => {
    let want = Math.min(p.concept.minutes, base)
    if (i === picks.length - 1) want = Math.min(p.concept.minutes, usable - alloc)
    p.minutes = Math.max(10, want)
    alloc += p.minutes
  })
  if (alloc > usable) { picks[picks.length - 1].minutes -= (alloc - usable); alloc = usable }

  /* Fill remaining capacity round-robin — spare capacity buys MORE concepts,
   * never longer ones (durations are intrinsic). */
  const taken: Record<string, boolean> = {}
  picks.forEach((p) => { taken[p.chapter.id + '/' + p.concept.id] = true })
  const nextFor = (sb: Subject): PlanItem | null => {
    for (let ci = 0; ci < sb.chapters.length; ci++) {
      const ch = sb.chapters[ci]
      for (let i = 0; i < ch.concepts.length; i++) {
        const c = ch.concepts[i], k = ch.id + '/' + c.id
        if (taken[k]) continue
        const s2 = store.stateOf(ch.id, c.id)
        if (s2 === 'completed' || s2 === 'mastered') continue
        if (!store.prereqsMet(ch, c)) continue
        return { subject: sb, chapter: ch, concept: c, minutes: 0, daysLeft: 0 }
      }
    }
    return null
  }
  const order = picks.map((p) => p.subject)
  let added = true, guard = 0
  while (added && alloc < usable && guard++ < 200) {
    added = false
    for (let oi = 0; oi < order.length; oi++) {
      if (alloc >= usable) break
      const cand = nextFor(order[oi])
      if (!cand) continue
      const mins = Math.min(cand.concept.minutes, usable - alloc)
      if (mins < 10) continue                                  // too small a slice to be useful
      cand.minutes = mins
      cand.daysLeft = daysLeft(cand.subject.id)
      cand.resume = store.stateOf(cand.chapter.id, cand.concept.id) === 'inProgress'
      cand.fill = true
      taken[cand.chapter.id + '/' + cand.concept.id] = true
      picks.push(cand)
      alloc += mins
      added = true
    }
  }
  return { items: picks, allocated: alloc, capacity: cap, reserve, usable }
}

/* --------------------------------- store ---------------------------------- */
export class Store {
  db: DB | null = null
  adapter: Adapter | null = null
  currentId: string | null = null
  /* Monotonic write counter: every memo keys off it, so it must be a real
   * number from construction (undefined++ is NaN and NaN||0 freezes caches). */
  rev = 0
  private subs: Array<(reason: string) => void> = []
  private unsub: (() => void) | null = null
  private booting = false
  private planKey = ''; private planVal: TodayPlan | null = null
  private rollKey = ''; private rollVal: Rollups | null = null
  /* Replace to define "weak". Must return null or { reason, since } — never a
   * number the UI can't defend. */
  weaknessHook: (rec: ReturnType<Store['observed']>, concept?: Concept) => { reason: string; since: number } | null = () => null

  init(adapter?: Adapter): Promise<Store> {
    if (this.booting || this.adapter) return Promise.resolve(this)
    this.booting = true
    this.adapter = adapter || new LocalAdapter()
    return this.adapter.load().then((db) => {
      this.db = db && db.students ? db : seed()
      this.currentId = this.db.currentId || Object.keys(this.db.students)[0]
      this.unsub = this.adapter!.subscribe((remote) => {
        if (!remote || !remote.students) return
        this.db = remote                                        // remote wins; UI re-renders
        this.bump()
        if (!this.db.students[this.currentId!]) this.currentId = Object.keys(this.db.students)[0]
        this.emit('remote')
      })
      this.emit('ready')
      return this
    })
  }
  close() { if (this.unsub) this.unsub(); if (this.adapter) this.adapter.close() }

  emit(reason: string) {
    this.subs.forEach((cb) => {
      try { cb(reason) }
      catch (e: any) {
        /* A throwing subscriber must not take the store down — and must not
         * vanish into a bare "{}" log either. */
        console.error('[store] subscriber threw on emit(' + reason + '): ' + (e && (e.message || String(e)) || 'unknown'))
      }
    })
  }
  subscribe(cb: (reason: string) => void) {
    this.subs.push(cb)
    return () => { this.subs = this.subs.filter((f) => f !== cb) }
  }
  bump() { this.rev = (typeof this.rev === 'number' && isFinite(this.rev) ? this.rev : 0) + 1; return this.rev }

  save(path: string | null, value?: unknown) {
    if (!this.db || !this.adapter) return
    this.bump()
    this.db.currentId = this.currentId
    if (this.adapter.commitPath && path) { this.adapter.commitPath(path, value); this.adapter.commit(this.db) }
    else this.adapter.commit(this.db)
    this.emit('local')
  }

  /* ------------------------------- students ------------------------------ */
  students() {
    const db = this.db!
    return Object.keys(db.students).map((id) => {
      const s = db.students[id]
      return {
        id, name: s.name, hue: s.avatarHue, cls: s.cls,
        initials: s.name.split(' ').map((w) => w[0]).join('').slice(0, 2),
        current: id === this.currentId,
        subjectCount: (s.subjects || []).length,
        done: this.countDone(id)
      }
    })
  }
  student(): Student | null { return this.db ? (this.db.students[this.currentId!] || null) : null }
  switchStudent(id: string) {
    if (!this.db || !this.db.students[id]) return
    this.currentId = id
    this.bump()
    this.db.students[id].lastActiveAt = now()
    this.save('students/' + id + '/lastActiveAt', this.db.students[id].lastActiveAt)
  }
  hasPlan() {
    const s = this.student()
    return !!(s && s.cls && s.subjects && s.subjects.length && s.minutes)
  }
  savePlan(plan: PlanDraft) {
    const id = this.currentId!, s = this.db!.students[id]
    s.cls = plan.cls; s.stream = plan.stream || null
    s.subjects = plan.subjects.slice(); s.minutes = plan.minutes
    s.deadlines = clone(plan.deadlines || {})
    s.lastActiveAt = now()
    this.save('students/' + id, s)
  }

  /* ------------------------------- progress ------------------------------ */
  rec(chId: string, cId: string, sid?: string): ProgressRecord | null {
    const p = this.db!.progress[sid || this.currentId!]
    return (p && p[chId] && p[chId][cId]) || null
  }
  stateOf(chId: string, cId: string): ConceptState {
    const r = this.rec(chId, cId)
    return r ? r.state : 'notStarted'
  }
  sourceOf(chId: string, cId: string) { const r = this.rec(chId, cId); return r ? r.source : null }
  observed(chId: string, cId: string) {
    const r = this.rec(chId, cId)
    return {
      attempts: r ? r.attempts || 0 : 0, hints: r ? r.hints || 0 : 0,
      revisits: r ? r.revisits || 0 : 0, seconds: r ? r.secondsSpent || 0 : 0,
      firstSeenAt: r ? r.firstSeenAt : null, lastTouchedAt: r ? r.lastTouchedAt : null
    }
  }
  weakness(chId: string, cId: string, concept?: Concept) { return this.weaknessHook(this.observed(chId, cId), concept) || null }

  private ensure(chId: string, cId: string): ProgressRecord {
    const id = this.currentId!
    const prog = this.db!.progress
    if (!prog[id]) prog[id] = {}
    if (!prog[id][chId]) prog[id][chId] = {}
    const m = prog[id][chId]
    if (!m[cId]) m[cId] = {
      state: 'notStarted', source: null, attempts: 0, hints: 0, revisits: 0,
      secondsSpent: 0, firstSeenAt: now(), lastTouchedAt: now(),
      completedAt: null, declaredAt: null, prevState: null
    }
    return m[cId]
  }

  setConceptState(chId: string, cId: string, state: ConceptState, source?: ProgressRecord['source']) {
    const r = this.ensure(chId, cId), from = r.state
    if (from === 'completed' && state === 'inProgress') r.revisits = (r.revisits || 0) + 1
    r.prevState = from
    r.state = state
    r.source = source || 'system'
    r.lastTouchedAt = now()
    if (state === 'completed' || state === 'mastered') r.completedAt = now()
    this.log({ type: 'state', chapterId: chId, conceptId: cId, from, to: state })
    this.save('progress/' + this.currentId + '/' + chId + '/' + cId, r)
  }
  touch(chId: string, cId: string, d: { attempts?: number; hints?: number; seconds?: number }) {
    const r = this.ensure(chId, cId)
    if (d.attempts) r.attempts += d.attempts
    if (d.hints) r.hints += d.hints
    if (d.seconds) r.secondsSpent += d.seconds
    if (r.state === 'notStarted') { r.prevState = 'notStarted'; r.state = 'inProgress'; r.source = 'system' }
    r.lastTouchedAt = now()
    this.save('progress/' + this.currentId + '/' + chId + '/' + cId, r)
  }
  /* Manual mastery is a DECLARATION — never conflated with observed evidence. */
  declare(chId: string, cId: string) {
    const r = this.ensure(chId, cId)
    r.prevState = r.state
    r.state = 'mastered'
    r.source = 'declared'
    r.declaredAt = now()
    r.lastTouchedAt = now()
    this.log({ type: 'declare', chapterId: chId, conceptId: cId, from: r.prevState || undefined, to: 'mastered' })
    this.save('progress/' + this.currentId + '/' + chId + '/' + cId, r)
  }
  undeclare(chId: string, cId: string) {
    const r = this.rec(chId, cId)
    if (!r) return
    const back = r.prevState || 'notStarted'
    r.state = back
    r.source = back === 'notStarted' ? null : 'system'
    r.declaredAt = null
    r.lastTouchedAt = now()
    this.log({ type: 'undeclare', chapterId: chId, conceptId: cId, from: 'mastered', to: back })
    this.save('progress/' + this.currentId + '/' + chId + '/' + cId, r)
  }

  log(e: ActivityEvent) {
    const id = this.currentId!
    const act = this.db!.activity
    if (!act[id]) act[id] = []
    e.at = now()
    act[id].unshift(e)
    act[id] = act[id].slice(0, 60)
  }
  activity(n?: number) { return (this.db!.activity[this.currentId!] || []).slice(0, n || 8) }
  lastTouched() {
    const p = this.db!.progress[this.currentId!] || {}
    let best: { at: number; chapterId: string; conceptId: string; state: ConceptState } | null = null
    Object.keys(p).forEach((chId) => Object.keys(p[chId]).forEach((cId) => {
      const r = p[chId][cId]
      if (!r.lastTouchedAt) return
      if (!best || r.lastTouchedAt > best.at) best = { at: r.lastTouchedAt, chapterId: chId, conceptId: cId, state: r.state }
    }))
    return best
  }

  /* ------------------------------ derivations ---------------------------- */
  prereqsMet(chapter: Chapter, concept: Concept) {
    return (concept.deps || []).every((d) => {
      const st = this.stateOf(chapter.id, d)
      return st === 'completed' || st === 'mastered'
    })
  }
  blockingDeps(chapter: Chapter, concept: Concept) {
    return (concept.deps || []).filter((d) => {
      const st = this.stateOf(chapter.id, d)
      return st !== 'completed' && st !== 'mastered'
    })
  }
  countDone(sid?: string) {
    const p = this.db!.progress[sid || this.currentId!] || {}
    let n = 0
    Object.keys(p).forEach((ch) => Object.keys(p[ch]).forEach((c) => {
      const st = p[ch][c].state
      if (st === 'completed' || st === 'mastered') n++
    }))
    return n
  }
  plan(): TodayPlan {
    const key = this.currentId + '@' + this.rev
    if (this.planKey !== key) { this.planKey = key; this.planVal = planFor(this, this.student()) }
    return this.planVal!
  }
  /* One pass produces every sidebar count (was ~190 stateOf calls/interaction). */
  rollups(): Rollups {
    const key = this.currentId + '@' + this.rev
    if (this.rollKey === key && this.rollVal) return this.rollVal
    const s = this.student()
    const out: Rollups = { chapters: {}, subjects: {} }
    if (s && s.cls) {
      const prog = this.db!.progress[this.currentId!] || {}
      CURRICULUM.subjectsFor(s.cls, s.stream).forEach((sb) => {
        let sDone = 0, sTot = 0
        sb.chapters.forEach((ch) => {
          const m = prog[ch.id] || {}
          let done = 0, inProg = 0
          ch.concepts.forEach((c) => {
            const r = m[c.id], st = r ? r.state : 'notStarted'
            if (st === 'completed' || st === 'mastered') done++
            else if (st === 'inProgress') inProg++
          })
          out.chapters[ch.id] = { done, total: ch.concepts.length, inProgress: inProg, complete: done === ch.concepts.length }
          sDone += done; sTot += ch.concepts.length
        })
        out.subjects[sb.id] = { done: sDone, total: sTot }
      })
    }
    this.rollKey = key; this.rollVal = out
    return out
  }
}
export interface Rollups {
  chapters: Record<string, { done: number; total: number; inProgress: number; complete: boolean }>
  subjects: Record<string, { done: number; total: number }>
}

/* ---------------------------------- seed ----------------------------------
 * Development data only (README: Mock data). Reproduces the approved mockup's
 * demo state exactly: Arya (55% through Maths+Physics), Ishan (18%, three
 * subjects), and an empty "New learner" that lands in setup. */
function seed(): DB {
  const db: DB = { students: {}, progress: {}, activity: {}, currentId: null }
  const people = [
    { id: 'stu_arya', name: 'Arya Menon', hue: 168, cls: 'Class 10', subjects: ['mathematics', 'physics'], minutes: 120, depth: 0.55 },
    { id: 'stu_ishan', name: 'Ishan Rao', hue: 232, cls: 'Class 10', subjects: ['mathematics', 'physics', 'chemistry'], minutes: 150, depth: 0.18 },
    { id: 'stu_new', name: 'New learner', hue: 40, cls: null as string | null, subjects: [] as string[], minutes: null as number | null, depth: 0 }
  ]
  const t = now()
  people.forEach((p, pi) => {
    db.students[p.id] = {
      id: p.id, name: p.name, avatarHue: p.hue, cls: p.cls, stream: null,
      subjects: p.subjects.slice(), minutes: p.minutes,
      deadlines: p.cls ? { mathematics: '2027-02-20', physics: '2027-01-15', chemistry: '2027-03-05' } : {},
      createdAt: t - 86400000 * 40, lastActiveAt: t - pi * 3600000
    }
    db.progress[p.id] = {}
    db.activity[p.id] = []
    if (!p.depth) return
    // fill forward through the graph so prerequisites always hold
    CURRICULUM.subjectsFor(p.cls, null).filter((s) => p.subjects.indexOf(s.id) >= 0).forEach((sb) => {
      let quota = Math.round(sb.chapters.reduce((n, c) => n + c.concepts.length, 0) * p.depth)
      sb.chapters.forEach((ch) => {
        db.progress[p.id][ch.id] = db.progress[p.id][ch.id] || {}
        ch.concepts.forEach((c) => {
          if (quota <= 0) return
          quota--
          const mastered = quota % 3 === 0
          db.progress[p.id][ch.id][c.id] = {
            state: quota === 0 ? 'inProgress' : (mastered ? 'mastered' : 'completed'),
            source: 'system',
            attempts: 1 + (c.name.length % 3), hints: c.name.length % 2, revisits: 0,
            secondsSpent: c.minutes * 60 - 240,
            firstSeenAt: t - 86400000 * 12, lastTouchedAt: t - 3600000 * (quota + 1),
            completedAt: quota === 0 ? null : t - 3600000 * (quota + 1),
            declaredAt: null, prevState: 'inProgress'
          }
        })
      })
    })
  })
  db.currentId = people[0].id
  return db
}

/* App-wide singleton, mirroring the mockup's window.LEARNING_STORE. */
export const store = new Store()
