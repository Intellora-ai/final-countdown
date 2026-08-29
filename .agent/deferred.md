# Deferred

Unrelated issues noticed while working on something else. Recorded here under
the Scope Lock rule in `CLAUDE.md`: noticed, not fixed, so that neither the
finding nor the focus is lost.

**This file is a queue, not an archive.** An entry that is fixed gets deleted,
not ticked — a list that only grows stops being read.

Format:

```
## <short title>
- found:   YYYY-MM-DD, while doing <what>
- where:   path/to/file.ts:123
- what:    one sentence on what is wrong
- why not now: which Scope Lock rule kept it out of that task
```

---

_Nothing deferred yet._

## eslint does not cover frontend/e2e/ (found 2026-08-29)
`npx eslint frontend/e2e/**` returns "File ignored because no matching configuration was supplied" for every file. The whole e2e directory, including the reporter that decides what CI failures look like, is unlinted. Unrelated to the annotation work, so recorded rather than fixed.
