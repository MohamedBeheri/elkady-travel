from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DailyRescheduleViewSet, DailyTripViewSet, ReturnBookingViewSet, SeatRequestViewSet,
    layouts, attendance, set_attendance,
)

router = DefaultRouter()
router.register('daily-trips', DailyTripViewSet, basename='daily-trip')
router.register('seat-requests', SeatRequestViewSet, basename='seat-request')
router.register('return-bookings', ReturnBookingViewSet, basename='return-booking')
router.register('daily-reschedules', DailyRescheduleViewSet, basename='daily-reschedule')

urlpatterns = [
    path('layouts/', layouts, name='layouts'),
    path('attendance/', attendance, name='attendance'),
    path('attendance/set/', set_attendance, name='set_attendance'),
] + router.urls
