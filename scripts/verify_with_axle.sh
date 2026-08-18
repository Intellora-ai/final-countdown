#!/usr/bin/env bash
# Verify every spec/proof pair with AXLE. Exit 0 only if all pass.
set -uo pipefail

ENVIRONMENT="${AXLE_ENV:-lean-4.33.0}"
fail=0
shopt -s nullglob

for spec in specs/*_spec.lean; do
    name="$(basename "$spec" _spec.lean)"
    proof="proofs/${name}_proof.lean"

    if [[ ! -f "$proof" ]]; then
        echo "❌ ${name}: spec exists but ${proof} is missing"
        fail=1
        continue
    fi

    result="$(axle verify-proof --environment "$ENVIRONMENT" "$spec" "$proof" 2>&1)"
    if printf '%s' "$result" | python3 -c 'import sys,json;sys.exit(0 if json.load(sys.stdin).get("okay") else 1)' 2>/dev/null; then
        echo "✓ ${name}: verified"
    else
        echo "❌ ${name}: AXLE rejected the proof"
        printf '%s\n' "$result" | head -30
        fail=1
    fi
done

if [[ $fail -eq 0 ]]; then
    echo "✓ All proofs verified"
fi
exit $fail
