#!/bin/sh
# Fake but believable workload per role (ROLE=web|api|db|worker).
mkdir -p /srv/app && cd /srv/app
cat > app.js <<'JS'
require('http').createServer((q, s) => s.end('ok')).listen(process.env.PORT || 3000);
setInterval(() => { let x = 0; for (let i = 0; i < 2e6; i++) x += i; }, 1500);
JS
case "$ROLE" in
  web)    pm2 start app.js --name storefront -i 2 >/dev/null; PORT=3100 pm2 start app.js --name admin-panel >/dev/null ;;
  api)    PORT=4000 pm2 start app.js --name api-gateway -i 2 >/dev/null; PORT=4100 pm2 start app.js --name billing-worker >/dev/null ;;
  worker) PORT=5000 pm2 start app.js --name queue-worker -i 3 >/dev/null ;;
esac
cat > /etc/nginx/sites-available/shop.example.com <<'NG'
server { listen 80; server_name shop.example.com www.shop.example.com; location / { proxy_pass http://127.0.0.1:3000; } }
NG
cat > /etc/nginx/sites-available/api.example.com <<'NG'
server { listen 80; server_name api.example.com; location / { proxy_pass http://127.0.0.1:4000; } }
NG
ln -sf /etc/nginx/sites-available/shop.example.com /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/api.example.com /etc/nginx/sites-enabled/
cat > /etc/cron.d/demo <<'CR'
0 3 * * * root /usr/local/bin/backup-db.sh
*/5 * * * * root curl -fsS http://127.0.0.1:3000/health >/dev/null
30 2 * * 0 root certbot renew --quiet
CR
(crontab -l 2>/dev/null; echo "15 1 * * * /srv/app/rotate-logs.sh"; echo "0 */6 * * * /srv/app/sync-assets.sh") | crontab -
service cron start >/dev/null 2>&1
nginx >/dev/null 2>&1
# Some disk use so bars aren't empty.
fallocate -l "${FILL_MB:-800}M" /var/tmp/cache.bin 2>/dev/null || true
exec /usr/sbin/sshd -D -e
