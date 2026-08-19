#!/usr/bin/env bash
# Run one per-function verifier over every source file the specs cover.
#
# A source file's specs are only meaningful together, so the verifier is called
# once per source with all of that source's specs as arguments. Three gates
# (spec-composition, honest-report, mutmut) need exactly that loop and differ
# only in which verifier and which threshold they pass:
#
#   python3 scripts/run_gate.py --name spec-composition -- \
#     bash scripts/verify_per_function.sh scripts/check_composition.py --min-strength 0.9
#
# run_gate.py runs its command with shell=False, so it cannot run a bash loop
# directly. The loop lives here instead and the whole script is wrapped, which
# is what makes those three gates emit reports/<gate>.json like the other nine.
#
# FAILURE PROPAGATION, which is the whole point of the gate:
# `set -e` inside the `while` subshell aborts that subshell the moment the
# verifier exits non-zero. The subshell is the last stage of the pipeline, so
# `pipefail` makes its status the pipeline's status, and `set -e` then exits
# this script with a non-zero code, which run_gate.py records as FAIL and
# re-raises. Identical to the inline loops this replaced.
set -euo pipefail

verifier=$1
shift

python3 scripts/spec_source.py specs/*_spec.lean > /tmp/pairs.txt
sources=$(cut -d= -f2 /tmp/pairs.txt | sort -u)

# A loop over nothing exits 0, so the gate would report PASS having verified
# nothing at all. spec_source.py exits 1 on a spec it cannot resolve, which
# closes that today, but only as a side effect of another script's error
# handling. Assert it here so the property is owned rather than inherited.
if [ -z "$sources" ]; then
    echo "no source files resolved from specs/*_spec.lean" >&2
    echo "this gate would have passed having verified zero functions" >&2
    exit 1
fi
echo "verifying $(printf '%s\n' "$sources" | wc -l | tr -d ' ') source file(s)"

printf '%s\n' "$sources" | while read -r src; do
    specs=$(grep "=${src}$" /tmp/pairs.txt | cut -d= -f1 | tr '\n' ' ')
    echo "── $src ← $specs"
    # $specs is deliberately unquoted: one argument per spec file, not one
    # argument containing every spec file. Quoting it would pass a single
    # argument holding every path, and the verifier would look for one file
    # with a name containing spaces.
    # shellcheck disable=SC2086
    python3 "$verifier" $specs "$@"
done
