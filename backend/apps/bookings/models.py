from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.config_app.models import SUBSCRIPTION_TYPES


class Subscription(models.Model):
    """A student's booking + payment record for a term / monthly / daily plan.

    A CONFIRMED term/monthly subscription places the student on the priority
    list for daily seat allocation on their route (RULE 1/2). Payment always
    requires admin verification (RULE 12/13).
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', _('مسودة')
        PAYMENT_PENDING = 'payment_pending', _('بانتظار الدفع')
        PAYMENT_SUBMITTED = 'payment_submitted', _('تم رفع إثبات الدفع')
        UNDER_REVIEW = 'under_review', _('قيد المراجعة')
        CONFIRMED = 'confirmed', _('مؤكد')
        REJECTED = 'rejected', _('مرفوض')
        CANCELLED = 'cancelled', _('ملغي')
        EXPIRED = 'expired', _('منتهي')

    student = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='subscriptions',
        verbose_name=_('الطالب'),
    )
    subscription_type = models.CharField(
        max_length=15, choices=SUBSCRIPTION_TYPES, verbose_name=_('نوع الاشتراك'),
    )
    route = models.ForeignKey(
        'config_app.Route', on_delete=models.PROTECT, related_name='subscriptions',
        verbose_name=_('المسار'),
    )
    university = models.ForeignKey(
        'config_app.University', on_delete=models.PROTECT, related_name='subscriptions',
        verbose_name=_('الجامعة'),
    )
    pickup_point = models.ForeignKey(
        'config_app.PickupPoint', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='subscriptions', verbose_name=_('نقطة الالتقاط'),
    )
    # For term/monthly the student picks the exact daily slots (going + return)
    # they intend to use — carried over into the fixed-seat lock so the QR/ticket
    # always shows their real pickup/drop-off time.
    morning_slot = models.ForeignKey(
        'config_app.MorningSlot', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='subscriptions', verbose_name=_('موعد الذهاب'),
    )
    return_slot = models.ForeignKey(
        'config_app.ReturnSlot', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='subscriptions', verbose_name=_('موعد العودة'),
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name=_('المبلغ'))
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.PAYMENT_PENDING, verbose_name=_('الحالة'),
    )

    # ---- Payment proof (RULE 12: screenshot ≠ verified) ----
    payment_method = models.ForeignKey(
        'config_app.PaymentMethod', on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name=_('وسيلة الدفع'),
    )
    payment_reference = models.CharField(max_length=120, blank=True, verbose_name=_('مرجع التحويل'))
    payment_proof = models.ImageField(
        upload_to='payments/', null=True, blank=True, verbose_name=_('إثبات الدفع'),
    )
    submitted_at = models.DateTimeField(null=True, blank=True, verbose_name=_('وقت رفع الإثبات'))
    verified_at = models.DateTimeField(null=True, blank=True, verbose_name=_('وقت التأكيد'))
    verified_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='verified_subscriptions', verbose_name=_('تم التأكيد بواسطة'),
    )
    rejection_reason = models.CharField(max_length=255, blank=True, verbose_name=_('سبب الرفض'))

    whatsapp_notified_at = models.DateTimeField(null=True, blank=True, verbose_name=_('آخر إشعار واتساب'))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('اشتراك / حجز')
        verbose_name_plural = _('الاشتراكات والحجوزات')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.student} - {self.get_subscription_type_display()} - {self.route}'

    def submit_payment(self):
        self.status = self.Status.PAYMENT_SUBMITTED
        self.submitted_at = timezone.now()
        self.save(update_fields=['status', 'submitted_at', 'updated_at'])

    def approve(self, by_user):
        self.status = self.Status.CONFIRMED
        self.verified_at = timezone.now()
        self.verified_by = by_user
        self.rejection_reason = ''
        self.save(update_fields=['status', 'verified_at', 'verified_by',
                                 'rejection_reason', 'updated_at'])

    def reject(self, by_user, reason=''):
        self.status = self.Status.REJECTED
        self.verified_at = timezone.now()
        self.verified_by = by_user
        self.rejection_reason = reason
        self.save(update_fields=['status', 'verified_at', 'verified_by',
                                 'rejection_reason', 'updated_at'])
