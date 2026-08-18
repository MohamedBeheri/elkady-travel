from rest_framework.routers import DefaultRouter

from .views import QuotationViewSet, TourismRequestViewSet, VehicleTypeViewSet

router = DefaultRouter()
router.register('vehicle-types', VehicleTypeViewSet)
router.register('requests', TourismRequestViewSet, basename='tourism-request')
router.register('quotations', QuotationViewSet, basename='quotation')

urlpatterns = router.urls
