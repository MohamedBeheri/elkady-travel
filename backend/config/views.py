from collections import defaultdict

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.bookings.models import Subscription
from apps.config_app.models import (
    College, CompanySettings, MorningSlot, PickupPoint, PricingRule, ReturnSlot,
    Route, SeatCapacity, University,
)
from apps.fleet.models import MaintenanceRecord, TrafficFine, TripExpense
from apps.operations.models import DailyTrip, ReturnBooking, SeatAbsence, SeatRequest, TermSeatLock
from apps.operations.layouts import layout_capacity
from apps.operations.services import build_seatmap
from apps.tourism.models import Quotation, TourismRequest, VehicleType
from apps.users.models import User


def _trip_availability(route, slot, date):
    """Read-only seat availability for a route/slot/date (no trip is created)."""
    trip = DailyTrip.objects.filter(date=date, route=route, morning_slot=slot, direction='go').first()
    if trip:
        sm = build_seatmap(trip)
        occ = sum(1 for s in sm['seats'] if s['raw_state'] in ('booked', 'held', 'term'))
        return trip.total_seats, occ, trip.layout
    cap_obj = SeatCapacity.objects.filter(route=route, morning_slot=slot).first()
    layout = cap_obj.layout if cap_obj else 'bus50'
    cap = cap_obj.total_seats if cap_obj else layout_capacity(layout)
    occ = 0
    for lock in TermSeatLock.objects.filter(route=route, morning_slot=slot, active=True):
        if not SeatAbsence.objects.filter(term_lock=lock, date=date).exists():
            occ += 1
    return cap, occ, layout


@api_view(['GET'])
@permission_classes([AllowAny])
def public_availability(request):
    """Public seat-availability lookup for a specific line + day + slot."""
    route_id = request.query_params.get('route')
    slot_id = request.query_params.get('morning_slot')
    date = request.query_params.get('date')
    if not (route_id and slot_id and date):
        return Response({'detail': 'اختر الخط والموعد والتاريخ'}, status=400)
    try:
        route = Route.objects.get(pk=route_id)
        slot = MorningSlot.objects.get(pk=slot_id)
    except (Route.DoesNotExist, MorningSlot.DoesNotExist):
        return Response({'detail': 'بيانات غير صحيحة'}, status=404)
    cap, occ, layout = _trip_availability(route, slot, date)
    available = max(cap - occ, 0)
    return Response({
        'route': route.name, 'slot': slot.name, 'date': date, 'layout': layout,
        'capacity': cap, 'occupied': occ, 'available': available, 'full': available <= 0,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def public_tourism_request(request):
    """Public tourism/custom-trip inquiry (guest — no login needed)."""
    d = request.data
    required = ['full_name', 'phone', 'origin', 'destination', 'travel_date']
    if any(not d.get(f) for f in required):
        return Response({'detail': 'من فضلك أكمل: الاسم، الهاتف، من، إلى، التاريخ'}, status=400)
    vehicle = None
    if d.get('vehicle_type'):
        vehicle = VehicleType.objects.filter(pk=d.get('vehicle_type')).first()
    req = TourismRequest.objects.create(
        full_name=d['full_name'], phone=d['phone'],
        national_id=d.get('national_id', ''), address=d.get('address', ''),
        origin=d['origin'], destination=d['destination'], travel_date=d['travel_date'],
        vehicle_type=vehicle, travelers=int(d.get('travelers') or 1),
        trip_type=d.get('trip_type', 'private'), notes=d.get('notes', ''),
    )
    return Response({'id': req.id, 'message': 'تم استلام طلبك، وسيتواصل معك فريقنا بعرض السعر.'}, status=201)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_universities(request):
    """Public university list for the sign-up form (no auth needed)."""
    return Response([
        {'id': u.id, 'name': u.name}
        for u in University.objects.filter(active=True).order_by('name')
    ])


@api_view(['GET'])
@permission_classes([AllowAny])
def public_colleges(request):
    """Public college list, optionally filtered by university (for sign-up)."""
    qs = College.objects.filter(active=True).select_related('university')
    uni = request.query_params.get('university')
    if uni:
        qs = qs.filter(university_id=uni)
    return Response([
        {'id': c.id, 'name': c.name, 'university': c.university_id} for c in qs.order_by('name')
    ])


@api_view(['GET'])
@permission_classes([AllowAny])
def public_pickup_points(request):
    """Public pickup points, filtered by center, incl. per-slot pickup/drop times.

    A physical stop (e.g. "النساجون") may exist as multiple PickupPoint rows —
    one per route that serves it. For the public dropdown we collapse them by
    (center, normalized-name, destination) so each physical stop shows up once
    PER destination — otherwise the frontend's destination filter (بدر/الشروق)
    would drop stops that only survive the dedupe under the wrong destination.
    """
    import unicodedata, re
    from apps.config_app.models import PickupTime  # noqa: F401  (kept for compat)
    qs = PickupPoint.objects.filter(active=True, route__active=True).select_related(
        'route', 'route__destination').prefetch_related('times')
    center = request.query_params.get('center')
    if center:
        qs = qs.filter(center=center)

    def norm(s: str) -> str:
        # NFKC + strip diacritics/tatweel + collapse whitespace, so
        # "النساجون" vs "الْنَسَّاجُون " map to the same key.
        s = unicodedata.normalize('NFKC', (s or '')).strip()
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn' and c != 'ـ')
        return re.sub(r'\s+', ' ', s)

    grouped: dict = {}
    for p in qs.order_by('sequence', 'name', 'id'):
        key = (p.center or '', norm(p.name), p.route.destination_id)
        row = grouped.get(key)
        if row is None:
            row = {
                'id': p.id, 'name': p.name, 'center': p.center,
                'route': p.route.name, 'route_id': p.route_id,
                'seat_selection': p.route.seat_selection_enabled,
                'destination': p.route.destination_id,
                'destination_name': p.route.destination.name if p.route.destination_id else '',
                'sequence': p.sequence, 'go_times': {}, 'return_times': {},
            }
            grouped[key] = row
        for t in p.times.all():
            if t.direction == 'return' and t.return_slot_id:
                row['return_times'].setdefault(t.return_slot_id, t.time.strftime('%H:%M'))
            elif t.direction == 'go' and t.morning_slot_id:
                row['go_times'].setdefault(t.morning_slot_id, t.time.strftime('%H:%M'))

    return Response(list(grouped.values()))


@api_view(['GET'])
@permission_classes([AllowAny])
def public_explore(request):
    """Public (no-auth) catalogue: routes, pickup points, times, and prices.

    Lets visitors browse lines/places/schedules/prices before signing in.
    Booking still requires authentication (enforced on the booking endpoints).
    """
    prices = defaultdict(dict)
    for pr in PricingRule.objects.filter(active=True).select_related('route'):
        prices[pr.route_id][pr.subscription_type] = float(pr.price)

    routes = []
    for r in Route.objects.filter(active=True).select_related('destination').prefetch_related('pickup_points'):
        routes.append({
            'id': r.id,
            'code': r.code,
            'name': r.name,
            'origin_label': r.origin_label,
            'destination': r.destination.name,
            'pickup_points': [
                {'name': p.name, 'sequence': p.sequence, 'location': p.location}
                for p in r.pickup_points.filter(active=True).order_by('sequence')
            ],
            'prices': prices.get(r.id, {}),
        })

    company = CompanySettings.load()
    return Response({
        'company': {'name': company.name, 'tagline': company.tagline, 'phone': company.phone},
        'routes': routes,
        'universities': [
            {'id': u.id, 'name': u.name, 'destination': u.destination.name}
            for u in University.objects.filter(active=True).select_related('destination').order_by('name')
        ],
        'morning_slots': [
            {'id': s.id, 'name': s.name, 'time': s.departure_time.strftime('%H:%M')}
            for s in MorningSlot.objects.filter(active=True).order_by('departure_time')
        ],
        'return_slots': [
            {'name': s.name, 'time': s.departure_time.strftime('%H:%M'), 'capacity': s.capacity}
            for s in ReturnSlot.objects.filter(active=True).order_by('departure_time')
        ],
        'vehicle_types': [
            {'id': v.id, 'name': v.name, 'capacity': v.capacity}
            for v in VehicleType.objects.filter(active=True)
        ],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Admin KPIs (§29)."""
    today = timezone.localdate()
    tomorrow = today + timezone.timedelta(days=1)

    confirmed = Subscription.objects.filter(status=Subscription.Status.CONFIRMED)
    students = {
        'total': User.objects.filter(role=User.Role.STUDENT).count(),
        'term': confirmed.filter(subscription_type='term').values('student').distinct().count(),
        'monthly': confirmed.filter(subscription_type='monthly').values('student').distinct().count(),
        'daily': confirmed.filter(subscription_type='daily').values('student').distinct().count(),
        'waiting': SeatRequest.objects.filter(status=SeatRequest.Status.WAITING).count(),
    }

    tomorrow_trips = DailyTrip.objects.filter(date=tomorrow, direction='go')
    total_seats = tomorrow_trips.aggregate(s=Sum('total_seats'))['s'] or 0
    confirmed_seats = SeatRequest.objects.filter(
        daily_trip__date=tomorrow, daily_trip__direction='go',
        status=SeatRequest.Status.CONFIRMED).count()
    transport = {
        'today_trips': DailyTrip.objects.filter(date=today, direction='go').count(),
        'tomorrow_trips': tomorrow_trips.count(),
        'tomorrow_passengers': confirmed_seats,
        'tomorrow_capacity': total_seats,
        'occupancy': round(confirmed_seats / total_seats * 100, 1) if total_seats else 0,
        'available_seats': max(total_seats - confirmed_seats, 0),
    }

    pay = Subscription.objects
    payments = {
        'pending': pay.filter(status__in=[
            Subscription.Status.PAYMENT_SUBMITTED, Subscription.Status.UNDER_REVIEW]).count(),
        'verified': pay.filter(status=Subscription.Status.CONFIRMED).count(),
        'rejected': pay.filter(status=Subscription.Status.REJECTED).count(),
        'collected': pay.filter(status=Subscription.Status.CONFIRMED).aggregate(
            t=Sum('amount'))['t'] or 0,
    }

    tourism = {
        'new': TourismRequest.objects.filter(status=TourismRequest.Status.PENDING).count(),
        'quoted': TourismRequest.objects.filter(status=TourismRequest.Status.QUOTED).count(),
        'accepted': TourismRequest.objects.filter(status=TourismRequest.Status.ACCEPTED).count(),
        'rejected': TourismRequest.objects.filter(status=TourismRequest.Status.REJECTED).count(),
    }

    return Response({
        'students': students,
        'transport': transport,
        'payments': payments,
        'tourism': tourism,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_charts(request):
    """Chart data: per-route fill for tomorrow, subscription & payment distributions."""
    tomorrow = timezone.localdate() + timezone.timedelta(days=1)
    trips = DailyTrip.objects.filter(date=tomorrow, direction='go').select_related(
        'route', 'route__destination', 'morning_slot')

    trip_rows = []
    route_agg = defaultdict(lambda: {'capacity': 0, 'occupied': 0})
    for t in trips:
        sm = build_seatmap(t)
        occupied = sum(1 for s in sm['seats'] if s['raw_state'] in ('booked', 'held', 'term'))
        cap = t.total_seats or 1
        trip_rows.append({
            'route': t.route.name, 'slot': t.slot_label, 'layout': t.layout,
            'capacity': t.total_seats, 'occupied': occupied,
            'waiting': t.waiting_count,
            'occupancy': round(occupied / cap * 100),
        })
        route_agg[t.route.name]['capacity'] += t.total_seats
        route_agg[t.route.name]['occupied'] += occupied

    routes = [{
        'name': k, 'capacity': v['capacity'], 'occupied': v['occupied'],
        'occupancy': round(v['occupied'] / (v['capacity'] or 1) * 100),
    } for k, v in route_agg.items()]
    routes.sort(key=lambda r: -r['occupancy'])

    confirmed = Subscription.objects.filter(status=Subscription.Status.CONFIRMED)
    sub_types = {
        'term': confirmed.filter(subscription_type='term').count(),
        'monthly': confirmed.filter(subscription_type='monthly').count(),
        'daily': confirmed.filter(subscription_type='daily').count(),
    }
    payments = {
        'verified': Subscription.objects.filter(status=Subscription.Status.CONFIRMED).count(),
        'pending': Subscription.objects.filter(status__in=[
            Subscription.Status.PAYMENT_SUBMITTED, Subscription.Status.UNDER_REVIEW]).count(),
        'rejected': Subscription.objects.filter(status=Subscription.Status.REJECTED).count(),
    }

    total_cap = sum(r['capacity'] for r in routes)
    total_occ = sum(r['occupied'] for r in routes)

    # ---- Last 7 days passenger trend ----
    WEEKDAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
    today = timezone.localdate()
    weekly = []
    for i in range(6, -1, -1):
        day = today - timezone.timedelta(days=i)
        passengers = SeatRequest.objects.filter(
            daily_trip__date=day,
            status=SeatRequest.Status.CONFIRMED,
            seat_number__isnull=False,
        ).count()
        weekly.append({
            'date': str(day), 'label': WEEKDAYS[day.weekday()], 'passengers': passengers,
        })

    return Response({
        'date': str(tomorrow),
        'routes': routes,
        'trips': trip_rows,
        'sub_types': sub_types,
        'payments': payments,
        'weekly': weekly,
        'overall': {'capacity': total_cap, 'occupied': total_occ,
                    'available': max(total_cap - total_occ, 0)},
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def finance_report(request):
    """Financial report: collections by subscription type + fleet expenses + net profit.

    Query params (all optional; defaults to current month):
        - start:  YYYY-MM-DD (inclusive)
        - end:    YYYY-MM-DD (inclusive)
        - month:  YYYY-MM shortcut (sets start/end to that month)

    Revenue is CONFIRMED subscriptions bucketed by verified_at date; daily variants
    (daily / daily_go / daily_return / daily_round) collapse into one "daily" row.
    Expenses cover approved TripExpense (fuel/tolls/other), MaintenanceRecord
    (regular + workshop), and TrafficFine — all filtered by their `date`.
    """
    from datetime import date as _date, datetime as _dt

    today = timezone.localdate()
    month = request.query_params.get('month')
    start_s = request.query_params.get('start')
    end_s = request.query_params.get('end')

    def parse(s):
        try:
            return _dt.strptime(s, '%Y-%m-%d').date()
        except (TypeError, ValueError):
            return None

    if month:
        try:
            y, m = [int(x) for x in month.split('-', 1)]
            start = _date(y, m, 1)
            end = (_date(y + (m // 12), (m % 12) + 1, 1) - timezone.timedelta(days=1))
        except (ValueError, IndexError):
            start = today.replace(day=1); end = today
    else:
        start = parse(start_s) or today.replace(day=1)
        end = parse(end_s) or today

    # -------- Revenue: confirmed subscriptions verified in range --------
    subs = Subscription.objects.filter(
        status=Subscription.Status.CONFIRMED,
        verified_at__date__gte=start,
        verified_at__date__lte=end,
    )

    def bucket(stype: str) -> str:
        if stype == 'term':
            return 'term'
        if stype == 'monthly':
            return 'monthly'
        return 'daily'  # daily / daily_go / daily_return / daily_round

    collections = {
        'term':    {'count': 0, 'total': 0.0},
        'monthly': {'count': 0, 'total': 0.0},
        'daily':   {'count': 0, 'total': 0.0},
    }
    for row in subs.values('subscription_type').annotate(
            c=Count('id'), t=Sum('amount')):
        b = bucket(row['subscription_type'])
        collections[b]['count'] += row['c']
        collections[b]['total'] += float(row['t'] or 0)

    total_collections = sum(v['total'] for v in collections.values())
    total_subs = sum(v['count'] for v in collections.values())

    # -------- Expenses --------
    exp = TripExpense.objects.filter(
        status=TripExpense.Status.APPROVED, date__gte=start, date__lte=end)
    exp_by_kind = {r['kind']: float(r['t'] or 0) for r in
                   exp.values('kind').annotate(t=Sum('amount'))}
    fuel = exp_by_kind.get('fuel', 0.0)
    tolls = exp_by_kind.get('tolls', 0.0)
    other = exp_by_kind.get('other', 0.0)

    maint_qs = MaintenanceRecord.objects.filter(date__gte=start, date__lte=end)
    maintenance = float(maint_qs.filter(is_workshop=False).aggregate(
        t=Sum('amount'))['t'] or 0)
    workshop = float(maint_qs.filter(is_workshop=True).aggregate(
        t=Sum('amount'))['t'] or 0)

    fines = float(TrafficFine.objects.filter(
        date__gte=start, date__lte=end).aggregate(t=Sum('amount'))['t'] or 0)

    expenses = {
        'fuel': fuel, 'tolls': tolls, 'other': other,
        'maintenance': maintenance, 'workshop': workshop, 'fines': fines,
    }
    total_expenses = sum(expenses.values())
    net_profit = total_collections - total_expenses

    # -------- Recent confirmed subscriptions (top 100) --------
    recent = []
    for s in subs.select_related('student', 'route').order_by('-verified_at')[:100]:
        recent.append({
            'id': s.id,
            'student': s.student.get_full_name() or s.student.username,
            'phone': getattr(s.student, 'phone', '') or '',
            'route': s.route.name if s.route_id else '',
            'type': s.subscription_type,
            'bucket': bucket(s.subscription_type),
            'amount': float(s.amount or 0),
            'verified_at': s.verified_at.isoformat() if s.verified_at else None,
        })

    return Response({
        'range': {'start': str(start), 'end': str(end)},
        'collections': collections,
        'totals': {
            'collections': total_collections,
            'expenses': total_expenses,
            'net_profit': net_profit,
            'subscriptions_count': total_subs,
        },
        'expenses': expenses,
        'recent_subscriptions': recent,
    })
