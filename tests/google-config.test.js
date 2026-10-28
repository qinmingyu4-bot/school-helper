const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

test("Google configuration preserves unrelated settings, keeps files private, and restores a failed startup", () => {
  const script = String.raw`
import contextlib, io, json, os, pathlib, runpy, sys, tempfile, types
from unittest.mock import patch
ns = runpy.run_path('aws/configure-google-login.py')
values = ns['settings']({'GOOGLE_CLIENT_ID':'123456-fixture.apps.googleusercontent.com','GOOGLE_CLIENT_SECRET':'GOCSPX-fixture-only-not-real'})
original = b'# existing configuration\nSESSION_SECRET=private-fixture\nSTUDYBRIDGE_DB=local\nNODE_ENV=development\nAPP_BASE_URL=https://old.example.test\nGOOGLE_CLIENT_ID=old\nGOOGLE_CLIENT_ID=duplicate\n'
rendered = ns['render_env'](original.decode(), values)
assert 'SESSION_SECRET=private-fixture\nSTUDYBRIDGE_DB=local\n' in rendered
assert rendered.count('GOOGLE_CLIENT_ID=') == 1
assert 'APP_BASE_URL=https://studybridge.ink\n' in rendered
assert 'NODE_ENV=production\n' in rendered
assert 'NODE_ENV=development' not in rendered
for payload in ({}, {'GOOGLE_CLIENT_ID':'wrong','GOOGLE_CLIENT_SECRET':'GOCSPX-fixture-only-not-real'}, {'GOOGLE_CLIENT_ID':values['GOOGLE_CLIENT_ID'],'GOOGLE_CLIENT_SECRET':'bad\nOTHER=value'}):
    try: ns['settings'](payload); raise AssertionError('Unsafe credentials accepted')
    except ValueError: pass
with tempfile.TemporaryDirectory(prefix='studybridge-google-config-test-') as directory:
    root = pathlib.Path(directory)
    env_file = root / '.env'
    env_file.write_bytes(original)
    ns['replace_private'](env_file, b'private replacement')
    assert env_file.read_bytes() == b'private replacement'
    assert env_file.stat().st_mode & 0o777 == 0o600
    env_file.write_bytes(original)
    restarted = []
    def restart(config): restarted.append(config.copy())
    def fail(client): raise RuntimeError('simulated failed startup')
    namespace = ns['main'].__globals__
    before = pathlib.Path.cwd()
    os.chdir(root)
    try:
        with patch.dict(namespace, {'restart':restart,'verify':fail}), patch.object(sys,'argv',['configure-google-login.py','a'*40]), patch.object(sys,'stdin',io.StringIO(json.dumps(values))), patch.object(ns['Path'],'home',return_value=root), patch.object(ns['subprocess'],'check_output',return_value='a'*40), patch.object(ns['subprocess'],'run',return_value=types.SimpleNamespace(stdout=b'[{"name":"studybridge","pm2_env":{}}]')), patch.object(ns['time'],'sleep'):
            try: ns['main'](); raise AssertionError('Startup failure ignored')
            except RuntimeError as error: assert 'restored' in str(error)
        assert env_file.read_bytes() == original
        assert len(restarted) == 2
        assert restarted[-1]['APP_BASE_URL'] == 'https://old.example.test'
        assert restarted[-1]['NODE_ENV'] == 'development'
        assert all((p.stat().st_mode & 0o077) == 0 for p in (root/'.studybridge-private-backups').rglob('*') if p.is_file())
        # A successful run changes only the named settings and validates the active login.
        restarted.clear()
        with patch.dict(namespace, {'restart':restart,'verify':lambda client: None}), patch.object(sys,'argv',['configure-google-login.py','a'*40]), patch.object(sys,'stdin',io.StringIO(json.dumps(values))), patch.object(ns['Path'],'home',return_value=root), patch.object(ns['subprocess'],'check_output',return_value='a'*40), patch.object(ns['subprocess'],'run',return_value=types.SimpleNamespace(stdout=b'[{"name":"studybridge","pm2_env":{}}]')), contextlib.redirect_stdout(io.StringIO()) as output:
            ns['main']()
        assert env_file.read_text() == rendered
        assert 'GOCSPX' not in output.getvalue()
        assert restarted[0]['GOOGLE_CLIENT_ID'] == values['GOOGLE_CLIENT_ID']
        assert restarted[0]['NODE_ENV'] == 'production'
    finally: os.chdir(before)
print('Private configuration success, rollback and credential validation passed.')
`;
  const result = spawnSync("python3", ["-c", script], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
