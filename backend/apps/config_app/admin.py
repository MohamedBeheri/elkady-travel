from django.contrib import admin
from django.apps import apps
for _m in apps.get_app_config('config_app').get_models():
    try:
        admin.site.register(_m)
    except admin.sites.AlreadyRegistered:
        pass
