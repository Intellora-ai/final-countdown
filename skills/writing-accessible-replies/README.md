# writing-accessible-replies

A skill plus two hooks that keep an AI assistant writing in plain, complete
sentences — especially in the message that reports finished work, which is
where the rules measurably break first.

## Why hooks and not just a document

Six fresh agents were given a terseness instruction, **with the written
accessibility rules already loaded in their context**. A probe confirmed they
had them: one quoted the rules back verbatim.

| Task | Agents | Result |
|---|---|---|
| Explain a technical idea | 3 | All 3 wrote clear, full sentences |
| Report finished work | 3 | **All 3 collapsed into fragments** |
| Report finished work | 3 | **0 used the required headings** |

The rules were present, read, and dropped anyway. A file is a request. Only a
hook can refuse.

## What is in here

| File | Event | What it does |
|---|---|---|
| `SKILL.md` | — | The rules, and why each one exists |
| `hooks/inject_style_rules.py` | `UserPromptSubmit` | Restates the rules every turn, so they survive context compaction |
| `hooks/reply_style_gate.py` | `Stop` | **Refuses** a turn whose closing message breaks them |

## What the gate checks, and what it deliberately ignores

It judges **only turns that changed files** — a turn that used `Edit`, `Write`
or `NotebookEdit`. An ordinary conversation is never graded. A gate that fires
on every message cries wolf, and a gate that cries wolf gets uninstalled, at
which point it enforces nothing at all.

Inside that narrow scope it blocks on exactly two things:

1. **A sentence beginning with "Me".** This is a rule about sentence shape, not
   a list of banned words, so it catches `Me frobnicated` — a verb in no
   dictionary. "Me" as an object is correct English and passes.
2. **A missing heading** out of `Completed`, `Problems`, `Next step`, `Status`.

Code is removed before the sentence rule runs, so a fenced block or an inline
span containing "Me did" is not a violation. That is structural on purpose: an
exemption clause would suppress code blocks rather than exempt them.

## It fails open, always

It exits 0 in every case, blocking or not. Malformed input, a missing
transcript, an unreadable one, a half-written final line, or any unexpected
fault all let the turn end.

Two independent brakes stop it looping:

1. The host's `stop_hook_active` flag.
2. A per-turn ledger capping blocks at 2, keyed on the prompt as well as the
   turn index — keying on the index alone let one turn's spent budget silently
   switch the gate off for the next one.

## Install

Copy the hooks somewhere stable:

```bash
mkdir -p ~/.claude/hooks && cp skills/writing-accessible-replies/hooks/*.py ~/.claude/hooks/
```

Then add both entries to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "python3 \"$HOME/.claude/hooks/inject_style_rules.py\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "python3 \"$HOME/.claude/hooks/reply_style_gate.py\"" }] }
    ]
  }
}
```

## Uninstall

Delete those two entries from `~/.claude/settings.json`. Nothing else stores
state except the ledger files beside the transcript, which are removed with it.

## Tests

```bash
python -m pytest tests/test_reply_style_gate.py
```

36 tests. Every rule is tested as a **pair**: one input that must be refused and
one that must be allowed, differing only by the thing the rule is about. A check
asserted only to block is satisfied by "always block"; one asserted only to pass
is satisfied by "always allow". Both are vacuous.

The tests assert the **refusal's own banner text**, never the exit code. This
hook always exits 0, and a hook file that does not exist exits non-zero with
empty output — so an exit-code assertion would pass against a hook that was
never written.

**Mutation score: 14 of 14 killed.** Three mutants survived the first run: a
rule that only caught a capitalised "Me", one that only looked after a full
stop, and one that ignored the turn boundary. Each survivor licensed exactly one
new test, and each of those tests names the mutant that justified it.
