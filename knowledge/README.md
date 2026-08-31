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

## Sources (86)

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
| `craftinginterpreters` | https://github.com/munificent/craftinginterpreters.git | `4a840f70f69c` | MIT |
| `cs50` | https://github.com/cs50/lectures.git | `c218da65901a` | UNLICENSED |
| `devdocs` | https://github.com/freeCodeCamp/devdocs.git | `aed106cd6848` | SEE LICENSE FILE |
| `developer-roadmap` | https://github.com/nilbuild/developer-roadmap.git | `9a38345ec296` | SEE LICENSE FILE |
| `free-for-dev` | https://github.com/ripienaar/free-for-dev.git | `9e2b400f663b` | UNLICENSED |
| `free-programming-books` | https://github.com/EbookFoundation/free-programming-books.git | `a0894b14eaf3` | CC-BY-4.0 |
| `freeCodeCamp` | https://github.com/freeCodeCamp/freeCodeCamp.git | `50f93e9e80a6` | BSD-3-Clause |
| `huggingface-course` | https://github.com/huggingface/course.git | `5805d51523d5` | Apache-2.0 |
| `llm-course` | https://github.com/mlabonne/llm-course.git | `7abd96e8284b` | Apache-2.0 |
| `machine-learning-zoomcamp` | https://github.com/DataTalksClub/machine-learning-zoomcamp.git | `e120ab3c5bb9` | UNLICENSED |
| `mdn-content` | https://github.com/mdn/content.git | `84673e170bd9` | SEE LICENSE FILE |
| `nand2tetris` | https://github.com/nand2tetris/projects.git | `6097b7700730` | MIT |
| `openstax/additive-manufacturing` | https://github.com/openstax/osbooks-additive-manufacturing.git | `461b9c36ac43` | SEE LICENSE FILE |
| `openstax/algebra-1` | https://github.com/openstax/osbooks-algebra-1.git | `332f78647098` | SEE LICENSE FILE |
| `openstax/american-government` | https://github.com/openstax/osbooks-american-government.git | `a26772452419` | SEE LICENSE FILE |
| `openstax/anatomy-physiology` | https://github.com/openstax/osbooks-anatomy-physiology.git | `716383a4c6c1` | SEE LICENSE FILE |
| `openstax/astronomy` | https://github.com/openstax/osbooks-astronomy.git | `dff6acf8df59` | SEE LICENSE FILE |
| `openstax/biology-bundle` | https://github.com/openstax/osbooks-biology-bundle.git | `63f8b6f8d129` | SEE LICENSE FILE |
| `openstax/business-ethics` | https://github.com/openstax/osbooks-business-ethics.git | `37c6dbe07bd9` | SEE LICENSE FILE |
| `openstax/business-law` | https://github.com/openstax/osbooks-business-law.git | `0502c9f293fd` | SEE LICENSE FILE |
| `openstax/calculo-bundle` | https://github.com/openstax/osbooks-calculo-bundle.git | `ed042e9dd9c9` | SEE LICENSE FILE |
| `openstax/calculus-bundle` | https://github.com/openstax/osbooks-calculus-bundle.git | `8dbc2ce19e80` | SEE LICENSE FILE |
| `openstax/chemistry-bundle` | https://github.com/openstax/osbooks-chemistry-bundle.git | `3be4b60ff501` | SEE LICENSE FILE |
| `openstax/college-algebra-bundle` | https://github.com/openstax/osbooks-college-algebra-bundle.git | `789b54099106` | SEE LICENSE FILE |
| `openstax/college-physics-bundle` | https://github.com/openstax/osbooks-college-physics-bundle.git | `fd1b25dfd5d8` | SEE LICENSE FILE |
| `openstax/college-success-bundle` | https://github.com/openstax/osbooks-college-success-bundle.git | `cca7cd1d4ab2` | SEE LICENSE FILE |
| `openstax/contemporary-mathematics` | https://github.com/openstax/osbooks-contemporary-mathematics.git | `2319ce22654c` | SEE LICENSE FILE |
| `openstax/entrepreneurship` | https://github.com/openstax/osbooks-entrepreneurship.git | `a299e6d7bdef` | SEE LICENSE FILE |
| `openstax/fisica-universitaria-bundle` | https://github.com/openstax/osbooks-fisica-universitaria-bundle.git | `d2e11f5c0c71` | CC-BY-4.0 |
| `openstax/fizyka-bundle` | https://github.com/openstax/osbooks-fizyka-bundle.git | `bdf3158ca1f9` | CC-BY-4.0 |
| `openstax/foundations-information-systems` | https://github.com/openstax/osbooks-foundations-information-systems.git | `057882c68a78` | SEE LICENSE FILE |
| `openstax/introduccion-estadistica-bundle` | https://github.com/openstax/osbooks-introduccion-estadistica-bundle.git | `d240445975b5` | CC-BY-4.0 |
| `openstax/introduction-anthropology` | https://github.com/openstax/osbooks-introduction-anthropology.git | `e466666414f1` | SEE LICENSE FILE |
| `openstax/introduction-business` | https://github.com/openstax/osbooks-introduction-business.git | `2a839877ab89` | CC-BY-4.0 |
| `openstax/introduction-intellectual-property` | https://github.com/openstax/osbooks-introduction-intellectual-property.git | `6dad5479f5a7` | CC-BY-4.0 |
| `openstax/introduction-philosophy` | https://github.com/openstax/osbooks-introduction-philosophy.git | `a0dbb585086d` | SEE LICENSE FILE |
| `openstax/introduction-political-science` | https://github.com/openstax/osbooks-introduction-political-science.git | `61afbf50d27b` | SEE LICENSE FILE |
| `openstax/introduction-python-programming` | https://github.com/openstax/osbooks-introduction-python-programming.git | `d215dd3b99c3` | SEE LICENSE FILE |
| `openstax/introduction-sociology` | https://github.com/openstax/osbooks-introduction-sociology.git | `ab8839c5c534` | SEE LICENSE FILE |
| `openstax/introductory-statistics-bundle` | https://github.com/openstax/osbooks-introductory-statistics-bundle.git | `1f6a35825395` | SEE LICENSE FILE |
| `openstax/life-liberty-and-pursuit-happiness` | https://github.com/openstax/osbooks-life-liberty-and-pursuit-happiness.git | `acb6fbe2744d` | CC-BY-4.0 |
| `openstax/lifespan-development` | https://github.com/openstax/osbooks-lifespan-development.git | `85ba54f236cf` | SEE LICENSE FILE |
| `openstax/makroekonomia` | https://github.com/openstax/osbooks-makroekonomia.git | `36f59aa574f0` | CC-BY-4.0 |
| `openstax/microbiology` | https://github.com/openstax/osbooks-microbiology.git | `633850257fbd` | SEE LICENSE FILE |
| `openstax/mikroekonomia` | https://github.com/openstax/osbooks-mikroekonomia.git | `47c2114ba9e7` | UNLICENSED |
| `openstax/neuroscience` | https://github.com/openstax/osbooks-neuroscience.git | `6164a769d700` | SEE LICENSE FILE |
| `openstax/nursing-external-bundle` | https://github.com/openstax/osbooks-nursing-external-bundle.git | `128c6c3e0ee6` | SEE LICENSE FILE |
| `openstax/organic-chemistry` | https://github.com/openstax/osbooks-organic-chemistry.git | `8917713cdfb7` | SEE LICENSE FILE |
| `openstax/physics` | https://github.com/openstax/osbooks-physics.git | `dfdfd7a5356e` | CC-BY-4.0 |
| `openstax/playground` | https://github.com/openstax/osbooks-playground.git | `48355920843d` | CC-BY-4.0 |
| `openstax/prealgebra-bundle` | https://github.com/openstax/osbooks-prealgebra-bundle.git | `38cae454e644` | SEE LICENSE FILE |
| `openstax/precalculo` | https://github.com/openstax/osbooks-precalculo.git | `c4d6f6c0e5ed` | CC-BY-4.0 |
| `openstax/principles-accounting-bundle` | https://github.com/openstax/osbooks-principles-accounting-bundle.git | `2165bf6454c0` | SEE LICENSE FILE |
| `openstax/principles-data-science` | https://github.com/openstax/osbooks-principles-data-science.git | `cc5a81d59c7d` | SEE LICENSE FILE |
| `openstax/principles-economics-bundle` | https://github.com/openstax/osbooks-principles-economics-bundle.git | `d5cadb403718` | SEE LICENSE FILE |
| `openstax/principles-finance` | https://github.com/openstax/osbooks-principles-finance.git | `e3e5135ae36e` | SEE LICENSE FILE |
| `openstax/principles-marketing` | https://github.com/openstax/osbooks-principles-marketing.git | `a6d7372579d1` | SEE LICENSE FILE |
| `openstax/principles-of-management-bundle` | https://github.com/openstax/osbooks-principles-of-management-bundle.git | `f2b749648a17` | SEE LICENSE FILE |
| `openstax/psychologia` | https://github.com/openstax/osbooks-psychologia.git | `f45cabb8dff0` | CC-BY-4.0 |
| `openstax/psychology` | https://github.com/openstax/osbooks-psychology.git | `de7e40c91813` | SEE LICENSE FILE |
| `openstax/quimica-bundle` | https://github.com/openstax/osbooks-quimica-bundle.git | `755d386f196f` | CC-BY-4.0 |
| `openstax/statistics` | https://github.com/openstax/osbooks-statistics.git | `7dea80ae2800` | CC-BY-4.0 |
| `openstax/university-physics-bundle` | https://github.com/openstax/osbooks-university-physics-bundle.git | `d0ed34a58511` | SEE LICENSE FILE |
| `openstax/us-history` | https://github.com/openstax/osbooks-us-history.git | `c05b860a035f` | SEE LICENSE FILE |
| `openstax/workplace-software-skills` | https://github.com/openstax/osbooks-workplace-software-skills.git | `4ec59c186873` | SEE LICENSE FILE |
| `openstax/world-history` | https://github.com/openstax/osbooks-world-history.git | `c0dd82697bc2` | SEE LICENSE FILE |
| `openstax/writing-guide` | https://github.com/openstax/osbooks-writing-guide.git | `7312ec11c4d7` | SEE LICENSE FILE |
| `ossu` | https://github.com/ossu/computer-science.git | `33d44a44e352` | MIT |
| `papers-we-love` | https://github.com/papers-we-love/papers-we-love.git | `bc9993690531` | UNLICENSED |
| `progit` | https://github.com/progit/progit2.git | `a013e3230a12` | UNLICENSED |
| `project-based-learning` | https://github.com/practical-tutorials/project-based-learning.git | `c22f8183bc7f` | MIT |
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

