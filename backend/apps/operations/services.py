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
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from .layouts import LAYOUTS, DEFAULT_LAYOUT, layout_capacity, seat_set
from .models import (
    AttendanceConfirmation, DailyReschedule, DailyTrip, SeatAbsence, SeatRequest, TermSeatLock, PRIORITY_RANK,
)


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
    #   • A seat only counts as occupied once the rider explicitly confirmed
    #     attendance for THIS date (AttendanceConfirmation) — a standing lock no
    #     longer holds the seat by default; silence/no-response frees it.
    #   • SeatAbsence on this date → student is out today, seat freed.
    #   • DailySlotChoice on this date → student is riding on a DIFFERENT slot today
    #     (a) locks bound to this slot but overridden away are excluded.
    #     (b) locks bound to another slot but overridden HERE are included.
    from .models import DailySlotChoice as _Choice
    confirmed_ids = set(AttendanceConfirmation.objects.filter(date=trip.date).values_list('term_lock_id', flat=True))
    locks = {}
    default_locks = TermSeatLock.objects.filter(
        route=trip.route, active=True, direction=trip.direction,
        **({'return_slot': trip.return_slot} if trip.direction == 'return' else {'morning_slot': trip.morning_slot}),
    ).select_related('student')
    # (a) default locks minus absent/overridden-away for this date, and only if confirmed
    for lock in default_locks:
        if lock.id not in confirmed_ids:
            continue
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
            if lk.id not in confirmed_ids:
                continue
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
    """True if the seat is taken: a subscriber lock whose rider explicitly
    confirmed attendance for this date (and didn't also mark absence), or an
    active one-off booking."""
    lock_q = TermSeatLock.objects.filter(seat_number=seat_number, **_lock_filter_for(trip))
    if exclude_student:
        lock_q = lock_q.exclude(student=exclude_student)
    lock = lock_q.first()
    if lock and AttendanceConfirmation.objects.filter(term_lock=lock, date=trip.date).exists() \
            and not SeatAbsence.objects.filter(term_lock=lock, date=trip.date).exists():
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


def leg_departure_at(trip):
    """Timezone-aware datetime the given trip actually departs, or None if the
    slot has no configured time."""
    slot = trip.return_slot if trip.direction == 'return' else trip.morning_slot
    t = slot.departure_time if slot else None
    if not t:
        return None
    naive = datetime.combine(trip.date, t)
    return naive if timezone.is_aware(naive) else timezone.make_aware(naive)


def reschedule_lead_hours_left(reqs):
    """Hours remaining (server clock) before the EARLIEST leg among these
    confirmed SeatRequests departs, or None if none of them have a known time."""
    times = [leg_departure_at(r.daily_trip) for r in reqs]
    times = [t for t in times if t]
    if not times:
        return None
    return (min(times) - timezone.now()).total_seconds() / 3600


@transaction.atomic
def reschedule_seat(*, trip, student, university_id, subscription, pickup_point_id=None):
    """Move an already-PAID daily booking onto a different trip, confirmed
    immediately — no HELD/payment step, since the student already paid for
    this subscription. Raises ValueError if the target trip has no room.
    """
    trip = DailyTrip.objects.select_for_update().get(pk=trip.pk)
    seat_number = _first_free_seat_on_trip(trip, student)
    if not seat_number:
        raise ValueError('لا توجد مقاعد متاحة في هذا الميعاد، برجاء اختيار ميعاد آخر.')
    req, _ = SeatRequest.objects.get_or_create(
        daily_trip=trip, student=student,
        defaults={'university_id': university_id, 'priority_type': 'daily', 'subscription': subscription},
    )
    req.seat_number = seat_number
    req.university_id = university_id
    req.priority_type = 'daily'
    req.subscription = subscription
    if pickup_point_id:
        req.pickup_point_id = pickup_point_id
    req.status = SeatRequest.Status.CONFIRMED
    if not req.qr_token:
        req.qr_token = new_token()
    req.save()
    return req


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


def auto_close_attendance(date):
    """Lock tomorrow's term/monthly attendance: anyone who neither confirmed nor
    declined is treated as absent for this date only (their seat is freed), then
    the normal allocation runs so the daily waiting list can claim freed seats.

    Idempotent — calling it again after it already ran for `date` is a no-op for
    the locks it already processed (they now have a SeatAbsence row).
    """
    confirmed_ids = set(AttendanceConfirmation.objects.filter(date=date).values_list('term_lock_id', flat=True))
    absent_ids = set(SeatAbsence.objects.filter(date=date).values_list('term_lock_id', flat=True))
    silent = TermSeatLock.objects.filter(active=True).exclude(pk__in=confirmed_ids | absent_ids)
    made_absent = SeatAbsence.objects.bulk_create(
        [SeatAbsence(term_lock=lock, date=date) for lock in silent])
    run_daily_allocation(date)
    return len(made_absent)


def _get_or_create_trip(date, route, *, morning_slot=None, return_slot=None, direction='go'):
    """Fetch (or lazily create) the operational trip, seeding capacity/layout from config.

    ``direction='go'`` keys on ``morning_slot``; ``direction='return'`` keys on
    ``return_slot`` (reverse leg, same route) and inherits the route's vehicle layout.
    """
    from apps.config_app.models import SeatCapacity
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


DAILY_RESCHEDULE_LEAD_HOURS = 8


@transaction.atomic
def reschedule_daily_booking(*, subscription, new_date, new_route, new_morning_slot=None,
                              new_return_slot=None, new_pickup_point_id=None,
                              reschedule_go=True, reschedule_return=True):
    """Move a confirmed daily subscription's booking to a different date/route/slot(s).

    Self-service, no admin approval. For a round-trip (`daily_round`) booking,
    ``reschedule_go``/``reschedule_return`` let the student move only ONE leg —
    the other leg's existing seat is left exactly as it was. Allowed only while
    more than DAILY_RESCHEDULE_LEAD_HOURS remain before the leg(s) actually
    being moved depart (server clock only, never trusts the client). Raises
    ValueError on any failure (too late, no capacity, bad input) — nothing is
    changed.
    """
    student = subscription.student
    # NOTE: select_related is limited to 'daily_trip' only (not its nullable
    # morning_slot/return_slot) — Postgres rejects SELECT ... FOR UPDATE over
    # a query with an outer join on the nullable side ("FOR UPDATE cannot be
    # applied to the nullable side of an outer join"), which every SeatRequest
    # here hits since exactly one of those two FKs is null depending on
    # direction. SQLite doesn't enforce this, which is why it only ever
    # surfaced in production. leg_departure_at() below still works fine —
    # accessing trip.morning_slot/return_slot just issues a plain (non-locked)
    # follow-up query instead of being part of the locked join.
    old_reqs = list(
        SeatRequest.objects.select_for_update()
        .filter(subscription=subscription, status=SeatRequest.Status.CONFIRMED)
        .select_related('daily_trip')
    )
    if not old_reqs:
        raise ValueError('لا يوجد حجز مؤكد لهذا الاشتراك حالياً.')

    want_go = any(r.daily_trip.direction == 'go' for r in old_reqs)
    want_ret = any(r.daily_trip.direction == 'return' for r in old_reqs)
    do_go = want_go and reschedule_go
    do_ret = want_ret and reschedule_return
    if not (do_go or do_ret):
        raise ValueError('اختر رحلة واحدة على الأقل (ذهاب أو عودة) لتأجيلها.')

    # The 8-hour rule is evaluated only against the leg(s) actually being
    # moved — an already-departed (or soon-to-depart) leg the student is
    # leaving untouched must not block rescheduling the other one.
    moving_reqs = [r for r in old_reqs if
                   (r.daily_trip.direction == 'go' and do_go) or
                   (r.daily_trip.direction == 'return' and do_ret)]
    hours_left = reschedule_lead_hours_left(moving_reqs)
    if hours_left is not None and hours_left <= DAILY_RESCHEDULE_LEAD_HOURS:
        raise ValueError(
            f'تجاوزت مهلة التأجيل — لازم يتبقى أكثر من {DAILY_RESCHEDULE_LEAD_HOURS} ساعات قبل ميعاد رحلتك الحالية.')

    if do_go and not new_morning_slot:
        raise ValueError('اختر موعد الذهاب الجديد.')
    if do_ret and not new_return_slot:
        raise ValueError('اختر موعد العودة الجديد.')

    pickup_point_id = new_pickup_point_id or old_reqs[0].pickup_point_id
    old_trip_id_by_direction = {r.daily_trip.direction: r.daily_trip_id for r in old_reqs}

    # Book the new leg(s) FIRST — if either fails (no capacity), nothing below
    # runs and the atomic transaction rolls back, leaving the old seats intact.
    new_by_direction = {}
    if do_go:
        trip = _get_or_create_trip(new_date, new_route, morning_slot=new_morning_slot)
        if trip.id == old_trip_id_by_direction.get('go'):
            raise ValueError('اختر تاريخاً أو موعداً مختلفاً عن حجزك الحالي.')
        new_by_direction['go'] = reschedule_seat(
            trip=trip, student=student, university_id=subscription.university_id,
            subscription=subscription, pickup_point_id=pickup_point_id)
    if do_ret:
        trip = _get_or_create_trip(new_date, new_route, return_slot=new_return_slot, direction='return')
        if trip.id == old_trip_id_by_direction.get('return'):
            raise ValueError('اختر تاريخاً أو موعداً مختلفاً عن حجزك الحالي.')
        new_by_direction['return'] = reschedule_seat(
            trip=trip, student=student, university_id=subscription.university_id,
            subscription=subscription, pickup_point_id=pickup_point_id)

    for old_req in old_reqs:
        direction = old_req.daily_trip.direction
        new_leg = new_by_direction.get(direction)
        if not new_leg:
            continue  # this leg wasn't selected for rescheduling — leave it as-is
        old_trip = old_req.daily_trip
        cancel_seat(old_req)
        DailyReschedule.objects.create(
            student=student, subscription=subscription,
            old_trip=old_trip, new_trip=new_leg.daily_trip)

    update_fields = ['route']
    subscription.route = new_route
    if do_go:
        subscription.morning_slot = new_morning_slot
        update_fields.append('morning_slot')
    if do_ret:
        subscription.return_slot = new_return_slot
        update_fields.append('return_slot')
    if new_pickup_point_id:
        subscription.pickup_point_id = new_pickup_point_id
        update_fields.append('pickup_point')
    subscription.save(update_fields=update_fields)
    return list(new_by_direction.values())
