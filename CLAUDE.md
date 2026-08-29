# CLAUDE.md — working rules

The one and only rulebook for this repository.

Rebuilt 2026-08-29. The previous 745-line version carried three copies of the
same law, a design-system spec for one route, and an enforcement table naming
hooks that have since been removed. All of it is in
`~/.claude-backup-20260829-160047/CLAUDE.md.full-745line` if any of it is
wanted back.

---
## How to talk to Tanveer — read this first

> **Use simple language. Explain technical things in plain words.**

This is an accessibility requirement, not a style preference. It applies to
EVERY reply, every session, forever.

### Writing rules

- Short sentences. One idea each. One concept at a time.
- Plain words: "broken", not "defective". "Check", not "validate".
- Explain a technical word the first time you use it, in brackets, like:
  "CI (the robot on GitHub that checks your code)".
- Answer first. Details after.
- Use short lists and small tables. Walls of text are hard to scan.
- Use numbered steps when the order matters.
- **Bold** the part that matters most.
- Keep facts, actions, warnings and decisions in separate blocks. Do not mix
  them into one paragraph.
- Say plainly what is happening now, what happens next, what is finished, and
  what is blocked and why.
- Do not repeat one idea in different words.

Say: "This file checks whether…" · "This command does…" · "The error means…" ·
"The problem is…" · "The fix is…" · "Run this next…" · "This is complete
because…"

Never say: "Obviously…" · "Simply…" · "As you know…" · "Just do…" · "This is
trivial…" · "You should already understand…" · "It goes without saying…"

**Do not talk down to him.** He runs this repo, directs several AI sessions at
once, and catches real mistakes in their work — including mine. Simple is not
the same as dumb. He works across Python, AI and LLMs, OCR, CI/CD, GitHub
Actions, Lean, Rust, APIs, databases and security tools. **Simplify the
explanation, never the technical quality of the work.** He also asks for the
"HONEST ANSWER" and means it: never soften bad news, just say it plainly.

**Full, simple sentences win.** Fragments are harder to read, not easier.

### How to run a task

1. State the objective.
2. List the smallest actions needed.
3. Do one group of related actions at a time.
4. Show the result.
5. Name any error straight away, in plain words.
6. State the next action.
7. Mark a step complete only after you have verified it.

Mark every step **not started**, **in progress**, **blocked**, or **complete**.

Do not put ten unrelated decisions in front of him at once. When several choices
are valid: explain them briefly, recommend one, say why it is recommended. Do not
make him compare options that do not matter.

### How to end a substantial task

End with these four headings, in this order:

- **Completed** — what was built, what was tested, what passed, which files.
- **Problems** — what failed, what the error means, what you did about it.
- **Next step** — the single most important next action.
- **Status** — complete, in progress, blocked, or awaiting approval.

### Scope — chat only

These rules govern replies to Tanveer in chat. Commit messages, PR bodies, issue
text and code comments stay technical and complete — they are written for the
repo and for other engineers.

**Personal details about Tanveer never go into anything published.** That means
commit messages, PR bodies, issues, GitHub annotations, CI logs, generated
reports, application logs and shared artifacts. This repository is public. Those
details live only in local instruction files that are never pushed.

**Their absence from this file is deliberate. Do not add them back.** A future
session may notice the rules here have no stated reason and want to supply one.
Do not. The reason is recorded privately, off this repository, and this file
carries the rules alone on purpose.

---

## Session start

At the start of every session, read `knowledge/README.md` and `wiki/index.md` to
load the current state of the project before doing anything else.

---

## Context first

Before ANY task, search the `knowledge/` folder (and `wiki/` if present) for
relevant context. Read the relevant files before writing code. Never build from
a partial picture. **If knowledge is missing, say so and ask before
proceeding** — do not fill the gap with a guess.

Order of authority when the sources disagree:

```
1. this repository's own code and tests   — what is actually true here
2. knowledge/architecture, decisions, patterns, api — what we decided and why
3. current official documentation          — what is true today upstream
4. knowledge/ curated corpus               — background and prior art only
```

The corpus never outranks official documentation on a live API. See
`.claude/skills/knowledge-research/SKILL.md` for the routing table and the
Current-Truth Rule.

---

## The always-on loop

For every non-trivial implementation task:

```
UNDERSTAND -> INSPECT CURRENT STATE -> RESEARCH RELEVANT KNOWLEDGE
           -> FORM STRUCTURED PLAN -> IMPLEMENT -> VERIFY
```

Use the repository-local `knowledge-research` skill when it is relevant. It is
not relevant to most tasks, and that is fine — skipping it deliberately and
saying so is correct behaviour.

Never:

- load an entire knowledge repository into context
- blindly copy an implementation
- assume an old example is current
- treat a curated list as authoritative
- use obsolete API information without verification
- research irrelevant sources merely to satisfy this rule

---

## Engineering rules

**1. Spec before code.** Define "done" in writing first: the exact behaviour,
the acceptance criteria, and how it will be verified. Write a short
step-by-step plan. Keep each step small and atomic. If "done" is unclear, ask —
do not code on a guess. **The test comes before the code, and must be seen
failing.** A test written after the implementation passes on its first run and
proves nothing.

**2. State assumptions, do not guess.** List every assumption about
requirements, codebase and environment. If anything is ambiguous, STOP and ask
rather than silently picking one reading. Present multiple interpretations when
a request admits them. Push back when a simpler approach exists.

**3. Write minimum, surgical code.** The least code that solves the problem,
nothing speculative. Do not refactor what is not broken. Match existing style;
do not "improve" adjacent code.

**4. Verify by running, never by assuming.** After each piece, run it — tests,
build, or a real manual check — and prove it works. Do not move on until the
current piece is verified. "Done" requires evidence: a passing test, a clean
build, a successful run. If you cannot show it, it is not done. This is a
floor: running the code afterwards is not a substitute for the failing test in
rule 1.

**5. Git is your save point.** Commit after each verified step with a clear
message. If something breaks, revert to the last good commit rather than
patching on top of broken code. Stage explicit paths — never `git add -A` —
because other sessions share this worktree and a blanket add commits their work
under your message.

**6. If stuck, stop and report.** Do not guess and do not fake it. Report what
you tried, the exact error, what you think is wrong, and what you need.

**7. Context first.** Gather relevant context before large work: existing code,
docs, patterns, constraints. Prefer reading the files over guessing at them.

**8. Never claim success without evidence.** A task is done when it is verified
and committed. If you cannot verify, say so plainly. Honesty over optimism.

### One rule deliberately omitted

An earlier draft of this section said "treat coverage as a quality gate". It was
removed rather than softened. The required coverage check in this repository
measures **38 lines, about 0.05% of the codebase**, so that sentence would have
asserted a guarantee that does not exist here. Restoring it needs the gate to
cover something real first.

---

## Knowledge proof

Every PR/commit you make MUST reference the `knowledge/` or `wiki/` files you
consulted in its description. If you did not consult any, say so and explain
why. Never build without checking knowledge first.

"I consulted none, because this was a two-line rename" is a complete and
correct answer. The rule exists to make the decision *visible*, not to force
research onto tasks that do not need it — research performed only to satisfy a
rule is waste, and it teaches everyone to ignore the rule.

Checked by the `knowledge-gate` job in `.github/workflows/gate.yml`, which is
**non-blocking today**. It reports; it does not yet refuse.

---

## Scope Lock

The current task is the ONLY objective.

Do not:

- refactor unrelated code
- fix unrelated warnings
- upgrade dependencies unless required
- redesign architecture unless required
- investigate unrelated bugs
- improve UX unrelated to the task
- clean up unrelated files
- add speculative abstractions
- pursue optimizations that do not affect task completion

If you notice an unrelated issue:

1. record it in `.agent/deferred.md`
2. do not fix it
3. continue the current task

Only leave the current task if the issue BLOCKS completion.

### Why "blocks" is a narrow word

A blocker is something that makes finishing the current task *impossible*, not
merely something encountered on the way to it. A failing unrelated test that
prevents the push is a blocker. A failing unrelated test that does not is a
deferral, however tempting.

The test to apply: **can the current task be completed and verified without
touching this?** If yes, it goes in `.agent/deferred.md` and nowhere else.

### Why recording beats fixing

A noticed problem that is never written down is lost the moment the session
ends, and the next session rediscovers it from scratch. A noticed problem that
is fixed on the spot turns a reviewable change into an unreviewable one, and
buries the actual work under edits nobody asked for.

Writing it down is the only option that keeps both the finding and the focus.

### This does not weaken anything above it

Scope Lock decides what is IN a task. It does not lower the bar for the work
that IS in scope. Rule 1 still governs: the test comes first and is watched
failing. "Every bug becomes a permanent fix" still applies **to the bug the
task is about** — root cause, a guard, and every copy of that same defect. A
variant of the bug you are fixing is in scope by definition; an unrelated bug
in the next file is not.

---

## Read only the knowledge that is relevant

`knowledge/architecture`, `decisions`, `patterns`, `api` and `references` will
grow. Every page added makes "read the knowledge folder" a worse instruction,
because most of it has nothing to do with the task in front of you.

**Read what the task needs. Skip the rest, deliberately, and say you skipped it.**

Reading a document about payments while building a lesson renderer does not
make the renderer better. It fills the context window with material that
competes for attention with the code that actually matters, and a model that
has read forty irrelevant pages reasons worse than one that has read the three
relevant ones.

### How to choose

1. **Name the task in one sentence** before opening anything.
2. **Read the index first** — `knowledge/README.md` and `wiki/index.md` exist so
   that you can find the right page without reading the wrong ones.
3. **Open only the pages whose subject overlaps the task.** Usually one or two.
   If you are opening five, the task was not named precisely enough — go back
   to step 1.
4. **Read the section, not the file.** Search for the heading, read that part.
5. **Say what you skipped and why**, in one line. "Read
   `knowledge/architecture/lesson-pipeline.md`; skipped everything else as
   unrelated" is a complete and correct answer.

### The one exception

`knowledge/decisions/` is checked more widely than the others, because a past
decision can bind work that looks unrelated to it. Scan the decision *titles*
before starting; open only the ones the task might contradict. A decision you
reverse without noticing is worse than a page you failed to read.

### What this is not

This is not permission to skip knowledge that IS relevant. "I didn't check"
and "I checked and it did not apply" are different claims, and only the second
one is honest when nothing was opened. Both are fine to report. Confusing them
is not.

Same rule, same reason, for the third-party corpus: see the routing table and
cost discipline in `.claude/skills/knowledge-research/SKILL.md`. One or two
sources, never twenty-one.


---

## rtk — cut command output before it costs tokens

`rtk` runs a command and filters the output before it reaches me. Same
information, fewer tokens. Prefix it on any command whose output will be long.

**Measured on this machine, 2026-08-29, with `wc -c`:**

| Command | Raw | Through rtk | Saved |
|---|---|---|---|
| `find ~/.claude/skills -maxdepth 1 -type d` | 78,937 B | 892 B | **98%** |
| `ls -la ~/.claude/skills/` | 112,099 B | 35,426 B | **68%** |
| `git status` | 179 B | 83 B | **53%** |
| `git log --oneline -20` | 1,471 B | 1,471 B | 0% |
| `git diff --stat` | 163 B | 162 B | 0% |
| `cat <file>` | 13,760 B | 13,760 B | 0% |

**Use it for** listings and status: `ls`, `find`, `git status`, test runs,
builds, installs. That `find` line alone would have cost ~19,700 tokens raw
and cost ~220 through rtk.

**Do not use it for** file contents or already-terse output — `cat`,
`git log`, `git diff`. It saves nothing there and only adds a wrapper.

**Never write down whether it is installed.** That is runtime state, and a
file recording it stays correct until it does not. Check, never recall:

```bash
command -v rtk && rtk --version || echo "NOT INSTALLED"
```
