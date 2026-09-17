from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CollegeViewSet, DestinationViewSet, MorningSlotViewSet, PaymentAccountViewSet,
    PaymentMethodViewSet, PickupPointViewSet, PricingRuleViewSet,
    ReturnSlotViewSet, RouteViewSet, SeatCapacityViewSet, UniversityViewSet,
    company_settings, pickup_times_matrix, pickup_times_bulk, permissions_matrix,
)

router = DefaultRouter()
router.register('destinations', DestinationViewSet)
router.register('universities', UniversityViewSet)
router.register('colleges', CollegeViewSet)
router.register('routes', RouteViewSet)
router.register('pickup-points', PickupPointViewSet)
router.register('morning-slots', MorningSlotViewSet)
router.register('return-slots', ReturnSlotViewSet)
router.register('seat-capacities', SeatCapacityViewSet)
router.register('prices', PricingRuleViewSet)
router.register('payment-methods', PaymentMethodViewSet)
router.register('payment-accounts', PaymentAccountViewSet)

urlpatterns = [
    path('company/', company_settings, name='company_settings'),
    path('pickup-times/matrix/', pickup_times_matrix, name='pickup_times_matrix'),
    path('pickup-times/bulk/', pickup_times_bulk, name='pickup_times_bulk'),
    path('permissions/', permissions_matrix, name='permissions_matrix'),
] + router.urls
