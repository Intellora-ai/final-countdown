"""CodeQL upload success is not evidence of zero findings. Inspect its SARIF."""
import json
import sys
from pathlib import Path


def inspect(report):
    if not isinstance(report, dict) or not isinstance(report.get('runs'), list) or not report['runs']:
        raise ValueError('Missing scanner runs.')
    for run in report['runs']:
        if any(not invocation.get('executionSuccessful', False) for invocation in run.get('invocations', [])):
            raise ValueError('Scanner execution failed.')
        for result in run.get('results', []):
            if result.get('level', 'warning') in ('warning', 'error'):
                # Suppressed results still block; no silent allowlist of findings.
                raise ValueError('CodeQL finding: ' + result.get('ruleId', 'unknown rule'))


if __name__ == '__main__':
    files = list(Path(sys.argv[1]).rglob('*.sarif'))
    if not files:
        raise ValueError('No SARIF evidence produced.')
    for path in files:
        inspect(json.loads(path.read_text()))
    print(f'Checked {len(files)} SARIF reports: no warning/error findings.')
