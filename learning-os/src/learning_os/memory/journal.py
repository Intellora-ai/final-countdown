"""Making the memory survive the process, without weakening what it is.

WHY A FILE AND NOT A DATABASE
-----------------------------
`MemoryStore` is an append-only log, and its docstring says why that matters:
`DecisionEvent` records the state versions a decision saw, so replaying it means
reading the log AS IT WAS. A log that can be edited afterwards records the
present, not the past, and a replay against it is a re-decision with hindsight.

An append-only file preserves that property in the storage layer instead of
merely hoping the code above it behaves. Rows are appended and never rewritten;
there is no UPDATE to misuse. A table with an id column invites exactly the edit
the design forbids, and the first person under deadline will take it.

JSONL, one record per line, because the failure modes are the mild ones: a
truncated final line from a crashed write is detectable and skippable, the file
is readable without the code that wrote it, and appending is a single syscall
with no schema to migrate when a model gains a field.

WHY THIS IS THE HOLE THAT MATTERED
----------------------------------
Everything that makes the engine non-generic is history: which mechanism already
failed on this learner, what they have been shown, what the evidence says. In
process, that worked. Between processes it evaporated, so every learner was a
stranger on every run and the fallback engine had nothing to fall back FROM.

The engine was already correct. It was just amnesiac.

WHAT IS NOT HERE, DELIBERATELY
------------------------------
No locking, no concurrent-writer support, no compaction. One learner, one
journal, one writer. Concurrency here would be a guess at a deployment shape
nobody has chosen yet, and the guess would be load-bearing before it was tested.
`open(..., "a")` on a local file is atomic enough for appends under the size of
a pipe buffer, which every record here is; that is a real guarantee, and it is
the only one being claimed.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import ActionKind, DecisionEvent, Event, Evidence

#: Record kind -> the type that rebuilds it. The kind is written into every line
#: because a JSONL file of four different shapes is otherwise unreadable without
#: guessing, and guessing from field names breaks the day two models overlap.
_KINDS = {
    "event": Event,
    "decision": DecisionEvent,
    "evidence": Evidence,
    "attempt": Attempt,
}

#: How the store holds each kind. Named once so `replay` cannot drift from
#: `MemoryStore`'s field names -- a typo here would silently drop a whole class
#: of record and the file would still look complete.
_FIELD = {
    "event": "events",
    "decision": "decisions",
    "evidence": "evidence",
    "attempt": "attempts",
}


class JournalError(RuntimeError):
    """The journal on disk cannot be trusted to describe the learner.

    Raised rather than skipped. A memory that silently drops records is worse
    than one that fails to load: the engine would carry on with a learner whose
    history is partly missing, choose a mechanism that already failed, and have
    no way to know it had. Losing the file loudly is recoverable; using half of
    it quietly is not.
    """


def _encode(kind: str, record: object) -> str:
    """One record, one line.

    THE RECORD IS STORED AS A JSON STRING, NOT AS A NESTED OBJECT.

    The models are `strict=True`, which means `model_validate` on a plain dict
    refuses to turn `"independent_application"` back into an `EvidenceStrength`
    -- correctly, because strict mode exists to stop exactly that coercion in
    live code. Pydantic's JSON mode does allow it, since a JSON document has no
    enum type to begin with.

    So the round trip has to stay inside JSON: `model_dump_json` out,
    `model_validate_json` back. Nesting the parsed dict would force a
    dict-mode read on the way in and reintroduce the failure. Discovered by the
    journal refusing to load its own output.

    `Attempt` is a dataclass and the other three are Pydantic, so encoding is
    not one call. Handled here rather than by converting `Attempt` to a model:
    changing the domain to suit the storage layer is backwards.
    """
    if is_dataclass(record) and not isinstance(record, type):
        fields: dict[str, Any] = asdict(record)
        # Enums survive `asdict` as members, which `json` refuses.
        fields = {k: (v.value if hasattr(v, "value") else v) for k, v in fields.items()}
        payload = json.dumps(fields, sort_keys=True, separators=(",", ":"))
    else:
        payload = record.model_dump_json()  # type: ignore[attr-defined]

    return json.dumps({"kind": kind, "record": payload}, sort_keys=True, separators=(",", ":"))


def append(path: Path, kind: str, record: object) -> None:
    """Add one record to the end of the journal.

    Opened and closed per call rather than holding a handle. A long-lived handle
    would buffer, and a buffered write is a record the file does not have yet --
    which is precisely the record you wanted when the process died.
    """
    if kind not in _KINDS:
        raise JournalError(f"unknown record kind {kind!r}; the journal would be unreadable")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(_encode(kind, record) + "\n")
        handle.flush()


def _decode(kind: str, raw: str) -> object:
    if kind != "attempt":
        model = _KINDS[kind]
        # JSON mode, matching how it was written. See `_encode`.
        return model.model_validate_json(raw)  # type: ignore[attr-defined]

    # `Attempt` is a plain dataclass, so it has no validator to hand the JSON to
    # and is rebuilt field by field. `evidence_ids` is retupled because JSON has
    # only lists, and the dataclass declares a tuple -- a list here would compare
    # unequal to a freshly-built Attempt and make replay look lossy.
    payload: dict[str, Any] = json.loads(raw)
    return Attempt(
        skill_id=payload["skill_id"],
        action=ActionKind(payload["action"]),
        representation=payload["representation"],
        outcome=Outcome(payload["outcome"]),
        mechanism=payload["mechanism"],
        evidence_ids=tuple(payload.get("evidence_ids") or ()),
        example_signature=payload.get("example_signature", ""),
    )


def replay(path: Path) -> MemoryStore:
    """Rebuild the store by reading the log forward.

    REPLAY, NOT LOAD. The distinction is the point: the store is reconstructed
    by applying the same records in the same order the live run applied them, so
    a store restored from disk is indistinguishable from one that never stopped.
    A snapshot-and-restore would preserve the answers and lose the history that
    produced them.

    A missing file is an empty store, not an error -- a learner's first session
    has no journal yet, and treating that as a failure would make the common
    case the exceptional one.
    """
    store = MemoryStore()
    if not path.exists():
        return store

    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        text = line.strip()
        if not text:
            continue
        try:
            entry = json.loads(text)
            kind = entry["kind"]
            record = _decode(kind, entry["record"])
        except Exception as error:
            raise JournalError(
                f"{path}:{number} is unreadable ({error}). The learner's history is "
                f"incomplete and the engine must not run on a partial one."
            ) from error
        getattr(store, _FIELD[kind]).append(record)

    return store


class JournalledMemory(MemoryStore):
    """A `MemoryStore` that also writes every record to disk.

    A SUBCLASS, AFTER TRYING COMPOSITION AND BEING WRONG ABOUT IT.

    The first version wrapped a store and forwarded reads through `__getattr__`,
    on the reasoning that inheriting would put a file handle inside an object
    every read method is tested against. That objection does not survive
    contact: `append` opens and closes per call, so there is no handle to hide.

    What the wrapper did cost was real. `__getattr__` is invisible to a type
    checker, so `JournalledMemory` was not a `MemoryStore` as far as mypy was
    concerned and could not be passed to `select_bottleneck`, `teach_next` or
    `observe` -- the three functions it exists to be passed to. Every call site
    would have needed a Protocol threaded through eleven signatures to say what
    inheritance says for free.

    Reads are inherited, so a retrieval added to `MemoryStore` tomorrow works
    here today. Only the four writers are overridden.

    Every write goes to memory FIRST and disk second. If the disk write throws,
    the in-process run continues with correct state and the caller sees the
    error, rather than diverging silently from its own record.
    """

    def __init__(self, path: Path, store: MemoryStore | None = None) -> None:
        restored = store if store is not None else replay(path)
        super().__init__(
            events=restored.events,
            decisions=restored.decisions,
            evidence=restored.evidence,
            attempts=restored.attempts,
        )
        self.path = path

    @classmethod
    def for_learner(cls, directory: Path, learner_id: str) -> JournalledMemory:
        """One journal per learner, named for them AND hashed.

        A single shared file would need every read to filter by learner, and the
        first forgotten filter mixes one learner's failure history into
        another's -- which this engine would then act on, confidently.

        THE DIGEST IS NOT DECORATION. Sanitising alone collides, measured:

            'maya/1' -> 'maya_1'   and   'maya_1' -> 'maya_1'
            'a.b'    -> 'a_b'      and   'a_b'    -> 'a_b'

        Two distinct learners, one file, silently -- the exact hazard the
        paragraph above warns about, reintroduced by the function written to
        prevent it. The digest is taken over the ORIGINAL id, so distinct ids
        cannot share a path however they sanitise. The readable prefix stays
        because a directory of bare hashes cannot be debugged.

        `sha256`, not `hash()`: the path must be identical next week and on
        another machine, and the builtin is randomised per process.
        """
        if not learner_id.strip():
            raise JournalError("a blank learner id has no journal to belong to")
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in learner_id)[:40]
        digest = hashlib.sha256(learner_id.encode("utf-8")).hexdigest()[:8]
        return cls(directory / f"{safe}-{digest}.jsonl")

    def record_event(self, event: Event) -> None:
        super().record_event(event)
        append(self.path, "event", event)

    def record_decision(self, decision: DecisionEvent) -> None:
        super().record_decision(decision)
        append(self.path, "decision", decision)

    def record_evidence(self, evidence: Evidence) -> None:
        super().record_evidence(evidence)
        append(self.path, "evidence", evidence)

    def record_attempt(self, attempt: Attempt) -> None:
        super().record_attempt(attempt)
        append(self.path, "attempt", attempt)

