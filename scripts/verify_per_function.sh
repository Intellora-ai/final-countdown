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

# `mktemp`, NOT a fixed /tmp path.
#
# This wrote /tmp/pairs.txt, a name every process on the machine shares. Two
# concurrent local runs -- `make sandbox-test` in one terminal and a single gate
# in another, which is the normal way to work here -- raced on the same file,
# and the loser verified the winner's spec-to-source mapping while reporting on
# its own. World-writable too: on a shared machine anything could pre-create it.
# The gate would then verify a mapping it did not produce and still exit 0.
#
# The trap removes it on every exit path, including the `exit 1` below.
pairs_file="$(mktemp)"
trap 'rm -f "$pairs_file"' EXIT

python3 scripts/spec_source.py specs/*_spec.lean > "$pairs_file"
sources=$(cut -d= -f2 "$pairs_file" | sort -u)

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
    # AN ARRAY, NOT UNQUOTED WORD SPLITTING.
    #
    # This was `specs=$(...)` then `python3 "$verifier" $specs "$@"` with a
    # `shellcheck disable=SC2086`, relying on the shell to split one string into
    # several arguments. That is correct only while every spec path is free of
    # spaces, tabs and glob characters -- a property nothing checks and nothing
    # states. A spec file named with a space would silently become two wrong
    # arguments, and the verifier would report on files that do not exist.
    #
    # A `while read` accumulator, NOT `mapfile`. `mapfile` is the obvious
    # choice and it is bash 4+; macOS ships bash 3.2, and `.githooks/pre-push`
    # runs this script through `make sandbox-fast` on exactly that shell. The
    # portable form works on both, and this repository has already been bitten
    # once by a bash-3.2 difference -- run_gate.py's chain markers use `echo`
    # rather than an ERR trap for the same reason, measured.
    spec_paths=()
    while IFS= read -r spec; do
        spec_paths+=("$spec")
    done < <(grep "=${src}$" "$pairs_file" | cut -d= -f1)

    # `$specs` STAYS, AND THE ECHO LINE BELOW STAYS BYTE-IDENTICAL.
    #
    # tests/test_within_gate_dependency.py pins this exact literal, and it is
    # right to: `run_gate.py::unreached` parses these lines to tell "the gate
    # covered two of four sources" from "the gate covered all four". A reworded
    # marker does not fail, it silently stops counting -- partial coverage
    # reported as full. CI caught the rename on run 32758778143 when this line
    # briefly became `${specs[*]}`.
    #
    # So the DISPLAY string keeps its name and its spelling, while the
    # INVOCATION uses the array. Same output, one argument per spec.
    specs="${spec_paths[*]}"
    echo "── $src ← $specs"
    python3 "$verifier" "${spec_paths[@]}" "$@"
done
