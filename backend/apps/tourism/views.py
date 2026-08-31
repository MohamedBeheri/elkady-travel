from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import STAFF_ROLES, ReadOnlyOrStaff
from apps.notifications.models import notify
from .models import Quotation, TourismRequest, VehicleType
from .serializers import (
    QuotationSerializer, TourismRequestSerializer, VehicleTypeSerializer,
)


class VehicleTypeViewSet(viewsets.ModelViewSet):
    queryset = VehicleType.objects.all()
    serializer_class = VehicleTypeSerializer
    permission_classes = [ReadOnlyOrStaff]
    filterset_fields = ['active']


class TourismRequestViewSet(viewsets.ModelViewSet):
    queryset = TourismRequest.objects.select_related('vehicle_type', 'customer').prefetch_related('quotations').all()
    serializer_class = TourismRequestSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'trip_type', 'travel_date']
    search_fields = ['full_name', 'phone', 'origin', 'destination']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'student':
            return qs.filter(customer=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """Only staff may hard-delete a tourism request."""
        from config.permissions import STAFF_ROLES
        if request.user.role not in STAFF_ROLES:
            return Response({'detail': 'غير مصرح بالحذف'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Customer accepts the sent quotation → request CONFIRMED (§22)."""
        req = self.get_object()
        req.quotations.filter(status=Quotation.Status.SENT).update(status=Quotation.Status.ACCEPTED)
        req.status = TourismRequest.Status.ACCEPTED
        req.save(update_fields=['status'])
        return Response(TourismRequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        req = self.get_object()
        req.quotations.filter(status=Quotation.Status.SENT).update(status=Quotation.Status.REJECTED)
        req.status = TourismRequest.Status.REJECTED
        req.save(update_fields=['status'])
        return Response(TourismRequestSerializer(req).data)


class QuotationViewSet(viewsets.ModelViewSet):
    queryset = Quotation.objects.select_related('request', 'created_by').all()
    serializer_class = QuotationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'request']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'student':
            return qs.filter(request__customer=self.request.user)
        return qs

    def perform_create(self, serializer):
        if self.request.user.role not in STAFF_ROLES:
            return Response(status=403)
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Admin sends the quotation to the customer (§21)."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        q = self.get_object()
        q.status = Quotation.Status.SENT
        q.save(update_fields=['status'])
        q.request.status = TourismRequest.Status.QUOTED
        q.request.save(update_fields=['status'])
        notify(q.request.customer, 'عرض السعر جاهز',
               f'عرض سعر رحلتك {q.request.origin} → {q.request.destination}: {q.price} ج.م',
               link='/tourism', severity='info')
        return Response(QuotationSerializer(q).data)
