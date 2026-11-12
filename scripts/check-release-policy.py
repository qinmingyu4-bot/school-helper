"""Fail closed before deployment; documentation/governance pushes do not deploy."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

GOVERNANCE = {'AGENTS.md', 'CHANGELOG.md', 'README.md',
              '.github/workflows/check.yml', '.github/workflows/deploy.yml',
              'scripts/check-release-policy.py', 'tests/test_release_policy.py'}


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value):
        raise ValueError('Expected a stable MAJOR.MINOR.PATCH version')
    return tuple(map(int, value.split('.')))


def validate(plan, previous, current, frontend, lock_versions):
    before = version(previous)
    version(current)
    level = plan.get('level')
    expected = {'patch': (before[0], before[1], before[2] + 1),
                'minor': (before[0], before[1] + 1, 0),
                'major': (before[0] + 1, 0, 0)}
    if level not in expected or version(current) != expected[level]:
        raise ValueError('Version must match the declared patch/minor/major increment')
    if plan.get('previousVersion') != previous or plan.get('version') != current:
        raise ValueError('Release record does not match the baseline/current package')
    if not isinstance(plan.get('reason'), str) or len(plan['reason'].strip()) < 12:
        raise ValueError('Record a concrete release classification reason')
    features = plan.get('features')
    if not isinstance(features, list) or any(not isinstance(x, str) or not x.strip() for x in features):
        raise ValueError('features must be an explicit list (empty for fixes only)')
    if features and level == 'patch':
        raise ValueError('A release containing new features requires minor or major')
    if frontend != current or any(v != current for v in lock_versions):
        raise ValueError('Package, lockfile and frontend versions must agree')


def documentation_only(paths):
    return bool(paths) and all(p in GOVERNANCE or (p.startswith('docs/') and p.endswith('.md')) for p in paths)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='')
    parser.add_argument('--manual', action='store_true')
    args = parser.parse_args()
    base = args.base
    if not args.manual:
        if not re.fullmatch(r'[a-f0-9]{40}', base) or base == '0' * 40:
            raise ValueError('A valid previous main commit is required')
        git('merge-base', '--is-ancestor', base, 'HEAD')
        paths = git('diff', '--name-only', base, 'HEAD').splitlines()
        if documentation_only(paths):
            print('Documentation/governance change: AWS deployment skipped.')
            output(False)
            return
    plan = json.loads(Path('release-plan.json').read_text())
    baseline = plan.get('previousCommit', '')
    if not re.fullmatch(r'[a-f0-9]{40}', baseline):
        raise ValueError('previousCommit must be the full production commit SHA')
    git('merge-base', '--is-ancestor', baseline, 'HEAD')
    previous = json.loads(git('show', f'{baseline}:package.json'))['version']
    if not args.manual:
        # A task branch cannot claim an older baseline to obtain a smaller bump.
        if json.loads(git('show', f'{base}:package.json'))['version'] != previous:
            raise ValueError('Release baseline is stale compared with previous main')
    if args.manual:
        release_commit = git('log', '-1', '--format=%H', '--', 'package.json')
        parent_version = json.loads(git('show', f'{release_commit}^:package.json'))['version']
        if parent_version != previous:
            raise ValueError('Manual release must have a fresh version increment')
        later_paths = git('diff', '--name-only', release_commit, 'HEAD').splitlines()
        if later_paths and not documentation_only(later_paths):
            raise ValueError('Application changed after the versioned release; prepare a new release')
    pkg = json.loads(Path('package.json').read_text())
    lock = json.loads(Path('package-lock.json').read_text())
    match = re.search(r'const VERSION = [\"\']([^\"\']+)', Path('public/app.js').read_text())
    validate(plan, previous, pkg['version'], match.group(1) if match else None,
             [lock.get('version'), lock.get('packages', {}).get('', {}).get('version')])
    for file in ['CHANGELOG.md', 'docs/version-archive.md']:
        if pkg['version'] not in Path(file).read_text():
            raise ValueError(f'{file} must record the target release')
    print(f'Release policy passed: {previous} -> {pkg["version"]} ({plan["level"]})')
    output(True)


def output(deploy):
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write(f'deploy={str(deploy).lower()}\n')


if __name__ == '__main__':
    main()
