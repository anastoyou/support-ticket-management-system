"""Shared authentication, DCR permission, and queryset-scoping helpers for MCP tools."""

import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def _user_role_and_groups(user):
    role_name = (
        user.role.role_name.lower().strip()
        if hasattr(user, "role") and user.role and user.role.role_name
        else ""
    )
    groups_lower = {
        g.lower().strip() for g in user.groups.values_list("name", flat=True)
    }
    return role_name, groups_lower


def is_mcp_user_allowed(user):
    """
    Validate that an authenticated user is active, approved, and permitted
    to use the MCP server (respecting optional settings.MCP_ALLOWED_ROLES).
    Returns (allowed: bool, reason: str | None).
    """
    if not user or getattr(user, "is_anonymous", True) or not getattr(user, "is_authenticated", False):
        return False, "Authentication required."

    if not getattr(user, "is_active", True):
        return False, "User account is disabled."

    if not getattr(user, "active", False) and not getattr(user, "is_superuser", False):
        return False, "Account is waiting for admin approval."

    allowed_roles = [
        r.lower().strip()
        for r in getattr(settings, "MCP_ALLOWED_ROLES", [])
        if str(r).strip()
    ]
    if allowed_roles and not getattr(user, "is_superuser", False):
        role_name, groups_lower = _user_role_and_groups(user)
        if role_name not in allowed_roles and not (groups_lower & set(allowed_roles)):
            return False, "Your role does not have permission to access the MCP server."

    return True, None


def require_mcp_user(request):
    """Return the validated CustomUser from an MCP tool request or raise PermissionError."""
    user = getattr(request, "user", None)
    allowed, reason = is_mcp_user_allowed(user)
    if not allowed:
        raise PermissionError(reason or "Unauthorized")
    return user


def is_management_or_superuser(user):
    """Return True if user is a superuser or belongs to Management."""
    if getattr(user, "is_superuser", False):
        return True
    role_name, groups_lower = _user_role_and_groups(user)
    return role_name in ("management", "management team") or "management" in groups_lower


def is_office_or_admin_user(user):
    """Return True if user is a superuser, staff, Office Admin, or Administrator."""
    from apps.maintenance.utils import is_admin_or_office_admin

    if is_admin_or_office_admin(user):
        return True
    return is_management_or_superuser(user)


def get_scoped_tickets_queryset(user):
    """
    Return Ticket queryset scoped to the user's role, status permissions,
    accessible stores, and departments (matching TicketViewSet.get_queryset).
    """
    from apps.maintenance.models import Status, Ticket

    queryset = Ticket.objects.select_related(
        "store",
        "store__area",
        "department",
        "nature",
        "nature__sub_department",
        "priority",
        "status",
        "created_by",
    )

    if is_management_or_superuser(user):
        return queryset

    user_perms = user.get_all_permissions()
    disallowed_status_ids = []
    for s in Status.objects.all():
        codename = f"can_view_{s.status_name.lower().replace(' ', '_')}_ticket"
        if f"maintenance.{codename}" not in user_perms:
            disallowed_status_ids.append(s.status_id)
    if disallowed_status_ids:
        queryset = queryset.exclude(status_id__in=disallowed_status_ids)

    role_name, groups_lower = _user_role_and_groups(user)
    if role_name == "technician":
        return queryset.filter(allocations__worker=user).distinct()

    accessible_store_ids = list(user.accessible_stores.values_list("store_id", flat=True))
    if not accessible_store_ids:
        return Ticket.objects.none()
    queryset = queryset.filter(store_id__in=accessible_store_ids).distinct()

    can_view_all_depts = (
        user.has_perm("maintenance.view_all_department_tickets")
        or user.has_perm("maintenance.create_ticket_all_departments")
        or "main_admin" in groups_lower
        or "main administrator" in groups_lower
        or "administrator" in groups_lower
    )
    if not can_view_all_depts:
        user_dept_ids = list(user.sub_departments.values_list("department_id", flat=True))
        if not user_dept_ids:
            return Ticket.objects.none()
        queryset = queryset.filter(department_id__in=user_dept_ids)

    return queryset


def get_scoped_stores_queryset(user):
    """Return Store queryset scoped to the user's role and accessible_stores."""
    from apps.stores.models import Store

    role_name, groups_lower = _user_role_and_groups(user)
    is_admin_or_office = (
        getattr(user, "is_superuser", False)
        or any(r in role_name for r in ("office", "admin", "management"))
        or any("office" in g or "admin" in g or "management" in g for g in groups_lower)
        or user.has_perm("accounts.change_customuser")
        or user.has_perm("accounts.add_customuser")
        or user.has_perm("stores.add_store")
    )

    qs = Store.objects.select_related("area", "manager").order_by("store_name")
    if is_admin_or_office:
        return qs

    accessible_store_ids = list(user.accessible_stores.values_list("store_id", flat=True))
    return qs.filter(store_id__in=accessible_store_ids).distinct()


class McpDcrPermission:
    """
    Dynamic Client Registration permission for MCP clients (Claude Web, Claude Code, etc.).

    When MCP_DCR_OPEN_REGISTRATION is True (default), allows clients to register
    via RFC 7591 (/o/register/) so they can initiate OAuth 2.1 + PKCE. Note that
    registration alone grants no data access: every user still must log in and
    explicitly authorize access at /o/authorize/.
    """

    def has_permission(self, request) -> bool:
        if getattr(settings, "MCP_DCR_OPEN_REGISTRATION", True):
            return True
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))
