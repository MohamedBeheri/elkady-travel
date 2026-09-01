"""Reset the day-to-day operational state (trips, seat locks, holds).

Useful right before going live: wipes leftover test data from the operational
tables WITHOUT touching users, subscriptions, routes, universities, prices,
vehicles, drivers, or fleet expenses.

Usage:
    # Report what's there — no changes:
    python manage.py reset_operations

    # Actually delete:
    python manage.py reset_operations --apply

    # Also clear fleet vehicle assignments:
    python manage.py reset_operations --apply --include-assignments

Never touches:
    users.User, bookings.Subscription, config_app.*, fleet.Vehicle, fleet.Driver,
    fleet.TripExpense, fleet.MaintenanceRecord, fleet.TrafficFine.
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Wipe operational state (trips, seat locks, holds) — keeps users/subs/config intact.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Actually delete. Without this flag the command only reports counts.')
        parser.add_argument('--include-assignments', action='store_true',
                            help='Also delete fleet VehicleAssignment rows.')

    def handle(self, *args, **options):
        from apps.operations.models import (
            DailyTrip, SeatRequest, ReturnBooking, TermSeatLock,
            SeatAbsence, DailySlotChoice,
        )

        counts = {
            'DailyTrip': DailyTrip.objects.count(),
            'SeatRequest': SeatRequest.objects.count(),
            'ReturnBooking': ReturnBooking.objects.count(),
            'TermSeatLock': TermSeatLock.objects.count(),
            'SeatAbsence': SeatAbsence.objects.count(),
            'DailySlotChoice': DailySlotChoice.objects.count(),
        }

        assignments_count = 0
        if options['include_assignments']:
            from apps.fleet.models import VehicleAssignment
            assignments_count = VehicleAssignment.objects.count()
            counts['VehicleAssignment'] = assignments_count

        self.stdout.write(self.style.MIGRATE_HEADING('\n== الحالة التشغيلية الحالية =='))
        for k, v in counts.items():
            self.stdout.write(f'  {k:20s}  {v}')

        if not options['apply']:
            self.stdout.write(self.style.WARNING(
                '\nهذه معاينة فقط. أضف --apply للحذف الفعلي.\n'
                'ملحوظة: هذا الأمر لا يمس المستخدمين ولا الاشتراكات ولا الإعدادات.'))
            return

        with transaction.atomic():
            # SeatRequest cascades from DailyTrip, but delete explicitly for clarity.
            DailySlotChoice.objects.all().delete()
            SeatAbsence.objects.all().delete()
            SeatRequest.objects.all().delete()
            ReturnBooking.objects.all().delete()
            TermSeatLock.objects.all().delete()
            DailyTrip.objects.all().delete()
            if options['include_assignments']:
                from apps.fleet.models import VehicleAssignment
                VehicleAssignment.objects.all().delete()

        self.stdout.write(self.style.SUCCESS('\n✓ تم تصفير الحالة التشغيلية.'))
        self.stdout.write('  المستخدمون، الاشتراكات، الإعدادات، المركبات — لم تُمس.')
