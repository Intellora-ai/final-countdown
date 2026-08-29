# Knowledge corpus

Curated third-party sources, pinned as Git submodules.

**This file is generated. Do not edit it by hand.**
Regenerate with `python3 scripts/knowledge_manifest.py`; the revisions
below are read from `git submodule status`, so they cannot drift away
from what is actually checked out.

## Rules

- **Nothing in here is ours.** Each directory is a third-party
  repository under its own licence, listed below. We did not write it
  and we do not claim it.
- **Do not modify anything under `knowledge/`.** These are pinned
  upstream checkouts. A local edit would be silently lost on the next
  submodule update, and would misrepresent the upstream source.
- **Background knowledge only.** For anything time-sensitive -- a
  framework API, a library version, an SDK signature, a cloud product,
  a service's free tier -- these sources supply history and context.
  Current official documentation supplies the truth. See
  `.claude/skills/knowledge-research/SKILL.md`.
- **Curated lists are candidates, not facts.** An entry in
  `public-apis`, `free-for-dev`, `awesome`, `awesome-ios`, or
  `awesome-selfhosted` may name a service that changed or disappeared
  after that list was last edited. Verify before relying on it.

## Two kinds of knowledge live here

**Ours, written by us — check these FIRST:**

| Folder | Holds |
|---|---|
| `architecture/` | how the system works: components, data flow, boundaries |
| `decisions/` | past decisions and why they were made |
| `patterns/` | code patterns and conventions to follow here |
| `api/` | API docs, schemas, endpoints |
| `references/` | external docs, links, specs, with the date checked |

**Third-party, pinned — background only.** Everything in the table
below. See the precedence order in `CLAUDE.md`: our own knowledge and
current official documentation both outrank the corpus.

## Fetching

```bash
git submodule update --init --recursive
```

## Sources (21)

| Source | Upstream | Pinned revision | Licence |
|---|---|---|---|
| `TheAlgorithms/C` | https://github.com/TheAlgorithms/C.git | `e5dad3fa8def` | GPL-3.0 |
| `TheAlgorithms/C-Plus-Plus` | https://github.com/TheAlgorithms/C-Plus-Plus.git | `b9c118fb5dca` | MIT |
| `TheAlgorithms/Java` | https://github.com/TheAlgorithms/Java.git | `9a13ce00c4fa` | MIT |
| `TheAlgorithms/JavaScript` | https://github.com/TheAlgorithms/JavaScript.git | `5c39e87a9a31` | GPL-3.0 |
| `TheAlgorithms/Python` | https://github.com/TheAlgorithms/Python.git | `f3f599a61791` | MIT |
| `TheAlgorithms/Rust` | https://github.com/TheAlgorithms/Rust.git | `2345c668b05e` | MIT |
| `awesome` | https://github.com/sindresorhus/awesome.git | `d35bcd9c5c83` | CC0-1.0 |
| `awesome-ios` | https://github.com/vsouza/awesome-ios.git | `630ca87d5f93` | MIT |
| `awesome-selfhosted` | https://github.com/awesome-selfhosted/awesome-selfhosted.git | `ccea91291c7b` | SEE LICENSE FILE |
| `build-your-own-x` | https://github.com/codecrafters-io/build-your-own-x.git | `aa17439b62f3` | UNLICENSED |
| `free-for-dev` | https://github.com/ripienaar/free-for-dev.git | `9e2b400f663b` | UNLICENSED |
| `freeCodeCamp` | https://github.com/freeCodeCamp/freeCodeCamp.git | `50f93e9e80a6` | BSD-3-Clause |
| `llm-course` | https://github.com/mlabonne/llm-course.git | `7abd96e8284b` | Apache-2.0 |
| `machine-learning-zoomcamp` | https://github.com/DataTalksClub/machine-learning-zoomcamp.git | `e120ab3c5bb9` | UNLICENSED |
| `ossu` | https://github.com/ossu/computer-science.git | `33d44a44e352` | MIT |
| `papers-we-love` | https://github.com/papers-we-love/papers-we-love.git | `bc9993690531` | UNLICENSED |
| `public-apis` | https://github.com/public-apis/public-apis.git | `988c57be4616` | MIT |
| `secret-knowledge` | https://github.com/trimstray/the-book-of-secret-knowledge.git | `7d37069a361d` | MIT |
| `system-design-primer` | https://github.com/donnemartin/system-design-primer.git | `ae9bbd7b02d9` | CC-BY-4.0 |
| `tech-interview-handbook` | https://github.com/yangshun/tech-interview-handbook.git | `e1d28e8886c0` | MIT |
| `what-happens-when` | https://github.com/alex/what-happens-when.git | `ff2e421a0864` | UNLICENSED |

## Licence note

`UNLICENSED` means no licence file was found in the checkout, not that
the work is public domain. Treat those sources as read-only reference
and do not copy from them. `SEE LICENSE FILE` means a licence exists
but did not match a known pattern -- read it before relying on it.

