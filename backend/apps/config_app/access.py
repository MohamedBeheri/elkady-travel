"""Dynamic role → screen permissions catalog and defaults.

Screen keys match the frontend route paths so the sidebar can filter directly.
`admin` (مدير عام) always has full access and is never stored/editable here.
"""

# Manageable roles (admin excluded — it always has everything).
MANAGED_ROLES = [
    ('transport_manager', 'مدير النقل'),
    ('payment_officer', 'مسؤول المدفوعات'),
    ('operations', 'مشرف التشغيل'),
    ('bus_supervisor', 'مشرف الأسطول'),
    ('tourism_manager', 'مدير السياحة'),
    ('driver', 'سائق'),
]

# Screen catalog: (key, label, group). Key = route path used by the sidebar.
SCREENS = [
    ('/', 'لوحة التحكم', 'عام'),
    ('/operations', 'لوحة المشرف', 'التشغيل'),
    ('/board', 'رحلات الغد', 'التشغيل'),
    ('/day-manifest', 'كشف اليوم الشامل', 'التشغيل'),
    ('/reschedules', 'طلبات التأجيل', 'التشغيل'),
    ('/subscriptions', 'الطلاب والاشتراكات', 'التشغيل'),
    ('/waiting', 'قوائم الانتظار', 'التشغيل'),
    ('/returns', 'رحلات العودة', 'التشغيل'),
    ('/payments', 'تأكيد المدفوعات', 'التشغيل'),
    ('/tourism', 'السياحة والرحلات', 'التشغيل'),
    ('/fleet/vehicles', 'المركبات', 'الأسطول'),
    ('/fleet/drivers', 'السائقون', 'الأسطول'),
    ('/fleet/assignments', 'التعيينات اليومية', 'الأسطول'),
    ('/fleet/expenses', 'مصروفات الرحلات', 'المصروفات'),
    ('/fleet/maintenance', 'الصيانة والورش', 'المصروفات'),
    ('/fleet/fines', 'الغرامات المرورية', 'المصروفات'),
    ('/reports/finance', 'التقارير المالية', 'التقارير'),
    ('/fleet/reports', 'مصروفات المركبات', 'التقارير'),
    ('/fleet/trip-cost', 'تكلفة الرحلات', 'التقارير'),
    ('/config', 'الإعدادات والتهيئة', 'النظام'),
    ('/users', 'المستخدمون', 'النظام'),
    ('/fleet/audit', 'سجل التدقيق', 'النظام'),
]
SCREEN_KEYS = [s[0] for s in SCREENS]

# Default access per role, mirroring the previous hardcoded sidebar gating so
# nothing breaks on first deploy. Admin-only screens stay off for everyone else.
_OPS = ['/', '/board', '/day-manifest', '/reschedules', '/subscriptions', '/waiting', '/returns', '/payments', '/tourism']
_FLEET = ['/operations', '/fleet/vehicles', '/fleet/drivers', '/fleet/assignments',
          '/fleet/expenses', '/fleet/maintenance', '/fleet/fines',
          '/reports/finance', '/fleet/reports', '/fleet/trip-cost']

DEFAULT_SCREENS = {
    'transport_manager': _OPS + _FLEET,
    'operations': _OPS + _FLEET,
    'bus_supervisor': _OPS + _FLEET,
    'payment_officer': _OPS,
    'tourism_manager': ['/', '/tourism', '/reports/finance'],
    'driver': [],
}


def default_flags_for(role, screen):
    """Full CRUD where the role had access by default, else nothing."""
    allowed = screen in DEFAULT_SCREENS.get(role, [])
    return {'can_view': allowed, 'can_add': allowed, 'can_edit': allowed, 'can_delete': allowed}


def effective_permissions(user):
    """Return {screen: {view, add, edit, delete}} for a user.

    Admin → everything true. Others → stored RoleScreenPermission rows, falling
    back to defaults for screens with no stored row.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return {}
    if user.role == 'admin':
        return {k: {'view': True, 'add': True, 'edit': True, 'delete': True} for k in SCREEN_KEYS}

    from .models import RoleScreenPermission
    stored = {p.screen: p for p in RoleScreenPermission.objects.filter(role=user.role)}
    out = {}
    for key in SCREEN_KEYS:
        p = stored.get(key)
        if p:
            out[key] = {'view': p.can_view, 'add': p.can_add, 'edit': p.can_edit, 'delete': p.can_delete}
        else:
            d = default_flags_for(user.role, key)
            out[key] = {'view': d['can_view'], 'add': d['can_add'], 'edit': d['can_edit'], 'delete': d['can_delete']}
    return out
