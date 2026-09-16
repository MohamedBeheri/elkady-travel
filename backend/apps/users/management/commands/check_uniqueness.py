"""Diagnose account/subscription duplication and whether DB constraints are live.

Usage:
    python manage.py check_uniqueness
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Count

from apps.users.models import User


class Command(BaseCommand):
    help = 'Report DB unique constraints, duplicate accounts, and duplicate term/monthly subscriptions.'

    def handle(self, *args, **options):
        # 1) Are the DB constraints actually applied?
        self.stdout.write(self.style.MIGRATE_HEADING('\n== قيود قاعدة البيانات =='))
        vendor = connection.vendor
        names = []
        with connection.cursor() as cur:
            if vendor == 'sqlite':
                cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'uniq_user%'")
                names = [r[0] for r in cur.fetchall()]
            else:  # postgres
                cur.execute("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uniq_user%'")
                names = [r[0] for r in cur.fetchall()]
        for want in ('uniq_user_phone_nonblank', 'uniq_user_email_nonblank'):
            ok = want in names
            self.stdout.write(('  ✔ موجود: ' if ok else '  ✖ مفقود — شغّل migrate: ') + want)

        # 2) Duplicate ACCOUNTS by phone / email.
        self.stdout.write(self.style.MIGRATE_HEADING('\n== حسابات مكررة (نفس الهاتف/البريد) =='))
        any_acc = False
        for field, label in (('phone', 'الهاتف'), ('email', 'البريد')):
            dupes = (User.objects.exclude(**{field: ''}).values(field)
                     .annotate(c=Count('id')).filter(c__gt=1).order_by('-c'))
            for row in dupes:
                any_acc = True
                users = User.objects.filter(**{field: row[field]}).order_by('id')
                self.stdout.write(f"  {label}={row[field]} → {row['c']} حسابات: "
                                  + '، '.join(f'{u.username}(id={u.id})' for u in users))
        if not any_acc:
            self.stdout.write(self.style.SUCCESS('  لا يوجد — كل حساب برقم/بريد فريد ✔'))

        # 3) Duplicate SUBSCRIPTIONS (same student, same term/monthly, still live).
        self.stdout.write(self.style.MIGRATE_HEADING('\n== اشتراكات ترم/شهري مكررة لنفس الطالب =='))
        from apps.bookings.models import Subscription
        live = Subscription.objects.filter(
            subscription_type__in=['term', 'monthly'],
            status__in=[Subscription.Status.PAYMENT_PENDING, Subscription.Status.PAYMENT_SUBMITTED,
                        Subscription.Status.UNDER_REVIEW, Subscription.Status.CONFIRMED],
        ).select_related('student')
        groups = defaultdict(list)
        for s in live:
            groups[(s.student_id, s.subscription_type)].append(s)
        any_sub = False
        for (sid, stype), subs in groups.items():
            if len(subs) > 1:
                any_sub = True
                st = subs[0].student
                self.stdout.write(f"  {st.full_name or st.username} ({st.phone}) — {stype}: "
                                  f"{len(subs)} اشتراكات (ids: {', '.join(str(x.id) for x in subs)})")
        if not any_sub:
            self.stdout.write(self.style.SUCCESS('  لا يوجد — لا اشتراكات مكررة قائمة ✔'))
        self.stdout.write('')
