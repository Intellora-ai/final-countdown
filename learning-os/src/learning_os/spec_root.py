"""Where the repository root is, resolved once.

Two test files and the CLI need to reach `frontend/` from inside `learning-os/`,
and three copies of `parents[N]` is three chances to be off by one when a file
moves. Resolved from this module's own location, which is the only thing that
cannot go stale relative to itself.
"""

from __future__ import annotations

from pathlib import Path

#: `src/learning_os/spec_root.py` -> `learning_os` -> `src` -> `learning-os` -> repo
REPO_ROOT = Path(__file__).resolve().parents[3]
