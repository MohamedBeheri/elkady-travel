"""Subscription lifecycle: closing monthly subscriptions once their period ends."""
from django.db import transaction
from django.utils import timezone

from .models import MONTHLY_DAYS, Subscription


def due_for_expiry(today=None):
    today = today or timezone.localdate()
    return (Subscription.objects
            .filter(status=Subscription.Status.CONFIRMED, valid_until__isnull=False, valid_until__lt=today)
            .select_related('student', 'route'))


def expire_subscription(sub):
    """Close one subscription: status EXPIRED + free its standing seats.
    Returns False when someone else already closed it (safe to call twice)."""
    from apps.notifications.models import notify
    from apps.operations.models import TermSeatLock
    with transaction.atomic():
        closed = Subscription.objects.filter(pk=sub.pk, status=Subscription.Status.CONFIRMED) \
            .update(status=Subscription.Status.EXPIRED, updated_at=timezone.now())
        if not closed:
            return False
        TermSeatLock.objects.filter(subscription=sub, active=True).update(active=False)
    notify(sub.student, 'انتهى اشتراكك',
           f'انتهى اشتراك {sub.get_subscription_type_display()} على {sub.route} يوم {sub.valid_until}. '
           f'جدّد الاشتراك من «احجز» لتحصل على مقعدك من جديد.',
           link='/bookings', severity='warning')
    return True


def expire_due_subscriptions(today=None):
    """Close every confirmed subscription whose valid_until has passed."""
    return [sub for sub in due_for_expiry(today) if expire_subscription(sub)]


@transaction.atomic
def extend_subscription(sub, days=MONTHLY_DAYS):
    """Admin renews a monthly subscription (e.g. paid for another month in
    cash): push valid_until forward and, if it had already closed, reopen it
    and give back seats. Returns the seats that could not be re-assigned."""
    from apps.operations.services import fill_missing_subscription_seats
    sub = Subscription.objects.select_for_update().get(pk=sub.pk)
    today = timezone.localdate()
    base = sub.valid_until if sub.valid_until and sub.valid_until >= today else today
    sub.valid_until = base + timezone.timedelta(days=days)
    reopened = sub.status == Subscription.Status.EXPIRED
    if reopened:
        sub.status = Subscription.Status.CONFIRMED
    sub.save(update_fields=['valid_until', 'status', 'updated_at'])
    missing = []
    if reopened:
        made = fill_missing_subscription_seats(sub)
        missing = [k for k, v in made.items() if not v]
    return sub, missing
