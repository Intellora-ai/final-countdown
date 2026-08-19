# The requirement and assumption registries

`ci/gates.toml` answers **did the checks run**. It cannot answer either of the
two questions a reader actually has when the badge is green:

- **Which requirements were verified, and which were not?**
- **What is the verdict resting on that nothing checked?**

Neither has an answer in a file, because neither has a denominator. "All 17
checks green" means "the checks somebody wrote all passed" — a requirement
nobody wrote a check for leaves no trace anywhere in this repository, and an
assumption stated in a paragraph is read by no gate.

Two files close that, and one gate keeps them honest.

| File | Question it answers |
|---|---|
| `ci/requirements.yml` | What this system claims to establish, and which gate establishes each claim — including the rows where the answer is `none`. |
| `ci/assumptions.yml` | What the verdict rests on that no gate establishes, how someone would test it, and whether anyone has. |
| `scripts/registry_gate.py` | Proves the registries still describe the system, and prints the inventory. |
| `tests/test_registries.py` | Proves the gate rejects each defect class rather than rubber-stamping. |

Nothing in either registry was invented. Every row cites the document it was
derived from — `source:` for requirements, `documented_in:` for assumptions — so
the derivation is checkable rather than trusted.

---

## `ci/requirements.yml`

### Fields

| Field | Required | Rule |
|---|---|---|
| `id` | yes | `REQ-nnn`. Unique. Never reused after deletion. |
| `statement` | yes | One falsifiable sentence, at least 20 characters. If you cannot say what observation would show it false, it is a slogan. |
| `verification` | yes | A gate id from `ci/gates.toml`, or the literal `none`. |
| `severity` | yes | `blocking` or `advisory`. Checked, not asserted — see below. |
| `evidence` | yes | Must equal, byte for byte, that gate's own `evidence` value in `ci/gates.toml`. `none` when `verification` is `none`. |
| `source` | yes | The document this requirement was read out of. |
| `note` | no | Anything that is not the statement itself. |

Any other field is a finding. A mistyped `sevrity:` is silently ignored by every
reader, which is precisely how a registry rots into decoration.

### The closed set for `severity`

    blocking    if unmet, a merge must not happen
    advisory    if unmet, that is information; the merge proceeds

Two values, not five. `critical / high / medium / low` are adjectives that
cannot settle an argument, and one of these two is **cross-checkable**: for any
requirement citing a gate, `severity: blocking` must hold exactly when that gate
has `mandatory = true` in `ci/gates.toml`. The gate fails on a disagreement,
because a requirement that claims to block on a gate which blocks nothing is the
same failure `scripts/check_ruleset.py` describes, one level up.

For `verification: none`, `severity` is the honest judgement of what it *would*
be if anything checked it. A `blocking` requirement with `verification: none` is
the loudest row the registry can produce. There are three of them today.

### `verification: none` is the file working, not a gap in it

A requirement nobody verifies is listed **with `verification: none`**, never
omitted. Omission is indistinguishable from the requirement not existing;
`none` is a statement on the record that something matters and nothing checks
it. The gate prints these rows separately on every run.

### Adding a requirement

1. Find the document that already states it — a gate docstring, `README.md`,
   `TRUST.md`, `ci/gates.toml`. If no document states it, you are inventing a
   requirement, and that decision belongs in a pull request discussion first.
2. Write the statement so a reader can say what would falsify it.
3. Set `verification` to the gate id that establishes it, and copy `evidence`
   from that gate's own `evidence` value in `ci/gates.toml`. If no gate
   establishes it, write `none` for both.
4. Set `severity` to match the gate's `mandatory` flag (or, for `none`, to what
   it should be).
5. Run `python3 scripts/registry_gate.py`.

---

## `ci/assumptions.yml`

### Fields

| Field | Required | Rule |
|---|---|---|
| `id` | yes | `ASM-nnn`. Unique. Never reused after deletion. |
| `statement` | yes | What would have to be true for the verdict to mean what it appears to mean. At least 20 characters. |
| `impact` | yes | `high`, `medium` or `low`. |
| `how_to_test` | yes | A concrete action, at least 20 characters, that does not open with a word meaning "think about it later". |
| `status` | yes | `verified`, `falsified`, `unverified` or `not-applicable`. |
| `documented_in` | yes | Where this is written down in prose today. |
| `accepted` | conditional | Required by the policy below. Reserved for it. |
| `note` | no | Everything that is not the assumption itself. |

### The closed set for `impact`

    high      the "verified" claim itself is void or unsound
    medium    one gate's number is wrong, or one property is weaker than it reads
    low       a diagnosis is slower, or a convenience is absent

### The closed set for `status`

    verified        tested, and it held
    falsified       tested, and it did not hold
    unverified      not tested
    not-applicable  the mechanism it is about is inert today

Be honest with `status`. Eleven of the sixteen entries are `unverified`, and
that is the correct number. A registry that marks everything `verified` to look
good is strictly worse than no registry, because it converts an unknown into a
false claim.

### `how_to_test` must be an action

`investigate`, `tbd`, `todo`, `unknown`, `consider`, `explore`, `research`,
`somehow` and `maybe` are rejected as opening words. They describe an intention
to form a plan, not a plan. `review` and `read` are **not** on that list — for
`ASM-001` the only available test genuinely is a human reading a spec, and
saying so is the honest entry.

Where nothing can test an assumption, `how_to_test` says what would have to
exist first. `ASM-004` (the Lean kernel) names an independent proof checker;
`ASM-002` (the twelve-point sample) names a proof about CPython that does not
exist.

---

## The failure policy

    impact: high + status: unverified   ->  needs `accepted:`, >= 40 characters
    status: falsified (any impact)      ->  needs `accepted:`, >= 40 characters
    impact: high + status: falsified    ->  fails outright, no escape

**Why it is not simply "fail on high + unverified".** Eight of the nine
high-impact assumptions here are unverified, and most cannot be closed by anyone
at any budget: `TRUST.md` classifies the Lean kernel as "the root", CPython's
parser as "it *is* Python's syntax", and `scripts/spec_strength.py` records that
strengthening observational into semantic equivalence is undecidable by Rice's
theorem. A gate that goes red because a true, documented, unclosable limitation
exists is deleted inside a week — or every `impact: high` is quietly edited down
to `medium` and the file becomes decoration. Both outcomes destroy the honesty
the registry exists to hold, which is worse than having no registry.

A gate that never fails on an assumption does nothing at all.

So the gate separates two things `unverified` runs together: whether an
assumption has been **tested**, and whether its residual risk has been
consciously **accepted**. It fails on the second, never the first. The case it
actually catches is the one worth catching: a new high-impact assumption someone
added and never thought about.

**Why the escape hatch is not a rubber stamp.** `ci/` is a trusted path in
`scripts/tcb_gate.py`. Adding an `accepted:` line therefore requires a `TCB:`
acknowledgement in a commit message saying what changed in the trusted base and
why — a commit trailer, which cannot be edited after the checks pass without
changing the SHA. The hatch cannot be used quietly, the count of accepted risks
is printed on every run, and the text has a length floor for the same reason
`tcb_gate.py` rejects a bare `TCB:` trailer: the point is the sentence.

`accepted:` is reserved for the policy escape. Setting it where the policy does
not require it is a finding — an acceptance that buys nothing hides the ones
that do. Put that text in `note:`.

`impact: high` + `status: falsified` has no hatch. There is no version of "we
accept that a blocking verdict rests on a claim we measured to be false". That
is a defect.

---

## Exit codes

    0   the registries resolve and the acceptance policy holds
    1   findings — the registries are wrong about the system they describe
    2   cannot run — a registry is missing, unparsable or structurally malformed

2 is never 0. A gate that could not read its input has not checked it, and
"could not check" must not be indistinguishable from "checked and fine". The
line between 1 and 2 is whether the gate could evaluate the file at all: a
missing field or a non-text value is exit 2, a wrong value is exit 1.

## Running it

```bash
python3 scripts/registry_gate.py
pytest tests/test_registries.py
```

It needs PyYAML, which is already direct intent in `requirements.txt` and
hash-pinned in both `requirements.lock` and `requirements-preflight.lock` — the
same parser `scripts/gate_integrity.py` already uses for workflow files. No new
dependency enters the trusted computing base. `ci/gates.toml` is read with
stdlib `tomllib`; neither file changed format to suit the other.

---

## INTEGRATION — not applied here

Nothing below has been written into `ci/gates.toml` or any workflow. This branch
adds files only; the manifest and the workflows are owned elsewhere. Both routes
are given, with the recommendation first.

### Recommended: a step in the existing `preflight` job

The registry gate is an integrity check — it compares one declaration against
another. That is exactly `preflight`'s declared `role = "integrity"`, and
`preflight` is already mandatory and already required by GitHub, so this route
needs **no ruleset change and no new required check**. It runs in well under a
second and needs only `requirements-preflight.lock`, which already pins PyYAML.

**1 — `ci/gates.toml`, `[gates.preflight]`**, add the third entry to
`must_contain` so the step cannot be deleted without `gate_integrity.py`
noticing:

```toml
[gates.preflight]
workflow = "verify.yml"
job = "preflight"
mandatory = true
role = "integrity"
must_contain = ["scripts/gate_integrity.py", "scripts/tcb_gate.py",
                "scripts/registry_gate.py"]
evidence = "reports/preflight.json"
artifact = "reports-preflight"
```

**2 — `.github/workflows/verify.yml`**, in the `preflight` job, immediately
after the `Gate integrity` step and before `Upload evidence`:

```yaml
      # The registries must still describe the system they claim to describe:
      # every `verification:` resolves to a real gate, every `evidence:` is that
      # gate's own, and no high-impact assumption is both untested and
      # unacknowledged. Prints the inventory — how many requirements, how many
      # verified by nothing — which is the number this repository had no way to
      # state before. See docs/registries.md for the failure policy.
      - name: Requirement and assumption registries
        run: python3 scripts/registry_gate.py
```

No `if:` and no `continue-on-error`: `gate_integrity.py` treats a conditioned
step as a deleted one, and it is right to.

### Alternative: a standalone `registry` gate

Use this only if the registry check should be able to go red while the rest of
`preflight` is green. It costs four more edits and one action nobody in this
repository can perform alone.

**1 — `ci/gates.toml`**, a new block:

```toml
# REGISTRY — the two registries must still describe the system. gate_integrity
# proves the workflows match the manifest; this proves the requirement and
# assumption registries match the manifest, and prints the inventory that gives
# "all checks green" a denominator. See docs/registries.md.
[gates.registry]
workflow = "verify.yml"
job = "registry"
mandatory = true
role = "integrity"
must_contain = ["scripts/registry_gate.py"]
evidence = "reports/registry.json"
artifact = "reports-registry"
```

**2 — `ci/gates.toml`**, `[ruleset].required_checks`: add `"registry"`.
`gate_integrity.py` check 9 asserts `required_checks` equals the mandatory gate
set, so this is not optional.

**3 — `.github/workflows/verify.yml`**, a new job:

```yaml
  registry:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0
      - uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
        with: {python-version: '3.12', cache: pip,
               cache-dependency-path: requirements-preflight.lock}
      - run: pip install --quiet --require-hashes -r requirements-preflight.lock
      - name: Requirement and assumption registries
        run: python3 scripts/run_gate.py --name registry -- python3 scripts/registry_gate.py
      - name: Upload evidence
        if: always()
        uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6.0.0
        with:
          name: reports-registry
          path: reports/
          retention-days: 30
          if-no-files-found: error
```

**4 — `.github/workflows/verify.yml`**, the `full` job's `needs:` list: add
`- registry`. Without it the finalizer runs before the gate finishes and
`aggregate_gates.py` reports the registry evidence as missing.

**5 — the live GitHub ruleset** (id `20990225`): add `registry` to its required
checks. This needs repository admin and cannot be done from a pull request.
Until it is done the gate runs and blocks nothing — the exact condition
`scripts/check_ruleset.py` calls "a repository full of working gates that block
nothing, which looks exactly like a repository whose gates work", and which
nothing in CI currently detects (`REQ-034`, `ASM-008`).

That fifth step is the reason the `preflight` route is recommended.

### One more thing the integrator must know

`ci/`, `scripts/` and the workflows are all trusted paths in
`scripts/tcb_gate.py`. Every change above — and the addition of these files
themselves — requires a `TCB:` line with a reason in a commit message on the
branch, or the mandatory `preflight` gate fails.
