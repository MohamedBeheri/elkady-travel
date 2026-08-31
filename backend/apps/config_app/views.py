from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import IsStaff, ReadOnlyOrStaff
from .models import (
    College, CompanySettings, Destination, MorningSlot, PaymentAccount, PaymentMethod,
    PickupPoint, PricingRule, ReturnSlot, Route, SeatCapacity, University,
)
from .serializers import (
    CollegeSerializer, CompanySettingsSerializer, DestinationSerializer, MorningSlotSerializer,
    PaymentAccountSerializer, PaymentMethodSerializer, PickupPointSerializer,
    PricingRuleSerializer, ReturnSlotSerializer, RouteSerializer,
    SeatCapacitySerializer, UniversitySerializer,
)


class DestinationViewSet(viewsets.ModelViewSet):
    queryset = Destination.objects.all()
    serializer_class = DestinationSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active']


class UniversityViewSet(viewsets.ModelViewSet):
    queryset = University.objects.select_related('destination').all()
    serializer_class = UniversitySerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active', 'destination']


class CollegeViewSet(viewsets.ModelViewSet):
    queryset = College.objects.select_related('university').all()
    serializer_class = CollegeSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active', 'university']


class RouteViewSet(viewsets.ModelViewSet):
    queryset = Route.objects.select_related('destination').prefetch_related('pickup_points').all()
    serializer_class = RouteSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active', 'destination']


class PickupPointViewSet(viewsets.ModelViewSet):
    queryset = PickupPoint.objects.select_related('route').all()
    serializer_class = PickupPointSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active', 'route']


class MorningSlotViewSet(viewsets.ModelViewSet):
    queryset = MorningSlot.objects.all()
    serializer_class = MorningSlotSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active']


class ReturnSlotViewSet(viewsets.ModelViewSet):
    queryset = ReturnSlot.objects.all()
    serializer_class = ReturnSlotSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active']


class SeatCapacityViewSet(viewsets.ModelViewSet):
    queryset = SeatCapacity.objects.select_related('route', 'morning_slot').all()
    serializer_class = SeatCapacitySerializer
    permission_classes = [IsStaff]
    filterset_fields = ['route', 'morning_slot']


class PricingRuleViewSet(viewsets.ModelViewSet):
    queryset = PricingRule.objects.select_related('route').all()
    serializer_class = PricingRuleSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active', 'route', 'subscription_type']


class PaymentMethodViewSet(viewsets.ModelViewSet):
    queryset = PaymentMethod.objects.all()
    serializer_class = PaymentMethodSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active']


class PaymentAccountViewSet(viewsets.ModelViewSet):
    queryset = PaymentAccount.objects.select_related('method').all()
    serializer_class = PaymentAccountSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active', 'method']


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def company_settings(request):
    obj = CompanySettings.load()
    if request.method in ('PUT', 'PATCH'):
        if not IsStaff().has_permission(request, None):
            return Response(status=403)
        ser = CompanySettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
    return Response(CompanySettingsSerializer(obj).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pickup_times_matrix(request):
    """All pickup points of a route + their time for a given slot/direction.

    Query: route, direction (go|return), slot (morning_slot or return_slot id).
    Returns every point (ordered by sequence) with its saved time (or null).
    """
    from .models import PickupTime
    route_id = request.query_params.get('route')
    direction = request.query_params.get('direction', 'go')
    slot_id = request.query_params.get('slot')
    if not (route_id and slot_id):
        return Response({'detail': 'route و slot مطلوبان'}, status=400)
    slot_field = 'return_slot_id' if direction == 'return' else 'morning_slot_id'
    times = {
        t.pickup_point_id: t.time.strftime('%H:%M')
        for t in PickupTime.objects.filter(**{'direction': direction, slot_field: slot_id},
                                           pickup_point__route_id=route_id)
    }
    points = PickupPoint.objects.filter(route_id=route_id, active=True).order_by('sequence', 'name')
    return Response([
        {'pickup_point': p.id, 'name': p.name, 'sequence': p.sequence,
         'center': p.center, 'center_display': p.get_center_display(),
         'time': times.get(p.id)}
        for p in points
    ])


@api_view(['POST'])
@permission_classes([IsStaff])
def pickup_times_bulk(request):
    """Upsert times for many points at once (empty/blank time removes the row)."""
    from datetime import datetime
    from .models import PickupTime
    direction = request.data.get('direction', 'go')
    slot_id = request.data.get('slot')
    items = request.data.get('times', [])
    if not slot_id:
        return Response({'detail': 'slot مطلوب'}, status=400)
    slot_field = 'return_slot_id' if direction == 'return' else 'morning_slot_id'
    saved, removed = 0, 0
    for it in items:
        pp = it.get('pickup_point')
        raw = (it.get('time') or '').strip()
        if not pp:
            continue
        key = {'pickup_point_id': pp, 'direction': direction, slot_field: slot_id}
        if not raw:
            removed += PickupTime.objects.filter(**key).delete()[0]
            continue
        try:
            t = datetime.strptime(raw, '%H:%M').time()
        except ValueError:
            continue
        PickupTime.objects.update_or_create(**key, defaults={'time': t})
        saved += 1
    return Response({'saved': saved, 'removed': removed})
