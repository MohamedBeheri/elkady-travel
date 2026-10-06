"""Confirm HELD seats whose daily subscription is already CONFIRMED (paid),
and revive paid seats wrongly pushed to the waiting list. Dry-run by default.

    python manage.py repair_held_seats          # report only
    python manage.py repair_held_seats --apply  # fix
"""
from django.core.management.base import BaseCommand

from apps.bookings.models import Subscription
from apps.operations.models import SeatRequest
from apps.operations.services import confirm_seat_payment


class Command(BaseCommand):
    help = 'Confirm held/waiting seat-map bookings that belong to confirmed daily subscriptions.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **opts):
        qs = SeatRequest.objects.filter(
            status__in=[SeatRequest.Status.HELD, SeatRequest.Status.WAITING],
            seat_number__isnull=False,
            subscription__status=Subscription.Status.CONFIRMED,
            subscription__subscription_type__startswith='daily',
        ).select_related('student', 'daily_trip')
        for r in qs:
            self.stdout.write(f'{r.student} | {r.daily_trip} | مقعد {r.seat_number} | {r.status}')
            if opts['apply']:
                confirm_seat_payment(r)
        self.stdout.write(self.style.SUCCESS(
            f'{qs.count()} seat(s) ' + ('fixed' if opts['apply'] else 'found (dry run)')))
