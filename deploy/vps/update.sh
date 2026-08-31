#!/usr/bin/env bash
# Redeploy ELKADY after a git push. Run as the elkady user:
#   sudo -u elkady bash /opt/elkady/deploy/vps/update.sh
set -o errexit

cd /opt/elkady
git pull origin main

cd /opt/elkady/backend
/opt/elkady/venv/bin/pip install -r requirements.txt
/opt/elkady/venv/bin/python manage.py migrate --no-input
/opt/elkady/venv/bin/python manage.py collectstatic --no-input

# Restart the isolated service (needs sudo; see note in DEPLOY_VPS.md).
sudo systemctl restart elkady
echo "✅ ELKADY updated and restarted."
