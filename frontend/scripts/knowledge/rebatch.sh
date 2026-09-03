#!/bin/sh
# RE-RUN THE WEAK CANDIDATES ON A BIGGER MODEL.
#
# The first batch (2026-09-03) ran half on `gemma3:12b` and, once the machine
# ran low on memory, the rest on `qwen2.5:7b`. The small model averaged 1.3
# concepts per topic and gave 25 of 29 topics nothing but the topic's own name
# back. Measured on three of those topics with the identical brief and the
# identical locked page, `qwen3:8b` gave 13, 3 and 7 concepts where
# `qwen2.5:7b` gave 1, 1 and 1.
#
# `gemma3:12b` is 8.1 GB and this machine had 7.3 GB free, so it would swap;
# `qwen3:8b` is 5.2 GB and fits, measured live with 2.3 GB to spare.
#
# RUN IT: `sh frontend/scripts/knowledge/rebatch.sh` from the repo root, or the
# `knowledge-rebatch` entry in `.claude/launch.json`, which inlines this same
# list because the launcher cannot read a script file out of the repo.
#
# Every group below is one (class, subject, chapter) holding at least one topic
# the small model gave a single concept for. Output goes to
# `cbse/class-N/<subject>.candidates.json`, which is then moved into
# `candidates/class-N/` -- the generator never writes a verified file.
set -u
cd "$(dirname "$0")/../.." || exit 1
MODEL="${KNOWLEDGE_MODEL:-qwen3:8b}"
export KNOWLEDGE_MODEL="$MODEL"
echo "re-batch on $MODEL"

run() {
  echo "--- class $1 | $2 | $3"
  node scripts/knowledge/build.mjs --class "$1" --subject "$2" --chapter "$3" 2>&1 | sed 's/^/    /'
}

run 11 computer-science unit-3
run 11 economics part-a
run 11 english-core syllabus
run 11 entrepreneurship unit-1-entrepreneurship
run 11 geography unit-iv-natural-hazards-and-disasters
run 11 history syllabus
run 11 informatics-practices introduction-to-computer-and-computing
run 11 legal-studies unit-4-judiciary
run 11 physical-education load
run 11 political-science syllabus
run 11 psychology understanding-psychology
run 11 sociology time
run 12 biology chapter-1
run 12 biotechnology chapter-1
run 12 chemistry unit-4
run 12 computer-science unit-3
run 12 economics part-a
run 12 english-core syllabus
run 12 entrepreneurship unit-1-entrepreneurship
run 12 geography book
run 12 history mature-harappan-sites
run 12 home-science unit-i
run 12 informatics-practices introduction-to-computer-and-computing
run 12 legal-studies unit-4-judiciary
run 12 mathematics types-of-relations
run 12 physical-education load
run 12 political-science class-xii
run 12 psychology variations-in-psychological-attributes
run 12 sociology prescribed

echo "REBATCH-DONE"
