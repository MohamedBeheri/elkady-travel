#!/usr/bin/env bash
# Render build script — runs on every deploy.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate

# Seed baseline config + demo users once (skipped if users already exist).
python - <<'PY'
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.core.management import call_command
from apps.users.models import User
if not User.objects.exists():
    call_command('seed_demo')
    call_command('seed_fleet')
else:
    print('Data exists — seed skipped.')
PY
