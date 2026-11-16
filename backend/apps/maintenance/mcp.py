"""MCP tools and query collections for maintenance tickets, work logs, and leaves."""

from django.db.models import Count, Q
from mcp_server import MCPToolset, ModelQueryToolset

from apps.common.mcp_utils import (
    get_scoped_stores_queryset,
    get_scoped_tickets_queryset,
    is_office_or_admin_user,
    require_mcp_user,
)
from apps.maintenance.models import (
    Priority,
    Status,
    Ticket,
    TicketChatMessage,
    WorkNature,
    WorkerLeave,
)
from apps.maintenance.serializers import TicketWriteSerializer
from apps.stores.models import Department


class StatusQueryToolset(ModelQueryToolset):
    model = Status
    fields = ["status_id", "status_name", "short_code", "active", "order"]

    def get_queryset(self):
        require_mcp_user(self.request)
        return Status.objects.all()


class PriorityQueryToolset(ModelQueryToolset):
    model = Priority
    fields = ["priority_id", "department", "priority_name", "level"]

    def get_queryset(self):
        require_mcp_user(self.request)
        return Priority.objects.select_related("department").all()


class WorkNatureQueryToolset(ModelQueryToolset):
    model = WorkNature
    fields = ["nature_id", "nature_name", "sub_department", "default_priority", "active"]

    def get_queryset(self):
        require_mcp_user(self.request)
        return WorkNature.objects.select_related("sub_department", "default_priority").all()


class TicketQueryToolset(ModelQueryToolset):
    model = Ticket
    fields = [
        "ticket_id",
        "work_order_no",
        "store",
        "department",
        "nature",
        "priority",
        "status",
        "title",
        "description",
        "created_date",
        "approved_date",
        "rejected_date",
        "closed_date",
        "location_approval",
        "location_approved_date",
    ]
    extra_instructions = (
        "Maintenance tickets automatically scoped to the authenticated user's stores, "
        "departments, role, and status permissions."
    )

    def get_queryset(self):
        user = require_mcp_user(self.request)
        return get_scoped_tickets_queryset(user)


class WorkerLeaveQueryToolset(ModelQueryToolset):
    model = WorkerLeave
    fields = [
        "leave_id",
        "leave_type",
        "start_date",
        "end_date",
        "is_half_day",
        "half_day_slot",
        "hours",
        "status",
        "created_at",
    ]

    def get_queryset(self):
        user = require_mcp_user(self.request)
        if is_office_or_admin_user(user):
            return WorkerLeave.objects.all()
        return WorkerLeave.objects.filter(worker=user)


def _find_visible_ticket(user, ticket_id_or_work_order: str) -> Ticket:
    qs = get_scoped_tickets_queryset(user)
    key = str(ticket_id_or_work_order).strip()
    if key.isdigit():
        ticket = qs.filter(Q(ticket_id=int(key)) | Q(work_order_no__iexact=key)).first()
    else:
        ticket = qs.filter(work_order_no__iexact=key).first()
    if ticket is None:
        raise ValueError(f"Ticket '{ticket_id_or_work_order}' not found or not accessible.")
    return ticket


def _serialize_ticket_brief(ticket: Ticket) -> dict:
    return {
        "ticket_id": ticket.ticket_id,
        "work_order_no": ticket.work_order_no,
        "title": ticket.title,
        "status": ticket.status.status_name if ticket.status else None,
        "priority": ticket.priority.priority_name if ticket.priority else None,
        "store_id": ticket.store_id,
        "store_name": ticket.store.store_name if ticket.store else None,
        "department_id": ticket.department_id,
        "department_name": ticket.department.department_name if ticket.department else None,
        "nature": ticket.nature.nature_name if ticket.nature else None,
        "location_approval": ticket.location_approval,
        "created_by": ticket.created_by.full_name or ticket.created_by.username,
        "created_date": ticket.created_date.isoformat() if ticket.created_date else None,
    }


class MaintenanceTools(MCPToolset):
    """Role-scoped tools for searching, summarizing, creating, and commenting on maintenance tickets."""

    def list_tickets(
        self,
        status: str | None = None,
        priority: str | None = None,
        store: str | None = None,
        department_id: int | None = None,
        search: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 25,
    ) -> dict:
        """
        Search and list maintenance tickets visible to the authenticated user.
        Dates use YYYY-MM-DD format. Status/priority/store accept ID or name.
        """
        user = require_mcp_user(self.request)
        qs = get_scoped_tickets_queryset(user).order_by("-created_date")

        if status:
            clean_status = status.strip()
            if clean_status.isdigit():
                qs = qs.filter(status_id=int(clean_status))
            else:
                qs = qs.filter(
                    Q(status__status_name__iexact=clean_status)
                    | Q(status__status_name__iexact=clean_status.replace("_", " "))
                )

        if priority:
            clean_prio = priority.strip()
            if clean_prio.isdigit():
                qs = qs.filter(priority_id=int(clean_prio))
            else:
                qs = qs.filter(priority__priority_name__iexact=clean_prio)

        if store:
            clean_store = store.strip()
            qs = qs.filter(
                Q(store__store_id__iexact=clean_store)
                | Q(store__store_name__icontains=clean_store)
                | Q(store__short_code__iexact=clean_store)
            )

        if department_id is not None:
            qs = qs.filter(department_id=department_id)

        if search:
            term = search.strip()
            clean_term = term.lstrip("#")
            q = (
                Q(title__icontains=term)
                | Q(work_order_no__icontains=term)
                | Q(description__icontains=term)
                | Q(store__store_name__icontains=term)
                | Q(nature__nature_name__icontains=term)
            )
            if clean_term.isdigit():
                q |= Q(ticket_id=int(clean_term))
            qs = qs.filter(q).distinct()

        if from_date:
            qs = qs.filter(created_date__date__gte=from_date.strip())
        if to_date:
            qs = qs.filter(created_date__date__lte=to_date.strip())

        capped = max(1, min(limit, 100))
        items = [_serialize_ticket_brief(t) for t in qs[:capped]]
        return {"total_matching": qs.count(), "returned": len(items), "tickets": items}

    def get_ticket_details(self, ticket_id_or_work_order: str) -> dict:
        """
        Get detailed information for a single ticket (by numeric ticket_id or work_order_no),
        including allocated workers, work logs, recent status history, and recent chat messages.
        """
        user = require_mcp_user(self.request)
        ticket = _find_visible_ticket(user, ticket_id_or_work_order)

        allocations = [
            {
                "allocation_id": a.allocation_id,
                "worker_id": a.worker_id,
                "worker_name": a.worker.full_name or a.worker.username,
                "planned_hours": float(a.planned_hours),
                "assigned_date": a.assigned_date.isoformat() if a.assigned_date else None,
                "remarks": a.remarks,
            }
            for a in ticket.allocations.select_related("worker").all()
        ]
        work_logs = [
            {
                "worklog_id": wl.worklog_id,
                "worker_name": wl.worker.full_name or wl.worker.username,
                "work_date": wl.work_date.isoformat() if wl.work_date else None,
                "hours": float(wl.hours),
                "work_done": wl.work_done,
            }
            for wl in ticket.work_logs.select_related("worker").order_by("-work_date")[:20]
        ]
        history = [
            {
                "status": h.status.status_name if h.status else None,
                "changed_by": (
                    (h.changed_by.full_name or h.changed_by.username)
                    if h.changed_by
                    else None
                ),
                "changed_date": h.changed_date.isoformat() if h.changed_date else None,
                "remarks": h.remarks,
            }
            for h in ticket.history.select_related("status", "changed_by").order_by("-changed_date")[:15]
        ]
        chats = [
            {
                "sender": m.sender.full_name or m.sender.username,
                "message_text": m.message_text,
                "created_date": m.created_date.isoformat() if m.created_date else None,
            }
            for m in ticket.chat_messages.select_related("sender").order_by("-created_date")[:15]
        ]

        data = _serialize_ticket_brief(ticket)
        data.update(
            {
                "description": ticket.description,
                "approved_by": (
                    (ticket.approved_by.full_name or ticket.approved_by.username)
                    if ticket.approved_by
                    else None
                ),
                "approved_date": ticket.approved_date.isoformat() if ticket.approved_date else None,
                "rejected_by": (
                    (ticket.rejected_by.full_name or ticket.rejected_by.username)
                    if ticket.rejected_by
                    else None
                ),
                "rejected_date": ticket.rejected_date.isoformat() if ticket.rejected_date else None,
                "reject_reason": ticket.reject_reason,
                "closed_by": (
                    (ticket.closed_by.full_name or ticket.closed_by.username)
                    if ticket.closed_by
                    else None
                ),
                "closed_date": ticket.closed_date.isoformat() if ticket.closed_date else None,
                "location_approved_date": (
                    ticket.location_approved_date.isoformat()
                    if ticket.location_approved_date
                    else None
                ),
                "location_reject_reason": ticket.location_reject_reason,
                "allocations": allocations,
                "work_logs": work_logs,
                "history": history,
                "recent_chat_messages": list(reversed(chats)),
            }
        )
        return data

    def get_ticket_summary(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        department_id: int | None = None,
    ) -> dict:
        """
        Return aggregate ticket counts grouped by status and priority within the user's visible scope.
        """
        user = require_mcp_user(self.request)
        qs = get_scoped_tickets_queryset(user)
        if department_id is not None:
            qs = qs.filter(department_id=department_id)
        if from_date:
            qs = qs.filter(created_date__date__gte=from_date.strip())
        if to_date:
            qs = qs.filter(created_date__date__lte=to_date.strip())

        by_status = list(
            qs.values("status__status_name")
            .annotate(count=Count("ticket_id", distinct=True))
            .order_by("-count")
        )
        by_priority = list(
            qs.values("priority__priority_name")
            .annotate(count=Count("ticket_id", distinct=True))
            .order_by("-count")
        )
        by_department = list(
            qs.values("department__department_name")
            .annotate(count=Count("ticket_id", distinct=True))
            .order_by("-count")
        )
        return {
            "total_tickets": qs.count(),
            "by_status": [
                {"status": row["status__status_name"], "count": row["count"]}
                for row in by_status
            ],
            "by_priority": [
                {"priority": row["priority__priority_name"], "count": row["count"]}
                for row in by_priority
            ],
            "by_department": [
                {"department": row["department__department_name"], "count": row["count"]}
                for row in by_department
            ],
        }

    def list_worker_leaves(
        self,
        status: str | None = None,
        worker_search: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 30,
    ) -> dict:
        """
        List worker leave requests. Office Admins, Admins, and Management see all leaves;
        other users see their own leaves.
        """
        user = require_mcp_user(self.request)
        qs = WorkerLeave.objects.select_related("worker", "approved_by")
        if not is_office_or_admin_user(user):
            qs = qs.filter(worker=user)

        if status:
            qs = qs.filter(status__iexact=status.strip())
        if worker_search:
            term = worker_search.strip()
            qs = qs.filter(
                Q(worker__full_name__icontains=term)
                | Q(worker__username__icontains=term)
                | Q(worker__employee_no__icontains=term)
            )
        if from_date:
            qs = qs.filter(end_date__gte=from_date.strip())
        if to_date:
            qs = qs.filter(start_date__lte=to_date.strip())

        capped = max(1, min(limit, 100))
        leaves = [
            {
                "leave_id": lv.leave_id,
                "worker": lv.worker.full_name or lv.worker.username,
                "employee_no": lv.worker.employee_no,
                "leave_type": lv.leave_type,
                "start_date": lv.start_date.isoformat(),
                "end_date": lv.end_date.isoformat(),
                "is_half_day": lv.is_half_day,
                "hours": float(lv.hours),
                "status": lv.status,
                "reason": lv.reason,
            }
            for lv in qs[:capped]
        ]
        return {"count": qs.count(), "returned": len(leaves), "leaves": leaves}

    def create_ticket(
        self,
        store_id: str,
        department_id: int,
        nature_id: int,
        title: str,
        description: str,
        priority_id: int | None = None,
    ) -> dict:
        """
        Create a new maintenance ticket on behalf of the authenticated user.
        Requires 'maintenance.create_ticket' permission (or superuser) and store access.
        Use list_stores and list_departments_and_work_natures first to get valid IDs.
        """
        user = require_mcp_user(self.request)
        if not user.is_superuser and not user.has_perm("maintenance.create_ticket"):
            raise PermissionError("You do not have permission to create tickets.")

        if not get_scoped_stores_queryset(user).filter(store_id=store_id).exists():
            raise PermissionError(f"You do not have access to store '{store_id}'.")

        if not Department.objects.filter(department_id=department_id).exists():
            raise ValueError(f"Department '{department_id}' does not exist.")

        payload = {
            "store": store_id,
            "department": department_id,
            "nature": nature_id,
            "title": title,
            "description": description,
        }
        if priority_id is not None:
            payload["priority"] = priority_id

        serializer = TicketWriteSerializer(data=payload, context={"request": self.request})
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        return {
            "created": True,
            "ticket": _serialize_ticket_brief(ticket),
        }

    def add_ticket_chat_message(self, ticket_id_or_work_order: str, message_text: str) -> dict:
        """
        Post a text comment/chat message on an accessible maintenance ticket as the authenticated user.
        """
        user = require_mcp_user(self.request)
        text = (message_text or "").strip()
        if not text:
            raise ValueError("message_text cannot be empty.")

        ticket = _find_visible_ticket(user, ticket_id_or_work_order)
        msg = TicketChatMessage.objects.create(
            ticket=ticket,
            sender=user,
            message_text=text,
        )
        return {
            "message_id": msg.message_id,
            "ticket_id": ticket.ticket_id,
            "work_order_no": ticket.work_order_no,
            "sender": user.full_name or user.username,
            "message_text": msg.message_text,
            "created_date": msg.created_date.isoformat() if msg.created_date else None,
        }
