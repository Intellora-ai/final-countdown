"""CodeQL upload success is not evidence of zero findings. Inspect its SARIF."""
import json
import sys
from pathlib import Path


def escape(value, property=False):
    text = str(value).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    return text.replace(':', '%3A').replace(',', '%2C') if property else text


def annotation(result, rules):
    rule_id = result.get('ruleId', 'unknown rule')
    message = result.get('message', {}).get('text', 'Scanner reported a finding.')
    help_url = rules.get(rule_id, {}).get('helpUri', '')
    if help_url:
        message += '\nRemediation guidance: ' + help_url
    properties = ['title=' + escape(rule_id, True)]
    locations = result.get('locations', [])
    if locations:
        physical = locations[0].get('physicalLocation', {})
        uri = physical.get('artifactLocation', {}).get('uri', '')
        region = physical.get('region', {})
        if uri:
            properties.append('file=' + escape(uri, True))
        for key, field in [('line', 'startLine'), ('col', 'startColumn')]:
            value = region.get(field)
            if isinstance(value, int) and value > 0:
                properties.append(f'{key}={value}')
    return '::error ' + ','.join(properties) + '::' + escape(message)


def inspect(report):
    if not isinstance(report, dict) or not isinstance(report.get('runs'), list) or not report['runs']:
        raise ValueError('Missing scanner runs.')
    findings = []
    for run in report['runs']:
        if any(not invocation.get('executionSuccessful', False) for invocation in run.get('invocations', [])):
            raise ValueError('Scanner execution failed.')
        rules = {rule['id']: rule for rule in run.get('tool', {}).get('driver', {}).get('rules', [])}
        for result in run.get('results', []):
            if result.get('level', 'warning') not in ('none', 'note'):
                # Suppressed results still block; no silent allowlist of findings.
                print(annotation(result, rules))
                findings.append(result.get('ruleId', 'unknown rule')
                                + ' ' + json.dumps(result.get('locations', []))
                                + ' ' + json.dumps(result.get('message', {})))
    if findings:
        raise ValueError('CodeQL findings: ' + '\n'.join(findings))


if __name__ == '__main__':
    files = list(Path(sys.argv[1]).rglob('*.sarif'))
    if not files:
        raise ValueError('No SARIF evidence produced.')
    for path in files:
        inspect(json.loads(path.read_text()))
    print(f'Checked {len(files)} SARIF reports: no warning/error findings.')
