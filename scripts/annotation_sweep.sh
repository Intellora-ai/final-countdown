#!/usr/bin/env bash
# EVERY ANNOTATION OF ONE COMMIT'S RUNS, AS ROWS: file:line [level] check :: message.
# The default first move when anything is red: this is the run's own account of
# what failed, where, and (because this repository writes assertions as
# explanations) why. Usage: scripts/annotation_sweep.sh <sha-prefix>
set -euo pipefail
SHA="${1:?usage: annotation_sweep.sh <sha>}"
for id in $(gh api "repos/{owner}/{repo}/commits/$SHA/check-runs?per_page=100" \
             --jq '.check_runs[] | select(.output.annotations_count > 0) | .id'); do
  gh api "repos/{owner}/{repo}/check-runs/$id/annotations" \
    --jq '.[] | "\(.path):\(.start_line) [\(.annotation_level)] \(.title // "") :: \(.message)"'
done | sort -u
