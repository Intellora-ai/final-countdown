#!/usr/bin/env python3
"""Break one source file on purpose, one change at a time, and see if the tests notice.

Implements the five operators in STEP 2 of the skill: AOR, ROR, LCR, UOI, ABS.

usage: mutate.py --source FILE --test "COMMAND" [--max N] [--timeout S]

Exit 0 = every mutant killed. Exit 1 = a mutant survived. Exit 2 = could not run.

Hard invariant: the source file is restored byte for byte before this process
ends. On Ctrl-C, on SIGTERM, on a crash, on a timeout. Always.
"""

import argparse
import re
import signal
import subprocess
import sys

OPERATORS = (
    ("AOR", "+", "-"),
    ("AOR", "*", "/"),
    ("ROR", ">=", ">"),
    ("ROR", "<=", "<"),
    ("ROR", "==", "!="),
    ("ROR", ">", ">="),
    ("ROR", "<", "<="),
    ("LCR", " and ", " or "),
    ("LCR", "&&", "||"),
    ("UOI", "True", "False"),
    ("UOI", "true", "false"),
)

NUMBER = re.compile(r"(?<![\w.\-])(\d+(?:\.\d+)?)(?![\w.])")


def build_mutants(text):
    """[(operator, line_number, original_line, whole mutated file)]. Pure, total."""
    lines = text.splitlines(keepends=True)
    mutants = []
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        for name, old, new in OPERATORS:
            if old in line:
                changed = lines[:]
                changed[index] = line.replace(old, new, 1)
                mutants.append((name, index + 1, line.rstrip("\n"), "".join(changed)))
                break
        match = NUMBER.search(line)
        if match:
            changed = lines[:]
            changed[index] = line[: match.start(1)] + "-" + line[match.start(1):]
            mutants.append(("ABS", index + 1, line.rstrip("\n"), "".join(changed)))
    return mutants


def run(command, timeout):
    try:
        return subprocess.run(command, shell=True, capture_output=True,
                              timeout=timeout).returncode
    except subprocess.TimeoutExpired:
        return "TIMEOUT"
    except OSError:
        return "ERROR"


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--test", required=True, help="the command that runs the tests")
    parser.add_argument("--max", type=int, default=40)
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args(argv[1:])

    try:
        with open(args.source, "rb") as handle:
            original = handle.read()
    except OSError as error:
        print("cannot read %s: %s" % (args.source, error))
        return 2

    def restore(*_ignored):
        with open(args.source, "wb") as handle:
            handle.write(original)

    def on_signal(signum, _frame):
        restore()
        print("\nINTERRUPTED (signal %d) - %s restored" % (signum, args.source))
        sys.exit(2)

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    try:
        baseline = run(args.test, args.timeout)
        if baseline != 0:
            print("BASELINE FAILED (exit %s). Fix the suite before mutating." % baseline)
            return 2

        mutants = build_mutants(original.decode("utf-8", errors="replace"))
        if not mutants:
            print("nothing to mutate in %s" % args.source)
            return 2

        total_found = len(mutants)
        if total_found > args.max:
            print("NOTE: %d mutants possible, running the first %d (raise with --max)"
                  % (total_found, args.max))
            mutants = mutants[: args.max]

        survived = []
        for name, line_number, line, mutant in mutants:
            with open(args.source, "w", encoding="utf-8") as handle:
                handle.write(mutant)
            result = run(args.test, args.timeout)
            restore()
            if result == 0:
                survived.append((name, line_number, line))
            print("%-8s %-4s line %-4d %s"
                  % ("SURVIVED" if result == 0 else "killed", name, line_number,
                     line.strip()[:60]))

        killed = len(mutants) - len(survived)
        print("MUTATION SCORE: %d/%d killed = %.0f%%"
              % (killed, len(mutants), 100.0 * killed / len(mutants)))
        for name, line_number, line in survived:
            print("  WEAK TEST: nothing failed when line %d (%s) went wrong: %s"
                  % (line_number, name, line.strip()[:60]))
        return 1 if survived else 0
    finally:
        restore()
        with open(args.source, "rb") as handle:
            if handle.read() != original:
                print("FATAL: could not restore %s" % args.source)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
