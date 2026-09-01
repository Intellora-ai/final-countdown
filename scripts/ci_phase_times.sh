#!/usr/bin/env bash
# One command turns a commit's CI into a queue/work ledger, per job.
#
# Optimizing CI without this is guessing: run 33558234833 looked like "mutation
# is slow" until these numbers showed eight scene shards spending HALF their
# life in setup and verify's tail jobs waiting 182s for a free runner. Queue
# time and work time are different diseases with different cures -- queue is
# pool contention (cut job count), work is the job itself (cut its steps).
#
# Usage: scripts/ci_phase_times.sh <sha-prefix>
# Output, per workflow on that commit:
#   queue=NNs work=NNs conclusion job-name
# where queue = job start - run creation (time spent waiting for a runner,
# including any needs: dependencies), and work = job end - job start.
set -euo pipefail

sha="${1:?usage: scripts/ci_phase_times.sh <sha-prefix>}"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

gh run list --limit 30 --json headSha,name,databaseId,createdAt \
  --jq ".[] | select(.headSha|startswith(\"$sha\")) | \"\(.databaseId) \(.createdAt) \(.name)\"" |
while read -r rid created name; do
  echo "=== $name (run $rid, created $created) ==="
  gh api "repos/$repo/actions/runs/$rid/jobs?per_page=50" |
    jq -r --arg c "$created" '
      .jobs[] |
      "queue=\((((.started_at // $c) | fromdateiso8601) - ($c | fromdateiso8601)))s\twork=\(((((.completed_at // .started_at // $c) | fromdateiso8601)) - (((.started_at // $c) | fromdateiso8601))))s\t\(.conclusion // .status)\t\(.name)"'
done
