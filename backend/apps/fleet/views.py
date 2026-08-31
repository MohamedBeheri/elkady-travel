from decimal import Decimal

from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import IsFleetManager, FLEET_ROLES
from apps.notifications.models import notify
from .models import (
    AuditLog, Driver, MaintenanceRecord, TrafficFine, TripExpense, Vehicle, VehicleAssignment, audit,
)
from .serializers import (
    AuditLogSerializer, DriverSerializer, MaintenanceRecordSerializer, TrafficFineSerializer,
    TripExpenseSerializer, VehicleSerializer, VehicleAssignmentSerializer,
)


def _driver_of(user):
    return Driver.objects.filter(user=user).first()


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    permission_classes = [IsFleetManager]
    filterset_fields = ['status', 'active', 'vehicle_type']
    search_fields = ['plate_number', 'brand', 'model', 'license_number']

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request.user, 'create', 'Vehicle', obj.id, f'إضافة مركبة {obj.plate_number}')

    def perform_update(self, serializer):
        old = VehicleSerializer(self.get_object()).data
        obj = serializer.save()
        audit(self.request.user, 'update', 'Vehicle', obj.id, f'تعديل مركبة {obj.plate_number}', old, VehicleSerializer(obj).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Usage + drivers + expenses history for a vehicle."""
        v = self.get_object()
        assignments = v.assignments.select_related('driver', 'route').order_by('-date')[:100]
        return Response({
            'vehicle': VehicleSerializer(v).data,
            'assignments': VehicleAssignmentSerializer(assignments, many=True).data,
            'expenses': TripExpenseSerializer(v.expenses.all().order_by('-date')[:100], many=True).data,
            'drivers': list(v.assignments.values_list('driver__full_name', flat=True).distinct()),
        })


class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.select_related('user').all()
    serializer_class = DriverSerializer
    permission_classes = [IsFleetManager]
    filterset_fields = ['status', 'license_type']
    search_fields = ['full_name', 'phone', 'license_number']

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request.user, 'create', 'Driver', obj.id, f'إضافة سائق {obj.full_name}')

    def perform_update(self, serializer):
        obj = serializer.save()
        audit(self.request.user, 'update', 'Driver', obj.id, f'تعديل سائق {obj.full_name}')

    @action(detail=False, methods=['get'], url_path='license-alerts')
    def license_alerts(self, request):
        """Drivers whose licence expires within 30 days."""
        soon = timezone.localdate() + timezone.timedelta(days=30)
        qs = Driver.objects.filter(license_expiry__isnull=False, license_expiry__lte=soon).order_by('license_expiry')
        return Response(DriverSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        """Trips driven, vehicles used, expenses (approved/rejected)."""
        d = self.get_object()
        exp = d.expenses.all()
        return Response({
            'driver': DriverSerializer(d).data,
            'assignments': VehicleAssignmentSerializer(d.assignments.select_related('vehicle', 'route').order_by('-date')[:100], many=True).data,
            'vehicles': list(d.assignments.values_list('vehicle__plate_number', flat=True).distinct()),
            'expenses': TripExpenseSerializer(exp.order_by('-date')[:100], many=True).data,
            'totals': {
                'approved': exp.filter(status='approved').aggregate(t=Sum('amount'))['t'] or 0,
                'rejected': exp.filter(status='rejected').aggregate(t=Sum('amount'))['t'] or 0,
                'pending': exp.filter(status='pending').aggregate(t=Sum('amount'))['t'] or 0,
            },
        })


class VehicleAssignmentViewSet(viewsets.ModelViewSet):
    queryset = VehicleAssignment.objects.select_related('driver', 'vehicle', 'route', 'daily_trip').all()
    serializer_class = VehicleAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['date', 'driver', 'vehicle', 'route', 'status', 'daily_trip']

    def get_queryset(self):
        qs = super().get_queryset()
        # Drivers see only their own assignments.
        if self.request.user.role == 'driver':
            d = _driver_of(self.request.user)
            return qs.filter(driver=d) if d else qs.none()
        return qs

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'my_today', 'start', 'complete'):
            return [IsAuthenticated()]
        return [IsFleetManager()]

    def _conflict(self, date, daily_trip_id, vehicle_id, driver_id, exclude=None):
        base = VehicleAssignment.objects.filter(date=date).exclude(status='cancelled')
        if exclude:
            base = base.exclude(pk=exclude)
        scope = base.filter(daily_trip_id=daily_trip_id) if daily_trip_id else base
        if scope.filter(vehicle_id=vehicle_id).exists():
            return 'هذه المركبة معيّنة بالفعل لرحلة في نفس الوقت.'
        if scope.filter(driver_id=driver_id).exists():
            return 'هذا السائق معيّن بالفعل لرحلة في نفس الوقت.'
        return None

    def perform_create(self, serializer):
        d = serializer.validated_data
        vehicle = d['vehicle']
        if vehicle.status in ('maintenance', 'out_of_service', 'inactive'):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'المركبة غير متاحة (صيانة/خارج الخدمة).'})
        err = self._conflict(d['date'], (d.get('daily_trip') and d['daily_trip'].id),
                             vehicle.id, d['driver'].id)
        if err:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': err})
        obj = serializer.save()
        audit(self.request.user, 'assign', 'VehicleAssignment', obj.id,
              f'تعيين {obj.driver} / {obj.vehicle} ليوم {obj.date}')
        if obj.driver.user:
            notify(obj.driver.user, 'تعيين رحلة جديدة',
                   f'تم تعيينك على المركبة {obj.vehicle.plate_number} يوم {obj.date}', link='/driver', severity='info')

    def perform_update(self, serializer):
        obj = serializer.save()
        audit(self.request.user, 'update', 'VehicleAssignment', obj.id, f'تعديل تعيين {obj.id}')

    @action(detail=False, methods=['get'], url_path='my-today')
    def my_today(self, request):
        """Driver's assignments for today."""
        d = _driver_of(request.user)
        if not d:
            return Response([])
        qs = self.queryset.filter(driver=d, date=timezone.localdate())
        return Response(VehicleAssignmentSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'], url_path='manifest')
    def manifest(self, request, pk=None):
        """Passenger list for a driver's assignment, grouped by pickup point ordered by time.

        Available to the assigned driver (or staff). Delegates to the same logic
        the admin passengers action uses, so the ordering is by the point's time.
        """
        a = self.get_object()
        if not a.daily_trip_id:
            return Response({'trip': None, 'groups': [], 'detail': 'الرحلة غير مربوطة بجدول تشغيل بعد'})
        driver = _driver_of(request.user)
        from config.permissions import STAFF_ROLES
        if request.user.role not in STAFF_ROLES and (not driver or driver.id != a.driver_id):
            return Response(status=403)
        from apps.operations.views import DailyTripViewSet
        view = DailyTripViewSet(); view.request = request; view.kwargs = {'pk': a.daily_trip_id}
        return view.passengers(request, pk=a.daily_trip_id)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        a = self.get_object()
        a.status = 'started'; a.start_time = timezone.now(); a.save(update_fields=['status', 'start_time'])
        Vehicle.objects.filter(pk=a.vehicle_id).update(status='in_trip')
        audit(request.user, 'start_trip', 'VehicleAssignment', a.id, f'بدء رحلة {a.id}')
        return Response(VehicleAssignmentSerializer(a).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        a = self.get_object()
        a.status = 'completed'; a.end_time = timezone.now(); a.save(update_fields=['status', 'end_time'])
        Vehicle.objects.filter(pk=a.vehicle_id).update(status='available')
        audit(request.user, 'complete_trip', 'VehicleAssignment', a.id, f'إنهاء رحلة {a.id}')
        return Response(VehicleAssignmentSerializer(a).data)


class TripExpenseViewSet(viewsets.ModelViewSet):
    queryset = TripExpense.objects.select_related('vehicle', 'driver').all()
    serializer_class = TripExpenseSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['kind', 'status', 'vehicle', 'driver', 'daily_trip', 'date']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'driver':
            d = _driver_of(self.request.user)
            return qs.filter(driver=d) if d else qs.none()
        return qs

    def perform_create(self, serializer):
        driver = None
        if self.request.user.role == 'driver':
            driver = _driver_of(self.request.user)
        obj = serializer.save(created_by=self.request.user, driver=serializer.validated_data.get('driver') or driver)
        audit(self.request.user, 'create', 'TripExpense', obj.id, f'تسجيل مصروف {obj.get_kind_display()} {obj.amount}')

    def _review(self, request, pk, approved):
        if request.user.role not in FLEET_ROLES:
            return Response(status=403)
        e = self.get_object()
        e.status = 'approved' if approved else 'rejected'
        e.reviewed_by = request.user
        e.review_date = timezone.now()
        e.rejection_reason = '' if approved else request.data.get('rejection_reason', '')
        e.save(update_fields=['status', 'reviewed_by', 'review_date', 'rejection_reason'])
        audit(request.user, 'approve_expense' if approved else 'reject_expense', 'TripExpense', e.id,
              f'{"قبول" if approved else "رفض"} مصروف {e.amount}')
        if e.created_by:
            notify(e.created_by, 'تحديث حالة المصروف',
                   f'مصروفك ({e.amount} ج.م) {"تم قبوله" if approved else "تم رفضه"}', link='/driver', severity='success' if approved else 'error')
        return Response(TripExpenseSerializer(e).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._review(request, pk, True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._review(request, pk, False)


class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRecord.objects.select_related('vehicle').all()
    serializer_class = MaintenanceRecordSerializer
    permission_classes = [IsFleetManager]
    filterset_fields = ['vehicle', 'is_workshop', 'date']

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        audit(self.request.user, 'create', 'Maintenance', obj.id, f'صيانة/ورشة {obj.vehicle} {obj.amount}')


class TrafficFineViewSet(viewsets.ModelViewSet):
    queryset = TrafficFine.objects.select_related('vehicle', 'driver').all()
    serializer_class = TrafficFineSerializer
    permission_classes = [IsFleetManager]
    filterset_fields = ['vehicle', 'driver', 'status', 'date']

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request.user, 'create', 'TrafficFine', obj.id, f'غرامة {obj.vehicle} {obj.amount}')


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsFleetManager]
    filterset_fields = ['action', 'entity', 'user']
    search_fields = ['summary', 'entity']


@api_view(['GET'])
@permission_classes([IsFleetManager])
def vehicle_expense_report(request):
    """Monthly expense report for a vehicle (or all): fuel/tolls/other + maintenance/workshop/fines."""
    month = request.query_params.get('month') or timezone.localdate().strftime('%Y-%m')
    try:
        year, mon = [int(x) for x in month.split('-')]
    except Exception:
        return Response({'detail': 'صيغة الشهر YYYY-MM'}, status=400)

    vehicles = Vehicle.objects.all()
    vid = request.query_params.get('vehicle')
    if vid:
        vehicles = vehicles.filter(pk=vid)

    def msum(qs):
        return float(qs.filter(date__year=year, date__month=mon).aggregate(t=Sum('amount'))['t'] or 0)

    rows = []
    for v in vehicles:
        exp = v.expenses.filter(status='approved')
        fuel = msum(exp.filter(kind='fuel'))
        tolls = msum(exp.filter(kind='tolls'))
        other = msum(exp.filter(kind='other'))
        maint = msum(v.maintenance.filter(is_workshop=False))
        workshop = msum(v.maintenance.filter(is_workshop=True))
        fines = msum(v.fines.all())
        trips = v.assignments.filter(date__year=year, date__month=mon).exclude(status='cancelled').count()
        drivers = list(v.assignments.filter(date__year=year, date__month=mon).values_list('driver__full_name', flat=True).distinct())
        grand = fuel + tolls + other + maint + workshop + fines
        if grand or trips:
            rows.append({
                'vehicle': v.plate_number, 'vehicle_id': v.id, 'trips': trips, 'drivers': drivers,
                'fuel': fuel, 'tolls': tolls, 'other': other, 'maintenance': maint,
                'workshop': workshop, 'fines': fines, 'grand_total': grand,
            })
    rows.sort(key=lambda r: -r['grand_total'])
    return Response({'month': month, 'rows': rows,
                     'grand_total': sum(r['grand_total'] for r in rows)})


@api_view(['GET'])
@permission_classes([IsFleetManager])
def trip_cost_report(request):
    """Operating cost per trip = Fuel + Tolls + Other (approved) for each assignment.

    Maintenance/workshop/fines are NOT counted as trip cost (per business logic §27).
    """
    month = request.query_params.get('month') or timezone.localdate().strftime('%Y-%m')
    try:
        year, mon = [int(x) for x in month.split('-')]
    except Exception:
        return Response({'detail': 'صيغة الشهر YYYY-MM'}, status=400)

    q = VehicleAssignment.objects.filter(date__year=year, date__month=mon).exclude(status='cancelled')
    route_id = request.query_params.get('route')
    if route_id:
        q = q.filter(route_id=route_id)
    q = q.select_related('driver', 'vehicle', 'route', 'daily_trip')

    rows = []
    for a in q.order_by('date'):
        # Approved fuel/tolls/other on the same day + vehicle = this trip's cost.
        exp = TripExpense.objects.filter(
            status='approved', kind__in=['fuel', 'tolls', 'other'],
            date=a.date, vehicle=a.vehicle,
        )
        fuel = float(exp.filter(kind='fuel').aggregate(t=Sum('amount'))['t'] or 0)
        tolls = float(exp.filter(kind='tolls').aggregate(t=Sum('amount'))['t'] or 0)
        other = float(exp.filter(kind='other').aggregate(t=Sum('amount'))['t'] or 0)
        rows.append({
            'assignment_id': a.id, 'date': str(a.date),
            'route': a.route.name if a.route else (a.daily_trip and a.daily_trip.route.name) or '—',
            'vehicle': a.vehicle.plate_number, 'driver': a.driver.full_name,
            'fuel': fuel, 'tolls': tolls, 'other': other, 'trip_cost': fuel + tolls + other,
        })
    return Response({'month': month, 'rows': rows,
                     'total': sum(r['trip_cost'] for r in rows)})


@api_view(['GET'])
@permission_classes([IsFleetManager])
def operations_dashboard(request):
    """Supervisor board for a given day: trips, assignments, gaps, pickup distribution."""
    from apps.operations.models import DailyTrip, SeatRequest
    date = request.query_params.get('date') or str(timezone.localdate())

    trips = DailyTrip.objects.filter(date=date, direction='go').select_related('route', 'route__destination', 'morning_slot')
    assignments = VehicleAssignment.objects.filter(date=date).exclude(status='cancelled').select_related('driver', 'vehicle', 'daily_trip', 'route')
    by_trip = {}
    for a in assignments:
        if a.daily_trip_id:
            by_trip.setdefault(a.daily_trip_id, []).append(a)

    trip_rows, missing = [], []
    for t in trips:
        confirmed = t.seat_requests.filter(status=SeatRequest.Status.CONFIRMED).count()
        assigns = by_trip.get(t.id, [])
        row = {
            'id': t.id, 'route': t.route.name, 'slot': t.slot_label,
            'destination': t.route.destination.name, 'passengers': confirmed,
            'capacity': t.total_seats,
            'vehicle': assigns[0].vehicle.plate_number if assigns else '',
            'driver': assigns[0].driver.full_name if assigns else '',
            'assigned': bool(assigns),
        }
        trip_rows.append(row)
        if not assigns:
            missing.append({'route': t.route.name, 'slot': t.slot_label})

    # Pickup point distribution across today's confirmed passengers.
    dist = {}
    for sr in SeatRequest.objects.filter(daily_trip__date=date, status=SeatRequest.Status.CONFIRMED).select_related('pickup_point'):
        key = sr.pickup_point.name if sr.pickup_point else 'غير محدد'
        dist[key] = dist.get(key, 0) + 1
    pickup_dist = sorted([{'name': k, 'count': v} for k, v in dist.items()], key=lambda x: -x['count'])

    return Response({
        'date': date,
        'kpis': {
            'trips': trips.count(),
            'passengers': sum(r['passengers'] for r in trip_rows),
            'vehicles': assignments.values('vehicle').distinct().count(),
            'drivers': assignments.values('driver').distinct().count(),
            'missing_assignments': len(missing),
            'pending_expenses': TripExpense.objects.filter(status='pending').count(),
        },
        'trips': trip_rows,
        'missing': missing,
        'pickup_distribution': pickup_dist,
    })


@api_view(['GET'])
@permission_classes([IsFleetManager])
def fleet_dashboard(request):
    """Fleet KPIs for the admin/operations dashboard."""
    today = timezone.localdate()
    return Response({
        'vehicles_total': Vehicle.objects.filter(active=True).count(),
        'vehicles_available': Vehicle.objects.filter(status='available', active=True).count(),
        'vehicles_in_trip': Vehicle.objects.filter(status='in_trip').count(),
        'vehicles_maintenance': Vehicle.objects.filter(status='maintenance').count(),
        'drivers_active': Driver.objects.filter(status='active').count(),
        'assignments_today': VehicleAssignment.objects.filter(date=today).exclude(status='cancelled').count(),
        'expenses_pending': TripExpense.objects.filter(status='pending').count(),
        'expenses_today': float(TripExpense.objects.filter(date=today, status='approved').aggregate(t=Sum('amount'))['t'] or 0),
        'expenses_month': float(TripExpense.objects.filter(date__year=today.year, date__month=today.month, status='approved').aggregate(t=Sum('amount'))['t'] or 0),
    })
