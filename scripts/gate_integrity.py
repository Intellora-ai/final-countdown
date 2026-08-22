#!/usr/bin/env python3
"""GATE INTEGRITY — the guard on the guard.

Asserts the verification system still matches ci/gates.toml BEFORE any result
from it is worth reading. Deleting a gate's step leaves the job green, the
required check green, and the gate gone; nothing else in the system notices.

WHY THIS PARSES YAML INSTEAD OF SEARCHING TEXT.
The previous version asked whether a workflow file CONTAINED the gate's
command. Containment is not execution. All of these contain it and none of
them run it:

    - run: python3 scripts/axle_gate.py
      if: false                        # never runs, job still green
    - run: echo python3 scripts/axle_gate.py
    - run: python3 scripts/axle_gate.py || true

So the structure is parsed, the gate's step is located as an object, and the
properties that decide whether it executes — and whether its failure survives
— are checked on that object. A conditioned-away step is now the same finding
as a deleted one, because it has the same consequence.

Checks, per mandatory gate:

  1. the workflow parses, and declares the job id the ruleset requires
  2. the job carries no `if:` unless ci/gates.toml declares one for it
  3. the job carries no continue-on-error
  4. a step actually invokes the gate's command
  5. that step carries no `if:` — a conditioned gate is a deleted gate
  6. that step carries no continue-on-error, and does not suppress failure
  7. the job uploads the gate's declared artifact, with `if: always()` and
     `if-no-files-found: error`, so evidence that never appears is loud

And across the repository:

  8. every scripts/… path any workflow invokes exists
  9. the manifest's required_checks equals its own mandatory gate set
 10. no doc tells anyone to run a verifier that no longer exists

Check 9 is self-consistency only. Proving the manifest matches the LIVE GitHub
ruleset needs an API call with admin access: scripts/check_ruleset.py.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate import Gate  # noqa: E402

MANIFEST = Path("ci/gates.toml")
WORKFLOWS = Path(".github/workflows")
DOCS = (Path("README.md"), Path("evidence.md"))

# Shell control operators after which the gate no longer decides the step's
# exit status. This replaced `re.compile(r"\|\|\s*(true|echo|:)")`, which
# enumerated three right-hand sides: measured on this repository, `|| true`
# was caught while `|| exit 0`, `|| /bin/true`, `; true` and `| cat` each left
# gate_integrity at exit 0 with zero findings. What follows the operator was
# never the point — the operator is.
#
# `&&` is deliberately absent. `gate && next` still fails the step when the
# gate fails, so it does not suppress anything; treating it as suppression
# would be a false positive, and a false positive is how a check gets deleted.
SUPPRESSORS = frozenset({"||", ";", "|", "&"})

# `${{ … }}` is evaluated by GitHub before any shell exists, so operators
# inside one are not shell operators. The repository's own
# `--base origin/${{ github.base_ref || 'main' }}` is a default value, not a
# suppressed command, and flagging it would be exactly the false positive
# above. NOTE the limit: this masks the expression, it does not judge it.
# Whether attacker-controlled text may be interpolated into a `run:` at all is
# CodeQL's `actions` pack and tests/test_ci_integrity.py's job, not this one's.
GITHUB_EXPR = re.compile(r"\$\{\{.*?\}\}", re.DOTALL)


def steps_of(job: dict[str, Any]) -> list[dict[str, Any]]:
    raw = job.get("steps")
    if not isinstance(raw, list):
        return []
    steps = cast("list[Any]", raw)
    return [cast("dict[str, Any]", s) for s in steps if isinstance(s, dict)]


# Programs that may legitimately launch a gate. Anything else in command
# position is not an invocation — `echo python3 scripts/axle_gate.py` contains
# the command and runs nothing, which is the exact "containment is not
# execution" failure this checker exists to catch. An allowlist rather than a
# denylist of printers, because an unknown launcher must fail closed.
LAUNCHERS = {
    "python",
    "python3",
    "bash",
    "sh",
    "pytest",
    "pyright",
    "bandit",
    "coverage",
    "mutmut",
    "npm",
    "npx",
}


Word = tuple[str, bool]  # (text, any of it came from inside quotes)
Segment = list[Word]


def mask_expressions(text: str) -> str:
    """Blank the contents of every `${{ … }}`, keeping it one word."""
    return GITHUB_EXPR.sub("${{}}", text)


def lex(line: str) -> tuple[list[Segment], list[str]]:
    """Split ONE shell line into command segments and the operators between.

    Quoting is tracked, because the two things this checker gets wrong when it
    ignores quotes are both fatal:

      * a `#` INSIDE quotes is not a comment, and a `#` outside them starts one
        that reaches the end of the line. The previous version skipped only
        lines that BEGAN with `#`, so `pytest --cov-fail-under=0 # was
        --cov-fail-under=95` satisfied the coverage gate at a 0% floor.
      * a token inside quotes is an argument's text, never something the shell
        will execute: `python3 -c "print('scripts/axle_gate.py')"` runs no gate.

    Each word carries whether any of its characters came from inside quotes,
    so command matching can refuse the quoted ones.
    """
    segments: list[Segment] = [[]]
    operators: list[str] = []
    word = ""
    quoted = False  # some of this word came from inside quotes
    started = False  # a word is being accumulated right now
    single = double = False
    i, n = 0, len(line)

    def flush() -> None:
        nonlocal word, quoted, started
        if started:
            segments[-1].append((word, quoted))
        word, quoted, started = "", False, False

    while i < n:
        ch = line[i]
        if single:
            started, quoted = True, True
            single = ch != "'"
            word += "" if ch == "'" else ch
        elif double:
            started, quoted = True, True
            if ch == '"':
                double = False
            elif ch == "\\" and i + 1 < n:
                i += 1
                word += line[i]
            else:
                word += ch
        elif ch == "'":
            single = started = quoted = True
        elif ch == '"':
            double = started = quoted = True
        elif ch == "\\" and i + 1 < n:
            i += 1
            word += line[i]
            started = True
        elif ch.isspace():
            flush()
        elif ch == "#" and not started:
            break  # unquoted comment: nothing after it runs
        elif ch in ";|&":
            flush()
            operator = ch
            if ch in "|&" and i + 1 < n and line[i + 1] == ch:
                i += 1
                operator = ch * 2
            operators.append(operator)
            segments.append([])
        else:
            word += ch
            started = True
        i += 1
    flush()
    return segments, operators


def word_satisfies(argv_word: str, token_word: str) -> bool:
    """Does one argv word supply one word of the token?

    Equality, or — only for a token word carrying no path of its own — that
    word reached by a path. `scripts/run_gate.py` supplies `run_gate.py`,
    which is how ci/gates.toml spells the pyright token, and
    `/usr/bin/shellcheck` supplies `shellcheck`.

    A token word that already names a path must match exactly, because the
    relaxation would otherwise accept a DIFFERENT file with the same tail:
    `evil/scripts/axle_gate.py` is not `scripts/axle_gate.py`, and check 8
    would not notice — it only asserts that `scripts/axle_gate.py` exists,
    which it does.

    Both ends are anchored either way, so `print('scripts/axle_gate.py')`
    supplies nothing: containment is not execution, and that includes
    containment inside a longer word.
    """
    if argv_word == token_word:
        return True
    return "/" not in token_word and argv_word.endswith("/" + token_word)


def segment_runs(segment: Segment, token_words: list[str]) -> bool:
    """Does this one command run the token, in COMMAND POSITION?

    Two requirements, and the second is the one that was missing. The command
    word must be the token itself or a known launcher — that part is old. The
    token must then appear as a contiguous run of UNQUOTED words inside that
    command's own argv. The previous version required only that the line begin
    with a launcher and that the token appear somewhere on it, which is how a
    trailing comment and a quoted string both counted as invocations.
    """
    if not segment or not token_words:
        return False
    # `VAR=x cmd …` — step past leading environment assignments.
    i = 0
    while (
        i < len(segment) and "=" in segment[i][0] and not segment[i][0].startswith("-")
    ):
        i += 1
    if i >= len(segment):
        return False
    head, head_quoted = segment[i]
    if head_quoted or not (word_satisfies(head, token_words[0]) or head in LAUNCHERS):
        return False
    argv = segment[i:]
    return any(
        all(
            not argv[start + k][1]
            and word_satisfies(argv[start + k][0], token_words[k])
            for k in range(len(token_words))
        )
        for start in range(len(argv) - len(token_words) + 1)
    )


def logical_lines(run: str) -> list[str]:
    """Physical lines joined across trailing backslash continuations.

    The shell sees `echo \\` and the line under it as ONE command. Judging
    them separately hands the second line its own command position, and its
    first word is then whatever the attacker put there:

        echo \\
          --cov-fail-under=95

    satisfied the coverage gate while running `echo`. Joining is also the
    conservative direction for the legitimate case — a wrapped
    `python3 … pytest \\ / --cov-fail-under=95` keeps `python3` as its head.
    """
    joined: list[str] = []
    pending = ""
    for line in run.splitlines():
        stripped = line.rstrip()
        # An ODD number of trailing backslashes continues the line; an even
        # number is escaped backslashes and ends it.
        trailing = len(stripped) - len(stripped.rstrip("\\"))
        if trailing % 2 == 1:
            pending += stripped[:-1] + " "
            continue
        joined.append(pending + line)
        pending = ""
    if pending:
        joined.append(pending)
    return joined


def line_executes(line: str, token_words: list[str]) -> bool:
    return any(segment_runs(seg, token_words) for seg in lex(mask_expressions(line))[0])


def executes(run: str, token: str) -> bool:
    """Does `run` actually EXECUTE something containing `token`?"""
    token_words = token.split()
    if not token_words:
        return False
    return any(line_executes(line, token_words) for line in logical_lines(run))


def suppressors(line: str) -> list[str]:
    """Operators on `line` that take the verdict away from the gate command.

    Positional, not lexical. The gate must be the last thing on its line that
    can decide the step's exit status, so what matters is that an operator is
    there at all — never the spelling of whatever follows it.
    """
    return [op for op in lex(mask_expressions(line))[1] if op in SUPPRESSORS]


def errexit_change(words: list[str]) -> bool | None:
    """True if this command turns errexit on, False off, None if unrelated."""
    if not words or words[0] != "set":
        return None
    state: bool | None = None
    i = 1
    while i < len(words):
        word = words[i]
        if word in {"-o", "+o"} and i + 1 < len(words):
            if words[i + 1] == "errexit":
                state = word == "-o"
            i += 2
            continue
        if word[:1] in {"-", "+"} and "e" in word[1:]:
            state = word.startswith("-")
        i += 1
    return state


def chain_without_errexit(run: str, token_words: list[str]) -> bool:
    """True when the gate runs inside a `bash -c` that never enables errexit.

    THE ASYMMETRY THIS EXISTS FOR. `errexit_off_at` below can only report a
    `set +e` that is PRESENT. It has no way to report a `set -e` that is
    ABSENT, because in a `run:` block errexit is never absent -- GitHub starts
    one as `bash -e {0}`.

    `bash -c` breaks that assumption. It starts with errexit OFF, so a chain
    of verifications runs every command regardless of what failed and exits
    with the LAST command's status. Since the last command in each of these
    chains is the one that writes the report, the gate would report PASS over
    a chain whose earlier verifications all failed.

    Checked structurally rather than by searching the whole script for the
    string, so `# set -e` in a comment, `echo "set -e"`, or a `set -e` that
    appears only AFTER the gate's own line does not satisfy it.
    """
    for line in logical_lines(run):
        if not line_executes(line, token_words):
            continue
        # The gate runs on this line. If it is not a `bash -c`, the `run:`
        # block's own errexit applies and there is nothing to arm.
        words = [
            w for segment in lex(mask_expressions(line))[0] for w, _quoted in segment
        ]
        if not any(w.endswith("bash") or w.endswith("sh") for w in words):
            return False
        if "-c" not in words:
            return False
        # The script is the argument after -c, and it is quoted, so `lex` kept
        # it whole. Its own first `set -e` is what arms the chain.
        script = str(run)
        marker = script.find("-c")
        body = script[marker:] if marker != -1 else script
        for inner in logical_lines(body):
            for segment in lex(mask_expressions(inner))[0]:
                if errexit_change([w for w, _quoted in segment]) is True:
                    return False
        return True
    return False


def errexit_off_at(run: str, token_words: list[str]) -> str | None:
    """The `set +e` still in force when the gate's line runs, if any.

    The operators on the gate's own line are not the whole story: the line
    ABOVE it can disable the mechanism that makes its failure count. GitHub
    runs a `run:` block as `bash -e {0}`, so a failing gate normally aborts
    the step; `set +e` removes that, and the step's status becomes whatever
    runs last. Measured under `bash -e` against a command that exits 1:

        gate / exit 0            -> step exits 1   (errexit aborted first)
        set +e / gate / exit 0   -> step exits 0   SUPPRESSED
        set +e / gate / set -e   -> step exits 0   SUPPRESSED

    which is why this looks for the `set +e` rather than for the `exit 0`:
    without errexit disabled the trailing line never runs, and with it
    disabled almost any trailing line will do.
    """
    off: str | None = None
    for line in logical_lines(run):
        if line_executes(line, token_words):
            return off
        for segment in lex(mask_expressions(line))[0]:
            change = errexit_change([w for w, _quoted in segment])
            if change is False:
                off = line.strip()[:70]
            elif change is True:
                off = None
    return None


def step_text(step: dict[str, Any]) -> str:
    """What a step EXECUTES: its `run` script and the action it `uses`.

    `with:` is deliberately excluded. It holds parameters, not commands, and
    including it made an artifact named `reports-pyright` look like an
    invocation of `pyright` — so the upload step was mistaken for the gate step
    and its legitimate `if: always()` was reported as a conditioned-away gate.
    """
    return f"{step.get('run', '')}\n{step.get('uses', '')}"


FRONTEND_WF = WORKFLOWS / "learning-canvas-frontend.yml"
FRONTEND_JOB = "frontend"
FRONTEND_GATE_STEP = "Verification gate"
PLAYWRIGHT_CONFIG = Path("frontend/playwright.config.ts")
MUTATION_CATALOGUE = Path("frontend/scripts/mutation-gate.mjs")
ATTRIBUTION_MAP = Path("frontend/e2e/util/attribution.ts")

# A Playwright project declared but never run is a verification dimension that
# exists on paper only. Exempting one is allowed; doing it silently is not, so
# an exemption costs a written reason here.
PLAYWRIGHT_EXEMPT: dict[str, str] = {}

# The mutation catalogue may only grow. These floors are the measured state on
# the commit that introduced this check; a change that lowers either one is
# removing a defect the suite can currently see, which needs to be a deliberate
# and visible act rather than a deletion nobody reviewed.
MUTATION_COUNT_FLOOR = 26
MUTATION_FILE_FLOOR = 9

QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"")
SINGLE_PIPE = re.compile(r"(?<!\|)\|(?!\|)")


def unquoted(text: str) -> str:
    """Shell text with quoted spans removed, so operators inside them do not count."""
    return QUOTED.sub("", mask_expressions(text))


def check_frontend(g: Gate) -> bool:
    """The frontend workflow's structural integrity.

    WHY THIS LIVES IN preflight AND NOT IN THE FRONTEND WORKFLOW ITSELF.
    `learning-canvas-frontend.yml` is absent from ci/gates.toml and absent from
    the live ruleset's 17 required contexts, so nothing it runs can block a
    merge. A self-check inside it would inherit exactly that: a checker that
    reports and cannot stop anything. preflight IS required, so putting the
    check here is the only construction where it has teeth.

    WHAT IT DEFENDS, and why each one is a defect that already happened rather
    than a hypothetical:

      * `Typecheck` piped through `tee` under GitHub's default `bash -e`, which
        has no pipefail, so the step reported tee's exit status and could never
        fail. That clause of the verification gate was dead for the entire life
        of the workflow. The instance is fixed; check (e) is what makes the
        CLASS impossible.
      * Every verification step is `continue-on-error: true` so the whole
        battery runs, and a final gate step restores the verdict by reading
        each outcome. A step added without a matching clause in that condition
        reports forever and blocks nothing -- and nothing but memory was
        stopping that. Checks (c) and (d) replace the memory.
      * Five Playwright projects are declared -- desktop-1440, square-900,
        mobile-375, reduced-motion, keyboard -- and CI ran one. Four verification
        dimensions existed in config and never executed. Check (f) makes
        declaring a project and not running it a preflight failure.
      * The mutation catalogue is a list in a file. Deleting entries from it
        silently lowers how much defect the suite can see. Check (g) ratchets.
    """
    if not FRONTEND_WF.is_file():
        g.check("frontend workflow exists", False, str(FRONTEND_WF))
        g.fail(
            what="the frontend verification workflow is gone",
            where=str(FRONTEND_WF),
            requirement="The canvas has a verification workflow.",
            fix=f"Restore {FRONTEND_WF}.",
        )
        return False

    doc = cast("dict[str, Any]", yaml.safe_load(FRONTEND_WF.read_text(encoding="utf-8")))
    jobs = cast("dict[str, Any]", doc.get("jobs") or {})
    job = jobs.get(FRONTEND_JOB)
    if not isinstance(job, dict):
        g.check(f"frontend workflow has job '{FRONTEND_JOB}'", False, "missing")
        g.fail(
            what=f"job '{FRONTEND_JOB}' is missing",
            where=str(FRONTEND_WF),
            requirement="The workflow's verification job must exist to be checked.",
            fix=f"Restore the '{FRONTEND_JOB}' job.",
        )
        return False

    steps = steps_of(cast("dict[str, Any]", job))
    ok = True

    # (a)+(b) the gate step is the thing that restores the verdict, so it must
    # not itself be suppressible.
    gate_steps = [s for s in steps if s.get("name") == FRONTEND_GATE_STEP]
    if len(gate_steps) != 1:
        g.check("exactly one verification gate step", False, f"found {len(gate_steps)}")
        g.fail(
            what="the verification gate step is missing or duplicated",
            where=f"{FRONTEND_WF} -> {FRONTEND_JOB}",
            why="every check in the job is continue-on-error, so without this "
            "step the job is green with failures in it",
            requirement=f"Exactly one step named '{FRONTEND_GATE_STEP}'.",
            fix=f"Restore the single '{FRONTEND_GATE_STEP}' step.",
        )
        return False

    gate = gate_steps[0]
    condition = str(gate.get("if", ""))
    gate_run = str(gate.get("run", ""))

    if gate.get("continue-on-error"):
        ok = False
        g.check("gate step is not continue-on-error", False, "it is")
        g.fail(
            what="the verification gate cannot fail the job",
            where=f"{FRONTEND_WF} -> {FRONTEND_GATE_STEP}",
            why="continue-on-error on the gate makes every other check advisory",
            requirement="The gate step decides the job.",
            fix="Remove continue-on-error from the gate step.",
        )
    if "exit 1" not in gate_run:
        ok = False
        g.check("gate step exits non-zero", False, "no `exit 1`")
        g.fail(
            what="the verification gate does not fail",
            where=f"{FRONTEND_WF} -> {FRONTEND_GATE_STEP}",
            requirement="The gate must exit non-zero when its condition fires.",
            fix="Restore `exit 1` in the gate step's run.",
        )

    enforced = set(re.findall(r"steps\.([A-Za-z0-9_-]+)\.outcome", condition))

    # (c) a reporting step with an id must be wired into the verdict.
    # (d) a reporting step WITHOUT an id must be an annotator. This is the half
    #     that stops a real check from hiding as a reporter: give it no id and
    #     it would never reach the condition, and before this check nothing
    #     would have noticed.
    for step in steps:
        if not step.get("continue-on-error"):
            continue
        name = str(step.get("name", "<unnamed>"))
        sid = step.get("id")
        if sid:
            if str(sid) not in enforced:
                ok = False
                g.check(f"frontend step '{sid}' is enforced", False, "not in gate")
                g.fail(
                    what=f"step '{name}' reports but cannot fail the job",
                    where=f"{FRONTEND_WF} -> {name}",
                    why="continue-on-error without a clause in the verification "
                    "gate is a check that runs and enforces nothing",
                    requirement="Every continue-on-error step with an id is "
                    "named in the gate condition.",
                    fix=f"Add `steps.{sid}.outcome == 'failure'` to the "
                    f"'{FRONTEND_GATE_STEP}' condition.",
                )
        elif not name.startswith("Annotate"):
            ok = False
            g.check(f"frontend step '{name}' is an annotator", False, "no id")
            g.fail(
                what=f"step '{name}' is continue-on-error with no id",
                where=f"{FRONTEND_WF} -> {name}",
                why="with no id it can never appear in the gate condition, so "
                "it can never fail the job whatever it finds",
                requirement="Only annotators (name starts with 'Annotate') may "
                "be continue-on-error without an id.",
                fix=f"Give '{name}' an id and a gate clause, or rename it to "
                "'Annotate …' if it genuinely only reports.",
            )

    # (e) THE PIPEFAIL CLASS. Scoped to steps whose exit status is load-bearing:
    # an annotator that pipes grep into head wants SIGPIPE to be harmless, and
    # forcing pipefail there would break a working reporter to satisfy a rule.
    for step in steps:
        sid = step.get("id")
        if not sid or str(sid) not in enforced:
            continue
        run = str(step.get("run", ""))
        if SINGLE_PIPE.search(unquoted(run)) and "pipefail" not in run:
            ok = False
            g.check(f"frontend step '{sid}' sets pipefail", False, "pipes without it")
            g.fail(
                what=f"step '{sid}' pipes without pipefail",
                where=f"{FRONTEND_WF} -> {step.get('name', sid)}",
                why="GitHub's default shell is `bash -e`, not `bash -eo "
                "pipefail`, so the step reports the LAST command's status. "
                "`npm run typecheck | tee` reported tee, and that clause of "
                "the gate was dead for the life of the workflow.",
                requirement="A step the gate reads must set `set -o pipefail` "
                "if it pipes.",
                fix=f"Add `shell: bash` and `set -o pipefail` to '{sid}'.",
            )

    # (f) a declared Playwright project that never runs is a dimension on paper.
    if PLAYWRIGHT_CONFIG.is_file():
        cfg = PLAYWRIGHT_CONFIG.read_text(encoding="utf-8")
        block = cfg.partition("projects:")[2].partition("webServer:")[0]
        declared = re.findall(r"name:\s*'([^']+)'", block)
        run_text = "\n".join(str(s.get("run", "")) for s in steps)
        invoked = set(re.findall(r"--project=([A-Za-z0-9_-]+)", run_text))
        g.set_scope(
            playwright_projects_declared=len(declared),
            playwright_projects_run=len(invoked),
        )
        for name in declared:
            if name in invoked or name in PLAYWRIGHT_EXEMPT:
                continue
            ok = False
            g.check(f"playwright project '{name}' runs in CI", False, "declared only")
            g.fail(
                what=f"Playwright project '{name}' is declared and never run",
                where=f"{PLAYWRIGHT_CONFIG} -> projects[].name = '{name}'",
                why="a viewport or preference the config says is covered, that "
                "no CI run has ever exercised, is a coverage claim with no "
                "evidence behind it",
                requirement="Every declared project runs in CI, or is listed "
                "in PLAYWRIGHT_EXEMPT with a reason.",
                fix=f"Add `--project={name}` to the browser step, or add "
                f"'{name}' to PLAYWRIGHT_EXEMPT in {Path(__file__).name} with "
                "a written reason.",
            )
    else:
        ok = False
        g.check("playwright config exists", False, str(PLAYWRIGHT_CONFIG))
        g.fail(
            what="the Playwright config is gone",
            where=str(PLAYWRIGHT_CONFIG),
            requirement="Browser coverage is declared somewhere checkable.",
            fix=f"Restore {PLAYWRIGHT_CONFIG}.",
        )

    # (h) AN ANNOTATOR THAT CANNOT REPORT ITS OWN BLINDNESS.
    #
    # gh-annotate.mjs turns tool output into `::error file=,line=` so a failure
    # has a location instead of being text in a collapsed log group. It decides
    # whether it is blind by comparing the annotated step's outcome against how
    # many annotations it emitted: failed step, zero annotations, and the
    # failure has no location anywhere on the run. It learns that outcome from
    # STEP_OUTCOME.
    #
    # Without the env wiring the comparison silently degrades to always-quiet,
    # which is the pre-existing behaviour and the reason a census of 8,236 log
    # lines once returned zero error lines. Same shape as check (c): the
    # capability exists, one line connects it, and nothing but memory was
    # holding that line in place.
    for step in steps:
        run = str(step.get("run", ""))
        if "gh-annotate.mjs" not in run:
            continue
        name = str(step.get("name", "<unnamed>"))
        env = step.get("env")
        if not (isinstance(env, dict) and "STEP_OUTCOME" in cast("dict[str, Any]", env)):
            ok = False
            g.check(f"'{name}' passes STEP_OUTCOME", False, "missing env")
            g.fail(
                what=f"annotator step '{name}' cannot tell whether it went blind",
                where=f"{FRONTEND_WF} -> {name}",
                why="without STEP_OUTCOME the annotator cannot distinguish "
                "'nothing was wrong' from 'nothing was looking', so a failed "
                "step with an unparseable log reports no file and no line",
                requirement="Every step running gh-annotate.mjs sets "
                "STEP_OUTCOME from the step it annotates.",
                fix=f"Add `env:\\n  STEP_OUTCOME: ${{{{ steps.<id>.outcome }}}}` "
                f"to '{name}'.",
            )

    # (i) THE REPORTER THAT NAMES THE DEFECT MUST STAY WIRED.
    #
    # Playwright's stock `github` reporter annotates the SPEC line -- all 49
    # annotations this branch ever produced named composed-renderer.spec.ts,
    # never the panel that drew the pixels -- and it annotates every retry, so
    # `retries: 1` doubled the list. canvas-reporter fixes both. Reverting the
    # config line silently restores the old behaviour, and the run stays green
    # while doing it, so nothing but this check would notice.
    if PLAYWRIGHT_CONFIG.is_file():
        cfg = PLAYWRIGHT_CONFIG.read_text(encoding="utf-8")
        reporter_block = cfg.partition("reporter:")[2].partition("\n  globalTeardown")[0]
        if "canvas-reporter" not in reporter_block:
            ok = False
            g.check("playwright uses canvas-reporter", False, "not in reporter config")
            g.fail(
                what="the source-attributing Playwright reporter is not wired in",
                where=f"{PLAYWRIGHT_CONFIG} -> reporter",
                why="without it every browser failure annotates the spec line "
                "that noticed the problem instead of the panel that caused it, "
                "and every retry is annotated separately",
                requirement="The CI reporter list includes canvas-reporter.",
                fix="Restore './e2e/reporters/canvas-reporter.ts' in the CI "
                "branch of `reporter:`.",
            )
        if "'github'" in reporter_block or '"github"' in reporter_block:
            ok = False
            g.check("stock github reporter is not used", False, "it is")
            g.fail(
                what="the stock github reporter is back",
                where=f"{PLAYWRIGHT_CONFIG} -> reporter",
                why="it annotates the spec line rather than the source, and "
                "once per retry rather than once per test -- 13 annotations "
                "for 5 real failures, measured on run 32589708228",
                requirement="canvas-reporter replaces it, not sits beside it.",
                fix="Remove ['github'] from the reporter list.",
            )

    # (j) THE FINDINGS ARTIFACT MUST BE UPLOADED.
    #
    # canvas-reporter writes ci-findings.json so the whole failure set is one
    # download instead of a log crawl. A reporter writing a file nobody
    # retrieves is the same as not writing it.
    def uploads_findings(step: dict[str, Any]) -> bool:
        if "upload-artifact" not in str(step.get("uses", "")):
            return False
        with_block = cast("dict[str, Any]", step.get("with") or {})
        return "ci-findings.json" in str(with_block.get("path", ""))

    uploads = [s for s in steps if uploads_findings(s)]
    if not uploads:
        ok = False
        g.check("findings artifact uploaded", False, "no upload step")
        g.fail(
            what="ci-findings.json is written and never uploaded",
            where=f"{FRONTEND_WF} -> {FRONTEND_JOB}",
            why="the reporter's machine-readable output cannot leave the "
            "runner, so reading a failed run goes back to grepping logs",
            requirement="An upload-artifact step publishes frontend/ci-findings.json.",
            fix="Restore the 'Upload failure findings' step.",
        )
    else:
        for s in uploads:
            if str(s.get("if", "")).strip() != "always()":
                ok = False
                g.check("findings artifact uploads unconditionally", False,
                        f"if: {s.get('if')!r}")
                g.fail(
                    what="the findings artifact is not uploaded on failure",
                    where=f"{FRONTEND_WF} -> {s.get('name')}",
                    why="a findings file that only survives a green run is "
                    "useless: the run it is needed for is the red one",
                    requirement="The findings upload runs with `if: always()`.",
                    fix="Set `if: always()` on the findings upload step.",
                )

    # (k) NO ANNOTATION WITHOUT A LOCATION.
    #
    # `::error title=...` with no `file=` does not go nowhere. GitHub pins it to
    # the workflow YAML at the emitting step's line, so run 32589708228 carried
    # `.github:6` and `.github:7` in the same annotation list as the real
    # findings -- three of thirteen annotations pointing at a line that had
    # nothing to do with any failure.
    #
    # The annotation list is an index of LOCATIONS. Anything that is not a
    # location belongs in $GITHUB_STEP_SUMMARY, which renders at the top of the
    # run and costs the index nothing.
    for step in steps:
        run = str(step.get("run", ""))
        for match in re.finditer(r"::(error|warning)([^:\n]*)::", run):
            if "file=" in match.group(2):
                continue
            ok = False
            name = str(step.get("name", "<unnamed>"))
            g.check(f"'{name}' annotation has a location", False, match.group(0))
            g.fail(
                what=f"step '{name}' emits an annotation with no file",
                where=f"{FRONTEND_WF} -> {name}",
                why="GitHub pins a fileless annotation to this YAML file, so it "
                "lands in the annotation list pointing at a workflow line that "
                "explains nothing, next to the findings that do",
                requirement="Every ::error or ::warning in a run body carries "
                "file=. Summaries go to $GITHUB_STEP_SUMMARY instead.",
                fix=f"Add `file=` to {match.group(0)}, or move the text to "
                "$GITHUB_STEP_SUMMARY.",
            )

    # (l) EVERY ATTRIBUTED SOURCE PATH MUST EXIST.
    #
    # e2e/util/attribution.ts maps a renderer key to the file canvas-reporter
    # puts in `::error file=`. A stale path is worse than no path: it sends
    # whoever clicks the annotation to a file that had nothing to do with the
    # failure, which is a slower way to be wrong than the spec-line annotations
    # this replaced.
    #
    # The companion assertion -- that the map's KEYS equal the registry's --
    # lives in src/canvas/renderer/attribution.parity.test.ts. It is pure data
    # and belongs in vitest. This half touches the filesystem, and a test under
    # src/ cannot: node:fs and __dirname typecheck in vitest and fail `tsc -b`,
    # because the src tsconfig carries no node types.
    if ATTRIBUTION_MAP.is_file():
        text = ATTRIBUTION_MAP.read_text(encoding="utf-8")

        # PARSED AS KEY -> VALUE, not harvested as "strings that look like
        # paths". Harvesting was the first cut and it had a hole a probe found
        # immediately: replacing a value with 'x' simply stopped matching, the
        # remaining entries still looked fine, and the check stayed green while
        # one renderer silently lost its source. Reading the entries means a
        # malformed value is a value, and gets judged.
        block = text.partition("RENDERER_SOURCE")[2].partition("}")[0]
        entries = dict(re.findall(r"(\w+):\s*'([^']*)'", block))
        fallback = re.search(r"RENDERER_FALLBACK\s*=\s*'([^']*)'", text)
        if fallback:
            entries["<fallback>"] = fallback.group(1)

        bad_shape = {
            k: v for k, v in entries.items()
            if not (v.startswith("frontend/src/canvas/") and v.endswith((".ts", ".tsx")))
        }
        for key, value in sorted(bad_shape.items()):
            ok = False
            g.check(f"attribution value is a canvas path: {key}", False, repr(value))
            g.fail(
                what=f"'{key}' maps to something that is not a canvas source path",
                where=f"{ATTRIBUTION_MAP} -> {key}: '{value}'",
                why="canvas-reporter puts this straight into `::error file=`, "
                "so a value GitHub cannot resolve produces an annotation that "
                "points nowhere and silently loses the finding's location",
                requirement="Every value is a frontend/src/canvas/… .ts or "
                ".tsx path.",
                fix=f"Point '{key}' at the panel that renders it.",
            )

        paths = {v for v in entries.values() if v not in bad_shape.values()}
        g.set_scope(attributed_sources=len(entries))
        if not entries:
            ok = False
            g.check("attribution map has entries", False, "none matched")
            g.fail(
                what="the renderer-to-source map is empty or unparseable",
                where=str(ATTRIBUTION_MAP),
                why="with no entries every browser failure falls back to one "
                "file, so the annotation stops naming the panel that broke",
                requirement="The map lists a frontend/src/canvas path per renderer.",
                fix=f"Restore the RENDERER_SOURCE entries in {ATTRIBUTION_MAP}.",
            )
        for rel in sorted(paths):
            if not Path(rel).is_file():
                ok = False
                g.check(f"attributed source exists: {rel}", False, "missing")
                g.fail(
                    what="an annotation would point at a file that does not exist",
                    where=f"{ATTRIBUTION_MAP} -> '{rel}'",
                    why="a renamed or moved panel leaves the map pointing at "
                    "nothing, and the reader is sent somewhere irrelevant",
                    requirement="Every path in RENDERER_SOURCE resolves.",
                    fix=f"Update '{rel}' in {ATTRIBUTION_MAP} to the panel's "
                    "current path.",
                )
    else:
        ok = False
        g.check("attribution map exists", False, str(ATTRIBUTION_MAP))
        g.fail(
            what="the renderer-to-source map is gone",
            where=str(ATTRIBUTION_MAP),
            why="canvas-reporter cannot name a source without it",
            requirement="The map exists.",
            fix=f"Restore {ATTRIBUTION_MAP}.",
        )

    # (m) THE MUTATION GATE MUST CLEAN UP AFTER ITSELF.
    #
    # It edits real source files in the working tree. Between writing the
    # mutated bytes and writing the originals back, the repository holds
    # deliberately broken code, and the first version of the script had no
    # try/finally and no signal handlers -- a Ctrl-C or a CI timeout in that
    # window left the corruption in place, with a plausible-looking diff that a
    # hurried `git commit -a` would capture. Earlier on this branch a mutation
    # run and a `git checkout --` overlapped and destroyed uncommitted work.
    #
    # Checking for the three layers rather than for one, because each covers a
    # death the others cannot: finally for a throw, handlers for SIGINT/SIGTERM,
    # a lock file for SIGKILL, which no handler can catch.
    if MUTATION_CATALOGUE.is_file():
        guard = MUTATION_CATALOGUE.read_text(encoding="utf-8")
        for token, why in (
            ("} finally {", "a thrown exception would leave the source mutated"),
            ("process.on(signal", "Ctrl-C would leave the source mutated"),
            ("uncaughtException", "a crash would leave the source mutated"),
            (".mutation-gate.lock", "a SIGKILL would leave no trace of which file was corrupted"),
        ):
            if token not in guard:
                ok = False
                g.check(f"mutation gate restores on failure: {token}", False, "absent")
                g.fail(
                    what="the mutation gate can leave corrupted source behind",
                    where=f"{MUTATION_CATALOGUE} (missing {token!r})",
                    why=f"this tool rewrites files under src/, and without it {why}",
                    requirement="Mutation is wrapped in finally, guarded by "
                    "signal and crash handlers, and breadcrumbed by a lock file.",
                    fix=f"Restore the {token!r} safety layer in {MUTATION_CATALOGUE}.",
                )

    # (g) THE RATCHET. The catalogue is a list; lists shrink quietly.
    if MUTATION_CATALOGUE.is_file():
        src = MUTATION_CATALOGUE.read_text(encoding="utf-8")
        entries = re.findall(r"^\s*id:\s*'([^']+)',\s*$", src, re.M)
        files = set(re.findall(r"^\s*file:\s*'([^']+)',\s*$", src, re.M))
        g.set_scope(mutants=len(entries), mutated_files=len(files))
        if len(entries) < MUTATION_COUNT_FLOOR or len(files) < MUTATION_FILE_FLOOR:
            ok = False
            g.check("mutation catalogue did not shrink", False,
                    f"{len(entries)} mutants over {len(files)} files")
            g.fail(
                what="the mutation catalogue shrank",
                where=str(MUTATION_CATALOGUE),
                why=f"{len(entries)} mutants over {len(files)} files, against a "
                f"floor of {MUTATION_COUNT_FLOOR} over {MUTATION_FILE_FLOOR}. "
                "Every entry removed is a defect the suite could see and now "
                "cannot.",
                requirement="The catalogue only grows.",
                fix="Restore the removed mutants, or raise the floor "
                "deliberately in a commit that says why.",
            )
    else:
        ok = False
        g.check("mutation catalogue exists", False, str(MUTATION_CATALOGUE))
        g.fail(
            what="the frontend mutation gate is gone",
            where=str(MUTATION_CATALOGUE),
            why="it is the only thing checking that the canvas tests can fail",
            requirement="The mutation catalogue exists.",
            fix=f"Restore {MUTATION_CATALOGUE}.",
        )

    if ok:
        g.check("frontend workflow integrity", True,
                f"{len(enforced)} enforced step(s), gate intact")
    return ok


def main() -> None:
    with Gate("preflight", version="2.0.0") as g:
        if not MANIFEST.is_file():
            g.infrastructure_failure(f"{MANIFEST} missing — cannot verify integrity")
            return

        manifest = tomllib.loads(MANIFEST.read_text(encoding="utf-8"))
        gates: dict[str, dict[str, Any]] = manifest.get("gates", {})
        mandatory = {n: s for n, s in gates.items() if s.get("mandatory")}

        # A NON-MANDATORY SCANNER STILL NEEDS A GUARD.
        #
        # This loop used to walk `mandatory` alone, which left every
        # non-required gate structurally unchecked: its step could be deleted,
        # conditioned away with `if: false`, or suffixed with `|| true`, and
        # nothing here would notice. That is the exact drift this file's own
        # docstring says it exists to catch.
        #
        # It surfaced when `codeql-javascript-typescript` was added. It cannot
        # be `mandatory = true` until an admin adds the context to the GitHub
        # ruleset -- check_ruleset.py requires the two sets to be equal -- so
        # under the old selection it was a scanner nobody was watching.
        #
        # SCANNERS ONLY, deliberately. `role = "supplementary"` gates are
        # allowed to be conditional and allowed to no-op: `ai-review` is a
        # documented no-op without its secret, and the deep-verify pair is
        # label-gated by design. Sweeping them in would turn intended
        # behaviour into a failure. A scanner that quietly stops scanning is a
        # different thing, and it is the thing that just cost this repository
        # 100 unanalysed TypeScript files.
        structural = {
            n: s
            for n, s in gates.items()
            if s.get("mandatory") or s.get("role") == "scanner"
        }
        g.set_scope(
            manifest=str(MANIFEST),
            gates_declared=len(gates),
            mandatory=len(mandatory),
            structurally_checked=len(structural),
            workflows_on_disk=len(list(WORKFLOWS.glob("*.yml"))),
        )

        ok = True
        parsed: dict[str, dict[str, Any]] = {}

        for name, spec in structural.items():
            wf = WORKFLOWS / str(spec["workflow"])
            job_id = str(spec["job"])

            if not wf.is_file():
                ok = False
                g.check(f"{name}: workflow exists", False, str(wf))
                g.fail(
                    what=f"gate '{name}' lost its workflow",
                    where=str(wf),
                    requirement="Every declared gate must have a workflow file.",
                    fix=f"Restore {wf} or remove the gate from {MANIFEST} "
                    "and the ruleset together.",
                )
                continue

            # A code-scanning results check has no job: GitHub's app posts it
            # after the analysis workflow publishes. Assert the workflow that
            # produces those results exists; its jobs and steps are checked by
            # the scanner gates that name them.
            if str(spec.get("role", "")) == "code-scanning":
                g.check(f"{name}: producing workflow exists", True, str(wf))
                continue

            if str(wf) not in parsed:
                try:
                    loaded = yaml.safe_load(wf.read_text(encoding="utf-8"))
                except yaml.YAMLError as exc:
                    ok = False
                    g.check(f"{wf.name}: parses", False, str(exc)[:80])
                    g.fail(
                        what=f"{wf.name} is not valid YAML",
                        where=str(wf),
                        why=str(exc)[:200],
                        requirement="A workflow that does not parse runs no gates.",
                        fix="Fix the YAML syntax.",
                    )
                    continue
                parsed[str(wf)] = cast("dict[str, Any]", loaded or {})
            doc = parsed[str(wf)]

            jobs = doc.get("jobs")
            jobs_map = cast("dict[str, Any]", jobs) if isinstance(jobs, dict) else {}
            job_obj = jobs_map.get(job_id)
            has_job = isinstance(job_obj, dict)
            g.check(f"{name}: job '{job_id}' declared", has_job, str(wf))
            if not has_job:
                ok = False
                g.fail(
                    what=f"job '{job_id}' renamed or removed",
                    where=str(wf),
                    requirement="The ruleset requires this exact job id as a "
                    "check context. A rename makes the required "
                    "check permanently pending, not failing.",
                    fix=f"Restore job id `{job_id}` or update the ruleset "
                    f"and {MANIFEST} together.",
                )
                continue
            job = cast("dict[str, Any]", job_obj)

            # 2. job-level condition, only where the manifest declares one
            allowed_if = spec.get("job_if")
            job_if = job.get("if")
            if_ok = (job_if is None) or (str(job_if).strip() == str(allowed_if).strip())
            # `if: false` parses to the boolean False, which is falsy, so a
            # truthiness test reported "unconditional" for a job conditioned
            # never to run -- the single most misleading case this check has.
            # Test for absence explicitly.
            g.check(
                f"{name}: job condition",
                if_ok,
                "unconditional" if job_if is None else f"if: {job_if}",
            )
            if not if_ok:
                ok = False
                g.fail(
                    what=f"job '{job_id}' runs conditionally",
                    where=str(wf),
                    why=f"if: {job_if}",
                    requirement="A required job, or any scanner, must run every time, unless "
                    f"{MANIFEST} declares the condition.",
                    fix=f"Remove the condition, or declare job_if in {MANIFEST}.",
                )

            # 3. job-level continue-on-error
            if job.get("continue-on-error"):
                ok = False
                g.check(f"{name}: job propagates failure", False, "continue-on-error")
                g.fail(
                    what=f"continue-on-error on job '{job_id}'",
                    where=str(wf),
                    requirement="A required gate, or any scanner, must propagate failure.",
                    fix="Remove continue-on-error.",
                )

            steps = steps_of(job)

            # 4-6. the step that actually invokes the gate
            for token in [str(c) for c in spec.get("must_contain", [])]:
                # `uses:` is an action reference — the token IS what runs.
                # `run:` needs the stronger test: present is not executed.
                carriers = [
                    s
                    for s in steps
                    if token in str(s.get("uses", ""))
                    or executes(str(s.get("run", "")), token)
                ]
                g.check(
                    f"{name}: invokes {token}",
                    bool(carriers),
                    f"{len(carriers)} step(s)",
                )
                if not carriers:
                    ok = False
                    g.fail(
                        what=f"gate '{name}' no longer invokes its command",
                        where=str(wf),
                        why=f"no step runs: {token}",
                        requirement="A required check must still execute its "
                        "verifier. Removing the step leaves the "
                        "check green and the gate gone.",
                        fix=f"Restore `{token}` in {wf}, or remove the gate "
                        f"from {MANIFEST} and the ruleset together.",
                    )
                    continue
                for step in carriers:
                    label = str(step.get("name", token))[:40]
                    if step.get("if") is not None:
                        ok = False
                        g.check(
                            f"{name}: step unconditional",
                            False,
                            f"{label}: if: {step['if']}",
                        )
                        g.fail(
                            what=f"gate step in '{name}' runs conditionally",
                            where=f"{wf} -> {label}",
                            why=f"if: {step['if']}",
                            requirement="A conditioned gate step is a deleted "
                            "gate: the job still exits 0 and the "
                            "required check still goes green.",
                            fix="Remove the `if:` from the gate step.",
                        )
                    if step.get("continue-on-error"):
                        ok = False
                        g.check(f"{name}: step propagates failure", False, label)
                        g.fail(
                            what=f"continue-on-error on a gate step in '{name}'",
                            where=f"{wf} -> {label}",
                            requirement="Never convert a gate failure into success.",
                            fix="Remove continue-on-error.",
                        )
                    run = str(step.get("run", ""))
                    token_words = token.split()
                    # A `bash -c` CHAIN DOES NOT INHERIT ERREXIT, and nothing
                    # above notices. GitHub runs a `run:` block as
                    # `bash -e {0}`, so errexit is on and `errexit_off_at`
                    # catches any `set +e`. Inside `bash -c '...'` errexit is
                    # OFF by default and the compensating `set -e` is one line
                    # in a string literal. `errexit_off_at` reports a `set +e`
                    # that is PRESENT; it can never report a `set -e` that is
                    # ABSENT, and ci/gates.toml pins the wrapper rather than
                    # the guard inside it.
                    #
                    # Measured on a copy of this workflow with that single line
                    # deleted: gate_integrity exited 0, and a chain whose first
                    # three verifications exit 1 and whose fourth exits 0
                    # produced a wrapper exit of 0 with status PASS and
                    # mergeable_contribution true. For the preflight gate that
                    # is the TCB check and the live-ruleset drift check both
                    # failing while `full` certifies an all-green run.
                    #
                    # So the chain is required to arm itself. One deleted line
                    # is the cheapest possible edit and it must not be silent.
                    if chain_without_errexit(run, token_words):
                        ok = False
                        g.check(
                            f"{name}: chain arms errexit",
                            False,
                            "bash -c without `set -e`",
                        )
                        g.fail(
                            what=f"a `bash -c` chain in '{name}' never enables errexit",
                            where=f"{wf} -> {label}",
                            why="`bash -c` starts with errexit OFF, so every "
                            "command after a failing one still runs and "
                            "the chain's exit code is the LAST command's.",
                            requirement="A chain that wraps several "
                            "verifications must stop at the first "
                            "failure, or its exit code is not its "
                            "verdict.",
                            fix="Add `set -e` as the first line of the "
                            "`bash -c` script.",
                            code="CHAIN_WITHOUT_ERREXIT",
                        )
                    disabled = errexit_off_at(run, token_words)
                    if disabled is not None:
                        ok = False
                        g.check(f"{name}: errexit in force", False, disabled)
                        g.fail(
                            what=f"errexit disabled around the gate in '{name}'",
                            where=f"{wf} -> {label}",
                            why=disabled,
                            requirement="A `run:` block is `bash -e`, so a "
                            "failing gate aborts the step. With "
                            "`set +e` the step's status becomes "
                            "whatever runs last instead, and the "
                            "gate's failure decides nothing.",
                            fix="Remove `set +e`, or move the gate command "
                            "into its own step.",
                        )
                    for line in logical_lines(run):
                        if not line_executes(line, token_words):
                            continue
                        found = suppressors(line)
                        if found:
                            ok = False
                            g.check(
                                f"{name}: no suppression",
                                False,
                                f"{' '.join(sorted(set(found)))} :: "
                                f"{line.strip()[:60]}",
                            )
                            g.fail(
                                what=f"failure suppressed in '{name}'",
                                where=f"{wf} -> {label}",
                                why=line.strip()[:120],
                                requirement="The gate command must be the last "
                                "thing on its line that can decide "
                                "the step's exit status. `"
                                + "`, `".join(sorted(set(found)))
                                + "` takes that away from it.",
                                fix="Put the gate command last and alone. Split "
                                "anything else onto its own line.",
                            )

            # 7. evidence must be uploaded, and its absence must be loud.
            # A scanner is exempt from THIS check only: CodeQL's result is a
            # code-scanning analysis, not a file in reports/. Its job, its
            # invocation, its conditions and its failure propagation are all
            # still checked above, and the ruleset's code_scanning rule is what
            # reads the result.
            if str(spec.get("role", "")) == "scanner":
                g.check(
                    f"{name}: publishes to code scanning",
                    True,
                    str(spec.get("evidence", "")),
                )
                continue
            artifact = str(spec.get("artifact", ""))
            uploads = [
                s
                for s in steps
                if "upload-artifact" in str(s.get("uses", ""))
                and str(cast("dict[str, Any]", s.get("with", {})).get("name", ""))
                == artifact
            ]
            g.check(f"{name}: uploads {artifact}", bool(uploads))
            if not uploads:
                ok = False
                g.fail(
                    what=f"gate '{name}' preserves no evidence",
                    where=str(wf),
                    why=f"no upload-artifact step named {artifact!r}",
                    requirement="Reports must survive the run and the log "
                    "retention window, especially on failure.",
                    fix=f"Add actions/upload-artifact named {artifact} with "
                    "`if: always()` and `if-no-files-found: error`.",
                )
            for step in uploads:
                with_ = cast("dict[str, Any]", step.get("with", {}))
                if str(step.get("if", "")).strip() != "always()":
                    ok = False
                    g.check(f"{name}: uploads on failure", False, str(step.get("if")))
                    g.fail(
                        what=f"'{name}' only uploads evidence when it passes",
                        where=f"{wf} -> {artifact}",
                        requirement="Evidence matters most on failure.",
                        fix="Add `if: always()` to the upload step.",
                    )
                if str(with_.get("if-no-files-found", "")) != "error":
                    ok = False
                    g.check(
                        f"{name}: missing evidence is loud",
                        False,
                        str(with_.get("if-no-files-found")),
                    )
                    g.fail(
                        what=f"'{name}' ignores a missing artifact",
                        where=f"{wf} -> {artifact}",
                        why="if-no-files-found is not 'error', so a gate that "
                        "produced no evidence uploads nothing and the job "
                        "stays green",
                        requirement="Artifact absence must be detectable.",
                        fix="Set `if-no-files-found: error`.",
                    )

        # 8. every script any workflow invokes exists
        for wf in sorted(WORKFLOWS.glob("*.yml")):
            for script in sorted(
                set(
                    re.findall(
                        r"scripts/[\w./-]+\.(?:py|sh)", wf.read_text(encoding="utf-8")
                    )
                )
            ):
                if not Path(script).is_file():
                    ok = False
                    g.check(f"{wf.name}: {script}", False, "missing")
                    g.fail(
                        what="workflow calls a script that does not exist",
                        where=f"{wf.name} -> {script}",
                        requirement="Every invoked verifier must exist.",
                        fix=f"Restore {script} or remove the step.",
                    )

        # 9. the manifest agrees with itself
        ruleset: dict[str, Any] = manifest.get("ruleset", {})
        required = {str(c) for c in ruleset.get("required_checks", [])}
        aligned = required == set(mandatory)
        g.check(
            "required_checks == mandatory gates",
            aligned,
            f"{len(required)} required, {len(mandatory)} mandatory",
        )
        if not aligned:
            ok = False
            for ctx in sorted(required - set(mandatory)):
                g.fail(
                    what=f"ruleset requires '{ctx}' but no gate declares it",
                    requirement="Required checks must map to real jobs, or "
                    "merges hang forever.",
                    fix=f"Add the gate to {MANIFEST} or drop '{ctx}'.",
                )
            for name in sorted(set(mandatory) - required):
                g.fail(
                    what=f"gate '{name}' is mandatory but not required",
                    why="it runs, it can go red, and nothing is blocked by it",
                    requirement="A mandatory gate that GitHub does not require "
                    "blocks nothing.",
                    fix=f"Add '{name}' to required_checks in {MANIFEST} and to "
                    "the ruleset.",
                )

        # 10. docs must not tell anyone to run a verifier that is gone.
        # Scoped to INVOCATIONS, not every mention: evidence.md legitimately
        # documents scripts that do NOT exist and says so, and flagging that
        # would punish honesty.
        for doc in DOCS:
            if not doc.is_file():
                continue
            for script in sorted(
                set(
                    re.findall(
                        r"(?:python3?|bash|sh)\s+(scripts/[\w./-]+\.(?:py|sh))",
                        doc.read_text(encoding="utf-8"),
                    )
                )
            ):
                if not Path(script).is_file():
                    ok = False
                    g.check(f"{doc}: {script}", False, "missing")
                    g.fail(
                        what="documentation names a script that does not exist",
                        where=f"{doc} -> {script}",
                        why="the doc describes a verifier the repo no longer has",
                        requirement="Docs must not describe a verification "
                        "system that is not the one running.",
                        fix=f"Update {doc}, or restore {script}.",
                    )

        # 11. The frontend verification workflow, which ci/gates.toml does not
        # describe and the ruleset does not require. See check_frontend.
        ok = check_frontend(g) and ok

        g.artifact("reports/preflight.json")
        g.passed() if ok else g.failed()


if __name__ == "__main__":
    main()
