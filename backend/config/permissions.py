from rest_framework.permissions import BasePermission, SAFE_METHODS

STAFF_ROLES = {
    'admin', 'transport_manager', 'payment_officer', 'operations',
    'bus_supervisor', 'tourism_manager',
}
# Roles allowed to manage the fleet (vehicles/drivers/assignments/expenses review).
FLEET_ROLES = {'admin', 'bus_supervisor', 'transport_manager', 'operations'}


class IsStaff(BasePermission):
    """Any non-student staff member."""
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role in STAFF_ROLES)


class ReadOnlyOrStaff(BasePermission):
    """Authenticated users can read; only staff can write (used for config/lookups)."""
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return u.role in STAFF_ROLES


class IsFleetManager(BasePermission):
    """Admin / bus supervisor / transport manager / operations."""
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role in FLEET_ROLES)


class IsFleetOrDriver(BasePermission):
    """Fleet managers (full) or drivers (their own records — enforced in the view)."""
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.role in FLEET_ROLES or u.role == 'driver'))
