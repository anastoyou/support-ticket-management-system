import re
from django.db.models import Q, Prefetch, Count, F, Case, When, Value, IntegerField
from django.utils import timezone
from rest_framework import viewsets, exceptions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from decimal import Decimal

from .models import (
    ExpenseType, EmployeeRate, Expense, Reconciliation, WorkerClaim,
    LedgerBatch, LedgerGroup, Ledger, ApprovalWorkflow, ApprovalStep,
    ApprovalInstance, AuditEvent, Payment
)
from .serializers import (
    ExpenseTypeSerializer, EmployeeRateSerializer, ExpenseSerializer,
    ReconciliationSerializer, ExpenseWriteSerializer, ExpenseTypeWriteSerializer,
    WorkerClaimSerializer, WorkerClaimWriteSerializer,
    LedgerBatchSerializer, LedgerBatchWriteSerializer,
    LedgerGroupSerializer, LedgerSerializer, LedgerWriteSerializer,
    ApprovalWorkflowSerializer, ApprovalStepSerializer, ApprovalInstanceSerializer,
    AuditEventSerializer, PaymentSerializer
)
from .services import (
    BundleService, LedgerService, ApprovalService, PaymentService,
    create_audit_event
)


class FinancePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def paginate_queryset(self, queryset, request, view=None):
        if (request.query_params.get('all') == 'true' or
                request.query_params.get('no_page') == 'true' or
                request.query_params.get('page_size') == 'all'):
            return None
        self.queryset = queryset
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        total_amount = None
        stats = {}
        if hasattr(self, 'queryset'):
            try:
                from django.db.models import Sum, Count, Q
                if hasattr(self.queryset.model, 'amount'):
                    if hasattr(self.queryset.model, 'approved'):
                        agg = self.queryset.aggregate(
                            total_sum=Sum('amount'),
                            approved_count=Count('pk', filter=Q(approved=True) | Q(
                                expense_type__approve_required=False)),
                            pending_count=Count('pk', filter=Q(approved=False) & (
                                Q(expense_type__isnull=True) | Q(expense_type__approve_required=True))),
                            unclaimed_count=Count('pk', filter=Q(is_claimed=False, claim__isnull=True) & (
                                Q(approved=True) | Q(expense_type__approve_required=False)))
                        )
                        stats['approved_count'] = agg.get('approved_count', 0)
                        stats['pending_count'] = agg.get('pending_count', 0)
                        stats['unclaimed_count'] = agg.get(
                            'unclaimed_count', 0)
                    else:
                        agg = self.queryset.aggregate(total_sum=Sum('amount'))

                    if agg.get('total_sum') is not None:
                        total_amount = float(agg['total_sum'])
                elif self.queryset.model.__name__ == 'WorkerClaim':
                    agg = self.queryset.aggregate(
                        total_bundles=Count('pk'),
                        pending_bundles=Count('pk', filter=Q(
                            status__in=['Submitted', 'In Review'])),
                        approved_bundles=Count(
                            'pk', filter=Q(status='Approved'))
                    )
                    from apps.finance.models import Expense
                    eligible_qs = Expense.objects.filter(
                        is_claimed=False,
                        claim__isnull=True
                    ).filter(
                        Q(approved=True) | Q(expense_type__approve_required=False)
                    )
                    req = getattr(self, 'request', None)
                    if req:
                        from_date = req.query_params.get(
                            'from_date') or req.query_params.get('date_from')
                        to_date = req.query_params.get(
                            'to_date') or req.query_params.get('date_to')
                        if from_date:
                            eligible_qs = eligible_qs.filter(
                                expense_date__gte=from_date)
                        if to_date:
                            eligible_qs = eligible_qs.filter(
                                expense_date__lte=to_date)

                        user = getattr(req, 'user', None)
                        if user and not user.is_anonymous and not getattr(user, 'is_superuser', False):
                            user_dept_ids = list(user.sub_departments.filter(
                                department__isnull=False).values_list('department_id', flat=True).distinct())
                            if not user_dept_ids and hasattr(user, 'department') and user.department:
                                user_dept_ids = [user.department.pk]
                            if user_dept_ids:
                                eligible_qs = eligible_qs.filter(
                                    worker__sub_departments__department_id__in=user_dept_ids)

                    stats['total_bundles_count'] = agg.get('total_bundles', 0)
                    stats['pending_bundles_count'] = agg.get(
                        'pending_bundles', 0)
                    stats['approved_bundles_count'] = agg.get(
                        'approved_bundles', 0)
                    stats['unclaimed_expenses_count'] = eligible_qs.count()
            except Exception:
                pass

        res = {
            'count': self.page.paginator.count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        }
        if total_amount is not None:
            res['total_amount'] = total_amount
        res.update(stats)
        return Response(res)


class ExpenseTypeViewSet(viewsets.ModelViewSet):
    queryset = ExpenseType.objects.all().select_related('parent', 'department')
    serializer_class = ExpenseTypeSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ExpenseTypeWriteSerializer
        return ExpenseTypeSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(department_id=department)

        has_parent = self.request.query_params.get('has_parent')
        if has_parent is not None:
            if has_parent.lower() in ['true', '1']:
                queryset = queryset.filter(parent__isnull=False)
            elif has_parent.lower() in ['false', '0']:
                queryset = queryset.filter(parent__isnull=True)
        elif self.action == 'list':
            queryset = queryset.filter(parent__isnull=False)

        return queryset


class EmployeeRateViewSet(viewsets.ModelViewSet):
    queryset = EmployeeRate.objects.all().select_related('worker', 'worker__role')
    serializer_class = EmployeeRateSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return EmployeeRate.objects.none()

        if user.is_superuser or user.has_perm('finance.view_employeerate') or user.has_perm('accounts.view_customuser'):
            return queryset

        return queryset.filter(worker=user)


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by('-expense_date', '-expense_id').select_related('worker',
                                                                                             'worker__role').prefetch_related('worker__sub_departments')
    serializer_class = ExpenseSerializer
    pagination_class = FinancePagination

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ExpenseWriteSerializer
        return ExpenseSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return Expense.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip()
                             for g in user.groups.values_list('name', flat=True)]
        is_management_or_admin = (
            role_name in (
                'management', 'management team', 'administrator', 'admin',
                'office administrator', 'finance', 'accountant', 'accounts', 'auditor'
            ) or any(g in user_groups_lower for g in ('management', 'administrator', 'admin', 'office administrator', 'finance', 'accountant', 'accounts'))
        )

        has_finance_perms = (
            user.has_perm('finance.approve_workerclaim') or
            user.has_perm('finance.view_workerclaim') or
            user.has_perm('finance.change_workerclaim') or
            user.has_perm('finance.create_bundle') or
            user.has_perm('finance.submit_bundle') or
            user.has_perm('finance.view_expense') or
            user.has_perm('finance.change_expense') or
            user.has_perm('finance.approve_expense')
        )

        if not user.is_superuser and not getattr(user, 'is_staff', False) and not is_management_or_admin and not has_finance_perms:
            accessible_store_ids = list(
                user.accessible_stores.values_list('store_id', flat=True))
            if accessible_store_ids:
                queryset = queryset.filter(
                    Q(ticket__store_id__in=accessible_store_ids) |
                    Q(responsible_store_id__in=accessible_store_ids) |
                    Q(ticket__isnull=True, responsible_store__isnull=True)
                )

        ticket = self.request.query_params.get("ticket")
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)

        is_claimed = self.request.query_params.get("is_claimed")
        if is_claimed is not None:
            if is_claimed.lower() in ('false', '0', 'no'):
                queryset = queryset.filter(
                    is_claimed=False, claim__isnull=True)
            elif is_claimed.lower() in ('true', '1', 'yes'):
                queryset = queryset.filter(is_claimed=True)

        bundle_filter = self.request.query_params.get("bundle_filter")
        if bundle_filter and bundle_filter.upper() != 'ALL':
            if bundle_filter.upper() == 'IN_BUNDLE':
                queryset = queryset.filter(
                    Q(is_claimed=True) | Q(claim__isnull=False))
            elif bundle_filter.upper() == 'NOT_IN_BUNDLE':
                queryset = queryset.filter(
                    is_claimed=False, claim__isnull=True)

        approved = self.request.query_params.get("approved")
        if approved is not None:
            if approved.lower() in ('true', '1', 'yes'):
                queryset = queryset.filter(Q(approved=True) | Q(
                    expense_type__approve_required=False))
            elif approved.lower() in ('false', '0', 'no'):
                queryset = queryset.filter(
                    approved=False, expense_type__approve_required=True)

        status_param = self.request.query_params.get("status")
        if status_param and status_param.upper() != 'ALL':
            status_lower = status_param.lower().strip()
            if status_lower == 'approved':
                queryset = queryset.filter(Q(approved=True) | Q(
                    expense_type__approve_required=False)).exclude(is_paid=True).exclude(claim__status='Paid')
            elif status_lower in ('pending approval', 'pending', 'in review'):
                queryset = queryset.filter(
                    Q(approved=False) &
                    (Q(expense_type__isnull=True) | Q(expense_type__approve_required=True)) &
                    (Q(approval_instances__status='Pending') | ~Q(
                        approval_instances__status__in=['Rework', 'Rejected']))
                ).exclude(is_paid=True).exclude(claim__status='Paid').distinct()
            elif status_lower == 'rejected':
                queryset = queryset.filter(
                    approved=False,
                    approval_instances__status='Rejected'
                ).exclude(approval_instances__status='Pending').exclude(
                    is_paid=True).exclude(claim__status='Paid').distinct()
            elif status_lower == 'rework':
                queryset = queryset.filter(
                    approved=False,
                    approval_instances__status='Rework'
                ).exclude(approval_instances__status='Pending').exclude(
                    is_paid=True).exclude(claim__status='Paid').distinct()
            elif status_lower == 'paid':
                queryset = queryset.filter(
                    Q(is_paid=True) | Q(claim__status='Paid'))

        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        date_type = self.request.query_params.get("date_type")
        if date_type:
            date_type = date_type.lower().strip()

        if date_type:
            from apps.maintenance.models import Ticket

            ticket_qs = Ticket.objects.all()
            to_date_val = to_date
            if to_date_val and len(to_date_val) == 10:
                to_date_val = f"{to_date_val} 23:59:59"

            if from_date or to_date_val:
                if date_type in ('open', 'approved'):
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(approved_date__gte=from_date, approved_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Open', history__changed_date__gte=from_date,
                              history__changed_date__lte=to_date_val, history__changed_date__gt=F('created_date'))
                        )
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            Q(approved_date__gte=from_date) |
                            Q(history__status__status_name__iexact='Open',
                              history__changed_date__gte=from_date, history__changed_date__gt=F('created_date'))
                        )
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(approved_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Open',
                              history__changed_date__lte=to_date_val, history__changed_date__gt=F('created_date'))
                        )
                elif date_type in ('rejected', 'relected'):
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(rejected_date__gte=from_date, rejected_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Rejected',
                              history__changed_date__gte=from_date, history__changed_date__lte=to_date_val)
                        )
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            Q(rejected_date__gte=from_date) |
                            Q(history__status__status_name__iexact='Rejected',
                              history__changed_date__gte=from_date)
                        )
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(rejected_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Rejected',
                              history__changed_date__lte=to_date_val)
                        )
                elif date_type == 'blocked':
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            history__status__status_name__iexact='Blocked',
                            history__changed_date__gte=from_date,
                            history__changed_date__lte=to_date_val
                        )
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            history__status__status_name__iexact='Blocked',
                            history__changed_date__gte=from_date
                        )
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            history__status__status_name__iexact='Blocked',
                            history__changed_date__lte=to_date_val
                        )
                elif date_type in ('in_progress', 'in progress'):
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            history__status__status_name__iexact='In Progress',
                            history__changed_date__gte=from_date,
                            history__changed_date__lte=to_date_val
                        )
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            history__status__status_name__iexact='In Progress',
                            history__changed_date__gte=from_date
                        )
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            history__status__status_name__iexact='In Progress',
                            history__changed_date__lte=to_date_val
                        )
                elif date_type in ('location_approval', 'location approval', 'location_approved'):
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(location_approved_date__gte=from_date, location_approved_date__lte=to_date_val) |
                            Q(history__location_approved_date__gte=from_date,
                              history__location_approved_date__lte=to_date_val)
                        )
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            Q(location_approved_date__gte=from_date) |
                            Q(history__location_approved_date__gte=from_date)
                        )
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(location_approved_date__lte=to_date_val) |
                            Q(history__location_approved_date__lte=to_date_val)
                        )
                elif date_type in ('closed', 'completed'):
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(closed_date__gte=from_date, closed_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Completed', history__changed_date__gte=from_date, history__changed_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Closed',
                              history__changed_date__gte=from_date, history__changed_date__lte=to_date_val)
                        )
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            Q(closed_date__gte=from_date) |
                            Q(history__status__status_name__iexact='Completed', history__changed_date__gte=from_date) |
                            Q(history__status__status_name__iexact='Closed',
                              history__changed_date__gte=from_date)
                        )
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            Q(closed_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Completed', history__changed_date__lte=to_date_val) |
                            Q(history__status__status_name__iexact='Closed',
                              history__changed_date__lte=to_date_val)
                        )
                else:
                    # Default ticket date: created date (ticket.created_date)
                    if from_date and to_date_val:
                        ticket_qs = ticket_qs.filter(
                            created_date__gte=from_date, created_date__lte=to_date_val)
                    elif from_date:
                        ticket_qs = ticket_qs.filter(
                            created_date__gte=from_date)
                    elif to_date_val:
                        ticket_qs = ticket_qs.filter(
                            created_date__lte=to_date_val)
            else:
                # When from_date and to_date are not specified, filter by date_type stage/status
                if date_type in ('open', 'approved'):
                    ticket_qs = ticket_qs.filter(
                        Q(approved_date__isnull=False) | Q(
                            status__status_name__iexact='Open')
                    )
                elif date_type in ('rejected', 'relected'):
                    ticket_qs = ticket_qs.filter(
                        Q(rejected_date__isnull=False) | Q(
                            status__status_name__iexact='Rejected')
                    )
                elif date_type == 'blocked':
                    ticket_qs = ticket_qs.filter(
                        status__status_name__iexact='Blocked')
                elif date_type in ('in_progress', 'in progress'):
                    ticket_qs = ticket_qs.filter(
                        status__status_name__iexact='In Progress')
                elif date_type in ('location_approval', 'location approval', 'location_approved'):
                    ticket_qs = ticket_qs.filter(
                        Q(location_approved_date__isnull=False) | Q(
                            status__status_name__iexact='Location Approval')
                    )
                elif date_type in ('closed', 'completed'):
                    ticket_qs = ticket_qs.filter(
                        Q(closed_date__isnull=False) | Q(
                            status__status_name__in=['Closed', 'Completed'])
                    )

            queryset = queryset.filter(
                ticket_id__in=ticket_qs.values_list('ticket_id', flat=True))
        else:
            if from_date:
                queryset = queryset.filter(expense_date__gte=from_date)
            if to_date:
                queryset = queryset.filter(expense_date__lte=to_date)

        ledger_batch = self.request.query_params.get(
            "ledger_batch") or self.request.query_params.get("batch")
        if ledger_batch and ledger_batch.upper() != 'ALL':
            try:
                batch_obj = None
                if str(ledger_batch).isdigit():
                    batch_obj = LedgerBatch.objects.filter(
                        batch_id=int(ledger_batch)).first()
                if not batch_obj:
                    batch_obj = LedgerBatch.objects.filter(
                        batch_name__iexact=str(ledger_batch)).first()

                if batch_obj:
                    sub_dept_ids = list(batch_obj.sub_departments.values_list(
                        'sub_department_id', flat=True))
                    queryset = queryset.filter(
                        ticket__nature__sub_department_id__in=sub_dept_ids)
                else:
                    queryset = queryset.none()
            except Exception:
                pass

        search = self.request.query_params.get(
            "search") or self.request.query_params.get("q")
        if search:
            search = search.strip()
            q_search = (
                Q(expense_type__expense_name__icontains=search) |
                Q(worker__full_name__icontains=search) |
                Q(worker__username__icontains=search) |
                Q(worker__employee_no__icontains=search) |
                Q(worker__first_name__icontains=search) |
                Q(worker__last_name__icontains=search) |
                Q(added_by__full_name__icontains=search) |
                Q(added_by__username__icontains=search) |
                Q(ticket__allocations__worker__full_name__icontains=search) |
                Q(ticket__allocations__worker__username__icontains=search) |
                Q(remarks__icontains=search) |
                Q(ticket__work_order_no__icontains=search) |
                Q(ticket__title__icontains=search) |
                Q(responsible_store__store_name__icontains=search)
            )
            if search.isdigit():
                q_search |= Q(expense_id=int(search)) | Q(
                    ticket_id=int(search)) | Q(worker_id=int(search))
            try:
                amt_val = float(search)
                q_search |= Q(amount=amt_val)
            except ValueError:
                pass
            queryset = queryset.filter(q_search).distinct()

        worker = self.request.query_params.get("worker")
        if worker and str(worker).upper() != 'ALL':
            if str(worker).isdigit():
                queryset = queryset.filter(worker_id=int(worker))
            else:
                queryset = queryset.filter(
                    Q(worker__full_name__icontains=worker) |
                    Q(worker__username__icontains=worker) |
                    Q(worker__employee_no__icontains=worker)
                ).distinct()

        ordering = self.request.query_params.get("ordering")
        order_by_fields = []
        if ordering:
            ordering_tokens = [t.strip()
                               for t in ordering.split(",") if t.strip()]
            for token in ordering_tokens:
                desc = token.startswith('-')
                field_name = token.lstrip('-').lower()
                prefix = '-' if desc else ''
                if field_name in ('expense_id', 'id', 'exp'):
                    order_by_fields.append(f'{prefix}expense_id')
                elif field_name in ('category', 'expense_type'):
                    order_by_fields.append(
                        f'{prefix}expense_type__expense_name')
                elif field_name == 'remarks':
                    order_by_fields.append(f'{prefix}remarks')
                elif field_name == 'worker':
                    order_by_fields.append(f'{prefix}worker__full_name')
                    order_by_fields.append(f'{prefix}worker__username')
                elif field_name in ('ticket', 'linked_ticket'):
                    order_by_fields.append(f'{prefix}ticket__work_order_no')
                elif field_name in ('sub_department', 'sub_dept'):
                    order_by_fields.append(
                        f'{prefix}ticket__nature__sub_department__sub_department_name')
                elif field_name in ('expense_date', 'date'):
                    order_by_fields.append(f'{prefix}expense_date')
                elif field_name == 'amount':
                    order_by_fields.append(f'{prefix}amount')

        if not order_by_fields:
            order_by_fields = ['-expense_date', '-expense_id']
        elif '-expense_id' not in order_by_fields and 'expense_id' not in order_by_fields:
            order_by_fields.append('-expense_id')

        return queryset.select_related(
            'worker',
            'worker__role',
            'ticket',
            'ticket__store',
            'ticket__nature__sub_department__department',
            'ticket__department',
            'ticket__status',
            'expense_type',
            'expense_type__department',
            'responsible_store',
            'added_by',
            'claim'
        ).prefetch_related(
            'receipts',
            'approval_instances__step__assigned_role',
            'approval_instances__step__assigned_users',
            'approval_instances__action_by'
        ).order_by(*order_by_fields).distinct()

    def perform_create(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list(
            'name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied(
                {'detail': 'Management role is view-only.'})
        expense = serializer.save(added_by=user)

        if expense.expense_type and not expense.expense_type.approve_required:
            expense.approved = True
            expense.approved_by = user
            expense.save(update_fields=['approved', 'approved_by'])
        else:
            # Trigger single Expense approval workflow if an active Expense workflow exists
            wf = ApprovalWorkflow.objects.filter(
                entity_type='Expense', is_active=True).first()
            if wf:
                ApprovalService.start_workflow(
                    expense, user, ip_address=self.request.META.get('REMOTE_ADDR'))

    def perform_update(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list(
            'name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied(
                {'detail': 'Management role is view-only.'})

        expense = serializer.instance
        if expense.is_claimed or expense.claim:
            raise exceptions.PermissionDenied(
                {'detail': 'This expense is attached to a claim bundle and cannot be modified directly. Remove it from the bundle first.'})

        was_approved = bool(expense.approved)

        is_admin_or_approver = (
            user.is_superuser or
            getattr(user, 'is_staff', False) or
            role_name in ('administrator', 'admin', 'office administrator', 'office admin', 'finance', 'accountant', 'accounts', 'audit') or
            user.has_perm('finance.approve_expense') or
            user.has_perm('finance.change_expense')
        )

        updated_expense = serializer.save()

        # Handle approval state after update
        if was_approved and is_admin_or_approver:
            updated_expense.approved = True
            updated_expense.approved_by = user
            updated_expense.save(update_fields=['approved', 'approved_by'])
        elif updated_expense.expense_type and updated_expense.expense_type.approve_required:
            updated_expense.approved = False
            updated_expense.approved_by = None
            if hasattr(updated_expense, 'status'):
                updated_expense.status = 'In Review'
            updated_expense.save(update_fields=['approved', 'approved_by'] + (
                ['status'] if hasattr(updated_expense, 'status') else []))
            
            # Start/restart approval workflow so a fresh Pending instance is created at Step 1
            wf = ApprovalWorkflow.objects.filter(
                entity_type='Expense', is_active=True).first()
            if wf:
                ApprovalService.start_workflow(
                    updated_expense, user, ip_address=self.request.META.get('REMOTE_ADDR'))
            
            create_audit_event('Expense', updated_expense.pk, 'EXPENSE_RESUBMITTED_AFTER_EDIT', actor=user, payload={
                               'comments': 'Resubmitted to approval after edit'}, ip_address=self.request.META.get('REMOTE_ADDR'))
        else:
            updated_expense.approved = True
            updated_expense.approved_by = user
            updated_expense.save(update_fields=['approved', 'approved_by'])

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()
        return Response(ExpenseSerializer(instance, context=self.get_serializer_context()).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_expense(self, request, pk=None):
        expense = self.get_object()
        user = request.user

        if expense.is_claimed or expense.claim:
            raise exceptions.ValidationError(
                {'detail': 'This expense is attached to a claim bundle and cannot be submitted individually.'})

        if expense.approved:
            raise exceptions.ValidationError(
                {'detail': 'This expense is already approved.'})

        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        expense_worker_id = getattr(expense.worker, 'pk', expense.worker_id)
        expense_added_by_id = getattr(expense.added_by, 'pk', expense.added_by_id)
        is_owner = user.pk in (expense_worker_id, expense_added_by_id)
        is_admin = (
            user.is_superuser or
            getattr(user, 'is_staff', False) or
            role_name in ('administrator', 'admin', 'office administrator', 'office admin', 'finance', 'accountant', 'accounts') or
            user.has_perm('finance.change_expense') or
            user.has_perm('finance.add_expense')
        )
        if not (is_owner or is_admin):
            raise exceptions.PermissionDenied(
                {'detail': 'You do not have permission to submit this expense for approval.'})

        if expense.expense_type and not expense.expense_type.approve_required:
            expense.approved = True
            expense.approved_by = user
            expense.save(update_fields=['approved', 'approved_by'])
            create_audit_event('Expense', expense.pk, 'AUTO_APPROVED', actor=user, payload={
                               'reason': 'Expense type does not require approval'}, ip_address=request.META.get('REMOTE_ADDR'))
            return Response({'status': 'success', 'message': 'Expense does not require approval and was auto-approved.', 'expense': ExpenseSerializer(expense, context={'request': request}).data}, status=status.HTTP_200_OK)

        wf = ApprovalWorkflow.objects.filter(
            entity_type='Expense', is_active=True).first()
        if wf:
            ApprovalService.start_workflow(
                expense, user, ip_address=request.META.get('REMOTE_ADDR'))
        else:
            expense.approved = True
            expense.approved_by = user
            expense.save(update_fields=['approved', 'approved_by'])

        create_audit_event('Expense', expense.pk, 'EXPENSE_SUBMITTED_FOR_APPROVAL', actor=user, payload={
                           'comments': 'Submitted for approval'}, ip_address=request.META.get('REMOTE_ADDR'))

        expense.refresh_from_db()
        return Response({'status': 'success', 'message': 'Expense submitted for approval.', 'expense': ExpenseSerializer(expense, context={'request': request}).data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='action')
    def action_expense(self, request, pk=None):
        expense = self.get_object()
        # 'APPROVED', 'REJECTED', 'REWORK'
        action_name = request.data.get('action', 'APPROVED')
        comments = request.data.get('comments') or request.data.get('remarks')
        user = request.user

        pending_instance = expense.approval_instances.filter(
            status='Pending').order_by('created_at').first()
        if pending_instance:
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                instance = ApprovalService.action_step(
                    instance_id=pending_instance.instance_id,
                    actor=user,
                    action=action_name,
                    comments=comments,
                    ip_address=request.META.get('REMOTE_ADDR')
                )
                return Response({'status': 'success', 'approval': ApprovalInstanceSerializer(instance).data, 'expense': ExpenseSerializer(expense).data}, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                msg = e.messages[0] if hasattr(
                    e, 'messages') and e.messages else str(e)
                raise exceptions.ValidationError({'detail': msg})

        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        is_admin = (
            user.is_superuser or
            getattr(user, 'is_staff', False) or
            role_name in ('administrator', 'admin', 'office administrator', 'office admin', 'finance', 'accountant', 'accounts', 'audit') or
            user.has_perm('finance.approve_expense') or
            user.has_perm('finance.approve_expense', expense)
        )
        if not is_admin:
            raise exceptions.PermissionDenied(
                {'detail': 'You do not have permission to approve this expense.'})

        if action_name == 'APPROVED':
            expense.approved = True
            expense.approved_by = user
            expense.save(update_fields=['approved', 'approved_by'])
            # Update any rework instance to approved so approval records reflect completion
            rework_inst = expense.approval_instances.filter(
                status='Rework').order_by('-actioned_at', '-created_at').first()
            if rework_inst:
                rework_inst.status = 'Approved'
                rework_inst.comments = comments or 'Approved from Create Bundle modal'
                rework_inst.action_by = user
                rework_inst.actioned_at = timezone.now()
                rework_inst.save()
            create_audit_event('Expense', expense.pk, 'MANUALLY_APPROVED', actor=user, payload={
                               'comments': comments}, ip_address=request.META.get('REMOTE_ADDR'))
        elif action_name == 'REWORK':
            expense.approved = False
            expense.save(update_fields=['approved'])
            # Reset workflow to first step (Step 1) while preserving history
            expense.approval_instances.filter(status='Pending').delete()
            wf = ApprovalWorkflow.objects.filter(
                entity_type='Expense', is_active=True).first()
            if wf:
                ApprovalService.start_workflow(
                    expense, user, ip_address=request.META.get('REMOTE_ADDR'))
            create_audit_event('Expense', expense.pk, 'MANUALLY_REWORK', actor=user, payload={
                               'comments': comments}, ip_address=request.META.get('REMOTE_ADDR'))
        elif action_name == 'REJECTED':
            expense.approved = False
            expense.save(update_fields=['approved'])
            create_audit_event('Expense', expense.pk, 'MANUALLY_REJECTED', actor=user, payload={
                               'comments': comments}, ip_address=request.META.get('REMOTE_ADDR'))

        return Response({'status': 'success', 'expense': ExpenseSerializer(expense).data}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-approve')
    def bulk_approve_expenses(self, request):
        expense_ids = request.data.get('expense_ids', [])
        comments = request.data.get('comments', 'Bulk approved')
        user = request.user

        if not expense_ids or not isinstance(expense_ids, list):
            raise exceptions.ValidationError(
                {'detail': 'expense_ids list is required.'})

        # Cap batch size to avoid long synchronous transactions and web gateway (NGINX/Gunicorn) timeouts
        if len(expense_ids) > 100:
            raise exceptions.ValidationError(
                {'detail': 'Maximum 100 expenses can be bulk-approved in a single request to prevent server timeout. Please chunk requests.'})

        success_count = 0
        errors = []

        from django.core.exceptions import ValidationError as DjangoValidationError

        # Prefetch expenses and their active pending instances in a single query
        expenses_qs = Expense.objects.filter(pk__in=expense_ids).prefetch_related(
            Prefetch(
                'approval_instances',
                queryset=ApprovalInstance.objects.filter(status='Pending').select_related(
                    'step', 'step__workflow').order_by('created_at'),
                to_attr='active_pending_instances'
            )
        )
        expenses_by_id = {exp.pk: exp for exp in expenses_qs}

        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        is_admin = (
            user.is_superuser or
            getattr(user, 'is_staff', False) or
            role_name in ('administrator', 'admin', 'office administrator', 'office admin', 'finance', 'accountant', 'accounts', 'audit') or
            user.has_perm('finance.approve_expense')
        )

        for exp_id in expense_ids:
            try:
                try:
                    exp_id_int = int(exp_id)
                except (ValueError, TypeError):
                    errors.append(f"Invalid expense ID: {exp_id}")
                    continue

                expense = expenses_by_id.get(exp_id_int)
                if not expense:
                    errors.append(f"Expense #{exp_id} not found.")
                    continue

                if expense.approved:
                    continue

                # Check if there is an active pending approval instance
                pending_instances = getattr(
                    expense, 'active_pending_instances', [])
                pending_instance = pending_instances[0] if pending_instances else None

                if pending_instance:
                    ApprovalService.action_step(
                        instance_id=pending_instance.instance_id,
                        actor=user,
                        action='APPROVED',
                        comments=comments,
                        ip_address=request.META.get('REMOTE_ADDR')
                    )
                    success_count += 1
                else:
                    # Direct approval if authorized
                    if not is_admin and not user.has_perm('finance.approve_expense') and not user.has_perm('finance.approve_expense', expense):
                        errors.append(
                            f"Expense #{exp_id}: You do not have permission to approve.")
                        continue
                    expense.approved = True
                    expense.approved_by = user
                    expense.save(update_fields=['approved', 'approved_by'])
                    rework_inst = expense.approval_instances.filter(
                        status='Rework').order_by('-actioned_at', '-created_at').first()
                    if rework_inst:
                        rework_inst.status = 'Approved'
                        rework_inst.comments = comments or 'Bulk approved from Create Bundle modal'
                        rework_inst.action_by = user
                        rework_inst.actioned_at = timezone.now()
                        rework_inst.save()
                    create_audit_event('Expense', expense.pk, 'MANUALLY_APPROVED', actor=user, payload={
                                       'comments': comments, 'bulk': True}, ip_address=request.META.get('REMOTE_ADDR'))
                    success_count += 1
            except DjangoValidationError as e:
                msg = e.messages[0] if hasattr(
                    e, 'messages') and e.messages else str(e)
                errors.append(f"Expense #{exp_id}: {msg}")
            except Exception as e:
                errors.append(f"Expense #{exp_id}: {str(e)}")

        return Response({
            'status': 'success',
            'approved_count': success_count,
            'errors': errors
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='location-report')
    def location_report(self, request):
        from decimal import Decimal
        from datetime import datetime
        from django.db.models import Sum, Count, F, Q, Value
        from django.db.models.functions import Coalesce

        params = request.query_params
        is_comparison = bool(params.get('period1_from') and params.get('period2_from'))

        status_filter = params.get('status')
        store_filter = params.get('store')

        all_active_batches = list(LedgerBatch.objects.all().prefetch_related('sub_departments'))
        subdept_to_batch = {}
        batch_id_to_name = {}
        for b in all_active_batches:
            batch_id_to_name[b.batch_id] = b.batch_name
            for sd in b.sub_departments.all():
                subdept_to_batch[sd.sub_department_id] = b.batch_name

        available_batches = [{'batch_id': b.batch_id, 'batch_name': b.batch_name} for b in all_active_batches]

        def _fetch_period_data(from_date, to_date):
            if not from_date or not to_date:
                return None
            qs = Expense.objects.filter(
                expense_date__gte=from_date,
                expense_date__lte=to_date
            )
            if status_filter and status_filter.lower() != 'all':
                if status_filter.lower() in ('approved', 'true', '1'):
                    qs = qs.filter(Q(approved=True) | Q(expense_type__approve_required=False))
                elif status_filter.lower() == 'paid':
                    qs = qs.filter(Q(is_paid=True) | Q(claim__status='Paid'))

            if store_filter and store_filter.lower() != 'all':
                qs = qs.filter(
                    Q(responsible_store_id=store_filter) |
                    Q(ticket__store_id=store_filter) |
                    Q(responsible_store__store_name__icontains=store_filter) |
                    Q(ticket__store__store_name__icontains=store_filter)
                )

            store_type_filter = params.get('store_type')
            if store_type_filter and store_type_filter != 'all':
                qs = qs.filter(
                    Q(responsible_store__type=store_type_filter) |
                    Q(ticket__store__type=store_type_filter)
                )

            batch_filter = params.get('batch') or params.get('ledger_batch')
            if batch_filter and batch_filter.lower() != 'all':
                batch_obj = None
                if str(batch_filter).isdigit():
                    batch_obj = next((b for b in all_active_batches if b.batch_id == int(batch_filter)), None)
                if not batch_obj:
                    batch_obj = next((b for b in all_active_batches if b.batch_name.lower() == str(batch_filter).lower()), None)

                if batch_obj:
                    matching_subdepts = list(batch_obj.sub_departments.values_list('sub_department_id', flat=True))
                    qs = qs.filter(
                        Q(ticket__nature__sub_department_id__in=matching_subdepts) |
                        Q(ticket__nature__sub_department__isnull=True, ledgers__ledger_batch=batch_obj)
                    ).distinct()
                else:
                    qs = qs.none()

            qs = qs.annotate(
                location_name=Coalesce('responsible_store__store_name', 'ticket__store__store_name', Value('General / Other')),
                loc_id=Coalesce('responsible_store__store_id', 'ticket__store__store_id', Value('general')),
                store_type=Coalesce('responsible_store__type', 'ticket__store__type', Value('OTHER')),
                category_name=Coalesce('expense_type__parent__expense_name', 'expense_type__expense_name', Value('General')),
                subdept_id=F('ticket__nature__sub_department_id')
            )

            loc_map = {}
            batch_map = {}
            all_categories = set()
            category_totals = {}
            grand_total = Decimal('0.000')

            for exp in qs.values('loc_id', 'location_name', 'store_type', 'category_name', 'amount', 'subdept_id'):
                lid = str(exp['loc_id'])
                lname = exp['location_name']
                st = exp['store_type'] or 'OTHER'
                cat = exp['category_name']
                amt = exp['amount'] or Decimal('0.000')
                sub_id = exp.get('subdept_id')
                b_name = subdept_to_batch.get(sub_id, 'General Maintenance')

                all_categories.add(cat)
                category_totals[cat] = category_totals.get(cat, Decimal('0.000')) + amt
                grand_total += amt

                if lid not in loc_map:
                    loc_map[lid] = {
                        'store_id': lid,
                        'location_name': lname,
                        'store_type': st,
                        'categories': {},
                        'total_amount': Decimal('0.000'),
                        'expense_count': 0
                    }

                loc_map[lid]['categories'][cat] = loc_map[lid]['categories'].get(cat, Decimal('0.000')) + amt
                loc_map[lid]['total_amount'] += amt
                loc_map[lid]['expense_count'] += 1

                if b_name not in batch_map:
                    batch_map[b_name] = {
                        'batch_name': b_name,
                        'total_amount': Decimal('0.000'),
                        'expense_count': 0,
                        'categories': {},
                        'locations_map': {}
                    }
                b_entry = batch_map[b_name]
                b_entry['total_amount'] += amt
                b_entry['expense_count'] += 1
                b_entry['categories'][cat] = b_entry['categories'].get(cat, Decimal('0.000')) + amt

                if lid not in b_entry['locations_map']:
                    b_entry['locations_map'][lid] = {
                        'store_id': lid,
                        'location_name': lname,
                        'store_type': st,
                        'categories': {},
                        'total_amount': Decimal('0.000'),
                        'expense_count': 0
                    }
                b_entry['locations_map'][lid]['categories'][cat] = b_entry['locations_map'][lid]['categories'].get(cat, Decimal('0.000')) + amt
                b_entry['locations_map'][lid]['total_amount'] += amt
                b_entry['locations_map'][lid]['expense_count'] += 1

            sorted_categories = sorted(list(all_categories))
            locations_list = sorted(list(loc_map.values()), key=lambda x: x['location_name'])

            for loc in locations_list:
                loc['total_amount'] = float(round(loc['total_amount'], 3))
                for c in sorted_categories:
                    loc['categories'][c] = float(round(loc['categories'].get(c, Decimal('0.000')), 3))

            formatted_cat_totals = {c: float(round(category_totals.get(c, Decimal('0.000')), 3)) for c in sorted_categories}

            STORE_TYPE_LABELS = {
                'SUPER_MARKET': 'Super Market',
                'HYPER_MARKET': 'Hyper Market',
                'WAREHOUSE': 'Warehouse',
                'FRESH': 'Fresh',
                'COSTO': 'Costo',
                'CAMP': 'Camp',
                'KITCHEN': 'Kitchen',
                'ROASTERY': 'Roastery',
                'FINE DINE': 'Fine Dine',
                'OTHER': 'Other / General'
            }
            type_map = {}
            for loc in locations_list:
                st = loc.get('store_type') or 'OTHER'
                if st not in type_map:
                    type_map[st] = {
                        'store_type': st,
                        'store_type_label': STORE_TYPE_LABELS.get(st, st.replace('_', ' ').title()),
                        'locations_count': 0,
                        'total_amount': 0.0,
                        'categories': {c: 0.0 for c in sorted_categories}
                    }
                type_map[st]['locations_count'] += 1
                type_map[st]['total_amount'] = float(round(type_map[st]['total_amount'] + loc['total_amount'], 3))
                for c in sorted_categories:
                    type_map[st]['categories'][c] = float(round(type_map[st]['categories'][c] + loc['categories'].get(c, 0.0), 3))

            store_types_summary = sorted(list(type_map.values()), key=lambda x: -x['total_amount'])

            # Compile Ledger Batches summary and locations
            batches_list = []
            for b_name, b_entry in sorted(batch_map.items(), key=lambda item: -item[1]['total_amount']):
                b_locs = sorted(list(b_entry['locations_map'].values()), key=lambda x: x['location_name'])
                for bloc in b_locs:
                    bloc['total_amount'] = float(round(bloc['total_amount'], 3))
                    for c in sorted_categories:
                        bloc['categories'][c] = float(round(bloc['categories'].get(c, Decimal('0.000')), 3))

                b_cat_totals = {c: float(round(b_entry['categories'].get(c, Decimal('0.000')), 3)) for c in sorted_categories}
                batches_list.append({
                    'batch_name': b_name,
                    'total_amount': float(round(b_entry['total_amount'], 3)),
                    'expense_count': b_entry['expense_count'],
                    'locations_count': len(b_locs),
                    'categories': b_cat_totals,
                    'locations': b_locs
                })

            try:
                dt1 = datetime.strptime(from_date, "%Y-%m-%d")
                dt2 = datetime.strptime(to_date, "%Y-%m-%d")
                if dt1.month == dt2.month and dt1.year == dt2.year:
                    month_label = dt1.strftime("%B %Y")
                else:
                    month_label = f"{dt1.strftime('%b %Y')} - {dt2.strftime('%b %Y')}"
            except Exception:
                month_label = f"{from_date} to {to_date}"

            return {
                'from_date': from_date,
                'to_date': to_date,
                'month_label': month_label,
                'locations': locations_list,
                'store_types_summary': store_types_summary,
                'ledger_batches_summary': batches_list,
                'categories': sorted_categories,
                'category_totals': formatted_cat_totals,
                'grand_total': float(round(grand_total, 3)),
                'total_locations_count': len(locations_list),
                'total_expenses_count': qs.count()
            }

        if is_comparison:
            p1_from = params.get('period1_from')
            p1_to = params.get('period1_to')
            p2_from = params.get('period2_from')
            p2_to = params.get('period2_to')

            p1 = _fetch_period_data(p1_from, p1_to)
            p2 = _fetch_period_data(p2_from, p2_to)

            if not p1 or not p2:
                return Response({'detail': 'Invalid period date parameters provided.'}, status=status.HTTP_400_BAD_REQUEST)

            all_loc_ids = set([l['store_id'] for l in p1['locations']] + [l['store_id'] for l in p2['locations']])
            p1_dict = {l['store_id']: l for l in p1['locations']}
            p2_dict = {l['store_id']: l for l in p2['locations']}

            all_cats = sorted(list(set(p1['categories'] + p2['categories'])))

            comparison_rows = []
            for lid in sorted(all_loc_ids, key=lambda x: (p2_dict.get(x) or p1_dict.get(x) or {}).get('location_name', '')):
                loc_name = (p1_dict.get(lid) or p2_dict.get(lid) or {}).get('location_name', 'Unknown Location')
                l1 = p1_dict.get(lid) or {'location_name': loc_name, 'total_amount': 0.0, 'categories': {}}
                l2 = p2_dict.get(lid) or {'location_name': loc_name, 'total_amount': 0.0, 'categories': {}}

                amt1 = l1['total_amount']
                amt2 = l2['total_amount']
                variance = round(amt2 - amt1, 3)
                pct = round(((amt2 - amt1) / amt1 * 100), 2) if amt1 > 0 else (100.0 if amt2 > 0 else 0.0)

                cat_breakdown = []
                for c in all_cats:
                    c1 = l1['categories'].get(c, 0.0)
                    c2 = l2['categories'].get(c, 0.0)
                    c_var = round(c2 - c1, 3)
                    c_pct = round(((c2 - c1) / c1 * 100), 2) if c1 > 0 else (100.0 if c2 > 0 else 0.0)
                    cat_breakdown.append({
                        'category_name': c,
                        'period1_amount': c1,
                        'period2_amount': c2,
                        'variance': c_var,
                        'percent_change': c_pct
                    })

                st = l1.get('store_type') or l2.get('store_type') or 'OTHER'
                comparison_rows.append({
                    'store_id': lid,
                    'location_name': l1['location_name'],
                    'store_type': st,
                    'period1_amount': amt1,
                    'period2_amount': amt2,
                    'variance': variance,
                    'percent_change': pct,
                    'categories': cat_breakdown
                })

            p1_grand = p1['grand_total']
            p2_grand = p2['grand_total']
            grand_var = round(p2_grand - p1_grand, 3)
            grand_pct = round(((p2_grand - p1_grand) / p1_grand * 100), 2) if p1_grand > 0 else 0.0

            # Summary of Store Types Comparison
            p1_types = {t['store_type']: t for t in p1.get('store_types_summary', [])}
            p2_types = {t['store_type']: t for t in p2.get('store_types_summary', [])}
            all_types = sorted(list(set(list(p1_types.keys()) + list(p2_types.keys()))))
            comp_store_types = []
            for t in all_types:
                t1 = p1_types.get(t, {})
                t2 = p2_types.get(t, {})
                a1 = t1.get('total_amount', 0.0)
                a2 = t2.get('total_amount', 0.0)
                v = round(a2 - a1, 3)
                p = round(((a2 - a1) / a1 * 100), 2) if a1 > 0 else (100.0 if a2 > 0 else 0.0)
                lbl = t1.get('store_type_label') or t2.get('store_type_label') or t.replace('_', ' ').title()
                comp_store_types.append({
                    'store_type': t,
                    'store_type_label': lbl,
                    'period1_amount': a1,
                    'period2_amount': a2,
                    'variance': v,
                    'percent_change': p,
                    'period1_locations_count': t1.get('locations_count', 0),
                    'period2_locations_count': t2.get('locations_count', 0)
                })

            # Summary of Ledger Batches Comparison
            p1_batches = {b['batch_name']: b for b in p1.get('ledger_batches_summary', [])}
            p2_batches = {b['batch_name']: b for b in p2.get('ledger_batches_summary', [])}
            all_batches = sorted(list(set(list(p1_batches.keys()) + list(p2_batches.keys()))))
            comp_batches = []
            for bname in all_batches:
                b1 = p1_batches.get(bname, {})
                b2 = p2_batches.get(bname, {})
                ba1 = b1.get('total_amount', 0.0)
                ba2 = b2.get('total_amount', 0.0)
                bv = round(ba2 - ba1, 3)
                bp = round(((ba2 - ba1) / ba1 * 100), 2) if ba1 > 0 else (100.0 if ba2 > 0 else 0.0)

                # Locations under this batch
                p1_blocs = {l['store_id']: l for l in b1.get('locations', [])}
                p2_blocs = {l['store_id']: l for l in b2.get('locations', [])}
                b_loc_ids = set(list(p1_blocs.keys()) + list(p2_blocs.keys()))
                comp_blocs = []
                for lid in sorted(b_loc_ids, key=lambda x: (p2_blocs.get(x) or p1_blocs.get(x) or {}).get('location_name', '')):
                    loc_name = (p1_blocs.get(lid) or p2_blocs.get(lid) or {}).get('location_name', 'Unknown')
                    bl1 = p1_blocs.get(lid) or {'location_name': loc_name, 'total_amount': 0.0, 'categories': {}}
                    bl2 = p2_blocs.get(lid) or {'location_name': loc_name, 'total_amount': 0.0, 'categories': {}}
                    bla1 = bl1['total_amount']
                    bla2 = bl2['total_amount']
                    bl_v = round(bla2 - bla1, 3)
                    bl_p = round(((bla2 - bla1) / bla1 * 100), 2) if bla1 > 0 else (100.0 if bla2 > 0 else 0.0)

                    cat_breakdown = []
                    for c in all_cats:
                        c1 = bl1['categories'].get(c, 0.0)
                        c2 = bl2['categories'].get(c, 0.0)
                        c_var = round(c2 - c1, 3)
                        c_pct = round(((c2 - c1) / c1 * 100), 2) if c1 > 0 else (100.0 if c2 > 0 else 0.0)
                        cat_breakdown.append({
                            'category_name': c,
                            'period1_amount': c1,
                            'period2_amount': c2,
                            'variance': c_var,
                            'percent_change': c_pct
                        })

                    st = bl1.get('store_type') or bl2.get('store_type') or 'OTHER'
                    comp_blocs.append({
                        'store_id': lid,
                        'location_name': loc_name,
                        'store_type': st,
                        'period1_amount': bla1,
                        'period2_amount': bla2,
                        'variance': bl_v,
                        'percent_change': bl_p,
                        'categories': cat_breakdown
                    })

                comp_batches.append({
                    'batch_name': bname,
                    'period1_amount': ba1,
                    'period2_amount': ba2,
                    'variance': bv,
                    'percent_change': bp,
                    'period1_locations_count': b1.get('locations_count', 0),
                    'period2_locations_count': b2.get('locations_count', 0),
                    'locations': comp_blocs
                })

            return Response({
                'is_comparison': True,
                'available_batches': available_batches,
                'period1': {
                    'from_date': p1['from_date'],
                    'to_date': p1['to_date'],
                    'month_label': p1['month_label'],
                    'grand_total': p1_grand
                },
                'period2': {
                    'from_date': p2['from_date'],
                    'to_date': p2['to_date'],
                    'month_label': p2['month_label'],
                    'grand_total': p2_grand
                },
                'summary': {
                    'period1_grand_total': p1_grand,
                    'period2_grand_total': p2_grand,
                    'variance': grand_var,
                    'percent_change': grand_pct
                },
                'store_types_summary': comp_store_types,
                'ledger_batches_summary': comp_batches,
                'categories': all_cats,
                'category_totals': {
                    'period1': p1['category_totals'],
                    'period2': p2['category_totals']
                },
                'locations': comparison_rows
            }, status=status.HTTP_200_OK)

        # Single period report
        from_date = params.get('from_date') or params.get('date_from')
        to_date = params.get('to_date') or params.get('date_to')

        if not from_date or not to_date:
            import calendar
            today = datetime.now().date()
            from_date = today.replace(day=1).isoformat()
            _, last_day = calendar.monthrange(today.year, today.month)
            to_date = today.replace(day=last_day).isoformat()

        data = _fetch_period_data(from_date, to_date)
        return Response({
            'is_comparison': False,
            'available_batches': available_batches,
            **data
        }, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list(
            'name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied(
                {'detail': 'Management role is view-only.'})
        if instance.approved:
            raise exceptions.PermissionDenied(
                {'detail': 'Approved expenses cannot be deleted.'})
        if instance.is_claimed:
            raise exceptions.PermissionDenied(
                {'detail': 'This expense has been claimed and cannot be deleted.'})
        instance.delete()


class WorkerClaimViewSet(viewsets.ModelViewSet):
    queryset = WorkerClaim.objects.all().order_by('-claim_id')
    serializer_class = WorkerClaimSerializer
    pagination_class = FinancePagination

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return WorkerClaimWriteSerializer
        return WorkerClaimSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return WorkerClaim.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip()
                             for g in user.groups.values_list('name', flat=True)]

        is_management_or_admin = (
            role_name in (
                'management', 'management team', 'administrator', 'admin',
                'office administrator', 'finance', 'accountant', 'auditor'
            ) or any(g in user_groups_lower for g in ('management', 'administrator', 'admin', 'office administrator', 'finance', 'accountant'))
        )

        has_claim_perms = (
            user.has_perm('finance.approve_workerclaim') or
            user.has_perm('finance.view_workerclaim') or
            user.has_perm('finance.change_workerclaim') or
            user.has_perm('finance.create_bundle') or
            user.has_perm('finance.submit_bundle')
        )

        from apps.finance.models import ApprovalStep
        is_workflow_approver = ApprovalStep.objects.filter(
            workflow__entity_type='Bundle', workflow__is_active=True
        ).filter(
            Q(assigned_users=user) | (Q(assigned_role=user.role)
                                      if getattr(user, 'role', None) else Q())
        ).exists()

        if not user.is_superuser and not getattr(user, 'is_staff', False) and not is_management_or_admin and not has_claim_perms and not is_workflow_approver:
            q_filter = Q(worker=user) | Q(submitted_by=user)
            q_filter |= Q(approval_instances__step__assigned_users=user)
            if hasattr(user, 'role') and user.role:
                q_filter |= Q(
                    approval_instances__step__assigned_role=user.role)

            try:
                from guardian.shortcuts import get_objects_for_user
                claim_pks = get_objects_for_user(
                    user, 'finance.approve_workerclaim', accept_global_perms=False).values_list('pk', flat=True)
                if claim_pks:
                    q_filter |= Q(claim_id__in=claim_pks)
                claim_view_pks = get_objects_for_user(
                    user, 'finance.view_workerclaim', accept_global_perms=False).values_list('pk', flat=True)
                if claim_view_pks:
                    q_filter |= Q(claim_id__in=claim_view_pks)
            except Exception:
                pass

            queryset = queryset.filter(q_filter).distinct()

        # Parse search query and identify potential bundle ID search
        search = self.request.query_params.get(
            "search") or self.request.query_params.get("q")
        bundle_id = None
        if search:
            search_str = search.strip()
            exact_bundle_match = re.search(r'^(?:bundle|claim|b)?[\s\-_#]*(\d+)$', search_str, re.IGNORECASE)
            if exact_bundle_match:
                bundle_id = int(exact_bundle_match.group(1))
            else:
                prefix_match = re.search(r'(?:bundle|claim|b)[\s\-_#]+(\d+)', search_str, re.IGNORECASE) or re.search(r'#(\d+)', search_str)
                if prefix_match:
                    bundle_id = int(prefix_match.group(1))
                elif re.search(r'\b\d+\b', search_str):
                    num_match = re.search(r'\b\d+\b', search_str)
                    if num_match:
                        bundle_id = int(num_match.group(0))

        ticket = self.request.query_params.get("ticket")
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)

        status_param = self.request.query_params.get("status")
        if status_param and status_param.upper() != 'ALL':
            status_lower = status_param.lower().strip()
            if status_lower in ('in review', 'submitted', 'pending', 'pending approval'):
                status_q = Q(status__iexact='In Review') | Q(status__iexact='Submitted')
            else:
                status_q = Q(status__iexact=status_param.strip())
            if bundle_id:
                queryset = queryset.filter(status_q | Q(claim_id=bundle_id))
            else:
                queryset = queryset.filter(status_q)

        ledger_filter = self.request.query_params.get("ledger_filter")
        if ledger_filter:
            if ledger_filter.upper() == 'IN_LEDGER':
                ledger_q = Q(ledgers__isnull=False)
            elif ledger_filter.upper() == 'NOT_IN_LEDGER':
                ledger_q = Q(ledgers__isnull=True)
            else:
                ledger_q = Q()
            if ledger_q:
                if bundle_id:
                    queryset = queryset.filter(ledger_q | Q(claim_id=bundle_id)).distinct()
                else:
                    queryset = queryset.filter(ledger_q).distinct()

        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        if from_date:
            if bundle_id:
                queryset = queryset.filter(Q(claim_date__date__gte=from_date) | Q(claim_id=bundle_id))
            else:
                queryset = queryset.filter(claim_date__date__gte=from_date)

        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        if to_date:
            if bundle_id:
                queryset = queryset.filter(Q(claim_date__date__lte=to_date) | Q(claim_id=bundle_id))
            else:
                queryset = queryset.filter(claim_date__date__lte=to_date)

        if search:
            search_str = search.strip()
            q_search = Q()
            if bundle_id:
                q_search |= Q(claim_id=bundle_id)

            is_pure_bundle_query = bool(re.search(r'^(?:bundle|claim|b)?[\s\-_#]*\d+$', search_str, re.IGNORECASE))
            if not is_pure_bundle_query:
                q_search |= (
                    Q(worker__first_name__icontains=search_str) |
                    Q(worker__last_name__icontains=search_str) |
                    Q(worker__full_name__icontains=search_str) |
                    Q(worker__username__icontains=search_str) |
                    Q(worker__employee_no__icontains=search_str) |
                    Q(ticket__work_order_no__icontains=search_str) |
                    Q(remarks__icontains=search_str) |
                    Q(ledgers__ledger_group__group_name__icontains=search_str)
                )
            elif search_str.isdigit():
                q_search |= (
                    Q(ticket__work_order_no__icontains=search_str) |
                    Q(remarks__icontains=search_str) |
                    Q(worker__username__icontains=search_str) |
                    Q(worker__employee_no__icontains=search_str) |
                    Q(worker__full_name__icontains=search_str) |
                    Q(ledgers__ledger_group__group_name__icontains=search_str)
                )

            queryset = queryset.filter(q_search).distinct()

            if bundle_id:
                queryset = queryset.annotate(
                    search_priority=Case(
                        When(claim_id=bundle_id, then=Value(0)),
                        default=Value(1),
                        output_field=IntegerField()
                    )
                )

        worker_param = self.request.query_params.get("worker")
        if worker_param:
            queryset = queryset.filter(worker_id=worker_param)

        ordering = self.request.query_params.get("ordering")
        if bundle_id:
            order_fields = ['search_priority'] + ([ordering] if ordering else ['-claim_date', '-claim_id'])
        elif ordering:
            order_fields = [ordering]
        else:
            order_fields = ['-claim_date', '-claim_id']

        return queryset.select_related(
            'worker',
            'worker__role',
            'submitted_by',
            'submitted_by__role',
            'approved_by',
            'approved_by__role',
            'ticket',
            'ticket__store',
            'ticket__nature__sub_department__department',
            'ticket__department',
            'ticket__status'
        ).prefetch_related(
            'worker__sub_departments',
            'submitted_by__sub_departments',
            'approved_by__sub_departments',
            'ledgers__ledger_group',
            Prefetch(
                'expenses',
                queryset=Expense.objects.select_related(
                    'worker',
                    'worker__role',
                    'ticket',
                    'ticket__store',
                    'ticket__nature__sub_department__department',
                    'ticket__department',
                    'ticket__status',
                    'expense_type',
                    'expense_type__parent',
                    'expense_type__department',
                    'responsible_store',
                    'added_by',
                    'claim'
                ).prefetch_related(
                    'receipts',
                    'worker__sub_departments',
                    'ledgers',
                    'approval_instances__step__assigned_role',
                    'approval_instances__step__assigned_users',
                    'approval_instances__action_by'
                )

            ),
            'approval_instances__step__assigned_role',
            'approval_instances__step__assigned_users',
            'approval_instances__action_by'
        ).order_by(*order_fields)

    @action(detail=False, methods=['get'], url_path='unclaimed-workers')
    def unclaimed_workers(self, request):
        from django.db.models import Count, Sum, Value, DecimalField, Q
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        from apps.accounts.models import CustomUser

        from_date = request.query_params.get(
            'from_date') or request.query_params.get('date_from')
        to_date = request.query_params.get(
            'to_date') or request.query_params.get('date_to')
        ledger_batch_id = request.query_params.get(
            'ledger_batch') or request.query_params.get('batch_id')
        search = (request.query_params.get('search')
                  or request.query_params.get('q') or '').strip()

        # Scope by the requesting user's department
        user = request.user
        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list(
            'name', flat=True)] if user and not user.is_anonymous else []
        is_management_or_admin = (
            role_name in (
                'management', 'management team', 'administrator', 'admin',
                'office administrator', 'finance', 'accountant', 'accounts', 'auditor'
            ) or any(g in user_groups_lower for g in ('management', 'administrator', 'admin', 'office administrator', 'finance', 'accountant', 'accounts'))
        )
        has_finance_perms = (
            user.has_perm('finance.approve_workerclaim') or
            user.has_perm('finance.view_workerclaim') or
            user.has_perm('finance.change_workerclaim') or
            user.has_perm('finance.create_bundle') or
            user.has_perm('finance.submit_bundle') or
            user.has_perm('finance.view_expense') or
            user.has_perm('finance.approve_expense')
        ) if user and not user.is_anonymous else False

        user_dept_ids = []
        if user and not user.is_anonymous:
            user_dept_ids = list(user.sub_departments.filter(
                department__isnull=False).values_list('department_id', flat=True).distinct())
            if not user_dept_ids and hasattr(user, 'department') and user.department:
                user_dept_ids = [user.department.pk]
            elif not user_dept_ids and hasattr(user, 'department_id') and user.department_id:
                user_dept_ids = [user.department_id]

        dept_param = request.query_params.get(
            'department') or request.query_params.get('department_id')

        # Query all unclaimed expenses for count/total aggregation
        exp_qs = Expense.objects.filter(is_claimed=False, claim__isnull=True)
        if from_date:
            exp_qs = exp_qs.filter(expense_date__gte=from_date)
        if to_date:
            exp_qs = exp_qs.filter(expense_date__lte=to_date)

        if user_dept_ids:
            tech_ids_dept = list(CustomUser.objects.filter(
                sub_departments__department_id__in=user_dept_ids).values_list('pk', flat=True).distinct())
            exp_qs = exp_qs.filter(worker_id__in=tech_ids_dept)
        elif dept_param and str(dept_param).upper() != 'ALL':
            tech_ids_dept = list(CustomUser.objects.filter(
                sub_departments__department_id=dept_param).values_list('pk', flat=True).distinct())
            exp_qs = exp_qs.filter(worker_id__in=tech_ids_dept)
        elif user and not user.is_anonymous and not getattr(user, 'is_superuser', False) and not is_management_or_admin and not has_finance_perms:
            exp_qs = exp_qs.filter(worker=user)

        is_eligible_q = Q(approved=True) | Q(
            expense_type__approve_required=False)

        aggregated = list(
            exp_qs.values('worker_id').annotate(
                eligible_count=Count('expense_id', filter=is_eligible_q),
                eligible_total=Coalesce(Sum('amount', filter=is_eligible_q), Value(
                    Decimal('0.000'), output_field=DecimalField())),
                total_count=Count('expense_id'),
                total_amount=Coalesce(Sum('amount'), Value(
                    Decimal('0.000'), output_field=DecimalField()))
            )
        )
        agg_map = {item['worker_id']: item for item in aggregated}
        worker_ids_with_expenses = list(agg_map.keys())

        # Base query for all technicians (role contains technician/worker OR anyone who has expenses)
        tech_filter = Q(role__role_name__icontains='technician') | Q(
            role__role_name__icontains='worker')
        if worker_ids_with_expenses:
            tech_filter |= Q(pk__in=worker_ids_with_expenses)

        tech_users = CustomUser.objects.filter(
            tech_filter).prefetch_related('sub_departments')

        # Strictly restrict to requesting user's department
        if user_dept_ids:
            tech_users = tech_users.filter(
                sub_departments__department_id__in=user_dept_ids)
        elif dept_param and str(dept_param).upper() != 'ALL':
            tech_users = tech_users.filter(
                sub_departments__department_id=dept_param)
        elif user and not user.is_anonymous and not getattr(user, 'is_superuser', False) and not is_management_or_admin and not has_finance_perms:
            tech_users = tech_users.filter(pk=user.pk)

        tech_users = tech_users.distinct()

        if search:
            tech_users = tech_users.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(full_name__icontains=search) |
                Q(username__icontains=search) |
                Q(employee_no__icontains=search)
            )

        if ledger_batch_id and str(ledger_batch_id).upper() != 'ALL':
            try:
                batch = LedgerBatch.objects.filter(
                    pk=int(ledger_batch_id)).first()
                if batch:
                    sub_dept_ids = list(batch.sub_departments.values_list(
                        'sub_department_id', flat=True))
                    tech_users = tech_users.filter(
                        sub_departments__sub_department_id__in=sub_dept_ids)
            except Exception:
                pass

        results = []
        for u in tech_users:
            w_id = u.pk
            agg_item = agg_map.get(w_id, {})
            prof_img = u.profile_image.name if u.profile_image else None
            if prof_img and not prof_img.startswith('http') and not prof_img.startswith('/'):
                prof_img = f"/media/{prof_img}"

            user_sub_depts = [
                {'sub_department_id': sd.sub_department_id,
                    'sub_department_name': sd.sub_department_name}
                for sd in u.sub_departments.all()
            ]

            results.append({
                'id': w_id,
                'user_id': w_id,
                'name': u.full_name or u.username or f"Worker {w_id}",
                'username': u.username or '',
                'employee_no': u.employee_no or '',
                'profile_image': prof_img,
                'sub_departments': user_sub_depts,
                'unclaimed_count': agg_item.get('eligible_count', 0),
                'unclaimed_total': float(agg_item.get('eligible_total') or 0),
                'total_unclaimed_count': agg_item.get('total_count', 0),
                'total_unclaimed_amount': float(agg_item.get('total_amount') or 0),
            })

        # Sort: technicians with unclaimed expenses first, then alphabetically by name
        results.sort(key=lambda x: (
            -x['unclaimed_count'],
            -x.get('total_unclaimed_count', 0),
            x['name'].lower()
        ))

        return Response(results, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='create-bundle')
    def create_bundle(self, request):
        worker_id = request.data.get('worker_id')
        expense_ids = request.data.get('expense_ids', [])
        period_from = request.data.get('period_from')
        period_to = request.data.get('period_to')
        remarks = request.data.get('remarks')

        from apps.accounts.models import CustomUser
        from django.core.exceptions import ValidationError as DjangoValidationError

        worker = CustomUser.objects.filter(
            pk=worker_id).first() if worker_id else None

        try:
            bundle = BundleService.create_bundle(
                worker=worker,
                expense_ids=expense_ids,
                period_from=period_from,
                period_to=period_to,
                remarks=remarks,
                created_by=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            # Fetch with select_related & prefetch_related for fast serialization
            optimized_bundle = self.get_queryset().filter(pk=bundle.pk).first() or bundle
            return Response(WorkerClaimSerializer(optimized_bundle, context={'request': request}).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post', 'put', 'patch'], url_path='update-bundle')
    def update_bundle(self, request, pk=None):
        expense_ids = request.data.get('expense_ids')
        period_from = request.data.get('period_from')
        period_to = request.data.get('period_to')
        remarks = request.data.get('remarks')

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            bundle = BundleService.update_bundle(
                bundle_id=pk,
                expense_ids=expense_ids,
                period_from=period_from,
                period_to=period_to,
                remarks=remarks,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            optimized_bundle = self.get_queryset().filter(pk=bundle.pk).first() or bundle
            return Response(WorkerClaimSerializer(optimized_bundle, context={'request': request}).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='remove-expense')
    def remove_expense(self, request, pk=None):
        expense_id = request.data.get('expense_id')
        if not expense_id:
            raise exceptions.ValidationError(
                {'detail': 'expense_id is required'})
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            bundle = BundleService.remove_expense_from_bundle(
                bundle_id=pk,
                expense_id=expense_id,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(WorkerClaimSerializer(bundle, context={'request': request}).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_bundle(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            bundle = BundleService.submit_bundle(
                bundle_id=pk,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(WorkerClaimSerializer(bundle, context={'request': request}).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='action')
    def action_bundle(self, request, pk=None):
        bundle = self.get_object()
        # 'APPROVED', 'REJECTED', 'REWORK'
        action_name = request.data.get('action', 'APPROVED')
        comments = request.data.get('comments')
        user = request.user

        pending_instance = bundle.approval_instances.filter(
            status='Pending').order_by('created_at').first()
        if not pending_instance and bundle.status in ['Submitted', 'In Review']:
            pending_instance = ApprovalService.start_workflow(
                bundle, user, ip_address=request.META.get('REMOTE_ADDR'))

        if pending_instance:
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                instance = ApprovalService.action_step(
                    instance_id=pending_instance.instance_id,
                    actor=user,
                    action=action_name,
                    comments=comments,
                    ip_address=request.META.get('REMOTE_ADDR')
                )
                bundle.refresh_from_db()
                return Response({'status': 'success', 'approval': ApprovalInstanceSerializer(instance, context={'request': request}).data, 'bundle': WorkerClaimSerializer(bundle, context={'request': request}).data}, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                msg = e.messages[0] if hasattr(
                    e, 'messages') and e.messages else str(e)
                raise exceptions.ValidationError({'detail': msg})

        is_admin = user.is_superuser or getattr(user, 'is_staff', False) or (hasattr(
            user, 'role') and user.role and user.role.role_name.lower() in ('administrator', 'admin'))
        if not is_admin and not user.has_perm('finance.approve_bundle') and not user.has_perm('finance.approve_workerclaim'):
            raise exceptions.PermissionDenied(
                {'detail': 'You do not have permission to approve this bundle.'})

        if action_name == 'APPROVED':
            bundle.status = 'Approved'
            bundle.save(update_fields=['status'])
            create_audit_event('WorkerClaim', bundle.pk, 'MANUALLY_APPROVED', actor=user, payload={
                               'comments': comments}, ip_address=request.META.get('REMOTE_ADDR'))
        elif action_name == 'REWORK':
            bundle.status = 'Rework'
            bundle.save(update_fields=['status'])
            bundle.approval_instances.filter(status='Pending').delete()
            create_audit_event('WorkerClaim', bundle.pk, 'MANUALLY_REWORK', actor=user, payload={
                               'comments': comments}, ip_address=request.META.get('REMOTE_ADDR'))
        elif action_name == 'REJECTED':
            bundle.status = 'Rejected'
            bundle.save(update_fields=['status'])
            bundle.approval_instances.filter(status='Pending').delete()
            create_audit_event('WorkerClaim', bundle.pk, 'MANUALLY_REJECTED', actor=user, payload={
                               'comments': comments}, ip_address=request.META.get('REMOTE_ADDR'))

        bundle.refresh_from_db()
        return Response({'status': 'success', 'bundle': WorkerClaimSerializer(bundle, context={'request': request}).data}, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list(
            'name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied(
                {'detail': 'Management role is view-only.'})

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            BundleService.delete_bundle(
                bundle_id=instance.pk,
                actor=user,
                ip_address=self.request.META.get('REMOTE_ADDR')
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})


def get_optimized_ledger_queryset():
    return Ledger.objects.select_related(
        'ledger_group',
        'ledger_group__created_by',
        'ledger_group__completed_by',
        'ledger_batch',
        'created_by',
        'created_by__role',
        'store'
    ).prefetch_related(
        Prefetch(
            'expenses',
            queryset=Expense.objects.select_related(
                'worker', 'worker__role', 'ticket', 'ticket__store', 'ticket__nature__sub_department__department',
                'ticket__department', 'ticket__status', 'expense_type', 'expense_type__department', 'responsible_store', 'added_by', 'claim'
            ).prefetch_related('receipts')
        ),
        Prefetch(
            'bundles',
            queryset=WorkerClaim.objects.select_related(
                'worker', 'worker__role', 'submitted_by', 'approved_by', 'ticket', 'ticket__store', 'ticket__status'
            ).prefetch_related(
                Prefetch(
                    'expenses',
                    queryset=Expense.objects.select_related(
                        'worker', 'worker__role', 'ticket', 'ticket__store', 'ticket__nature__sub_department__department',
                        'ticket__department', 'ticket__status', 'expense_type', 'expense_type__department', 'responsible_store', 'added_by'
                    ).prefetch_related('receipts')
                ),
                'approval_instances__step__assigned_role',
                'approval_instances__action_by',
                'ledgers__ledger_group'
            )
        ),
        'approval_instances__step__assigned_role',
        'approval_instances__step__assigned_users',
        'approval_instances__action_by',
        'ledger_batch__sub_departments__department'
    )


class LedgerGroupViewSet(viewsets.ModelViewSet):
    queryset = LedgerGroup.objects.all().prefetch_related(
        'ledgers').order_by('-created_at')
    serializer_class = LedgerGroupSerializer
    pagination_class = FinancePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get(
            'search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
            q_search = (
                Q(group_name__icontains=search) |
                Q(created_by__username__icontains=search) |
                Q(created_by__first_name__icontains=search) |
                Q(created_by__last_name__icontains=search)
            )
            if search.isdigit():
                q_search |= Q(ledger_group_id=int(search)) | Q(
                    ledgers__ledger_id=int(search))
            queryset = queryset.filter(q_search).distinct()

        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        if from_date:
            queryset = queryset.filter(Q(created_at__date__gte=from_date) | Q(
                ledgers__created_at__date__gte=from_date)).distinct()

        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        if to_date:
            queryset = queryset.filter(Q(created_at__date__lte=to_date) | Q(
                ledgers__created_at__date__lte=to_date)).distinct()

        status_param = self.request.query_params.get("status")
        if status_param and status_param.upper() != 'ALL':
            status_lower = status_param.lower().strip()
            if status_lower == 'paid':
                queryset = queryset.filter(is_paid=True)
            elif status_lower in ('in review', 'submitted', 'pending', 'pending approval'):
                queryset = queryset.filter(
                    ledgers__status__in=['In Review', 'Submitted']).distinct()
            elif status_lower in ('approved', 'completed'):
                queryset = queryset.filter(
                    Q(ledgers__status='Approved') | Q(is_completed=True)
                ).exclude(is_paid=True).distinct()
            elif status_lower == 'rework':
                queryset = queryset.filter(ledgers__status='Rework').distinct()
            elif status_lower == 'rejected':
                queryset = queryset.filter(
                    ledgers__status='Rejected').distinct()
            elif status_lower == 'draft':
                queryset = queryset.filter(ledgers__status='Draft').distinct()

        return queryset.annotate(
            annotated_ledgers_count=Count('ledgers', distinct=True)
        ).select_related(
            'created_by', 'created_by__role', 'completed_by', 'completed_by__role'
        ).prefetch_related('ledgers')

    def perform_destroy(self, instance):
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            LedgerService.delete_group(
                group_id=instance.ledger_group_id,
                actor=self.request.user,
                ip_address=self.request.META.get('REMOTE_ADDR')
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='complete')
    def complete_group(self, request, pk=None):
        group = self.get_object()
        # Verify all ledgers in this group are approved
        unapproved = group.ledgers.exclude(status__in=['Approved', 'Paid'])
        if unapproved.exists():
            return Response(
                {'detail': f'Cannot complete Ledger Group. {unapproved.count()} ledger batch(es) are not yet approved.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        group.is_completed = True
        group.completed_at = timezone.now()
        if request.user and request.user.is_authenticated:
            group.completed_by = request.user
        group.save(update_fields=['is_completed',
                   'completed_at', 'completed_by'])

        serializer = self.get_serializer(group)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='pay')
    def pay_group(self, request, pk=None):
        group = self.get_object()
        user = request.user
        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        is_cash_office = (
            role_name in ('cash office', 'cash officer', 'cashier') or
            user.has_perm('finance.bulk_payment_process') or
            user.has_perm('finance.bulk_payment_processs') or
            user.has_perm('finance.pay_ledger') or
            user.has_perm('finance.pay_ledger_group') or
            user.is_superuser or
            role_name in ('administrator', 'admin')
        )
        if not is_cash_office:
            return Response(
                {'detail': 'Permission denied. Only Cash Office role or authorized payment officers can disburse cash settlement.'},
                status=status.HTTP_403_FORBIDDEN
            )

        payment_method = request.data.get('payment_method', 'Cash')
        payment_reference = request.data.get(
            'transaction_reference') or request.data.get('payment_reference')
        remarks = request.data.get(
            'remarks') or request.data.get('payment_remarks')
        recipient_name = request.data.get('recipient_name')

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            paid_group = PaymentService.pay_ledger_group(
                group_id=group.ledger_group_id,
                actor=request.user,
                payment_method=payment_method,
                payment_reference=payment_reference,
                remarks=remarks,
                recipient_name=recipient_name,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            serializer = self.get_serializer(paid_group)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_group(self, request, pk=None):
        group = self.get_object()

        # Clean up any empty draft ledgers with 0 bundles and 0 expenses
        empty_drafts = group.ledgers.filter(
            status='Draft', total_amount=0, bundles__isnull=True, expenses__isnull=True)
        if empty_drafts.exists():
            empty_drafts.delete()

        ledgers_to_submit = group.ledgers.filter(
            status__in=['Draft', 'Rework', 'Rejected'])
        if not ledgers_to_submit.exists():
            all_approved = group.ledgers.filter(status__in=['Approved', 'Paid']).count(
            ) == group.ledgers.count() and group.ledgers.exists()
            if all_approved:
                return Response(
                    {'detail': f"All batches in Ledger Group '{group.group_name}' are already Approved."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return Response(
                {'detail': 'No draft or rework batches found in this Ledger Group to submit.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        has_attached_bundles = any(
            l.bundles.exists() or l.expenses.exists() for l in ledgers_to_submit)
        if not has_attached_bundles:
            return Response(
                {'detail': f"Cannot submit Ledger Group '{group.group_name}': Must have at least one claim bundle attached."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            for ledger in ledgers_to_submit:
                if ledger.bundles.exists() or ledger.expenses.exists():
                    LedgerService.submit_ledger(
                        ledger.ledger_id, request.user, ip_address=request.META.get('REMOTE_ADDR'))
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

        updated_ledgers = list(get_optimized_ledger_queryset().filter(
            ledger_group=group)) if group else []
        return Response(LedgerSerializer(updated_ledgers, many=True, context={'request': request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='action')
    def action_group(self, request, pk=None):
        group = self.get_object()
        action_name = request.data.get('action')
        comments = request.data.get('comments')

        if action_name not in ['APPROVED', 'REJECTED', 'REWORK']:
            return Response({'detail': f"Invalid action '{action_name}'."}, status=status.HTTP_400_BAD_REQUEST)

        if action_name == 'REWORK' and not (comments and str(comments).strip()):
            return Response({'detail': "A reason or comment is required when requesting rework."}, status=status.HTTP_400_BAD_REQUEST)

        pending_instances = ApprovalInstance.objects.filter(
            ledger__ledger_group=group,
            status='Pending'
        ).select_related('step', 'ledger')

        if not pending_instances.exists():
            return Response({'detail': 'No pending approval steps found for this Ledger Group.'}, status=status.HTTP_400_BAD_REQUEST)

        actioned_count = 0
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            for inst in list(pending_instances):
                if ApprovalService.can_user_action_step(request.user, inst.step, inst):
                    ApprovalService.action_step(
                        instance_id=inst.instance_id,
                        actor=request.user,
                        action=action_name,
                        comments=comments,
                        ip_address=request.META.get('REMOTE_ADDR')
                    )
                    actioned_count += 1
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        if actioned_count == 0:
            return Response({'detail': 'You are not authorized to action the pending approval step for this Ledger Group.'}, status=status.HTTP_403_FORBIDDEN)

        # Auto-complete ledger group in backend if all batches are now approved
        if group and group.ledgers.exclude(status__in=['Approved', 'Paid']).count() == 0:
            if not group.is_completed:
                group.is_completed = True
                group.completed_at = timezone.now()
                if request.user and request.user.is_authenticated:
                    group.completed_by = request.user
                group.save(update_fields=[
                           'is_completed', 'completed_at', 'completed_by'])

        updated_ledgers = list(get_optimized_ledger_queryset().filter(
            ledger_group=group)) if group else []
        return Response(LedgerSerializer(updated_ledgers, many=True, context={'request': request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='add-bundle')
    def add_bundle(self, request, pk=None):
        bundle_ids = request.data.get('bundle_ids')
        bundle_id = request.data.get('bundle_id')
        if not bundle_ids and not bundle_id:
            raise exceptions.ValidationError(
                {'detail': 'bundle_id or bundle_ids is required'})

        target_ids = bundle_ids if isinstance(
            bundle_ids, list) else [bundle_id]
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            group = LedgerService.add_bundle_to_group(
                ledger_group_id=pk,
                bundle_ids=target_ids,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            updated_ledgers = list(get_optimized_ledger_queryset().filter(
                ledger_group=group)) if group else []
            return Response(LedgerSerializer(updated_ledgers, many=True).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='remove-bundle')
    def remove_bundle(self, request, pk=None):
        bundle_id = request.data.get('bundle_id')
        if not bundle_id:
            raise exceptions.ValidationError(
                {'detail': 'bundle_id is required'})
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            group = LedgerService.remove_bundle_from_group(
                group_id=pk,
                bundle_id=bundle_id,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            updated_ledgers = list(get_optimized_ledger_queryset().filter(
                ledger_group=group)) if group else []
            return Response(LedgerSerializer(updated_ledgers, many=True).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})


class LedgerViewSet(viewsets.ModelViewSet):
    queryset = Ledger.objects.all()
    serializer_class = LedgerSerializer
    pagination_class = FinancePagination

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return LedgerWriteSerializer
        return LedgerSerializer

    def get_queryset(self):
        queryset = Ledger.objects.all()

        status_param = self.request.query_params.get("status")
        if status_param and status_param.upper() != 'ALL':
            status_lower = status_param.lower().strip()
            if status_lower == 'paid':
                queryset = queryset.filter(
                    Q(status__iexact='Paid') | Q(ledger_group__is_paid=True)
                )
            elif status_lower in ('in review', 'submitted', 'pending', 'pending approval'):
                queryset = queryset.filter(
                    Q(status__iexact='In Review') | Q(
                        status__iexact='Submitted')
                )
            elif status_lower in ('approved', 'completed'):
                queryset = queryset.filter(
                    Q(status__iexact='Approved') | Q(
                        ledger_group__is_completed=True)
                ).exclude(status__iexact='Paid').exclude(ledger_group__is_paid=True)
            else:
                queryset = queryset.filter(status__iexact=status_param.strip())

        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        if from_date:
            queryset = queryset.filter(created_at__date__gte=from_date)

        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        if to_date:
            queryset = queryset.filter(created_at__date__lte=to_date)

        search = self.request.query_params.get(
            "search") or self.request.query_params.get("q")
        if search:
            search = search.strip()
            q_search = (
                Q(ledger_group__group_name__icontains=search) |
                Q(created_by__first_name__icontains=search) |
                Q(created_by__last_name__icontains=search) |
                Q(created_by__username__icontains=search) |
                Q(bundles__worker__first_name__icontains=search) |
                Q(bundles__worker__last_name__icontains=search) |
                Q(bundles__worker__username__icontains=search)
            )
            if search.isdigit():
                q_search |= Q(ledger_id=int(search)) | Q(
                    bundles__claim_id=int(search))
            queryset = queryset.filter(q_search).distinct()

        return queryset.select_related(
            'ledger_group',
            'ledger_group__created_by',
            'ledger_group__completed_by',
            'ledger_batch',
            'created_by',
            'created_by__role',
            'store'
        ).prefetch_related(
            'created_by__sub_departments',
            Prefetch(
                'expenses',
                queryset=Expense.objects.select_related(
                    'worker', 'worker__role', 'ticket', 'ticket__store', 'ticket__nature__sub_department__department',
                    'ticket__department', 'ticket__status', 'expense_type', 'expense_type__parent', 'expense_type__department', 'responsible_store', 'added_by', 'claim'
                ).prefetch_related(
                    'receipts', 'worker__sub_departments', 'ledgers',
                    'approval_instances__step__assigned_role',
                    'approval_instances__step__assigned_users',
                    'approval_instances__action_by'
                )
            ),
            Prefetch(
                'bundles',
                queryset=WorkerClaim.objects.select_related(
                    'worker', 'worker__role', 'submitted_by', 'submitted_by__role', 'approved_by', 'approved_by__role',
                    'ticket', 'ticket__store', 'ticket__nature__sub_department__department', 'ticket__department', 'ticket__status'
                ).prefetch_related(
                    'worker__sub_departments',
                    'submitted_by__sub_departments',
                    'approved_by__sub_departments',
                    Prefetch(
                        'expenses',
                        queryset=Expense.objects.select_related(
                            'worker', 'worker__role', 'ticket', 'ticket__store', 'ticket__nature__sub_department__department',
                            'ticket__department', 'ticket__status', 'expense_type', 'expense_type__parent', 'expense_type__department', 'responsible_store', 'added_by', 'claim'
                        ).prefetch_related(
                            'receipts', 'worker__sub_departments', 'ledgers',
                            'approval_instances__step__assigned_role',
                            'approval_instances__step__assigned_users',
                            'approval_instances__action_by'
                        )
                    ),
                    'approval_instances__step__assigned_role',
                    'approval_instances__step__assigned_users',
                    'approval_instances__action_by',
                    'ledgers__ledger_group'
                )
            ),

            'approval_instances__step__assigned_role',
            'approval_instances__step__assigned_users',
            'approval_instances__action_by',
            'ledger_batch__sub_departments__department'
        ).order_by('-created_at', '-ledger_id')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bundle_ids = serializer.validated_data.get('bundle_ids', [])
        ledger_group = serializer.validated_data.get('ledger_group')
        remarks = serializer.validated_data.get('remarks')

        from django.core.exceptions import ValidationError as DjangoValidationError, ObjectDoesNotExist
        try:
            ledgers = LedgerService.create_ledger(
                bundle_ids=bundle_ids,
                created_by=request.user if request.user and request.user.is_authenticated else None,
                ledger_group_id=ledger_group.ledger_group_id if ledger_group else None,
                remarks=remarks,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            if isinstance(ledgers, list):
                ledger_pks = [l.pk for l in ledgers]
                optimized_ledgers = list(
                    get_optimized_ledger_queryset().filter(pk__in=ledger_pks))
                if len(optimized_ledgers) == 1:
                    return Response(LedgerSerializer(optimized_ledgers[0], context={'request': request}).data, status=status.HTTP_201_CREATED)
                return Response(LedgerSerializer(optimized_ledgers, many=True, context={'request': request}).data, status=status.HTTP_201_CREATED)
            fresh_ledger = get_optimized_ledger_queryset().filter(
                pk=ledgers.pk).first() or ledgers
            return Response(LedgerSerializer(fresh_ledger, context={'request': request}).data, status=status.HTTP_201_CREATED)
        except (DjangoValidationError, ObjectDoesNotExist) as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_ledger(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            ledger = LedgerService.submit_ledger(
                ledger_id=pk,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(LedgerSerializer(ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='pay')
    def pay_ledger(self, request, pk=None):
        ledger = self.get_object()
        user = request.user
        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        is_cash_office = (
            role_name in ('cash office', 'cash officer', 'cashier') or
            user.has_perm('finance.pay_ledger') or
            user.is_superuser or
            role_name in ('administrator', 'admin')
        )
        if not is_cash_office:
            return Response(
                {'detail': 'Permission denied. Only Cash Office role or authorized payment officers can disburse cash settlement.'},
                status=status.HTTP_403_FORBIDDEN
            )

        payment_method = request.data.get('payment_method', 'Cash')
        amount_paid = request.data.get('amount_paid', ledger.total_amount)
        transaction_reference = request.data.get(
            'transaction_reference') or request.data.get('payment_reference')
        remarks = request.data.get('remarks')

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            PaymentService.process_payment(
                actor=request.user,
                payment_method=payment_method,
                amount_paid=amount_paid,
                ledger_id=ledger.ledger_id,
                transaction_reference=transaction_reference,
                remarks=remarks,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            ledger.refresh_from_db()
            return Response(LedgerSerializer(ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='add-expense')
    def add_expense(self, request, pk=None):
        expense_id = request.data.get('expense_id')
        if not expense_id:
            raise exceptions.ValidationError(
                {'detail': 'expense_id is required'})
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            ledger = LedgerService.add_expense(
                ledger_id=pk,
                expense_id=expense_id,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(LedgerSerializer(ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='remove-expense')
    def remove_expense(self, request, pk=None):
        expense_id = request.data.get('expense_id')
        if not expense_id:
            raise exceptions.ValidationError(
                {'detail': 'expense_id is required'})
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            ledger = LedgerService.remove_expense(
                ledger_id=pk,
                expense_id=expense_id,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(LedgerSerializer(ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='add-bundle')
    def add_bundle(self, request, pk=None):
        bundle_id = request.data.get('bundle_id')
        if not bundle_id:
            raise exceptions.ValidationError(
                {'detail': 'bundle_id is required'})
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            ledger = LedgerService.add_bundle(
                ledger_id=pk,
                bundle_id=bundle_id,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            fresh_ledger = get_optimized_ledger_queryset().filter(
                pk=ledger.pk).first() or ledger
            return Response(LedgerSerializer(fresh_ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=True, methods=['post'], url_path='remove-bundle')
    def remove_bundle(self, request, pk=None):
        bundle_id = request.data.get('bundle_id')
        if not bundle_id:
            raise exceptions.ValidationError(
                {'detail': 'bundle_id is required'})
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            ledger = LedgerService.remove_bundle(
                ledger_id=pk,
                bundle_id=bundle_id,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(LedgerSerializer(ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    @action(detail=False, methods=['get'], url_path='available-approved-bundles')
    def available_approved_bundles(self, request):
        qs = WorkerClaim.objects.filter(
            status='Approved', ledgers__isnull=True)
        return Response(WorkerClaimSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='available-approved-expenses')
    def available_approved_expenses(self, request):
        store_id = request.query_params.get('store_id')
        qs = Expense.objects.filter(approved=True, ledgers__isnull=True)
        if store_id:
            from django.db.models import Q
            qs = qs.filter(Q(responsible_store_id=store_id)
                           | Q(ticket__store_id=store_id))
        return Response(ExpenseSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='change-group')
    def change_group(self, request, pk=None):
        ledger_group_id = request.data.get('ledger_group_id')
        new_group_name = request.data.get(
            'new_group_name') or request.data.get('new_ledger_group_name')

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            ledger = LedgerService.change_ledger_group(
                ledger_id=pk,
                ledger_group_id=ledger_group_id,
                new_group_name=new_group_name,
                actor=request.user,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(LedgerSerializer(ledger).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})

    def perform_destroy(self, instance):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list(
            'name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied(
                {'detail': 'Management role is view-only.'})

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            LedgerService.delete_ledger(
                ledger_id=instance.pk,
                actor=user,
                ip_address=self.request.META.get('REMOTE_ADDR')
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})


class ApprovalWorkflowViewSet(viewsets.ModelViewSet):
    queryset = ApprovalWorkflow.objects.all()
    serializer_class = ApprovalWorkflowSerializer


class ApprovalStepViewSet(viewsets.ModelViewSet):
    queryset = ApprovalStep.objects.all()
    serializer_class = ApprovalStepSerializer


class ApprovalInstanceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ApprovalInstance.objects.all()
    serializer_class = ApprovalInstanceSerializer
    pagination_class = FinancePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return ApprovalInstance.objects.none()

        my_role_only = self.request.query_params.get("assigned_to_me")
        if my_role_only is not None and my_role_only.lower() in ('true', '1', 'yes'):
            if user.is_superuser:
                return queryset

            from django.db.models import Q
            q_filter = Q(step__assigned_users=user)
            if hasattr(user, 'role') and user.role:
                q_filter |= Q(step__assigned_role=user.role)

            try:
                from guardian.shortcuts import get_objects_for_user
                claim_pks = get_objects_for_user(
                    user, 'finance.approve_workerclaim', accept_global_perms=False).values_list('pk', flat=True)
                if claim_pks:
                    q_filter |= Q(claim_id__in=claim_pks)

                expense_pks = get_objects_for_user(
                    user, 'finance.approve_expense', accept_global_perms=False).values_list('pk', flat=True)
                if expense_pks:
                    q_filter |= Q(expense_id__in=expense_pks)

                ledger_pks = get_objects_for_user(
                    user, 'finance.approve_ledger', accept_global_perms=False).values_list('pk', flat=True)
                if ledger_pks:
                    q_filter |= Q(ledger_id__in=ledger_pks)
            except Exception:
                pass

            if user.has_perm('finance.approve_workerclaim'):
                q_filter |= Q(claim__isnull=False)
            if user.has_perm('finance.approve_expense'):
                q_filter |= Q(expense__isnull=False)
            if user.has_perm('finance.approve_ledger'):
                q_filter |= Q(ledger__isnull=False)

            queryset = queryset.filter(q_filter).distinct()

        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        if from_date:
            queryset = queryset.filter(created_at__date__gte=from_date)

        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        if to_date:
            queryset = queryset.filter(created_at__date__lte=to_date)

        return queryset.select_related(
            'step', 'step__workflow', 'step__assigned_role', 'action_by', 'action_by__role',
            'claim', 'claim__worker', 'claim__ticket', 'claim__ticket__store',
            'ledger', 'ledger__ledger_group', 'ledger__store',
            'expense', 'expense__worker', 'expense__ticket', 'expense__ticket__store', 'expense__expense_type', 'expense__responsible_store'
        ).prefetch_related(
            'step__assigned_users',
            'step__workflow__steps__assigned_role',
            'step__workflow__steps__assigned_users',
            'claim__expenses__receipts',
            'claim__expenses__expense_type',
            'claim__expenses__ticket__store',
            'claim__expenses__responsible_store',
            'claim__expenses__worker',
            'ledger__bundles__worker',
            'ledger__bundles__ticket__store',
            'ledger__bundles__expenses__receipts',
            'ledger__bundles__expenses__expense_type',
            'ledger__bundles__expenses__responsible_store',
            'ledger__bundles__expenses__worker',
            'ledger__expenses__receipts',
            'ledger__expenses__expense_type',
            'ledger__expenses__responsible_store',
            'ledger__expenses__worker',
            'expense__receipts'
        ).order_by('-created_at', '-instance_id')

    @action(detail=True, methods=['post'], url_path='action')
    def action_step(self, request, pk=None):
        # 'APPROVED', 'REJECTED', 'REWORK'
        action_name = request.data.get('action')
        comments = request.data.get('comments')
        ledger_group_id = request.data.get('ledger_group_id')
        new_group_name = request.data.get(
            'new_group_name') or request.data.get('new_ledger_group_name')

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            # 1. Look up directly by ApprovalInstance primary key
            target_instance = ApprovalInstance.objects.filter(pk=pk).first()

            # 2. If not found, pk may be a claim_id, expense_id, or ledger_id
            if not target_instance:
                target_instance = (
                    ApprovalInstance.objects.filter(claim_id=pk, status='Pending').order_by('created_at').first() or
                    ApprovalInstance.objects.filter(expense_id=pk, status='Pending').order_by('created_at').first() or
                    ApprovalInstance.objects.filter(
                        ledger_id=pk, status='Pending').order_by('created_at').first()
                )

            # 3. If still not found, check if a WorkerClaim, Expense, or Ledger exists in review that needs workflow initialization
            if not target_instance:
                bundle = WorkerClaim.objects.filter(
                    pk=pk, status__in=['In Review', 'Submitted']).first()
                if bundle:
                    target_instance = ApprovalService.start_workflow(
                        bundle, request.user, ip_address=request.META.get('REMOTE_ADDR'))
                else:
                    exp = Expense.objects.filter(pk=pk, approved=False).first()
                    if exp:
                        target_instance = ApprovalService.start_workflow(
                            exp, request.user, ip_address=request.META.get('REMOTE_ADDR'))

            if not target_instance:
                raise exceptions.NotFound(
                    {'detail': f'Approval instance #{pk} not found.'})

            instance = ApprovalService.action_step(
                instance_id=target_instance.instance_id,
                actor=request.user,
                action=action_name,
                comments=comments,
                ledger_group_id=ledger_group_id,
                new_group_name=new_group_name,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            act_inst = instance or target_instance
            if act_inst:
                try:
                    act_inst.refresh_from_db()
                except Exception:
                    pass

            claim_id = getattr(act_inst, 'claim_id', None)
            ledger_id = getattr(act_inst, 'ledger_id', None)
            expense_id = getattr(act_inst, 'expense_id', None)

            is_bundle = claim_id is not None
            is_ledger = ledger_id is not None
            is_expense = expense_id is not None

            bundle_data = None
            ledger_data = None
            expense_data = None
            all_completed = False

            if is_bundle and act_inst and act_inst.claim:
                act_inst.claim.refresh_from_db()
                all_completed = act_inst.claim.status == 'Approved'
                bundle_data = WorkerClaimSerializer(
                    act_inst.claim, context={'request': request}).data
            elif is_ledger and act_inst and act_inst.ledger:
                act_inst.ledger.refresh_from_db()
                all_completed = act_inst.ledger.status == 'Approved'
                ledger_data = LedgerSerializer(act_inst.ledger, context={
                                               'request': request}).data
            elif is_expense and act_inst and act_inst.expense:
                act_inst.expense.refresh_from_db()
                all_completed = act_inst.expense.approved
                expense_data = ExpenseSerializer(act_inst.expense, context={
                                                 'request': request}).data

            status_val = 'Approved' if all_completed else 'In Review'
            if is_bundle and act_inst and act_inst.claim:
                status_val = act_inst.claim.status
            elif is_ledger and act_inst and act_inst.ledger:
                status_val = act_inst.ledger.status

            return Response({
                'instance': ApprovalInstanceSerializer(act_inst).data if act_inst else None,
                'bundle': bundle_data,
                'ledger': ledger_data,
                'expense': expense_data,
                'all_completed': all_completed,
                'status': status_val
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects.all().select_related(
        'actor', 'actor__role').order_by('-timestamp')
    serializer_class = AuditEventSerializer
    pagination_class = FinancePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        if from_date:
            queryset = queryset.filter(timestamp__date__gte=from_date)

        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        if to_date:
            queryset = queryset.filter(timestamp__date__lte=to_date)
        return queryset


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all().select_related('paid_by', 'paid_by__role',
                                                    'claim', 'ledger', 'expense').order_by('-paid_at', '-payment_id')
    serializer_class = PaymentSerializer
    pagination_class = FinancePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        from_date = self.request.query_params.get(
            "from_date") or self.request.query_params.get("date_from")
        if from_date:
            queryset = queryset.filter(paid_at__date__gte=from_date)

        to_date = self.request.query_params.get(
            "to_date") or self.request.query_params.get("date_to")
        if to_date:
            queryset = queryset.filter(paid_at__date__lte=to_date)
        return queryset

    @action(detail=False, methods=['post'], url_path='process-payment')
    def process_payment(self, request):
        user = request.user
        role_name = (user.role.role_name.lower().strip() if hasattr(
            user, 'role') and user.role else '') if user else ''
        amount_paid = request.data.get('amount_paid')
        bundle_id = request.data.get('bundle_id')
        ledger_id = request.data.get('ledger_id')
        expense_id = request.data.get('expense_id')

        has_specific_perm = False
        if bundle_id:
            has_specific_perm = user.has_perm('finance.single_payment_process')
        elif ledger_id:
            has_specific_perm = (
                user.has_perm('finance.bulk_payment_process') or
                user.has_perm('finance.bulk_payment_processs')
            )

        is_cash_office = (
            has_specific_perm or
            role_name in ('cash office', 'cash officer', 'cashier') or
            user.has_perm('finance.single_payment_process') or
            user.has_perm('finance.bulk_payment_process') or
            user.has_perm('finance.bulk_payment_processs') or
            user.has_perm('finance.pay_ledger') or
            user.has_perm('finance.pay_ledger_group') or
            user.has_perm('finance.settle_cash_ledger') or
            user.is_superuser or
            role_name in ('administrator', 'admin')
        )
        if not is_cash_office:
            return Response(
                {'detail': 'Permission denied. Only Cash Office role or authorized payment officers can disburse cash settlement.'},
                status=status.HTTP_403_FORBIDDEN
            )
        remarks = request.data.get('remarks')
        recipient_name = request.data.get('recipient_name')

        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            payment = PaymentService.process_payment(
                actor=request.user,
                payment_method='Cash',
                amount_paid=amount_paid,
                bundle_id=bundle_id,
                ledger_id=ledger_id,
                expense_id=expense_id,
                remarks=remarks,
                recipient_name=recipient_name,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(
                e, 'messages') and e.messages else str(e)
            raise exceptions.ValidationError({'detail': msg})


def recalculate_reconciliation(instance):
    ticket = instance.ticket
    if not ticket:
        return

    all_expenses = ticket.expenses.filter(approved=True)
    all_worklogs = ticket.work_logs.all()

    labour_total = sum(wl.labour_amount for wl in all_worklogs)
    expense_total = sum(exp.amount for exp in all_expenses)

    if instance.labour_total is None or instance.labour_total == Decimal('0.00'):
        instance.labour_total = labour_total
    if instance.expense_total is None or instance.expense_total == Decimal('0.00'):
        instance.expense_total = expense_total
    if instance.material_total is None:
        instance.material_total = Decimal('0.00')

    instance.grand_total = instance.labour_total + \
        instance.expense_total + instance.material_total

    claimed_expenses = all_expenses.filter(is_claimed=True)
    claimed_worklogs = all_worklogs.filter(is_claimed=True)

    claimed_expense_total = sum(exp.amount for exp in claimed_expenses)
    claimed_labour_total = sum(wl.labour_amount for wl in claimed_worklogs)
    total_claimed_amount = claimed_expense_total + claimed_labour_total

    instance.claimed_labour_total = claimed_labour_total
    instance.claimed_expense_total = claimed_expense_total
    instance.total_claimed_amount = total_claimed_amount
    instance.net_payable_amount = max(
        Decimal('0.00'), instance.grand_total - total_claimed_amount)


class ReconciliationViewSet(viewsets.ModelViewSet):
    queryset = Reconciliation.objects.all()
    serializer_class = ReconciliationSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return Reconciliation.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(
            user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip()
                             for g in user.groups.values_list('name', flat=True)]
        is_management = role_name in (
            'management', 'management team') or 'management' in user_groups_lower

        if not user.is_superuser and not is_management:
            accessible_store_ids = list(
                user.accessible_stores.values_list('store_id', flat=True))
            if accessible_store_ids:
                queryset = queryset.filter(
                    ticket__store_id__in=accessible_store_ids)

        return queryset

    def perform_create(self, serializer):
        instance = serializer.save()
        recalculate_reconciliation(instance)
        instance.save()

    def perform_update(self, serializer):
        instance = serializer.save()
        recalculate_reconciliation(instance)
        instance.save()


class LedgerBatchViewSet(viewsets.ModelViewSet):
    queryset = LedgerBatch.objects.all().prefetch_related('sub_departments__department')
    serializer_class = LedgerBatchSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return LedgerBatchWriteSerializer
        return LedgerBatchSerializer
