"""Small structural gate; actionlint independently validates GitHub syntax."""
import json
import re
from pathlib import Path
import yaml


def check(root):
    contract = json.loads((root / 'ci/release-gates.json').read_text())
    package = json.loads((root / 'frontend/package.json').read_text())
    if package.get('scripts', {}).get('test:ci') != contract['unit_script']:
        raise ValueError('The unit gate npm script was changed or suppressed.')
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
        allowed_permissions = {'contents': 'read', 'security-events': 'write', 'actions': 'read'}
        if 'permissions' in job and (name != 'security' or job['permissions'] != allowed_permissions):
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
