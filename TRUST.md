# What is actually proved, and what is trusted

The phrase "formally verified Python" is not used in this repository, because
what holds here is narrower and worth stating exactly.

## The claim

For each function in `src/`, the Lean kernel accepts two theorems:

```
CORRESPONDENCE   evalFunc <name>_ast [args] = <what CPython actually returned>
                 at every sampled point

PROPERTY         a mathematical law about evalFunc <name>_ast
```

`<name>_ast` is the syntax tree of that exact source file, emitted as **data**
by `scripts/pysem.py`. `evalFunc` is a fixed interpreter written once in Lean
(`scripts/pysem_lean.py`), identical in every generated file.

So the property theorem is not about a Lean function someone wrote to resemble
the Python. It is about the meaning that a kernel-checked interpreter assigns
to the actual parsed syntax tree.

## Why it is built this way

The obvious approach — translate Python into a Lean function — makes the
translator load-bearing and unverifiable. Lean sees only the translator's
output, never its input, so nothing can check that meaning was preserved. The
trusted base becomes the whole translator and grows with every construct added.

Emitting the AST as data moves the semantics inside Lean. Nothing crosses the
boundary except a syntax tree, and a syntax tree cannot silently mean something
else. What remains to be trusted is that the tree is the right tree, which is a
much smaller and more attackable claim than "the translation preserved
semantics".

## The formal chain

```
src/add.py                       bytes on disk, sha256 recorded
    ↓  ast.parse                 CPython's own parser
    ↓  scripts/pysem.py          supported-subset check; anything else raises
add_ast : PyFunc                 the tree, as a Lean term
    ↓  evalFunc                  the semantics, fixed, kernel-checked
evalFunc add_ast                 a mathematical object
    ↓  theorem + proof           discharged by the Lean kernel via AXLE
a property of that object
```

The last step needs no separate composition lemma. The property is *stated*
over `evalFunc add_ast`, so proving it is already proving something about the
semantics of the tree — there is no model to transfer the result back from.

## Trust ledger

| # | Component | What it does | Can it be checked? | What breaks if it is wrong |
|---|---|---|---|---|
| 1 | Lean kernel + Mathlib | checks proof terms | no — this is the root | every theorem |
| 2 | CPython `ast` | parses the source | no — it *is* Python's syntax | the tree is not the program |
| 3 | `scripts/pysem.py` | serialises that AST into a Lean term | partly: mutation tests, and the correspondence theorem must hold at 12 observed points | the tree is not the program |
| 4 | `evalFunc` (`pysem_lean.py`) | assigns meaning to the tree | partly: the correspondence theorem fails if it disagrees with CPython at any sampled point | the theorem is about a different semantics |
| 5 | AXLE service | runs Lean, returns `okay` | no — a hosted service | a false `okay` |
| 6 | `correspondence_gate.py` | freshness + completeness + axiom audit | it is the checker | a stale pair passes |

Items 1 and 2 are irreducible. Items 3 and 4 are the interesting ones, and they
are attacked rather than asserted — see below. Item 5 is a real dependency: a
compromised or buggy AXLE could report `okay=true` for a rejected proof, and
nothing in this repository would notice.

## The known limits, stated plainly

**The correspondence is a finite sample.** Twelve points, chosen to separate
argument positions. It *refutes* a wrong interpreter; it does not *prove*
equivalence. A semantics that agreed with CPython at all twelve and diverged at
the thirteenth would survive. Closing this needs a proof about CPython, which
does not exist here.

**A property is only as strong as it is written.** Commutativity alone is
satisfied by `a * b` and by `return 0` — measured, not assumed: AXLE returns
`okay=true` for both. Each property therefore carries a second law that fails
for the obvious neighbours (`f [a,0] = some a` for addition, `f [a,1] = some a`
for multiplication). That closes the neighbours actually tried, not every
conceivable one.

**`clamp`'s guard is not pinned by its property.** The theorem is conditioned
on `lo ≤ hi`, so deleting the `raise` and regenerating still satisfies it — the
claim simply says nothing about `lo > hi`. That is a characterization gap, not
a soundness failure: the theorem is exactly as strong as it reads.

**Only the supported subset exists.** No division, loops, assignment, `else`,
exceptions, calls other than `max`/`min`, globals, closures or decorators.
`scripts/pysem.py` raises `Unsupported` on all of them, so an unsupported
program produces no correspondence and therefore no claim. Fifteen such
constructs are tested to fail closed.

## Axiom audit

Every generated proof ends with `#print axioms`, and the gate fails on anything
outside Lean's three foundational axioms. Measured today:

```
add_ast_matches_cpython  depends on axioms: [propext]
add_ast_is_addition      depends on axioms: [propext, Classical.choice, Quot.sound]
```

No `sorryAx`, so no proof is incomplete. No project-defined axiom, so nothing
assumes the result it is meant to establish.

## Final status

**B — formally proves a sound formal semantic representation of the Python
program, with an explicit remaining trust boundary.**

Not A. A would require the semantics of `evalFunc` to be *proved* equal to
CPython's behaviour rather than sampled at twelve points, and would require
CPython's parser and the AST serialiser to be inside the proof rather than
beside it.

Not C either. C is where this repository started: `specs/*.lean` contained a
hand-written Lean function that no mechanism related to `src/*.py`, so changing
the Python left every proof green. That is now caught — by freshness if the
generated pair is not regenerated, and by the kernel if it is.
