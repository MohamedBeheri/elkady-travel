"""Close monthly subscriptions whose period ended (also runs automatically
once a day on the first request). Dry run lists them without closing:

    python manage.py expire_subscriptions --dry-run
"""
from django.core.management.base import BaseCommand

from apps.bookings.services import due_for_expiry, expire_due_subscriptions


class Command(BaseCommand):
    help = 'Close subscriptions whose valid_until has passed and free their seats.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        due = list(due_for_expiry())
        for sub in due:
            self.stdout.write(f'{sub.student} | {sub.get_subscription_type_display()} | {sub.route} | حتى {sub.valid_until}')
        if opts['dry_run']:
            self.stdout.write(f'{len(due)} subscription(s) would close (dry run)')
            return
        closed = expire_due_subscriptions()
        self.stdout.write(self.style.SUCCESS(f'{len(closed)} subscription(s) closed'))
