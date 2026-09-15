"""Normalize existing phone/email, resolve duplicates, then enforce DB-level
partial unique constraints on non-blank phone and email.

Duplicate resolution is non-destructive: the account with the most subscriptions
(tie → oldest) keeps the contact value; the others have that single field blanked
so no account or booking is deleted. Affected usernames are printed.
"""
import re

from django.db import migrations, models
from django.db.models import Q

_DIGIT_MAP = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')


def _norm_phone(v):
    if not v:
        return ''
    return re.sub(r'\s+', '', str(v).translate(_DIGIT_MAP)).strip()


def _norm_email(v):
    return (v or '').strip().lower()


def clean(apps, schema_editor):
    User = apps.get_model('users', 'User')
    Subscription = apps.get_model('bookings', 'Subscription')

    # 1) Normalize every stored value.
    for u in User.objects.all():
        np, ne = _norm_phone(u.phone), _norm_email(u.email)
        if np != u.phone or ne != u.email:
            u.phone, u.email = np, ne
            u.save(update_fields=['phone', 'email'])

    def sub_count(uid):
        return Subscription.objects.filter(student_id=uid).count()

    # 2) Resolve duplicates for each field, keeping the strongest account.
    for field in ('phone', 'email'):
        seen = {}
        for u in User.objects.exclude(**{field: ''}).order_by('id'):
            seen.setdefault(getattr(u, field), []).append(u)
        for value, users in seen.items():
            if len(users) < 2:
                continue
            # winner = most subscriptions, then oldest id
            winner = sorted(users, key=lambda x: (-sub_count(x.id), x.id))[0]
            losers = [x for x in users if x.id != winner.id]
            print(f"  تكرار {field}={value!r}: يُحتفظ بـ {winner.username}؛ "
                  f"يُفرَّغ الحقل من: {', '.join(x.username for x in losers)}")
            for x in losers:
                setattr(x, field, '')
                x.save(update_fields=[field])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0005_user_pickup_point_alter_user_address'),
        ('bookings', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(clean, noop),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.UniqueConstraint(
                condition=~Q(phone=''), fields=('phone',), name='uniq_user_phone_nonblank'),
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.UniqueConstraint(
                condition=~Q(email=''), fields=('email',), name='uniq_user_email_nonblank'),
        ),
    ]
