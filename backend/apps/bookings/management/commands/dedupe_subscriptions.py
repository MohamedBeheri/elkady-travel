"""Cancel duplicate live term/monthly subscriptions, keeping one per student.

Non-destructive: extras are set to CANCELLED (not deleted), and any active term
seat lock they hold is released. The kept one per (student, type) is the strongest:
CONFIRMED first, then the most recent.

Usage:
    python manage.py dedupe_subscriptions            # preview only
    python manage.py dedupe_subscriptions --apply     # actually cancel
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.bookings.models import Subscription

LIVE = [
    Subscription.Status.PAYMENT_PENDING, Subscription.Status.PAYMENT_SUBMITTED,
    Subscription.Status.UNDER_REVIEW, Subscription.Status.CONFIRMED,
]
# Higher rank = keep. Confirmed wins; then by recency (id) as a tiebreaker.
RANK = {
    Subscription.Status.CONFIRMED: 3,
    Subscription.Status.UNDER_REVIEW: 2,
    Subscription.Status.PAYMENT_SUBMITTED: 2,
    Subscription.Status.PAYMENT_PENDING: 1,
}


class Command(BaseCommand):
    help = 'Cancel duplicate live term/monthly subscriptions (keep the strongest per student).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually cancel; otherwise preview only.')

    def handle(self, *args, **options):
        apply = options['apply']
        groups = defaultdict(list)
        for s in Subscription.objects.filter(
                subscription_type__in=['term', 'monthly'], status__in=LIVE).select_related('student'):
            groups[(s.student_id, s.subscription_type)].append(s)

        to_cancel = []
        for (sid, stype), subs in groups.items():
            if len(subs) < 2:
                continue
            # keep = highest rank, then most recent id
            keep = sorted(subs, key=lambda x: (RANK.get(x.status, 0), x.id))[-1]
            losers = [x for x in subs if x.id != keep.id]
            st = keep.student
            self.stdout.write(
                f"{st.full_name or st.username} ({st.phone}) — {stype}: "
                f"يبقى id={keep.id} ({keep.status})؛ يُلغى: "
                + '، '.join(f'id={x.id}({x.status})' for x in losers))
            to_cancel.extend(losers)

        if not to_cancel:
            self.stdout.write(self.style.SUCCESS('لا توجد اشتراكات مكررة قائمة ✔'))
            return

        if not apply:
            self.stdout.write(self.style.WARNING(
                f'\nمعاينة فقط: {len(to_cancel)} اشتراك سيُلغى. أضف --apply للتنفيذ.'))
            return

        from apps.operations.models import TermSeatLock
        with transaction.atomic():
            for s in to_cancel:
                # Free any seat this duplicate was holding.
                TermSeatLock.objects.filter(subscription=s, active=True).update(active=False)
                s.status = Subscription.Status.CANCELLED
                s.save(update_fields=['status'])
        self.stdout.write(self.style.SUCCESS(f'\n✓ تم إلغاء {len(to_cancel)} اشتراك مكرر (بدون حذف).'))
