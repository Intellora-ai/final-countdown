import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
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
    def test_real_workflow_matches_contract(self):
        self.assertTrue(workflow.check(self.root))
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
                with self.assertRaises(ValueError): sarif.inspect({'runs': [{'results': [result]}]})
        for report in [{}, {'runs': []}, {'runs': [{'invocations': [{'executionSuccessful': False}]}]}]:
            with self.assertRaises(ValueError): sarif.inspect(report)

if __name__ == '__main__': unittest.main()

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
        self.report = {'success': True, 'numTotalTests': 147, 'numPassedTests': 147, 'numFailedTests': 0, 'numPendingTests': 0, 'numTodoTests': 0, 'testResults': []}
        for i in range(16):
            path = self.frontend / 'tests' / f'generated{i}.test.ts'; path.write_text('')
            self.report['testResults'].append({'name': str(path), 'assertionResults': [{'status': 'passed'} for _ in range(9 + (i < 3))]})
        source = self.frontend / 'src' / 'example.ts'; source.write_text('')
        self.coverage = {'total': {metric: {'pct': 100} for metric in ['lines', 'branches', 'statements', 'functions']}, str(source): {}}
    def run_checker(self):
        import subprocess
        (self.frontend / 'test-results/unit.json').write_text(json.dumps(self.report))
        (self.frontend / 'coverage/coverage-summary.json').write_text(json.dumps(self.coverage))
        return subprocess.run(['node', str(ROOT / 'frontend/scripts/check-test-results.mjs')], cwd=self.frontend, capture_output=True, timeout=10)
    def test_valid_evidence(self): self.assertEqual(self.run_checker().returncode, 0)
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
