"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import re
from pathlib import Path
from django.views.static import serve
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

# Monkeypatch DRF FileField to return relative URLs instead of absolute URLs,
# preventing hardcoded localhost/127.0.0.1:8000 domains behind reverse proxies.
from rest_framework.serializers import FileField


def relative_to_representation(self, value):
    if not value:
        return None
    try:
        return value.url
    except AttributeError:
        return None


FileField.to_representation = relative_to_representation


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/common/', include('apps.common.urls')),
    path('api/stores/', include('apps.stores.urls')),
    path('api/maintenance/', include('apps.maintenance.urls')),
    path('api/finance/', include('apps.finance.urls')),
    path('api/reports/', include('apps.reports.urls')),
]

# Serve media files in development and production fallback
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.BASE_DIR / 'static')
else:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)

def serve_root_static(request, path):
    if hasattr(settings, 'STATIC_ROOT') and settings.STATIC_ROOT and (Path(settings.STATIC_ROOT) / path).exists():
        return serve(request, path, document_root=settings.STATIC_ROOT)
    return serve(request, path, document_root=settings.BASE_DIR / 'static')


# Serve root PWA and brand static files directly if requested without /static/ prefix
ROOT_STATIC_FILES = [
    'document_logo.png',
    'manifest.webmanifest',
    'sw.js',
    'icon-192x192.png',
    'icon-512x512.png',
    'favicon.svg',
    'favicon.ico',
    'ic_stat_notify.png',
    'icons.svg',
]

for static_file in ROOT_STATIC_FILES:
    urlpatterns.append(
        path(
            static_file,
            serve_root_static,
            {'path': static_file}
        )
    )

# SPA routing fallback: serve React SPA index.html for all other paths
urlpatterns += [
    re_path(
        r'^(?!static/|media/|api/|admin/|' +
        '|'.join([re.escape(f) for f in ROOT_STATIC_FILES]) + r').*$',
        TemplateView.as_view(template_name='index.html'),
    )
]