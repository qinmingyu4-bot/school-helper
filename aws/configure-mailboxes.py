#!/usr/bin/env python3
"""Activate selected mailbox providers from private SSH stdin, without granting a user's inbox."""
import base64
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

BASE_URL = "https://studybridge.ink"
COMMON = runpy.run_path(str(Path(__file__).with_name("configure-google-login.py")))
render_env = COMMON["render_env"]
replace_private = COMMON["replace_private"]
restart = COMMON["restart"]


def file_settings(content):
    values = {}
    for line in content.decode().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        # Match server.js: the first definition wins.
        values.setdefault(key.strip(), value)
    return values


def process_settings():
    result = subprocess.run(["pm2", "jlist"], capture_output=True, check=True)
    process = next(row["pm2_env"] for row in json.loads(result.stdout) if row.get("name") == "studybridge")
    combined = {**process.get("env", {}), **process}
    return {key: value for key, value in combined.items() if isinstance(value, str)}


def valid_key(value):
    try:
        decoded = base64.b64decode(value, validate=True)
        return len(decoded) == 32 and base64.b64encode(decoded).decode() == value
    except (ValueError, TypeError):
        return False


def settings(payload, existing, persisted):
    allowed = {"providers", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "OUTLOOK_CLIENT_ID", "OUTLOOK_CLIENT_SECRET"}
    if not isinstance(payload, dict) or set(payload) - allowed:
        raise ValueError("Only selected provider credentials are accepted")
    providers = payload.get("providers")
    if not isinstance(providers, list) or not providers or len(set(providers)) != len(providers) or any(p not in ("gmail", "outlook") for p in providers):
        raise ValueError("Select gmail, outlook, or both")
    if existing.get("APP_BASE_URL", "").rstrip("/") != BASE_URL or existing.get("NODE_ENV") != "production":
        raise RuntimeError("Expected the existing canonical production environment")
    for candidate in (existing.get("MAILBOX_ENCRYPTION_KEY", ""), persisted.get("MAILBOX_ENCRYPTION_KEY", "")):
        if candidate and not valid_key(candidate):
            raise RuntimeError("Existing mailbox key is invalid; refusing to replace it")
    if existing.get("MAILBOX_ENCRYPTION_KEY") and persisted.get("MAILBOX_ENCRYPTION_KEY") and existing["MAILBOX_ENCRYPTION_KEY"] != persisted["MAILBOX_ENCRYPTION_KEY"]:
        raise RuntimeError("Runtime and persisted mailbox keys differ; refusing to rotate either key")
    key = existing.get("MAILBOX_ENCRYPTION_KEY") or persisted.get("MAILBOX_ENCRYPTION_KEY") or base64.b64encode(secrets.token_bytes(32)).decode()
    values = {"MAILBOX_ENCRYPTION_KEY": key, "MAILBOX_SYNC_DISABLED": "false"}
    for provider in providers:
        prefix = provider.upper()
        id_key, secret_key = prefix + "_CLIENT_ID", prefix + "_CLIENT_SECRET"
        supplied_id, supplied_secret = payload.get(id_key, ""), payload.get(secret_key, "")
        if bool(supplied_id) != bool(supplied_secret):
            raise ValueError("Supply both credential fields, or reuse both existing fields")
        fallback = "GOOGLE" if provider == "gmail" else prefix
        client_id = supplied_id or existing.get(id_key) or existing.get(fallback + "_CLIENT_ID", "")
        secret = supplied_secret or existing.get(secret_key) or existing.get(fallback + "_CLIENT_SECRET", "")
        id_pattern = r"[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com" if provider == "gmail" else r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}"
        if not isinstance(client_id, str) or not re.fullmatch(id_pattern, client_id):
            raise ValueError("Missing or invalid provider client ID")
        if not isinstance(secret, str) or not 10 <= len(secret) <= 4096 or not re.fullmatch(r"[A-Za-z0-9_.~!*-]+", secret):
            raise ValueError("Missing or invalid provider secret")
        # Do not copy existing Google login secrets into extra keys unless explicitly supplied.
        if supplied_id:
            values.update({id_key: client_id, secret_key: secret})
        values[prefix + "_REDIRECT_URI"] = BASE_URL + "/api/mailbox/" + provider + "/callback"
    return providers, values


def verify(providers, values, previous_environment):
    persisted = file_settings((Path.cwd() / ".env").read_bytes())
    active = {**persisted, **process_settings()}
    if any(active.get(key) != value for key, value in values.items()):
        raise RuntimeError("Active mailbox environment did not match saved configuration")
    if not active.get("OPENAI_API_KEY"):
        raise RuntimeError("Existing email classification AI is not configured")
    port = active.get("PORT", "3000")
    if not str(port).isdigit():
        raise RuntimeError("Invalid application port")
    with urllib.request.urlopen("http://127.0.0.1:" + str(port) + "/api/health", timeout=5) as response:
        health = json.load(response)
        if health.get("ok") is not True or health.get("db") != previous_environment.get("STUDYBRIDGE_DB", "local"):
            raise RuntimeError("Application health or storage mode validation failed")
    # Exercise exactly the production OAuth builder, without a real session or provider request.
    check = r"""
const assert = require('node:assert/strict');
const {configuration, startOAuth, verifyOAuth} = require('./lib/mailbox-providers');
for (const provider of JSON.parse(process.env.SB_VERIFY_PROVIDERS)) {
  const config = configuration(provider);
  assert.equal(config.enabled, true);
  const auth = {user:{id:'configuration-check'},tokenHash:'configuration-check'};
  const result = startOAuth(provider, auth, 'America/Toronto');
  const url = new URL(result.url), query = url.searchParams;
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, provider === 'gmail' ? 'accounts.google.com' : 'login.microsoftonline.com');
  assert.equal(query.get('redirect_uri'), `https://studybridge.ink/api/mailbox/${provider}/callback`);
  assert.equal(query.get('scope'), provider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.readonly' : 'offline_access User.Read Mail.Read');
  assert.equal(query.get('code_challenge_method'), 'S256');
  assert.ok(query.get('code_challenge'));
  assert.match(result.cookie, /; Secure/); assert.match(result.cookie, /; HttpOnly/);
  const [name, sealed] = result.cookie.split(';')[0].split('=');
  assert.equal(name, `__Host-sb_mailbox_${provider}`);
  assert.equal(verifyOAuth(provider, auth, query.get('state'), {[name]:sealed}).userId, auth.user.id);
}
"""
    result = subprocess.run(["node", "-e", check], env={**os.environ, **active, "SB_VERIFY_PROVIDERS": json.dumps(providers)}, capture_output=True)
    if result.returncode:
        raise RuntimeError("Mailbox OAuth, encryption, callback or read-only scope validation failed")
    if active.get("GOOGLE_CLIENT_ID") and active.get("GOOGLE_CLIENT_SECRET"):
        COMMON["verify"](active["GOOGLE_CLIENT_ID"])


def main():
    expected = sys.argv[1] if len(sys.argv) > 1 else ""
    if not re.fullmatch(r"[a-f0-9]{40}", expected):
        raise ValueError("Expected production revision is required")
    current = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if current != expected:
        raise RuntimeError("Production revision differs; deploy this revision before configuring mailboxes")
    raw = sys.stdin.read(65537)
    if len(raw) > 65536:
        raise ValueError("Credential payload too large")
    env_file = Path.cwd() / ".env"
    if env_file.is_symlink() or not env_file.is_file():
        raise RuntimeError("Expected a regular existing production .env file")
    original = env_file.read_bytes()
    persisted = file_settings(original)
    existing = {**persisted, **process_settings()}
    providers, values = settings(json.loads(raw), existing, persisted)
    if not existing.get("OPENAI_API_KEY"):
        raise RuntimeError("Existing email classification AI is not configured")
    updated = render_env(original.decode(), values).encode()
    previous = {key: existing.get(key, "") for key in values}
    if updated == original and all(existing.get(key) == value for key, value in values.items()):
        verify(providers, values, existing)
        print("Selected mailbox configuration already matches and passed validation.")
        return
    backup_root = Path.home() / ".studybridge-private-backups"
    backup_root.mkdir(mode=0o700, exist_ok=True)
    os.chmod(backup_root, 0o700)
    backup = Path(tempfile.mkdtemp(prefix="mailbox-", dir=backup_root))
    shutil.copyfile(env_file, backup / ".env")
    os.chmod(backup / ".env", 0o600)
    (backup / "previous-mailbox-environment.json").write_text(json.dumps(previous))
    os.chmod(backup / "previous-mailbox-environment.json", 0o600)
    if env_file.read_bytes() != original:
        raise RuntimeError("Configuration changed concurrently; refusing to overwrite it")
    try:
        replace_private(env_file, updated)
        restart(values)
        for attempt in range(30):
            try:
                verify(providers, values, existing)
                break
            except Exception:
                if attempt == 29:
                    raise RuntimeError("Mailbox startup validation failed") from None
                time.sleep(1)
        subprocess.run(["pm2", "save"], capture_output=True, check=True)
    except Exception:
        replace_private(env_file, original)
        restart(previous)
        subprocess.run(["pm2", "save"], capture_output=True, check=True)
        raise RuntimeError("Mailbox activation failed; previous private configuration restored") from None
    print("Mailbox configuration enabled for " + ", ".join(providers) + "; encryption, read-only scopes, callbacks and existing Google login verified.")
    print("No user inbox was authorized by this operation. Private configuration backup:", backup)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        detail = str(error) if isinstance(error, RuntimeError) else "Check private provider settings; credential values are suppressed."
        print("Mailbox configuration failed. " + detail, file=sys.stderr)
        raise SystemExit(1)
