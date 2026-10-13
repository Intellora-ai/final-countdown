"""Small structural gate; actionlint independently validates GitHub syntax."""
import json
import math
import re
from pathlib import Path
import yaml

CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
HEAD_REF = '${{ github.event.pull_request.head.sha || github.sha }}'
DOWNLOAD = 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093'
UPLOAD = 'actions/upload-code-coverage@2b21a77928be8d5168c2b9581a67f2adbebacc52'
REQUIRED_JOBS = {'integrity', 'core', 'browser', 'container', 'security', 'coverage'}
ACTIONLINT = '.ci-tools/actionlint -color -ignore \'^unknown permission scope "code-quality"\\.\''


def check(root):
    contract = json.loads((root / 'ci/release-gates.json').read_text())
    floors = contract.get('coverage_floors')
    if not isinstance(floors, dict) or set(floors) != {'lines', 'statements', 'functions', 'branches'} or any(type(value) not in (int, float) or not math.isfinite(value) or not 95 <= value <= 100 for value in floors.values()):
        raise ValueError('Every coverage metric must retain a finite floor of at least 95%.')
    if set(contract['required_jobs']) != REQUIRED_JOBS:
        raise ValueError('Required release gates, including coverage publishing, cannot be removed.')
    if [command for command in contract['commands']['integrity'] if '.ci-tools/actionlint' in command] != [ACTIONLINT]:
        raise ValueError('Actionlint may exempt only its unsupported official code-quality scope.')
    package = json.loads((root / 'frontend/package.json').read_text())
    if package.get('scripts') != contract['npm_scripts']:
        raise ValueError('An npm script was changed, suppressed or given an undeclared hook.')
    path = root / contract['workflow']
    workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
    jobs = workflow.get('jobs', {})
    expected = set(contract['required_jobs']) | {'release-gate'}
    if set(jobs) != expected:
        raise ValueError('Gate jobs removed, renamed or unexpected.')
    if set(workflow.get('on', {})) != {'push', 'pull_request', 'workflow_dispatch'}:
        raise ValueError('Gate triggers changed or restricted.')
    for event in ('push', 'pull_request'):
        if workflow['on'][event] not in (None, ''):
            raise ValueError('Required gates must not use branch/path filters.')
    if workflow.get('permissions') != {'contents': 'read'}:
        raise ValueError('Default token must remain read-only.')
    for name, job in jobs.items():
        if 'continue-on-error' in job or 'if' in job and name != 'release-gate':
            raise ValueError('Gate bypass through conditional or failure suppression.')
        if not 1 <= int(job.get('timeout-minutes', 0)) <= 15:
            raise ValueError('Every gate requires a bounded timeout.')
        allowed_permissions = {
            'security': {'contents': 'read', 'security-events': 'write', 'actions': 'read'},
            'coverage': {'contents': 'read', 'code-quality': 'write', 'pull-requests': 'read'},
        }
        if name in allowed_permissions and job.get('permissions') != allowed_permissions[name] or name not in allowed_permissions and 'permissions' in job:
            raise ValueError('Unexpected job token permissions.')
        commands = []
        for step in job.get('steps', []):
            if 'continue-on-error' in step:
                raise ValueError('Step failure suppression.')
            if 'uses' in step and not re.fullmatch(r'[\w./-]+@[0-9a-f]{40}', step['uses']):
                raise ValueError('Action must use an immutable commit SHA.')
            if 'run' in step:
                if 'if' in step:
                    raise ValueError('Conditional command bypass.')
                if '${{' in step['run']:
                    raise ValueError('Expressions must not be interpolated into shell code.')
                commands.append(step['run'].strip())
        for command in contract['commands'][name]:
            if commands.count(command) != 1:
                raise ValueError(f'Missing, altered or duplicated gate command in {name}: {command}')
        # No arbitrary shell after a failing command can paint its step green.
        allowed = contract['commands'][name] + (['python3 -m pip install --require-hashes -r requirements-preflight.lock'] if name == 'integrity' else [])
        if any(command not in allowed for command in commands):
            raise ValueError('Undeclared shell command in gate.')
    verdict = jobs['release-gate']
    if verdict.get('if') != 'always()' or set(verdict.get('needs', [])) != set(contract['required_jobs']):
        raise ValueError('Final verdict must run and inspect every gate, including failed/skipped ones.')
    if verdict.get('env', {}).get('NEEDS_JSON') != '${{ toJSON(needs) }}':
        raise ValueError('Final verdict must use actual dependency outcomes.')
    core = jobs['core']
    checkouts = [step for step in core['steps'] if step.get('uses', '').split('@')[0] == 'actions/checkout']
    if len(checkouts) != 1 or checkouts[0].get('uses') != CHECKOUT or checkouts[0].get('with') != {'ref': HEAD_REF}:
        raise ValueError('Coverage evidence must be generated from the exact PR head.')
    artifacts = [step for step in core['steps'] if step.get('with', {}).get('name') == 'unit-and-coverage']
    paths = {'frontend/test-results/unit.json', 'frontend/coverage/coverage-summary.json', 'frontend/coverage/cobertura-coverage.xml', 'frontend/test-results/mutations.json'}
    if len(artifacts) != 1 or artifacts[0].get('uses') != 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02' or set(artifacts[0].get('with', {}).get('path', '').split()) != paths:
        raise ValueError('Required test and coverage evidence must be retained in the artifact.')
    coverage = jobs['coverage']
    if coverage.get('needs') != ['core'] or coverage.get('steps') != [
        {'uses': CHECKOUT, 'with': {'ref': HEAD_REF}},
        {'uses': DOWNLOAD, 'with': {'name': 'unit-and-coverage', 'path': 'coverage-evidence'}},
        {'uses': UPLOAD, 'with': {
            'file': 'coverage-evidence/coverage/cobertura-coverage.xml',
            'language': 'TypeScript', 'label': 'code-coverage/vitest',
            'fail-on-error': 'true', 'wait-for-processing-timeout': '160',
        }},
    ]:
        raise ValueError('Coverage publisher must upload the verified report without skipped or suppressed evidence.')
    security = jobs['security']
    if security.get('strategy', {}).get('matrix', {}).get('language') != ['actions', 'javascript-typescript', 'python']:
        raise ValueError('Security scanner scope changed.')
    uses = [s.get('uses', '').split('@')[0] for s in security['steps']]
    if uses.count('github/codeql-action/init') != 1 or uses.count('github/codeql-action/analyze') != 1:
        raise ValueError('CodeQL execution removed.')
    for other in (root / '.github/workflows').iterdir():
        if other.suffix not in ('.yml', '.yaml'):
            continue
        if other != path:
            raise ValueError('Unexpected competing workflow: ' + other.name)
        if '${{ secrets.' in other.read_text() or 'pull_request_target' in other.read_text():
            raise ValueError('Release checks must not receive model secrets or untrusted write triggers.')
    return True


if __name__ == '__main__':
    check(Path.cwd())
    print('Workflow contract verified: gates, commands, permissions, pins and fail-closed verdict.')
