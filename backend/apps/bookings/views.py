import django_filters
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import STAFF_ROLES
from apps.config_app.models import CompanySettings
from apps.notifications.models import notify, notify_staff
from .models import Subscription
from .serializers import SubscriptionCreateSerializer, SubscriptionSerializer


class SubscriptionFilter(django_filters.FilterSet):
    # Daily bookings are stored as daily_go / daily_return / daily_round, so a
    # plain ?subscription_type=daily used to match nothing. Treat the bare value
    # "daily" as the whole daily family so the «يومي» filter lists them all.
    subscription_type = django_filters.CharFilter(method='filter_subscription_type')

    class Meta:
        model = Subscription
        fields = ['status', 'subscription_type', 'route', 'university', 'student', 'pickup_point']

    def filter_subscription_type(self, queryset, name, value):
        if value == 'daily':
            return queryset.filter(subscription_type__startswith='daily')
        return queryset.filter(subscription_type=value)


class SubscriptionViewSet(viewsets.ModelViewSet):
    queryset = Subscription.objects.select_related(
        'student', 'route', 'route__destination', 'route__return_destination',
        'university', 'pickup_point', 'payment_method',
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_class = SubscriptionFilter
    search_fields = ['student__full_name', 'student__national_id', 'student__phone']
    ordering_fields = ['student__full_name', 'created_at', 'amount']

    def get_serializer_class(self):
        if self.action == 'create':
            return SubscriptionCreateSerializer
        return SubscriptionSerializer

    def create(self, request, *args, **kwargs):
        if request.user.role not in STAFF_ROLES:
            stype = (request.data.get('subscription_type') or '').strip()
            cs = CompanySettings.load()
            if stype == 'term' and not cs.booking_term_open:
                raise PermissionDenied('حجز اشتراك الترم مغلق حالياً من الإدارة')
            if stype == 'monthly' and not cs.booking_monthly_open:
                raise PermissionDenied('حجز الاشتراك الشهري مغلق حالياً من الإدارة')
            if stype.startswith('daily') and not cs.booking_daily_open:
                raise PermissionDenied('الحجز اليومي مغلق حالياً من الإدارة')
            # Prevent a student from stacking duplicate term/monthly subscriptions.
            if stype in ('term', 'monthly'):
                live = Subscription.objects.filter(
                    student=request.user, subscription_type=stype,
                    status__in=[
                        Subscription.Status.PAYMENT_PENDING, Subscription.Status.PAYMENT_SUBMITTED,
                        Subscription.Status.UNDER_REVIEW, Subscription.Status.CONFIRMED,
                    ],
                ).exists()
                if live:
                    label = 'ترم' if stype == 'term' else 'شهري'
                    raise PermissionDenied(
                        f'لديك اشتراك {label} قائم بالفعل — لا يمكن إنشاء اشتراك آخر من نفس النوع. '
                        f'راجع «حجوزاتي» أو تواصل مع الإدارة.')
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Only staff may hard-delete a subscription record."""
        if request.user.role not in STAFF_ROLES:
            return Response({'detail': 'غير مصرح بالحذف'}, status=403)
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'student':
            return qs.filter(student=self.request.user)
        center = self.request.query_params.get('center')
        if center:
            qs = qs.filter(pickup_point__center=center)
        ordering = self.request.query_params.get('ordering')
        if ordering in ('student__full_name', '-student__full_name', 'amount', '-amount', 'created_at', '-created_at'):
            qs = qs.order_by(ordering)
        return qs

    @action(detail=True, methods=['post'], url_path='submit-payment')
    def submit_payment(self, request, pk=None):
        """Student uploads proof: method, reference, screenshot. Enters review queue."""
        sub = self.get_object()
        sub.payment_method_id = request.data.get('payment_method') or sub.payment_method_id
        sub.payment_reference = request.data.get('payment_reference', sub.payment_reference)
        if 'payment_proof' in request.FILES:
            sub.payment_proof = request.FILES['payment_proof']
        sub.save()
        sub.submit_payment()  # RULE 12: still requires admin approval
        if request.user.role not in STAFF_ROLES:
            notify_staff(
                'إثبات دفع جديد',
                f'{sub.student.full_name or sub.student.username} رفع إثبات دفع لاشتراك {sub.get_subscription_type_display()}',
                link='/payments', severity='info',
            )
        return Response(SubscriptionSerializer(sub).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Admin verifies payment → booking CONFIRMED (RULE 13).

        For term/monthly, the system auto-assigns the student's fixed going +
        return seats for the whole period (admin may override slots/seats).
        """
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        sub = self.get_object()
        sub.approve(request.user)

        seat_msg = ''
        seat_warning = ''
        if sub.subscription_type in ('term', 'monthly'):
            from apps.operations.services import assign_subscription_seats
            d = request.data
            created = assign_subscription_seats(
                sub, by_user=request.user,
                go_seat=d.get('go_seat') or None,
                return_seat=d.get('return_seat') or None,
            )
            parts = []
            if created.get('go'):
                parts.append(f"ذهاب مقعد {created['go'].seat_number}")
            if created.get('return'):
                parts.append(f"عودة مقعد {created['return'].seat_number}")
            seat_msg = (' — ' + '، '.join(parts)) if parts else ''
            # The subscription stays CONFIRMED (the student paid), but if no
            # free seat was found on the default slot the student gets no
            # ticket — say so loudly instead of failing silently.
            missing = [lbl for key, lbl in (('go', 'الذهاب'), ('return', 'العودة')) if not created.get(key)]
            if missing:
                seat_warning = (
                    f'تم تأكيد الاشتراك لكن لم يُخصَّص مقعد {" و".join(missing)} — '
                    f'الميعاد ممتلئ على خط {sub.route} أو لا يوجد مقعد مناسب لنوع الطالب. '
                    f'الطالب لن تظهر له تذكرة حتى يُخصَّص له مقعد (بعد زيادة سعة الخط أو تفريغ مقعد).')
                notify_staff('اشتراك مؤكد بدون مقعد',
                             f'{sub.student.full_name or sub.student.username}: {seat_warning}',
                             link='/subscriptions', severity='warning')
        elif sub.subscription_type.startswith('daily'):
            # Daily: the seat(s) were HELD at booking — confirm them + issue QR.
            from apps.operations.models import SeatRequest as _SR
            from apps.operations.services import confirm_seat_payment
            parts = []
            for req in sub.seat_requests.filter(status=_SR.Status.HELD):
                confirm_seat_payment(req)
                parts.append(f"مقعد {req.seat_number}")
            seat_msg = (' — ' + '، '.join(parts)) if parts else ''

        pending_seat = ' — سيتم تخصيص مقعدك من الإدارة قريباً وتظهر تذكرتك بعدها' if seat_warning else ''
        notify(sub.student, 'تم تأكيد اشتراكك',
               f'تم تأكيد اشتراك {sub.get_subscription_type_display()} على {sub.route}{seat_msg}{pending_seat}',
               link='/tickets', severity='success')
        data = SubscriptionSerializer(sub).data
        data['seat_warning'] = seat_warning
        return Response(data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        sub = self.get_object()
        reason = request.data.get('rejection_reason', '')
        sub.reject(request.user, reason)
        # A rejected term/monthly subscription must not keep its standing seat —
        # otherwise the seat stays «taken» forever and blocks new subscribers.
        from apps.operations.models import TermSeatLock
        TermSeatLock.objects.filter(subscription=sub, active=True).update(active=False)
        # Daily: free the seats that were HELD for this rejected booking.
        if sub.subscription_type.startswith('daily'):
            from apps.operations.models import SeatRequest as _SR
            sub.seat_requests.filter(status=_SR.Status.HELD).update(status=_SR.Status.CANCELLED)
        notify(sub.student, 'تم رفض إثبات الدفع', reason or 'يرجى إعادة رفع إثبات دفع صحيح',
               link='/bookings', severity='error')
        return Response(SubscriptionSerializer(sub).data)

    @action(detail=True, methods=['post'], url_path='mark-notified')
    def mark_notified(self, request, pk=None):
        """Stamp whatsapp_notified_at so the admin UI can dim already-contacted rows."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        from django.utils import timezone
        sub = self.get_object()
        sub.whatsapp_notified_at = timezone.now()
        sub.save(update_fields=['whatsapp_notified_at', 'updated_at'])
        return Response(SubscriptionSerializer(sub).data)

    @action(detail=True, methods=['post'], url_path='clear-notified')
    def clear_notified(self, request, pk=None):
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        sub = self.get_object()
        sub.whatsapp_notified_at = None
        sub.save(update_fields=['whatsapp_notified_at', 'updated_at'])
        return Response(SubscriptionSerializer(sub).data)

    def _missing_seat_qs(self):
        from apps.operations.models import TermSeatLock
        from django.db.models import Count, Q
        return (Subscription.objects
                .filter(subscription_type__in=['term', 'monthly'], status=Subscription.Status.CONFIRMED)
                .annotate(n_locks=Count('term_seats', filter=Q(term_seats__active=True), distinct=True))
                .filter(n_locks__lt=2)
                .select_related('student', 'route', 'route__destination', 'route__return_destination',
                                'university', 'pickup_point', 'payment_method')
                .order_by('route_id', 'verified_at'))

    @action(detail=False, methods=['get'], url_path='missing-seats')
    def missing_seats(self, request):
        """READ-ONLY: confirmed term/monthly subscriptions missing a seat (no ticket), with why."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        from apps.operations.services import missing_seat_report
        out = []
        for sub in self._missing_seat_qs():
            legs = missing_seat_report(sub)
            if not legs:
                continue
            row = SubscriptionSerializer(sub).data
            row['missing_legs'] = legs
            row['can_fill'] = any(l['free_seat'] for l in legs)
            out.append(row)
        return Response(out)

    @action(detail=True, methods=['post'], url_path='fill-seats')
    def fill_seats(self, request, pk=None):
        """Assign a seat for the missing direction(s) only — never moves an existing seat."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        sub = self.get_object()
        if sub.status != Subscription.Status.CONFIRMED or sub.subscription_type not in ('term', 'monthly'):
            return Response({'detail': 'متاح فقط لاشتراكات الترم/الشهري المؤكدة'}, status=400)
        from apps.operations.services import fill_missing_subscription_seats
        made = fill_missing_subscription_seats(sub)
        got = [('ذهاب' if k == 'go' else 'عودة') for k, v in made.items() if v]
        still = [('ذهاب' if k == 'go' else 'عودة') for k, v in made.items() if not v]
        if got:
            notify(sub.student, 'تم تخصيص مقعدك',
                   f'تم تخصيص مقعد {" و".join(got)} لاشتراكك على {sub.route} — تذكرتك ظاهرة الآن',
                   link='/tickets', severity='success')
        return Response({'assigned': got, 'still_missing': still})

    @action(detail=False, methods=['get'], url_path='payment-queue')
    def payment_queue(self, request):
        """Admin queue of payments awaiting review."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        qs = self.get_queryset().filter(status__in=[
            Subscription.Status.PAYMENT_SUBMITTED, Subscription.Status.UNDER_REVIEW,
        ])
        page = self.paginate_queryset(qs)
        ser = SubscriptionSerializer(page or qs, many=True)
        return self.get_paginated_response(ser.data) if page is not None else Response(ser.data)
