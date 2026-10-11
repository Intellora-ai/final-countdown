"""Only complete successful dependencies can authorize a release verdict."""
import json
import os
from pathlib import Path


def verify(needs, expected):
    if not isinstance(needs, dict) or set(needs) != set(expected):
        raise ValueError('Release dependencies are missing or unexpected.')
    failed = [name for name, job in needs.items() if not isinstance(job, dict) or job.get('result') != 'success']
    if failed:
        raise ValueError('Release blocked: ' + ', '.join(failed))


if __name__ == '__main__':
    expected = json.loads(Path('ci/release-gates.json').read_text())['required_jobs']
    verify(json.loads(os.environ['NEEDS_JSON']), expected)
    print('All release gates succeeded. This does not certify model accuracy.')
