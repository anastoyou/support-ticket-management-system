"""Django session login/logout views for the OAuth 2.1 authorization flow (Claude Web / MCP)."""

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.models import update_last_login
from django.db.models import Q
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views import View

from apps.common.mcp_utils import is_mcp_user_allowed

User = get_user_model()


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
            context["error"] = "Invalid username / employee number or password."
            return render(request, self.template_name, context, status=401)

        user = authenticate(request, username=user_obj.username, password=password)
        if user is None:
            context["error"] = "Invalid username / employee number or password."
            return render(request, self.template_name, context, status=401)

        allowed, reason = is_mcp_user_allowed(user)
        if not allowed:
            context["error"] = reason
            return render(request, self.template_name, context, status=403)

        login(request, user)
        update_last_login(None, user)
        return redirect(_safe_next_url(request, next_url))


def oauth_logout_view(request):
    """Log out the current OAuth browser session and redirect back to login."""
    logout(request)
    return redirect(settings.LOGIN_URL)
