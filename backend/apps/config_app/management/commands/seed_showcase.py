"""Populate the system with realistic demo data for screenshots / presentation."""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.bookings.models import Subscription
from apps.config_app.models import MorningSlot, PickupPoint, Route, ReturnSlot, University
from apps.notifications.models import notify
from apps.operations.models import DailyTrip, ReturnBooking, SeatRequest
from apps.operations.services import request_seat
from apps.tourism.models import Quotation, TourismRequest, VehicleType
from apps.users.models import User

FIRST = ['محمد', 'أحمد', 'محمود', 'مصطفى', 'كريم', 'عمر', 'يوسف', 'خالد', 'إسلام', 'حسن',
         'مريم', 'فاطمة', 'سارة', 'نور', 'هدى', 'أميرة', 'ياسمين', 'دينا', 'ملك', 'رنا',
         'عبد الله', 'إبراهيم', 'طارق', 'وليد', 'شريف', 'هبة', 'مي', 'إسراء', 'آية', 'جنى']
LAST = ['القاضي', 'عبد الرحمن', 'السيد', 'حسين', 'فؤاد', 'عبد العزيز', 'شعبان', 'رمضان',
        'عيد', 'زكي', 'الشناوي', 'المصري', 'عبد الحميد', 'سلطان', 'الديب', 'عوض']


class Command(BaseCommand):
    help = 'Seed rich demo data (students, subscriptions, trips, tourism).'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Clear existing demo activity first.')

    def handle(self, *args, **opts):
        random.seed(42)
        if opts['reset']:
            SeatRequest.objects.all().delete()
            DailyTrip.objects.all().delete()
            ReturnBooking.objects.all().delete()
            Subscription.objects.all().delete()
            Quotation.objects.all().delete()
            TourismRequest.objects.all().delete()
            User.objects.filter(username__startswith='st_').delete()
            self.stdout.write('Cleared previous demo activity.')

        routes = list(Route.objects.filter(active=True))
        slots = list(MorningSlot.objects.filter(active=True))
        method = None
        from apps.config_app.models import PaymentMethod
        method = PaymentMethod.objects.first()
        tomorrow = timezone.localdate() + timedelta(days=1)

        # ---- Students ----
        students = []
        for i in range(1, 41):
            uname = f'st_{i:03d}'
            route = random.choice(routes)
            uni = random.choice(list(University.objects.filter(destination=route.destination)))
            u, _ = User.objects.get_or_create(username=uname, defaults={
                'role': User.Role.STUDENT,
                'full_name': f'{random.choice(FIRST)} {random.choice(LAST)}',
                'national_id': f'3{random.randint(1000000000000, 9999999999999)}',
                'phone': f'01{random.choice([0,1,2,5])}{random.randint(10000000, 99999999)}',
                'university': uni,
            })
            u.set_password('demo1234'); u.save()
            students.append((u, route, uni))

        # ---- Subscriptions (mostly confirmed; some in the payment queue; a few rejected) ----
        prices = {'term': Decimal('42000'), 'monthly': Decimal('9500'), 'daily': Decimal('220')}
        admin = User.objects.filter(role='admin').first()
        for idx, (u, route, uni) in enumerate(students):
            stype = random.choices(['term', 'monthly', 'daily'], weights=[3, 5, 2])[0]
            pickup = random.choice(list(route.pickup_points.all()) or [None])
            sub = Subscription.objects.create(
                student=u, subscription_type=stype, route=route, university=uni,
                pickup_point=pickup, amount=prices[stype], payment_method=method,
                payment_reference=f'REF{random.randint(100000, 999999)}',
            )
            r = random.random()
            if r < 0.72:
                sub.submit_payment(); sub.approve(admin)
            elif r < 0.90:
                sub.submit_payment()  # sits in the payment queue
            else:
                sub.submit_payment(); sub.reject(admin, 'المبلغ المحوّل غير مطابق')

        # ---- Daily trips for tomorrow (varied fill + waiting lists) ----
        confirmed_students = [s for s in students
                              if Subscription.objects.filter(student=s[0], status='confirmed').exists()]
        showcase_routes = routes[:3]
        for route in showcase_routes:
            slot = slots[0]
            cap = random.choice([12, 15, 18])
            trip = DailyTrip.objects.create(date=tomorrow, route=route, morning_slot=slot, total_seats=cap)
            pool = [s for s in confirmed_students if s[1] == route] or confirmed_students
            random.shuffle(pool)
            for (u, r_, uni) in pool[:cap + random.randint(2, 5)]:
                sub = Subscription.objects.filter(student=u, status='confirmed').first()
                ptype = sub.subscription_type if sub else 'daily'
                pickup = random.choice(list(route.pickup_points.all()) or [None])
                request_seat(daily_trip=trip, student=u, subscription=sub,
                             priority_type=ptype, university_id=uni.id,
                             pickup_point_id=pickup.id if pickup else None)

        # ---- History: last 7 days of trips + confirmed bookings (for the trend chart) ----
        from apps.operations.services import new_token
        counts = [18, 24, 21, 30, 27, 33, 29]  # passengers per past day (oldest→newest)
        for offset in range(7, 0, -1):
            day = timezone.localdate() - timedelta(days=offset)
            target = counts[7 - offset]
            remaining = target
            for route in showcase_routes:
                if remaining <= 0:
                    break
                slot = slots[0]
                cap = 49 if route.code.startswith('SHEBIN') else 15
                trip, _ = DailyTrip.objects.get_or_create(
                    date=day, route=route, morning_slot=slot,
                    defaults={'layout': 'bus50' if cap == 49 else 'hiace15', 'total_seats': cap})
                take = min(remaining, cap, 20)
                pool = [s for s in students]
                random.shuffle(pool)
                for seat in range(1, take + 1):
                    stu = pool[(seat + offset) % len(pool)][0]
                    SeatRequest.objects.get_or_create(
                        daily_trip=trip, student=stu,
                        defaults={'university_id': pool[(seat + offset) % len(pool)][2].id,
                                  'priority_type': 'monthly', 'status': 'confirmed',
                                  'seat_number': seat, 'qr_token': new_token()})
                remaining -= take

        # ---- Return bookings for tomorrow (grouped nicely by university) ----
        rslots = list(ReturnSlot.objects.filter(active=True))
        for (u, route, uni) in random.sample(confirmed_students, min(24, len(confirmed_students))):
            slot = random.choice(rslots)
            used = ReturnBooking.objects.filter(date=tomorrow, return_slot=slot, status='confirmed').count()
            if used < slot.capacity:
                ReturnBooking.objects.get_or_create(student=u, date=tomorrow,
                    defaults={'return_slot': slot, 'university': uni})

        # ---- Tourism requests + quotations ----
        vehicles = list(VehicleType.objects.all())
        trips_def = [
            ('رحلة شركة إلى الغردقة', 'القاهرة', 'الغردقة', 45, 'private', 'quoted', 68000),
            ('عائلة إلى شرم الشيخ', 'شبين الكوم', 'شرم الشيخ', 12, 'private', 'accepted', 32000),
            ('رحلة طلابية إلى الإسكندرية', 'بنها', 'الإسكندرية', 28, 'private', 'pending', None),
            ('نقل خاص إلى مطار القاهرة', 'قويسنا', 'مطار القاهرة', 6, 'seat', 'pending', None),
            ('رحلة عمرة - مغادرة', 'المنوفية', 'مطار القاهرة', 40, 'private', 'rejected', 55000),
        ]
        for name, o, d, n, tt, status, price in trips_def:
            req = TourismRequest.objects.create(
                full_name=f'{random.choice(FIRST)} {random.choice(LAST)}',
                phone=f'010{random.randint(10000000, 99999999)}',
                origin=o, destination=d, travelers=n, trip_type=tt,
                vehicle_type=random.choice(vehicles),
                travel_date=timezone.localdate() + timedelta(days=random.randint(3, 20)),
                notes=name, status=status,
            )
            if price:
                q = Quotation.objects.create(request=req, price=Decimal(price),
                    notes='يشمل السائق والوقود', created_by=admin,
                    status='accepted' if status == 'accepted' else 'rejected' if status == 'rejected' else 'sent')

        # ---- A few notifications for the demo student ----
        demo = User.objects.filter(username='student').first()
        if demo:
            notify(demo, 'تم تأكيد اشتراكك', 'اشتراك شهري على مسار شبين → بدر', link='/my-bookings', severity='success')
            notify(demo, 'تم تأكيد مقعدك', 'رحلة الغد ٦:٠٠ ص', link='/daily', severity='success')
            notify(demo, 'عرض السعر جاهز', 'رحلتك إلى الغردقة: 68000 ج.م', link='/tourism', severity='info')

        self.stdout.write(self.style.SUCCESS(
            f'✔ Showcase data: {len(students)} students, '
            f'{Subscription.objects.count()} subscriptions, '
            f'{DailyTrip.objects.count()} trips, {SeatRequest.objects.count()} seat requests, '
            f'{ReturnBooking.objects.count()} return bookings, {TourismRequest.objects.count()} tourism requests.'))
