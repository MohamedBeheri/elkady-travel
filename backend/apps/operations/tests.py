"""End-to-end: a paid daily booking must show up everywhere the admin looks."""
from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.bookings.models import Subscription
from apps.config_app.models import CompanySettings, PickupPoint, PickupTime, Route, SeatCapacity
from apps.operations.models import DailyTrip, SeatRequest
from apps.operations.services import allocate_trip, auto_close_attendance, cancel_seat
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

    def test_rebooking_a_paid_trip_is_refused_and_seat_stays_confirmed(self):
        s = self._mk_student('yara2')
        self._book_and_approve(s, 'round')
        self.client.force_authenticate(s)
        again = self.client.post('/api/operations/seat-requests/book-daily/', {
            'date': self.date, 'route': self.route.id, 'trip_type': 'round',
            'morning_slot': self.slot.id, 'return_slot': self.ret_slot.id,
            'pickup_point': self.pp.id, 'university': self._uni().id}, format='json')
        self.assertEqual(again.status_code, 409, again.content)
        self.assertEqual(Subscription.objects.filter(student=s).count(), 1)
        self._assert_everywhere(s, 2)

    def test_rejected_then_repaid_gets_its_seat_back(self):
        s = self._mk_student('repaid')
        self.client.force_authenticate(s)
        resp = self.client.post('/api/operations/seat-requests/book-daily/', {
            'date': self.date, 'route': self.route.id, 'trip_type': 'go',
            'morning_slot': self.slot.id, 'pickup_point': self.pp.id,
            'university': self._uni().id}, format='json')
        sub_id = resp.json()['subscription']['id']
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/bookings/subscriptions/{sub_id}/reject/', {'rejection_reason': 'x'})
        self.assertEqual(SeatRequest.objects.get(student=s).status, 'cancelled')
        self.client.force_authenticate(s)
        self.assertEqual(self.client.post(f'/api/bookings/subscriptions/{sub_id}/submit-payment/').status_code, 200)
        self.client.force_authenticate(self.admin)
        r = self.client.post(f'/api/bookings/subscriptions/{sub_id}/approve/').json()
        self.assertFalse(r['seat_warning'])
        self._assert_everywhere(s, 1)

    def test_waiting_list_gets_a_held_seat_and_opens_payment(self):
        s = self._mk_student('waiter')
        from apps.operations.services import _get_or_create_trip
        trip = _get_or_create_trip(self.date, self.route, morning_slot=self.slot)
        sub = Subscription.objects.create(student=s, subscription_type='daily_go', route=self.route,
                                          university=self._uni(), amount=50, status=Subscription.Status.DRAFT)
        req = SeatRequest.objects.create(daily_trip=trip, student=s, subscription=sub, university=self._uni(),
                                         priority_type='daily', status=SeatRequest.Status.WAITING)
        allocate_trip(trip.pk)
        req.refresh_from_db(); sub.refresh_from_db()
        self.assertEqual(req.status, 'held')
        self.assertTrue(req.seat_number)
        self.assertEqual(sub.status, 'payment_pending')

    def test_student_cannot_bypass_payment_or_price(self):
        s = self._mk_student('sneaky')
        self.client.force_authenticate(s)
        from apps.operations.services import _get_or_create_trip
        trip = _get_or_create_trip(self.date, self.route, morning_slot=self.slot)
        self.assertEqual(self.client.post('/api/operations/seat-requests/', {
            'daily_trip': trip.id, 'student': s.id, 'university': self._uni().id,
            'status': 'confirmed', 'seat_number': 3}, format='json').status_code, 403)
        self.client.force_authenticate(s)
        resp = self.client.post('/api/operations/seat-requests/book-daily/', {
            'date': self.date, 'route': self.route.id, 'trip_type': 'go',
            'morning_slot': self.slot.id, 'pickup_point': self.pp.id,
            'university': self._uni().id}, format='json')
        held = SeatRequest.objects.get(student=s)
        self.assertEqual(self.client.patch(f'/api/operations/seat-requests/{held.id}/',
                                           {'status': 'confirmed'}, format='json').status_code, 403)
        sub_id = resp.json()['subscription']['id']
        self.assertEqual(self.client.patch(f'/api/bookings/subscriptions/{sub_id}/',
                                           {'amount': '1'}, format='json').status_code, 403)
        from apps.config_app.models import PricingRule
        rule = PricingRule.objects.filter(route=self.route, subscription_type='term', active=True).first()
        if rule:
            r = self.client.post('/api/bookings/subscriptions/', {
                'subscription_type': 'term', 'route': self.route.id, 'university': self._uni().id,
                'amount': '1'}, format='json')
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(float(r.json()['amount']), float(rule.price))

    def test_cannot_pay_a_waiting_list_booking(self):
        s = self._mk_student('early')
        sub = Subscription.objects.create(student=s, subscription_type='daily_go', route=self.route,
                                          university=self._uni(), amount=50, status=Subscription.Status.DRAFT)
        self.client.force_authenticate(s)
        self.assertEqual(self.client.post(f'/api/bookings/subscriptions/{sub.id}/submit-payment/').status_code, 400)


class ReturnCapacityTests(APITestCase):
    """A return slot closes by itself at the admin's capacity for that route,
    reopens when it is raised, and never disturbs riders already on it."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)

    def setUp(self):
        from apps.config_app.models import ReturnCapacity, ReturnSlot, University
        cs = CompanySettings.load()
        cs.booking_daily_open = cs.booking_monthly_open = True
        cs.daily_booking_cutoff_time = cs.attendance_lock_time = None
        cs.save()
        self.admin = User.objects.filter(role='admin').first()
        cap = SeatCapacity.objects.select_related('route', 'morning_slot').first()
        self.route, self.slot = cap.route, cap.morning_slot
        self.uni = University.objects.first()
        self.pp = PickupPoint.objects.filter(route=self.route).first()
        slots = list(ReturnSlot.objects.filter(active=True).order_by('departure_time'))
        self.r1, self.r2 = slots[0], slots[1]
        self.RC = ReturnCapacity
        self.rc = ReturnCapacity.objects.create(route=self.route, return_slot=self.r2, total_seats=2)
        self.date = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.n = 0

    def _student(self):
        self.n += 1
        return User.objects.create_user(username=f'rc{self.n}', password='x', role='student',
                                        full_name=f'راكب {self.n}', university=self.uni)

    def _book(self, student, trip_type='return', slot=None, date=None):
        self.client.force_authenticate(student)
        body = {'date': date or self.date, 'route': self.route.id, 'trip_type': trip_type,
                'return_slot': (slot or self.r2).id, 'pickup_point': self.pp.id, 'university': self.uni.id}
        if trip_type != 'return':
            body['morning_slot'] = self.slot.id
        return self.client.post('/api/operations/seat-requests/book-daily/', body, format='json')

    def _fill(self, n=2, **kw):
        for _ in range(n):
            self.assertEqual(self._book(self._student(), **kw).status_code, 201)

    def _board_row(self, slot=None, date=None):
        self.client.force_authenticate(self.admin)
        rows = self.client.get(f'/api/operations/daily-trips/board/?date={date or self.date}').json()['trips']
        return next(r for r in rows if r['direction'] == 'return' and r['route'] == self.route.id
                    and r['return_slot'] == (slot or self.r2).id)

    def _availability(self, student, date=None):
        self.client.force_authenticate(student)
        r = self.client.get(f'/api/operations/daily-trips/return-availability/?date={date or self.date}&route={self.route.id}')
        return {s['id']: s for s in r.json()['slots']}

    def test_closes_at_capacity_and_reopens_when_raised(self):
        self._fill(2)
        late = self._student()
        self.assertTrue(self._availability(late)[self.r2.id]['full'])
        self.assertFalse(self._availability(late)[self.r1.id]['full'])
        r = self._book(late)
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIn('اكتمل', r.json()['detail'])
        self.assertFalse(Subscription.objects.filter(student=late).exists())
        self.assertFalse(SeatRequest.objects.filter(student=late).exists())
        row = self._board_row()
        self.assertEqual((row['total_seats'], row['held_count'], row['return_status'], row['is_full']),
                         (2, 2, 'full', True))
        # the other slot of the same route is untouched, and so is another route
        self.assertEqual(self._book(late, slot=self.r1).status_code, 201)
        # admin raises the capacity → booking reopens by itself
        self.client.force_authenticate(self.admin)
        self.client.patch(f'/api/config/return-capacities/{self.rc.id}/', {'total_seats': 3}, format='json')
        self.assertFalse(self._availability(self._student())[self.r2.id]['full'])
        self.assertEqual(self._book(self._student()).status_code, 201)
        self.assertEqual(self._book(self._student()).status_code, 409)

    def test_full_return_blocks_the_whole_round_trip(self):
        self._fill(2)
        s = self._student()
        r = self._book(s, trip_type='round')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertFalse(SeatRequest.objects.filter(student=s).exists())
        self.assertFalse(Subscription.objects.filter(student=s).exists())

    def test_extra_vehicle_for_one_day_only(self):
        self._fill(2)
        trip_id = self._board_row()['id']
        self.client.force_authenticate(self._student())
        self.assertEqual(self.client.post(f'/api/operations/daily-trips/{trip_id}/set-capacity/',
                                          {'capacity': 9}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        r = self.client.post(f'/api/operations/daily-trips/{trip_id}/set-capacity/',
                             {'capacity': 3, 'scope': 'day'}, format='json')
        self.assertEqual(r.json()['total_seats'], 3)
        self.assertEqual(self._book(self._student()).status_code, 201)
        self.assertEqual(self._book(self._student()).status_code, 409)
        # another day still runs on the standing capacity of 2
        other = (timezone.localdate() + timedelta(days=2)).isoformat()
        self._fill(2, date=other)
        self.assertEqual(self._book(self._student(), date=other).status_code, 409)
        # «دائماً» from the board rewrites the standing capacity and drops the day override
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/operations/daily-trips/{trip_id}/set-capacity/',
                         {'capacity': 5, 'scope': 'always'}, format='json')
        self.rc.refresh_from_db()
        self.assertEqual(self.rc.total_seats, 5)
        self.assertEqual(self._book(self._student(), date=other).status_code, 201)

    def test_lowering_capacity_keeps_existing_riders(self):
        self.rc.total_seats = 4
        self.rc.save()
        self._fill(4)
        self.rc.total_seats = 2
        self.rc.save()
        self.assertEqual(SeatRequest.objects.filter(status='held', daily_trip__return_slot=self.r2).count(), 4)
        row = self._board_row()
        self.assertEqual((row['total_seats'], row['held_count'], row['return_status']), (2, 4, 'full'))
        self.assertEqual(self._book(self._student()).status_code, 409)

    def test_route_without_its_own_row_uses_the_slot_capacity(self):
        self.rc.delete()
        self.r2.capacity = 1
        self.r2.save()
        self._fill(1)
        self.assertEqual(self._book(self._student()).status_code, 409)
        self.assertEqual(self._board_row()['total_seats'], 1)

    def test_capacity_larger_than_the_vehicle_gets_extra_seats(self):
        self.rc.total_seats = 51      # bus50 has 49 seats → two extra numbers
        self.rc.save()
        self._fill(51)
        seats = sorted(SeatRequest.objects.filter(daily_trip__return_slot=self.r2).values_list('seat_number', flat=True))
        self.assertEqual(len(set(seats)), 51)
        self.assertEqual(seats[-1], 51)
        self.assertEqual(self._book(self._student()).status_code, 409)

    def test_stopped_slot_takes_no_new_bookings(self):
        self._fill(1)
        self.r2.active = False
        self.r2.save()
        r = self._book(self._student())
        self.assertEqual(r.status_code, 409)
        self.assertIn('متوقف', r.json()['detail'])
        self.assertEqual(self._board_row()['return_status'], 'stopped')
        self.assertEqual(SeatRequest.objects.filter(daily_trip__return_slot=self.r2, status='held').count(), 1)

    def test_seat_map_booking_is_capped_too(self):
        self._fill(2)
        self.client.force_authenticate(self._student())
        r = self.client.post('/api/operations/seat-requests/book-seat/', {
            'date': self.date, 'route': self.route.id, 'direction': 'return', 'return_slot': self.r2.id,
            'seat_number': 30, 'university': self.uni.id}, format='json')
        self.assertEqual(r.status_code, 409, r.content)
        sm = self.client.get(f'/api/operations/daily-trips/seatmap-for/?date={self.date}&route={self.route.id}'
                             f'&direction=return&return_slot={self.r2.id}').json()
        self.assertTrue(sm['full'])

    # ---- term / monthly subscribers -------------------------------------
    def _subscriber(self):
        """A monthly subscriber whose default return slot is r1 (the earliest)."""
        from apps.operations.models import TermSeatLock
        s = self._student()
        self.client.force_authenticate(s)
        sub_id = self.client.post('/api/bookings/subscriptions/', {
            'subscription_type': 'monthly', 'route': self.route.id, 'university': self.uni.id,
            'pickup_point': self.pp.id}, format='json').json()['id']
        self.client.post(f'/api/bookings/subscriptions/{sub_id}/submit-payment/')
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/bookings/subscriptions/{sub_id}/approve/')
        lock = TermSeatLock.objects.get(subscription_id=sub_id, direction='return', active=True)
        self.assertEqual(lock.return_slot_id, self.r1.id)
        return s, lock

    def _attend(self, student, lock, slot):
        self.client.force_authenticate(student)
        return self.client.post('/api/operations/attendance/set/', {
            'lock_id': lock.id, 'date': self.date, 'attending': True, 'slot_id': slot.id}, format='json')

    def test_subscriber_cannot_move_into_a_full_slot(self):
        s1, l1 = self._subscriber()
        s2, l2 = self._subscriber()
        s3, l3 = self._subscriber()
        self.assertEqual(self._attend(s1, l1, self.r2).status_code, 200)
        self.assertEqual(self._attend(s2, l2, self.r2).status_code, 200)
        r = self._attend(s3, l3, self.r2)
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIn('اكتمل', r.json()['detail'])
        # the refused rider was not half-recorded as attending
        from apps.operations.models import AttendanceConfirmation
        self.assertFalse(AttendanceConfirmation.objects.filter(term_lock=l3, date=self.date).exists())
        # the full slot shows as full on the attendance page for him, not for those already on it
        self.client.force_authenticate(s3)
        opts = {o['id']: o for seat in self.client.get(f'/api/operations/attendance/?date={self.date}').json()['seats']
                if seat['direction'] == 'return' for o in seat['available_slots']}
        self.assertTrue(opts[self.r2.id]['full'])
        self.assertFalse(opts[self.r1.id]['full'])
        # re-saving the same choice is not blocked by the rider's own place
        self.assertEqual(self._attend(s1, l1, self.r2).status_code, 200)
        # subscribers count against daily riders too
        self.assertEqual(self._book(self._student()).status_code, 409)
        row = self._board_row()
        self.assertEqual((row['confirmed_count'], row['return_status']), (2, 'full'))
        # a rider who leaves the slot frees the place
        self.client.force_authenticate(s1)
        self.client.post('/api/operations/attendance/set/', {
            'lock_id': l1.id, 'date': self.date, 'attending': False}, format='json')
        self.assertEqual(self._attend(s3, l3, self.r2).status_code, 200)

    def test_subscriber_keeps_priority_on_his_own_slot(self):
        from apps.notifications.models import Notification
        self.RC.objects.create(route=self.route, return_slot=self.r1, total_seats=1)
        s1, l1 = self._subscriber()
        s2, l2 = self._subscriber()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._attend(s1, l1, self.r1).status_code, 200)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self._attend(s2, l2, self.r1).status_code, 200)   # own slot, though full
        row = self._board_row(slot=self.r1)
        self.assertEqual((row['confirmed_count'], row['total_seats'], row['return_status']), (2, 1, 'full'))
        self.assertEqual(self._book(self._student(), slot=self.r1).status_code, 409)  # daily stays out
        titles = set(Notification.objects.filter(user=self.admin).values_list('title', flat=True))
        self.assertIn('موعد عودة اكتمل', titles)
        self.assertIn('موعد عودة تجاوز سعته', titles)
