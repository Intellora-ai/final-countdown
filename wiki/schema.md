# Wiki schema

The rules. Everything in this directory obeys them, and an ingest that breaks
one is a bug, not a variation.

## The one rule that makes the rest work

```
raw/   is written ONCE and never edited
wiki/  is derived, and may be rewritten freely
```

`raw/` is the evidence. `wiki/` is the interpretation. Keeping them apart is
what lets a claim be checked later: if a wiki page and its source disagree,
the source wins, and you can tell which one moved.

Edit a raw file and that guarantee is gone permanently -- you can no longer
tell whether a page was wrong or the evidence was quietly changed to match it.
**If source material needs correcting, add a new raw file. Never edit the old
one.**

## Directories

| Path | Holds | Written by |
|---|---|---|
| `raw/` | source material, verbatim | a human, dropped in |
| `wiki/entities/` | concrete things: services, files, systems, people, tools | ingest |
| `wiki/concepts/` | ideas, mechanisms, techniques | ingest |
| `wiki/decisions/` | a decision, its options, and its evidence | ingest |
| `wiki/summaries/` | condensed roll-ups across several pages | ingest |
| `index.md` | every page, and how pages relate | ingest |
| `log.md` | every ingest that has ever run | ingest |

Note on `wiki/summaries/`: this name is carried verbatim from the
specification. If it was meant to be `summaries`, rename the directory and this
row together -- do not leave the two disagreeing.

## Page format

Every page in `wiki/` starts with frontmatter:

```markdown
---
title: Cross-tab store sync
type: concept          # entity | concept | decision | summary
tags: [storage, sync, browser]
sources:               # raw/ files this page was derived from
  - raw/2026-08-26-store-notes.md
created: 2026-08-26
updated: 2026-08-26
---

Body. Link other pages with [[wikilinks]].
```

Rules that are not optional:

- **`sources:` must list real files under `raw/`.** A page with no source is an
  opinion wearing a citation's clothes. If you genuinely inferred something,
  say `sources: []` and mark the claim as inferred in the body.
- **`[[wikilinks]]` are how the graph exists.** A page nothing links to and
  which links to nothing is invisible; the index will flag it as orphaned.
- **Tags are lowercase and hyphenated**, so they can be grepped reliably.
- **A page states what it knows and what it does not.** "Unknown" is a valid
  and useful entry. Silence is not.

## What an ingest must do

Every ingest, without exception:

1. Read the new file(s) in `raw/`. Never modify them.
2. Create or update pages under `wiki/`.
3. Add or update the corresponding rows in `index.md`.
4. Append one entry to `log.md` -- what was ingested, what changed, when.

Skipping 3 or 4 makes the wiki untrustworthy: the index stops being a complete
list, and nobody can reconstruct where a page came from.

## Conflicts

When a new raw file contradicts an existing page, do not silently overwrite.
Record both, name the disagreement in the page, and cite each source. A wiki
that hides its contradictions is less useful than one that shows them.
