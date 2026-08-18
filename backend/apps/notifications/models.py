from django.db import models
from django.utils.translation import gettext_lazy as _


class Notification(models.Model):
    class Severity(models.TextChoices):
        INFO = 'info', _('معلومة')
        SUCCESS = 'success', _('نجاح')
        WARNING = 'warning', _('تنبيه')
        ERROR = 'error', _('خطأ')

    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='notifications',
        verbose_name=_('المستخدم'),
    )
    title = models.CharField(max_length=150, verbose_name=_('العنوان'))
    message = models.CharField(max_length=400, blank=True, verbose_name=_('الرسالة'))
    link = models.CharField(max_length=200, blank=True, verbose_name=_('الرابط'))
    severity = models.CharField(
        max_length=10, choices=Severity.choices,
        default=Severity.INFO, verbose_name=_('النوع'),
    )
    read = models.BooleanField(default=False, verbose_name=_('مقروء'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('إشعار')
        verbose_name_plural = _('الإشعارات')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} - {self.title}'


def notify(user, title, message='', link='', severity='info'):
    """Create an in-app notification. Channel integrations (SMS/WhatsApp/email)
    can hook here later without touching business logic (spec §25)."""
    if user is None:
        return None
    return Notification.objects.create(
        user=user, title=title, message=message, link=link, severity=severity,
    )
