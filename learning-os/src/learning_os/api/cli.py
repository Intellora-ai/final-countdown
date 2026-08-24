"""Emit a canvas-ready lesson as JSON, so the two languages can be checked against each other.

WHY A FILE AND NOT A SERVER
---------------------------
The engine is Python and the canvas is TypeScript. Something has to cross that
line, and the cheapest honest thing is a JSON document: no process to run, no
port to hold open, no network in a test suite that is required to work offline.

The document is also the CONTRACT MADE CONCRETE. `api/emit.py` claims to produce
`LessonInput`; `frontend/src/canvas/spec/validate.ts` decides what `LessonInput`
is. Until something produced by the first is fed to the second, that claim is a
comment. A committed fixture lets each side test its own half in its own language
without either mocking the other.

WHY THE FIXTURE IS COMMITTED RATHER THAN GENERATED IN CI
--------------------------------------------------------
Generating it during the frontend job would need Python inside a Node workflow,
and a fixture regenerated on both sides can never disagree -- which is precisely
what it exists to detect. Committed, it is a fact both jobs read: the Python
suite asserts the emitter still produces it, the browser suite asserts the canvas
still accepts it, and a divergence fails one of them loudly.

DETERMINISTIC ON PURPOSE
------------------------
No clock, no randomness, no learner state. Same input, same bytes, so `git diff`
on the fixture shows a real change in what the engine emits rather than noise
from the hour it ran.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from learning_os.api.emit import emit
from learning_os.llm.client import FakeLLMClient
from learning_os.llm.contract import DiagnosisKind, InstructionContract, Strategy
from learning_os.models.contracts import ActionKind
from learning_os.spec_root import REPO_ROOT

#: Where the fixture lives, relative to the repository root.
#:
#: Under `frontend/` because the CONSUMER is the canvas: a fixture the browser
#: suite has to reach across a package boundary for is a fixture somebody
#: eventually copies.
FIXTURE = Path("frontend/src/canvas/spec/__fixtures__/engine-lesson.json")

#: The contract this fixture is built from.
#:
#: Fixed rather than derived from a live decision, because a fixture whose input
#: moves cannot show that the OUTPUT format moved. The policy is exercised by its
#: own tests; this one exercises the emitter and the schema.
SPECIMEN = InstructionContract(
    target_skill="python.recursion.identify_base_case",
    question="Why does a recursive function need a base case?",
    diagnosis=DiagnosisKind.CONCEPT_GAP,
    strategy=Strategy.WORKED_EXAMPLE,
    action=ActionKind.TEACH_BY_EXAMPLE,
    required_terms=("base case", "recursion"),
    success_evidence_required="learner identifies the base case unaided",
)


def build() -> dict[str, Any]:
    """The lesson the engine emits for `SPECIMEN`, as a plain dict."""
    content = FakeLLMClient().generate(SPECIMEN)
    return emit(SPECIMEN, content).as_payload()


def render() -> str:
    """The exact bytes of the fixture.

    `sort_keys` and a trailing newline so the file is stable under any JSON
    writer and does not produce a one-character diff the first time somebody
    regenerates it on a different machine.
    """
    return json.dumps(build(), indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    """Write the fixture, or print it.

    `--check` exits non-zero when the file on disk disagrees with what the
    emitter produces now. That is the mode CI wants: regenerating in CI would
    make the fixture agree with itself by construction and detect nothing.
    """
    args = sys.argv[1:] if argv is None else argv
    target = REPO_ROOT / FIXTURE
    rendered = render()

    if "--check" in args:
        if not target.exists():
            print(f"missing fixture: {target}", file=sys.stderr)
            return 1
        if target.read_text(encoding="utf-8") != rendered:
            print(
                f"{FIXTURE} is stale. The emitter now produces different output.\n"
                f"Regenerate with: python -m learning_os.api.cli",
                file=sys.stderr,
            )
            return 1
        return 0

    if "--stdout" in args:
        sys.stdout.write(rendered)
        return 0

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    print(f"wrote {FIXTURE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
