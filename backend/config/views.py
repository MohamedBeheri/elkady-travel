from collections import defaultdict

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.bookings.models import Subscription
from apps.config_app.models import (
    CompanySettings, MorningSlot, PricingRule, ReturnSlot, Route, SeatCapacity, University,
)
from apps.operations.models import DailyTrip, ReturnBooking, SeatAbsence, SeatRequest, TermSeatLock
from apps.operations.layouts import layout_capacity
from apps.operations.services import build_seatmap
from apps.tourism.models import Quotation, TourismRequest, VehicleType
from apps.users.models import User


def _trip_availability(route, slot, date):
    """Read-only seat availability for a route/slot/date (no trip is created)."""
    trip = DailyTrip.objects.filter(date=date, route=route, morning_slot=slot).first()
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

    tomorrow_trips = DailyTrip.objects.filter(date=tomorrow)
    total_seats = tomorrow_trips.aggregate(s=Sum('total_seats'))['s'] or 0
    confirmed_seats = SeatRequest.objects.filter(
        daily_trip__date=tomorrow, status=SeatRequest.Status.CONFIRMED).count()
    transport = {
        'today_trips': DailyTrip.objects.filter(date=today).count(),
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
    trips = DailyTrip.objects.filter(date=tomorrow).select_related(
        'route', 'route__destination', 'morning_slot')

    trip_rows = []
    route_agg = defaultdict(lambda: {'capacity': 0, 'occupied': 0})
    for t in trips:
        sm = build_seatmap(t)
        occupied = sum(1 for s in sm['seats'] if s['raw_state'] in ('booked', 'held', 'term'))
        cap = t.total_seats or 1
        trip_rows.append({
            'route': t.route.name, 'slot': t.morning_slot.name, 'layout': t.layout,
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
