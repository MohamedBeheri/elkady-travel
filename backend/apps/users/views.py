from rest_framework import viewsets, generics
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User
from .serializers import (
    StudentRegisterSerializer, TripsTokenObtainPairSerializer,
    UserSerializer, UserWriteSerializer,
)


class TripsTokenObtainPairView(TokenObtainPairView):
    serializer_class = TripsTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    """Public student registration."""
    queryset = User.objects.all()
    serializer_class = StudentRegisterSerializer
    permission_classes = [AllowAny]


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-date_joined')
    filterset_fields = ['role', 'is_active', 'university']
    search_fields = ['username', 'full_name', 'phone', 'national_id']

    def get_serializer_class(self):
        if self.action in ('list', 'retrieve', 'me'):
            return UserSerializer
        return UserWriteSerializer

    def get_permissions(self):
        if self.action in ('me', 'update_profile'):
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        # Staff manage everyone; students only see themselves.
        if self.request.user.is_student:
            return qs.filter(pk=self.request.user.pk)
        return qs

    @action(detail=False, methods=['get'])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    @action(detail=False, methods=['patch'], url_path='update-profile')
    def update_profile(self, request):
        ser = UserWriteSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        # Students cannot escalate their own role.
        ser.validated_data.pop('role', None)
        ser.save()
        return Response(UserSerializer(request.user).data)
