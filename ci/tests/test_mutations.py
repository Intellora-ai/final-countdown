import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check_mutations', ROOT / 'ci/check_mutations.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class MutationEvidenceAttacks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        source_files = ['src/voice.ts', 'src/learner.ts', 'src/attachments.ts', 'src/drawing.ts', 'server/api.ts']
        self.report = {'version': 1, 'requested': 200, 'startedAt': '2026-10-12T00:00:00Z',
                       'completedAt': '2026-10-12T00:01:00Z', 'files': [], 'testFiles': [], 'mutants': [],
                       'baseline': {'tests': 5, 'passed': 5, 'failed': 0, 'pending': 0, 'todo': 0,
                                    'success': True, 'exitCode': 0},
                       'summary': {'killed': 200, 'survived': 0, 'timeout': 0, 'invalid': 0}}
        self.write('scripts/check-test-strength.mjs', '// runner\n')
        self.report['runnerSha256'] = self.digest('scripts/check-test-strength.mjs')
        for field, file in [('sequencerSha256', 'scripts/mutation-sequencer.mjs'), ('configSha256', 'scripts/mutation.vitest.config.mjs')]:
            self.write(file, '// mutation configuration\n'); self.report[field] = self.digest(file)
        self.report['baseline']['testFiles'] = []
        for index, source in enumerate(source_files):
            content = 'if (ok) value();\n' * 40
            self.write(source, content)
            test = f'tests/domain{index}.test.ts'; self.write(test, '// behavioral test\n')
            self.report['files'].append({'file': source, 'sha256': self.digest(source), 'tests': [test]})
            self.report['testFiles'].append({'file': test, 'sha256': self.digest(test)})
            self.report['baseline']['testFiles'].append({'file': test, 'tests': 1})
            for occurrence in range(40):
                start = occurrence * len('if (ok) value();\n') + 4
                mutant = {'file': source, 'start': start, 'end': start + 2, 'line': occurrence + 1, 'column': 5,
                          'operator': 'negate-condition', 'original': 'ok', 'replacement': '!(ok)',
                          'tests': [test], 'status': 'killed', 'typeValid': True, 'exitCode': 1,
                          'executedTests': 1, 'passedTests': 0, 'failedTestsCount': 1, 'pendingTests': 0,
                          'todoTests': 0, 'collectedTests': 1, 'notRunTests': 0, 'timedOut': False,
                          'executedTestFiles': [{'file': test, 'tests': 1, 'collectedTests': 1, 'notRunTests': 0}],
                          'failedTests': [{'file': test, 'name': 'keeps the contract',
                                                       'messages': ['AssertionError: expected true to be false']}]}
                mutant['id'] = self.identifier(mutant)
                self.report['mutants'].append(mutant)

    def write(self, file, content):
        path = self.root / file; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content)

    def digest(self, file): return hashlib.sha256((self.root / file).read_bytes()).hexdigest()
    def identifier(self, mutant):
        fields = [mutant['file'], str(mutant['start']), mutant['operator'], mutant['original'], mutant['replacement']]
        return hashlib.sha256(':'.join(fields).encode()).hexdigest()[:16]
    def rejects(self):
        with self.assertRaises(ValueError): checker.inspect(self.report, self.root)

    def test_complete_honest_evidence_passes(self): self.assertEqual(checker.inspect(self.report, self.root), self.report['summary'])
    def test_unicode_offsets_use_typescript_utf16_coordinates(self):
        source = 'src/voice.ts'; prefix = '// 😀\n'
        self.write(source, prefix + (self.root / source).read_text())
        next(entry for entry in self.report['files'] if entry['file'] == source)['sha256'] = self.digest(source)
        for mutant in self.report['mutants']:
            if mutant['file'] == source:
                mutant['start'] += len(prefix.encode('utf-16-le')) // 2
                mutant['end'] += len(prefix.encode('utf-16-le')) // 2
                mutant['id'] = self.identifier(mutant)
        self.assertEqual(checker.inspect(self.report, self.root)['killed'], 200)
    def test_unsupported_or_incomplete_report_rejected(self):
        for field, value in [('version', 2), ('completedAt', None), ('baseline', None), ('error', 'aborted')]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report[field] = value; self.rejects(); self.report = original
    def test_non_green_or_skipped_baseline_rejected(self):
        for field, value in [('tests', 0), ('passed', 4), ('failed', 1), ('pending', 1), ('todo', 1), ('success', False), ('exitCode', 1)]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['baseline'][field] = value; self.rejects(); self.report = original
    def test_stale_source_tests_or_runner_rejected(self):
        for file in ['src/voice.ts', 'tests/domain0.test.ts', 'scripts/check-test-strength.mjs',
                     'scripts/mutation-sequencer.mjs', 'scripts/mutation.vitest.config.mjs']:
            with self.subTest(file=file):
                path = self.root / file; content = path.read_text(); path.write_text(content + '// changed\n')
                try: self.rejects()
                finally: path.write_text(content)
    def test_missing_source_or_test_rejected(self):
        for file in ['src/voice.ts', 'tests/domain0.test.ts']:
            with self.subTest(file=file):
                path = self.root / file; content = path.read_text(); path.unlink()
                try: self.rejects()
                finally: path.write_text(content)
    def test_new_unhashed_sources_or_tests_rejected(self):
        for file in ['server/new.ts', 'tests/new.test.ts']:
            with self.subTest(file=file):
                self.write(file, '// new\n')
                try: self.rejects()
                finally: (self.root / file).unlink()
    def test_path_traversal_and_absolute_paths_rejected(self):
        for path in ['../outside.ts', '/tmp/outside.ts', 'src/../voice.ts', 'src\\voice.ts']:
            with self.subTest(path=path):
                original = self.report['files'][0]['file']; self.report['files'][0]['file'] = path
                self.rejects(); self.report['files'][0]['file'] = original
    def test_symlink_cannot_escape_checkout(self):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / 'voice.ts'; target.write_text((self.root / 'src/voice.ts').read_text())
            (self.root / 'src/voice.ts').unlink(); (self.root / 'src/voice.ts').symlink_to(target)
            self.rejects()
    def test_duplicate_mutant_or_forged_identity_rejected(self):
        original = copy.deepcopy(self.report)
        self.report['mutants'][1] = copy.deepcopy(self.report['mutants'][0]); self.rejects()
        self.report = original; self.report['mutants'][0]['id'] = '0' * 16; self.rejects()
    def test_same_mutation_cannot_be_counted_again_by_renaming_operator(self):
        self.report['mutants'][1] = copy.deepcopy(self.report['mutants'][0])
        self.report['mutants'][1]['operator'] = 'another-name'
        self.report['mutants'][1]['id'] = self.identifier(self.report['mutants'][1]); self.rejects()
    def test_mutation_must_change_the_current_original(self):
        for field, value in [('start', -1), ('end', 10000), ('original', 'wrong'), ('replacement', 'ok')]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['mutants'][0][field] = value; self.rejects(); self.report = original
    def test_fake_kill_and_missing_type_evidence_rejected(self):
        for field, value in [('typeValid', False), ('exitCode', 0), ('executedTests', 0),
                             ('failedTestsCount', 0), ('failedTests', []), ('status', 'unknown'), ('exitCode', True),
                             ('tests', []), ('tests', [None]), ('tests', [['nested']])]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['mutants'][0][field] = value; self.rejects(); self.report = original
    def test_timeout_cannot_be_claimed_as_assertion_kill(self):
        self.report['mutants'][0]['failedTests'][0]['messages'] = ['Error: Test timed out in 5000ms.']; self.rejects()
    def test_failed_assertion_needs_selected_test_and_message(self):
        for field, value in [('file', 'tests/unreported.test.ts'), ('messages', [])]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['mutants'][0]['failedTests'][0][field] = value; self.rejects(); self.report = original
    def test_summary_cannot_hide_survivors_or_invent_kills(self):
        self.report['summary']['killed'] = 201; self.rejects()
    def test_baseline_cannot_omit_or_invent_test_files(self):
        for replacement in [[], [{'file': 'tests/domain0.test.ts', 'tests': 5}],
                            [{'file': 'tests/unknown.test.ts', 'tests': 5}]]:
            with self.subTest(replacement=replacement):
                original = copy.deepcopy(self.report); self.report['baseline']['testFiles'] = replacement
                self.rejects(); self.report = original
    def test_execution_counts_cannot_hide_bail_unrun_cases(self):
        for field, value in [('collectedTests', 0), ('notRunTests', 1), ('executedTestFiles', []),
                             ('executedTestFiles', [{'file': 'tests/domain0.test.ts', 'tests': 2}])]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['mutants'][0][field] = value
                self.rejects(); self.report = original
    def test_per_file_bail_counts_must_match_global_execution(self):
        for field, value in [('collectedTests', 0), ('notRunTests', 1)]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['mutants'][0]['executedTestFiles'][0][field] = value
                self.rejects(); self.report = original
    def test_process_deadline_cannot_be_claimed_as_a_kill(self):
        self.report['mutants'][0]['timedOut'] = True; self.rejects()
    def test_assertion_kill_may_stop_before_other_selected_files(self):
        mutant = self.report['mutants'][0]
        mutant.update(tests=['tests/domain0.test.ts', 'tests/domain1.test.ts'], collectedTests=2, notRunTests=1)
        mutant['executedTestFiles'].append({'file': 'tests/domain1.test.ts', 'tests': 0, 'collectedTests': 1, 'notRunTests': 1})
        self.assertEqual(checker.inspect(self.report, self.root)['killed'], 200)
    def test_survivor_must_execute_every_selected_file_with_baseline_counts(self):
        mutant = self.report['mutants'][0]
        mutant.update(status='survived', exitCode=0, passedTests=1, failedTestsCount=0, failedTests=[],
                      tests=['tests/domain0.test.ts', 'tests/domain1.test.ts'])
        self.report['summary'].update(killed=199, survived=1); self.rejects()
        mutant.update(executedTests=2, collectedTests=2, passedTests=2,
                      executedTestFiles=[{'file': 'tests/domain0.test.ts', 'tests': 2, 'collectedTests': 2, 'notRunTests': 0}]); self.rejects()
        mutant.update(executedTestFiles=[{'file': file, 'tests': 1, 'collectedTests': 1, 'notRunTests': 0} for file in mutant['tests']])
        self.assertEqual(checker.inspect(self.report, self.root)['survived'], 1)
        mutant.update(collectedTests=3, notRunTests=1); self.rejects()
    def test_invalids_cannot_fill_200_runtime_mutations(self):
        self.report['mutants'][0].update(status='invalid', typeValid=False, executedTests=0, reason='type error')
        self.report['summary'].update(killed=199, invalid=1); self.rejects()
    def test_all_five_domains_must_have_runtime_mutations(self):
        drawing = 'src/drawing.ts'; self.write(drawing, 'if (ok) value();\n' * 80)
        next(entry for entry in self.report['files'] if entry['file'] == drawing)['sha256'] = self.digest(drawing)
        for occurrence, mutant in enumerate(self.report['mutants'][:40]):
            replacement = copy.deepcopy(mutant)
            replacement.update(file=drawing, start=(40 + occurrence) * len('if (ok) value();\n') + 4)
            replacement['end'] = replacement['start'] + 2; replacement['id'] = self.identifier(replacement)
            mutant.update(status='invalid', typeValid=False, executedTests=0, reason='type error')
            self.report['mutants'].append(replacement)
        self.report['summary'].update(killed=200, invalid=40)
        with self.assertRaisesRegex(ValueError, 'Missing behavioral mutation domains'): checker.inspect(self.report, self.root)
    def test_survivor_is_reported_honestly_without_arbitrary_kill_floor(self):
        self.report['mutants'][0].update(status='survived', exitCode=0, passedTests=1, failedTestsCount=0,
                                         failedTests=[], reason='behavioral tests passed')
        self.report['summary'].update(killed=199, survived=1)
        self.assertEqual(checker.inspect(self.report, self.root)['survived'], 1)
        for field, value in [('executedTests', 0), ('pendingTests', 1), ('todoTests', 1), ('failedTestsCount', 1), ('passedTests', 0), ('exitCode', 1)]:
            with self.subTest(field=field):
                original = copy.deepcopy(self.report); self.report['mutants'][0][field] = value; self.rejects(); self.report = original
    def test_timeout_is_reported_separately_without_becoming_a_kill(self):
        self.report['mutants'][0].update(status='timeout', exitCode=None, executedTests=0, passedTests=0,
                                         collectedTests=0, notRunTests=0, executedTestFiles=[], timedOut=True,
                                         failedTestsCount=0, failedTests=[], reason='process deadline exceeded')
        self.report['summary'].update(killed=199, timeout=1)
        self.assertEqual(checker.inspect(self.report, self.root)['timeout'], 1)
    def run_cli(self):
        report = self.root / 'mutations.json'; report.write_text(json.dumps(self.report))
        return subprocess.run([sys.executable, str(ROOT / 'ci/check_mutations.py'), str(report), str(self.root)],
                              capture_output=True, text=True, timeout=10)
    def test_cli_accepts_complete_assertion_kill_evidence(self):
        result = self.run_cli(); self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"killed": 200', result.stdout)
    def test_cli_blocks_honest_survivor_despite_valid_structural_evidence(self):
        self.report['mutants'][0].update(status='survived', exitCode=0, passedTests=1, failedTestsCount=0, failedTests=[])
        self.report['summary'].update(killed=199, survived=1)
        self.assertEqual(checker.inspect(self.report, self.root)['survived'], 1)
        result = self.run_cli(); self.assertNotEqual(result.returncode, 0)
        self.assertIn('"survived": 1', result.stdout)
    def test_cli_blocks_honest_timeout_despite_valid_structural_evidence(self):
        self.report['mutants'][0].update(status='timeout', exitCode=None, timedOut=True, executedTests=0,
                                        passedTests=0, failedTestsCount=0, collectedTests=0, notRunTests=0,
                                        executedTestFiles=[], failedTests=[], reason='process deadline exceeded')
        self.report['summary'].update(killed=199, timeout=1)
        self.assertEqual(checker.inspect(self.report, self.root)['timeout'], 1)
        result = self.run_cli(); self.assertNotEqual(result.returncode, 0)
        self.assertIn('"timeout": 1', result.stdout)


if __name__ == '__main__': unittest.main()
