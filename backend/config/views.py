from collections import defaultdict

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.bookings.models import Subscription
from apps.operations.models import DailyTrip, ReturnBooking, SeatRequest
from apps.operations.services import build_seatmap
from apps.tourism.models import Quotation, TourismRequest
from apps.users.models import User


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
