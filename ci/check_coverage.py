"""Check actual coverage counts and the exact Cobertura evidence sent to GitHub."""
import json
import math
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET

METRICS = ('lines', 'statements', 'functions', 'branches')


def coverage_floors(contract):
    floors = contract.get('coverage_floors')
    if not isinstance(floors, dict) or set(floors) != set(METRICS):
        raise ValueError('Every coverage metric must retain its release floor.')
    for metric, value in floors.items():
        if type(value) not in (int, float) or not math.isfinite(value) or not 95 <= value <= 100:
            raise ValueError(f'{metric} coverage floor must be at least 95%.')
    return floors


def counts(data, metric):
    if not isinstance(data, dict):
        raise ValueError(f'Missing {metric} coverage evidence.')
    total, covered, skipped, pct = (data.get(key) for key in ('total', 'covered', 'skipped', 'pct'))
    if any(type(value) is not int for value in (total, covered, skipped)) or not 0 <= covered <= total or skipped != 0:
        raise ValueError(f'Invalid {metric} coverage counts.')
    expected_pct = (covered * 10000 // total) / 100 if total else 100
    if type(pct) not in (int, float) or not math.isfinite(pct) or pct != expected_pct:
        raise ValueError(f'{metric} coverage percentage disagrees with actual counts.')
    return total, covered


def xml_count(element, key):
    value = element.get(key, '')
    if not value.isdecimal():
        raise ValueError(f'Invalid Cobertura {key}.')
    return int(value)


def check_line_rate(element, total, covered):
    rate = float(element.get('line-rate', 'nan'))
    expected = ((covered * 10000 // total) / 10000) if total else 1
    if not math.isfinite(rate) or abs(rate - expected) > 1e-12:
        raise ValueError('Cobertura line rate disagrees with actual counts.')


def check(frontend):
    frontend = frontend.resolve()
    repository = frontend.parent
    contract = json.loads((repository / 'ci/release-gates.json').read_text())
    floors = coverage_floors(contract)
    summary = json.loads((frontend / 'coverage/coverage-summary.json').read_text())
    aggregate = summary.get('total')
    if not isinstance(aggregate, dict):
        raise ValueError('Missing aggregate coverage evidence.')
    files = {name: data for name, data in summary.items() if name != 'total'}
    if not files:
        raise ValueError('Empty coverage evidence.')
    for metric, minimum in floors.items():
        total, covered = counts(aggregate.get(metric), metric)
        file_counts = [counts(data.get(metric), metric) for data in files.values()]
        if (total, covered) != tuple(map(sum, zip(*file_counts))):
            raise ValueError(f'Aggregate {metric} coverage disagrees with file counts.')
        if total == 0 or covered * 100 < total * minimum:
            raise ValueError(f'{metric} coverage regressed below {minimum}%.')
    expected = {str(Path(name).resolve().relative_to(repository)): counts(data.get('lines'), 'lines') for name, data in files.items()}
    tree = ET.parse(frontend / 'coverage/cobertura-coverage.xml')
    root = tree.getroot()
    if root.tag != 'coverage':
        raise ValueError('Missing Cobertura coverage root.')
    if (xml_count(root, 'lines-valid'), xml_count(root, 'lines-covered')) != counts(aggregate['lines'], 'lines'):
        raise ValueError('Cobertura aggregate lines disagree with JSON evidence.')
    check_line_rate(root, *counts(aggregate['lines'], 'lines'))
    actual = {}
    for item in root.findall('./packages/package/classes/class'):
        name = item.get('filename', '')
        path = PurePosixPath(name)
        if not name or path.is_absolute() or '..' in path.parts or str(path) != name or name in actual or name not in expected:
            raise ValueError('Cobertura must identify each source once with its repository-relative filename.')
        lines = item.findall('./lines/line')
        numbers = [xml_count(line, 'number') for line in lines]
        if any(number <= 0 for number in numbers) or len(set(numbers)) != len(numbers):
            raise ValueError('Duplicate or invalid Cobertura source lines.')
        actual[name] = len(lines), sum(xml_count(line, 'hits') > 0 for line in lines)
        if actual[name] != expected[name]:
            raise ValueError(f'Cobertura actual line counts disagree for {name}.')
        check_line_rate(item, *actual[name])
    # Declaration files contain no executable lines and may be absent from XML.
    required = {name for name in expected if not name.endswith('.d.ts')}
    if set(actual) - set(expected) or not required <= set(actual):
        raise ValueError('Application source was excluded from Cobertura evidence.')
    print('Verified all four coverage floors at 95% or higher and matching Cobertura line evidence.')


if __name__ == '__main__':
    check(Path.cwd())
