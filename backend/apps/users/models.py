from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    """System user. Roles drive access across admin modules; students use the portal."""

    class Role(models.TextChoices):
        ADMIN = 'admin', _('مدير عام')
        TRANSPORT_MANAGER = 'transport_manager', _('مدير النقل')
        PAYMENT_OFFICER = 'payment_officer', _('مسؤول المدفوعات')
        OPERATIONS = 'operations', _('مشرف التشغيل')
        TOURISM_MANAGER = 'tourism_manager', _('مدير السياحة')
        STUDENT = 'student', _('طالب')

    role = models.CharField(
        max_length=20, choices=Role.choices,
        default=Role.STUDENT, verbose_name=_('الدور'),
    )
    full_name = models.CharField(max_length=150, blank=True, verbose_name=_('الاسم الكامل'))
    national_id = models.CharField(max_length=20, blank=True, verbose_name=_('الرقم القومي'))
    phone = models.CharField(max_length=20, blank=True, verbose_name=_('رقم الهاتف'))
    address = models.CharField(max_length=255, blank=True, verbose_name=_('العنوان'))
    university = models.ForeignKey(
        'config_app.University', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='students', verbose_name=_('الجامعة'),
    )

    class Meta:
        verbose_name = _('مستخدم')
        verbose_name_plural = _('المستخدمون')

    def __str__(self):
        return self.full_name or self.username

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_staff_role(self):
        return self.role != self.Role.STUDENT
