from rest_framework import viewsets, generics
from rest_framework.decorators import action, api_view, permission_classes
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

    def destroy(self, request, *args, **kwargs):
        from config.permissions import STAFF_ROLES
        if request.user.role not in STAFF_ROLES:
            return Response({'detail': 'غير مصرح بالحذف'}, status=403)
        return super().destroy(request, *args, **kwargs)

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

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Admin sets any user's password directly (no old-password needed)."""
        from config.permissions import STAFF_ROLES
        if request.user.role not in STAFF_ROLES:
            return Response({'detail': 'غير مصرح'}, status=403)
        new_pw = (request.data.get('password') or '').strip()
        if len(new_pw) < 6:
            return Response({'detail': 'كلمة السر يجب أن تكون ٦ أحرف على الأقل.'}, status=400)
        user = self.get_object()
        user.set_password(new_pw)
        user.save(update_fields=['password'])
        return Response({'detail': f'تم تغيير كلمة السر للمستخدم {user.username}'})


@api_view(['POST'])
@permission_classes([AllowAny])
def student_password_reset(request):
    """Self-service password reset for students: identity check via 6 fields.

    Body:
        email, phone, date_of_birth (YYYY-MM-DD),
        university (id), college (id), pickup_point (id),
        new_password, new_password_confirm
    """
    d = request.data
    email = (d.get('email') or '').strip()
    phone = (d.get('phone') or '').strip()
    dob = (d.get('date_of_birth') or '').strip()
    uni = d.get('university')
    col = d.get('college')
    pickup = d.get('pickup_point')
    new_pw = (d.get('new_password') or '').strip()
    confirm = (d.get('new_password_confirm') or '').strip()

    required = [email, phone, dob, uni, col, pickup, new_pw, confirm]
    if any(not x for x in required):
        return Response({'detail': 'من فضلك أكمل جميع الحقول.'}, status=400)
    if new_pw != confirm:
        return Response({'detail': 'كلمة السر وتأكيدها غير متطابقين.'}, status=400)
    if len(new_pw) < 6:
        return Response({'detail': 'كلمة السر يجب أن تكون ٦ أحرف على الأقل.'}, status=400)

    # Match ALL six identifiers against a single student account.
    qs = User.objects.filter(
        role=User.Role.STUDENT,
        email__iexact=email,
        phone=phone,
        date_of_birth=dob,
        university_id=uni,
        college_id=col,
        pickup_point_id=pickup,
    )
    if qs.count() != 1:
        # Generic message → don't reveal which field(s) mismatched.
        return Response({'detail': 'البيانات المُدخلة غير مطابقة لأي حساب. تأكد من إدخال البيانات كما سجّلتها.'},
                        status=400)

    user = qs.first()
    user.set_password(new_pw)
    user.save(update_fields=['password'])
    return Response({'detail': 'تم تغيير كلمة السر بنجاح. يمكنك الآن تسجيل الدخول.'})
