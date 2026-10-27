#!/usr/bin/env bash
# Run as root on the existing Ubuntu/Nginx host. No application/data migration.
set -Eeuo pipefail

IP=3.98.63.195
SITE=/etc/nginx/sites-available/studybridge-ip
LINK=/etc/nginx/sites-enabled/studybridge-ip
WEBROOT=/var/www/studybridge-acme
CERTROOT=/etc/letsencrypt-studybridge
CERTBOT=/opt/studybridge-certbot/bin/certbot
MODE=${1:-inspect}

if [[ $EUID -ne 0 ]]; then echo 'Run with sudo.' >&2; exit 1; fi
if [[ $MODE == inspect ]]; then
  cat /etc/os-release
  nginx -v
  for site in /etc/nginx/sites-enabled/*; do
    echo "Site: $site"
    sed '/^[[:space:]]*#/d; /^[[:space:]]*$/d' "$site"
  done
  certbot --version || true
  curl --fail --silent http://127.0.0.1:3000/api/health
  exit 0
fi
[[ $MODE == apply ]] || { echo 'Expected inspect or apply.' >&2; exit 1; }
# Serialize reruns, including when an earlier SSH client disconnected.
exec 9>/run/lock/studybridge-ip-https.lock
flock -w 600 9
nginx -t
curl --fail --silent http://127.0.0.1:3000/api/health

# An IP client may omit TLS SNI: it needs the default IPv4 TLS certificate.
# Refuse to displace an explicitly configured default for another site.
if grep -R -E '^[[:space:]]*listen[^;]*443[^;]*default_server' /etc/nginx/sites-enabled /etc/nginx/conf.d | grep -v 'studybridge-ip:'; then
  echo 'An existing explicit default TLS site needs review.' >&2
  exit 1
fi
BACKUP=$(mktemp -d /root/studybridge-https-backup.XXXXXX)
chmod 700 "$BACKUP"
cp -a /etc/nginx "$BACKUP/nginx"
HAD_SITE=0
HAD_LINK=0
[[ ! -e $SITE ]] || { cp -a "$SITE" "$BACKUP/site"; HAD_SITE=1; }
[[ ! -e $LINK && ! -L $LINK ]] || { cp -a "$LINK" "$BACKUP/link"; HAD_LINK=1; }
restore_site() {
  local result=$?
  trap - ERR
  if [[ $HAD_SITE == 1 ]]; then cp -a "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
  rm -f "$LINK"
  [[ $HAD_LINK == 0 ]] || cp -a "$BACKUP/link" "$LINK"
  nginx -t && systemctl reload nginx
  echo "HTTPS setup failed; previous StudyBridge site restored. Backup: $BACKUP" >&2
  exit "$result"
}
trap restore_site ERR

# Use a separate, current Certbot and certificate store. The other site's
# distribution Certbot, renewal timer and certificate remain independent.
if [[ ! -x $CERTBOT ]]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv
  python3 -m venv /opt/studybridge-certbot
  /opt/studybridge-certbot/bin/pip install --disable-pip-version-check 'certbot==5.8.0'
fi
"$CERTBOT" --version
install -d -m 755 "$WEBROOT/.well-known/acme-challenge"
install -d -m 700 "$CERTROOT"

write_http() {
  cat <<'NGINX'
# Managed by StudyBridge aws/ip-https.sh
server {
    listen 80;
    server_name 3.98.63.195;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/studybridge-acme;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 308 https://3.98.63.195$request_uri; }
}
NGINX
}

# On reruns keep the working TLS server available during ACME validation.
if [[ ! -f $CERTROOT/live/$IP/fullchain.pem ]]; then
  write_http > "$SITE"
  ln -sfn "$SITE" "$LINK"
  nginx -t
  systemctl reload nginx
fi

ACME=(--config-dir "$CERTROOT" --work-dir /var/lib/letsencrypt-studybridge --logs-dir /var/log/letsencrypt-studybridge)
if [[ ! -f $CERTROOT/live/$IP/fullchain.pem ]]; then
  # Validate the exact HTTP-01 route with staging before requesting trust.
  "$CERTBOT" certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --dry-run --required-profile shortlived --webroot -w "$WEBROOT" \
    --ip-address "$IP" --cert-name "$IP" "${ACME[@]}"
fi
"$CERTBOT" certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --required-profile shortlived --webroot -w "$WEBROOT" \
  --ip-address "$IP" --cert-name "$IP" --keep-until-expiring "${ACME[@]}"

write_http > "$SITE"
cat >> "$SITE" <<'NGINX'
server {
    listen 443 ssl default_server;
    server_name 3.98.63.195;
    ssl_certificate /etc/letsencrypt-studybridge/live/3.98.63.195/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt-studybridge/live/3.98.63.195/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:StudyBridgeTLS:10m;
    ssl_session_timeout 1d;
    client_max_body_size 70m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host 3.98.63.195;
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
chmod 644 "$SITE"
ln -sfn "$SITE" "$LINK"
nginx -t
systemctl reload nginx

install -d -m 755 "$CERTROOT/renewal-hooks/deploy"
cat > "$CERTROOT/renewal-hooks/deploy/reload-nginx" <<'HOOK'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
HOOK
chmod 750 "$CERTROOT/renewal-hooks/deploy/reload-nginx"
cat > /etc/systemd/system/studybridge-certbot.service <<'SERVICE'
[Unit]
Description=Renew StudyBridge public IP certificate and reload Nginx
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/studybridge-certbot/bin/certbot renew --non-interactive --quiet --no-random-sleep-on-renew --config-dir /etc/letsencrypt-studybridge --work-dir /var/lib/letsencrypt-studybridge --logs-dir /var/log/letsencrypt-studybridge
SERVICE
cat > /etc/systemd/system/studybridge-certbot.timer <<'TIMER'
[Unit]
Description=Check StudyBridge IP certificate renewal every six hours

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now studybridge-certbot.timer
"$CERTBOT" renew --cert-name "$IP" --dry-run --run-deploy-hooks --non-interactive --no-random-sleep-on-renew "${ACME[@]}"
systemctl start studybridge-certbot.service
systemctl is-active studybridge-certbot.timer
systemctl list-timers studybridge-certbot.timer --no-pager
openssl x509 -in "$CERTROOT/live/$IP/fullchain.pem" -noout -dates -ext subjectAltName
curl --fail --silent "https://$IP/api/health"
trap - ERR
echo "HTTPS ready; Nginx backup: $BACKUP. Application accounts/data were not modified."
