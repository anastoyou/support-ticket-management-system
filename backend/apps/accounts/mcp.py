"""MCP tools for authenticated user profile and scope inspection."""

from mcp_server import MCPToolset

from apps.common.mcp_utils import require_mcp_user


class AccountTools(MCPToolset):
    """Tools for inspecting the currently authenticated user's profile and permissions."""

    def get_my_profile(self) -> dict:
        """
        Return the authenticated user's profile, role, assigned departments,
        accessible stores, and managed store.
        """
        user = require_mcp_user(self.request)
        managed_store = getattr(user, "managed_store", None)
        return {
            "user_id": user.user_id,
            "username": user.username,
            "employee_no": user.employee_no,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.role_name if user.role else None,
            "is_superuser": bool(user.is_superuser),
            "active": bool(user.active),
            "accessible_stores": [
                {"store_id": s.store_id, "store_name": s.store_name}
                for s in user.accessible_stores.all()
            ],
            "sub_departments": [
                {
                    "sub_department_id": sd.sub_department_id,
                    "sub_department_name": sd.sub_department_name,
                    "department_id": sd.department_id,
                    "department_name": sd.department.department_name if sd.department else None,
                }
                for sd in user.sub_departments.select_related("department").all()
            ],
            "managed_store": (
                {
                    "store_id": managed_store.store_id,
                    "store_name": managed_store.store_name,
                }
                if managed_store
                else None
            ),
            "permissions": sorted(user.get_all_permissions()),
        }
