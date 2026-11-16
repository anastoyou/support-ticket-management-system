"""Django session login/logout and OAuth authorization views (Claude Web / MCP)."""

import logging
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.models import update_last_login
from django.db.models import Q
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views import View
from oauth2_provider.views import AuthorizationView

from apps.common.mcp_utils import is_mcp_user_allowed

User = get_user_model()
mcp_traffic_logger = logging.getLogger("mcp.traffic")


def _safe_next_url(request, candidate):
    if candidate and url_has_allowed_host_and_scheme(
        url=candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return candidate
    return "/"


class OAuthLoginView(View):
    """
    Sign-in page used by django-oauth-toolkit's AuthorizationView (LoginRequiredMixin).
    Authenticates existing Maintenance Tracker accounts using username or employee_no.
    """

    template_name = "accounts/oauth_login.html"

    def get(self, request):
        next_url = request.GET.get("next", "")
        if request.user.is_authenticated:
            allowed, reason = is_mcp_user_allowed(request.user)
            if allowed and next_url:
                return redirect(_safe_next_url(request, next_url))
            if not allowed:
                return render(
                    request,
                    self.template_name,
                    {"next": next_url, "error": reason},
                    status=403,
                )
        return render(request, self.template_name, {"next": next_url})

    def post(self, request):
        login_value = (request.POST.get("login_id") or "").strip()
        password = request.POST.get("password") or ""
        next_url = request.POST.get("next") or request.GET.get("next", "")

        context = {"next": next_url, "login_id": login_value}

        if not login_value or not password:
            context["error"] = "Please enter your username / employee number and password."
            return render(request, self.template_name, context, status=400)

        user_obj = User.objects.filter(
            Q(username=login_value) | Q(employee_no=login_value)
        ).first()

        if user_obj is None:
            mcp_traffic_logger.warning("MCP_OAUTH_LOGIN_FAILED | login_id=%s | reason=user_not_found", login_value)
            context["error"] = "Invalid username / employee number or password."
            return render(request, self.template_name, context, status=401)

        user = authenticate(request, username=user_obj.username, password=password)
        if user is None:
            mcp_traffic_logger.warning(
                "MCP_OAUTH_LOGIN_FAILED | username=%s | reason=invalid_password",
                user_obj.username,
            )
            context["error"] = "Invalid username / employee number or password."
            return render(request, self.template_name, context, status=401)

        allowed, reason = is_mcp_user_allowed(user)
        if not allowed:
            mcp_traffic_logger.warning(
                "MCP_OAUTH_LOGIN_DENIED | username=%s (id=%s) | reason=%s",
                user.username,
                user.pk,
                reason,
            )
            context["error"] = reason
            return render(request, self.template_name, context, status=403)

        login(request, user)
        update_last_login(None, user)
        mcp_traffic_logger.info(
            "MCP_OAUTH_LOGIN_SUCCESS | username=%s (id=%s)",
            user.username,
            user.pk,
        )
        return redirect(_safe_next_url(request, next_url))


def oauth_logout_view(request):
    """Log out the current OAuth browser session and redirect back to login."""
    username = getattr(request.user, "username", None) if getattr(request.user, "is_authenticated", False) else None
    logout(request)
    mcp_traffic_logger.info("MCP_OAUTH_LOGOUT | username=%s", username or "anonymous")
    return redirect(settings.LOGIN_URL)


class McpAuthorizationView(AuthorizationView):
    """
    AuthorizationView subclass that avoids HTTP 302 Location rewriting by upstream
    reverse proxies (such as IIS ARR with 'Reverse rewrite host in response headers')
    when redirecting back to an external OAuth callback URL like claude.ai.
    """

    def redirect(self, redirect_to, application):
        response = super().redirect(redirect_to, application)
        parsed = urlparse(redirect_to)
        current_host = (self.request.get_host() or "").lower()
        app_name = getattr(application, "name", None) or getattr(application, "client_id", None) or "-"
        username = getattr(self.request.user, "username", "anonymous")
        if parsed.netloc and parsed.netloc.lower() != current_host:
            mcp_traffic_logger.info(
                "MCP_OAUTH_AUTHORIZE_REDIRECT | user=%s | client=%s | callback_host=%s | mode=html_redirect",
                username,
                app_name,
                parsed.netloc,
            )
            return render(
                self.request,
                "accounts/oauth_redirect.html",
                {"redirect_url": redirect_to},
            )
        mcp_traffic_logger.info(
            "MCP_OAUTH_AUTHORIZE_REDIRECT | user=%s | client=%s | callback_host=%s | mode=http_redirect",
            username,
            app_name,
            parsed.netloc or current_host,
        )
        return response
