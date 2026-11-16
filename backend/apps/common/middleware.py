import threading
import time
from urllib.parse import urlparse
from django.conf import settings

_thread_locals = threading.local()

_LOOPBACK_HOSTS = {'127.0.0.1', 'localhost', '[::1]'}
_PROXY_HEADER_KEYS = (
    'HTTP_X_ARR_LOG_ID',
    'HTTP_X_ORIGINAL_URL',
    'HTTP_X_FORWARDED_FOR',
    'HTTP_VIA',
)


class PublicProxyUrlMiddleware:
    """
    Restore the public scheme and host when sitting behind a reverse proxy
    (such as IIS ARR) that rewrites Host to 127.0.0.1 and omits X-Forwarded-* headers.
    Controlled by settings.PUBLIC_BASE_URL (e.g. https://docs.kw.grandhyper.com).
    """

    def __init__(self, get_response):
        self.get_response = get_response
        raw_url = (getattr(settings, 'PUBLIC_BASE_URL', '') or '').strip().rstrip('/')
        parsed = urlparse(raw_url) if raw_url else None
        self.scheme = parsed.scheme if parsed and parsed.scheme and parsed.netloc else None
        self.netloc = parsed.netloc if parsed and parsed.scheme and parsed.netloc else None

    def __call__(self, request):
        if self.scheme and self.netloc and 'HTTP_X_FORWARDED_HOST' not in request.META:
            raw_host = request.META.get('HTTP_HOST', '')
            host_only = raw_host.split(':')[0].lower()
            has_proxy_marker = any(k in request.META for k in _PROXY_HEADER_KEYS)
            if has_proxy_marker or host_only in _LOOPBACK_HOSTS:
                request.META['HTTP_X_FORWARDED_HOST'] = self.netloc
                request.META['HTTP_X_FORWARDED_PROTO'] = self.scheme
                request.META['wsgi.url_scheme'] = self.scheme
        return self.get_response(request)


def get_current_request():
    return getattr(_thread_locals, 'request', None)

class ThreadLocalRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.request = request
        try:
            response = self.get_response(request)
        finally:
            if hasattr(_thread_locals, 'request'):
                del _thread_locals.request
        return response


class McpLoggingMiddleware:
    """Log detailed MCP JSON-RPC and OAuth 2.1 request/response exchanges."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from apps.common.mcp_logging import (
            is_mcp_or_oauth_path,
            log_mcp_http_exchange,
            prepare_mcp_request_capture,
        )

        if not is_mcp_or_oauth_path(request.path):
            return self.get_response(request)

        try:
            prepare_mcp_request_capture(request)
        except Exception:
            pass

        start_ns = getattr(request, '_mcp_start_ns', time.perf_counter())
        try:
            response = self.get_response(request)
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_ns) * 1000.0
            try:
                log_mcp_http_exchange(request, None, duration_ms, exc=exc)
            except Exception:
                pass
            raise

        duration_ms = (time.perf_counter() - start_ns) * 1000.0
        try:
            log_mcp_http_exchange(request, response, duration_ms)
        except Exception:
            pass
        return response
