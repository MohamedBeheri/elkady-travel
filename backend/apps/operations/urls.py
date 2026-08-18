from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DailyTripViewSet, ReturnBookingViewSet, SeatRequestViewSet, layouts

router = DefaultRouter()
router.register('daily-trips', DailyTripViewSet, basename='daily-trip')
router.register('seat-requests', SeatRequestViewSet, basename='seat-request')
router.register('return-bookings', ReturnBookingViewSet, basename='return-booking')

urlpatterns = [
    path('layouts/', layouts, name='layouts'),
] + router.urls
