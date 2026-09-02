#!/usr/bin/env python3
"""List every value written into every line of a file.

This script has NO opinion about which values are bad. It cannot have one:
a list of "bad value types" is itself a hardcoded list, and it would miss
whatever is not on it. It prints every literal it finds. You judge each one.

usage: list_values.py PATH [PATH ...]

Exit 0 = no values to judge. Exit 1 = values printed, judge them. Exit 2 = usage.
Invariant: never raises on any file content.
"""

import os
import re
import sys

VALUE = re.compile(
    r"'[^']*'"
    r"|\"[^\"]*\""
    r"|`[^`]*`"
    r"|(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])"
)


def files_in(paths):
    for path in paths:
        if os.path.isfile(path):
            yield path
            continue
        for root, dirs, names in os.walk(path):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for name in sorted(names):
                if not name.startswith("."):
                    yield os.path.join(root, name)


def lines_of(path):
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except OSError:
        return None
    return raw.decode("utf-8", errors="replace").splitlines()


def main(argv):
    paths = argv[1:]
    if not paths:
        print("usage: list_values.py PATH [PATH ...]")
        return 2

    lines_read = 0
    values = 0
    for path in files_in(paths):
        lines = lines_of(path)
        if lines is None:
            print("%s: UNREADABLE" % path)
            continue
        for number, line in enumerate(lines, 1):
            lines_read += 1
            for match in VALUE.finditer(line):
                values += 1
                print("%s:%d: %s   general or specific?   | %s"
                      % (path, number, match.group(0)[:40], line.strip()[:70]))

    print("LINE CHECK: %d lines read, %d values to judge" % (lines_read, values))
    return 1 if values else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except BrokenPipeError:
        sys.exit(0)
