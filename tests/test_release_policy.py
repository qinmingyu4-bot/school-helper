import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('policy', Path(__file__).resolve().parents[1] / 'scripts/check-release-policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class ReleasePolicyTests(unittest.TestCase):
    def plan(self, level='minor', target='1.3.0', features=None):
        return dict(previousVersion='1.2.31', version=target, level=level,
                    reason='Add a new course workflow', features=['Course workflow'] if features is None else features)

    def check(self, plan, frontend=None):
        target = plan['version']
        policy.validate(plan, '1.2.31', target, frontend or target, [target, target])

    def test_feature_minor(self):
        self.check(self.plan())

    def test_patch_fix(self):
        self.check(self.plan('patch', '1.2.32', []))

    def test_major(self):
        self.check(self.plan('major', '2.0.0'))

    def test_feature_as_patch_rejected(self):
        with self.assertRaises(ValueError): self.check(self.plan('patch', '1.2.32'))

    def test_wrong_or_unchanged_increment(self):
        for target in ['1.2.31', '1.3.1', '1.2.32', '1.4.0']:
            with self.subTest(target=target), self.assertRaises(ValueError): self.check(self.plan(target=target))

    def test_missing_decision(self):
        for key in ['reason', 'features', 'level', 'previousVersion', 'version']:
            plan = self.plan()
            del plan[key]
            with self.subTest(key=key), self.assertRaises((ValueError, KeyError)): self.check(plan)

    def test_frontend_and_lock_mismatch(self):
        with self.assertRaises(ValueError): self.check(self.plan(), '1.2.31')
        with self.assertRaises(ValueError): policy.validate(self.plan(), '1.2.31', '1.3.0', '1.3.0', ['1.2.31', '1.3.0'])

    def test_docs_skip_is_narrow(self):
        self.assertTrue(policy.documentation_only(['docs/version-archive.md', 'AGENTS.md', '.github/workflows/deploy.yml']))
        for paths in [[], ['public/app.js'], ['README.md', 'server.js'], ['release-plan.json'], ['docs/code.js'], ['scripts/deploy-release.sh']]:
            self.assertFalse(policy.documentation_only(paths))

class DeploymentGateIntegrationTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run_git('init', '-q')
        self.run_git('config', 'user.name', 'Policy test')
        self.run_git('config', 'user.email', 'test@example.invalid')
        self.write_version('1.2.31')
        self.commit()
        self.base = self.run_git('rev-parse', 'HEAD')

    def run_git(self, *args):
        import subprocess
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def commit(self):
        self.run_git('add', '.')
        self.run_git('commit', '-qm', 'fixture')

    def write_version(self, value):
        import json
        (self.root / 'public').mkdir(exist_ok=True)
        (self.root / 'package.json').write_text(json.dumps({'version': value}))
        (self.root / 'package-lock.json').write_text(json.dumps({'version': value, 'packages': {'': {'version': value}}}))
        (self.root / 'public/app.js').write_text(f'const VERSION = "{value}";')

    def gate(self, *args):
        import subprocess, sys
        return subprocess.run([sys.executable, str(Path(policy.__file__)), *args], cwd=self.root, capture_output=True, text=True)

    def test_governance_only_skips(self):
        (self.root / 'AGENTS.md').write_text('Rules')
        self.commit()
        result = self.gate('--base', self.base)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('skipped', result.stdout)

    def test_code_plus_docs_requires_record(self):
        (self.root / 'AGENTS.md').write_text('Rules')
        self.write_version('1.3.0')
        self.commit()
        self.assertNotEqual(self.gate('--base', self.base).returncode, 0)

    def test_manual_requires_record(self):
        self.assertNotEqual(self.gate('--manual').returncode, 0)

    def test_valid_release_and_manual(self):
        import json
        self.write_version('1.3.0')
        plan = ReleasePolicyTests().plan()
        plan['previousCommit'] = self.base
        (self.root / 'release-plan.json').write_text(json.dumps(plan))
        (self.root / 'CHANGELOG.md').write_text('1.3.0: new workflow')
        (self.root / 'docs').mkdir()
        (self.root / 'docs/version-archive.md').write_text('1.3.0: new workflow')
        self.commit()
        for args in [('--base', self.base), ('--manual',)]:
            result = self.gate(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('passed', result.stdout)
        # The same release record cannot authorize the next code push.
        newer_base = self.run_git('rev-parse', 'HEAD')
        (self.root / 'server.js').write_text('// new code')
        self.commit()
        result = self.gate('--base', newer_base)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('stale', result.stderr)
        self.assertNotEqual(self.gate('--manual').returncode, 0)


if __name__ == '__main__':
    unittest.main()
