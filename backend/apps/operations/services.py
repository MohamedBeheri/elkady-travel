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

    capacity = trip.total_seats
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

def build_seatmap(trip, viewer=None, is_staff=False):
    """Compute the per-seat state for a trip's seat map.

    States: empty · held · booked · term (locked for a term subscriber) · mine.
    """
    layout_id = trip.layout if trip.layout in LAYOUTS else DEFAULT_LAYOUT
    layout = LAYOUTS[layout_id]

    # Term locks on this route/slot, minus students absent on this date.
    locks = {}
    for lock in TermSeatLock.objects.filter(
        route=trip.route, morning_slot=trip.morning_slot, active=True,
    ).select_related('student'):
        absent = SeatAbsence.objects.filter(term_lock=lock, date=trip.date).exists()
        if not absent:
            locks[lock.seat_number] = lock

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
            'student': student_name if is_staff else ('أنت' if mine else ''),
        })
    return {'layout': layout, 'seats': seats}


def _seat_occupied(trip, seat_number, exclude_student=None):
    """True if the seat is taken (term lock w/o absence, or an active booking)."""
    lock = TermSeatLock.objects.filter(
        route=trip.route, morning_slot=trip.morning_slot,
        seat_number=seat_number, active=True,
    ).exclude(student=exclude_student).first() if exclude_student else \
        TermSeatLock.objects.filter(
            route=trip.route, morning_slot=trip.morning_slot,
            seat_number=seat_number, active=True).first()
    if lock and not SeatAbsence.objects.filter(term_lock=lock, date=trip.date).exists():
        return True
    q = trip.seat_requests.filter(
        seat_number=seat_number,
        status__in=[SeatRequest.Status.HELD, SeatRequest.Status.CONFIRMED],
    )
    if exclude_student:
        q = q.exclude(student=exclude_student)
    return q.exists()


@transaction.atomic
def book_specific_seat(*, trip, student, seat_number, university_id, priority_type, subscription):
    """Reserve a physical seat. Returns (kind, obj, message).

    kind is 'term' | 'seat'. Term subscribers lock the seat for the whole term
    and get it confirmed immediately; monthly subscribers get an immediate
    confirmation; daily/none go to HELD pending admin payment confirmation.
    """
    trip = DailyTrip.objects.select_for_update().get(pk=trip.pk)
    if seat_number not in seat_set(trip.layout):
        raise ValueError('رقم المقعد غير صحيح لهذه المركبة.')
    if _seat_occupied(trip, seat_number, exclude_student=student):
        raise ValueError('هذا المقعد محجوز بالفعل، اختر مقعداً آخر.')

    if priority_type == 'term':
        existing = TermSeatLock.objects.filter(
            student=student, route=trip.route, morning_slot=trip.morning_slot, active=True,
        ).first()
        if existing:
            raise ValueError(f'لديك مقعد ترم محجوز بالفعل رقم {existing.seat_number}.')
        lock = TermSeatLock.objects.create(
            student=student, subscription=subscription, route=trip.route,
            morning_slot=trip.morning_slot, seat_number=seat_number,
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
    # Otherwise a term lock → mark student absent for this date only.
    lock = TermSeatLock.objects.filter(
        route=trip.route, morning_slot=trip.morning_slot,
        seat_number=seat_number, active=True,
    ).first()
    if lock:
        SeatAbsence.objects.get_or_create(term_lock=lock, date=trip.date,
                                          defaults={'created_by': by_user})
        return 'term seat released for the day'
    return 'nothing to release'


def run_daily_allocation(date):
    """Run the deadline allocation for every trip on a given date (RULE 5)."""
    trips = DailyTrip.objects.filter(date=date)
    now = timezone.now()
    count = 0
    for trip in trips:
        allocate_trip(trip.pk)
        DailyTrip.objects.filter(pk=trip.pk).update(allocated_at=now)
        count += 1
    return count
