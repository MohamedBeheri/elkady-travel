"""List users that share the same phone or username (case-insensitive).

Usage:
    python manage.py find_duplicate_users
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.users.models import User


class Command(BaseCommand):
    help = 'Report duplicate phone numbers and duplicate usernames (case-insensitive).'

    def handle(self, *args, **options):
        # -------- Phones --------
        phone_dupes = (
            User.objects.exclude(phone='').values('phone')
            .annotate(c=Count('id')).filter(c__gt=1).order_by('-c')
        )
        self.stdout.write(self.style.MIGRATE_HEADING('\n== تكرارات رقم الهاتف =='))
        if not phone_dupes:
            self.stdout.write(self.style.SUCCESS('لا يوجد أي تكرار في أرقام الهاتف.'))
        else:
            for row in phone_dupes:
                self.stdout.write(f"\n  الهاتف: {row['phone']}  (عدد المستخدمين: {row['c']})")
                for u in User.objects.filter(phone=row['phone']).order_by('id'):
                    self.stdout.write(
                        f"    - id={u.id}  {u.username}  |  {u.full_name}  |  {u.get_role_display()}"
                    )

        # -------- Usernames (case-insensitive) --------
        groups = defaultdict(list)
        for u in User.objects.all().only('id', 'username', 'full_name', 'phone', 'role'):
            groups[(u.username or '').lower()].append(u)
        uname_dupes = {k: v for k, v in groups.items() if k and len(v) > 1}
        self.stdout.write(self.style.MIGRATE_HEADING('\n== تكرارات اسم المستخدم (case-insensitive) =='))
        if not uname_dupes:
            self.stdout.write(self.style.SUCCESS('لا يوجد أي تكرار في أسماء المستخدمين.'))
        else:
            for key, users in uname_dupes.items():
                self.stdout.write(f"\n  اسم المستخدم: {key}  (عدد: {len(users)})")
                for u in users:
                    self.stdout.write(
                        f"    - id={u.id}  {u.username}  |  {u.full_name}  |  هاتف: {u.phone}"
                    )

        self.stdout.write('')
