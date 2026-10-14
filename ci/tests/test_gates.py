import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
import io
import xml.etree.ElementTree as ET
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
REQUIRED_JOBS = ['integrity', 'core', 'browser', 'container', 'security', 'coverage']
HEAD_REF = '${{ github.event.pull_request.head.sha || github.sha }}'
COVERAGE_UPLOADER = 'actions/upload-code-coverage@2b21a77928be8d5168c2b9581a67f2adbebacc52'
METRICS = ['lines', 'statements', 'functions', 'branches']

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
        contract = json.loads((self.root / 'ci/release-gates.json').read_text())
        self.assertEqual(contract['required_jobs'], REQUIRED_JOBS)
        self.assertEqual(contract['coverage_floors'], dict.fromkeys(METRICS, 95))
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
        for name in REQUIRED_JOBS:
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
        original = copy.deepcopy(self.data)
        for name in REQUIRED_JOBS:
            with self.subTest(gate=name):
                self.data = copy.deepcopy(original)
                self.data['jobs']['release-gate']['needs'].remove(name); self.rejects()
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
    def test_coverage_floors_cannot_be_lowered_or_omitted(self):
        path = self.root / 'ci/release-gates.json'
        original = json.loads(path.read_text())
        for metric in METRICS:
            for minimum in [94.99, 85, 0, '95', None]:
                with self.subTest(metric=metric, minimum=minimum):
                    contract = copy.deepcopy(original)
                    if minimum is None:
                        del contract['coverage_floors'][metric]
                    else:
                        contract['coverage_floors'][metric] = minimum
                    path.write_text(json.dumps(contract)); self.rejects()
    def test_coverage_job_must_follow_successful_core_evidence(self):
        self.assertEqual(self.data['jobs']['coverage']['needs'], ['core'])
        original = copy.deepcopy(self.data)
        for needs in [[], ['integrity'], ['core', 'browser']]:
            with self.subTest(needs=needs):
                self.data = copy.deepcopy(original)
                self.data['jobs']['coverage']['needs'] = needs; self.rejects()
    def test_coverage_job_permissions_are_exact(self):
        expected = {'contents': 'read', 'code-quality': 'write', 'pull-requests': 'read'}
        self.assertEqual(self.data['jobs']['coverage']['permissions'], expected)
        original = copy.deepcopy(self.data)
        for permissions in [None, {'contents': 'read'}, {**expected, 'contents': 'write'}, {**expected, 'actions': 'write'}, {**expected, 'unknown-scope': 'write'}]:
            with self.subTest(permissions=permissions):
                self.data = copy.deepcopy(original)
                if permissions is None:
                    del self.data['jobs']['coverage']['permissions']
                else:
                    self.data['jobs']['coverage']['permissions'] = permissions
                self.rejects()
    def test_code_quality_write_permission_is_limited_to_coverage_job(self):
        original = copy.deepcopy(self.data)
        self.data['permissions']['code-quality'] = 'write'
        self.rejects()
        self.data = copy.deepcopy(original)
        self.data['jobs']['core']['permissions'] = {'contents': 'read', 'code-quality': 'write'}
        self.rejects()
    def test_actionlint_exception_cannot_hide_unrelated_diagnostics(self):
        original = copy.deepcopy(self.data)
        for pattern in ['.*', 'unknown permission scope', 'permissions']:
            with self.subTest(pattern=pattern):
                self.data = copy.deepcopy(original)
                step = next(step for step in self.data['jobs']['integrity']['steps'] if step.get('run', '').startswith('.ci-tools/actionlint'))
                step['run'] = f".ci-tools/actionlint -color -ignore '{pattern}'"
                self.rejects()
    def test_actionlint_exception_cannot_be_broadened_in_workflow_and_contract(self):
        original = copy.deepcopy(self.data)
        path = self.root / 'ci/release-gates.json'
        original_contract = json.loads(path.read_text())
        for pattern in ['.*', 'unknown permission scope', 'permissions']:
            with self.subTest(pattern=pattern):
                self.data = copy.deepcopy(original)
                contract = copy.deepcopy(original_contract)
                command = f".ci-tools/actionlint -color -ignore '{pattern}'"
                step = next(step for step in self.data['jobs']['integrity']['steps'] if step.get('run', '').startswith('.ci-tools/actionlint'))
                step['run'] = command
                commands = contract['commands']['integrity']
                index = next(index for index, value in enumerate(commands) if value.startswith('.ci-tools/actionlint'))
                commands[index] = command
                path.write_text(json.dumps(contract))
                self.rejects()
    def test_coverage_evidence_checkouts_map_reports_to_pull_request_head(self):
        original = copy.deepcopy(self.data)
        for job in ['core', 'coverage']:
            checkout = original['jobs'][job]['steps'][0]
            self.assertTrue(checkout['uses'].startswith('actions/checkout@'))
            self.assertEqual(checkout['with']['ref'], HEAD_REF)
            for ref in [None, '${{ github.sha }}', '${{ github.event.pull_request.merge_commit_sha }}']:
                with self.subTest(job=job, ref=ref):
                    self.data = copy.deepcopy(original)
                    checkout = self.data['jobs'][job]['steps'][0]
                    if ref is None:
                        del checkout['with']['ref']
                    else:
                        checkout['with']['ref'] = ref
                    self.rejects()
    def test_coverage_publisher_steps_cannot_be_removed_or_replaced(self):
        original = copy.deepcopy(self.data)
        for index in range(len(original['jobs']['coverage']['steps'])):
            with self.subTest(step=index):
                self.data = copy.deepcopy(original)
                del self.data['jobs']['coverage']['steps'][index]; self.rejects()
        self.data = copy.deepcopy(original)
        self.data['jobs']['coverage']['steps'][-1]['uses'] = 'actions/upload-artifact@' + 'a' * 40
        self.rejects()
    def test_coverage_download_has_exact_artifact_and_destination(self):
        original = copy.deepcopy(self.data)
        step = next(step for step in original['jobs']['coverage']['steps'] if step.get('uses', '').startswith('actions/download-artifact@'))
        self.assertEqual(step['with'], {'name': 'unit-and-coverage', 'path': 'coverage-evidence'})
        for field, value in [('name', 'browser-failure-traces'), ('path', '.')]:
            with self.subTest(field=field):
                self.data = copy.deepcopy(original)
                step = next(step for step in self.data['jobs']['coverage']['steps'] if step.get('uses', '').startswith('actions/download-artifact@'))
                step['with'][field] = value; self.rejects()
    def test_coverage_upload_inputs_require_real_evidence_and_processing(self):
        original = copy.deepcopy(self.data)
        step = next(step for step in original['jobs']['coverage']['steps'] if step.get('uses', '').startswith('actions/upload-code-coverage@'))
        self.assertEqual(step['uses'], COVERAGE_UPLOADER)
        expected = {'file': 'coverage-evidence/coverage/cobertura-coverage.xml', 'language': 'TypeScript', 'label': 'code-coverage/vitest', 'fail-on-error': 'true', 'wait-for-processing-timeout': '160'}
        self.assertEqual(step['with'], expected)
        for field, value in [('file', 'coverage-evidence/coverage/coverage-summary.json'), ('language', 'JavaScript'), ('label', 'different'), ('fail-on-error', 'false'), ('wait-for-processing-timeout', '0')]:
            for omitted in [False, True]:
                with self.subTest(field=field, omitted=omitted):
                    self.data = copy.deepcopy(original)
                    step = next(step for step in self.data['jobs']['coverage']['steps'] if step.get('uses', '').startswith('actions/upload-code-coverage@'))
                    if omitted:
                        del step['with'][field]
                    else:
                        step['with'][field] = value
                    self.rejects()
    def test_coverage_upload_cannot_skip_or_suppress_failures(self):
        original = copy.deepcopy(self.data)
        for index in range(len(original['jobs']['coverage']['steps'])):
            for field, value in [('if', 'false'), ('continue-on-error', 'true')]:
                with self.subTest(step=index, field=field):
                    self.data = copy.deepcopy(original)
                    self.data['jobs']['coverage']['steps'][index][field] = value; self.rejects()
        for field, value in [('if', "github.event_name == 'push'"), ('continue-on-error', 'true')]:
            with self.subTest(job_field=field):
                self.data = copy.deepcopy(original)
                self.data['jobs']['coverage'][field] = value; self.rejects()
    def test_core_artifact_cannot_omit_or_rename_cobertura_evidence(self):
        original = copy.deepcopy(self.data)
        step = next(step for step in original['jobs']['core']['steps'] if step.get('with', {}).get('name') == 'unit-and-coverage')
        self.assertIn('frontend/coverage/cobertura-coverage.xml', step['with']['path'].splitlines())
        for replacement in ['', 'frontend/coverage/not-coverage.xml']:
            with self.subTest(replacement=replacement):
                self.data = copy.deepcopy(original)
                step = next(step for step in self.data['jobs']['core']['steps'] if step.get('with', {}).get('name') == 'unit-and-coverage')
                step['with']['path'] = step['with']['path'].replace('frontend/coverage/cobertura-coverage.xml', replacement)
                self.rejects()
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
        source = self.frontend / 'src' / 'example.ts'; source.write_text('\n' * 100)
        self.source = str(source)
        metrics = {metric: {'total': 100, 'covered': 100, 'skipped': 0, 'pct': 100} for metric in METRICS}
        self.coverage = {'total': copy.deepcopy(metrics), self.source: copy.deepcopy(metrics)}
        self.cobertura = self.cobertura_report(100, 100)
    def cobertura_report(self, total, covered):
        rate = str((covered * 10000 // total) / 10000)
        root = ET.Element('coverage', {'lines-valid': str(total), 'lines-covered': str(covered), 'line-rate': rate, 'branches-valid': '100', 'branches-covered': '100', 'branch-rate': '1', 'version': '1.0', 'timestamp': '0'})
        sources = ET.SubElement(root, 'sources')
        ET.SubElement(sources, 'source').text = '.'
        packages = ET.SubElement(root, 'packages')
        package = ET.SubElement(packages, 'package', {'name': 'src', 'line-rate': rate, 'branch-rate': '1', 'complexity': '0'})
        classes = ET.SubElement(package, 'classes')
        cls = ET.SubElement(classes, 'class', {'name': 'example.ts', 'filename': 'frontend/src/example.ts', 'line-rate': rate, 'branch-rate': '1', 'complexity': '0'})
        ET.SubElement(cls, 'methods')
        lines = ET.SubElement(cls, 'lines')
        for number in range(1, total + 1):
            ET.SubElement(lines, 'line', {'number': str(number), 'hits': '1' if number <= covered else '0', 'branch': 'false'})
        return root
    def set_line_coverage(self, total, covered):
        # Istanbul percentages truncate to two decimals rather than rounding.
        metric = {'total': total, 'covered': covered, 'skipped': 0, 'pct': (covered * 10000 // total) / 100}
        self.coverage['total']['lines'] = copy.deepcopy(metric)
        self.coverage[self.source]['lines'] = copy.deepcopy(metric)
        Path(self.source).write_text('\n' * total)
        self.cobertura = self.cobertura_report(total, covered)
    def run_checker(self):
        import subprocess
        (self.frontend / 'test-results/unit.json').write_text(json.dumps(self.report))
        (self.frontend / 'coverage/coverage-summary.json').write_text(json.dumps(self.coverage))
        path = self.frontend / 'coverage/cobertura-coverage.xml'
        if self.cobertura is None:
            path.unlink(missing_ok=True)
        elif isinstance(self.cobertura, str):
            path.write_text(self.cobertura)
        else:
            path.write_text(ET.tostring(self.cobertura, encoding='unicode'))
        return subprocess.run(['node', str(ROOT / 'frontend/scripts/check-test-results.mjs')], cwd=self.frontend, capture_output=True, timeout=10)
    def assert_accepts(self):
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr.decode())
    def assert_rejects(self):
        result = self.run_checker()
        self.assertNotEqual(result.returncode, 0, result.stdout.decode())
    def test_valid_evidence(self): self.assert_accepts()
    def test_95_percent_line_coverage_passes(self):
        self.set_line_coverage(10000, 9500)
        self.assert_accepts()
    def test_94_99_percent_line_coverage_fails(self):
        self.set_line_coverage(10000, 9499)
        self.assert_rejects()
    def test_forged_percent_cannot_hide_94_99_percent_coverage(self):
        self.set_line_coverage(10000, 9499)
        self.coverage['total']['lines']['pct'] = 100
        self.coverage[self.source]['lines']['pct'] = 100
        self.assert_rejects()
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
    def test_consistent_coverage_regression_in_each_metric(self):
        original = copy.deepcopy(self.coverage)
        for metric in METRICS:
            with self.subTest(metric=metric):
                self.coverage = copy.deepcopy(original)
                for key in ['total', self.source]:
                    self.coverage[key][metric] = {'total': 100, 'covered': 94, 'skipped': 0, 'pct': 94}
                self.cobertura = self.cobertura_report(100, 94 if metric == 'lines' else 100)
                self.assert_rejects()
    def test_missing_percentages_and_counts_fail_closed(self):
        original = copy.deepcopy(self.coverage)
        for key in ['total', self.source]:
            for metric in METRICS:
                for field in ['total', 'covered', 'skipped', 'pct']:
                    with self.subTest(report=key, metric=metric, field=field):
                        self.coverage = copy.deepcopy(original)
                        del self.coverage[key][metric][field]
                        self.assert_rejects()
    def test_nonnumeric_or_nonfinite_percentages_fail_closed(self):
        original = copy.deepcopy(self.coverage)
        for key in ['total', self.source]:
            for value in ['100', 'unknown', None, True, float('nan'), float('inf')]:
                with self.subTest(report=key, value=value):
                    self.coverage = copy.deepcopy(original)
                    self.coverage[key]['lines']['pct'] = value
                    self.assert_rejects()
    def test_invalid_coverage_counts_fail_closed(self):
        original = copy.deepcopy(self.coverage)
        for key in ['total', self.source]:
            for field in ['total', 'covered', 'skipped']:
                for value in ['100', None, True, -1, 1.5, float('nan'), float('inf')]:
                    with self.subTest(report=key, field=field, value=value):
                        self.coverage = copy.deepcopy(original)
                        self.coverage[key]['lines'][field] = value
                        self.assert_rejects()
        for field in ['covered', 'skipped']:
            with self.subTest(out_of_range=field):
                self.coverage = copy.deepcopy(original)
                self.coverage[self.source]['lines'][field] = 101
                self.assert_rejects()
    def test_percentage_must_match_counts_at_two_decimal_precision(self):
        self.set_line_coverage(10000, 9555)
        self.assert_accepts()
        for value in [95.54, 95.56, 100]:
            with self.subTest(pct=value):
                self.coverage['total']['lines']['pct'] = value
                self.coverage[self.source]['lines']['pct'] = value
                self.assert_rejects()
    def test_reporter_percentages_truncate_instead_of_rounding(self):
        self.set_line_coverage(300, 299)
        self.assertEqual(self.coverage['total']['lines']['pct'], 99.66)
        self.assert_accepts()
    def test_aggregate_counts_must_match_reported_files(self):
        original = copy.deepcopy(self.coverage)
        for metric in METRICS:
            with self.subTest(metric=metric):
                self.coverage = copy.deepcopy(original)
                self.coverage['total'][metric] = {'total': 100, 'covered': 99, 'skipped': 0, 'pct': 99}
                self.assert_rejects()
    def test_missing_per_file_metric_fails_closed(self):
        original = copy.deepcopy(self.coverage)
        for metric in METRICS:
            with self.subTest(metric=metric):
                self.coverage = copy.deepcopy(original)
                del self.coverage[self.source][metric]
                self.assert_rejects()
    def test_missing_or_malformed_cobertura_fails_closed(self):
        for report in [None, '', '<coverage>', '<not-coverage/>']:
            with self.subTest(report=report):
                self.cobertura = report
                self.assert_rejects()
    def test_cobertura_count_attributes_must_be_valid_and_present(self):
        original = copy.deepcopy(self.cobertura)
        for field in ['lines-valid', 'lines-covered']:
            for value in [None, '', 'NaN', '-1', '1.5', '99', '101']:
                with self.subTest(field=field, value=value):
                    self.cobertura = copy.deepcopy(original)
                    if value is None:
                        del self.cobertura.attrib[field]
                    else:
                        self.cobertura.set(field, value)
                    self.assert_rejects()
    def test_cobertura_line_hits_must_match_json_counts(self):
        self.cobertura.find('.//line').set('hits', '0')
        self.assert_rejects()
    def test_cobertura_line_rates_must_match_json_percentages(self):
        original = copy.deepcopy(self.cobertura)
        for location in ['.', './/class']:
            for value in [None, '', 'NaN', 'Infinity', '-1', '0.99', '1.01']:
                with self.subTest(location=location, rate=value):
                    self.cobertura = copy.deepcopy(original)
                    node = self.cobertura.find(location)
                    if value is None:
                        del node.attrib['line-rate']
                    else:
                        node.set('line-rate', value)
                    self.assert_rejects()
    def test_cobertura_cannot_duplicate_or_omit_lines(self):
        original = copy.deepcopy(self.cobertura)
        self.cobertura.find('.//lines').remove(self.cobertura.find('.//line'))
        self.assert_rejects()
        self.cobertura = copy.deepcopy(original)
        self.cobertura.find('.//lines').append(copy.deepcopy(self.cobertura.find('.//line')))
        self.assert_rejects()
    def test_cobertura_line_numbers_and_hits_must_be_valid(self):
        original = copy.deepcopy(self.cobertura)
        for field in ['number', 'hits']:
            for value in [None, '', 'NaN', '-1', '1.5']:
                with self.subTest(field=field, value=value):
                    self.cobertura = copy.deepcopy(original)
                    line = self.cobertura.find('.//line')
                    if value is None:
                        del line.attrib[field]
                    else:
                        line.set(field, value)
                    self.assert_rejects()
        self.cobertura = copy.deepcopy(original)
        self.cobertura.find('.//line').set('number', '0')
        self.assert_rejects()
    def test_cobertura_filenames_must_be_repository_relative_application_paths(self):
        original = copy.deepcopy(self.cobertura)
        for filename in [None, '', self.source, 'src/example.ts', '../frontend/src/example.ts', 'frontend/src/../src/example.ts', 'frontend\\src\\example.ts', 'frontend/src/missing.ts']:
            with self.subTest(filename=filename):
                self.cobertura = copy.deepcopy(original)
                cls = self.cobertura.find('.//class')
                if filename is None:
                    del cls.attrib['filename']
                else:
                    cls.set('filename', filename)
                self.assert_rejects()
    def test_cobertura_cannot_omit_or_duplicate_application_files(self):
        original = copy.deepcopy(self.cobertura)
        classes = self.cobertura.find('.//classes')
        classes.remove(self.cobertura.find('.//class'))
        self.assert_rejects()
        self.cobertura = copy.deepcopy(original)
        self.cobertura.find('.//classes').append(copy.deepcopy(self.cobertura.find('.//class')))
        self.assert_rejects()
    def test_cobertura_cannot_add_unreported_application_file(self):
        extra = copy.deepcopy(self.cobertura.find('.//class'))
        extra.set('filename', 'frontend/server/extra.ts')
        self.cobertura.find('.//classes').append(extra)
        self.assert_rejects()

if __name__ == '__main__':
    unittest.main()
