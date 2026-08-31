# The universal teaching patterns

Extracted from two worked reference explanations — one on **logarithms**, one on
**sustainable development and organic farming**. Deliberately two subjects, one
mathematical and one not, because a pattern that only appears in one of them is
a habit of that subject rather than a rule of teaching.

Every pattern below is stated **without reference to any subject**, then shown
in at least two. If a pattern could not be stated that way, it was dropped.

---

## The two findings that drive everything else

### 1. Simplify the PATH, never the DESTINATION

The first canvas logarithms lesson was *simple but shallow*. It avoided the word
"exponent" — correct — and then never taught the product law, the domain
restrictions, or a single derivation. It simplified the path **and deleted most
of the subject**, and it passed every check, because nothing measured depth.

Both references keep plain language and full rigour side by side. They never
drop a technical term; they refuse to use one **before it is earned**.

### 2. A rule that is asserted is a rule that will be forgotten

Both references *earn* almost everything. The logarithm reference derives the
product law from the exponent laws and then says the quiet part out loud: *"you
are not memorising a random rule."* The farming reference derives its
conclusion through five numbered steps, each following from the last.

> **A stated rule with no justification and no check is an assertion.**

---

## The patterns

Marked **NEW** where the canvas had no way to express them before this work.

### A. Opening — reach the learner before teaching them

| # | Pattern (universal) | Subject A | Subject B |
|---|---|---|---|
| 1 | The title promises **a destination**, not a topic | "from zero to problem-solving" | "how production continues without destroying the resource base" |
| 2 | The first line states the **method**, never a greeting | "so you can derive the rules" | "the central question changes from … to …" |
| 3 | **Start on ground the learner already holds** — **NEW** | "Look at 2³=8. You already know the base is 2" | "Agriculture depends directly on nature" |
| 4 | Turn that known thing into **the question** | "2 to what power gives 8?" | "how do we increase production *without* destroying it?" |
| 5 | The definition arrives as the **answer** to that question | therefore log₂8 = 3 | therefore *sustainable development* means… |

**Pattern 3 is the biggest gap the canvas had.** Every lesson began at the
definition, which means every lesson began on unfamiliar ground.

### B. The core statement — one thing, said exactly

| # | Pattern (universal) | Subject A | Subject B |
|---|---|---|---|
| 6 | **One canonical statement**, marked as the centre | log_a b = c ⟺ a^c = b | the one-sentence definition of sustainability |
| 7 | **Say how to read the notation aloud** — **NEW** | "log base 2 of 8" | (expands an abbreviation on first use) |
| 8 | **Several instances at once**, same shape, different content | 81, 125, 32 | soil · groundwater · biodiversity |
| 9 | **Name every part** of the thing | base · argument · value | present needs · future capacity |
| 10 | Give one **repeatable mental move** | "ask: what exponent?" | "ask: what does this cost the future?" |

### C. Motivation — why the idea has to exist

| # | Pattern (universal) | Subject A | Subject B |
|---|---|---|---|
| 11 | Show the easy case, then the case that **breaks** it | 2ˣ=16 is fine; 2ˣ=20 is not | production rises; the resource base falls |
| 12 | The concept exists **to fix that break** | so x = log₂20 | so: sustainable development |
| 13 | **Parallel to something already understood** | +/− · ×/÷ · powers/logs | a bank balance you spend faster than it refills |

### D. Rules — earn them

| # | Pattern (universal) | Subject A | Subject B |
|---|---|---|---|
| 14 | **Justify the rule; never assert it** — **NEW** | full proof of the product law | five-step chain to the conclusion |
| 15 | Justify from something **more primitive** | the exponent laws | ecological dependence |
| 16 | Say the **payoff** of having justified it | "not a random rule" | "not simply chemicals = bad" |
| 17 | **A check immediately after** — numbers, or a case | 3+2 = 5, and 8·4 = 32 ✓ | the labour-abundance case |
| 18 | Show pairs that **undo each other** | log_a(aˣ)=x · a^(log_a x)=x | degrade ↔ restore |

### E. Boundaries — where it stops being true

| # | Pattern (universal) | Subject A | Subject B |
|---|---|---|---|
| 19 | **State the restrictions explicitly** — **NEW** | a>0, a≠1, b>0 | organic ≠ automatically better economically |
| 20 | Show what is therefore **invalid** | log₂(−5), log₁7 | lower initial yields, infrastructure gaps |
| 21 | **Derive** the special cases, don't list them | a⁰=1 ⇒ log_a1=0 | why transition hurts small farmers |
| 22 | Cover the cases people **actually trip on** | negative and fractional logs | "environmental advantage ≠ profit" |

### F. Using it — from knowing to doing

| # | Pattern (universal) | Subject A | Subject B |
|---|---|---|---|
| 23 | **Escalate** from understanding to applying | "now we *use* logarithms" | from description to policy trade-off |
| 24 | **Worked solutions, one step per line** — **NEW** | x−3=2⁴ → x−3=16 → x=19 | Step 1 ↓ Step 2 ↓ … Step 5 |
| 25 | Check the **conditions inside** the solution | "x−3>0, so x>3 ✓" | "but only where infrastructure exists" |
| 26 | **The trap last, disproved concretely** — **NEW** | log(2+3)=log5 but log2+log3=log6 | "organic is always better" — refuted by yield data |

---

## What this changed in the software

Six patterns needed structure that did not exist. Each becomes a role or a block
kind, so the gate can **require** it rather than hope for it.

| Pattern | Mechanism added | Subject-neutral by design |
|---|---|---|
| 3 | `role: 'anchor'` — the only role allowed before the definition | "what the learner already holds" fits any subject |
| 7, 9 | `role: 'notation'` | naming the parts of any notation, term or abbreviation |
| 14–16, 24 | `kind: 'reasoning'` — ordered steps, **each with its own `because`** | a proof, a causal chain, a mechanism, a worked case |
| 19, 20 | `role: 'restriction'` | domains, scope conditions, exceptions, limits |
| 26 | `counterexample` on `MisconceptionBlock` | numbers, a case, or a counterexample of any kind |

### Why `reasoning` is one block and not two

A mathematical derivation and a five-step causal chain look different on the
page and are the same object: **an ordered sequence in which every step names
what licenses it.** Modelling them separately would mean a history lesson could
not reach the machinery that makes a maths lesson rigorous, which is exactly the
kind of split that makes a system good at one subject and useless at the rest.

`mode: 'why'` justifies a claim. `mode: 'worked'` applies it to one case. Both
carry the same steps, and in both a step without a `because` cannot be written
down, because the schema requires the field.

---

## The rule this file exists to keep

> **Simplify the path, never the destination.**
> **Earn every rule, or do not state it.**
