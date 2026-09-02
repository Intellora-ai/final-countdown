"""Failure memory: a fingerprint seen before brings back what fixed it.

Nothing is inferred. Only what a completed task recorded -- its hypothesis,
the commit that fixed it -- is replayed when the flight recorder's fingerprint
appears again. Both directions: a recorded fingerprint recalls its record, an
unknown one recalls nothing, and a broken record file is skipped.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from harness.memory import fingerprints_in, recall, remember  # noqa: E402


def test_fingerprints_are_found_in_annotations_and_envelopes() -> None:
    text = (
        "::error title=M4 [FP-82c05b CODE]::x\n"
        'envelope: {"fingerprint": "FP-c6bfed", "kind": "CODE"}\n'
        "[FP-82c05b CODE] again\n"
    )
    assert fingerprints_in(text) == ["FP-82c05b", "FP-c6bfed"]


def test_no_fingerprint_means_none() -> None:
    assert fingerprints_in("5 passed in 0.1s") == []
    assert fingerprints_in("FP-xyz not a fingerprint; FP-12345 too short") == []


def test_remember_writes_one_record_per_fingerprint(tmp_path: Path) -> None:
    remember(tmp_path, ["FP-82c05b", "FP-c6bfed"], root_cause="lock released early", fix_commit="50c6d446",
             title="M4 locked", now="2026-09-02T10:00:00+00:00")
    files = sorted(p.name for p in (tmp_path / "memory").iterdir())
    assert files == ["FP-82c05b.json", "FP-c6bfed.json"]
    record = json.loads((tmp_path / "memory" / "FP-82c05b.json").read_text(encoding="utf-8"))
    assert record == {
        "fingerprint": "FP-82c05b", "root_cause": "lock released early", "fix_commit": "50c6d446",
        "title": "M4 locked", "at": "2026-09-02T10:00:00+00:00",
    }


def test_recall_returns_only_what_was_recorded(tmp_path: Path) -> None:
    remember(tmp_path, ["FP-82c05b"], root_cause="x", fix_commit="c", title="t", now="n")
    found = recall(tmp_path, ["FP-82c05b", "FP-000000"])
    assert [r["fingerprint"] for r in found] == ["FP-82c05b"]
    assert recall(tmp_path, ["FP-000000"]) == []
    assert recall(tmp_path, []) == []


def test_a_broken_record_is_skipped_not_fatal(tmp_path: Path) -> None:
    (tmp_path / "memory").mkdir()
    (tmp_path / "memory" / "FP-82c05b.json").write_text("{broken", encoding="utf-8")
    assert recall(tmp_path, ["FP-82c05b"]) == []


def test_remembering_again_keeps_the_latest(tmp_path: Path) -> None:
    remember(tmp_path, ["FP-82c05b"], root_cause="first guess", fix_commit="a", title="t", now="1")
    remember(tmp_path, ["FP-82c05b"], root_cause="the real cause", fix_commit="b", title="t", now="2")
    [record] = recall(tmp_path, ["FP-82c05b"])
    assert record["root_cause"] == "the real cause" and record["fix_commit"] == "b"
