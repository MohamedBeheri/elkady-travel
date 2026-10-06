"""End-to-end: a paid daily booking must show up everywhere the admin looks."""
from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.bookings.models import Subscription
from apps.config_app.models import CompanySettings, PickupPoint, PickupTime, Route, SeatCapacity
from apps.operations.models import DailyTrip, SeatRequest
from apps.operations.services import auto_close_attendance, cancel_seat
from apps.users.models import User


class DailyVisibilityTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)

    def setUp(self):
        cs = CompanySettings.load()
        cs.booking_daily_open = True
        cs.daily_booking_cutoff_time = None
        cs.save()
        self.admin = User.objects.filter(role='admin').first()
        cap = SeatCapacity.objects.select_related('route', 'morning_slot').first()
        self.route, self.slot = cap.route, cap.morning_slot
        pt = PickupTime.objects.filter(direction='return', return_slot__isnull=False,
                                       pickup_point__route=self.route).first()
        from apps.config_app.models import ReturnSlot
        self.ret_slot = pt.return_slot if pt else ReturnSlot.objects.first()
        self.pp = PickupPoint.objects.filter(route=self.route).first()
        self.date = (timezone.localdate() + timedelta(days=1)).isoformat()

    def _student(self, name):
        u = User.objects.create_user(username=name, password='x', role='student', full_name=name,
                                     university_id=self.route.destination.universities.first().id
                                     if hasattr(self.route.destination, 'universities') else None)
        return u

    def _uni(self):
        from apps.config_app.models import University
        return University.objects.first()

    def _mk_student(self, name):
        return User.objects.create_user(username=name, password='x', role='student',
                                        full_name=name, university=self._uni())

    def _assert_everywhere(self, student, n_legs):
        self.client.force_authenticate(self.admin)
        trips = DailyTrip.objects.filter(date=self.date, seat_requests__student=student).distinct()
        self.assertEqual(trips.count(), n_legs)
        for t in trips:
            r = t.seat_requests.get(student=student)
            self.assertEqual(r.status, 'confirmed', f'{t} stays {r.status}')
            pax = self.client.get(f'/api/operations/daily-trips/{t.id}/passengers/').json()
            names = [p['student_name'] for g in pax['groups'] for p in g['passengers']
                     if p['status'] == 'confirmed']
            self.assertIn(student.full_name, names, 'missing from passengers')
            sm = self.client.get(f'/api/operations/daily-trips/{t.id}/seatmap/').json()
            self.assertIn(r.seat_number, [s['number'] for s in sm['seats'] if s['raw_state'] == 'booked'])
        board = self.client.get(f'/api/operations/daily-trips/board/?date={self.date}').json()
        self.assertTrue(any(t['confirmed_count'] for t in board['trips']))
        man = self.client.get(f'/api/operations/daily-trips/day-manifest/?date={self.date}').json()
        found = [x for r in man['routes'] for k in ('go_only', 'return_only', 'round_trip')
                 for x in r[k] if x['student_name'] == student.full_name]
        self.assertTrue(found, 'missing from day manifest')
        self.client.force_authenticate(student)
        tickets = self.client.get('/api/operations/seat-requests/tickets/').json()
        self.assertEqual(sum(1 for t in tickets if t['kind'] == 'daily' and t['status'] == 'confirmed'), n_legs)

    def _book_and_approve(self, student, trip_type):
        self.client.force_authenticate(student)
        body = {'date': self.date, 'route': self.route.id, 'trip_type': trip_type,
                'morning_slot': self.slot.id, 'pickup_point': self.pp.id,
                'university': self._uni().id}
        if self.ret_slot:
            body['return_slot'] = self.ret_slot.id
        resp = self.client.post('/api/operations/seat-requests/book-daily/', body, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        sub = Subscription.objects.get(pk=resp.json()['subscription']['id'])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'/api/bookings/subscriptions/{sub.id}/approve/').status_code, 200)
        return sub

    def test_round_trip_survives_allocation_and_cancel(self):
        s = self._mk_student('yara')
        self._book_and_approve(s, 'round')
        other = self._mk_student('other')
        self._book_and_approve(other, 'go')
        # a cancel on the same trip + the nightly job must not disturb anyone
        cancel_seat(SeatRequest.objects.get(student=other, daily_trip__direction='go'))
        auto_close_attendance(self.date)
        self._assert_everywhere(s, 2)

    def test_return_leg_via_seatmap_then_approve(self):
        s = self._mk_student('mohamed')
        sub = self._book_and_approve(s, 'go')
        # second leg booked through the seat map (no subscription) — held, then paid
        self.client.force_authenticate(s)
        r = self.client.post('/api/operations/seat-requests/book-seat/', {
            'date': self.date, 'route': self.route.id, 'direction': 'return',
            'return_slot': self.ret_slot.id, 'pickup_point': self.pp.id,
            'university': self._uni().id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        ret = SeatRequest.objects.get(student=s, daily_trip__direction='return')
        self.assertEqual(ret.status, 'held')
        sub2 = Subscription.objects.create(
            student=s, subscription_type='daily_return', route=self.route, university=self._uni(),
            amount=0, status=Subscription.Status.PAYMENT_SUBMITTED)
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/bookings/subscriptions/{sub2.id}/approve/')
        auto_close_attendance(self.date)
        self._assert_everywhere(s, 2)
