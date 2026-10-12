"""Validate mutation evidence independently; survivors/timeouts are not kills."""
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path, PurePosixPath


def require(condition, message):
    if not condition: raise ValueError(message)


def inspect(report, frontend_root):
    root = Path(frontend_root).resolve()
    def read(file):
        require(isinstance(file, str) and file and '\\' not in file, 'Invalid evidence path.')
        path = PurePosixPath(file)
        require(not path.is_absolute() and '..' not in path.parts and path.as_posix() == file, 'Unsafe evidence path: ' + file)
        resolved = (root / file).resolve()
        require(resolved.is_relative_to(root) and resolved.is_file(), 'Missing or escaping evidence file: ' + file)
        return resolved.read_bytes()
    def hashed(entries):
        require(isinstance(entries, list) and entries, 'Missing file hashes.')
        result = {}
        for entry in entries:
            require(isinstance(entry, dict), 'Invalid file evidence.')
            file = entry.get('file'); content = read(file)
            require(file not in result and entry.get('sha256') == hashlib.sha256(content).hexdigest(), 'Duplicate or stale file evidence: ' + file)
            result[file] = content
        return result
    def counts(item, fields):
        require(isinstance(item, dict) and all(type(item.get(field)) is int and item[field] >= 0 for field in fields), 'Missing/noninteger test counts.')
        return [item[field] for field in fields]
    def file_counts(entries, allowed):
        require(isinstance(entries, list), 'Missing per-file execution evidence.')
        result = {}
        for entry in entries:
            number, = counts(entry, ['tests']); file = entry.get('file')
            require(isinstance(file, str) and file in allowed and file not in result, 'Unexpected or duplicate executed test file.')
            result[file] = number
        return result
    require(isinstance(report, dict) and report.get('version') == 1 and not report.get('error'), 'Unsupported or aborted mutation report.')
    try:
        started, completed = [datetime.fromisoformat(report[field].replace('Z', '+00:00')) for field in ['startedAt', 'completedAt']]
        require(started.tzinfo and completed.tzinfo and completed >= started, 'Invalid mutation report times.')
    except (KeyError, TypeError, AttributeError, ValueError) as error:
        raise ValueError('Incomplete mutation report times.') from error
    for field, file in [('runnerSha256', 'scripts/check-test-strength.mjs'), ('sequencerSha256', 'scripts/mutation-sequencer.mjs'), ('configSha256', 'scripts/mutation.vitest.config.mjs')]:
        require(report.get(field) == hashlib.sha256(read(file)).hexdigest(), 'Stale mutation runner/configuration: ' + file)
    sources, tests = hashed(report.get('files')), hashed(report.get('testFiles'))
    discovered = lambda folders: {path.relative_to(root).as_posix() for folder in folders for path in (root / folder).rglob('*') if path.is_file() and path.suffix in ('.ts', '.tsx') and not path.name.endswith('.d.ts')}
    require(set(sources) == discovered(['src', 'server']), 'Missing or unexpected runtime source evidence.')
    require(set(tests) == {file for file in discovered(['src', 'server', 'tests']) if re.search(r'\.test\.tsx?$', file)}, 'Missing or unexpected test evidence.')
    baseline = report.get('baseline'); total, passed, failed, pending, todo = counts(baseline, ['tests', 'passed', 'failed', 'pending', 'todo'])
    require(total > 0 and passed == total and failed == pending == todo == 0 and baseline.get('success') is True and type(baseline.get('exitCode')) is int and baseline['exitCode'] == 0, 'Unmutated baseline is not fully green.')
    baseline_files = file_counts(baseline.get('testFiles'), tests)
    require(set(baseline_files) == set(tests) and all(baseline_files.values()) and sum(baseline_files.values()) == total, 'Baseline omitted test files or inconsistent assertion counts.')
    mutants = report.get('mutants'); require(isinstance(mutants, list) and mutants, 'No mutation evidence.')
    statuses, identities, changes, domains = Counter(), set(), set(), set()
    for mutant in mutants:
        require(isinstance(mutant, dict) and mutant.get('file') in sources, 'Missing mutant source.')
        file, start, end = mutant['file'], mutant.get('start'), mutant.get('end')
        content = sources[file].decode('utf-8').encode('utf-16-le')
        require(type(start) is int and type(end) is int and 0 <= start < end <= len(content) // 2, 'Invalid mutation range.')
        original, replacement, operator = [mutant.get(field) for field in ['original', 'replacement', 'operator']]
        require(all(isinstance(value, str) for value in [original, replacement, operator]) and operator and replacement != original and original.encode('utf-16-le') == content[start * 2:end * 2], 'Mutation does not change the recorded source.')
        identity = hashlib.sha256(f'{file}:{start}:{operator}:{original}:{replacement}'.encode()).hexdigest()[:16]
        change = (file, start, end, replacement)
        require(mutant.get('id') == identity and identity not in identities and change not in changes, 'Duplicate or forged mutant identity.')
        identities.add(identity); changes.add(change)
        selected = mutant.get('tests')
        require(isinstance(selected, list) and selected and all(isinstance(test, str) and test in tests for test in selected) and len(set(selected)) == len(selected), 'Missing selected test evidence.')
        status = mutant.get('status'); require(status in ['killed', 'survived', 'timeout', 'invalid'], 'Unknown mutation outcome.'); statuses[status] += 1
        if status == 'invalid':
            require(isinstance(mutant.get('reason'), str) and mutant['reason'], 'Invalid mutation needs an explanation.')
            continue
        require(mutant.get('typeValid') is True, 'Runtime mutant did not typecheck.')
        domains.add('server' if file.startswith('server/') else {'voice.ts': 'voice', 'learner.ts': 'memory', 'attachments.ts': 'uploads'}.get(Path(file).name, 'visual'))
        total, passed, failed, pending, todo = counts(mutant, ['executedTests', 'passedTests', 'failedTestsCount', 'pendingTests', 'todoTests'])
        require(passed + failed + pending + todo == total, 'Inconsistent mutant test counts.')
        collected, not_run = counts(mutant, ['collectedTests', 'notRunTests'])
        require(collected >= total and not_run == collected - total, 'Collected tests were mislabeled as executed.')
        executed_files = file_counts(mutant.get('executedTestFiles'), selected)
        require(sum(executed_files.values()) == total and all(number <= baseline_files[file] for file, number in executed_files.items()), 'Per-file execution counts do not match actual tests.')
        per_file_collected = 0
        for entry in mutant['executedTestFiles']:
            file_collected, file_not_run = counts(entry, ['collectedTests', 'notRunTests'])
            require(file_collected >= entry['tests'] and file_not_run == file_collected - entry['tests'], 'Per-file collected cases mislabeled as executed.')
            per_file_collected += file_collected
        require(per_file_collected == collected and type(mutant.get('timedOut')) is bool, 'Inconsistent collected totals or missing process timeout evidence.')
        failures = mutant.get('failedTests', [])
        require(isinstance(failures, list) and len(failures) <= failed, 'Inconsistent failed assertion evidence.')
        if status == 'killed':
            require(type(mutant.get('exitCode')) is int and mutant['exitCode'] == 1 and not mutant['timedOut'] and total > 0 and failed > 0 and failures, 'Kill without failing assertions.')
            for assertion in failures:
                require(isinstance(assertion, dict) and assertion.get('file') in selected and executed_files.get(assertion['file'], 0) > 0 and isinstance(assertion.get('messages'), list) and assertion['messages'] and all(isinstance(message, str) and message for message in assertion['messages']), 'Unusable failed assertion evidence.')
                require(not any(re.search(r'\b(?:test|hook) timed out\b', message, re.I) for message in assertion['messages']), 'Timeout incorrectly reported as a kill.')
        elif status == 'survived':
            require(type(mutant.get('exitCode')) is int and mutant['exitCode'] == 0 and not mutant['timedOut'] and total > 0 and passed == total and failed == pending == todo == 0 and not failures, 'Survivor without green usable tests.')
            require(not_run == 0 and executed_files == {file: baseline_files[file] for file in selected}, 'Survivor did not execute every selected baseline assertion.')
        else:
            require(isinstance(mutant.get('reason'), str) and mutant['reason'], 'Timeout needs an explanation.')
    summary = {status: statuses[status] for status in ['killed', 'survived', 'timeout', 'invalid']}
    counts(report.get('summary'), list(summary))
    require(report.get('summary') == summary, 'Mutation summary does not match actual records.')
    require(type(report.get('requested')) is int and report['requested'] >= 200 and sum(summary[status] for status in ['killed', 'survived', 'timeout']) >= report['requested'], 'Fewer than 200 type-valid runtime mutations.')
    require(domains == {'voice', 'visual', 'memory', 'uploads', 'server'}, 'Missing behavioral mutation domains.')
    return summary


if __name__ == '__main__':
    path = Path(sys.argv[1] if len(sys.argv) > 1 else 'frontend/test-results/mutations.json')
    summary = inspect(json.loads(path.read_text()), Path(sys.argv[2] if len(sys.argv) > 2 else 'frontend'))
    print('Validated mutation evidence: ' + json.dumps(summary) + '. This does not authorize unresolved survivors.')
    if summary['survived'] or summary['timeout']:
        raise SystemExit('Release blocked: unresolved mutation survivors or timeouts.')
