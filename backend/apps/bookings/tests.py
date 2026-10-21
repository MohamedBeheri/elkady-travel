"""Monthly subscriptions close after their period and free the seat everywhere."""
from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.bookings import middleware
from apps.bookings.models import MONTHLY_DAYS, Subscription
from apps.bookings.services import expire_due_subscriptions
from apps.config_app.models import CompanySettings, PickupPoint, SeatCapacity, University
from apps.operations.models import AttendanceConfirmation, TermSeatLock
from apps.users.models import User


class MonthlyExpiryTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)

    def setUp(self):
        cs = CompanySettings.load()
        cs.booking_monthly_open = True
        cs.attendance_lock_time = None
        cs.save()
        self.admin = User.objects.filter(role='admin').first()
        cap = SeatCapacity.objects.select_related('route', 'morning_slot').first()
        self.route = cap.route
        self.uni = University.objects.first()
        self.pp = PickupPoint.objects.filter(route=self.route).first()
        self.student = User.objects.create_user(username='monthly1', password='x', role='student',
                                                full_name='طالب شهري', university=self.uni)
        self.today = timezone.localdate()

    def _subscribe_and_approve(self):
        self.client.force_authenticate(self.student)
        r = self.client.post('/api/bookings/subscriptions/', {
            'subscription_type': 'monthly', 'route': self.route.id, 'university': self.uni.id,
            'pickup_point': self.pp.id, 'amount': '500'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        sub_id = r.json()['id']
        self.client.post(f'/api/bookings/subscriptions/{sub_id}/submit-payment/')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'/api/bookings/subscriptions/{sub_id}/approve/').status_code, 200)
        return Subscription.objects.get(pk=sub_id)

    def _term_tickets(self):
        self.client.force_authenticate(self.student)
        return [t for t in self.client.get('/api/operations/seat-requests/tickets/').json() if t['kind'] == 'term']

    def test_approval_sets_thirty_days(self):
        sub = self._subscribe_and_approve()
        self.assertEqual(sub.valid_until, self.today + timedelta(days=MONTHLY_DAYS))
        self.assertEqual(TermSeatLock.objects.filter(subscription=sub, active=True).count(), 2)
        self.assertEqual(len(self._term_tickets()), 2)

    def test_still_open_on_last_day_closed_the_day_after(self):
        sub = self._subscribe_and_approve()
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today)
        self.assertEqual(expire_due_subscriptions(), [])
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today - timedelta(days=1))
        self.assertEqual(len(expire_due_subscriptions()), 1)
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'expired')
        self.assertFalse(TermSeatLock.objects.filter(subscription=sub, active=True).exists())
        self.assertEqual(self._term_tickets(), [])
        # seat no longer counted anywhere the admin looks
        lock = TermSeatLock.objects.filter(subscription=sub).first()
        AttendanceConfirmation.objects.get_or_create(term_lock=lock, date=self.today + timedelta(days=1))
        self.client.force_authenticate(self.admin)
        man = self.client.get(f'/api/operations/daily-trips/day-manifest/?date={self.today + timedelta(days=1)}').json()
        names = [x['student_name'] for r in man['routes'] for k in ('go_only', 'return_only', 'round_trip') for x in r[k]]
        self.assertNotIn(self.student.full_name, names)
        # and the student can renew
        again = self._subscribe_and_approve()
        self.assertEqual(again.status, 'confirmed')
        self.assertEqual(len(self._term_tickets()), 2)

    def test_first_request_of_the_day_closes_ended_subscriptions(self):
        sub = self._subscribe_and_approve()
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today - timedelta(days=3))
        middleware._last_run = None
        self.client.force_authenticate(self.student)
        self.client.get('/api/operations/seat-requests/tickets/')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'expired')

    def test_admin_extend_reopens_with_seats(self):
        sub = self._subscribe_and_approve()
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today - timedelta(days=1))
        expire_due_subscriptions()
        self.client.force_authenticate(self.admin)
        r = self.client.post(f'/api/bookings/subscriptions/{sub.id}/extend/')
        self.assertEqual(r.status_code, 200, r.content)
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'confirmed')
        self.assertEqual(sub.valid_until, self.today + timedelta(days=MONTHLY_DAYS))
        self.assertEqual(len(self._term_tickets()), 2)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(f'/api/bookings/subscriptions/{sub.id}/extend/').status_code, 403)

    def test_cannot_confirm_attendance_after_end_date(self):
        sub = self._subscribe_and_approve()
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today)
        lock = TermSeatLock.objects.filter(subscription=sub, active=True).first()
        self.client.force_authenticate(self.student)
        r = self.client.post('/api/operations/attendance/set/', {
            'lock_id': lock.id, 'date': str(self.today + timedelta(days=1)), 'attending': True}, format='json')
        self.assertEqual(r.status_code, 403, r.content)

    def _book_seat(self, date):
        cs = CompanySettings.load()
        cs.booking_daily_open = True
        cs.save()
        cap = SeatCapacity.objects.filter(route=self.route).first()
        self.client.force_authenticate(self.student)
        return self.client.post('/api/operations/seat-requests/book-seat/', {
            'date': str(date), 'route': self.route.id, 'direction': 'go',
            'morning_slot': cap.morning_slot_id, 'university': self.uni.id}, format='json')

    def test_no_free_booking_beyond_end_date(self):
        from apps.operations.models import SeatRequest
        sub = self._subscribe_and_approve()
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today + timedelta(days=1))
        # inside the period → confirmed on the subscription (control)
        self.assertEqual(self._book_seat(self.today + timedelta(days=1)).status_code, 201)
        inside = SeatRequest.objects.get(student=self.student, daily_trip__date=self.today + timedelta(days=1))
        self.assertEqual(inside.status, 'confirmed')
        # a day after «ينتهي في» → no subscription privilege: held, waiting for payment
        self.assertEqual(self._book_seat(self.today + timedelta(days=2)).status_code, 201)
        after = SeatRequest.objects.get(student=self.student, daily_trip__date=self.today + timedelta(days=2))
        self.assertEqual(after.status, 'held')
        self.assertIsNone(after.subscription_id)

    def test_expired_student_cannot_book_on_the_subscription(self):
        from apps.operations.models import SeatRequest
        sub = self._subscribe_and_approve()
        lock = TermSeatLock.objects.filter(subscription=sub, direction='go').first()
        Subscription.objects.filter(pk=sub.pk).update(valid_until=self.today - timedelta(days=1))
        expire_due_subscriptions()
        self.client.force_authenticate(self.student)
        tomorrow = str(self.today + timedelta(days=1))
        # attendance on the old standing seat is gone
        r = self.client.post('/api/operations/attendance/set/', {
            'lock_id': lock.id, 'date': tomorrow, 'attending': True}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.client.get(f'/api/operations/attendance/?date={tomorrow}').json()['seats'], [])
        self.assertEqual(self._term_tickets(), [])
        # a seat-map booking is now an ordinary paid daily booking, not a free monthly one
        self.assertEqual(self._book_seat(self.today + timedelta(days=1)).status_code, 201)
        self.assertEqual(SeatRequest.objects.get(student=self.student).status, 'held')
