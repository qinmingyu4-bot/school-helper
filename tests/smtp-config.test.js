const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('SES activation preserves private settings and rolls back failed startup without exposing credentials', () => {
  const script = String.raw`
import contextlib, io, json, os, pathlib, runpy, sys, tempfile, types
from unittest.mock import patch
ns = runpy.run_path('aws/configure-smtp-email.py')
ns = ns['main'].__globals__
payload = {'username':'A'*20,'password':'B'*44}
values = ns['settings'](payload)
assert values['SMTP_SECURE'] == 'true'
assert values['MAIL_FROM'] == 'StudyBridge <noreply@studybridge.ink>'
assert values['ALLOW_EMAIL_CODE_FALLBACK'] == 'false'
original = b'SESSION_SECRET=keep\nGOOGLE_CLIENT_SECRET=keep-google\nSMTP_HOST=old\nSMTP_HOST=duplicate\nREQUIRE_EMAIL_VERIFICATION=false\n'
rendered = ns['render_env'](original.decode(),values)
assert rendered.startswith('SESSION_SECRET=keep\nGOOGLE_CLIENT_SECRET=keep-google\n')
assert rendered.count('SMTP_HOST=') == 1
for bad in ({}, {'username':'bad','password':'B'*44}, {'username':'A'*20,'password':'B'*44+'\nOTHER=value'}):
    try: ns['settings'](bad); raise AssertionError('Unsafe credentials accepted')
    except ValueError: pass
with tempfile.TemporaryDirectory(prefix='studybridge-smtp-config-test-') as directory:
    root = pathlib.Path(directory)
    env_file = root / '.env'
    env_file.write_bytes(original)
    before = pathlib.Path.cwd()
    os.chdir(root)
    restarted = []
    runtime = types.SimpleNamespace(stdout=b'[{"name":"studybridge","pm2_env":{"SMTP_HOST":"runtime-old"}}]')
    def restart(config): restarted.append(config.copy())
    def fail(config): raise RuntimeError('simulated startup failure')
    try:
        for fails in (True,False):
            restarted.clear()
            with patch.dict(ns, {'restart':restart,'preflight':lambda config:None,'verify':fail if fails else lambda config:None}), patch.object(sys,'argv',['configure-smtp-email.py','a'*40]), patch.object(sys,'stdin',io.StringIO(json.dumps(payload))), patch.object(ns['Path'],'home',return_value=root), patch.object(ns['subprocess'],'check_output',return_value='a'*40), patch.object(ns['subprocess'],'run',return_value=runtime), patch.object(ns['time'],'sleep'), contextlib.redirect_stdout(io.StringIO()) as output:
                if fails:
                    try: ns['main'](); raise AssertionError('Startup failure ignored')
                    except RuntimeError as error: assert 'restored' in str(error)
                else: ns['main']()
            assert payload['password'] not in output.getvalue()
            if fails:
                assert env_file.read_bytes() == original
                assert len(restarted) == 2
                assert restarted[-1]['SMTP_HOST'] == 'runtime-old'
            else:
                assert env_file.read_text() == rendered
                assert restarted[0]['REQUIRE_EMAIL_VERIFICATION'] == 'true'
                assert env_file.stat().st_mode & 0o777 == 0o600
        assert all((p.stat().st_mode & 0o077) == 0 for p in (root/'.studybridge-private-backups').rglob('*') if p.is_file())
        env_file.write_bytes(original)
        restarted.clear()
        with patch.dict(ns, {'restart':restart,'preflight':fail}), patch.object(sys,'argv',['configure-smtp-email.py','a'*40]), patch.object(sys,'stdin',io.StringIO(json.dumps(payload))), patch.object(ns['subprocess'],'check_output',return_value='a'*40):
            try: ns['main'](); raise AssertionError('Failed preflight ignored')
            except RuntimeError: pass
        assert not restarted
        assert env_file.read_bytes() == original
        with patch.dict(ns, {'preflight':fail}), patch.object(sys,'argv',['configure-smtp-email.py','a'*40]), patch.object(ns['subprocess'],'check_output',return_value='b'*40), contextlib.redirect_stdout(io.StringIO()):
            ns['main']()
        assert env_file.read_bytes() == original
    finally: os.chdir(before)
print('SMTP private activation, preservation, preflight and rollback passed.')
`;
  const result = spawnSync('python3', ['-c', script], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
