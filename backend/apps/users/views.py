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

    @action(detail=True, methods=['get'], url_path='full-profile')
    def full_profile(self, request, pk=None):
        """Admin dossier for one student: profile, every subscription (with
        payment proof), standing term/monthly seats, and ride history split
        into past/upcoming (from dated SeatRequest rows plus any explicit
        AttendanceConfirmation on a standing term/monthly seat, in either
        direction of time)."""
        from config.permissions import STAFF_ROLES
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        from django.utils import timezone
        from apps.bookings.models import Subscription
        from apps.bookings.serializers import SubscriptionSerializer
        from apps.operations.models import AttendanceConfirmation, DailyReschedule, SeatAbsence, SeatRequest, TermSeatLock

        student = self.get_object()
        today = timezone.localdate()

        subs = Subscription.objects.filter(student=student).select_related(
            'route', 'route__destination', 'university', 'pickup_point', 'payment_method',
        ).order_by('-created_at')

        locks = TermSeatLock.objects.filter(student=student, active=True).select_related(
            'route', 'morning_slot', 'return_slot')
        standing_seats = [{
            'route': l.route.name, 'direction': l.get_direction_display(),
            'slot': l.slot_label, 'seat': l.seat_number,
        } for l in locks]

        PRIORITY_LABEL = {'term': 'ترم', 'monthly': 'شهري', 'daily': 'يومي'}
        reqs = SeatRequest.objects.filter(student=student).exclude(
            status=SeatRequest.Status.CANCELLED,
        ).select_related(
            'daily_trip', 'daily_trip__route', 'daily_trip__morning_slot', 'daily_trip__return_slot',
        )
        # Trips this student reached via self-service reschedule (not their
        # original booking) — flagged in the history below as "مؤجل".
        rescheduled_trip_ids = set(
            DailyReschedule.objects.filter(student=student).values_list('new_trip_id', flat=True))

        past_trips, upcoming_trips = [], []
        for r in reqs:
            t = r.daily_trip
            slot = t.return_slot if t.direction == 'return' else t.morning_slot
            row = {
                'date': t.date, 'route': t.route.name, 'direction': t.get_direction_display(),
                'slot': slot.name if slot else '—', 'seat': r.seat_number,
                'kind': PRIORITY_LABEL.get(r.priority_type, r.priority_type),
                'status': r.status, 'status_display': r.get_status_display(),
                'confirmed_at': timezone.localtime(r.requested_at).strftime('%Y-%m-%d %H:%M'),
                'rescheduled': t.id in rescheduled_trip_ids,
            }
            (past_trips if t.date < today else upcoming_trips).append(row)

        # Standing term/monthly seats aren't tied to a date — but a rider who
        # explicitly confirmed "I will attend" for a date (the daily
        # attendance page) leaves an AttendanceConfirmation we can show here,
        # past or future, even if the lock has since been deactivated/renewed.
        confirmations = AttendanceConfirmation.objects.filter(
            term_lock__student=student,
        ).select_related(
            'term_lock__route', 'term_lock__morning_slot', 'term_lock__return_slot',
            'term_lock__subscription',
        )
        for c in confirmations:
            lock = c.term_lock
            row = {
                'date': c.date, 'route': lock.route.name, 'direction': lock.get_direction_display(),
                'slot': lock.slot_label, 'seat': lock.seat_number,
                'kind': PRIORITY_LABEL.get(
                    lock.subscription.subscription_type if lock.subscription_id else '', 'ثابت'),
                'status': 'confirmed', 'status_display': 'مؤكد الحضور',
                'confirmed_at': timezone.localtime(c.created_at).strftime('%Y-%m-%d %H:%M'),
            }
            (past_trips if c.date < today else upcoming_trips).append(row)

        past_trips.sort(key=lambda x: x['date'], reverse=True)
        upcoming_trips.sort(key=lambda x: x['date'])

        absences = SeatAbsence.objects.filter(term_lock__student=student).select_related(
            'term_lock__route').order_by('-date')[:20]
        absence_rows = [{
            'date': a.date, 'route': a.term_lock.route.name,
            'direction': a.term_lock.get_direction_display(),
        } for a in absences]

        return Response({
            'student': UserSerializer(student).data,
            'subscriptions': SubscriptionSerializer(subs, many=True).data,
            'standing_seats': standing_seats,
            'past_trips': past_trips,
            'upcoming_trips': upcoming_trips,
            'declared_absences': absence_rows,
        })

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
def password_reset_lookup(request):
    """Step 1 of forgot-password: verify the identifier belongs to a student.

    Body: {identifier: "<email or 11-digit phone>"}
    Returns 200 with {found: true, has_email: bool, has_phone: bool} if it matches
    a student account, 404 otherwise.
    """
    ident = (request.data.get('identifier') or '').strip()
    if not ident:
        return Response({'detail': 'أدخل البريد الإلكتروني أو رقم الموبايل.'}, status=400)

    if '@' in ident:
        u = User.objects.filter(role=User.Role.STUDENT, email__iexact=ident).first()
    else:
        u = User.objects.filter(role=User.Role.STUDENT, phone=ident).first()

    if not u:
        return Response({'detail': 'لا يوجد حساب مسجل بهذه البيانات.'}, status=404)

    return Response({
        'found': True,
        'has_email': bool(u.email),
        'has_phone': bool(u.phone),
    })


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
