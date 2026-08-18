from django.db import models
from django.utils.translation import gettext_lazy as _

# Priority ranking for daily seat allocation (RULE 1/2/3): lower = higher priority.
PRIORITY_RANK = {'term': 0, 'monthly': 1, 'daily': 2}


class DailyTrip(models.Model):
    """One operational morning trip: a date × route × departure time, with capacity."""
    date = models.DateField(verbose_name=_('التاريخ'))
    route = models.ForeignKey(
        'config_app.Route', on_delete=models.CASCADE, related_name='daily_trips',
        verbose_name=_('المسار'),
    )
    morning_slot = models.ForeignKey(
        'config_app.MorningSlot', on_delete=models.CASCADE, related_name='daily_trips',
        verbose_name=_('الموعد'),
    )
    layout = models.CharField(max_length=12, default='bus50', verbose_name=_('نوع المركبة'))
    total_seats = models.PositiveIntegerField(default=49, verbose_name=_('إجمالي المقاعد'))
    allocated_at = models.DateTimeField(null=True, blank=True, verbose_name=_('وقت التخصيص'))

    class Meta:
        verbose_name = _('رحلة يومية')
        verbose_name_plural = _('الرحلات اليومية')
        unique_together = [('date', 'route', 'morning_slot')]
        ordering = ['date', 'morning_slot', 'route']

    def __str__(self):
        return f'{self.date} {self.morning_slot} - {self.route}'

    @property
    def confirmed_count(self):
        return self.seat_requests.filter(status=SeatRequest.Status.CONFIRMED).count()

    @property
    def waiting_count(self):
        return self.seat_requests.filter(status=SeatRequest.Status.WAITING).count()

    @property
    def available_seats(self):
        return max(self.total_seats - self.confirmed_count, 0)


class SeatRequest(models.Model):
    """A student's request/booking for a seat on a daily trip.

    Ordered by priority then timestamp for capacity purposes; when the student
    picks a physical seat it is stored in ``seat_number``. A HELD booking is a
    seat reserved pending payment confirmation (معلق); CONFIRMED means the money
    arrived and a QR ticket is issued.
    """

    class Status(models.TextChoices):
        WAITING = 'waiting', _('قائمة انتظار')
        HELD = 'held', _('معلق (بانتظار الدفع)')
        CONFIRMED = 'confirmed', _('مؤكد')
        CANCELLED = 'cancelled', _('ملغي')

    daily_trip = models.ForeignKey(
        DailyTrip, on_delete=models.CASCADE, related_name='seat_requests',
        verbose_name=_('الرحلة'),
    )
    student = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='seat_requests',
        verbose_name=_('الطالب'),
    )
    subscription = models.ForeignKey(
        'bookings.Subscription', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='seat_requests', verbose_name=_('الاشتراك'),
    )
    # Snapshot of the plan used, so priority is stable even if the subscription changes.
    priority_type = models.CharField(max_length=10, default='daily', verbose_name=_('نوع الأولوية'))
    university = models.ForeignKey(
        'config_app.University', on_delete=models.PROTECT, related_name='seat_requests',
        verbose_name=_('الجامعة'),
    )
    pickup_point = models.ForeignKey(
        'config_app.PickupPoint', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='seat_requests', verbose_name=_('نقطة الالتقاط'),
    )
    status = models.CharField(
        max_length=12, choices=Status.choices,
        default=Status.WAITING, verbose_name=_('الحالة'),
    )
    seat_number = models.PositiveIntegerField(null=True, blank=True, verbose_name=_('رقم المقعد'))
    qr_token = models.CharField(max_length=40, blank=True, verbose_name=_('رمز التذكرة'))
    requested_at = models.DateTimeField(auto_now_add=True, verbose_name=_('وقت الطلب'))
    queue_position = models.PositiveIntegerField(null=True, blank=True, verbose_name=_('ترتيب الطابور'))

    class Meta:
        verbose_name = _('طلب مقعد')
        verbose_name_plural = _('طلبات المقاعد')
        unique_together = [('daily_trip', 'student')]
        ordering = ['requested_at']

    def __str__(self):
        return f'{self.student} - {self.daily_trip} ({self.get_status_display()})'

    @property
    def priority_rank(self):
        return PRIORITY_RANK.get(self.priority_type, 9)


class TermSeatLock(models.Model):
    """A term subscriber's permanent seat on a route + morning slot.

    The seat stays locked on every daily trip for that route/slot until an admin
    revokes it. Per-day release (student absent) is handled by SeatAbsence.
    """
    student = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='term_seats',
        verbose_name=_('الطالب'),
    )
    subscription = models.ForeignKey(
        'bookings.Subscription', on_delete=models.CASCADE, related_name='term_seats',
        verbose_name=_('الاشتراك'),
    )
    route = models.ForeignKey('config_app.Route', on_delete=models.CASCADE, verbose_name=_('المسار'))
    morning_slot = models.ForeignKey('config_app.MorningSlot', on_delete=models.CASCADE, verbose_name=_('الموعد'))
    seat_number = models.PositiveIntegerField(verbose_name=_('رقم المقعد'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('مقعد ترم مقفول')
        verbose_name_plural = _('مقاعد الترم المقفولة')
        constraints = [
            models.UniqueConstraint(
                fields=['route', 'morning_slot', 'seat_number'],
                condition=models.Q(active=True),
                name='uniq_active_term_seat',
            ),
        ]

    def __str__(self):
        return f'{self.student} - مقعد {self.seat_number} ({self.route})'


class SeatAbsence(models.Model):
    """Admin-declared absence that frees a term seat for one specific date only."""
    term_lock = models.ForeignKey(
        TermSeatLock, on_delete=models.CASCADE, related_name='absences',
        verbose_name=_('مقعد الترم'),
    )
    date = models.DateField(verbose_name=_('التاريخ'))
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, verbose_name=_('بواسطة'),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('غياب مقعد')
        verbose_name_plural = _('غيابات المقاعد')
        unique_together = [('term_lock', 'date')]

    def __str__(self):
        return f'{self.term_lock} غائب {self.date}'


class ReturnBooking(models.Model):
    """A student's return-trip reservation on a return slot (with its own capacity)."""

    class Status(models.TextChoices):
        CONFIRMED = 'confirmed', _('مؤكد')
        CANCELLED = 'cancelled', _('ملغي')

    student = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='return_bookings',
        verbose_name=_('الطالب'),
    )
    date = models.DateField(verbose_name=_('التاريخ'))
    return_slot = models.ForeignKey(
        'config_app.ReturnSlot', on_delete=models.CASCADE, related_name='bookings',
        verbose_name=_('موعد العودة'),
    )
    university = models.ForeignKey(
        'config_app.University', on_delete=models.PROTECT, related_name='return_bookings',
        verbose_name=_('الجامعة'),
    )
    status = models.CharField(
        max_length=12, choices=Status.choices,
        default=Status.CONFIRMED, verbose_name=_('الحالة'),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('حجز عودة')
        verbose_name_plural = _('حجوزات العودة')
        ordering = ['date', 'return_slot']

    def __str__(self):
        return f'{self.student} - {self.date} {self.return_slot}'
