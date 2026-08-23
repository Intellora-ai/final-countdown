# 03 — Domain Verifier Interface

**Source of truth:** `learning-os/src/learning_os/verifiers/base.py`,
`verifiers/python_verifier.py`.
**Read with:** doc 02 §4 (`ToolResult`), doc 02 §9 (invariants 5 and 11).
**V1 implementation:** `PythonVerifier`. **Boundary only:** `LeanVerifier`.

> **Pinned to `60b3bf4`** on `learning-os/llm`, the integration branch —
> `api domain llm memory models policy runtime verifiers`. Verified on CI's
> configuration (Python 3.12, hash-locked install): **207 tests passing**, ruff
> clean, `mypy --strict` clean over 30 files.
>
> `diagnosis/` is described against **`ebc4059`** on `learning-os/diagnosis`,
> which is stacked on this branch and **not yet integrated**. `mastery/` is
> **not started** — its branch is cut but carries no `learning_os` source.

---

## 1. What a verifier is for

A verifier answers one question: *can this claim be checked by machine, and if
so, what did the check establish?*

It is not a grader. It does not decide whether a learner has understood
anything — that is the estimator's job, and it reads a verifier's output as one
input among several. A verifier that returned "correct" would be making a
mastery judgement from a single execution, which invariant 10 forbids.

---

## 2. Verifiability is per subskill, not per domain

The design decision most likely to be got wrong, so it is stated first.

`Verifiability` is a field on `Subskill`, not on `Concept` and not on a domain
adapter. Within one Python concept:

| Subskill | Operation | Verifiability |
|---|---|---|
| `python.functions.call_and_return` | PREDICT | `VERIFIABLE` |
| `python.functions.missing_return_is_none` | RECOGNISE | `HUMAN_REVIEW_REQUIRED` |
| `python.recursion.identify_base_case` | RECOGNISE | `HUMAN_REVIEW_REQUIRED` |
| `python.recursion.trace_calls` | PREDICT | `VERIFIABLE` |
| `python.recursion.explain_termination` | EXPLAIN | `HUMAN_REVIEW_REQUIRED` |
| `python.recursion.repair_missing_base_case` | DEBUG | `VERIFIABLE` |
| `python.recursion.write_recursive_function` | CONSTRUCT | `VERIFIABLE` |
| `python.recursion.apply_to_nested_structure` | TRANSFER | `VERIFIABLE` |

A single per-domain flag would force "explains why it terminates" to borrow the
confidence that "runs correctly" earns. *Python is verifiable, therefore this
Python claim is verified* is exactly the inference the field exists to block.

### The default is `HUMAN_REVIEW_REQUIRED`, and that is load-bearing

`Subskill.verifiability` defaults to `HUMAN_REVIEW_REQUIRED`. **Asserting
checkability is a deliberate act.**

This is the part a maintainer will be tempted to relax, so the reasoning
matters. The default was originally `VERIFIABLE`, which meant a subskill claimed
machine-checkability *by saying nothing*. That is backwards for a field whose
only job is preventing a claim from borrowing confidence it did not earn, and it
had already gone wrong in practice: seven of eight subskills took the default
and at least two of them — both `RECOGNISE` — cannot be settled by execution.
You cannot run "identify the base case in this function" and get an answer.

The failure directions are not symmetric. Defaulting closed costs an author one
line per checkable skill and fails visibly. Defaulting open silently mints
confidence nobody granted, and fails quietly, downstream, in a mastery claim.

### The five states

| State | Meaning | What the engine may claim |
|---|---|---|
| `VERIFIABLE` | Machine-checkable end to end | Confidence from the check, bounded by `limitations` |
| `PARTIALLY_VERIFIABLE` | Some properties checkable | Confidence about the checked properties only |
| `SOURCE_VERIFIABLE` | Not derivable, but attributable | Confidence in the attribution, not the claim |
| `HUMAN_REVIEW_REQUIRED` | Needs a rubric or a person | No autonomous mastery claim |
| `UNSUPPORTED` | No reliable verifier exists | Uncertainty, and nothing else |

`UNSUPPORTED` is enforced twice:

- `ToolResult._unsupported_cannot_be_confident` — raises if
  `verification is UNSUPPORTED and confidence > 0.0`
- `Judgement.__post_init__` — raises if
  `verifiability is UNSUPPORTED and passed` ("an UNSUPPORTED domain cannot
  report a pass; it has nothing to check with")

That is invariant 11 at both boundaries.

### "Universal" means extensible, not omniscient

A new subject is a new adapter, not a rewrite. The system is **not** universal
in the sense of knowing every subject equally well. It must know when it lacks a
reliable verifier and say so, rather than producing a confident-looking number.

---

## 3. The protocol

`DomainVerifier` is a `@runtime_checkable` `Protocol` with three methods,
because the engine needs three different things and collapsing them loses
information.

```python
class DomainVerifier(Protocol):
    def verifiability_of(self, skill_id: str) -> Verifiability: ...
    def validate_claim(self, claim: str, context: str = "") -> Judgement: ...
    def evaluate_response(self, task: Task, response: str) -> Judgement: ...
    def generate_transfer_task(
        self, skill_id: str, *, seen: tuple[str, ...] = ()
    ) -> Task | None: ...
```

| Method | Question it answers | Used for |
|---|---|---|
| `validate_claim` | Is this statement true? | Guarding generated content before it reaches a learner |
| `evaluate_response` | What did this answer demonstrate? | Producing `Evidence` |
| `generate_transfer_task` | Give me a genuinely novel problem | Making transfer measurable rather than asserted |

The third is what makes mastery meaningful. A verifier that cannot produce a new
problem cannot tell you whether a learner understood the principle or memorised
the example, and that distinction is most of what mastery is.

### `Judgement` — the return type

**A verifier returns `Judgement`, not `ToolResult`.** Getting this wrong in an
implementation is easy, so the distinction is spelled out below.

```python
@dataclass(frozen=True, slots=True)
class Judgement:
    passed: bool
    performance: float                 # [0,1], validated in __post_init__
    verifiability: Verifiability
    detail: str = ""
    limitations: tuple[str, ...] = ()
```

`verifiability` travels **with the result** rather than being looked up from the
domain, because the same verifier can be certain about one answer and not
another: code that fails to parse is definitively wrong, while code that passes
the tests provided is only as right as those tests.

### Why not `ToolResult`, given invariant 5

Invariant 5 requires provenance and a timestamp on every tool result. A verifier
is not the component that has them. It knows *what it checked* and *what that
does not cover*; it does not know when the engine called it, or which tool the
engine believes it is.

**The conversion happens at the runtime boundary.** `Judgement` becomes
`ToolResult` where `source` and `retrieved_at` are actually known:

```
verifier → Judgement → [runtime boundary] → ToolResult(source=..., retrieved_at=...)
                                             ↑ invariant 5 satisfied here
```

Putting timestamping inside the verifier would make every verifier
re-implement it, and one of them would get it wrong.

Mapping at the boundary:

| `Judgement` | `ToolResult` |
|---|---|
| `verifiability` | `verification` |
| `limitations` | `limitations` |
| `detail` | `result` (truncate to 20 000) |
| `performance` | feeds `confidence`; must be `0.0` when `UNSUPPORTED` |
| — | `source="execution"` for `PythonVerifier`, set by the boundary |
| — | `retrieved_at`, set by the boundary |

### `Task`

```python
@dataclass(frozen=True, slots=True)
class Task:
    task_id: str
    skill_id: str
    prompt: str
    checker: str = ""                  # test source, or a rubric
    expected_evidence: EvidenceStrength = EvidenceStrength.INDEPENDENT_APPLICATION
```

`expected_evidence` is fixed when the task is **created**, not when it is
marked. That is invariant 2 in practice: deciding what counts as success after
seeing the answer is how every intervention ends up looking successful.

`checker` is domain-specific and **the engine never reads it** — only the
verifier that produced it does.

---

## 4. `PythonVerifier` — V1

Executes learner code in a subprocess invoked as
`[sys.executable, "-I", "-S", path]`, with a wall-clock timeout, no network, and
no filesystem write outside a temp dir.

### `-I` alone does not isolate. `-S` is why both flags are there.

`-I` implies `-E` and `-s`: it drops `PYTHONPATH`, the script's own directory,
and the **user** site-packages. It has never implied `-S`, so the interpreter's
regular `site-packages` stays on `sys.path`:

```
$ python -I    -c "import sys; print(sys.path)"
  .../python314.zip  .../python3.14  .../lib-dynload  .../site-packages   <-- still there
$ python -I -S -c "import sys; print(sys.path)"
  .../python314.zip  .../python3.14  .../lib-dynload                      <-- gone
```

Wherever the engine is pip-installed rather than reached through `PYTHONPATH` —
which is every real deployment — learner code could therefore `import
learning_os` and reach the modules marking its own work.

**This shipped, and the test that should have caught it passed.** The suite was
run with `PYTHONPATH=src` and no install: the one configuration in which
`learning_os` is reachable only by a path `-I` genuinely strips. The property
held in the environment where the escape was impossible, and failed in every
environment where it was possible. A security property that holds only under one
install layout is not a property, it is a coincidence.

**Fixed in `6eef301`**, in two parts, because the flag alone treats the symptom.

*The flag.* `-S` added, closing the accidental import.

*The deeper defect — the test depended on install layout.* Three tests now, and
the middle one is the load-bearing addition:

| Test | Asserts |
|---|---|
| `test_site_packages_is_not_on_the_child_path` | The **mechanism**: no `site-packages` on the child's `sys.path`. Holds or fails identically in every environment. |
| `test_the_child_cannot_import_an_installed_dependency` | The child cannot import `pydantic` — a hard requirement, therefore in site-packages *everywhere*. If pydantic is unreachable the engine is too, however it was installed. |
| `test_learner_code_cannot_import_the_engine` | Kept, as the statement of intent. |

`pydantic` rather than `learning_os` is the point: the engine's reachability
varies with install layout, and that ambiguity is exactly what hid the bug. A
dependency that is always installed removes the variable.

Mutation-checked: reverting to `-I` alone under an editable install fails all
three. Before the fix it failed none.

**`-S` buys safety against a mistake, not against an attack.** It disables
`site` wholesale, so anything the checker itself needs from site-packages
becomes unavailable to the child too. A future curated allowlist — letting
learner code import `pytest`, say — needs an explicit `env` and a constructed
`sys.path`, not a third flag.

**A timeout is a result, not a crash.** A recursion verifier will be handed
non-terminating functions by design — that is what
`repair_missing_base_case` is about — so return a `Judgement` recording
non-termination. Raising would discard the single most informative outcome
available for that subskill. `RecursionError` is likewise evidence about the
base case and belongs in `detail`.

### Parsing is not checking — the bug that got through

`validate_claim("recursion is elegant and good")` once returned
`VERIFIABLE, passed=False`, meaning *I checked this sentence and it is false*.

That string is valid Python: an `is` comparison chained with `and`. It compiled,
ran, and died on `NameError`. The verifier saw "it executed and did not pass"
and reported a verified falsehood — fabricated confidence of exactly the kind
the verifiability model exists to prevent, produced by the component whose job
is preventing it.

The fix splits on *what happened*, not on *whether it ran*:

| Outcome | Meaning | Verifiability |
|---|---|---|
| `AssertionError` in stderr | It **was** evaluated, and came out false | `VERIFIABLE` |
| Anything else | Never actually evaluated | `HUMAN_REVIEW_REQUIRED` |

Keep this. "It parsed" and "it was checked" are different claims, and the gap
between them is where fake confidence gets in.

### Verifiability has one source, and that is the fix

`verifiability_of()` derives from the knowledge graph. There is no second list.

The graph is a **required constructor argument** —
`PythonVerifier(GRAPH, timeout_s=...)` — so a verifier cannot be built holding a
private opinion about what it can check. An unknown skill returns
`HUMAN_REVIEW_REQUIRED`, matching the graph's own conservative default.

It briefly had one. `PythonVerifier` kept a module-level `_NOT_EXECUTABLE`
frozenset naming the skills it would not execute, which meant two places
answered "is this checkable" and they drifted immediately: the set contained
only `python.recursion.explain_termination` while the graph marked three
subskills `HUMAN_REVIEW_REQUIRED`, so the verifier was more permissive than the
declaration for `identify_base_case` and `missing_return_is_none`.

**The fix was deleting the list, not extending it.** Two sources of truth for
one fact will always diverge; adding the two missing entries would have restored
agreement for exactly as long as it took someone to edit one side. Deriving from
the graph makes the divergence unrepresentable.

The rule this encodes: the subskill's `verifiability` is the **declaration**,
the verifier is the **authority**, and a verifier may report a state no stronger
than the declaration. It may narrow — a verifier that knows it cannot check
something declared `VERIFIABLE` must say so — but it may never widen.

---

## 5. `limitations` is not optional

A passing test proves the cases it covers and nothing else. `limitations`
records what the result does **not** establish, and the engine reads it before
letting a result support a mastery claim (invariant 10).

For a Python execution check, at minimum:

- which inputs were tried, and that untried inputs are unproven
- that passing tests do not establish the learner can explain the code
- that passing tests do not establish transfer to a novel structure

The third matters because `apply_to_nested_structure` is the V1 transfer task. A
verifier that let a flat-list pass imply a nested-structure claim would
manufacture the system's strongest signal out of its weakest evidence.

---

## 6. `UnsupportedVerifier` and the registry

The runtime resolves a verifier by the dotted prefix of the `skill_id`.

**A missing verifier resolves to `UnsupportedVerifier`, never an exception and
never a general fallback checker.** Falling back to something that "sort of"
checks would produce a confident result from a component with no competence in
that domain — the precise failure invariant 11 exists to prevent.
`UnsupportedVerifier` returns `UNSUPPORTED`, and `Judgement.__post_init__`
guarantees it cannot also report a pass.

---

## 7. `LeanVerifier` — boundary only

**Lean is not a V1 runtime dependency.** Nothing in V1 imports it, installs it,
or needs it present for tests to pass.

It exists here as a shape check: `DomainVerifier` must be satisfiable by
something whose notion of "correct" is a proof rather than a test run. If the
protocol can only express "ran it and compared output", it is a Python test
runner wearing a general name, and the second domain forces a rewrite of the
first.

A Lean verifier would report `VERIFIABLE` for a checked proof and
`HUMAN_REVIEW_REQUIRED` for an informal justification of the same theorem — the
same per-subskill split as Python, which is the evidence the abstraction holds.

---

## 8. Testing

- Every state in §2 needs a test that produces it.
- `Judgement(verifiability=UNSUPPORTED, passed=True)` must be constructed and
  asserted to raise. A validator nobody has watched fail is one nobody should
  trust.
- `validate_claim` on a prose string that happens to parse as Python must return
  `HUMAN_REVIEW_REQUIRED`, not a verified verdict. That is a regression test for
  a bug that shipped.
- Non-termination and `RecursionError` must return a `Judgement`, not propagate.
- No test may require a network.
