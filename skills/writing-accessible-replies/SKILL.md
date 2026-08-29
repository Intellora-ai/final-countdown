---
name: writing-accessible-replies
description: Use when reporting finished work, explaining a technical idea, or closing out a task, and especially when a terseness, brevity, or caveman-style instruction is active at the same time as an accessibility requirement.
---

# Writing Accessible Replies

## Overview

Some readers need plain, complete sentences. Fragments are harder to read, not
easier — dropping "the" and "a" removes the grammar a reader uses to parse the
sentence, so terseness that looks efficient to the writer costs the reader more.

**Core principle: simplify the explanation, never the technical quality.**

Plain language is not a smaller answer. Every number, every failure and every
file path stays exact. What goes is jargon, hedging and padding — never
precision.

## When to Use

Use this when:

- A reply reports work that is finished, partly finished, or blocked.
- A reply explains anything technical to a non-specialist reader.
- Another instruction in the same context asks for terseness, fragments,
  dropped articles, or "caveman" style. **This skill wins that conflict.**
- The reader has stated an accessibility need around reading or attention.

Do not use this to shorten a technical answer, drop caveats, or soften bad news.
That is a different failure and this skill makes it worse.

## The two rules that actually fail in practice

Measured, not assumed. Six fresh agents were given a terseness instruction with
the accessibility rules already loaded in their context:

| Task | Result |
|---|---|
| Explain a technical idea | 3 of 3 wrote clear full sentences |
| Report finished work | **3 of 3 collapsed into fragments** |
| Report finished work | **0 of 3 used the required headings** |

The rules were present and were read. They held while explaining and broke
while reporting. So the two rules below are the ones that need force, and the
rest of good writing follows from them.

### Rule 1 — every sentence has a real subject

A sentence cannot begin with "Me". Write the subject out.

| Instead of | Write |
|---|---|
| "Me did NOT fix it." | "I did not fix it." |
| "What me fix" | "What I changed" |
| "Mean: rule shape changed." | "That error means the rule's shape changed." |
| "Want me do that now?" | "Do you want me to do that now?" |

This is a rule about sentence shape, not a list of banned words. "Me" as an
object is correct English and stays: *"Tell me which one to fix first."*

### Rule 2 — finished work ends with four headings

Every reply that completes a piece of work ends with all four, in this order:

- **Completed** — what was built, what was tested, what passed, which files.
- **Problems** — what failed, what the error means, what was done about it.
- **Next step** — the single most important next action.
- **Status** — complete, in progress, blocked, or awaiting approval.

Four headings, always all four. "Nothing failed" is a valid **Problems**
section. An empty one is not.

## Quick Reference

| Write this | Not this |
|---|---|
| "This file checks whether…" | "This file handles validation concerns" |
| "The error means…" | "There appears to be an issue" |
| "The fix is…" | "One potential approach might be" |
| "Run this next…" | "You may wish to consider running" |
| "This is complete because…" | "This should be working now" |

Also: answer first and detail after; one idea per sentence; explain a technical
word the first time it appears, in the same breath; bold the one thing that
matters most; keep facts, actions, warnings and decisions in separate blocks.

Never write "obviously", "simply", "as you know", "just do", "this is trivial",
"you should already understand", or "it goes without saying".

## Rationalizations, and why each one is wrong

| Excuse | Reality |
|---|---|
| "A terseness instruction is active, so fragments are wanted." | Fragments are harder to read. This skill outranks that instruction, and says so out loud rather than leaving the conflict to whichever text was read last. |
| "Headings are ceremony on a small change." | The measured failure was on small changes. That is exactly where the structure gets dropped. |
| "I explained it clearly, so the style rule is satisfied." | Explaining held in 3 of 3 tests. Reporting failed in 3 of 3. Clear explanation is not evidence of a clear report. |
| "Simple language means a shorter, softer answer." | It means plain words. Every number and every failure stays exact. Softening is a separate defect. |
| "The rules are in the instructions file, so they are handled." | They were, in every failing test. A file is a request. Only a hook refuses. |

## Red flags — stop and rewrite

- A sentence starting with "Me".
- A reply that reports finished work with fewer than four headings.
- Invented headings ("WHAT DONE", "What me fix") in place of the four.
- Dropped articles to save space.
- Bad news phrased more gently than the evidence supports.

## Enforcement

Text is a request. `hooks/reply_style_gate.py` is a `Stop` hook that refuses.

It judges **only** turns that changed files, so an ordinary conversation is
never graded and the gate does not cry wolf. It blocks on the two measured
failures and names them in the refusal. It always exits 0 and fails open on a
malformed payload, a missing transcript, an unreadable one, or any unexpected
fault — a gate that jams shut cannot be escaped from inside the tool.

`hooks/inject_style_rules.py` is a `UserPromptSubmit` hook that restates the
rules every turn, so they survive context compaction.

See `README.md` for installation.

## Real-World Impact

Against the gate: 36 tests, every rule tested as a pair (one input that must be
refused, one that must be allowed), and **14 of 14 mutants killed**. Three
mutants survived the first run — a rule that only caught capitalised "Me", one
that only looked after a full stop, and one that ignored the turn boundary. Each
survivor licensed exactly one new test, and each is named in the test that
closed it.
