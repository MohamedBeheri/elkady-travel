from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views.static import serve

from .views import (
    dashboard_stats, dashboard_charts, public_explore, public_universities,
    public_availability, public_tourism_request, public_colleges, public_pickup_points,
)


def spa(request, *args, **kwargs):
    """Serve the built SPA's index.html for any non-API route (client-side routing)."""
    index = settings.FRONTEND_DIR / 'index.html'
    if not index.exists():
        raise Http404('Frontend build not found')
    return FileResponse(open(index, 'rb'))


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include([
        path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
        path('dashboard/charts/', dashboard_charts, name='dashboard_charts'),
        path('public/explore/', public_explore, name='public_explore'),
        path('public/universities/', public_universities, name='public_universities'),
        path('public/colleges/', public_colleges, name='public_colleges'),
        path('public/pickup-points/', public_pickup_points, name='public_pickup_points'),
        path('public/availability/', public_availability, name='public_availability'),
        path('public/tourism-request/', public_tourism_request, name='public_tourism_request'),
        path('auth/', include('apps.users.urls')),
        path('config/', include('apps.config_app.urls')),
        path('bookings/', include('apps.bookings.urls')),
        path('operations/', include('apps.operations.urls')),
        path('tourism/', include('apps.tourism.urls')),
        path('notifications/', include('apps.notifications.urls')),
        path('fleet/', include('apps.fleet.urls')),
    ])),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^(?!api/|admin/|media/|static/|assets/).*$', spa, name='spa'),
]
