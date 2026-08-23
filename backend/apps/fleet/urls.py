from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AuditLogViewSet, DriverViewSet, MaintenanceRecordViewSet, TrafficFineViewSet,
    TripExpenseViewSet, VehicleViewSet, VehicleAssignmentViewSet,
    vehicle_expense_report, fleet_dashboard,
)

router = DefaultRouter()
router.register('vehicles', VehicleViewSet)
router.register('drivers', DriverViewSet)
router.register('assignments', VehicleAssignmentViewSet)
router.register('expenses', TripExpenseViewSet)
router.register('maintenance', MaintenanceRecordViewSet)
router.register('fines', TrafficFineViewSet)
router.register('audit-logs', AuditLogViewSet)

urlpatterns = [
    path('reports/vehicle-expenses/', vehicle_expense_report, name='vehicle_expense_report'),
    path('dashboard/', fleet_dashboard, name='fleet_dashboard'),
] + router.urls
