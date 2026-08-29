# What the gates cannot catch

Every other document here describes something this repository checks. This one
describes what it **cannot** check, and will not be able to check by trying
harder.

It exists because of an asymmetry. A reader who meets thirty green ticks and no
list of blind spots concludes the ticks are total. They are not, and the gap
between "we check this" and "this is safe" is exactly where the expensive
failures live. An honest *we cannot detect this* is worth more than a gate that
implies we can.

Nothing below is a to-do. Each one is a limit with a reason, and where a limit
can be traded for a different one, the trade we made is written down.

---

## 1. Slow and dead are the same thing across a boundary

**The limit.** Nothing on this side of a network or process boundary can tell a
service that has died from one that is merely taking longer than expected. Any
test that claims to distinguish them is really testing a timeout.

This is not an implementation gap. Fischer, Lynch and Paterson proved in 1985
(*Impossibility of Distributed Consensus with One Faulty Process*) that no
deterministic protocol in an asynchronous system can guarantee agreement when
even one participant may fail, precisely because a slow participant and a dead
one are indistinguishable.

**What it cost here, twice.** `frontend/src/canvas/teach/engineResolver.ts`
carries the whole history in its own comment. With no deadline the POST hung
rather than failing, the chain never reached the rung behind it, and the learner
was shown nothing. It surfaced as a browser test failing on CI and passing on a
re-run, and it was written off as flake. It was never flake: **whether it passed
depended on how quickly the host refused the connection, which is a property of
the machine and not of the code.**

The first fix set the deadline to ten seconds, which is exactly the budget the
caller had — so the rung burned all of it and the rungs behind it still never
ran. Same symptom, second cause.

**The trade we made.** Three seconds, chosen as a fraction of someone else's
budget rather than as a guess about the engine. That does not detect death; it
decides when waiting stops being useful. A rung slower than three seconds has
already failed the learner whether or not it eventually replies.

**Therefore:** a green run proves the deadline fired correctly. It never proves
the service was alive.

---

## 2. A confident wrong answer scores as a grounded one

**The limit.** Grounding, citation and faithfulness checks measure whether an
answer is *consistent with* the material it was given. They cannot measure
whether it is *true*, and a model that is fluently, specifically wrong inside
the shape of the source material passes every one of them.

**Why it is not fixable from here.** The check would need a source of truth
better than the source we are checking against. If we had that, we would be
teaching from it.

**What is done instead, and it is not a detection.** The lesson's own resolver
runs first and can only re-present material already on the screen, so it cannot
invent — and `chart`, `flow` and `simulation` stay closed to the model
entirely, because an invented number drawn as an axis is a lie a student has no
way to detect. Answers carry `writtenBy` so a reader knows whose sentences they
are.

**Therefore:** provenance is shown because correctness cannot be proved.

---

## 3. Understanding is not observable through a text box

Three separate impossibilities, all of them in `turn.ts`:

**A learner who misunderstands but answers correctly.** They repeated a phrase,
guessed, or were right for the wrong reason. Nothing distinguishes that from
understanding, because the only evidence is the sentence they typed.

**A learner who understands but answers "wrongly".** `classifyTurn` decides
whether a submission is a question or an answer from a question mark, an
opening word, or a plea. Its own comment names the case it cannot see: *"That
is why it rises"* is an answer, and scanning anywhere for "why" would send it to
the doubt resolver and the beat would never move. The heuristic is good. It is
still a heuristic about English written by someone under pressure.

**Whether the teaching worked at all.** `strugglingAfter` fires on two empty
submissions, three questions, or two questions per beat. Those are proxies for
struggle. A learner who quietly closes the tab produces no signal whatsoever,
and is the most common failure this product has.

**Therefore:** every "adaptive" claim in this codebase is a claim about
*observed turns*, never about comprehension. Nothing in the UI says
"difficulty", and that wording is deliberate.

---

## 4. A structural gate cannot see a content defect

**The limit.** A gate that checks shape passes anything with the right shape.

**Measured here.** 569 of 4,564 shipped curriculum concepts were things like
`"Since"`, `"Here"`, `"Find n"` — solved-example fragments scraped from
worked-problem books. **Every one passed the provenance gate**, because
`"Since"` has a perfectly good page number, and the minimum-concepts check is a
*count*, and rubbish counts.

**The trade we made.** `frontend/scripts/curriculum/concept-quality.mjs`, imported
by both the builder and the gate, so filtering happens at one chokepoint. That
closes this class. It does not close the category: the next content defect with
valid structure will pass too.

**Therefore:** ask what would have to be true for a gate to FAIL, not whether it
passed.

---

## 5. A gate is scoped by whoever wrote it

**The limit.** A gate measures the area its author pointed it at. Code outside
that area is not reported as unmeasured — it is not reported at all, which reads
identically to "measured and fine".

**Measured here.** The Python coverage gate required 95% and, at the time it was
written, measured a directory of a few dozen statements while tens of thousands
sat outside its scope. It was green throughout. A reachability gate reports PASS
on modules nothing loads, because it measures *inside* the areas it was given.

**Therefore:** a passing gate is evidence about its own scope and about nothing
else. Read the scope before reading the verdict.

---

## 6. Storage is a convenience and can never be a guarantee

`frontend/src/canvas/teach/remembered.ts` keeps a draft, a place in the lesson,
and an unanswered question. It can vanish at any moment and there is no way to
know it will: a private window, a browser set to block site data, an eviction
under memory pressure, or an accessor that throws rather than returning nothing.

Every read and write is wrapped, and every failure degrades to remembering
nothing. That is the correct behaviour and it is also the admission: **the
product cannot promise a learner that their words survive.** It can only promise
that losing them will never take the lesson down.

---

## How to use this file

Add to it when you find a limit that is real, and delete from it when a limit
turns out to have been laziness. The test for belonging here is whether you can
say *what evidence would be required* to catch the thing, and show that the
evidence does not exist.

"We have not got round to it" belongs in `.agent/deferred.md`, not here. Mixing
the two is how a genuine impossibility gets used as cover for an unwritten test.
