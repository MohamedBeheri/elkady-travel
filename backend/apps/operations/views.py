from collections import defaultdict

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import STAFF_ROLES
from apps.bookings.models import Subscription
from apps.config_app.models import MorningSlot, Route, ReturnSlot, SeatCapacity
from apps.notifications.models import notify
from .layouts import LAYOUTS, layout_capacity
from .models import DailyTrip, ReturnBooking, SeatAbsence, SeatRequest, TermSeatLock
from .serializers import (
    DailyTripSerializer, ReturnBookingSerializer, SeatRequestSerializer,
)
from .services import (
    allocate_trip, book_specific_seat, build_seatmap, cancel_seat,
    confirm_seat_payment, make_qr, release_seat, request_seat, run_daily_allocation,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def layouts(request):
    """Vehicle seat layouts (bus50 / hiace15) for the interactive seat map."""
    return Response(LAYOUTS)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance(request):
    """A subscriber's fixed going/return seats for a date + attendance state.

    Used by the student's «تأكيد رحلة الغد» screen: each fixed seat can be kept
    (attending) or declined for that single date (frees the seat that day).
    """
    user = request.user
    date = request.query_params.get('date') or (
        timezone.localdate() + timezone.timedelta(days=1)).isoformat()
    locks = TermSeatLock.objects.filter(student=user, active=True).select_related(
        'route', 'morning_slot', 'return_slot', 'subscription')
    out = []
    for lock in locks:
        absent = SeatAbsence.objects.filter(term_lock=lock, date=date).exists()
        out.append({
            'lock_id': lock.id,
            'direction': lock.direction,
            'direction_display': 'عودة' if lock.direction == 'return' else 'ذهاب',
            'seat_number': lock.seat_number,
            'route': lock.route.name,
            'slot': lock.slot_label,
            'subscription_type': lock.subscription.subscription_type if lock.subscription_id else '',
            'attending': not absent,
        })
    return Response({'date': date, 'seats': out})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def set_attendance(request):
    """Student keeps (attending) or declines a fixed seat for one date.

    Declining creates a SeatAbsence → the seat is freed for that date only, while
    the permanent lock stays for every other day. Re-attending removes the absence.
    """
    user = request.user
    lock_id = request.data.get('lock_id')
    date = request.data.get('date')
    attending = request.data.get('attending')
    if lock_id is None or not date:
        return Response({'detail': 'البيانات ناقصة'}, status=400)
    try:
        lock = TermSeatLock.objects.get(pk=lock_id, student=user, active=True)
    except TermSeatLock.DoesNotExist:
        return Response({'detail': 'غير موجود'}, status=404)
    declining = attending in (False, 'false', 'False', 0, '0', 'no')
    if declining:
        SeatAbsence.objects.get_or_create(term_lock=lock, date=date, defaults={'created_by': user})
        return Response({'attending': False})
    SeatAbsence.objects.filter(term_lock=lock, date=date).delete()
    return Response({'attending': True})


def _get_or_create_trip(date, route, *, morning_slot=None, return_slot=None, direction='go'):
    """Fetch (or lazily create) the operational trip, seeding capacity/layout from config.

    ``direction='go'`` keys on ``morning_slot``; ``direction='return'`` keys on
    ``return_slot`` (reverse leg, same route) and inherits the route's vehicle layout.
    """
    if direction == 'return':
        trip = DailyTrip.objects.filter(
            date=date, route=route, return_slot=return_slot, direction='return').first()
        if trip:
            return trip
        cap = SeatCapacity.objects.filter(route=route).first()
        layout = cap.layout if cap else 'bus50'
        total = cap.total_seats if cap else layout_capacity(layout)
        return DailyTrip.objects.create(
            date=date, route=route, return_slot=return_slot, direction='return',
            layout=layout, total_seats=total)

    trip = DailyTrip.objects.filter(
        date=date, route=route, morning_slot=morning_slot, direction='go').first()
    if trip:
        return trip
    cap = SeatCapacity.objects.filter(route=route, morning_slot=morning_slot).first()
    layout = cap.layout if cap else 'bus50'
    total = cap.total_seats if cap else layout_capacity(layout)
    return DailyTrip.objects.create(
        date=date, route=route, morning_slot=morning_slot, direction='go',
        layout=layout, total_seats=total)


def _pickup_time_of(pickup_point_id, direction, slot_id):
    """Time (HH:MM) the bus passes this point under this slot/direction, or ''."""
    if not (pickup_point_id and slot_id):
        return ''
    from apps.config_app.models import PickupTime
    key = {'pickup_point_id': pickup_point_id, 'direction': direction}
    key['return_slot_id' if direction == 'return' else 'morning_slot_id'] = slot_id
    t = PickupTime.objects.filter(**key).first()
    return t.time.strftime('%H:%M') if t else ''


def _active_priority(student, route):
    """Best confirmed subscription tier for this student on this route (term>monthly>daily)."""
    subs = Subscription.objects.filter(
        student=student, route=route, status=Subscription.Status.CONFIRMED,
    ).values_list('subscription_type', flat=True)
    subs = set(subs)
    if 'term' in subs:
        return 'term', Subscription.objects.filter(
            student=student, route=route, subscription_type='term',
            status=Subscription.Status.CONFIRMED).first()
    if 'monthly' in subs:
        return 'monthly', Subscription.objects.filter(
            student=student, route=route, subscription_type='monthly',
            status=Subscription.Status.CONFIRMED).first()
    return 'daily', None


class DailyTripViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DailyTrip.objects.select_related('route', 'route__destination', 'morning_slot').all()
    serializer_class = DailyTripSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['date', 'route', 'morning_slot']

    @action(detail=False, methods=['get'], url_path='board')
    def board(self, request):
        """Admin operational board for a date, grouped by slot → route (§16)."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        date = request.query_params.get('date') or timezone.localdate().isoformat()
        trips = self.get_queryset().filter(date=date, direction='go')
        data = DailyTripSerializer(trips, many=True).data
        return Response({'date': date, 'trips': data})

    @action(detail=True, methods=['get'], url_path='passengers')
    def passengers(self, request, pk=None):
        """Passenger list for one trip, grouped by pickup point ordered by pickup time.

        Includes subscriber (term/monthly) fixed-seat holders + one-off bookings,
        with each point's time under this trip's slot so the driver knows the order.
        """
        trip = self.get_object()
        slot_id = trip.return_slot_id if trip.direction == 'return' else trip.morning_slot_id
        # Absences on this date free the term seats.
        absent_lock_ids = set(SeatAbsence.objects.filter(
            date=trip.date, term_lock__route=trip.route).values_list('term_lock_id', flat=True))
        # Subscriber fixed seats on this route/slot/direction (excluding today's absences).
        locks = TermSeatLock.objects.filter(
            route=trip.route, direction=trip.direction, active=True,
            **({'return_slot_id': slot_id} if trip.direction == 'return' else {'morning_slot_id': slot_id}),
        ).exclude(pk__in=absent_lock_ids).select_related(
            'student', 'subscription', 'subscription__university', 'subscription__pickup_point',
            'student__pickup_point')
        # One-off (daily) confirmed seat bookings for this trip.
        reqs = trip.seat_requests.filter(status=SeatRequest.Status.CONFIRMED).select_related(
            'student', 'university', 'pickup_point')

        # Bucket passengers by pickup point (id/name), each with the point's time.
        buckets: dict = {}  # pp_id -> {name, time, sequence, passengers[]}
        def add(pp, student, university_name, seat_number, kind_label):
            pp_id = pp.id if pp else 0
            b = buckets.get(pp_id)
            if not b:
                t = _pickup_time_of(pp_id, trip.direction, slot_id) if pp else ''
                b = buckets[pp_id] = {
                    'pickup_id': pp_id, 'pickup': pp.name if pp else 'غير محدد',
                    'sequence': pp.sequence if pp else 9999, 'time': t, 'passengers': [],
                }
            b['passengers'].append({
                'student_name': student.full_name or student.username,
                'student_phone': student.phone or '',
                'university': university_name or '',
                'seat_number': seat_number, 'kind': kind_label,
            })
        for lock in locks:
            pp = lock.subscription.pickup_point if (lock.subscription_id and lock.subscription.pickup_point_id) else lock.student.pickup_point
            uni_name = lock.subscription.university.name if (lock.subscription_id and lock.subscription.university_id) else ''
            sub_label = lock.subscription.get_subscription_type_display() if lock.subscription_id else 'اشتراك'
            add(pp, lock.student, uni_name, lock.seat_number, sub_label)
        for r in reqs:
            add(r.pickup_point, r.student, r.university.name if r.university_id else '', r.seat_number, 'يومي')

        # Sort: first by the point's time (empty last), then by sequence.
        def key(g): return (g['time'] or '99:99', g['sequence'])
        groups = sorted(buckets.values(), key=key)
        for g in groups:
            g['passengers'].sort(key=lambda p: (p['university'], p['student_name']))
        return Response({
            'trip': DailyTripSerializer(trip).data,
            'total': sum(len(g['passengers']) for g in groups),
            'groups': groups,
        })

    @action(detail=True, methods=['get'], url_path='seatmap')
    def seatmap(self, request, pk=None):
        """Interactive seat map for a trip: per-seat state for the current viewer."""
        trip = self.get_object()
        is_staff = request.user.role in STAFF_ROLES
        data = build_seatmap(trip, viewer=request.user, is_staff=is_staff)
        return Response({'trip': DailyTripSerializer(trip).data, **data})

    @action(detail=False, methods=['get'], url_path='seatmap-for')
    def seatmap_for(self, request):
        """Seat map by date/route/slot (creates the trip lazily) for the booking flow.

        ``direction=return`` reads ``return_slot`` instead of ``morning_slot``.
        """
        date = request.query_params.get('date')
        route_id = request.query_params.get('route')
        direction = request.query_params.get('direction', 'go')
        if not (date and route_id):
            return Response({'detail': 'البيانات ناقصة'}, status=400)
        route = Route.objects.get(pk=route_id)
        if direction == 'return':
            rs_id = request.query_params.get('return_slot')
            if not rs_id:
                return Response({'detail': 'البيانات ناقصة'}, status=400)
            trip = _get_or_create_trip(date, route, return_slot=ReturnSlot.objects.get(pk=rs_id), direction='return')
        else:
            slot_id = request.query_params.get('morning_slot')
            if not slot_id:
                return Response({'detail': 'البيانات ناقصة'}, status=400)
            trip = _get_or_create_trip(date, route, morning_slot=MorningSlot.objects.get(pk=slot_id))
        is_staff = request.user.role in STAFF_ROLES
        data = build_seatmap(trip, viewer=request.user, is_staff=is_staff)
        return Response({'trip': DailyTripSerializer(trip).data, **data})

    @action(detail=True, methods=['post'], url_path='release-seat')
    def release_seat_action(self, request, pk=None):
        """Admin frees a seat (فحت). Term seats freed for this date only (absence)."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        trip = self.get_object()
        seat = int(request.data.get('seat_number'))
        result = release_seat(trip=trip, seat_number=seat, by_user=request.user)
        return Response({'ok': True, 'result': result})

    @action(detail=True, methods=['post'], url_path='allocate')
    def allocate(self, request, pk=None):
        """Manually trigger allocation for one trip."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        allocate_trip(int(pk))
        trip = self.get_object()
        return Response(DailyTripSerializer(trip).data)

    @action(detail=False, methods=['post'], url_path='run-allocation')
    def run_allocation(self, request):
        """Run the 10 PM deadline allocation across all trips of a date (§12)."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        date = request.data.get('date') or timezone.localdate().isoformat()
        count = run_daily_allocation(date)
        # Notify newly confirmed / still-waiting students.
        for trip in DailyTrip.objects.filter(date=date, direction='go'):
            for r in trip.seat_requests.exclude(status=SeatRequest.Status.CANCELLED).select_related('student'):
                if r.status == SeatRequest.Status.CONFIRMED:
                    notify(r.student, 'تم تأكيد مقعدك', f'رحلة {trip.date} - {trip.route}',
                           link='/daily', severity='success')
                else:
                    notify(r.student, 'أنت في قائمة الانتظار',
                           f'ترتيبك {r.queue_position} لرحلة {trip.date} - {trip.route}',
                           link='/daily', severity='warning')
        return Response({'allocated_trips': count, 'date': date})


class SeatRequestViewSet(viewsets.ModelViewSet):
    queryset = SeatRequest.objects.select_related(
        'daily_trip', 'daily_trip__route', 'student', 'university', 'pickup_point',
    ).all()
    serializer_class = SeatRequestSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'daily_trip', 'student', 'priority_type']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'student':
            return qs.filter(student=self.request.user)
        return qs

    @action(detail=False, methods=['post'], url_path='book')
    def book(self, request):
        """Student books tomorrow's daily seat. Priority derives from confirmed subscription."""
        user = request.user
        date = request.data.get('date')
        route_id = request.data.get('route')
        slot_id = request.data.get('morning_slot')
        university_id = request.data.get('university') or (user.university_id)
        pickup_id = request.data.get('pickup_point')
        if not (date and route_id and slot_id and university_id):
            return Response({'detail': 'البيانات ناقصة'}, status=400)

        route = Route.objects.get(pk=route_id)
        slot = MorningSlot.objects.get(pk=slot_id)
        trip = _get_or_create_trip(date, route, morning_slot=slot)
        priority_type, sub = _active_priority(user, route)

        req = request_seat(
            daily_trip=trip, student=user, subscription=sub,
            priority_type=priority_type, university_id=university_id,
            pickup_point_id=pickup_id,
        )
        return Response(SeatRequestSerializer(req).data, status=201)

    @action(detail=False, methods=['post'], url_path='book-seat')
    def book_seat(self, request):
        """Student picks a specific seat on the seat map (going or return leg)."""
        user = request.user
        date = request.data.get('date')
        route_id = request.data.get('route')
        direction = request.data.get('direction', 'go')
        seat_number = request.data.get('seat_number')  # optional: None → auto-assign
        pickup_id = request.data.get('pickup_point')
        university_id = request.data.get('university') or user.university_id
        if not (date and route_id and university_id):
            return Response({'detail': 'البيانات ناقصة'}, status=400)

        route = Route.objects.get(pk=route_id)
        if direction == 'return':
            rs_id = request.data.get('return_slot')
            if not rs_id:
                return Response({'detail': 'البيانات ناقصة'}, status=400)
            trip = _get_or_create_trip(date, route, return_slot=ReturnSlot.objects.get(pk=rs_id), direction='return')
            # Return legs are booked/paid separately (no term/monthly seat priority).
            priority_type, sub = 'daily', None
        else:
            slot_id = request.data.get('morning_slot')
            if not slot_id:
                return Response({'detail': 'البيانات ناقصة'}, status=400)
            trip = _get_or_create_trip(date, route, morning_slot=MorningSlot.objects.get(pk=slot_id))
            priority_type, sub = _active_priority(user, route)
        try:
            kind, obj, msg = book_specific_seat(
                trip=trip, student=user, seat_number=seat_number,
                university_id=university_id, priority_type=priority_type, subscription=sub,
                pickup_point_id=pickup_id,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=409)
        assigned = getattr(obj, 'seat_number', None)
        return Response({'kind': kind, 'message': msg, 'seat_number': assigned}, status=201)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Admin confirms a HELD daily booking's payment → CONFIRMED + QR."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        req = self.get_object()
        confirm_seat_payment(req)
        notify(req.student, 'تم تأكيد مقعدك',
               f'مقعد رقم {req.seat_number} — رحلة {req.daily_trip.date}',
               link='/tickets', severity='success')
        return Response(SeatRequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a seat → releases it and promotes next in line (RULE 10/11)."""
        req = self.get_object()
        cancel_seat(req)
        req.refresh_from_db()
        return Response(SeatRequestSerializer(req).data)

    @action(detail=False, methods=['get'])
    def tickets(self, request):
        """The student's active seat tickets (per-trip bookings + term seat) with QR."""
        user = request.user
        out = []
        reqs = SeatRequest.objects.filter(
            student=user, seat_number__isnull=False,
            status__in=[SeatRequest.Status.HELD, SeatRequest.Status.CONFIRMED],
        ).select_related('daily_trip', 'daily_trip__route', 'daily_trip__morning_slot', 'daily_trip__return_slot')
        for r in reqs:
            confirmed = r.status == SeatRequest.Status.CONFIRMED
            trip = r.daily_trip
            dir_label = 'عودة' if trip.direction == 'return' else 'ذهاب'
            slot_id = trip.return_slot_id if trip.direction == 'return' else trip.morning_slot_id
            pickup_time = _pickup_time_of(r.pickup_point_id or (user.pickup_point_id), trip.direction, slot_id)
            pickup_name = r.pickup_point.name if r.pickup_point_id else (user.pickup_point.name if user.pickup_point_id else '')
            payload = f'ELKADY|{r.qr_token or "-"}|مقعد {r.seat_number}|{trip.date}|{trip.route.name}|{dir_label}|{user.full_name}'
            out.append({
                'kind': 'daily', 'id': r.id, 'seat_number': r.seat_number,
                'date': str(trip.date), 'route': trip.route.name,
                'direction': trip.direction, 'direction_display': dir_label,
                'slot': trip.slot_label, 'status': r.status,
                'status_display': r.get_status_display(),
                'pickup_name': pickup_name, 'pickup_time': pickup_time,
                'qr': make_qr(payload) if confirmed else '', 'token': r.qr_token,
            })
        for lock in TermSeatLock.objects.filter(student=user, active=True).select_related(
                'route', 'morning_slot', 'return_slot', 'subscription',
                'subscription__pickup_point'):
            dir_label = 'عودة' if lock.direction == 'return' else 'ذهاب'
            sub_label = lock.subscription.get_subscription_type_display() if lock.subscription_id else 'اشتراك'
            pp = lock.subscription.pickup_point if (lock.subscription_id and lock.subscription.pickup_point_id) else user.pickup_point
            slot_id = lock.return_slot_id if lock.direction == 'return' else lock.morning_slot_id
            pickup_time = _pickup_time_of(pp.id if pp else None, lock.direction, slot_id)
            payload = f'ELKADY|SUB|مقعد {lock.seat_number}|{lock.route.name}|{dir_label}|{lock.slot_label}|{user.full_name}'
            out.append({
                'kind': 'term', 'id': lock.id, 'seat_number': lock.seat_number,
                'date': f'طوال المدة ({sub_label})', 'route': lock.route.name,
                'direction': lock.direction, 'direction_display': dir_label,
                'slot': lock.slot_label,
                'status': 'confirmed', 'status_display': f'مؤكد ({sub_label} - {dir_label})',
                'pickup_name': pp.name if pp else '', 'pickup_time': pickup_time,
                'qr': make_qr(payload), 'token': f'SUB-{lock.id}',
            })
        return Response(out)


class ReturnBookingViewSet(viewsets.ModelViewSet):
    queryset = ReturnBooking.objects.select_related(
        'student', 'return_slot', 'university',
    ).all()
    serializer_class = ReturnBookingSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['date', 'return_slot', 'university', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'student':
            return qs.filter(student=self.request.user)
        return qs

    @action(detail=False, methods=['get'], url_path='availability')
    def availability(self, request):
        """Seats left per return slot for a date (§14)."""
        date = request.query_params.get('date') or timezone.localdate().isoformat()
        slots = ReturnSlot.objects.filter(active=True)
        taken = dict(
            ReturnBooking.objects.filter(date=date, status=ReturnBooking.Status.CONFIRMED)
            .values_list('return_slot').annotate(c=Count('id'))
        )
        out = []
        for s in slots:
            used = taken.get(s.id, 0)
            out.append({
                'id': s.id, 'name': s.name,
                'departure_time': s.departure_time.strftime('%H:%M'),
                'capacity': s.capacity, 'used': used,
                'available': max(s.capacity - used, 0),
                'full': used >= s.capacity,
            })
        return Response({'date': date, 'slots': out})

    @action(detail=False, methods=['post'], url_path='book')
    def book(self, request):
        """Book a return seat if capacity allows."""
        user = request.user
        date = request.data.get('date')
        slot_id = request.data.get('return_slot')
        university_id = request.data.get('university') or user.university_id
        if not (date and slot_id and university_id):
            return Response({'detail': 'البيانات ناقصة'}, status=400)
        slot = ReturnSlot.objects.get(pk=slot_id)
        used = ReturnBooking.objects.filter(
            date=date, return_slot=slot, status=ReturnBooking.Status.CONFIRMED).count()
        if used >= slot.capacity:
            return Response({'detail': 'لا توجد مقاعد متاحة لهذا الموعد.'}, status=409)
        booking, _ = ReturnBooking.objects.update_or_create(
            student=user, date=date,
            defaults={'return_slot': slot, 'university_id': university_id,
                      'route_id': request.data.get('route'),
                      'status': ReturnBooking.Status.CONFIRMED},
        )
        return Response(ReturnBookingSerializer(booking).data, status=201)

    @action(detail=True, methods=['post'], url_path='change')
    def change(self, request, pk=None):
        """Change return time only if the new slot has room (RULE 9: reserve new, then release old)."""
        booking = self.get_object()
        new_slot_id = request.data.get('return_slot')
        slot = ReturnSlot.objects.get(pk=new_slot_id)
        used = ReturnBooking.objects.filter(
            date=booking.date, return_slot=slot, status=ReturnBooking.Status.CONFIRMED,
        ).exclude(pk=booking.pk).count()
        if used >= slot.capacity:
            return Response({'detail': 'لا توجد مقاعد متاحة لهذا الموعد.'}, status=409)
        booking.return_slot = slot
        booking.save(update_fields=['return_slot'])
        return Response(ReturnBookingSerializer(booking).data)

    @action(detail=False, methods=['get'], url_path='passengers')
    def passengers(self, request):
        """Return passenger list for a slot, grouped by university (§17)."""
        if request.user.role not in STAFF_ROLES:
            return Response(status=403)
        date = request.query_params.get('date') or timezone.localdate().isoformat()
        slot_id = request.query_params.get('return_slot')
        qs = ReturnBooking.objects.filter(date=date, status=ReturnBooking.Status.CONFIRMED)
        if slot_id:
            qs = qs.filter(return_slot_id=slot_id)
        qs = qs.select_related('student', 'university', 'return_slot').order_by(
            'return_slot__departure_time', 'university__name', 'student__full_name')
        by_uni = defaultdict(list)
        for b in qs:
            by_uni[b.university.name].append(ReturnBookingSerializer(b).data)
        groups = [{'university': k, 'passengers': v} for k, v in by_uni.items()]
        return Response({'date': date, 'groups': groups})
