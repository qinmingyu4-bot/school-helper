#!/usr/bin/env python3
"""Enable HTTP/2 on existing StudyBridge TLS hosts, without renewing certificates."""
import fcntl
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def enable_http2(source):
    # listen ... http2 is supported by production's Ubuntu nginx 1.24.
    # Keep the listener, certificates, streaming proxy and every other directive.
    def replace(match):
        options = match.group(2).split()
        if "ssl" not in options or "http2" in options:
            return match.group(0)
        return match.group(1) + match.group(2).rstrip() + " http2;"
    return re.sub(r"(^[ \t]*listen[ \t]+)((?:443|\[::\]:443)[ \t]+[^;\n]*);", replace, source, flags=re.M)


def apply(sites, backup_root, run=subprocess.run):
    run(["nginx", "-t"], check=True)
    changes = []
    for site in sites:
        if not site.exists():
            continue
        source = site.read_text()
        # Only the two named app hosts may be changed; refuse unexpected ownership.
        names = re.findall(r"^\s*server_name\s+([^;]+);", source, re.M)
        if not names or any(not set(value.split()) <= {"studybridge.ink", "www.studybridge.ink", "3.98.63.195"} for value in names):
            raise RuntimeError("Unexpected virtual host ownership: " + site.name)
        updated = enable_http2(source)
        if updated != source:
            changes.append((site, updated))
    if not changes:
        print("StudyBridge HTTP/2 configuration is already current.")
        return
    backup = Path(tempfile.mkdtemp(prefix="studybridge-http2-", dir=backup_root))
    for site, _ in changes:
        shutil.copy2(site, backup / site.name)
    try:
        for site, updated in changes:
            site.write_text(updated)
        run(["nginx", "-t"], check=True)
        run(["systemctl", "reload", "nginx"], check=True)
    except Exception:
        for site, _ in changes:
            shutil.copy2(backup / site.name, site)
        run(["nginx", "-t"], check=True)
        run(["systemctl", "reload", "nginx"], check=True)
        raise
    print("StudyBridge HTTP/2 enabled. Previous configuration: " + str(backup))


if __name__ == "__main__":
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo.")
    with open("/run/lock/studybridge-ip-https.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        apply([Path("/etc/nginx/sites-available") / name for name in
               ("studybridge-domain", "studybridge-ip")], "/root")
