import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
import io
from contextlib import redirect_stdout
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'ci' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
workflow = load('check_workflows')
verdict = load('check_verdict')
sarif = load('check_sarif')

class GateAttacks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / '.github/workflows', self.root / '.github/workflows')
        (self.root / 'ci').mkdir()
        shutil.copy(ROOT / 'ci/release-gates.json', self.root / 'ci/release-gates.json')
        (self.root / 'frontend').mkdir()
        shutil.copy(ROOT / 'frontend/package.json', self.root / 'frontend/package.json')
        self.path = self.root / '.github/workflows/ci.yml'
        self.data = yaml.load(self.path.read_text(), Loader=yaml.BaseLoader)
    def rejects(self):
        self.path.write_text(yaml.safe_dump(self.data, sort_keys=False))
        with self.assertRaises(ValueError): workflow.check(self.root)
    def test_npm_gate_scripts_cannot_be_replaced_with_fake_passes(self):
        path = self.root / 'frontend/package.json'
        original = json.loads(path.read_text())
        for name in original['scripts']:
            with self.subTest(script=name):
                package = copy.deepcopy(original)
                package['scripts'][name] = 'echo passed'
                path.write_text(json.dumps(package))
                self.rejects()
    def test_hidden_npm_hooks_cannot_rewrite_tests_before_verification(self):
        path = self.root / 'frontend/package.json'
        package = json.loads(path.read_text())
        package['scripts']['pretest:strength'] = 'echo rewrite'
        path.write_text(json.dumps(package))
        self.rejects()
    def test_real_workflow_matches_contract(self):
        self.assertTrue(workflow.check(self.root))
    def test_competing_workflow_cannot_hide_under_another_yaml_extension(self):
        for extension in ['yml', 'yaml']:
            with self.subTest(extension=extension):
                path = self.root / '.github/workflows' / ('extra.' + extension)
                path.write_text('name: extra\non: push\njobs: {}\n')
                try:
                    with self.assertRaises(ValueError): workflow.check(self.root)
                finally:
                    path.unlink()
    def test_gate_deletion_and_renaming(self):
        original = copy.deepcopy(self.data)
        for name in ['integrity', 'core', 'browser', 'container', 'security']:
            with self.subTest(gate=name):
                self.data = copy.deepcopy(original); del self.data['jobs'][name]; self.rejects()
    def test_missing_commands_echo_and_suppressed_failures(self):
        original = copy.deepcopy(self.data)
        for replacement in ['echo npm run test:ci', 'npm run test:ci || true', 'npm run test:ci; true', 'npm run test:ci | cat', 'true']:
            with self.subTest(command=replacement):
                self.data = copy.deepcopy(original)
                step = next(s for s in self.data['jobs']['core']['steps'] if s.get('run') == 'npm run test:ci')
                step['run'] = replacement; self.rejects()
    def test_job_and_step_failure_suppression(self):
        self.data['jobs']['core']['continue-on-error'] = 'true'; self.rejects()
        del self.data['jobs']['core']['continue-on-error']
        self.data['jobs']['core']['steps'][2]['continue-on-error'] = 'true'; self.rejects()
    def test_condition_cannot_skip_required_commands(self):
        self.data['jobs']['core']['if'] = 'false'; self.rejects()
        del self.data['jobs']['core']['if']
        self.data['jobs']['core']['steps'][2]['if'] = 'false'; self.rejects()
    def test_finalizer_cannot_drop_dependency(self):
        self.data['jobs']['release-gate']['needs'].remove('browser'); self.rejects()
    def test_finalizer_must_observe_failure_and_real_results(self):
        self.data['jobs']['release-gate']['if'] = 'success()'; self.rejects()
        self.data['jobs']['release-gate']['if'] = 'always()'
        self.data['jobs']['release-gate']['env']['NEEDS_JSON'] = '{}'; self.rejects()
    def test_mutable_actions_and_write_tokens_are_rejected(self):
        self.data['jobs']['core']['steps'][0]['uses'] = 'actions/checkout@main'; self.rejects()
        self.data['jobs']['core']['steps'][0]['uses'] = 'actions/checkout@' + 'a' * 40
        self.data['permissions'] = {'contents': 'write'}; self.rejects()
    def test_branch_and_path_filters_cannot_hide_changes(self):
        self.data['on']['pull_request'] = {'paths': ['frontend/**']}; self.rejects()
    def test_all_unknown_failed_and_incomplete_verdicts_block(self):
        expected = ['a', 'b', 'c']
        success = {name: {'result': 'success'} for name in expected}
        verdict.verify(success, expected)
        for state in ['failure', 'skipped', 'cancelled', 'pending', 'unknown', None]:
            with self.subTest(state=state):
                needs = copy.deepcopy(success); needs['b']['result'] = state
                with self.assertRaises(ValueError): verdict.verify(needs, expected)
        for needs in [{}, {'a': {'result': 'success'}}, {**success, 'extra': {'result': 'success'}}]:
            with self.assertRaises(ValueError): verdict.verify(needs, expected)
    def test_security_upload_without_clean_evidence_is_not_a_pass(self):
        sarif.inspect({'runs': [{'results': []}]})
        for level in ['error', 'warning']:
            for suppressed in [False, True]:
                result = {'level': level, 'ruleId': 'example'}
                if suppressed: result['suppressions'] = [{'kind': 'inSource'}]
                with redirect_stdout(io.StringIO()), self.assertRaises(ValueError): sarif.inspect({'runs': [{'results': [result]}]})
        for report in [{}, {'runs': []}, {'runs': [{'invocations': [{'executionSuccessful': False}]}]}]:
            with self.assertRaises(ValueError): sarif.inspect(report)

class ScannerDiagnostics(unittest.TestCase):
    def test_annotation_has_exact_location_and_remediation_link(self):
        result = {'ruleId': 'js/example', 'message': {'text': 'Unsafe input'}, 'locations': [{'physicalLocation': {'artifactLocation': {'uri': 'frontend/src/example.ts'}, 'region': {'startLine': 12, 'startColumn': 4}}}]}
        output = sarif.annotation(result, {'js/example': {'helpUri': 'https://codeql.github.com/example'}})
        self.assertIn('file=frontend/src/example.ts,line=12,col=4', output)
        self.assertIn('Remediation guidance: https://codeql.github.com/example', output)
    def test_untrusted_messages_cannot_inject_workflow_commands(self):
        result = {'ruleId': 'bad,title\n::notice::fake', 'message': {'text': '100%\n::notice::fake\rnext'}, 'locations': [{'physicalLocation': {'artifactLocation': {'uri': 'bad,file\nname.ts'}}}]}
        output = sarif.annotation(result, {})
        self.assertNotIn('\n', output)
        self.assertNotIn('\r', output)
        self.assertIn('%0A', output)
        self.assertIn('%2C', output)
        self.assertIn('100%25', output)
    def test_all_findings_are_reported_before_failing(self):
        report = {'runs': [{'results': [{'ruleId': name, 'level': 'error'} for name in ['first', 'second']]}]}
        stream = io.StringIO()
        with redirect_stdout(stream), self.assertRaises(ValueError): sarif.inspect(report)
        self.assertIn('title=first', stream.getvalue())
        self.assertIn('title=second', stream.getvalue())
    def test_unknown_severity_fails_closed(self):
        with redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            sarif.inspect({'runs': [{'results': [{'level': 'unexpected'}]}]})

class EvidenceAttacks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.frontend = self.root / 'frontend'
        (self.frontend / 'test-results').mkdir(parents=True)
        (self.frontend / 'tests').mkdir()
        (self.frontend / 'coverage').mkdir()
        (self.frontend / 'src').mkdir()
        (self.frontend / 'server').mkdir()
        (self.root / 'ci').mkdir()
        shutil.copy(ROOT / 'ci/release-gates.json', self.root / 'ci/release-gates.json')
        floors = json.loads((ROOT / 'ci/release-gates.json').read_text())['test_floors']
        self.report = {'success': True, 'numTotalTests': floors['tests'], 'numPassedTests': floors['tests'], 'numFailedTests': 0, 'numPendingTests': 0, 'numTodoTests': 0, 'testResults': []}
        per_file, extra = divmod(floors['tests'], floors['files'])
        for i in range(floors['files']):
            path = self.frontend / 'tests' / f'generated{i}.test.ts'; path.write_text('')
            self.report['testResults'].append({'name': str(path), 'assertionResults': [{'status': 'passed'} for _ in range(per_file + (i < extra))]})
        source = self.frontend / 'src' / 'example.ts'; source.write_text('')
        self.coverage = {'total': {metric: {'pct': 100} for metric in ['lines', 'branches', 'statements', 'functions']}, str(source): {}}
    def run_checker(self):
        import subprocess
        (self.frontend / 'test-results/unit.json').write_text(json.dumps(self.report))
        (self.frontend / 'coverage/coverage-summary.json').write_text(json.dumps(self.coverage))
        return subprocess.run(['node', str(ROOT / 'frontend/scripts/check-test-results.mjs')], cwd=self.frontend, capture_output=True, timeout=10)
    def test_valid_evidence(self): self.assertEqual(self.run_checker().returncode, 0)
    def test_test_deletion_cannot_hide_under_a_consistent_success_report(self):
        self.report['testResults'][0]['assertionResults'].pop()
        self.report['numTotalTests'] -= 1
        self.report['numPassedTests'] -= 1
        self.assertNotEqual(self.run_checker().returncode, 0)
    def test_forged_success_summary_with_skipped_assertion(self):
        self.report['testResults'][0]['assertionResults'][0]['status'] = 'skipped'
        self.assertNotEqual(self.run_checker().returncode, 0)
    def test_empty_collection_and_forged_counts(self):
        self.report['testResults'] = []
        self.assertNotEqual(self.run_checker().returncode, 0)
    def test_unreported_discovered_test(self):
        (self.frontend / 'tests' / 'missing.test.ts').write_text('')
        self.assertNotEqual(self.run_checker().returncode, 0)
    def test_uncovered_source_cannot_be_excluded(self):
        (self.frontend / 'server' / 'missing.ts').write_text('')
        self.assertNotEqual(self.run_checker().returncode, 0)
    def test_coverage_regression(self):
        self.coverage['total']['branches']['pct'] = 0
        self.assertNotEqual(self.run_checker().returncode, 0)

if __name__ == '__main__':
    unittest.main()
