"""نسخ نقاط الالتقاط من مسار إلى آخر (اختياراً بمركز محدد).

الاستخدام:
    python manage.py copy_pickup_points --from 5 --to 2
    python manage.py copy_pickup_points --from 5 --to 2 --center shebin
    python manage.py copy_pickup_points --from 5 --to 2 --center shebin --copy-times
    python manage.py copy_pickup_points --from 5 --to 2 --dry-run

يمكن استخدام كود المسار بدل الـID:
    python manage.py copy_pickup_points --from-code R_BADR --to-code R_SHOROUK
"""
import re
import unicodedata

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.config_app.models import PickupPoint, PickupTime, Route


def _norm(s: str) -> str:
    s = unicodedata.normalize('NFKC', s or '').strip()
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn' and c != 'ـ')
    return re.sub(r'\s+', ' ', s)


class Command(BaseCommand):
    help = 'نسخ نقاط الالتقاط من مسار إلى مسار آخر (يتجاهل النقاط الموجودة أصلاً بنفس الاسم والمركز).'

    def add_arguments(self, parser):
        parser.add_argument('--from', dest='src', type=int, help='ID مسار المصدر')
        parser.add_argument('--to', dest='dst', type=int, help='ID مسار الهدف')
        parser.add_argument('--from-code', dest='src_code', help='كود مسار المصدر (بديل عن --from)')
        parser.add_argument('--to-code', dest='dst_code', help='كود مسار الهدف (بديل عن --to)')
        parser.add_argument('--center', help='قصر النقل على مركز معين (shebin/quesna/bagour/benha)')
        parser.add_argument('--copy-times', action='store_true',
                            help='نسخ مواعيد النقاط أيضاً (لكل موعد ذهاب/عودة موجود على نقطة المصدر)')
        parser.add_argument('--dry-run', action='store_true', help='عرض ما سيُنسخ دون تنفيذ')

    def _resolve(self, id_arg, code_arg, label):
        if id_arg:
            try:
                return Route.objects.get(pk=id_arg)
            except Route.DoesNotExist:
                raise CommandError(f'مسار {label} بالـID {id_arg} غير موجود')
        if code_arg:
            try:
                return Route.objects.get(code=code_arg)
            except Route.DoesNotExist:
                raise CommandError(f'مسار {label} بالكود «{code_arg}» غير موجود')
        raise CommandError(f'حدّد --{label.lower()} أو --{label.lower()}-code')

    @transaction.atomic
    def handle(self, *args, **opts):
        src = self._resolve(opts['src'], opts.get('src_code'), 'from')
        dst = self._resolve(opts['dst'], opts.get('dst_code'), 'to')
        if src.pk == dst.pk:
            raise CommandError('لا يمكن نسخ المسار على نفسه')

        center = opts.get('center')
        copy_times = opts.get('copy_times')
        dry = opts.get('dry_run')

        src_qs = PickupPoint.objects.filter(route=src)
        if center:
            src_qs = src_qs.filter(center=center)
        src_qs = src_qs.order_by('sequence', 'id')

        # النقاط الموجودة على الهدف — للفلترة بالاسم+المركز بعد التطبيع
        existing = {(p.center or '', _norm(p.name)): p
                    for p in PickupPoint.objects.filter(route=dst)}

        created = 0
        skipped = 0
        times_created = 0

        self.stdout.write(self.style.NOTICE(
            f'\n{"[محاكاة]" if dry else "[تنفيذ]"} '
            f'نسخ من «{src.name}» إلى «{dst.name}»'
            f'{" — مركز " + center if center else ""}'
        ))
        self.stdout.write(f'إجمالي النقاط المرشحة على المصدر: {src_qs.count()}\n')

        for p in src_qs:
            key = (p.center or '', _norm(p.name))
            if key in existing:
                skipped += 1
                self.stdout.write(f'  ⊘ موجود بالفعل: {p.name} ({p.get_center_display()})')
                continue

            if dry:
                created += 1
                self.stdout.write(self.style.SUCCESS(
                    f'  + {p.sequence}. {p.name} ({p.get_center_display()})'))
                continue

            new_p = PickupPoint.objects.create(
                route=dst,
                center=p.center,
                name=p.name,
                location=p.location,
                sequence=p.sequence,
                active=p.active,
            )
            created += 1
            self.stdout.write(self.style.SUCCESS(
                f'  + [#{new_p.id}] {new_p.sequence}. {new_p.name}'))

            if copy_times:
                for t in PickupTime.objects.filter(pickup_point=p):
                    PickupTime.objects.create(
                        pickup_point=new_p,
                        direction=t.direction,
                        morning_slot=t.morning_slot,
                        return_slot=t.return_slot,
                        time=t.time,
                    )
                    times_created += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'تمت العملية: أُنشئ {created} نقطة، تم تخطي {skipped} موجودة'
            + (f'، ونُقل {times_created} موعد نقطة' if copy_times else '')
        ))
        if dry:
            self.stdout.write(self.style.WARNING('(محاكاة — لم يُحفظ شيء)'))
