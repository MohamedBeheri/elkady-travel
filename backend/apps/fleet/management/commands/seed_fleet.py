"""Seed the detailed routes (with ordered pickup points) + fleet demo data."""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.config_app.models import Destination, PickupPoint, Route
from apps.fleet.models import Driver, MaintenanceRecord, TrafficFine, TripExpense, Vehicle, VehicleAssignment
from apps.users.models import User

ROUTE1 = [
    'النساجون', 'إشارة المرور', 'شارع دبي', 'مساكن حمدي قنديل', 'البشاير', 'أول شارع باريس',
    'ماسبيرو', 'إشارة المحافظ', 'دلتا ماركت', 'الرمد', 'تحت الكوبري العلوي', 'ميدان شرف',
    'صيدلية المنوفية', 'قرية العلياء', 'عمر أفندي', 'فودافون', 'السيدة عائشة',
    'ساير داير كوبري مبارك', 'موفي مون',
    'المصيلحة', 'مفارق زوير', 'مفارق سلكا', 'البرج ميت خلف', 'كوبري العطف', 'المدرسة',
    'كمين ميت أبو شيخة', 'كفر أبو الحسن', 'طه شبرا', 'شمانديل',
    'ميدان سليمان متولي', 'الزراعة', 'صيدلية ميدو', 'المركز', 'العجواني', 'أول شارع الساحة', 'سور المحكمة',
    'كفر الشيخ إبراهيم', 'الخضراوية', 'عرب الرمل', 'أجهور',
    'سلم الفحص', 'كوبري مفارق المنصورة', 'سلم الإقليمي ميت بره',
    'السعديين', 'بني صالح', 'النعامنة', 'منشية السلام', 'السعدية', 'تل روزن', 'البلاشون',
]
ROUTE2 = [
    'المطحن', 'شنوان', 'كوم الضبع', 'شبرا زنجا', 'أول كوبري الباجور', 'آخر كوبري الباجور',
    'المركز', 'شارع بنها', 'المهندس للسيارات', 'بي العرب', 'طلعة الإقليمي',
]


class Command(BaseCommand):
    help = 'Seed detailed routes with ordered pickup points + fleet demo data.'

    def handle(self, *args, **opts):
        dest, _ = Destination.objects.get_or_create(code='BADR', defaults={'name': 'بدر', 'name_en': 'Badr'})

        def make_route(code, origin, name, points):
            r, _ = Route.objects.get_or_create(
                code=code, defaults={'origin_label': origin, 'name': name, 'destination': dest})
            for i, p in enumerate(points, start=1):
                PickupPoint.objects.get_or_create(route=r, sequence=i, defaults={'name': p})
            self.stdout.write(f'  {name}: {r.pickup_points.count()} نقطة')
            return r

        r1 = make_route('SHEBIN_REGIONAL', 'شبين/قويسنا/بنها', 'شبين → قويسنا → بنها → الإقليمي', ROUTE1)
        make_route('BAGOUR_REGIONAL', 'الباجور', 'الباجور → الطريق الإقليمي', ROUTE2)

        # ---- Fleet demo ----
        vehicles = []
        for plate, brand, model, cap in [('ELK-1234', 'Toyota', 'Coaster', 28), ('ELK-5678', 'MAN', 'Lion', 49),
                                          ('ELK-9012', 'Toyota', 'HiAce', 15), ('ELK-3456', 'Mercedes', 'Travego', 49)]:
            v, _ = Vehicle.objects.get_or_create(plate_number=plate, defaults={
                'brand': brand, 'model': model, 'capacity': cap, 'vehicle_type': 'أتوبيس',
                'license_number': f'LIC-{plate[-4:]}', 'year': 2021,
                'license_expiry': date.today() + timedelta(days=200)})
            vehicles.append(v)

        drivers = []
        for i, name in enumerate(['أحمد محمد القاضي', 'محمود السيد', 'كريم عبد الرحمن', 'مصطفى حسين'], start=1):
            uname = f'driver{i}'
            u, created = User.objects.get_or_create(username=uname, defaults={
                'role': User.Role.DRIVER, 'full_name': name, 'phone': f'0100000000{i}'})
            if created:
                u.set_password('demo1234'); u.save()
            else:
                u.role = User.Role.DRIVER; u.save(update_fields=['role'])
            d, _ = Driver.objects.get_or_create(user=u, defaults={
                'full_name': name, 'phone': u.phone, 'license_number': f'DL-{1000+i}',
                'license_type': 'first', 'license_expiry': date.today() + timedelta(days=25 if i == 1 else 300)})
            drivers.append(d)

        # Today's assignments (demo)
        today = timezone.localdate()
        for idx, d in enumerate(drivers[:3]):
            VehicleAssignment.objects.get_or_create(
                date=today, driver=d, vehicle=vehicles[idx],
                defaults={'route': r1, 'status': 'planned'})

        # Sample expenses (pending + approved) for the first vehicle/driver
        admin = User.objects.filter(role='admin').first()
        if not TripExpense.objects.exists():
            TripExpense.objects.create(kind='fuel', vehicle=vehicles[0], driver=drivers[0], amount=Decimal('850'), quantity=Decimal('40'), description='تعبئة وقود', status='approved', reviewed_by=admin, review_date=timezone.now())
            TripExpense.objects.create(kind='tolls', vehicle=vehicles[0], driver=drivers[0], amount=Decimal('60'), description='كارتة الطريق', status='pending')
            TripExpense.objects.create(kind='other', vehicle=vehicles[1], driver=drivers[1], amount=Decimal('120'), expense_type='غسيل', description='غسيل المركبة', status='pending')
            MaintenanceRecord.objects.create(vehicle=vehicles[0], maintenance_type='تغيير زيت', amount=Decimal('900'), is_workshop=False)
            MaintenanceRecord.objects.create(vehicle=vehicles[1], workshop_name='ورشة النصر', maintenance_type='فرامل', amount=Decimal('1500'), is_workshop=True)
            TrafficFine.objects.create(vehicle=vehicles[0], driver=drivers[0], amount=Decimal('300'), reason='تجاوز السرعة')

        self.stdout.write(self.style.SUCCESS(
            f'✔ Fleet seeded: routes(2 مفصّلة) · vehicles {Vehicle.objects.count()} · drivers {Driver.objects.count()}'))
