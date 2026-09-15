import re

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

# Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Latin, so the same phone typed
# on an Arabic keyboard can't slip past uniqueness as a different string.
_DIGIT_MAP = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')


def normalize_phone(value):
    if not value:
        return ''
    return re.sub(r'\s+', '', str(value).translate(_DIGIT_MAP)).strip()


def normalize_email(value):
    return (value or '').strip().lower()


class User(AbstractUser):
    """System user. Roles drive access across admin modules; students use the portal."""

    class Role(models.TextChoices):
        ADMIN = 'admin', _('مدير عام')
        TRANSPORT_MANAGER = 'transport_manager', _('مدير النقل')
        PAYMENT_OFFICER = 'payment_officer', _('مسؤول المدفوعات')
        OPERATIONS = 'operations', _('مشرف التشغيل')
        BUS_SUPERVISOR = 'bus_supervisor', _('مشرف الأسطول')
        TOURISM_MANAGER = 'tourism_manager', _('مدير السياحة')
        DRIVER = 'driver', _('سائق')
        STUDENT = 'student', _('طالب')

    class Gender(models.TextChoices):
        MALE = 'male', _('ذكر')
        FEMALE = 'female', _('أنثى')

    class Year(models.TextChoices):
        Y1 = '1', _('الفرقة الأولى')
        Y2 = '2', _('الفرقة الثانية')
        Y3 = '3', _('الفرقة الثالثة')
        Y4 = '4', _('الفرقة الرابعة')
        Y5 = '5', _('الفرقة الخامسة')

    class Center(models.TextChoices):
        SHEBIN = 'shebin', _('شبين الكوم')
        QUESNA = 'quesna', _('قويسنا')
        BAGOUR = 'bagour', _('الباجور')
        BENHA = 'benha', _('بنها')

    role = models.CharField(
        max_length=20, choices=Role.choices,
        default=Role.STUDENT, verbose_name=_('الدور'),
    )
    full_name = models.CharField(max_length=150, blank=True, verbose_name=_('الاسم الكامل'))
    national_id = models.CharField(max_length=20, blank=True, verbose_name=_('الرقم القومي'))
    phone = models.CharField(max_length=20, blank=True, verbose_name=_('رقم الهاتف'))
    center = models.CharField(
        max_length=10, choices=Center.choices, blank=True, verbose_name=_('المركز التابع له'),
    )
    pickup_point = models.ForeignKey(
        'config_app.PickupPoint', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='home_students', verbose_name=_('نقطة الالتقاط'),
    )
    address = models.CharField(max_length=255, blank=True, verbose_name=_('تفاصيل إضافية'))
    date_of_birth = models.DateField(null=True, blank=True, verbose_name=_('تاريخ الميلاد'))
    gender = models.CharField(
        max_length=6, choices=Gender.choices, blank=True, verbose_name=_('النوع'),
    )
    university = models.ForeignKey(
        'config_app.University', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='students', verbose_name=_('الجامعة'),
    )
    college = models.ForeignKey(
        'config_app.College', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='students', verbose_name=_('الكلية'),
    )
    academic_year = models.CharField(
        max_length=1, choices=Year.choices, blank=True, verbose_name=_('الفرقة الدراسية'),
    )

    class Meta:
        verbose_name = _('مستخدم')
        verbose_name_plural = _('المستخدمون')
        constraints = [
            # Non-blank phone/email must be unique across all users (hard DB guarantee).
            models.UniqueConstraint(fields=['phone'], condition=~Q(phone=''),
                                    name='uniq_user_phone_nonblank'),
            models.UniqueConstraint(fields=['email'], condition=~Q(email=''),
                                    name='uniq_user_email_nonblank'),
        ]

    def save(self, *args, **kwargs):
        # Normalize so identical contacts always collide regardless of how typed.
        self.phone = normalize_phone(self.phone)
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name or self.username

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_staff_role(self):
        return self.role != self.Role.STUDENT
