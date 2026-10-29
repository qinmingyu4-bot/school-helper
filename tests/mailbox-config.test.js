const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

test("real mailbox activation preserves private credentials, keys and unrelated settings, with safe rollback", () => {
  const script = String.raw`
import base64, contextlib, io, json, os, pathlib, runpy, sys, tempfile
from unittest.mock import patch
ns = runpy.run_path('aws/configure-mailboxes.py')['main'].__globals__
key = base64.b64encode(b'k'*32).decode()
existing = {'NODE_ENV':'production','APP_BASE_URL':'https://studybridge.ink','GOOGLE_CLIENT_ID':'123456-fixture.apps.googleusercontent.com','GOOGLE_CLIENT_SECRET':'GOCSPX-fixture-only-not-real','OPENAI_API_KEY':'private-fixture','STUDYBRIDGE_DB':'local'}
providers, values = ns['settings']({'providers':['gmail']}, existing, {})
assert providers == ['gmail'] and ns['valid_key'](values['MAILBOX_ENCRYPTION_KEY'])
assert values['MAILBOX_SYNC_DISABLED'] == 'false'
assert 'GMAIL_CLIENT_SECRET' not in values and 'GOOGLE_CLIENT_SECRET' not in values
assert values['GMAIL_REDIRECT_URI'] == 'https://studybridge.ink/api/mailbox/gmail/callback'
stable = dict(existing, MAILBOX_ENCRYPTION_KEY=key)
assert ns['settings']({'providers':['gmail']}, stable, stable)[1]['MAILBOX_ENCRYPTION_KEY'] == key
payload = {'providers':['outlook'],'OUTLOOK_CLIENT_ID':'11111111-2222-3333-4444-555555555555','OUTLOOK_CLIENT_SECRET':'fixture~outlook-secret-only'}
outlook_values = ns['settings'](payload, stable, stable)[1]
assert outlook_values['OUTLOOK_REDIRECT_URI'].endswith('/outlook/callback')
assert outlook_values['MAILBOX_ENCRYPTION_KEY'] == key
for bad in ({}, {'providers':[]}, {'providers':['unknown']}, {'providers':['gmail','gmail']}, {'providers':['gmail'],'MAILBOX_ENCRYPTION_KEY':key}, {'providers':['gmail'],'GMAIL_CLIENT_ID':existing['GOOGLE_CLIENT_ID']}, dict(payload,OUTLOOK_CLIENT_SECRET='bad\nOTHER=value'), dict(payload,OUTLOOK_CLIENT_ID='not-a-guid')):
    try: ns['settings'](bad, stable, stable); raise AssertionError('Invalid payload accepted')
    except ValueError: pass
for active, persisted in ((dict(existing,MAILBOX_ENCRYPTION_KEY='broken'),{}), (dict(existing,MAILBOX_ENCRYPTION_KEY=key),{'MAILBOX_ENCRYPTION_KEY':base64.b64encode(b'x'*32).decode()}), (dict(existing,APP_BASE_URL='https://other.example'),{})):
    try: ns['settings']({'providers':['gmail']},active,persisted); raise AssertionError('Unsafe environment accepted')
    except RuntimeError: pass
assert ns['file_settings'](b'KEY=first\nKEY=second\nQUOTED="value"\n')['KEY'] == 'first'
assert ns['file_settings'](b"QUOTED='value'\n")['QUOTED'] == 'value'
with tempfile.TemporaryDirectory(prefix='studybridge-mailbox-config-test-') as directory:
    root = pathlib.Path(directory)
    env_file = root / '.env'
    original = ('# original private environment\n' + '\n'.join(k+'='+v for k,v in existing.items())+'\nSESSION_SECRET=keep-session\nOUTLOOK_CLIENT_SECRET=keep-outlook\n').encode()
    before = pathlib.Path.cwd()
    os.chdir(root)
    restarted = []
    def restart(config): restarted.append(config.copy())
    def fail(*args): raise RuntimeError('simulated private startup failure')
    try:
        for fails in (True,False):
            env_file.write_bytes(original)
            restarted.clear()
            with patch.dict(ns, {'process_settings':lambda: {},'restart':restart,'verify':fail if fails else lambda *args:None}), patch.object(sys,'argv',['configure-mailboxes.py','a'*40]), patch.object(sys,'stdin',io.StringIO('{"providers":["gmail"]}')), patch.object(ns['Path'],'home',return_value=root), patch.object(ns['subprocess'],'check_output',return_value='a'*40), patch.object(ns['subprocess'],'run'), patch.object(ns['time'],'sleep'), contextlib.redirect_stdout(io.StringIO()) as output:
                if fails:
                    try: ns['main'](); raise AssertionError('Failed activation was accepted')
                    except RuntimeError as error: assert 'restored' in str(error)
                else: ns['main']()
            assert existing['GOOGLE_CLIENT_SECRET'] not in output.getvalue()
            if fails:
                assert env_file.read_bytes() == original
                assert len(restarted) == 2 and restarted[-1]['MAILBOX_ENCRYPTION_KEY'] == ''
            else:
                saved = ns['file_settings'](env_file.read_bytes())
                assert saved['SESSION_SECRET'] == 'keep-session'
                assert saved['OUTLOOK_CLIENT_SECRET'] == 'keep-outlook'
                assert saved['GOOGLE_CLIENT_SECRET'] == existing['GOOGLE_CLIENT_SECRET']
                assert saved['MAILBOX_ENCRYPTION_KEY'] == restarted[0]['MAILBOX_ENCRYPTION_KEY']
                assert saved['MAILBOX_ENCRYPTION_KEY'] not in output.getvalue()
                assert env_file.stat().st_mode & 0o777 == 0o600
        assert all((p.stat().st_mode & 0o077) == 0 for p in (root/'.studybridge-private-backups').rglob('*') if p.is_file())
        # Rerunning must retain the exact encryption key and avoid a restart.
        activated = env_file.read_bytes()
        restarted.clear()
        with patch.dict(ns, {'process_settings':lambda: {},'restart':restart,'verify':lambda *args:None}), patch.object(sys,'argv',['configure-mailboxes.py','a'*40]), patch.object(sys,'stdin',io.StringIO('{"providers":["gmail"]}')), patch.object(ns['subprocess'],'check_output',return_value='a'*40), contextlib.redirect_stdout(io.StringIO()):
            ns['main']()
        assert env_file.read_bytes() == activated and not restarted
        # A stale workflow must not change the current deployment.
        with patch.object(sys,'argv',['configure-mailboxes.py','a'*40]), patch.object(ns['subprocess'],'check_output',return_value='b'*40):
            try: ns['main'](); raise AssertionError('Stale revision accepted')
            except RuntimeError: pass
        assert env_file.read_bytes() == activated
        # Missing AI configuration must fail before writing anything.
        no_ai = dict(existing)
        no_ai.pop('OPENAI_API_KEY')
        env_file.write_text('\n'.join(k+'='+v for k,v in no_ai.items())+'\n')
        no_ai_original = env_file.read_bytes()
        with patch.dict(ns, {'process_settings':lambda: {},'restart':restart}), patch.object(sys,'argv',['configure-mailboxes.py','a'*40]), patch.object(sys,'stdin',io.StringIO('{"providers":["gmail"]}')), patch.object(ns['subprocess'],'check_output',return_value='a'*40):
            try: ns['main'](); raise AssertionError('Missing AI accepted')
            except RuntimeError: pass
        assert env_file.read_bytes() == no_ai_original and not restarted
    finally: os.chdir(before)
print('Mailbox private activation, key retention, revision guard and rollback passed.')
`;
  const result = spawnSync("python3", ["-c", script], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("activation validation exercises both real OAuth builders without contacting either mail provider", () => {
  const script = String.raw`
import base64, contextlib, io, json, os, pathlib, runpy, tempfile
from unittest.mock import patch
ns = runpy.run_path('aws/configure-mailboxes.py')['verify'].__globals__
source = pathlib.Path.cwd()
environment = {'NODE_ENV':'production','APP_BASE_URL':'https://studybridge.ink','GOOGLE_CLIENT_ID':'123456-fixture.apps.googleusercontent.com','GOOGLE_CLIENT_SECRET':'GOCSPX-fixture-only-not-real','OPENAI_API_KEY':'private-fixture','STUDYBRIDGE_DB':'local','MAILBOX_ENCRYPTION_KEY':base64.b64encode(b'k'*32).decode(),'OUTLOOK_CLIENT_ID':'11111111-2222-3333-4444-555555555555','OUTLOOK_CLIENT_SECRET':'fixture~outlook-secret-only'}
with tempfile.TemporaryDirectory(prefix='studybridge-mailbox-validation-test-') as directory:
    root = pathlib.Path(directory)
    (root/'lib').symlink_to(source/'lib',target_is_directory=True)
    (root/'.env').write_text('\n'.join(k+'='+v for k,v in environment.items())+'\n')
    os.chdir(root)
    try:
        with patch.dict(ns, {'process_settings':lambda:{}}), patch.dict(ns['COMMON'],{'verify':lambda client:None}), patch.object(ns['urllib'].request,'urlopen',return_value=contextlib.closing(io.StringIO('{"ok":true,"db":"local"}'))):
            ns['verify'](['gmail','outlook'],{'MAILBOX_ENCRYPTION_KEY':environment['MAILBOX_ENCRYPTION_KEY']},environment)
        with patch.dict(ns, {'process_settings':lambda:{'OUTLOOK_REDIRECT_URI':'https://wrong.example/callback'}}), patch.object(ns['urllib'].request,'urlopen',return_value=contextlib.closing(io.StringIO('{"ok":true,"db":"local"}'))):
            try: ns['verify'](['outlook'],{},environment); raise AssertionError('Wrong callback passed')
            except RuntimeError: pass
    finally: os.chdir(source)
print('Real OAuth builders, encrypted state and wrong-callback rejection passed.')
`;
  const result = spawnSync("python3", ["-c", script], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
