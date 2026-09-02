"""The failure envelope, for the Python suites: the same four kinds as
`frontend/scripts/failure-envelope.mjs`, decided by the same sentences.

WHY THIS EXISTS. Measured on one pull request: a socket guard inside a test
and a vendor quota each cost a full CI round -- eleven minutes -- purely to
LEARN what had failed, because the reason lived only in a job log GitHub shows
to admins. The process that failed had the reason in memory the whole time.

So every failing test is described once, structurally, by the process that saw
it: a stable fingerprint, one of four kinds (CODE, ENVIRONMENT, EXTERNAL,
FLAKE), and the exact command that reproduces it -- and both a `::error`
annotation on the run and `test-results/failures.json` on disk carry it.
Nothing here decides pass or fail.

A PURE MODULE, so every rule is assertable in `test_failure_envelope.py`.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

KINDS = ("CODE", "ENVIRONMENT", "EXTERNAL", "FLAKE")

#: Each pattern is a sentence a real red run printed. Order matters: an EPERM on
#: bind() is an environment fact even when the test then reports a timeout.
_ENVIRONMENT = (
    re.compile(r"\bEPERM\b"),
    re.compile(r"\bEACCES\b"),
    re.compile(r"operation not permitted", re.IGNORECASE),
    re.compile(r"\bEADDRINUSE\b"),
    re.compile(r"No module named"),
    re.compile(r"not importable", re.IGNORECASE),
    re.compile(r"a test tried to open a network connection"),
    re.compile(r"forbids binding a loopback socket"),
    re.compile(r"command not found"),
)
_EXTERNAL = (
    re.compile(r"\b429\b"),
    re.compile(r"RESOURCE_EXHAUSTED"),
    re.compile(r"\bquota\b", re.IGNORECASE),
    re.compile(r"rate limit", re.IGNORECASE),
    re.compile(r"Retry-After", re.IGNORECASE),
    re.compile(r"\bECONNRESET\b|\bETIMEDOUT\b|\bENOTFOUND\b|\bEAI_AGAIN\b"),
    re.compile(r"API_KEY_INVALID"),
    re.compile(r"the model could not be reached"),
)

#: Suites that need a socket, a browser or a second process: not for the sandbox.
_NEEDS_A_REAL_MACHINE = re.compile(r"(tests/db/|test_grounded_answer|features/|loopback|_socket)")


@dataclass(frozen=True, slots=True)
class Classification:
    kind: str
    confidence: float
    evidence: str


@dataclass(frozen=True, slots=True)
class Reproduction:
    command: str
    runner: str


@dataclass(frozen=True, slots=True)
class Envelope:
    schema: int
    commit: str
    runner: str
    test: str
    file: str
    fingerprint: str
    classification: Classification
    error_class: str
    headline: str
    frame: str
    reproduction: Reproduction

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    def title(self, prefix: str) -> str:
        return f"{prefix} [{self.fingerprint} {self.classification.kind}]"

    def trailer(self) -> str:
        """One line: the facts a router needs, JSON, no newlines."""
        return "envelope: " + json.dumps(
            {
                "fingerprint": self.fingerprint,
                "kind": self.classification.kind,
                "confidence": self.classification.confidence,
                "evidence": self.classification.evidence,
                "reproduce": self.reproduction.command,
                "runner": self.reproduction.runner,
            },
            ensure_ascii=True,
        )


def headline(message: str) -> str:
    for line in str(message).split("\n"):
        if line.strip():
            return line.strip()
    return ""


_CLASS = re.compile(r"^([A-Za-z_][\w.]*(?:Error|Exception|Refused|Timeout|Unavailable))\b")


def error_class(message: str) -> str:
    head = headline(message)
    found = _CLASS.match(head)
    return found.group(1) if found else head[:40]


_FRAME = re.compile(r"(?:File \"|^\s*)((?:/|[A-Za-z]:\\)[^\s\":]+)\"?,? (?:line )?(\d+)")
_RELATIVE = re.compile(r"((?:learning-os|tests|features|scripts)/[^\s\":]+)[\":, ]+(?:line )?(\d+)")


def top_frame(message: str) -> str:
    """The first frame that is not runner machinery, repository-relative."""
    for line in str(message).split("\n"):
        found = _FRAME.search(line) or _RELATIVE.search(line)
        if not found:
            continue
        path = found.group(1).replace("\\", "/")
        if "site-packages" in path or "/_pytest/" in path or "/pluggy/" in path:
            continue
        for marker in ("/learning-os/", "/tests/", "/features/", "/scripts/"):
            at = path.rfind(marker)
            if at != -1:
                path = path[at + 1 :]
                break
        return f"{path}:{found.group(2)}"
    return ""


def fingerprint(test: str, message: str) -> str:
    """Stable across machines: the test, the error class and the top frame --
    never the message text, whose ports, paths and timestamps change per run."""
    material = f"{test}|{error_class(message)}|{top_frame(message)}"
    return "FP-" + hashlib.sha1(material.encode("utf-8")).hexdigest()[:6]


def classify(
    message: str, fp: str = "", known: dict[str, dict[str, str]] | None = None
) -> Classification:
    text = str(message)
    for pattern in _ENVIRONMENT:
        found = pattern.search(text)
        if found:
            return Classification("ENVIRONMENT", 0.95, found.group(0))
    for pattern in _EXTERNAL:
        found = pattern.search(text)
        if found:
            return Classification("EXTERNAL", 0.9, found.group(0))
    if fp and known and fp in known:
        return Classification("FLAKE", 0.8, known[fp].get("reason", "recorded flake"))
    return Classification("CODE", 0.6, headline(text)[:120])


def reproduction(runner: str, file: str, test: str, kind: str) -> Reproduction:
    needs_machine = bool(_NEEDS_A_REAL_MACHINE.search(file)) or kind == "ENVIRONMENT"
    where = "cloud-network" if needs_machine else "sandbox"
    # Backslashes first, then quotes -- the order CodeQL held the JS twin to.
    quoted = '"' + test.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if runner == "pytest":
        prefix = "cd learning-os && " if file.startswith("learning-os/") else ""
        return Reproduction(f"{prefix}pytest {quoted}", where)
    if runner == "behave":
        return Reproduction(f"behave features/ -n {quoted}", where)
    return Reproduction(f"# rerun {file}: {test}", where)


def envelope(
    *,
    runner: str,
    test: str,
    file: str,
    message: str,
    known: dict[str, dict[str, str]] | None = None,
    commit: str = "",
) -> Envelope:
    fp = fingerprint(test, message)
    classification = classify(message, fp, known)
    return Envelope(
        schema=1,
        commit=commit,
        runner=runner,
        test=test,
        file=file,
        fingerprint=fp,
        classification=classification,
        error_class=error_class(message),
        headline=headline(message)[:300],
        frame=top_frame(message),
        reproduction=reproduction(runner, file, test, classification.kind),
    )


def known_failures(path: Path) -> dict[str, dict[str, str]]:
    """`known-failures.json`, or nothing: a missing or unreadable file is no flakes."""
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(loaded, dict):
        return {}
    out: dict[str, dict[str, str]] = {}
    for key, value in loaded.items():
        if isinstance(key, str) and key.startswith("FP-") and isinstance(value, dict):
            out[key] = {str(k): str(v) for k, v in value.items()}
    return out


def workflow_command(level: str, file: str, line: int | None, title: str, message: str) -> str:
    """A GitHub workflow command, escaped per its rules: `%`, CR and LF in every
    value, plus `:` and `,` inside a property."""

    def data(text: str) -> str:
        return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")

    def prop(text: str) -> str:
        return data(text).replace(":", "%3A").replace(",", "%2C")

    parts = []
    if file:
        parts.append(f"file={prop(file)}")
    if line:
        parts.append(f"line={line}")
    parts.append(f"title={prop(title)}")
    return f"::{level} {','.join(parts)}::{data(message)}"


def record(envelopes: list[Envelope], out_dir: Path) -> None:
    """`test-results/failures.json`: the envelopes on disk, for a rerun to read
    back. Never raises -- the annotation already carried the facts."""
    if not envelopes:
        return
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "failures.json").write_text(
            json.dumps({"schema": 1, "failures": [e.as_dict() for e in envelopes]}, indent=2)
            + "\n",
            encoding="utf-8",
        )
    except OSError:
        pass
