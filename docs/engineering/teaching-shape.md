# The teaching shape — requirements

The canvas can already render a lesson. It cannot yet say whether that lesson
**teaches**. This document is the requirement half of LAW 0: what must be TRUE
for a lesson to count as taught rather than displayed. The tests come from
here, and the code comes after the tests fail.

Nothing below is a style preference. Every rule is stated so that a machine can
refuse a lesson that breaks it, because a rule nothing checks is a comment.

---

## What is measurably absent today

Three facts, measured in this worktree before any of this was designed. They
are the reason this document exists.

| Fact | Evidence |
|---|---|
| Prose cannot carry a marked term | `render/BlockView.tsx:58` renders `<p className="lc-body">{block.body}</p>`. There is no field to mark a term and no element to draw one. |
| Every shipped lesson breaks the length rule | Prose word counts — gasPressure **32, 53** · billBecomesLaw **30, 54** · classifierEvaluation **34, 67**. Five of six exceed 30 words. |
| No teaching-shape gate exists | `spec/validate.ts` checks structure and appearance. It checks nothing about whether the content teaches. |

The second fact is the important one. The three acceptance lessons are the
product's own best work, and by the rules below they are generic. That is the
finding, not a problem with the rules.

---

## The mechanism: a block has a ROLE, and roles have a legal ORDER

Nine of the rules below are the same rule wearing different clothes —
*framework before detail*, *simple before technical*, *definition first*,
*summary last*, *do not mix a definition with a formula*. Enforcing them
one at a time would need nine unrelated checks that can each rot separately.

They are all one thing: **every block declares what it is FOR, and the arc
those roles form is fixed.**

```
definition -> framework -> classification -> component* -> contrast* -> misconception* -> summary
```

`role` is semantic, so Law 3 holds — it says what a block IS to the lesson, never
how it looks. The design system decides that a definition is set larger, exactly
as it already decides what `emphasis: primary` looks like.

### The roles

| Role | What it is for | Appears |
|---|---|---|
| `definition` | The simplest correct sentence about the topic | Exactly once, first |
| `framework` | The one-line mental model the detail hangs from | At most once |
| `classification` | The full list of types or parts | At most once |
| `component` | One member of the classification, taught alone | Any number |
| `contrast` | Two confusable things, side by side | Any number |
| `misconception` | The common error, wrong then right | Any number |
| `example` | One short case that isolates one rule | Any number |
| `summary` | The progression, plus the mental model | Exactly once, last |

---

## The rules

Each rule states the requirement, what must be TRUE, and **the input that must
make it FAIL**. A rule with no failing input is satisfied by `return true` and
is worth nothing.

### R1 — Important terms are marked, and the system draws them

**Requirement.** Terms worth remembering are bold. Terms that carry a
distinction are bold and underlined.

**What must be true.** A prose or callout block may name its key terms. Each
named term appears verbatim in that block's own body. The schema carries a
semantic `role` on the term (`key` or `distinction`), never `bold` or
`underline`. The renderer maps `key` to bold and `distinction` to bold plus
underline.

**Must fail.** A schema carrying `bold: true`. A named term absent from the
body. A renderer that injects raw HTML rather than elements.

**Must pass.** `terms: [{ text: 'past tense', role: 'key' }]` where the body
contains "past tense".

### R2 — The definition is short, plain, whole, and first

**Requirement.** Two to three lines. Thirty words at most — fewer is fine, more
is not. The simplest correct wording, before any technical term.

**What must be true.** Exactly one `definition` block. At most **30 words**. It
is `blocks[0]`. It is **one unbroken run** — a definition delivered in
instalments is not a definition, so it may not use the blank-line allowance R3
gives every other block. It contains none of the lesson's declared technical
terms.

**Must fail.** A 31-word definition. A definition split across a blank line. A
definition in second position. A definition using a term not yet introduced.

### R3 — Nothing runs longer than thirty words **in one go**

**Requirement.** Ban more than 2.5 lines or 30 words *in one go*. After every
2.5–3 lines, leave space. A block may be long; it may not be unbroken.

**The correction this rule records.** The first version capped the whole BLOCK
at 30 words. That was wrong, and banning long explanations outright is not what
was asked. The unit is the **run** — the text between two blank lines. Eight
runs of 25 words pass. One run of 31 does not.

**What must be true.** Splitting a body on blank lines, every run is at most
**30 words**. The renderer turns those blank lines into real paragraphs, because
HTML collapses whitespace and a break nobody can see is not a break.

**Must fail.** A 38-word run with no break.

**Must pass.** The same 53 words broken every two or three lines.

### R4 — Teaching starts on the first word

**Requirement.** State the topic, the doubt, or the question straight away.
Never "Great question", never "Wow".

**What must be true — as a SHAPE, not a banned-word list.** The first sentence
of the first block shares at least one content word with the lesson's
`question`. A greeting shares none, whatever it is spelled like.

**Must fail.** "Splendid enquiry, dear scholar!" — an invented pleasantry on no
list anywhere. This is the test that separates a law from a list: if only the
real phrases are caught, the check is a list wearing a law's clothes.

**Must pass.** A first sentence that names the topic.

### R5 — Framework before detail

**Requirement.** Give the simple mental framework, then the full
classification, then each component.

**What must be true.** Block roles appear in the legal order above. A
`classification` may not precede its `framework`. A `component` may not precede
its `classification`.

**Must fail.** Three tense types listed before "tenses tell us when an action
happens".

### R6 — Simple language before technical language

**Requirement.** Define in the simplest correct words. Introduce technical
terms only after the basic idea is covered.

**What must be true.** A lesson declares its technical terms. Each one's first
appearance is in or after the block that introduces it, and never in the
`definition`.

**Must fail.** "Conjugation" used in the definition of tenses.

### R7 — One block carries one thing

**Requirement.** Do not mix definition, formula, meaning and example in one
paragraph.

**What must be true.** A `definition` block contains no equation and no example
marker. Formulas live in `equation` blocks. Examples live in `example` blocks.

**Must fail.** A definition containing `=` or "for example".

### R8 — Examples are short and isolate one rule

**Requirement.** Extremely short. Isolate the rule. No long stories.

**What must be true.** An `example` block is at most **20 words** and is linked
by an `exemplifies` relation to exactly one other block.

**Must fail.** A three-sentence story. An example linked to nothing.

### R9 — Every concept gets a representation, and it earns its place

**Requirement.** Minimum one representation per concept — graph, chart,
flowchart or table. Relevant, never decorative.

**What must be true.** Each lesson has at least one non-text block. Every
non-text block is connected by a relation to at least one text block. An
unconnected figure is decoration and is refused.

**Must fail.** A lesson of pure prose. A chart nothing refers to.

### R10 — Confusable things sit side by side

**Requirement.** Put confusable concepts side by side, and state what each one
means.

**What must be true.** Where a `contrasts` relation exists, a `table` or matrix
figure exists whose rows name both sides.

**Must fail.** Two contrasted ideas described only in separate paragraphs.

### R11 — Causal relationships use arrows

**Requirement.** Use arrows for causal relationships, and to visualise order.

**What must be true.** A causal or ordered chain is a `flow` block with links,
not prose containing the word "then".

**Must fail.** A four-stage process written as a sentence.

### R12 — A common error shows wrong, then correct, then why

**Requirement.** When something is a common error, show wrong plus correct,
then briefly explain why.

**What must be true.** A `misconception` block carries all three parts: the
wrong form, the correct form, and a reason of at most **30 words**. All three
are required by the schema, so two-thirds of one cannot be written.

**Must fail.** A wrong form with no correction. A correction with no reason.

### R13 — The ending is a progression plus a mental model

**Requirement.** After teaching the full system, summarise into a memorable
progression and a very simple mental model.

**What must be true.** The last block is `summary`. It carries an ordered
progression of at least two steps and a mental model of at most **30 words**.

**Must fail.** A lesson that stops after its last component.

### R14 — The body outweighs the headings

**Requirement.** The body of text is more than the heading and subheading.

**What must be true.** Total words across all block bodies exceed total words
across all block titles.

**Must fail.** Six titled blocks each holding four words.

### R15 — Asking twice does not answer twice the same way

**Requirement.** A student who asks the same question again gets a different
explanation.

**What must be true.** Resolving the same doubt a second time returns a lesson
whose **representation differs** — a different multiset of block kinds — not the
same lesson reworded. The resolver is told what has already been shown.

**Must fail.** Two identical resolutions. Two resolutions differing only in
wording while using the same block kinds.

**This is a mechanism change, not a paraphrase**, and the engine already names
that distinction: `Strategy.CHANGE_REPRESENTATION` exists in
`llm/contract.py` for exactly this reason, and `avoid_representations` already
carries what has been tried. The canvas side has no equivalent, which is the gap.

---

## Rules already enforced, and where

Not everything asked for is new. Three of the rules are already law in this
repository, and duplicating them would create a second copy to drift.

| Rule | Already enforced by |
|---|---|
| Chunk the lesson; do not teach it all at once | `teach/beats.ts` — `MAX_BLOCKS_PER_BEAT = 3` |
| Keep the step list in the back end, never on screen | `teach/contract.ts` — the `Beat` type has no `index` or `total`, and `checkBeats` refuses a checkpoint reading "step 3 of 9" |
| Ask before continuing, naming what is next | `beats.ts` — `checkpointFor`, phrased from the content and never from a counter |

The new work extends these. It does not replace them.

---

## What this deliberately does not check

Whether the teaching is **good**. Word counts, ordering and structure are
mechanical, and this document only claims the mechanical part. `llm/validation.py`
already draws that line and the reasoning holds here: a score that mixes
countable structure with judged quality produces a number that looks like a
measurement and is not.

A lesson can satisfy every rule above and still teach badly. It cannot satisfy
them and be a wall of undifferentiated text, which is the failure actually in
front of us.
