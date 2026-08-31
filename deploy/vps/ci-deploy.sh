#!/usr/bin/env bash
# Auto-deploy: pull main and redeploy ONLY when GitHub has new commits.
# Meant to run as ROOT from cron every minute. App commands run as `elkady`,
# the service restart runs as root. No restart happens when nothing changed.
set -o errexit
cd /opt/elkady

# Fetch latest without touching the working tree.
sudo -u elkady git fetch --quiet origin main

LOCAL=$(sudo -u elkady git rev-parse HEAD)
REMOTE=$(sudo -u elkady git rev-parse origin/main)

# Up to date → nothing to do (silent, so cron stays quiet).
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "$(date '+%F %T') ⏬ new commit $REMOTE — deploying…"
sudo -u elkady git reset --hard origin/main
sudo -u elkady /opt/elkady/venv/bin/pip install -q -r /opt/elkady/backend/requirements.txt
sudo -u elkady bash -c "set -a && source /opt/elkady/backend/.env && set +a && cd /opt/elkady/backend && /opt/elkady/venv/bin/python manage.py migrate --no-input && /opt/elkady/venv/bin/python manage.py collectstatic --no-input"
systemctl restart elkady
echo "$(date '+%F %T') ✅ deployed $REMOTE"
