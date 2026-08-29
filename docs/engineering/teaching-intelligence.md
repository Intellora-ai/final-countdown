# What "smart like a human" means, stated so it can be checked

A teacher who is genuinely good at explaining does a set of small things that
are easy to name and easy to skip. This file names them, and — for each one —
says plainly whether the software **enforces** it, **partly** enforces it, or
**does not**.

The honesty matters more than the length of the list. A quality claimed and not
enforced is a quality the next session will assume is handled.

---

## The qualities

### 1. It knows which sense of a word is meant

`right` means correct, and a direction, and a 90° angle. `base` is the bottom of
a shape and the number a power is taken of. A smart teacher commits to one sense
before the reader has to guess.

**Enforced.** `checkAmbiguousWords` in `teach/teaching.ts`. A word on the
ambiguity register may only be used once the lesson has declared it in
`technicalTerms` or marked it as a `distinction`.

**This one has a scar.** The `misconception` block was first written with a
field called `right`, meaning "the correct form". The appearance gate refused
the whole lesson, because `right` is also a CSS position. The gate was correct
and the *name* was wrong — the word carries two senses and only one was in mind.
That is exactly the mistake a learner makes, and nothing was watching for it.

### 2. It starts on the topic, not on the asking

No "Great question", no throat-clearing. The first sentence is about the thing.

**Enforced.** `checkOpensOnTheTopic`. Written as a shape, not a banned-word list:
the opening must share a content word with the question, a declared technical
term, or the block's own title. `"Splendid enquiry, dear scholar!"` — on no list
anywhere — is caught.

### 3. It says the short true thing before the precise one

The simplest correct sentence first. The technical vocabulary after the idea has
landed, never instead of it.

**Enforced.** `role: 'definition'` must be first, ≤30 words, one unbroken run,
and may contain no declared technical term. `checkTechnicalTermsArriveLate`
refuses a term used before the block that earns it.

Visible in `logarithms.ts`: the definition says *"how many times do you multiply"*
because it is forbidden from saying *"exponent"*.

### 4. It gives the map before the streets

Framework, then classification, then the parts. Never a list of five types
before the reader knows what they are types **of**.

**Enforced.** The role ordering in `checkArc`.

### 5. It separates things the reader is about to confuse

Two confusable ideas go side by side, with what each one means. Not two
paragraphs three screens apart.

**Enforced.** A `contrasts` relation requires a table or matrix figure in the
lesson.

### 6. It shows the thing when the thing is shaped

Order and cause are drawn. A four-stage process is a diagram, not a sentence
containing "then" three times.

**Enforced.** Every **beat** must carry one representation, and that
representation must be referred to by something else *inside the same beat* —
presence alone is decoration. An arrow typed into prose is refused, because the
canvas has a block that draws arrows properly.

### 7. It knows the error people actually make

Not "be careful here". The wrong version, the right version, and why — all three,
or it does not help.

**Enforced by the schema**, which is stronger than a check: `MisconceptionBlock`
requires `wrong`, `correct` and `why`. Two-thirds of a correction cannot be
written down.

### 8. It marks what is worth remembering

A reader skimming a page should be able to see the load-bearing words.

**Enforced.** A text block over ten words must mark at least one term. Marks are
semantic (`key` / `distinction`); the design system decides they render bold and
underlined, so Law 3 holds.

### 9. It checks understanding at the right moment

After a complete idea — not after every sentence, and not only at the end.

**Enforced.** Beats end when they are *finished* (something shown, plus enough
around it), not when they are full. Measured: the logarithms lesson went from
**six** beats to **three** when this changed. Six meant being stopped after the
definition alone, which is slow rather than careful.

### 10. It never tells the learner how far through they are

"Step 3 of 9" turns a lesson into a queue to be drained.

**Enforced.** The `Beat` type has no index and no total, and `checkBeats`
refuses a checkpoint whose text reads as a count.

### 11. It says when it does not know

A confident wrong answer to someone who has just admitted confusion is the worst
output this software can produce.

**Enforced by the types.** `DoubtRefusal` is a first-class return value beside
`DoubtAnswer`, not an error. `TriedResolver` keeps `failed` separate from
`refused`, because "the web is down" and "the web has no answer" mean opposite
things.

### 12. It changes method when the first attempt fails

Not louder. Different — a diagram where prose failed.

**Partly enforced.** The engine has `Strategy.CHANGE_REPRESENTATION` and
`avoid_representations` in `llm/contract.py`. The canvas-side doubt resolvers
have no equivalent yet, so asking the same question twice can still return the
same shape of answer. **This is the known gap**, recorded as R15 in
`teaching-shape.md`.

### 13. It ends by making the thing portable

A progression the learner can re-run, and one sentence they keep.

**Enforced.** The last block must be `role: 'summary'`, carrying an ordered
progression of at least two steps and a mental model.

### 14. It puts the teaching in the body, not the headings

**Enforced.** Total body words must exceed total title words. The body is also
now set at the same size as a section title (17px, was 14px) and in the primary
ink rather than the muted one — it was previously the smallest, faintest text on
a page whose headings shouted.

---

## What is NOT enforced, and is not pretended to be

These are real qualities of good teaching that this software does **not** check.
They are listed so nobody reads the list above as complete.

| Quality | Why it is not checked |
|---|---|
| Answers the question actually asked | Requires understanding the question. Not countable. |
| Starts where *this* learner is | The engine models mastery; the canvas does not read it. |
| Omits the true-but-irrelevant | No mechanical test separates relevant from merely true. |
| Reaches for an example at the moment the abstract stops working | Timing judgement, not structure. |
| Uses the learner's own words back | Would need the learner's words at authoring time. |
| Whether the explanation is **good** | Deliberately excluded — see `llm/validation.py`. A score mixing countable structure with judged quality produces a number that looks like a measurement and is not. |

A lesson can satisfy every enforced rule above and still teach badly. It cannot
satisfy them and be a grey wall of undifferentiated text, which is the failure
that was actually in front of us.
