"""Loopback is allowed here, and nothing else is.

WHY THIS FILE EXISTS AT ALL
---------------------------
`tests/conftest.py` installs an autouse `_no_network` fixture that refuses every
socket connection, and its docstring says why: "so a new test file cannot opt out
by forgetting to ask."

Pact provider verification cannot work under that. Verifying a provider means
replaying recorded requests against a RUNNING provider, over HTTP. There is no
in-process transport for it -- the verifier is a compiled core that speaks to a
URL. So this directory needs a socket, and the honest question is which one.

WHAT IS NARROWED, RATHER THAN REMOVED
-------------------------------------
The obvious move is to override `_no_network` with a fixture that does nothing.
That would remove the guarantee for this directory entirely: a test here could
then call a real Anthropic endpoint and nothing would notice.

So the override is narrower than the original rather than absent. Connections to
LOOPBACK are permitted -- 127.0.0.1 and ::1, which is the provider this test
starts itself, on a port it chose. Every other destination raises exactly as
before.

The property the original fixture protects is "this suite never talks to
something outside this machine". That property still holds. What changed is that
"outside this machine" is now stated precisely instead of being approximated by
"no sockets at all".

`test_the_guard_still_refuses_a_non_loopback_address` in test_provider.py proves
the refusal half still works. A narrowed guard asserted only to ALLOW is a guard
that has been switched off with extra steps.
"""

from __future__ import annotations

import socket
from collections.abc import Iterator
from typing import Any, NoReturn

import pytest

#: Hosts this directory may connect to. Nothing else, in either family.
LOOPBACK = frozenset({"127.0.0.1", "::1", "localhost"})


def _is_loopback(address: Any) -> bool:
    """True only for a loopback destination.

    Written defensively: a socket address is a tuple whose shape differs between
    IPv4 and IPv6, and anything unrecognised is treated as NOT loopback. The
    failure mode of guessing wrong in the permissive direction is a test that
    silently reaches the internet.
    """
    if not isinstance(address, tuple) or not address:
        return False
    host = address[0]
    return isinstance(host, str) and host in LOOPBACK


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Overrides the suite-wide fixture of the same name, and narrows it.

    Same name on purpose: pytest resolves the nearest conftest, so this replaces
    the parent's autouse fixture for this directory only. Every other directory
    keeps the absolute refusal.
    """
    real_connect = socket.socket.connect
    real_create = socket.create_connection

    def guarded_connect(self: socket.socket, address: Any) -> Any:
        if _is_loopback(address):
            return real_connect(self, address)
        _refuse(address)

    def guarded_create(address: Any, *args: Any, **kwargs: Any) -> Any:
        if _is_loopback(address):
            return real_create(address, *args, **kwargs)
        _refuse(address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect, raising=True)
    monkeypatch.setattr(socket, "create_connection", guarded_create, raising=True)
    yield


def _refuse(address: Any) -> NoReturn:
    raise AssertionError(
        f"a test tried to connect to {address!r}, which is not loopback.\n"
        "tests/contract permits connections to 127.0.0.1 only, because Pact "
        "provider verification replays recorded requests against a provider "
        "this test starts itself. Everything beyond this machine is refused "
        "here exactly as it is in the rest of the suite."
    )
