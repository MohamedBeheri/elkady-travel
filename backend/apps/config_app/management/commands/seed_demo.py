"""Seed baseline configuration and demo accounts for the transportation system."""
from datetime import date, time
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.config_app.models import (
    CompanySettings, Destination, MorningSlot, PaymentAccount, PaymentMethod,
    PickupPoint, PricingRule, ReturnSlot, Route, SeatCapacity, University,
)
from apps.tourism.models import VehicleType
from apps.users.models import User


class Command(BaseCommand):
    help = 'Seed baseline config + demo users.'

    def handle(self, *args, **opts):
        # ---- Destinations ----
        badr, _ = Destination.objects.get_or_create(code='BADR', defaults={'name': 'بدر', 'name_en': 'Badr'})
        shorouk, _ = Destination.objects.get_or_create(code='SHOROUK', defaults={'name': 'الشروق', 'name_en': 'Shorouk'})

        # ---- Universities ----
        unis = [
            ('جامعة بدر', 'Badr University', badr),
            ('الجامعة المصرية الروسية', 'Egyptian Russian University', badr),
            ('الجامعة البريطانية', 'British University', shorouk),
            ('أكاديمية الشروق', 'Shorouk Academy', shorouk),
        ]
        for name, en, dest in unis:
            University.objects.get_or_create(name=name, defaults={'name_en': en, 'destination': dest})

        # ---- Colleges (per university) ----
        from apps.config_app.models import College
        common_colleges = ['الهندسة', 'الطب', 'الصيدلة', 'طب الأسنان', 'الحاسبات والمعلومات',
                           'إدارة الأعمال', 'الإعلام', 'العلاج الطبيعي']
        for uni in University.objects.all():
            for cname in common_colleges:
                College.objects.get_or_create(university=uni, name=cname)

        # ---- Routes (origin corridor ← destination) ----
        routes_def = [
            ('SHEBIN_BADR', 'شبين/قويسنا/بنها', 'شبين/قويسنا/بنها ← بدر', badr,
             ['شبين الكوم', 'قويسنا', 'بنها']),
            ('SHEBIN_SHOROUK', 'شبين/قويسنا/بنها', 'شبين/قويسنا/بنها ← الشروق', shorouk,
             ['شبين الكوم', 'قويسنا', 'بنها']),
            ('BAGOUR_BADR', 'الباجور', 'الباجور ← بدر', badr, ['الباجور', 'منوف']),
            ('BAGOUR_SHOROUK', 'الباجور', 'الباجور ← الشروق', shorouk, ['الباجور', 'منوف']),
        ]
        routes = {}
        for code, origin, name, dest, points in routes_def:
            r, _ = Route.objects.get_or_create(
                code=code, defaults={'origin_label': origin, 'name': name, 'destination': dest})
            routes[code] = r
            for i, p in enumerate(points, start=1):
                PickupPoint.objects.get_or_create(route=r, name=p, defaults={'sequence': i})

        # ---- Morning slots ----
        m6, _ = MorningSlot.objects.get_or_create(code='M06', defaults={'departure_time': time(6, 0), 'name': '٦:٠٠ ص'})
        m9, _ = MorningSlot.objects.get_or_create(code='M09', defaults={'departure_time': time(9, 0), 'name': '٩:٠٠ ص'})

        # ---- Return slots (time — capacity) ----
        for code, t, name, cap in [
            ('R1200', time(12, 0), '١٢:٠٠ ظ', 18),
            ('R1330', time(13, 30), '١:٣٠ م', 50),
            ('R1500', time(15, 0), '٣:٠٠ م', 50),
            ('R1630', time(16, 30), '٤:٣٠ م', 18),
        ]:
            ReturnSlot.objects.get_or_create(
                code=code, defaults={'departure_time': t, 'name': name, 'capacity': cap})

        # ---- Seat capacities + prices per route ----
        for r in routes.values():
            for slot in (m6, m9):
                SeatCapacity.objects.get_or_create(route=r, morning_slot=slot, defaults={'total_seats': 50})
            PricingRule.objects.get_or_create(
                subscription_type='monthly', route=r,
                defaults={'price': Decimal('9500'), 'effective_date': date.today()})
            PricingRule.objects.get_or_create(
                subscription_type='daily', route=r,
                defaults={'price': Decimal('220'), 'effective_date': date.today()})
            PricingRule.objects.get_or_create(
                subscription_type='term', route=r,
                defaults={'price': Decimal('42000'), 'effective_date': date.today()})

        # ---- Payment methods + accounts ----
        instapay, _ = PaymentMethod.objects.get_or_create(code='instapay', defaults={'name': 'إنستا باي', 'name_en': 'InstaPay'})
        vodafone, _ = PaymentMethod.objects.get_or_create(code='vodafone', defaults={'name': 'فودافون كاش', 'name_en': 'Vodafone Cash'})
        PaymentAccount.objects.get_or_create(method=instapay, number='trips@instapay',
                                             defaults={'holder_name': 'شركة النقل', 'instructions': 'حوّل ثم ارفع صورة الإيصال.'})
        PaymentAccount.objects.get_or_create(method=vodafone, number='01000000000',
                                             defaults={'holder_name': 'شركة النقل', 'instructions': 'حوّل ثم ارفع صورة الإيصال.'})

        # ---- Vehicle types (tourism) ----
        for name, en, cap in [('ميكروباص', 'Microbus', 14), ('ميني باص', 'Minibus', 28), ('أتوبيس', 'Bus', 50)]:
            VehicleType.objects.get_or_create(name=name, defaults={'name_en': en, 'capacity': cap})

        # ---- Company settings ----
        s = CompanySettings.load()
        s.name = 'القاضي — ELKADY TRAVEL'
        s.tagline = 'نقل الطلاب والرحلات السياحية'
        s.phone = '01000000000'
        s.save()

        # ---- Demo users ----
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', '', 'admin123', role=User.Role.ADMIN,
                                          full_name='مدير النظام')
        for uname, role, name in [
            ('payments', User.Role.PAYMENT_OFFICER, 'مسؤول المدفوعات'),
            ('operations', User.Role.OPERATIONS, 'مشرف التشغيل'),
            ('tourism', User.Role.TOURISM_MANAGER, 'مدير السياحة'),
        ]:
            if not User.objects.filter(username=uname).exists():
                u = User(username=uname, role=role, full_name=name)
                u.set_password('demo1234')
                u.save()

        eru = University.objects.filter(name_en='Egyptian Russian University').first()
        if not User.objects.filter(username='student').exists():
            st = User(username='student', role=User.Role.STUDENT, full_name='طالب تجريبي',
                      national_id='30001010100000', phone='01111111111', university=eru)
            st.set_password('demo1234')
            st.save()

        self.stdout.write(self.style.SUCCESS('✔ Seeded transportation demo data.'))
