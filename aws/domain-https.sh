#!/usr/bin/env bash
# Add the owner's domain to the existing Nginx/app without deploying application code.
set -Eeuo pipefail

DOMAIN=studybridge.ink
IP=3.98.63.195
SITE=/etc/nginx/sites-available/studybridge-domain
LINK=/etc/nginx/sites-enabled/studybridge-domain
WEBROOT=/var/www/studybridge-acme
CERTROOT=/etc/letsencrypt-studybridge
CERTBOT=/opt/studybridge-certbot/bin/certbot
MODE=${1:-inspect}
[[ $EUID == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ $MODE == inspect || $MODE == prepare || $MODE == apply ]] || exit 2

if [[ $MODE == inspect ]]; then
  nginx -t
  nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name'
  [[ ! -f $SITE ]] || cat "$SITE"
  systemctl is-active studybridge-certbot.timer
  curl --fail --silent --max-time 15 http://127.0.0.1:3000/api/health
  python3 - <<'PY'
import os, pathlib, pwd, urllib.parse
owner = os.environ.get('SUDO_USER', 'root')
file = pathlib.Path(pwd.getpwnam(owner).pw_dir) / 'school-helper' / '.env'
values = {}
if file.exists():
    for line in file.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            if key.strip() in ('APP_BASE_URL', 'PUBLIC_BASE_URL', 'GOOGLE_REDIRECT_URI', 'GOOGLE_CLIENT_ID'):
                values[key.strip()] = value.strip().strip('\"\'')
for key in ('APP_BASE_URL', 'PUBLIC_BASE_URL', 'GOOGLE_REDIRECT_URI'):
    url = urllib.parse.urlsplit(values.get(key, ''))
    print(key, (url.scheme + '://' + str(url.hostname) + url.path) if url.hostname else '(not configured)')
print('Google sign-in configured:', bool(values.get('GOOGLE_CLIENT_ID')))
PY
  exit 0
fi

# This shares the IP setup lock; all other hosted sites remain independent.
exec 9>/run/lock/studybridge-ip-https.lock
flock -w 600 9
nginx -t
curl --fail --silent --max-time 15 http://127.0.0.1:3000/api/health
[[ -x $CERTBOT && -x $CERTROOT/renewal-hooks/deploy/reload-nginx ]]
systemctl is-active studybridge-certbot.timer

if [[ $MODE == apply ]]; then
  # Exit 75 means DNS is still propagating. Never spend ACME attempts on NXDOMAIN.
  if ! python3 - <<'PY'
import json, urllib.request
try:
    for name in ('studybridge.ink', 'www.studybridge.ink'):
        for kind in ('A', 'AAAA'):
            url = 'https://dns.google/resolve?name=' + name + '&type=' + kind
            with urllib.request.urlopen(url, timeout=15) as response:
                data = json.load(response)
            answers = [a['data'] for a in data.get('Answer', []) if a['type'] == (1 if kind == 'A' else 28)]
            if data['Status'] != 0 or (kind == 'A' and set(answers) != {'3.98.63.195'}) or (kind == 'AAAA' and answers):
                raise RuntimeError(name + ' ' + kind + ' is not ready')
    print('Both public domain records resolve exclusively to the existing server.')
except Exception as error:
    print('DNS pending:', error)
    raise SystemExit(1)
PY
  then exit 75; fi
fi

# Refuse duplicate ownership of these names in another enabled virtual host.
if grep -R -E '^[[:space:]]*server_name[^;]*(studybridge\.ink)' /etc/nginx/sites-enabled /etc/nginx/conf.d | grep -v '^/etc/nginx/sites-enabled/studybridge-domain:'; then
  echo 'A different enabled site already owns the domain; review before changing it.' >&2
  exit 1
fi
if [[ -e $SITE ]] && ! grep -q '^# Managed by StudyBridge aws/domain-https.sh$' "$SITE"; then
  echo 'An unmanaged domain configuration already exists.' >&2
  exit 1
fi
BACKUP=$(mktemp -d /root/studybridge-domain-backup.XXXXXX)
chmod 700 "$BACKUP"
HAD_SITE=0
HAD_LINK=0
[[ ! -e $SITE ]] || { cp -a "$SITE" "$BACKUP/site"; HAD_SITE=1; }
[[ ! -L $LINK && ! -e $LINK ]] || { cp -a "$LINK" "$BACKUP/link"; HAD_LINK=1; }
restore_site() {
  local result=$?
  trap - ERR
  if [[ $HAD_SITE == 0 ]]; then rm -f "$SITE"; else cp -a "$BACKUP/site" "$SITE"; fi
  rm -f "$LINK"
  [[ $HAD_LINK == 0 ]] || cp -a "$BACKUP/link" "$LINK"
  nginx -t && systemctl reload nginx
  echo "Domain setup failed; previous domain configuration restored. Backup: $BACKUP" >&2
  exit "$result"
}
trap restore_site ERR
install -d -m 755 "$WEBROOT/.well-known/acme-challenge"

write_site() {
  cat <<'NGINX'
# Managed by StudyBridge aws/domain-https.sh
server {
    listen 80;
    server_name studybridge.ink www.studybridge.ink;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/studybridge-acme;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 308 https://studybridge.ink$request_uri; }
}
NGINX
  if [[ -f $CERTROOT/live/$DOMAIN/fullchain.pem && -f $CERTROOT/live/$DOMAIN/privkey.pem ]]; then
    cat <<'NGINX'
server {
    listen 443 ssl;
    server_name www.studybridge.ink;
    ssl_certificate /etc/letsencrypt-studybridge/live/studybridge.ink/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt-studybridge/live/studybridge.ink/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 308 https://studybridge.ink$request_uri;
}
server {
    listen 443 ssl;
    server_name studybridge.ink;
    ssl_certificate /etc/letsencrypt-studybridge/live/studybridge.ink/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt-studybridge/live/studybridge.ink/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:StudyBridgeDomainTLS:10m;
    ssl_session_timeout 1d;
    client_max_body_size 70m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host studybridge.ink;
        proxy_set_header X-Forwarded-Host studybridge.ink;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}
NGINX
  fi
}
install_site() {
  write_site > "$BACKUP/new-site"
  install -m 644 "$BACKUP/new-site" "$SITE"
  ln -sfn "$SITE" "$LINK"
  nginx -t
  systemctl reload nginx
}
install_site

if [[ $MODE == prepare ]]; then
  curl --silent --show-error --max-time 15 --resolve "$DOMAIN:80:127.0.0.1" -I "http://$DOMAIN/"
  trap - ERR
  echo "Domain HTTP challenge route prepared; TLS still requires public DNS. Backup: $BACKUP"
  exit 0
fi

ACME=(--config-dir "$CERTROOT" --work-dir /var/lib/letsencrypt-studybridge --logs-dir /var/log/letsencrypt-studybridge)
if [[ ! -f $CERTROOT/live/$DOMAIN/fullchain.pem ]]; then
  "$CERTBOT" certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --dry-run --webroot -w "$WEBROOT" -d "$DOMAIN" -d "www.$DOMAIN" --cert-name "$DOMAIN" "${ACME[@]}"
fi
"$CERTBOT" certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --webroot -w "$WEBROOT" -d "$DOMAIN" -d "www.$DOMAIN" --cert-name "$DOMAIN" \
  --keep-until-expiring "${ACME[@]}"
install_site
"$CERTBOT" renew --cert-name "$DOMAIN" --dry-run --run-deploy-hooks --non-interactive \
  --no-random-sleep-on-renew "${ACME[@]}"
curl --fail --silent --show-error --max-time 20 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health"
curl --fail --silent --show-error --max-time 20 --resolve "www.$DOMAIN:443:127.0.0.1" --resolve "$DOMAIN:443:127.0.0.1" -L "https://www.$DOMAIN/api/health"
curl --fail --silent --show-error --max-time 20 "https://$IP/api/health"
openssl x509 -in "$CERTROOT/live/$DOMAIN/fullchain.pem" -noout -dates -ext subjectAltName
systemctl is-active studybridge-certbot.timer
trap - ERR
echo "Domain HTTPS ready with automatic renewal. Backup: $BACKUP. Application code, accounts and data were not modified."
