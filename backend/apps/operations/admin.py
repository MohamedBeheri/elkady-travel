from django.contrib import admin
from django.apps import apps
for _m in apps.get_app_config('operations').get_models():
    try:
        admin.site.register(_m)
    except admin.sites.AlreadyRegistered:
        pass
