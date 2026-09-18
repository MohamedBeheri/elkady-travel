"""Cron entry point: fires the attendance lock + auto allocation once the
configured daily cutoff has passed.

Meant to be invoked frequently (every few minutes) by an OS cron job — it is
cheap and idempotent when nothing is due, so a tight schedule is safe:

    */5 * * * * /opt/elkady/venv/bin/python /opt/elkady/backend/manage.py run_scheduled_allocation

Nothing happens unless CompanySettings.attendance_lock_time is set AND the
current time has passed it for tomorrow's trips. Once it has, every
term/monthly rider who neither confirmed nor declined attendance is marked
absent for that day only, then the normal seat allocation runs — exactly
what pressing "تشغيل التخصيص" on the trip board does, just automatic.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.config_app.models import CompanySettings
from apps.operations.services import auto_close_attendance


class Command(BaseCommand):
    help = 'Auto-lock tomorrow\'s term/monthly attendance and run allocation, once the configured cutoff has passed.'

    def handle(self, *args, **options):
        cs = CompanySettings.load()
        cutoff = cs.attendance_lock_time
        if not cutoff:
            self.stdout.write('attendance_lock_time not set — nothing to do.')
            return
        now = timezone.localtime()
        if now.time() < cutoff:
            self.stdout.write(f'not due yet ({now.time().strftime("%H:%M")} < {cutoff.strftime("%H:%M")}).')
            return
        tomorrow = (now.date() + timezone.timedelta(days=1)).isoformat()
        made_absent = auto_close_attendance(tomorrow)
        self.stdout.write(self.style.SUCCESS(
            f'ran for {tomorrow}: {made_absent} silent lock(s) marked absent, allocation refreshed.'))
