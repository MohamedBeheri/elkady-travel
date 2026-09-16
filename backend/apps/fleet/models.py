from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Vehicle(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = 'available', _('متاحة')
        IN_TRIP = 'in_trip', _('في رحلة')
        MAINTENANCE = 'maintenance', _('في الصيانة')
        OUT_OF_SERVICE = 'out_of_service', _('خارج الخدمة')
        INACTIVE = 'inactive', _('غير نشطة')

    plate_number = models.CharField(max_length=20, unique=True, verbose_name=_('رقم اللوحة'))
    license_number = models.CharField(max_length=40, blank=True, verbose_name=_('رقم الرخصة'))
    vehicle_type = models.CharField(max_length=40, blank=True, verbose_name=_('نوع المركبة'))
    brand = models.CharField(max_length=40, blank=True, verbose_name=_('الماركة'))
    model = models.CharField(max_length=40, blank=True, verbose_name=_('الموديل'))
    year = models.PositiveIntegerField(null=True, blank=True, verbose_name=_('سنة الصنع'))
    capacity = models.PositiveIntegerField(null=True, blank=True, verbose_name=_('السعة'))
    license_expiry = models.DateField(null=True, blank=True, verbose_name=_('انتهاء رخصة المركبة'))
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.AVAILABLE, verbose_name=_('الحالة'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))
    active = models.BooleanField(default=True, verbose_name=_('نشطة'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('مركبة')
        verbose_name_plural = _('المركبات')
        ordering = ['plate_number']

    def __str__(self):
        return f'{self.plate_number} ({self.brand} {self.model})'.strip()


class Driver(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', _('نشط')
        INACTIVE = 'inactive', _('غير نشط')
        SUSPENDED = 'suspended', _('موقوف')

    class License(models.TextChoices):
        FIRST = 'first', _('أولى')
        SECOND = 'second', _('ثانية')
        THIRD = 'third', _('ثالثة')
        PRIVATE = 'private', _('خاصة')

    user = models.OneToOneField(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='driver_profile', verbose_name=_('حساب الدخول'),
    )
    full_name = models.CharField(max_length=150, verbose_name=_('الاسم'))
    phone = models.CharField(max_length=20, blank=True, verbose_name=_('رقم الهاتف'))
    license_number = models.CharField(max_length=40, blank=True, verbose_name=_('رقم الرخصة'))
    license_type = models.CharField(max_length=10, choices=License.choices, blank=True, verbose_name=_('نوع الرخصة'))
    license_expiry = models.DateField(null=True, blank=True, verbose_name=_('انتهاء الرخصة'))
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, verbose_name=_('الحالة'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('سائق')
        verbose_name_plural = _('السائقون')
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class VehicleAssignment(models.Model):
    """A daily assignment of a driver to a vehicle for a trip (not permanent)."""
    class Status(models.TextChoices):
        PLANNED = 'planned', _('مخطط')
        STARTED = 'started', _('بدأت')
        COMPLETED = 'completed', _('اكتملت')
        CANCELLED = 'cancelled', _('ملغاة')

    date = models.DateField(verbose_name=_('التاريخ'))
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name='assignments', verbose_name=_('السائق'))
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='assignments', verbose_name=_('المركبة'))
    daily_trip = models.ForeignKey(
        'operations.DailyTrip', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assignments', verbose_name=_('الرحلة'),
    )
    route = models.ForeignKey(
        'config_app.Route', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assignments', verbose_name=_('المسار'),
    )
    tourism_request = models.ForeignKey(
        'tourism.TourismRequest', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assignments', verbose_name=_('رحلة سياحية'),
    )
    start_time = models.DateTimeField(null=True, blank=True, verbose_name=_('بداية الرحلة'))
    end_time = models.DateTimeField(null=True, blank=True, verbose_name=_('نهاية الرحلة'))
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLANNED, verbose_name=_('الحالة'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('تعيين يومي')
        verbose_name_plural = _('التعيينات اليومية')
        ordering = ['-date', 'start_time']

    def __str__(self):
        return f'{self.date} - {self.driver} / {self.vehicle}'


class TripExpense(models.Model):
    class Kind(models.TextChoices):
        FUEL = 'fuel', _('وقود')
        TOLLS = 'tolls', _('كارتات / رسوم طرق')
        OTHER = 'other', _('مصروف آخر')

    class Status(models.TextChoices):
        PENDING = 'pending', _('بانتظار المراجعة')
        APPROVED = 'approved', _('مقبول')
        REJECTED = 'rejected', _('مرفوض')

    kind = models.CharField(max_length=8, choices=Kind.choices, verbose_name=_('نوع المصروف'))
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='expenses', verbose_name=_('المركبة'))
    driver = models.ForeignKey(Driver, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses', verbose_name=_('السائق'))
    assignment = models.ForeignKey(VehicleAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses', verbose_name=_('التعيين'))
    daily_trip = models.ForeignKey('operations.DailyTrip', on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses', verbose_name=_('الرحلة'))
    amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name=_('المبلغ'))
    quantity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name=_('الكمية (لتر)'))
    expense_type = models.CharField(max_length=80, blank=True, verbose_name=_('نوع (مصروف آخر)'))
    date = models.DateField(default=timezone.localdate, verbose_name=_('التاريخ'))
    description = models.CharField(max_length=255, blank=True, verbose_name=_('الوصف'))
    receipt = models.FileField(upload_to='expenses/', null=True, blank=True, verbose_name=_('الإيصال'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, verbose_name=_('الحالة'))
    reviewed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_expenses', verbose_name=_('روجعت بواسطة'))
    review_date = models.DateTimeField(null=True, blank=True, verbose_name=_('تاريخ المراجعة'))
    rejection_reason = models.CharField(max_length=255, blank=True, verbose_name=_('سبب الرفض'))
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_expenses', verbose_name=_('سُجّلت بواسطة'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('مصروف رحلة')
        verbose_name_plural = _('مصروفات الرحلات')
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f'{self.get_kind_display()} - {self.amount} - {self.vehicle}'


class MaintenanceRecord(models.Model):
    """Maintenance & workshop records. `is_workshop` distinguishes workshop repairs."""
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='maintenance', verbose_name=_('المركبة'))
    date = models.DateField(default=timezone.localdate, verbose_name=_('التاريخ'))
    is_workshop = models.BooleanField(default=False, verbose_name=_('ورشة'))
    maintenance_type = models.CharField(max_length=80, blank=True, verbose_name=_('نوع الصيانة/الإصلاح'))
    workshop_name = models.CharField(max_length=120, blank=True, verbose_name=_('اسم الورشة'))
    description = models.TextField(blank=True, verbose_name=_('الوصف'))
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name=_('المبلغ'))
    attachment = models.FileField(upload_to='maintenance/', null=True, blank=True, verbose_name=_('الفاتورة/المرفق'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='maintenance_records')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('صيانة / ورشة')
        verbose_name_plural = _('الصيانة والورش')
        ordering = ['-date']

    def __str__(self):
        return f'{"ورشة" if self.is_workshop else "صيانة"} - {self.vehicle} - {self.amount}'


class TrafficFine(models.Model):
    class Status(models.TextChoices):
        UNPAID = 'unpaid', _('غير مدفوعة')
        PAID = 'paid', _('مدفوعة')

    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='fines', verbose_name=_('المركبة'))
    driver = models.ForeignKey(Driver, on_delete=models.SET_NULL, null=True, blank=True, related_name='fines', verbose_name=_('السائق'))
    date = models.DateField(default=timezone.localdate, verbose_name=_('التاريخ'))
    amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name=_('قيمة الغرامة'))
    reason = models.CharField(max_length=255, blank=True, verbose_name=_('سبب الغرامة'))
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.UNPAID, verbose_name=_('الحالة'))
    attachment = models.FileField(upload_to='fines/', null=True, blank=True, verbose_name=_('المرفق'))
    notes = models.TextField(blank=True, verbose_name=_('ملاحظات'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('غرامة مرورية')
        verbose_name_plural = _('الغرامات المرورية')
        ordering = ['-date']

    def __str__(self):
        return f'غرامة {self.amount} - {self.vehicle}'


class AuditLog(models.Model):
    user = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs', verbose_name=_('المستخدم'))
    action = models.CharField(max_length=40, verbose_name=_('العملية'))
    entity = models.CharField(max_length=60, verbose_name=_('الكيان'))
    entity_id = models.CharField(max_length=40, blank=True, verbose_name=_('معرّف الكيان'))
    summary = models.CharField(max_length=255, blank=True, verbose_name=_('الوصف'))
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('التاريخ'))

    class Meta:
        verbose_name = _('سجل تدقيق')
        verbose_name_plural = _('سجلات التدقيق')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} - {self.action} - {self.entity}'


def audit(user, action, entity, entity_id='', summary='', old=None, new=None):
    """Record a sensitive operation in the audit log."""
    try:
        AuditLog.objects.create(
            user=user if getattr(user, 'is_authenticated', False) else None,
            action=action, entity=entity, entity_id=str(entity_id), summary=summary,
            old_value=old, new_value=new,
        )
    except Exception:
        pass
