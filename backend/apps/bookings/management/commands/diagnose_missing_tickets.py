"""READ-ONLY: list confirmed term/monthly subscriptions that have no active seat
(so the student sees «مؤكد» in حجوزاتي but an empty «تذاكري»), with the reason.

    python manage.py diagnose_missing_tickets

Writes nothing to the database.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.bookings.models import Subscription


class Command(BaseCommand):
    help = 'READ-ONLY: confirmed term/monthly subscriptions with no seat/ticket, and why.'

    def handle(self, *args, **options):
        from apps.config_app.models import MorningSlot, ReturnSlot, SeatCapacity
        from apps.operations.layouts import LAYOUTS, seat_set
        from apps.operations.models import TermSeatLock
        from apps.operations.services import DEFAULT_LAYOUT, _first_free_seat

        subs = (Subscription.objects
                .filter(subscription_type__in=['term', 'monthly'], status=Subscription.Status.CONFIRMED)
                .select_related('student', 'route', 'morning_slot', 'return_slot')
                .order_by('route_id', 'verified_at'))
        missing = [s for s in subs
                   if not TermSeatLock.objects.filter(subscription=s, active=True).exists()]

        self.stdout.write(f'اشتراكات ترم/شهري مؤكدة: {subs.count()} — بدون مقعد/تذكرة: {len(missing)}\n')
        for s in missing:
            route = s.route
            cap = SeatCapacity.objects.filter(route=route).select_related('morning_slot').first()
            layout = cap.layout if cap else DEFAULT_LAYOUT
            ms = (s.morning_slot or (cap.morning_slot if cap and cap.morning_slot_id else None)
                  or MorningSlot.objects.filter(active=True).order_by('departure_time').first())
            rs = s.return_slot or ReturnSlot.objects.filter(active=True).order_by('departure_time').first()
            total = len(seat_set(layout if layout in LAYOUTS else DEFAULT_LAYOUT))
            reasons = []
            for direction, slot in (('go', ms), ('return', rs)):
                label = 'ذهاب' if direction == 'go' else 'عودة'
                if not slot:
                    reasons.append(f'{label}: لا يوجد موعد مُعرّف')
                    continue
                taken = TermSeatLock.objects.filter(
                    route=route, direction=direction, active=True,
                    **({'return_slot': slot} if direction == 'return' else {'morning_slot': slot})).count()
                free = _first_free_seat(route, slot, direction, layout, s.student)
                state = f'مقعد متاح الآن رقم {free}' if free else 'ممتلئ / لا مقعد مناسب لنوع الطالب'
                reasons.append(f'{label} {slot.name}: محجوز {taken}/{total} — {state}')
            st = s.student
            when = timezone.localtime(s.verified_at).strftime('%Y-%m-%d %H:%M') if s.verified_at else '—'
            self.stdout.write(
                f'- id={s.id} | {st.full_name or st.username} ({st.phone or "-"}, {st.gender or "?"}) | '
                f'{s.get_subscription_type_display()} | {route.name} | أُكِّد {when}\n'
                f'    ' + ' ؛ '.join(reasons))
        self.stdout.write(self.style.SUCCESS('\n(قراءة فقط — لم يتم تعديل أي بيانات)'))
