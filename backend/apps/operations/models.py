from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

# Priority ranking for daily seat allocation (RULE 1/2/3): lower = higher priority.
PRIORITY_RANK = {'term': 0, 'monthly': 1, 'daily': 2}


class DailyTrip(models.Model):
    """One operational trip: a date × route × slot, with capacity.

    ``direction`` distinguishes the morning going trip (uses ``morning_slot``)
    from the return trip (uses ``return_slot``). Both directions share the same
    seat-map / allocation machinery.
    """

    class Direction(models.TextChoices):
        GO = 'go', _('ذهاب')
        RETURN = 'return', _('عودة')

    date = models.DateField(verbose_name=_('التاريخ'))
    route = models.ForeignKey(
        'config_app.Route', on_delete=models.CASCADE, related_name='daily_trips',
        verbose_name=_('المسار'),
    )
    direction = models.CharField(
        max_length=6, choices=Direction.choices, default=Direction.GO,
        verbose_name=_('الاتجاه'),
    )
    morning_slot = models.ForeignKey(
        'config_app.MorningSlot', on_delete=models.CASCADE, related_name='daily_trips',
        null=True, blank=True, verbose_name=_('موعد الذهاب'),
    )
    return_slot = models.ForeignKey(
        'config_app.ReturnSlot', on_delete=models.CASCADE, related_name='daily_trips',
        null=True, blank=True, verbose_name=_('موعد العودة'),
    )
    layout = models.CharField(max_length=12, default='bus50', verbose_name=_('نوع المركبة'))
    total_seats = models.PositiveIntegerField(default=49, verbose_name=_('إجمالي المقاعد'))
    allocated_at = models.DateTimeField(null=True, blank=True, verbose_name=_('وقت التخصيص'))

    class Meta:
        verbose_name = _('رحلة يومية')
        verbose_name_plural = _('الرحلات اليومية')
        constraints = [
            models.UniqueConstraint(
                fields=['date', 'route', 'morning_slot'],
                condition=Q(direction='go'), name='uniq_go_trip'),
            models.UniqueConstraint(
                fields=['date', 'route', 'return_slot'],
                condition=Q(direction='return'), name='uniq_return_trip'),
        ]
        ordering = ['date', 'morning_slot', 'route']

    @property
    def slot_label(self):
        """Human name of the slot for either direction (safe when one is null)."""
        if self.direction == self.Direction.RETURN and self.return_slot_id:
            return self.return_slot.name
        return self.morning_slot.name if self.morning_slot_id else '—'

    def __str__(self):
        return f'{self.date} {self.slot_label} - {self.route} ({self.get_direction_display()})'

    @property
    def confirmed_count(self):
        return self.seat_requests.filter(status=SeatRequest.Status.CONFIRMED).count()

    @property
    def waiting_count(self):
        return self.seat_requests.filter(status=SeatRequest.Status.WAITING).count()

    @property
    def _capacity_row(self):
        """The live SeatCapacity config row governing this trip, if any.

        Capacity is configured per (route, morning_slot). A going trip is keyed
        directly on its morning_slot. A return trip has no morning_slot, so it
        inherits the config of its paired going slot when one is set, otherwise
        it keeps its own snapshot.
        """
        from apps.config_app.models import SeatCapacity
        slot_id = self.morning_slot_id
        if not slot_id:
            return None
        return SeatCapacity.objects.filter(route_id=self.route_id, morning_slot_id=slot_id).first()

    @property
    def effective_capacity(self):
        """Live total-seat count: follows the admin config, falling back to the
        snapshot stored on the trip when no config row exists (e.g. return trips).
        """
        cap = self._capacity_row
        return cap.total_seats if cap else self.total_seats

    @property
    def available_seats(self):
        return max(self.effective_capacity - self.confirmed_count, 0)


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
    """A term/monthly subscriber's permanent seat on a route + slot.

    Applies to both directions: ``direction='go'`` locks a seat on ``morning_slot``,
    ``direction='return'`` on ``return_slot``. The seat stays locked on every daily
    trip for that route/slot/direction until an admin revokes it (``active=False``).
    Per-day release (student not attending) is handled by SeatAbsence.
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
    direction = models.CharField(
        max_length=6, choices=DailyTrip.Direction.choices, default=DailyTrip.Direction.GO,
        verbose_name=_('الاتجاه'),
    )
    morning_slot = models.ForeignKey(
        'config_app.MorningSlot', on_delete=models.CASCADE, null=True, blank=True,
        verbose_name=_('موعد الذهاب'))
    return_slot = models.ForeignKey(
        'config_app.ReturnSlot', on_delete=models.CASCADE, null=True, blank=True,
        related_name='term_seats', verbose_name=_('موعد العودة'))
    seat_number = models.PositiveIntegerField(verbose_name=_('رقم المقعد'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('مقعد مشترك مقفول')
        verbose_name_plural = _('مقاعد المشتركين المقفولة')
        constraints = [
            models.UniqueConstraint(
                fields=['route', 'morning_slot', 'seat_number'],
                condition=models.Q(active=True, direction='go'),
                name='uniq_active_term_seat',
            ),
            models.UniqueConstraint(
                fields=['route', 'return_slot', 'seat_number'],
                condition=models.Q(active=True, direction='return'),
                name='uniq_active_return_term_seat',
            ),
        ]

    @property
    def slot_label(self):
        if self.direction == 'return' and self.return_slot_id:
            return self.return_slot.name
        return self.morning_slot.name if self.morning_slot_id else '—'

    def __str__(self):
        return f'{self.student} - مقعد {self.seat_number} ({self.route} {self.get_direction_display()})'


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


class AttendanceConfirmation(models.Model):
    """Explicit 'I will attend' declared by a term/monthly rider for one date.

    Distinguishes a student who actively confirmed from one who never opened
    the attendance page at all — used only once the daily attendance lock time
    (CompanySettings.attendance_lock_time) has passed, at which point silence
    is treated as absent (a SeatAbsence is auto-created) so the freed seat can
    go to the daily waiting list. See services.auto_close_attendance.
    """
    term_lock = models.ForeignKey(
        TermSeatLock, on_delete=models.CASCADE, related_name='confirmations',
        verbose_name=_('مقعد الترم'),
    )
    date = models.DateField(verbose_name=_('التاريخ'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('تأكيد حضور')
        verbose_name_plural = _('تأكيدات الحضور')
        unique_together = [('term_lock', 'date')]

    def __str__(self):
        return f'{self.term_lock} أكّد حضوره {self.date}'


class DailySlotChoice(models.Model):
    """Per-day slot pick for a subscriber whose lock is on a different (default) slot.

    A term/monthly seat lock is bound to a *default* slot. If on a given day the
    student prefers a different slot (their point serves 06:00 and 09:00 and they
    pick 09:00 this once), we store the chosen slot here for that date + direction.
    The seat map / manifest / ticket read this to move the student between trips
    for that day only. The original lock's default slot is treated as absent for
    that day so no one is double-booked.
    """
    term_lock = models.ForeignKey(
        TermSeatLock, on_delete=models.CASCADE, related_name='slot_choices',
        verbose_name=_('المقعد الثابت'))
    date = models.DateField(verbose_name=_('التاريخ'))
    morning_slot = models.ForeignKey(
        'config_app.MorningSlot', on_delete=models.CASCADE, null=True, blank=True,
        verbose_name=_('موعد الذهاب'))
    return_slot = models.ForeignKey(
        'config_app.ReturnSlot', on_delete=models.CASCADE, null=True, blank=True,
        verbose_name=_('موعد العودة'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('اختيار سلوت يومي')
        verbose_name_plural = _('اختيارات السلوت اليومية')
        unique_together = [('term_lock', 'date')]

    def __str__(self):
        s = self.morning_slot or self.return_slot
        return f'{self.term_lock} → {s} @ {self.date}'


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
    route = models.ForeignKey(
        'config_app.Route', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='return_bookings', verbose_name=_('المسار'),
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
