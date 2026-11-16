"""MCP tools and query collections for worker claims and ticket expenses."""

from django.db.models import Count, Q, Sum
from mcp_server import MCPToolset, ModelQueryToolset

from apps.common.mcp_utils import get_scoped_tickets_queryset, require_mcp_user
from apps.finance.models import Expense, WorkerClaim


def _can_view_all_finance(user) -> bool:
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    role_name = (
        user.role.role_name.lower().strip()
        if hasattr(user, "role") and user.role and user.role.role_name
        else ""
    )
    groups_lower = {g.lower().strip() for g in user.groups.values_list("name", flat=True)}
    admin_roles = {
        "management",
        "management team",
        "administrator",
        "admin",
        "office administrator",
        "office admin",
        "finance",
        "accountant",
        "accounts",
        "auditor",
    }
    if role_name in admin_roles or (groups_lower & admin_roles):
        return True
    return any(
        user.has_perm(p)
        for p in (
            "finance.approve_workerclaim",
            "finance.view_workerclaim",
            "finance.change_workerclaim",
            "finance.view_expense",
            "finance.approve_expense",
        )
    )


def _scoped_claims_queryset(user):
    qs = WorkerClaim.objects.select_related("worker", "ticket", "approved_by")
    if _can_view_all_finance(user):
        return qs
    return qs.filter(Q(worker=user) | Q(submitted_by=user)).distinct()


def _scoped_expenses_queryset(user):
    qs = Expense.objects.select_related("worker", "ticket", "expense_type", "responsible_store")
    if _can_view_all_finance(user):
        return qs
    return qs.filter(Q(worker=user) | Q(added_by=user)).distinct()


class WorkerClaimQueryToolset(ModelQueryToolset):
    model = WorkerClaim
    fields = [
        "claim_id",
        "ticket",
        "claim_date",
        "total_claimed_amount",
        "status",
        "period_from",
        "period_to",
    ]

    def get_queryset(self):
        user = require_mcp_user(self.request)
        return _scoped_claims_queryset(user)


class ExpenseQueryToolset(ModelQueryToolset):
    model = Expense
    fields = [
        "expense_id",
        "ticket",
        "amount",
        "expense_date",
        "approved",
        "responsible_store",
        "is_claimed",
        "claim",
        "is_paid",
    ]

    def get_queryset(self):
        user = require_mcp_user(self.request)
        return _scoped_expenses_queryset(user)


class FinanceTools(MCPToolset):
    """Role-scoped tools for summarizing worker claims and viewing ticket expenses."""

    def get_claims_summary(
        self,
        status: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict:
        """
        Summarize worker claims (count and total claimed amount grouped by status)
        within the authenticated user's finance scope.
        """
        user = require_mcp_user(self.request)
        qs = _scoped_claims_queryset(user)
        if status:
            qs = qs.filter(status__iexact=status.strip())
        if from_date:
            qs = qs.filter(claim_date__date__gte=from_date.strip())
        if to_date:
            qs = qs.filter(claim_date__date__lte=to_date.strip())

        breakdown = list(
            qs.values("status")
            .annotate(count=Count("claim_id"), total_amount=Sum("total_claimed_amount"))
            .order_by("status")
        )
        totals = qs.aggregate(
            total_claims=Count("claim_id"),
            grand_total=Sum("total_claimed_amount"),
        )
        return {
            "total_claims": totals["total_claims"] or 0,
            "grand_total_amount": float(totals["grand_total"] or 0),
            "by_status": [
                {
                    "status": row["status"],
                    "count": row["count"],
                    "total_amount": float(row["total_amount"] or 0),
                }
                for row in breakdown
            ],
        }

    def list_ticket_expenses(self, ticket_id_or_work_order: str) -> dict:
        """
        List expenses recorded against a ticket visible to the authenticated user.
        """
        user = require_mcp_user(self.request)
        key = str(ticket_id_or_work_order).strip()
        ticket_qs = get_scoped_tickets_queryset(user)
        if key.isdigit():
            ticket = ticket_qs.filter(Q(ticket_id=int(key)) | Q(work_order_no__iexact=key)).first()
        else:
            ticket = ticket_qs.filter(work_order_no__iexact=key).first()
        if ticket is None:
            raise ValueError(f"Ticket '{ticket_id_or_work_order}' not found or not accessible.")

        if not _can_view_all_finance(user) and not user.has_perm("maintenance.can_view_expance_for_ticket"):
            exp_qs = _scoped_expenses_queryset(user).filter(ticket=ticket)
        else:
            exp_qs = Expense.objects.select_related(
                "worker", "expense_type", "responsible_store"
            ).filter(ticket=ticket)

        expenses = [
            {
                "expense_id": e.expense_id,
                "expense_type": e.expense_type.expense_name if e.expense_type else None,
                "worker": e.worker.full_name or e.worker.username,
                "amount": float(e.amount),
                "expense_date": e.expense_date.isoformat() if e.expense_date else None,
                "approved": e.approved,
                "is_claimed": e.is_claimed,
                "is_paid": e.is_paid,
                "remarks": e.remarks,
            }
            for e in exp_qs.order_by("-expense_date")
        ]
        return {
            "ticket_id": ticket.ticket_id,
            "work_order_no": ticket.work_order_no,
            "count": len(expenses),
            "total_amount": sum(x["amount"] for x in expenses),
            "expenses": expenses,
        }
