"""Retrieval for questions the curriculum does not cover.

WHY THIS EXISTS
---------------
`session/doubt.py` refuses a doubt it cannot map to a skill, and that refusal
is correct: the engine must never guess. But "I would rather not guess" and "I
cannot look anything up" are different limitations, and only the first is a
principle. This module is the looking-up. With it configured, an unmappable
doubt gets one chance to become a GROUNDED answer -- written only from what was
retrieved, citing it, validated like every other lesson -- before the refusal
stands.

WHAT IT DELIBERATELY IS NOT
---------------------------
Not a page fetcher, not an extractor, not a crawler. The TypeScript side owns
that pipeline (`frontend/src/websearch`), with an injection guard and a
cross-checker this file must not half-reimplement. What a contract needs is
small: a few candidate sources with a URL, a title and a snippet, exactly the
grounding `frontend/server/handler.ts` gives lesson authoring. Snippets in, a
bounded tuple of `SourceRef` out.

THE ENV CONTRACT, MIRRORING THE FRONTEND SERVER'S
-------------------------------------------------
`LEARNING_OS_SEARCH_ENDPOINT` is a URL template; `{query}`, `{limit}` and
`{key}` are substituted url-encoded -- the same template rule as
`WEB_SEARCH_ENDPOINT` in `frontend/server/openweb.ts`, so one engine
subscription configures both halves of the product. The key is OPTIONAL here
where the frontend requires it, deliberately: keyless engines exist (Wikipedia,
a local SearxNG, the loopback engine the behave suite starts), and demanding a
key for an engine that has none would be configuration theatre. When a key is
set and the template carries no `{key}`, it is sent in headers, both spellings,
because providers disagree and this module refuses to learn their names.

Unset endpoint means NOT CONFIGURED, and `from_env` returns None rather than a
function that always fails -- the caller can then say "I cannot look things up"
instead of "the lookup broke", which are different sentences to a learner.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from typing import Any

from learning_os.llm.contract import SourceRef

__all__ = [
    "ENDPOINT_ENV",
    "KEY_ENV",
    "MAX_SOURCES",
    "SearchFn",
    "from_env",
    "sources_from",
]

ENDPOINT_ENV = "LEARNING_OS_SEARCH_ENDPOINT"
KEY_ENV = "LEARNING_OS_SEARCH_API_KEY"

#: How many sources may enter a contract. A contract must stay small enough to
#: be read whole, and `SourceRef.snippet` is capped at 1,000 characters -- four
#: of those is grounding; forty would be a document dump.
MAX_SOURCES = 4

#: How many candidates to ask the engine for. More than will be kept, because
#: several of the top hits will carry no snippet worth grounding on.
_ASK_FOR = 8

#: Long enough for a search engine, short enough not to hang a learner who is
#: waiting on an answer that will otherwise be a refusal.
_TIMEOUT_SECONDS = 10.0

SearchFn = Callable[[str], tuple[SourceRef, ...]]


def _str(value: object) -> str:
    return value if isinstance(value, str) else ""


def _as_record(value: object) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _hits_in(body: object, depth: int = 0) -> list[dict[str, str]]:
    """Every result-shaped entry in a provider response, whatever it is called.

    The same depth-limited walk as `openweb.ts`'s `findHits`, for the same
    reason: the moment this file contains `body["web"]["results"]`, swapping
    engines is a code change, and an unbounded walk over attacker-influenced
    JSON is a denial of service waiting to be reported.
    """
    if depth > 4:
        return []

    if isinstance(body, list):
        found: list[dict[str, str]] = []
        for item in body:
            record = _as_record(item)
            if record is None:
                continue
            url = _str(record.get("url")) or _str(record.get("link")) or _str(record.get("href"))
            if not url.startswith(("http://", "https://")):
                continue
            found.append(
                {
                    "url": url,
                    "title": _str(record.get("title")) or _str(record.get("name")) or url,
                    "snippet": (
                        _str(record.get("snippet"))
                        or _str(record.get("description"))
                        or _str(record.get("content"))
                        or _str(record.get("extract"))
                    ),
                }
            )
        return found

    record = _as_record(body)
    if record is None:
        return []

    # Ordered so the obvious names win before the walk starts guessing.
    for key in ("results", "web", "items", "data", "organic", "value"):
        found = _hits_in(record.get(key), depth + 1)
        if found:
            return found
    for value in record.values():
        found = _hits_in(value, depth + 1)
        if found:
            return found
    return []


def _default_fetch_json(url: str, headers: Mapping[str, str]) -> object:
    request = urllib.request.Request(url, headers=dict(headers), method="GET")
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def sources_from(
    query: str,
    *,
    endpoint: str,
    key: str = "",
    fetch_json: Callable[[str, Mapping[str, str]], object] | None = None,
) -> tuple[SourceRef, ...]:
    """The engine's answer to one question, as contract-ready sources.

    Returns an EMPTY tuple both for "the web has nothing" and for "the engine
    could not be reached" -- deliberately, and unlike the frontend route, which
    must tell those apart for a caller that renders the difference. Here the
    caller has exactly one decision: ground the answer, or refuse as it always
    has. An unreachable engine and an empty web both resolve it the same way,
    and a learner is never told the machinery's biography either way.
    """
    url = (
        endpoint.replace("{query}", urllib.parse.quote(query))
        .replace("{limit}", str(_ASK_FOR))
        .replace("{key}", urllib.parse.quote(key))
    )
    carries_key = "{key}" in endpoint
    headers: dict[str, str] = {"Accept": "application/json"}
    if key and not carries_key:
        # Both spellings, as `openweb.ts` sends them: providers disagree, and a
        # provider ignores the header it does not know.
        headers["X-Subscription-Token"] = key
        headers["Authorization"] = f"Bearer {key}"

    # Resolved at CALL time, not bound at def time. A default parameter holds
    # the function object it saw when this module loaded, which quietly defeats
    # any later injection of the transport -- the exact pitfall a test caught.
    fetch = fetch_json if fetch_json is not None else _default_fetch_json
    try:
        body = fetch(url, headers)
    except Exception:
        return ()

    out: list[SourceRef] = []
    for hit in _hits_in(body):
        if not hit["snippet"].strip():
            # A source with nothing quotable grounds nothing; the validator
            # would let the model cite it while saying anything at all.
            continue
        out.append(
            SourceRef(
                url=hit["url"][:500],
                title=hit["title"][:300],
                snippet=hit["snippet"][:1000],
            )
        )
        if len(out) == MAX_SOURCES:
            break
    return tuple(out)


def from_env(env: Mapping[str, str] | None = None) -> SearchFn | None:
    """The configured search, or None -- never a function that always fails.

    Blank and whitespace-only count as unset, the same rule
    `frontend/server/provider.ts` states for every credential it reads.
    """
    source = os.environ if env is None else env
    endpoint = (source.get(ENDPOINT_ENV) or "").strip()
    if not endpoint:
        return None
    key = (source.get(KEY_ENV) or "").strip()

    def search(query: str) -> tuple[SourceRef, ...]:
        return sources_from(query, endpoint=endpoint, key=key)

    return search
