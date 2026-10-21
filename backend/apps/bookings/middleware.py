"""Closes ended subscriptions on the first request of each day, so it works
even when no cron job is installed on the server."""
import logging

from django.utils import timezone

log = logging.getLogger(__name__)
_last_run = None


class SubscriptionExpiryMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        global _last_run
        today = timezone.localdate()
        if _last_run != today:
            _last_run = today
            try:
                from .services import expire_due_subscriptions
                expire_due_subscriptions(today)
            except Exception:  # never break a request over housekeeping
                _last_run = None
                log.exception('subscription expiry failed')
        return self.get_response(request)
