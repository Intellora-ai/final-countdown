# THE LOCAL COMMAND INTERFACE.
#
# Before this file existed there was no Makefile, justfile, Taskfile, tox.ini, noxfile or
# pre-commit config in this repository -- verified, not assumed. So the only way to answer "run what
# CI runs" was to retype a list from memory, and on 2026-08-20 that list dropped `pyright`, one of
# the seventeen required contexts. Four CI runs went red.
#
# Every target below that runs checks derives its selection from ci/local-execution.toml. None of
# them hardcodes a gate list, because a hardcoded list is a second copy that drifts.
#
# WHAT THIS INTERFACE DOES NOT CLAIM. A local pass is a PARTIAL result. Nine of the seventeen
# required contexts cannot honestly run here -- AXLE needs a hosted service, CodeQL is produced by
# GitHub, e2e needs a browser binary outside the lockfiles -- and each prints its exact reason
# before any gate executes. GitHub remains the merge proof.
#
# There are deliberately no sandbox-up / sandbox-down / sandbox-reset / sandbox-logs targets. This
# repository has no database, queue, port, volume or container to start or stop. A target that
# exists only to print NOT_APPLICABLE is still a placeholder, and placeholders rot.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

VENV       := .venv
PY         := $(VENV)/bin/python3
SYS_PY     := python3
RUN_ID     := $(shell date -u +%Y%m%d-%H%M%S)

.PHONY: help doctor bootstrap typecheck test test-axle deep-verify \
        sandbox-fast sandbox-test sandbox-verify-determinism

help:
	@echo "Local interface. Selection comes from ci/local-execution.toml, never from memory."
	@echo ""
	@echo "  make doctor        prerequisites; works WITHOUT the venv; non-zero on a mandatory gap"
	@echo "  make bootstrap     create .venv from lockfiles only, install the pre-push hook"
	@echo "  make sandbox-fast  the pre-push set (includes pyright, always)"
	@echo "  make sandbox-test  every locally runnable required context"
	@echo "  make typecheck     pyright alone"
	@echo "  make test          pytest, no network:  -m 'not axle'"
	@echo "  make test-axle     AXLE opt-in; this one DOES reach the network"
	@echo "  make deep-verify   the deep lane; DOES reach AXLE. Five categories, one verdict each"
	@echo "  make sandbox-verify-determinism   run the contract twice and compare"

# doctor deliberately uses the SYSTEM python: its job is to report that the venv is missing,
# which it cannot do if it needs the venv to start.
doctor:
	@$(SYS_PY) scripts/local_gates.py --doctor

bootstrap:
	@$(SYS_PY) scripts/local_gates.py --bootstrap

typecheck:
	@$(PY) -m pyright scripts/ tests/ src/

# No network. `-m "not axle"` is the boundary, and it is the default on purpose.
test:
	@$(PY) -m pytest -n auto --dist loadfile -m "not axle"

# The one target that reaches the hosted AXLE service. Never a dependency of anything else.
test-axle:
	@echo "NOTE: this target calls the hosted AXLE service at https://axle.axiommath.ai"
	@$(PY) -m pytest -m axle

# THE REVIEW, RUN LOCALLY, BECAUSE THE CI REVIEWER HAS NEVER ONCE WORKED.
#
# Counted on 2026-08-25 over every comment the CI reviewer has posted to this
# repository: {"total": 80, "errors": 80}. All eighty read "Claude encountered
# an error after 0s". The job authenticates with CLAUDE_CODE_OAUTH_TOKEN, the
# API rejects it in 69ms for $0, and `ai-review` is declared mandatory = false,
# so nothing blocked and nobody noticed for eighty pull requests.
#
# This route needs no secret. It runs through the developer's own logged-in
# Claude Code, so there is nothing in a repository setting left to expire.
#
# NOT A DEPENDENCY OF sandbox-fast, and that is deliberate. sandbox-fast runs in
# CI, where no interactive login exists, so wiring the review into it would make
# every CI run block on a reviewer that cannot possibly authenticate there.
# This target is for the pre-push loop and for running by hand.
#
# Exit 1 means the push should stop. See scripts/review_gate.py for what is
# enforced (a review RAN and was READ) and what deliberately is not (whether
# Claude liked the code).
review:
	@$(PY) scripts/review_gate.py --range $(or $(RANGE),origin/main...HEAD) < /dev/null

sandbox-fast:
	@$(PY) scripts/local_gates.py --tier fast --run-id $(RUN_ID)

sandbox-test:
	@$(PY) scripts/local_gates.py --tier full --run-id $(RUN_ID)

# THE DEEP LANE. The one target besides test-axle that reaches the network, and the only
# place the AXLE integration boundary is exercised. `sandbox-fast` excludes every
# network-requiring check in local_gates.select(), so this being reachable from here does
# not make it reachable from the pre-push loop.
#
# Every component runs; none is skipped because an earlier one failed. Stopping early
# would leave four categories unmeasured while still reporting a verdict about the tree.
deep-verify:
	@$(PY) scripts/local_gates.py --deep --run-id $(RUN_ID)

sandbox-verify-determinism:
	@$(PY) scripts/local_gates.py --determinism --run-id $(RUN_ID)
