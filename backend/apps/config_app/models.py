from django.db import models
from django.utils.translation import gettext_lazy as _

SUBSCRIPTION_TYPES = [
    ('term', _('ترم')),
    ('monthly', _('شهري')),
    ('daily', _('يومي')),
]


class Destination(models.Model):
    """Campus city / drop-off zone, e.g. Badr, Shorouk."""
    code = models.CharField(max_length=30, unique=True, verbose_name=_('الكود'))
    name = models.CharField(max_length=100, verbose_name=_('الاسم'))
    name_en = models.CharField(max_length=100, blank=True, verbose_name=_('الاسم بالإنجليزية'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('وجهة')
        verbose_name_plural = _('الوجهات')
        ordering = ['name']

    def __str__(self):
        return self.name


class University(models.Model):
    name = models.CharField(max_length=150, verbose_name=_('اسم الجامعة'))
    name_en = models.CharField(max_length=150, blank=True, verbose_name=_('الاسم بالإنجليزية'))
    destination = models.ForeignKey(
        Destination, on_delete=models.PROTECT, related_name='universities',
        verbose_name=_('الوجهة'),
    )
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('جامعة')
        verbose_name_plural = _('الجامعات')
        ordering = ['name']

    def __str__(self):
        return self.name


class College(models.Model):
    university = models.ForeignKey(
        University, on_delete=models.CASCADE, related_name='colleges',
        verbose_name=_('الجامعة'),
    )
    name = models.CharField(max_length=150, verbose_name=_('اسم الكلية'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('كلية')
        verbose_name_plural = _('الكليات')
        ordering = ['university', 'name']

    def __str__(self):
        return f'{self.name} - {self.university.name}'


class Route(models.Model):
    """An origin corridor → destination, e.g. Shebin/Quesna/Benha → Badr."""
    code = models.CharField(max_length=40, unique=True, verbose_name=_('الكود'))
    origin_label = models.CharField(max_length=150, verbose_name=_('خط الانطلاق'))
    name = models.CharField(max_length=180, verbose_name=_('اسم المسار'))
    name_en = models.CharField(max_length=180, blank=True, verbose_name=_('الاسم بالإنجليزية'))
    destination = models.ForeignKey(
        Destination, on_delete=models.PROTECT, related_name='routes',
        verbose_name=_('الوجهة'),
    )
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('مسار')
        verbose_name_plural = _('المسارات')
        ordering = ['origin_label', 'name']

    def __str__(self):
        return self.name


class PickupPoint(models.Model):
    CENTER_CHOICES = [
        ('shebin', _('شبين الكوم')),
        ('quesna', _('قويسنا')),
        ('bagour', _('الباجور')),
        ('benha', _('بنها')),
    ]
    route = models.ForeignKey(
        Route, on_delete=models.CASCADE, related_name='pickup_points',
        verbose_name=_('المسار'),
    )
    center = models.CharField(
        max_length=10, choices=CENTER_CHOICES, blank=True, verbose_name=_('المركز'),
    )
    name = models.CharField(max_length=150, verbose_name=_('اسم نقطة الالتقاط'))
    location = models.CharField(max_length=255, blank=True, verbose_name=_('الموقع'))
    sequence = models.PositiveIntegerField(default=1, verbose_name=_('الترتيب'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('نقطة التقاط')
        verbose_name_plural = _('نقاط الالتقاط')
        ordering = ['route', 'sequence']

    def __str__(self):
        return f'{self.name} ({self.route.origin_label})'


class MorningSlot(models.Model):
    """Morning departure time, e.g. 06:00, 09:00."""
    code = models.CharField(max_length=20, unique=True, verbose_name=_('الكود'))
    departure_time = models.TimeField(verbose_name=_('وقت الانطلاق'))
    name = models.CharField(max_length=60, verbose_name=_('الاسم'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('موعد ذهاب')
        verbose_name_plural = _('مواعيد الذهاب')
        ordering = ['departure_time']

    def __str__(self):
        return self.name


class ReturnSlot(models.Model):
    """Return departure time with its own capacity, e.g. 13:30 — 50 seats."""
    code = models.CharField(max_length=20, unique=True, verbose_name=_('الكود'))
    departure_time = models.TimeField(verbose_name=_('وقت العودة'))
    name = models.CharField(max_length=60, verbose_name=_('الاسم'))
    capacity = models.PositiveIntegerField(default=50, verbose_name=_('السعة'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('موعد عودة')
        verbose_name_plural = _('مواعيد العودة')
        ordering = ['departure_time']

    def __str__(self):
        return self.name


class SeatCapacity(models.Model):
    """Total seats available for a route on a morning slot."""
    LAYOUT_CHOICES = [
        ('bus50', _('أتوبيس (٥٠ راكب)')),
        ('hiace15', _('هاي إيس (١٥ راكب)')),
    ]
    route = models.ForeignKey(
        Route, on_delete=models.CASCADE, related_name='capacities',
        verbose_name=_('المسار'),
    )
    morning_slot = models.ForeignKey(
        MorningSlot, on_delete=models.CASCADE, related_name='capacities',
        verbose_name=_('الموعد'),
    )
    layout = models.CharField(
        max_length=12, choices=LAYOUT_CHOICES, default='bus50', verbose_name=_('نوع المركبة'),
    )
    total_seats = models.PositiveIntegerField(default=49, verbose_name=_('إجمالي المقاعد'))
    female_seats = models.CharField(
        max_length=255, blank=True, verbose_name=_('مقاعد الإناث'),
        help_text=_('أرقام المقاعد المخصصة للإناث مفصولة بفاصلة، مثال: 1,2,7,8'),
    )
    male_seats = models.CharField(
        max_length=255, blank=True, verbose_name=_('مقاعد الذكور'),
        help_text=_('أرقام المقاعد المخصصة للذكور مفصولة بفاصلة'),
    )
    booking_note = models.CharField(
        max_length=255, blank=True, verbose_name=_('تعليمات الحجز'),
    )

    class Meta:
        verbose_name = _('سعة مقاعد')
        verbose_name_plural = _('سعات المقاعد')
        unique_together = [('route', 'morning_slot')]

    def __str__(self):
        return f'{self.route} / {self.morning_slot} = {self.total_seats}'


class PricingRule(models.Model):
    subscription_type = models.CharField(
        max_length=10, choices=SUBSCRIPTION_TYPES, verbose_name=_('نوع الاشتراك'),
    )
    route = models.ForeignKey(
        Route, on_delete=models.CASCADE, related_name='prices',
        verbose_name=_('المسار'),
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name=_('السعر'))
    effective_date = models.DateField(verbose_name=_('تاريخ السريان'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('قاعدة تسعير')
        verbose_name_plural = _('قواعد التسعير')
        ordering = ['-effective_date']

    def __str__(self):
        return f'{self.get_subscription_type_display()} - {self.route} = {self.price}'


class PaymentMethod(models.Model):
    code = models.CharField(max_length=20, unique=True, verbose_name=_('الكود'))
    name = models.CharField(max_length=60, verbose_name=_('الاسم'))
    name_en = models.CharField(max_length=60, blank=True, verbose_name=_('الاسم بالإنجليزية'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('وسيلة دفع')
        verbose_name_plural = _('وسائل الدفع')

    def __str__(self):
        return self.name


class PaymentAccount(models.Model):
    method = models.ForeignKey(
        PaymentMethod, on_delete=models.CASCADE, related_name='accounts',
        verbose_name=_('الوسيلة'),
    )
    holder_name = models.CharField(max_length=120, verbose_name=_('اسم صاحب الحساب'))
    number = models.CharField(max_length=60, verbose_name=_('رقم الحساب / المحفظة'))
    instructions = models.TextField(blank=True, verbose_name=_('تعليمات'))
    active = models.BooleanField(default=True, verbose_name=_('نشط'))

    class Meta:
        verbose_name = _('حساب استلام')
        verbose_name_plural = _('حسابات الاستلام')

    def __str__(self):
        return f'{self.method.name} - {self.number}'


class CompanySettings(models.Model):
    """Singleton with company branding."""
    name = models.CharField(max_length=150, default='شركة النقل والرحلات', verbose_name=_('اسم الشركة'))
    tagline = models.CharField(max_length=200, blank=True, verbose_name=_('الشعار النصي'))
    phone = models.CharField(max_length=40, blank=True, verbose_name=_('الهاتف'))
    logo = models.ImageField(upload_to='branding/', null=True, blank=True, verbose_name=_('الشعار'))

    class Meta:
        verbose_name = _('إعدادات الشركة')
        verbose_name_plural = _('إعدادات الشركة')

    def __str__(self):
        return self.name

    @classmethod
    def load(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj
