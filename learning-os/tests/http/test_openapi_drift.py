"""The drift gate, tested in both directions.

A gate only ever asserted to PASS is satisfied by `return 0`, and a gate only
ever asserted to FAIL is satisfied by `return 1`. Both halves are here: the
committed document must match the code, AND a document with one field removed
must be caught.

The second half is the one that matters. Without it this file would keep
reporting a healthy gate long after somebody replaced the comparison with
`return 0` to get a red build green.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from learning_os.spec_root import REPO_ROOT


def _load_gate() -> ModuleType:
    """Import `scripts/openapi_drift.py` by path.

    By path rather than by package name because `scripts/` is not a package and
    is not on `PYTHONPATH` in this job -- the learning-os job puts `src` there
    and nothing else. Copying the module under `learning-os/` to make the import
    tidy would create a second copy of the gate, and two copies of one gate is
    how a repository ends up enforcing the older one.
    """
    path = REPO_ROOT / "scripts" / "openapi_drift.py"
    spec = importlib.util.spec_from_file_location("openapi_drift", path)
    assert spec is not None and spec.loader is not None, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules["openapi_drift"] = module
    spec.loader.exec_module(module)
    return module


GATE = _load_gate()


def test_the_committed_schema_matches_the_code() -> None:
    """The real check. This is the one that fails when a route changes."""
    committed = (REPO_ROOT / "learning-os" / "openapi.json").read_text(encoding="utf-8")
    assert committed == GATE.generated(), (
        "learning-os/openapi.json is stale. Regenerate with:\n"
        "  python3 scripts/openapi_drift.py --write"
    )


def test_a_missing_schema_is_reported_not_ignored(tmp_path: Path) -> None:
    """An absent document must be a failure.

    Treating "no file" as "nothing to compare" is the version of this gate that
    passes on a repository with no schema at all.
    """
    assert GATE.main(["--root", str(tmp_path)]) == 1


def test_drift_is_detected_when_a_response_field_disappears(tmp_path: Path) -> None:
    """The pairing test, and the failure Phase 4 is aimed at.

    `AttemptRecorded.replayed` is how a retrying client tells "my write landed"
    from "my write landed twice". A schema that quietly loses it still describes
    a valid-looking API, and every generated contract test would keep passing --
    which is exactly why the gate compares bytes rather than eyeballing shape.
    """
    document: dict[str, Any] = json.loads(GATE.generated())
    del document["components"]["schemas"]["AttemptRecorded"]["properties"]["replayed"]

    target = tmp_path / "learning-os" / "openapi.json"
    target.parent.mkdir(parents=True)
    target.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")

    assert GATE.main(["--root", str(tmp_path)]) == 1


def test_an_identical_schema_passes(tmp_path: Path) -> None:
    """The other half of the pair: the gate must not fail on a correct file.

    A gate that reports drift on a document that genuinely matches gets
    regenerated blindly the second time somebody sees it, and then it is
    enforcing nothing.
    """
    target = tmp_path / "learning-os" / "openapi.json"
    target.parent.mkdir(parents=True)
    target.write_text(GATE.generated(), encoding="utf-8")

    assert GATE.main(["--root", str(tmp_path)]) == 0


def test_render_is_stable_under_key_order() -> None:
    """Two documents differing only in key order must render identically.

    Without `sort_keys` an unrelated refactor that moves a route reorders the
    JSON and reports drift that is not drift. This pins the property rather than
    trusting the flag stays in the call.
    """
    first = GATE.render({"b": 1, "a": {"d": 2, "c": 3}})
    second = GATE.render({"a": {"c": 3, "d": 2}, "b": 1})
    assert first == second
    assert first.endswith("\n")


def test_write_creates_the_file_then_check_passes(tmp_path: Path) -> None:
    """`--write` and the check must agree. If they do not, the documented fix
    ("regenerate with --write") does not actually fix anything."""
    assert GATE.main(["--write", "--root", str(tmp_path)]) == 0
    assert GATE.main(["--root", str(tmp_path)]) == 0


@pytest.mark.parametrize(
    "path",
    [
        "/health",
        "/concepts",
        "/learners",
        "/learners/{learner_id}",
        "/learners/{learner_id}/mastery",
        "/learners/{learner_id}/attempts",
        "/learners/{learner_id}/next",
        "/lessons",
    ],
)
def test_the_committed_schema_describes_every_endpoint(path: str) -> None:
    """The committed file is what Phase 7 and Phase 8 read.

    Asserting the paths here rather than only in `test_routes.py` is deliberate:
    that file checks the LIVE app, this one checks the ARTEFACT. A build that
    generated the document from a partially-registered app would pass there and
    fail here.
    """
    document = json.loads(
        (REPO_ROOT / "learning-os" / "openapi.json").read_text(encoding="utf-8")
    )
    assert path in document["paths"], f"{path} is missing from the committed schema"
