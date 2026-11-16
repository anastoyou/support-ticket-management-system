"""MCP tools and query collections for stores, areas, and departments."""

from django.db.models import Q
from mcp_server import MCPToolset, ModelQueryToolset

from apps.common.mcp_utils import get_scoped_stores_queryset, require_mcp_user
from apps.maintenance.models import WorkNature
from apps.stores.models import Department, Store, SubDepartment


class StoreQueryToolset(ModelQueryToolset):
    model = Store
    fields = ["store_id", "store_name", "short_code", "type", "area", "active"]
    extra_instructions = "Stores visible to the authenticated user."

    def get_queryset(self):
        user = require_mcp_user(self.request)
        return get_scoped_stores_queryset(user)


class DepartmentQueryToolset(ModelQueryToolset):
    model = Department
    fields = ["department_id", "department_name", "short_code"]

    def get_queryset(self):
        require_mcp_user(self.request)
        return Department.objects.all()


class SubDepartmentQueryToolset(ModelQueryToolset):
    model = SubDepartment
    fields = ["sub_department_id", "sub_department_name", "department"]

    def get_queryset(self):
        require_mcp_user(self.request)
        return SubDepartment.objects.select_related("department").all()


class StoreTools(MCPToolset):
    """Tools for browsing stores, departments, and work natures."""

    def list_stores(
        self,
        search: str | None = None,
        store_type: str | None = None,
        active_only: bool = True,
        limit: int = 50,
    ) -> dict:
        """
        List stores accessible to the authenticated user.
        Optionally filter by search term (name, store_id, short_code, area), store_type, or active status.
        """
        user = require_mcp_user(self.request)
        qs = get_scoped_stores_queryset(user)
        if active_only:
            qs = qs.filter(active=True)
        if store_type:
            qs = qs.filter(type__iexact=store_type.strip())
        if search:
            term = search.strip()
            qs = qs.filter(
                Q(store_name__icontains=term)
                | Q(store_id__icontains=term)
                | Q(short_code__icontains=term)
                | Q(area__area_name__icontains=term)
            )
        capped = max(1, min(limit, 200))
        items = [
            {
                "store_id": s.store_id,
                "store_name": s.store_name,
                "short_code": s.short_code,
                "type": s.type,
                "area": s.area.area_name if s.area else None,
                "manager": s.manager.full_name if s.manager else None,
                "active": s.active,
            }
            for s in qs[:capped]
        ]
        return {"count": qs.count(), "returned": len(items), "stores": items}

    def list_departments_and_work_natures(self, department_id: int | None = None) -> dict:
        """
        List departments, their sub-departments, and active work natures (useful before filtering or creating tickets).
        """
        require_mcp_user(self.request)
        depts = Department.objects.all().order_by("department_name")
        if department_id is not None:
            depts = depts.filter(department_id=department_id)

        result = []
        for dept in depts:
            natures = WorkNature.objects.filter(
                sub_department__department=dept,
                active=True,
            ).select_related("sub_department", "default_priority")
            result.append(
                {
                    "department_id": dept.department_id,
                    "department_name": dept.department_name,
                    "short_code": dept.short_code,
                    "work_natures": [
                        {
                            "nature_id": n.nature_id,
                            "nature_name": n.nature_name,
                            "sub_department_id": n.sub_department_id,
                            "sub_department_name": n.sub_department.sub_department_name,
                            "default_priority": (
                                n.default_priority.priority_name if n.default_priority else None
                            ),
                        }
                        for n in natures
                    ],
                }
            )
        return {"departments": result}
