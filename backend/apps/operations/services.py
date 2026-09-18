"""Seat-allocation & waiting-list engine.

Core operational rules preserved here:
  RULE 1/2/3  Priority: TERM > MONTHLY > DAILY.
  RULE 7      Within a priority tier, order strictly by exact request timestamp.
  RULE 8      Confirmed seats never exceed trip capacity.
  RULE 11     Released seats are re-allocated to the next waiting student.
  RULE 13/race Allocation is transactional / atomic (row-locked per trip).
"""
import base64
import io
import uuid

from django.db import transaction
from django.utils import timezone

from .layouts import LAYOUTS, DEFAULT_LAYOUT, seat_set
from .models import DailyTrip, SeatAbsence, SeatRequest, TermSeatLock, PRIORITY_RANK


def make_qr(text):
    """Return a PNG data URI for the given text, or '' if qrcode is unavailable."""
    try:
        import qrcode
    except Exception:
        return ''
    img = qrcode.make(text, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def new_token():
    return uuid.uuid4().hex[:16].upper()


def _order_key(req):
    return (PRIORITY_RANK.get(req.priority_type, 9), req.requested_at)


@transaction.atomic
def allocate_trip(trip_id):
    """Recompute confirmed/waiting for one trip, atomically.

    Locks the trip row so two concurrent bookings/cancellations can't both
    claim the same seat (prevents overbooking & race conditions).
    """
    trip = DailyTrip.objects.select_for_update().get(pk=trip_id)

    # Active requests (not cancelled), globally ordered by priority then timestamp.
    reqs = list(
        SeatRequest.objects
        .filter(daily_trip=trip)
        .exclude(status=SeatRequest.Status.CANCELLED)
        .select_for_update()
    )
    reqs.sort(key=_order_key)

    capacity = trip.effective_capacity
    confirmed = 0
    for pos, req in enumerate(reqs, start=1):
        req.queue_position = pos
        if confirmed < capacity:
            new_status = SeatRequest.Status.CONFIRMED
            confirmed += 1
        else:
            new_status = SeatRequest.Status.WAITING
        # Only persist when something actually changed.
        req.status = new_status
        req.save(update_fields=['status', 'queue_position'])

    return trip


@transaction.atomic
def request_seat(*, daily_trip, student, subscription, priority_type, university_id, pickup_point_id):
    """Create (or reactivate) a seat request, then re-run allocation.

    Before the 10 PM deadline, priority (term/monthly) students are placed and
    confirmed immediately if capacity allows; daily students wait. After the
    deadline the same ordering is applied — allocate_trip is order-driven, so it
    is correct whenever it runs.
    """
    req, created = SeatRequest.objects.get_or_create(
        daily_trip=daily_trip, student=student,
        defaults={
            'subscription': subscription,
            'priority_type': priority_type,
            'university_id': university_id,
            'pickup_point_id': pickup_point_id,
            'status': SeatRequest.Status.WAITING,
        },
    )
    if not created and req.status == SeatRequest.Status.CANCELLED:
        # Re-joining: reset timestamp so the student takes a fair (new) position.
        req.status = SeatRequest.Status.WAITING
        req.requested_at = timezone.now()
        req.subscription = subscription
        req.priority_type = priority_type
        req.university_id = university_id
        req.pickup_point_id = pickup_point_id
        req.save()

    allocate_trip(daily_trip.pk)
    req.refresh_from_db()
    return req


@transaction.atomic
def cancel_seat(seat_request):
    """Release a seat (RULE 10) and promote the next waiting student (RULE 11)."""
    trip_id = seat_request.daily_trip_id
    seat_request.status = SeatRequest.Status.CANCELLED
    seat_request.queue_position = None
    seat_request.save(update_fields=['status', 'queue_position'])
    allocate_trip(trip_id)


# ---------------------------------------------------------------------------
# Interactive seat-map: state, booking, term locks, absences, admin release.
# ---------------------------------------------------------------------------

def _seat_gender_map(trip):
    """Return {seat_number: 'male'|'female'} designated by admin for this route/slot."""
    from apps.config_app.models import SeatCapacity
    cap = SeatCapacity.objects.filter(route=trip.route, morning_slot=trip.morning_slot).first()
    out = {}
    if not cap:
        return out

    def parse(s):
        return [int(x) for x in str(s).replace('،', ',').split(',') if x.strip().isdigit()]
    for n in parse(cap.female_seats):
        out[n] = 'female'
    for n in parse(cap.male_seats):
        out[n] = 'male'
    return out


def build_seatmap(trip, viewer=None, is_staff=False):
    """Compute the per-seat state for a trip's seat map.

    States: empty · held · booked · term (locked for a term subscriber) · mine.
    Each seat also carries a `gender` designation ('male'/'female'/'') set by admin.
    """
    layout_id = trip.layout if trip.layout in LAYOUTS else DEFAULT_LAYOUT
    layout = LAYOUTS[layout_id]
    genders = _seat_gender_map(trip)

    # Subscriber seat locks on this route/slot/direction — with day-of overrides:
    #   • SeatAbsence on this date → student is out today, seat freed.
    #   • DailySlotChoice on this date → student is riding on a DIFFERENT slot today
    #     (a) locks bound to this slot but overridden away are excluded.
    #     (b) locks bound to another slot but overridden HERE are included.
    from .models import DailySlotChoice as _Choice
    locks = {}
    default_locks = TermSeatLock.objects.filter(
        route=trip.route, active=True, direction=trip.direction,
        **({'return_slot': trip.return_slot} if trip.direction == 'return' else {'morning_slot': trip.morning_slot}),
    ).select_related('student')
    # (a) default locks minus absent/overridden-away for this date
    for lock in default_locks:
        if SeatAbsence.objects.filter(term_lock=lock, date=trip.date).exists():
            continue
        ch = _Choice.objects.filter(term_lock=lock, date=trip.date).first()
        if ch:
            ch_slot = ch.return_slot_id if trip.direction == 'return' else ch.morning_slot_id
            this_slot = trip.return_slot_id if trip.direction == 'return' else trip.morning_slot_id
            if ch_slot and ch_slot != this_slot:
                continue  # student chose a different slot today
        locks[lock.seat_number] = lock
    # (b) locks bound to another slot but overridden INTO this slot today
    slot_key = 'return_slot_id' if trip.direction == 'return' else 'morning_slot_id'
    slot_val = trip.return_slot_id if trip.direction == 'return' else trip.morning_slot_id
    if slot_val:
        for ch in _Choice.objects.filter(
            date=trip.date, term_lock__route=trip.route, term_lock__direction=trip.direction,
            term_lock__active=True, **{slot_key: slot_val},
        ).select_related('term_lock', 'term_lock__student'):
            lk = ch.term_lock
            # Don't overwrite a seat if the default holder is here (would collide).
            if lk.seat_number not in locks:
                locks[lk.seat_number] = lk

    # Per-trip bookings that hold a seat.
    reqs = {}
    for r in trip.seat_requests.filter(
        status__in=[SeatRequest.Status.HELD, SeatRequest.Status.CONFIRMED],
        seat_number__isnull=False,
    ).select_related('student'):
        reqs[r.seat_number] = r

    seats = []
    for n in sorted(seat_set(layout_id)):
        state, student_name, mine = 'empty', '', False
        if n in reqs:
            r = reqs[n]
            state = 'booked' if r.status == SeatRequest.Status.CONFIRMED else 'held'
            student_name = r.student.full_name or r.student.username
            mine = viewer is not None and r.student_id == viewer.id
        elif n in locks:
            lock = locks[n]
            state = 'term'
            student_name = lock.student.full_name or lock.student.username
            mine = viewer is not None and lock.student_id == viewer.id
        seats.append({
            'number': n,
            'state': 'mine' if mine else state,
            'raw_state': state,
            'gender': genders.get(n, ''),
            'student': student_name if is_staff else ('أنت' if mine else ''),
        })
    return {'layout': layout, 'seats': seats}


def _lock_filter_for(trip):
    """TermSeatLock filter kwargs matching this trip's route/slot/direction."""
    f = {'route': trip.route, 'active': True, 'direction': trip.direction}
    if trip.direction == 'return':
        f['return_slot'] = trip.return_slot
    else:
        f['morning_slot'] = trip.morning_slot
    return f


def _seat_occupied(trip, seat_number, exclude_student=None):
    """True if the seat is taken (subscriber lock w/o absence, or an active booking)."""
    lock_q = TermSeatLock.objects.filter(seat_number=seat_number, **_lock_filter_for(trip))
    if exclude_student:
        lock_q = lock_q.exclude(student=exclude_student)
    lock = lock_q.first()
    if lock and not SeatAbsence.objects.filter(term_lock=lock, date=trip.date).exists():
        return True
    q = trip.seat_requests.filter(
        seat_number=seat_number,
        status__in=[SeatRequest.Status.HELD, SeatRequest.Status.CONFIRMED],
    )
    if exclude_student:
        q = q.exclude(student=exclude_student)
    return q.exists()


def _first_free_seat_on_trip(trip, student):
    """Lowest bookable seat free on this trip and gender-compatible with the student."""
    genders = _seat_gender_map(trip)
    for n in sorted(seat_set(trip.layout if trip.layout in LAYOUTS else DEFAULT_LAYOUT)):
        if _seat_occupied(trip, n, exclude_student=student):
            continue
        g = genders.get(n, '')
        if g and student.gender and g != student.gender:
            continue
        return n
    return None


@transaction.atomic
def book_specific_seat(*, trip, student, seat_number, university_id, priority_type, subscription, pickup_point_id=None):
    """Reserve a physical seat. Returns (kind, obj, message).

    kind is 'term' | 'seat'. Term subscribers lock the seat for the whole term
    and get it confirmed immediately; monthly subscribers get an immediate
    confirmation; daily/none go to HELD pending admin payment confirmation.
    When ``seat_number`` is None (route with the seat map disabled) the system
    auto-assigns the lowest free gender-compatible seat.
    """
    trip = DailyTrip.objects.select_for_update().get(pk=trip.pk)
    if seat_number in (None, '', 0, '0'):
        seat_number = _first_free_seat_on_trip(trip, student)
        if not seat_number:
            raise ValueError('لا توجد مقاعد متاحة في هذه الرحلة.')
    seat_number = int(seat_number)
    if seat_number not in seat_set(trip.layout):
        raise ValueError('رقم المقعد غير صحيح لهذه المركبة.')
    if _seat_occupied(trip, seat_number, exclude_student=student):
        raise ValueError('هذا المقعد محجوز بالفعل، اختر مقعداً آخر.')
    # Gender-designated seats (admin-configured) must match the student's gender.
    seat_gender = _seat_gender_map(trip).get(seat_number, '')
    if seat_gender and student.gender and seat_gender != student.gender:
        label = 'الإناث' if seat_gender == 'female' else 'الذكور'
        raise ValueError(f'هذا المقعد مخصص لـ{label} فقط، اختر مقعداً آخر.')

    if priority_type == 'term':
        existing = TermSeatLock.objects.filter(
            student=student, **_lock_filter_for(trip),
        ).first()
        if existing:
            raise ValueError(f'لديك مقعد محجوز بالفعل رقم {existing.seat_number}.')
        lock = TermSeatLock.objects.create(
            student=student, subscription=subscription, route=trip.route,
            direction=trip.direction, morning_slot=trip.morning_slot,
            return_slot=trip.return_slot, seat_number=seat_number,
        )
        return 'term', lock, 'تم حجز مقعدك طوال الترم.'

    status = (SeatRequest.Status.CONFIRMED if priority_type == 'monthly'
              else SeatRequest.Status.HELD)
    req, _ = SeatRequest.objects.get_or_create(
        daily_trip=trip, student=student,
        defaults={'university_id': university_id, 'priority_type': priority_type,
                  'subscription': subscription},
    )
    req.seat_number = seat_number
    req.university_id = university_id
    req.priority_type = priority_type
    req.subscription = subscription
    if pickup_point_id:
        req.pickup_point_id = pickup_point_id
    req.status = status
    if status == SeatRequest.Status.CONFIRMED and not req.qr_token:
        req.qr_token = new_token()
    req.save()
    msg = ('تم تأكيد مقعدك.' if status == SeatRequest.Status.CONFIRMED
           else 'تم حجز المقعد مؤقتاً — بانتظار تأكيد الدفع من الإدارة.')
    return 'seat', req, msg


@transaction.atomic
def confirm_seat_payment(seat_request):
    """Admin marks a HELD daily booking as paid → CONFIRMED + QR ticket."""
    seat_request.status = SeatRequest.Status.CONFIRMED
    if not seat_request.qr_token:
        seat_request.qr_token = new_token()
    seat_request.save(update_fields=['status', 'qr_token'])
    return seat_request


@transaction.atomic
def release_seat(*, trip, seat_number, by_user=None):
    """Admin frees a seat (فحت). Term seats are freed for this date only (absence)."""
    # An active per-trip booking on the seat → cancel it.
    req = trip.seat_requests.filter(
        seat_number=seat_number,
        status__in=[SeatRequest.Status.HELD, SeatRequest.Status.CONFIRMED],
    ).first()
    if req:
        req.status = SeatRequest.Status.CANCELLED
        req.save(update_fields=['status'])
        return 'freed booking'
    # Otherwise a subscriber lock → mark student not-attending for this date only.
    lock = TermSeatLock.objects.filter(seat_number=seat_number, **_lock_filter_for(trip)).first()
    if lock:
        SeatAbsence.objects.get_or_create(term_lock=lock, date=trip.date,
                                          defaults={'created_by': by_user})
        return 'term seat released for the day'
    return 'nothing to release'


# ---------------------------------------------------------------------------
# Subscription fixed-seat assignment (term/monthly) — auto-assigned by admin/system.
# ---------------------------------------------------------------------------

def _first_free_seat(route, slot, direction, layout, student):
    """Lowest bookable seat free of other active locks and gender-compatible."""
    from apps.config_app.models import SeatCapacity
    taken = set(TermSeatLock.objects.filter(
        route=route, direction=direction, active=True,
        **({'return_slot': slot} if direction == 'return' else {'morning_slot': slot}),
    ).values_list('seat_number', flat=True))
    genders = {}
    if direction == 'go':
        cap = SeatCapacity.objects.filter(route=route, morning_slot=slot).first()
        if cap:
            def parse(s):
                return [int(x) for x in str(s).replace('،', ',').split(',') if x.strip().isdigit()]
            for n in parse(cap.female_seats):
                genders[n] = 'female'
            for n in parse(cap.male_seats):
                genders[n] = 'male'
    for n in sorted(seat_set(layout if layout in LAYOUTS else DEFAULT_LAYOUT)):
        if n in taken:
            continue
        g = genders.get(n, '')
        if g and student.gender and g != student.gender:
            continue
        return n
    return None


@transaction.atomic
def assign_subscription_seats(subscription, *, by_user=None, morning_slot=None,
                              return_slot=None, go_seat=None, return_seat=None):
    """Auto-assign the subscriber's fixed going + return seats for the whole period.

    Called when an admin confirms a term/monthly subscription. Slots default to the
    route's configured morning slot and the first return slot; seats to the lowest
    free gender-compatible seat. Any prior locks for this subscription are replaced.
    """
    from apps.config_app.models import MorningSlot, ReturnSlot, SeatCapacity
    route = subscription.route
    student = subscription.student
    cap = SeatCapacity.objects.filter(route=route).select_related('morning_slot').first()
    layout = cap.layout if cap else DEFAULT_LAYOUT
    # Respect the student's own choice on the subscription; only fall back to
    # sensible defaults if they didn't pick one (kept for legacy rows).
    if not morning_slot:
        morning_slot = (subscription.morning_slot
                        or (cap.morning_slot if cap and cap.morning_slot_id else None)
                        or MorningSlot.objects.filter(active=True).order_by('departure_time').first())
    if not return_slot:
        return_slot = (subscription.return_slot
                       or ReturnSlot.objects.filter(active=True).order_by('departure_time').first())

    TermSeatLock.objects.filter(subscription=subscription, active=True).update(active=False)
    created = {}
    if morning_slot:
        seat = go_seat or _first_free_seat(route, morning_slot, 'go', layout, student)
        if seat:
            created['go'] = TermSeatLock.objects.create(
                student=student, subscription=subscription, route=route,
                direction='go', morning_slot=morning_slot, seat_number=seat)
    if return_slot:
        seat = return_seat or _first_free_seat(route, return_slot, 'return', layout, student)
        if seat:
            created['return'] = TermSeatLock.objects.create(
                student=student, subscription=subscription, route=route,
                direction='return', return_slot=return_slot, seat_number=seat)
    return created


def run_daily_allocation(date):
    """Run the deadline allocation for every trip on a given date (RULE 5)."""
    trips = DailyTrip.objects.filter(date=date, direction='go')
    now = timezone.now()
    count = 0
    for trip in trips:
        allocate_trip(trip.pk)
        DailyTrip.objects.filter(pk=trip.pk).update(allocated_at=now)
        count += 1
    return count
