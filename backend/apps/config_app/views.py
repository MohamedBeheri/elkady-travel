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
