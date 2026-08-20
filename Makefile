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

.PHONY: help doctor bootstrap typecheck test test-axle \
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

sandbox-fast:
	@$(PY) scripts/local_gates.py --tier fast --run-id $(RUN_ID)

sandbox-test:
	@$(PY) scripts/local_gates.py --tier full --run-id $(RUN_ID)

sandbox-verify-determinism:
	@$(PY) scripts/local_gates.py --determinism --run-id $(RUN_ID)
