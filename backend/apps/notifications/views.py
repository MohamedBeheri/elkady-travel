from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['read', 'severity']

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get'])
    def unread(self, request):
        qs = self.get_queryset().filter(read=False)
        return Response({
            'count': qs.count(),
            'items': NotificationSerializer(qs[:20], many=True).data,
        })

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        self.get_queryset().filter(read=False).update(read=True)
        return Response({'ok': True})

    @action(detail=False, methods=['get'], url_path='pending-counts')
    def pending_counts(self, request):
        """Live pending-work counts for the sidebar badges (not notification
        history — a current snapshot of how many items need staff action)."""
        from config.permissions import STAFF_ROLES
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        from apps.bookings.models import Subscription
        from apps.operations.models import SeatRequest
        from apps.tourism.models import TourismRequest
        return Response({
            'payments': Subscription.objects.filter(status__in=[
                Subscription.Status.PAYMENT_SUBMITTED, Subscription.Status.UNDER_REVIEW,
            ]).count(),
            'waiting': SeatRequest.objects.filter(status=SeatRequest.Status.WAITING).count(),
            'tourism': TourismRequest.objects.filter(status=TourismRequest.Status.PENDING).count(),
        })

    @action(detail=True, methods=['post'], url_path='read')
    def mark_read(self, request, pk=None):
        n = self.get_object()
        n.read = True
        n.save(update_fields=['read'])
        return Response(NotificationSerializer(n).data)
