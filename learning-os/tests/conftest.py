"""The suite runs offline, and this is what makes that true.

WHY THIS IS A FIXTURE AND NOT A CI STEP
---------------------------------------
"The tests do not need a network" is a claim that decays. Someone adds a real
provider adapter, writes one integration test against it, and the suite still
passes locally on a machine with wifi -- the claim is now false and nothing
said so. Enforcing it only in CI catches that a day later, on someone else's
branch, with a confusing error.

Blocking the socket here means the guard is present in every run, including the
first local one that would have introduced the dependency, and the failure names
the actual cause.

This matters more than it looks. The tests asserting the engine refuses to
fabricate confidence are exactly the ones that get skipped when a suite starts
needing a key that has expired -- so the offline property protects the honesty
properties.
"""

from __future__ import annotations

import socket
from collections.abc import Iterator
from typing import NoReturn

import pytest


def _refuse(*_args: object, **_kwargs: object) -> NoReturn:
    raise AssertionError(
        "a test tried to open a network connection. The learning-os suite must "
        "run offline: the LLM is a deterministic fake and every verifier is "
        "local. If you are adding a real provider, put it behind an adapter and "
        "test the adapter with a recorded fixture, not a live call."
    )


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Autouse, so a new test file cannot opt out by forgetting to ask.

    `create_connection` is patched as well as `socket.connect`, because the
    higher-level helper does not always route through the method on the way to
    the syscall, and patching only one of them leaves a hole that looks closed.
    """
    monkeypatch.setattr(socket.socket, "connect", _refuse, raising=True)
    monkeypatch.setattr(socket, "create_connection", _refuse, raising=True)
    yield
