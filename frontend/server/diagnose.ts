/**
 * D1 — DIAGNOSIS BEFORE INTERVENTION, AS COMPETING HYPOTHESES.
 *
 * "Explain it again" is the right move for exactly one of the ways
 * understanding fails, and the wrong one for the other seven. So before
 * anything is written, this guesses what went wrong -- more than one guess,
 * each with a confidence and the evidence that raised it -- and the top guess
 * chooses the strategy through `teaching.ts`'s existing map.
 *
 * CHEAP SIGNALS FIRST. Everything here is deterministic and reads only what
 * was observed: what she typed (`memory/evidence.ts`), what she may already
 * believe (`memory/misconceptions.ts`), and how many attempts this concept has
 * already had. Nothing is inferred from silence, and a learner who is
 * answering rather than pleading is diagnosed with nothing at all.
 *
 * THE LEARNER SEES NONE OF IT (decided 2026-09-02: uncertainty is invisible).
 * No confidence number, no "let me check" -- just a different explanation.
 *
 * WHY CONFIDENCES ARE SMALL. A plea alone is weak evidence: it says something
 * failed, not what. The floor case leaves the top guess under 0.7 on purpose,
 * so a later reader (the LLM in D2) can see the signals conflict rather than
 * being handed a false certainty.
 */
import { DIAGNOSES, type Diagnosis } from './teaching.ts'
import type { Evidence } from './memory/evidence.ts'

export interface Signals {
  readonly concept: string
  /** What she typed on this topic, oldest first; only pleas diagnose anything. */
  readonly evidence: readonly Evidence[]
  /** Wrong beliefs she may hold, from misconception memory. */
  readonly mayHold: readonly string[]
  /** What has already been said to her, for reference by later readers. */
  readonly taught: string
  readonly attempts: number
  readonly alreadyUsed: readonly string[]
}

export interface Hypothesis {
  readonly diagnosis: Diagnosis
  /** 0 to 1. Never 1: this is a guess from what someone typed. */
  readonly confidence: number
  /** The words that raised it, so a person can disagree with the reason. */
  readonly because: string
}

/** Phrases that say which KIND of failure it was, in a learner's own words. */
const SAYS: readonly { readonly diagnosis: Diagnosis; readonly weight: number; readonly pattern: RegExp; readonly why: string }[] = [
  { diagnosis: 'prerequisite_gap', weight: 0.5, pattern: /\b(?:what|whats|what's)\s+(?:is|are|does)\b|\bnever\s+(?:learnt|learned|did|seen)\b|\bhave\s*n[o']?t\s+(?:done|learnt|learned|seen)\b/, why: 'she asked what an earlier idea is, or said she never met it' },
  { diagnosis: 'representation_failure', weight: 0.55, pattern: /\b(?:graph|diagram|picture|chart|table|figure|drawing|axis|axes)\b/, why: 'she named the picture, not the idea' },
  { diagnosis: 'cognitive_overload', weight: 0.55, pattern: /\btoo\s+(?:much|many|fast|quick)\b|\ball\s+at\s+once\b|\bslow\s+down\b/, why: 'she said there was too much at once' },
  { diagnosis: 'language_failure', weight: 0.45, pattern: /\b(?:word|words|wording|sentence|english|jargon|term)\b|\bwhat\s+does\s+that\s+mean\b/, why: 'she named the words rather than the idea' },
  { diagnosis: 'procedural_failure', weight: 0.45, pattern: /\b(?:step|steps|how\s+do\s+i|how\s+to|method|procedure|work\s+it\s+out|solve)\b/, why: 'she asked how it is done, not what it is' },
  { diagnosis: 'causal_reasoning_failure', weight: 0.45, pattern: /\bwhy\b.*\b(?:happens?|works?|is|does)\b|\bhow\s+come\b|\bwhat\s+makes\b/, why: 'she asked why it is so, not what it is' },
  { diagnosis: 'transfer_failure', weight: 0.4, pattern: /\b(?:different|another|other)\s+(?:example|question|problem|case)\b|\bthis\s+one\s+is\s+different\b/, why: 'the idea did not carry to a new case' },
]

/** Every plea, oldest first. Only these diagnose anything. */
function pleas(evidence: readonly Evidence[]): readonly Evidence[] {
  return evidence.filter((one) => one.kind === 'plea')
}

function add(into: Map<Diagnosis, Hypothesis>, one: Hypothesis): void {
  const had = into.get(one.diagnosis)
  if (had === undefined) {
    into.set(one.diagnosis, one)
    return
  }
  /* Two signals for the same kind raise confidence without ever reaching 1. */
  into.set(one.diagnosis, {
    diagnosis: one.diagnosis,
    confidence: Math.min(0.95, had.confidence + one.confidence * 0.5),
    because: `${had.because}; ${one.because}`,
  })
}

export function diagnose(signals: Signals): readonly Hypothesis[] {
  const said = pleas(signals.evidence)
  if (said.length === 0) return []
  const ranked = new Map<Diagnosis, Hypothesis>()

  /* A belief she may hold beats every reading of the words: it is backed by
     something she did, at a beat that warned her, not by a phrase match. */
  for (const belief of signals.mayHold) {
    add(ranked, { diagnosis: 'misconception', confidence: 0.75, because: `she may hold: "${belief}"` })
  }

  const words = said.map((one) => one.said.toLowerCase()).join(' • ')
  let specific = false
  for (const rule of SAYS) {
    if (rule.pattern.test(words)) {
      specific = true
      add(ranked, { diagnosis: rule.diagnosis, confidence: rule.weight, because: rule.why })
    }
  }

  /* THE FLOOR. She said it did not land and nothing says which kind: the idea
     itself has not landed. Weak on purpose -- it is the absence of a signal. */
  add(ranked, {
    diagnosis: 'concept_gap',
    confidence: said.length >= 3 ? 0.6 : 0.35,
    because: said.length >= 3 ? `${said.length} pleas on this idea and nothing more specific said` : 'she said it did not land, without saying what',
  })

  /* Three attempts and still pleading: the shape of the explanation is the
     thing that has not worked, whatever the words said. */
  if (signals.attempts >= 3) {
    add(ranked, { diagnosis: 'representation_failure', confidence: 0.5, because: `${signals.attempts} attempts have not landed` })
  }

  /* THE ALTERNATIVES ARE NAMED EVEN WHEN NOTHING POINTS AT THEM. "I don't get
     it" is the commonest thing a learner types and the least informative, and
     the two failures that re-explaining cannot fix leave no trace in it. They
     are offered here at the confidence of a guess, so what comes next can see
     that the signals do not agree -- and so an intervention may be chosen
     BECAUSE it separates them. */
  if (!specific) {
    add(ranked, { diagnosis: 'prerequisite_gap', confidence: 0.2, because: 'nothing was said either way; something earlier may be missing' })
    add(ranked, { diagnosis: 'representation_failure', confidence: 0.2, because: 'nothing was said either way; the form may be the problem' })
  }

  return [...ranked.values()].sort((a, b) => b.confidence - a.confidence || DIAGNOSES.indexOf(a.diagnosis) - DIAGNOSES.indexOf(b.diagnosis))
}
