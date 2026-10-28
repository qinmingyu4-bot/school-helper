#!/usr/bin/env python3
"""Apply SES SMTP credentials from encrypted SSH stdin; never print their values."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "REQUIRE_EMAIL_VERIFICATION", "EMAIL_CODE_TTL_MINUTES", "ALLOW_EMAIL_CODE_FALLBACK")


def settings(payload):
    user = payload.get("username", "")
    password = payload.get("password", "")
    if not isinstance(user, str) or not re.fullmatch(r"[A-Z0-9]{20}", user):
        raise ValueError("Invalid SES SMTP username")
    if not isinstance(password, str) or not re.fullmatch(r"[A-Za-z0-9+/=]{40,128}", password):
        raise ValueError("Invalid SES SMTP password")
    return {"SMTP_HOST": "email-smtp.ca-central-1.amazonaws.com", "SMTP_PORT": "465",
            "SMTP_SECURE": "true", "SMTP_USER": user, "SMTP_PASS": password,
            "MAIL_FROM": "StudyBridge <noreply@studybridge.ink>", "REQUIRE_EMAIL_VERIFICATION": "true",
            "EMAIL_CODE_TTL_MINUTES": "15", "ALLOW_EMAIL_CODE_FALLBACK": "false"}


def preflight(values):
    import smtplib
    import ssl
    try:
        with smtplib.SMTP_SSL(values["SMTP_HOST"], 465, timeout=20, context=ssl.create_default_context()) as smtp:
            smtp.login(values["SMTP_USER"], values["SMTP_PASS"])
    except Exception:
        raise RuntimeError("SES TLS/authentication preflight failed; private configuration was not changed") from None


def render_env(original, values):
    lines = []
    for line in original.splitlines():
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
        if key not in values:
            lines.append(line)
    return "\n".join(lines).rstrip("\n") + "\n" + "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"


def replace_private(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".env-smtp-", dir=path.parent)
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


def verify(values):
    with urllib.request.urlopen("http://127.0.0.1:3000/api/auth/config", timeout=5) as response:
        config = json.load(response)
    if config.get("emailVerificationRequired") is not True or config.get("expiresIn") != 900 or config.get("resendAfter") != 60:
        raise RuntimeError("Registration email verification did not become enabled")


def main():
    expected = sys.argv[1] if len(sys.argv) > 1 else ""
    current = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if not expected or not re.fullmatch(r"[a-f0-9]{40}", expected):
        raise ValueError("Expected deployment revision is required")
    if current != expected:
        print("A newer application deployment superseded SMTP configuration; no change made.")
        return
    payload = sys.stdin.read(65537)
    if len(payload) > 65536:
        raise ValueError("Credential payload too large")
    values = settings(json.loads(payload))
    preflight(values)
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
        verify(values)
        print("SMTP registration verification configuration already matches and passed validation.")
        return
    backup_root = Path.home() / ".studybridge-private-backups"
    backup_root.mkdir(mode=0o700, exist_ok=True)
    os.chmod(backup_root, 0o700)
    backup = Path(tempfile.mkdtemp(prefix="smtp-email-", dir=backup_root))
    shutil.copyfile(env_file, backup / ".env")
    os.chmod(backup / ".env", 0o600)
    (backup / "previous-smtp-environment.json").write_text(json.dumps(previous))
    os.chmod(backup / "previous-smtp-environment.json", 0o600)
    if env_file.read_bytes() != original:
        raise RuntimeError("Configuration changed concurrently; refusing to overwrite it")
    try:
        replace_private(env_file, updated)
        restart(values)
        for attempt in range(30):
            try:
                verify(values)
                break
            except Exception as error:
                if attempt == 29:
                    detail = str(error) if isinstance(error, RuntimeError) else "local startup endpoint unavailable"
                    raise RuntimeError("SMTP registration verification startup validation failed: " + detail) from None
                time.sleep(1)
    except Exception as error:
        replace_private(env_file, original)
        restart(previous)
        detail = str(error) if isinstance(error, RuntimeError) else "configuration update failed"
        raise RuntimeError("SMTP configuration failed; previous private configuration restored. " + detail) from None
    print("SMTP registration verification enabled; TLS/authentication and required registration-code settings verified.")
    print("Existing application data and accounts were not migrated. Private configuration backup:", backup)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        detail = str(error) if isinstance(error, RuntimeError) else "Inspect configuration and process state without exposing credentials."
        print("SMTP registration verification configuration failed. " + detail, file=sys.stderr)
        raise SystemExit(1)
