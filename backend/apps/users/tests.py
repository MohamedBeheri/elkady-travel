from django.test import TestCase
from rest_framework.test import APIClient

from apps.users.views import LoginThrottle


class LoginThrottleTests(TestCase):
    def setUp(self):
        LoginThrottle.cache.clear()

    def tearDown(self):
        LoginThrottle.cache.clear()

    def test_wrong_passwords_on_one_account_are_limited_whatever_address_they_come_from(self):
        client = APIClient()
        codes = [client.post('/api/auth/login/', {'username': 'Admin', 'password': f'guess{i}'}, format='json',
                             HTTP_X_FORWARDED_FOR=f'10.0.0.{i}').status_code for i in range(11)]
        self.assertNotIn(429, codes[:10])
        self.assertEqual(codes[-1], 429)
        other = client.post('/api/auth/login/', {'username': 'someone-else', 'password': 'x'}, format='json')
        self.assertNotEqual(other.status_code, 429)          # the other accounts are not held up
