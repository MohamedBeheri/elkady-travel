from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView, TripsTokenObtainPairView, UserViewSet,
    student_password_reset, password_reset_lookup,
)

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')

urlpatterns = [
    path('login/', TripsTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', RegisterView.as_view(), name='register'),
    path('password-reset/lookup/', password_reset_lookup, name='password_reset_lookup'),
    path('password-reset/', student_password_reset, name='password_reset'),
    path('', include(router.urls)),
]
