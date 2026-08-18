from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class VehicleType(models.Model):
    name = models.CharField(max_length=80, verbose_name=_('نوع المركبة'))
    name_en = models.CharField(max_length=80, blank=True, verbose_name=_('الاسم بالإنجليزية'))
    capacity = models.PositiveIntegerField(default=14, verbose_name=_('السعة'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('نوع مركبة')
        verbose_name_plural = _('أنواع المركبات')

    def __str__(self):
        return self.name


class TourismRequest(models.Model):
    """A private / tourism trip inquiry. Never priced automatically — admin quotes it."""

    class TripType(models.TextChoices):
        SEAT = 'seat', _('فردي / بالمقعد')
        PRIVATE = 'private', _('رحلة خاصة / مركبة كاملة')

    class Status(models.TextChoices):
        PENDING = 'pending', _('بانتظار المراجعة')
        QUOTED = 'quoted', _('تم إرسال عرض سعر')
        ACCEPTED = 'accepted', _('مقبول')
        REJECTED = 'rejected', _('مرفوض')
        EXPIRED = 'expired', _('منتهي')

    customer = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='tourism_requests', verbose_name=_('العميل'),
    )
    full_name = models.CharField(max_length=150, verbose_name=_('الاسم الكامل'))
    phone = models.CharField(max_length=20, verbose_name=_('رقم الهاتف'))
    national_id = models.CharField(max_length=20, blank=True, verbose_name=_('الرقم القومي'))
    address = models.CharField(max_length=255, blank=True, verbose_name=_('العنوان'))
    origin = models.CharField(max_length=150, verbose_name=_('من'))
    destination = models.CharField(max_length=150, verbose_name=_('إلى'))
    travel_date = models.DateField(verbose_name=_('تاريخ الرحلة'))
    vehicle_type = models.ForeignKey(
        VehicleType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='requests', verbose_name=_('نوع المركبة'),
    )
    travelers = models.PositiveIntegerField(default=1, verbose_name=_('عدد المسافرين'))
    trip_type = models.CharField(
        max_length=10, choices=TripType.choices,
        default=TripType.PRIVATE, verbose_name=_('نوع الرحلة'),
    )
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))
    status = models.CharField(
        max_length=10, choices=Status.choices,
        default=Status.PENDING, verbose_name=_('الحالة'),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('طلب سياحة')
        verbose_name_plural = _('طلبات السياحة')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.full_name} - {self.origin} → {self.destination}'


class Quotation(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', _('مسودة')
        SENT = 'sent', _('مُرسل للعميل')
        ACCEPTED = 'accepted', _('مقبول')
        REJECTED = 'rejected', _('مرفوض')
        EXPIRED = 'expired', _('منتهي')

    request = models.ForeignKey(
        TourismRequest, on_delete=models.CASCADE, related_name='quotations',
        verbose_name=_('الطلب'),
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name=_('السعر'))
    validity_date = models.DateField(null=True, blank=True, verbose_name=_('صالح حتى'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات / شروط'))
    status = models.CharField(
        max_length=10, choices=Status.choices,
        default=Status.DRAFT, verbose_name=_('الحالة'),
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='quotations', verbose_name=_('أنشئ بواسطة'),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('عرض سعر')
        verbose_name_plural = _('عروض الأسعار')
        ordering = ['-created_at']

    def __str__(self):
        return f'عرض {self.price} - {self.request.full_name}'
