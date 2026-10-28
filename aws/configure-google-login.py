#!/usr/bin/env python3
"""Apply Google login credentials from encrypted SSH stdin; never print their values."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

KEYS = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_BASE_URL", "GOOGLE_REDIRECT_URI", "NODE_ENV")
BASE_URL = "https://studybridge.ink"


def settings(payload):
    client_id = payload.get("GOOGLE_CLIENT_ID", "")
    secret = payload.get("GOOGLE_CLIENT_SECRET", "")
    if not isinstance(client_id, str) or not re.fullmatch(r"[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com", client_id):
        raise ValueError("Invalid Google client ID format")
    if not isinstance(secret, str) or not re.fullmatch(r"GOCSPX-[A-Za-z0-9_-]+", secret):
        raise ValueError("Invalid Google client secret format")
    return {"GOOGLE_CLIENT_ID": client_id, "GOOGLE_CLIENT_SECRET": secret,
            "APP_BASE_URL": BASE_URL, "GOOGLE_REDIRECT_URI": BASE_URL + "/api/auth/google/callback",
            "NODE_ENV": "production"}


def render_env(original, values):
    lines = []
    for line in original.splitlines():
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
        if key not in values:
            lines.append(line)
    return "\n".join(lines).rstrip("\n") + "\n" + "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"


def replace_private(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".env-google-", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def restart(values):
    environment = dict(os.environ, **{key: value or "" for key, value in values.items()})
    result = subprocess.run(["pm2", "restart", "studybridge", "--update-env"], env=environment, capture_output=True)
    if result.returncode:
        raise RuntimeError("StudyBridge restart failed; private process output was suppressed")


def verify(client_id):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    with urllib.request.urlopen("http://127.0.0.1:3000/api/auth/google/config", timeout=5) as response:
        if json.load(response).get("enabled") is not True:
            raise RuntimeError("Google login did not become enabled")
    try:
        response = opener.open("http://127.0.0.1:3000/api/auth/google/start", timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    url = urllib.parse.urlsplit(response.headers.get("Location", ""))
    query = urllib.parse.parse_qs(url.query)
    cookie = response.headers.get("Set-Cookie", "")
    checks = {"redirect_status": response.status == 302, "https_provider": url.scheme == "https", "provider_host": url.hostname == "accounts.google.com",
              "client_id": query.get("client_id") == [client_id], "callback": query.get("redirect_uri") == [BASE_URL + "/api/auth/google/callback"],
              "basic_scopes": query.get("scope") == ["openid email profile"], "PKCE_method": query.get("code_challenge_method") == ["S256"],
              "PKCE_challenge": bool(query.get("code_challenge")), "host_cookie": "__Host-sb_google_oauth=" in cookie,
              "secure_cookie": "; Secure" in cookie, "http_only_cookie": "HttpOnly" in cookie}
    response.close()
    if not all(checks.values()):
        raise RuntimeError("Google login checks failed: " + ", ".join(key for key, passed in checks.items() if not passed))


def main():
    expected = sys.argv[1] if len(sys.argv) > 1 else ""
    current = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if not expected or not re.fullmatch(r"[a-f0-9]{40}", expected):
        raise ValueError("Expected deployment revision is required")
    if current != expected:
        print("A newer application deployment superseded Google configuration; no change made.")
        return
    payload = sys.stdin.read(65537)
    if len(payload) > 65536:
        raise ValueError("Credential payload too large")
    values = settings(json.loads(payload))
    env_file = Path.cwd() / ".env"
    if env_file.is_symlink() or not env_file.is_file():
        raise RuntimeError("Expected a regular existing production .env file")
    original = env_file.read_bytes()
    pm2_result = subprocess.run(["pm2", "jlist"], capture_output=True, check=True)
    processes = json.loads(pm2_result.stdout)
    runtime = next(row["pm2_env"] for row in processes if row.get("name") == "studybridge")
    file_values = {}
    for line in original.decode().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            file_values[key.strip()] = value.strip().strip("\"'")
    previous = {key: runtime.get(key, runtime.get("env", {}).get(key, file_values.get(key, ""))) for key in KEYS}
    updated = render_env(original.decode(), values).encode()
    if updated == original and all(previous[key] == values[key] for key in KEYS):
        verify(values["GOOGLE_CLIENT_ID"])
        print("Google login configuration already matches and passed validation.")
        return
    backup_root = Path.home() / ".studybridge-private-backups"
    backup_root.mkdir(mode=0o700, exist_ok=True)
    os.chmod(backup_root, 0o700)
    backup = Path(tempfile.mkdtemp(prefix="google-login-", dir=backup_root))
    shutil.copyfile(env_file, backup / ".env")
    os.chmod(backup / ".env", 0o600)
    (backup / "previous-google-environment.json").write_text(json.dumps(previous))
    os.chmod(backup / "previous-google-environment.json", 0o600)
    if env_file.read_bytes() != original:
        raise RuntimeError("Configuration changed concurrently; refusing to overwrite it")
    try:
        replace_private(env_file, updated)
        restart(values)
        for attempt in range(30):
            try:
                verify(values["GOOGLE_CLIENT_ID"])
                break
            except Exception as error:
                if attempt == 29:
                    detail = str(error) if isinstance(error, RuntimeError) else "local startup endpoint unavailable"
                    raise RuntimeError("Google login startup validation failed: " + detail) from None
                time.sleep(1)
    except Exception as error:
        replace_private(env_file, original)
        restart(previous)
        detail = str(error) if isinstance(error, RuntimeError) else "configuration update failed"
        raise RuntimeError("Google configuration failed; previous private configuration restored. " + detail) from None
    print("Google login enabled; callback, basic scopes, PKCE and browser binding verified.")
    print("Existing application data and accounts were not migrated. Private configuration backup:", backup)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        detail = str(error) if isinstance(error, RuntimeError) else "Inspect configuration and process state without exposing credentials."
        print("Google login configuration failed. " + detail, file=sys.stderr)
        raise SystemExit(1)
