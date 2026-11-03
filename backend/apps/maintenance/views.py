from django.db.models import Q, Prefetch, F
from rest_framework import viewsets, exceptions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from .models import Priority, Status, WorkNature, NatureWorker, Ticket, Allocation, WorkLog, TicketHistory, TicketChatMessage, ComplaintIssueType, Complaint
from .serializers import (
    PrioritySerializer, StatusSerializer, WorkNatureSerializer,
    NatureWorkerSerializer, TicketSerializer, AllocationSerializer,
    WorkLogSerializer, TicketHistorySerializer, TicketChatMessageSerializer,
    AllocationWriteSerializer, WorkLogWriteSerializer, TicketWriteSerializer,
    WorkNatureWriteSerializer, NatureWorkerWriteSerializer,
    ComplaintIssueTypeSerializer, ComplaintSerializer
)


class TicketPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 10000

    def paginate_queryset(self, queryset, request, view=None):
        if (request.query_params.get('all') == 'true' or
                request.query_params.get('no_page') == 'true' or
                request.query_params.get('page_size') == 'all'):
            return None
        return super().paginate_queryset(queryset, request, view)


class PriorityViewSet(viewsets.ModelViewSet):
    queryset = Priority.objects.all().select_related('department')
    serializer_class = PrioritySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(department_id=department)
        return queryset


class StatusViewSet(viewsets.ModelViewSet):
    queryset = Status.objects.all()
    serializer_class = StatusSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(department_id=department)
        return queryset


class WorkNatureViewSet(viewsets.ModelViewSet):
    queryset = WorkNature.objects.all().select_related('sub_department', 'sub_department__department')
    serializer_class = WorkNatureSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return WorkNatureWriteSerializer
        return WorkNatureSerializer

    def perform_update(self, serializer):
        instance = serializer.instance
        is_office_nature = instance.nature_name.lower().strip() == 'office related' or (
            instance.sub_department and instance.sub_department.sub_department_name.lower().strip() == 'office'
        )
        if is_office_nature:
            raise exceptions.ValidationError({'detail': 'System work nature "Office Related" cannot be modified or updated.'})
        serializer.save()

    def perform_destroy(self, instance):
        is_office_nature = instance.nature_name.lower().strip() == 'office related' or (
            instance.sub_department and instance.sub_department.sub_department_name.lower().strip() == 'office'
        )
        if is_office_nature:
            raise exceptions.ValidationError({'detail': 'System work nature "Office Related" cannot be deleted.'})
        instance.delete()

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return WorkNature.objects.none()

        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(sub_department__department_id=department)

        exclude_office = self.request.query_params.get('exclude_office')
        if exclude_office == 'true' or (department and self.request.query_params.get('include_office') != 'true'):
            queryset = queryset.exclude(sub_department__sub_department_name__iexact='office')

        if not user.is_superuser:
            user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
            can_view_all_depts = (
                user.has_perm('maintenance.view_all_department_tickets') or
                user.has_perm('maintenance.create_ticket_all_departments') or
                'main_admin' in user_groups_lower or
                'main administrator' in user_groups_lower or
                'administrator' in user_groups_lower
            )
            if not can_view_all_depts:
                user_dept_ids = list(user.sub_departments.values_list('department_id', flat=True))
                if user_dept_ids:
                    queryset = queryset.filter(sub_department__department_id__in=user_dept_ids)
                else:
                    return WorkNature.objects.none()

        return queryset


class NatureWorkerViewSet(viewsets.ModelViewSet):
    queryset = NatureWorker.objects.all().select_related(
        'nature',
        'nature__sub_department',
        'worker',
        'worker__role'
    )
    serializer_class = NatureWorkerSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return NatureWorkerWriteSerializer
        return NatureWorkerSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        nature = self.request.query_params.get('nature')
        if nature:
            queryset = queryset.filter(nature_id=nature)
        return queryset.filter(worker__active=True)


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all().order_by('-created_date').select_related(
        'store',
        'store__area',
        'store__manager',
        'department',
        'nature',
        'nature__sub_department',
        'priority',
        'status',
        'created_by'
    ).prefetch_related(
        'allocations',
        'allocations__worker',
        Prefetch('history', queryset=TicketHistory.objects.order_by('-changed_date'), to_attr='cached_history')
    )
    serializer_class = TicketSerializer
    pagination_class = TicketPagination

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return TicketWriteSerializer
        return TicketSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return Ticket.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
        is_management = role_name in ('management', 'management team') or 'management' in user_groups_lower

        if user.is_superuser or is_management:
            pass
        else:
            # Filter by ticket status permissions.
            user_perms = user.get_all_permissions()
            disallowed_status_ids = []
            for s in Status.objects.all():
                codename = 'can_view_{}_ticket'.format(
                    s.status_name.lower().replace(' ', '_')
                )
                perm = 'maintenance.{}'.format(codename)
                if perm not in user_perms:
                    disallowed_status_ids.append(s.status_id)

            if disallowed_status_ids:
                queryset = queryset.exclude(
                    status_id__in=disallowed_status_ids)

            # Technicians only see tickets allocated to them
            if role_name == 'technician':
                queryset = queryset.filter(allocations__worker=user).distinct()
            else:
                # Filter non-superusers by accessible stores
                accessible_store_ids = list(
                    user.accessible_stores.values_list('store_id', flat=True))
                if accessible_store_ids:
                    queryset = queryset.filter(
                        store_id__in=accessible_store_ids).distinct()
                else:
                    return Ticket.objects.none()

                # Check department level restriction
                can_view_all_depts = (
                    user.has_perm('maintenance.view_all_department_tickets') or
                    user.has_perm('maintenance.create_ticket_all_departments') or
                    'main_admin' in user_groups_lower or
                    'main administrator' in user_groups_lower or
                    'administrator' in user_groups_lower
                )

                if not can_view_all_depts:
                    user_dept_ids = list(user.sub_departments.values_list(
                        'department_id', flat=True))
                    if user_dept_ids:
                        queryset = queryset.filter(
                            department_id__in=user_dept_ids)
                    else:
                        return Ticket.objects.none()

        # Query parameter filters
        params = self.request.query_params
        search = (params.get('search') or '').strip()
        if search:
            clean_search = search.lstrip('#')
            search_q = (
                Q(title__icontains=search) |
                Q(work_order_no__icontains=search) |
                Q(description__icontains=search) |
                Q(store__store_name__icontains=search) |
                Q(department__department_name__icontains=search) |
                Q(nature__nature_name__icontains=search) |
                Q(nature__sub_department__sub_department_name__icontains=search) |
                Q(created_by__full_name__icontains=search) |
                Q(created_by__employee_no__icontains=search) |
                Q(created_by__username__icontains=search) |
                Q(allocations__worker__full_name__icontains=search) |
                Q(allocations__worker__username__icontains=search)
            )
            if clean_search.isdigit():
                search_q |= Q(ticket_id=int(clean_search)) | Q(store_id=int(clean_search))
            queryset = queryset.filter(search_q).distinct()

        store = params.get('store')
        if store:
            store_str = store.strip()
            queryset = queryset.filter(
                Q(store__store_id__iexact=store_str) |
                Q(store__store_name__iexact=store_str) |
                Q(store__short_code__iexact=store_str)
            )

        department = params.get('department')
        if department:
            queryset = queryset.filter(department_id=department)

        sub_department = params.get('sub_department')
        if sub_department:
            queryset = queryset.filter(nature__sub_department_id=sub_department)

        status = params.get('status')
        if status:
            clean_status = status.strip()
            if clean_status.isdigit():
                queryset = queryset.filter(status_id=clean_status)
            else:
                clean_status_normalized = clean_status.replace('_', ' ')
                queryset = queryset.filter(
                    Q(status__status_name__iexact=clean_status) |
                    Q(status__status_name__iexact=clean_status_normalized)
                )

        priority = params.get('priority')
        if priority:
            if priority.isdigit():
                queryset = queryset.filter(priority_id=priority)
            else:
                queryset = queryset.filter(priority__priority_name=priority)

        worker = params.get('worker')
        if worker:
            queryset = queryset.filter(allocations__worker_id=worker).distinct()

        from_date = params.get('from_date')
        to_date = params.get('to_date')
        date_type = (params.get('date_type') or 'created').lower().strip()

        if from_date or to_date:
            to_date_val = to_date
            if to_date_val and len(to_date_val) == 10:
                to_date_val = f"{to_date_val} 23:59:59"

            if date_type in ('open', 'approved'):
                if from_date and to_date_val:
                    queryset = queryset.filter(
                        Q(approved_date__gte=from_date, approved_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Open', history__changed_date__gte=from_date, history__changed_date__lte=to_date_val, history__changed_date__gt=F('created_date'))
                    )
                elif from_date:
                    queryset = queryset.filter(
                        Q(approved_date__gte=from_date) |
                        Q(history__status__status_name__iexact='Open', history__changed_date__gte=from_date, history__changed_date__gt=F('created_date'))
                    )
                elif to_date_val:
                    queryset = queryset.filter(
                        Q(approved_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Open', history__changed_date__lte=to_date_val, history__changed_date__gt=F('created_date'))
                    )
                queryset = queryset.distinct()

            elif date_type in ('rejected', 'relected'):
                if from_date and to_date_val:
                    queryset = queryset.filter(
                        Q(rejected_date__gte=from_date, rejected_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Rejected', history__changed_date__gte=from_date, history__changed_date__lte=to_date_val)
                    )
                elif from_date:
                    queryset = queryset.filter(
                        Q(rejected_date__gte=from_date) |
                        Q(history__status__status_name__iexact='Rejected', history__changed_date__gte=from_date)
                    )
                elif to_date_val:
                    queryset = queryset.filter(
                        Q(rejected_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Rejected', history__changed_date__lte=to_date_val)
                    )
                queryset = queryset.distinct()

            elif date_type == 'blocked':
                if from_date and to_date_val:
                    queryset = queryset.filter(
                        history__status__status_name__iexact='Blocked',
                        history__changed_date__gte=from_date,
                        history__changed_date__lte=to_date_val
                    )
                elif from_date:
                    queryset = queryset.filter(
                        history__status__status_name__iexact='Blocked',
                        history__changed_date__gte=from_date
                    )
                elif to_date_val:
                    queryset = queryset.filter(
                        history__status__status_name__iexact='Blocked',
                        history__changed_date__lte=to_date_val
                    )
                queryset = queryset.distinct()

            elif date_type in ('in_progress', 'in progress'):
                if from_date and to_date_val:
                    queryset = queryset.filter(
                        history__status__status_name__iexact='In Progress',
                        history__changed_date__gte=from_date,
                        history__changed_date__lte=to_date_val
                    )
                elif from_date:
                    queryset = queryset.filter(
                        history__status__status_name__iexact='In Progress',
                        history__changed_date__gte=from_date
                    )
                elif to_date_val:
                    queryset = queryset.filter(
                        history__status__status_name__iexact='In Progress',
                        history__changed_date__lte=to_date_val
                    )
                queryset = queryset.distinct()

            elif date_type in ('location_approval', 'location approval', 'location_approved'):
                if from_date and to_date_val:
                    queryset = queryset.filter(
                        Q(location_approved_date__gte=from_date, location_approved_date__lte=to_date_val) |
                        Q(history__location_approved_date__gte=from_date, history__location_approved_date__lte=to_date_val)
                    )
                elif from_date:
                    queryset = queryset.filter(
                        Q(location_approved_date__gte=from_date) |
                        Q(history__location_approved_date__gte=from_date)
                    )
                elif to_date_val:
                    queryset = queryset.filter(
                        Q(location_approved_date__lte=to_date_val) |
                        Q(history__location_approved_date__lte=to_date_val)
                    )
                queryset = queryset.distinct()

            elif date_type in ('closed', 'completed'):
                if from_date and to_date_val:
                    queryset = queryset.filter(
                        Q(closed_date__gte=from_date, closed_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Completed', history__changed_date__gte=from_date, history__changed_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Closed', history__changed_date__gte=from_date, history__changed_date__lte=to_date_val)
                    )
                elif from_date:
                    queryset = queryset.filter(
                        Q(closed_date__gte=from_date) |
                        Q(history__status__status_name__iexact='Completed', history__changed_date__gte=from_date) |
                        Q(history__status__status_name__iexact='Closed', history__changed_date__gte=from_date)
                    )
                elif to_date_val:
                    queryset = queryset.filter(
                        Q(closed_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Completed', history__changed_date__lte=to_date_val) |
                        Q(history__status__status_name__iexact='Closed', history__changed_date__lte=to_date_val)
                    )
                queryset = queryset.distinct()

            else:
                # Default: created date
                if from_date and to_date_val:
                    queryset = queryset.filter(created_date__gte=from_date, created_date__lte=to_date_val)
                elif from_date:
                    queryset = queryset.filter(created_date__gte=from_date)
                elif to_date_val:
                    queryset = queryset.filter(created_date__lte=to_date_val)
        elif not status and date_type and date_type != 'created':
            # When from_date and to_date are not specified and status is not explicitly passed, filter by date_type stage/status
            if date_type in ('open', 'approved'):
                queryset = queryset.filter(
                    Q(approved_date__isnull=False) | Q(status__status_name__iexact='Open')
                ).distinct()
            elif date_type in ('rejected', 'relected'):
                queryset = queryset.filter(
                    Q(rejected_date__isnull=False) | Q(status__status_name__iexact='Rejected')
                ).distinct()
            elif date_type == 'blocked':
                queryset = queryset.filter(status__status_name__iexact='Blocked').distinct()
            elif date_type in ('in_progress', 'in progress'):
                queryset = queryset.filter(status__status_name__iexact='In Progress').distinct()
            elif date_type in ('location_approval', 'location approval', 'location_approved'):
                queryset = queryset.filter(
                    Q(location_approved_date__isnull=False) | Q(status__status_name__iexact='Location Approval')
                ).distinct()
            elif date_type in ('closed', 'completed'):
                queryset = queryset.filter(
                    Q(closed_date__isnull=False) | Q(status__status_name__in=['Closed', 'Completed'])
                ).distinct()

        return queryset

    def create(self, request, *args, **kwargs):
        user = request.user
        if not user or user.is_anonymous:
            return Response(
                {"detail": "Authentication required to register complaints."},
                status=status.HTTP_401_UNAUTHORIZED
            )
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        has_create_perm = (
            user.is_superuser or
            user.has_perm('maintenance.can_create_complaint') or
            role_name in ('administrator', 'admin')
        )
        if not has_create_perm:
            return Response(
                {"detail": "You do not have permission to register complaints."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is view-only and cannot raise or create tickets.'})

        kwargs = {}
        if user and not user.is_anonymous:
            kwargs['created_by'] = user
        serializer.save(**kwargs)

    def perform_update(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is read-only and cannot edit tickets.'})
        serializer.save()

    @action(detail=False, methods=['get'], url_path='check-throttle')
    def check_throttle(self, request):
        store_id = request.query_params.get('store_id')
        dept_id = request.query_params.get('department_id')
        if not store_id or not dept_id:
            return Response({'error': 'store_id and department_id are required.'}, status=400)
        from apps.stores.models import Store, Department, check_location_approval_throttle
        try:
            store = Store.objects.get(pk=store_id)
            dept = Department.objects.get(pk=dept_id)
        except (Store.DoesNotExist, Department.DoesNotExist):
            return Response({'error': 'Invalid store or department ID.'}, status=404)

        result = check_location_approval_throttle(store, dept)
        return Response(result)

    def destroy(self, request, *args, **kwargs):
        raise exceptions.PermissionDenied({'detail': 'Tickets cannot be deleted to preserve system audit log and tracking integrity.'})

    def perform_destroy(self, instance):
        raise exceptions.PermissionDenied({'detail': 'Tickets cannot be deleted to preserve system audit log and tracking integrity.'})


class AllocationViewSet(viewsets.ModelViewSet):
    queryset = Allocation.objects.all().select_related('ticket', 'worker')
    serializer_class = AllocationSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AllocationWriteSerializer
        return AllocationSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return Allocation.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
        is_management = role_name in ('management', 'management team') or 'management' in user_groups_lower

        if not user.is_superuser and not is_management:
            accessible_store_ids = list(
                user.accessible_stores.values_list('store_id', flat=True))
            if accessible_store_ids:
                queryset = queryset.filter(
                    ticket__store_id__in=accessible_store_ids)

        ticket = self.request.query_params.get("ticket")
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is view-only and cannot perform create operations.'})

        kwargs = {}
        if user and not user.is_anonymous:
            kwargs['assigned_by'] = user
        allocation = serializer.save(**kwargs)
        if allocation.worker and allocation.ticket and allocation.ticket.store:
            allocation.worker.accessible_stores.add(allocation.ticket.store)

    def perform_update(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is view-only and cannot perform update operations.'})

        allocation = serializer.save()
        if allocation.worker and allocation.ticket and allocation.ticket.store:
            allocation.worker.accessible_stores.add(allocation.ticket.store)


class WorkLogViewSet(viewsets.ModelViewSet):
    queryset = WorkLog.objects.all().select_related('ticket', 'worker', 'allocation')
    serializer_class = WorkLogSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return WorkLogWriteSerializer
        return WorkLogSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return WorkLog.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
        is_management = role_name in ('management', 'management team') or 'management' in user_groups_lower

        if not user.is_superuser and not is_management:
            accessible_store_ids = list(
                user.accessible_stores.values_list('store_id', flat=True))
            if accessible_store_ids:
                queryset = queryset.filter(
                    ticket__store_id__in=accessible_store_ids)

        ticket = self.request.query_params.get("ticket")
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is read-only.'})
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is read-only.'})
        if serializer.instance.is_claimed:
            raise exceptions.PermissionDenied({'detail': 'This work log has been claimed and cannot be modified.'})
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '') if user else ''
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)] if user else []
        if role_name in ('management', 'management team') or 'management' in user_groups_lower:
            raise exceptions.PermissionDenied({'detail': 'Management role is read-only.'})
        if instance.is_claimed:
            raise exceptions.PermissionDenied({'detail': 'This work log has been claimed and cannot be deleted.'})
        instance.delete()


class TicketHistoryViewSet(viewsets.ModelViewSet):
    queryset = TicketHistory.objects.all().select_related('ticket', 'changed_by')
    serializer_class = TicketHistorySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return TicketHistory.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
        is_management = role_name in ('management', 'management team') or 'management' in user_groups_lower

        if not user.is_superuser and not is_management:
            accessible_store_ids = list(
                user.accessible_stores.values_list('store_id', flat=True))
            if accessible_store_ids:
                queryset = queryset.filter(
                    ticket__store_id__in=accessible_store_ids)

        ticket = self.request.query_params.get("ticket")
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)

        return queryset


class TicketChatPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class TicketChatMessageViewSet(viewsets.ModelViewSet):
    queryset = TicketChatMessage.objects.all()
    serializer_class = TicketChatMessageSerializer
    pagination_class = TicketChatPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or user.is_anonymous:
            return TicketChatMessage.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
        is_management = role_name in ('management', 'management team') or 'management' in user_groups_lower

        if not user.is_superuser and not is_management:
            accessible_store_ids = list(user.accessible_stores.values_list('store_id', flat=True))
            if accessible_store_ids:
                queryset = queryset.filter(ticket__store_id__in=accessible_store_ids)
            else:
                return TicketChatMessage.objects.none()

        ticket_id = self.request.query_params.get("ticket")
        if ticket_id:
            queryset = queryset.filter(ticket_id=ticket_id)
        else:
            return TicketChatMessage.objects.none()

        return queryset.order_by('-created_date')



class ComplaintIssueTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ComplaintIssueType.objects.filter(is_active=True).order_by('name')
    serializer_class = ComplaintIssueTypeSerializer
    pagination_class = None

    def get_queryset(self):
        queryset = super().get_queryset()
        role_type = self.request.query_params.get('role_type')
        if role_type:
            queryset = queryset.filter(Q(role_type=role_type) | Q(role_type='all'))
        return queryset


class ComplaintViewSet(viewsets.ModelViewSet):
    queryset = Complaint.objects.all()
    serializer_class = ComplaintSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or user.is_anonymous:
            return Complaint.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
        is_admin = user.is_superuser or role_name in ('administrator', 'admin')
        is_office_admin = 'office' in role_name or any('office' in g for g in user_groups_lower)
        is_management = role_name in ('management', 'management team') or 'management' in user_groups_lower

        queryset = Complaint.objects.select_related(
            'ticket', 'ticket__store', 'ticket__department', 'ticket__status', 'ticket__nature',
            'complainant', 'complainant__role',
            'against_user', 'against_user__role',
            'issue_type'
        ).prefetch_related('related_tickets', 'media_files')

        # Check all-complaint-view permissions
        has_all_view = (
            user.is_superuser or
            user.has_perm('maintenance.can_view_all_complaint') or
            user.has_perm('maintenance.all_complaint_view') or
            role_name in ('administrator', 'admin') or
            is_management or
            is_office_admin
        )

        can_view_mgr = user.has_perm('maintenance.can_view_manager_complaint') or has_all_view
        can_view_wkr = user.has_perm('maintenance.can_view_worker_complaint') or has_all_view

        if has_all_view:
            # Users with all_complaint_view can see complaints across all profiles
            if can_view_mgr and not can_view_wkr:
                queryset = queryset.filter(complaint_type='manager_against_worker')
            elif can_view_wkr and not can_view_mgr:
                queryset = queryset.filter(complaint_type='worker_against_manager')
        else:
            # Workers and managers only see complaints created in their own accounts
            queryset = queryset.filter(complainant=user)

        # Query filters
        ticket_id = self.request.query_params.get('ticket_id')
        if ticket_id:
            queryset = queryset.filter(Q(ticket_id=ticket_id) | Q(related_tickets__ticket_id=ticket_id)).distinct()

        complaint_type = self.request.query_params.get('complaint_type')
        if complaint_type:
            queryset = queryset.filter(complaint_type=complaint_type)

        status_val = self.request.query_params.get('status')
        if status_val:
            queryset = queryset.filter(status=status_val)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(ticket__work_order_no__icontains=search) |
                Q(ticket__title__icontains=search) |
                Q(complainant__full_name__icontains=search) |
                Q(complainant__username__icontains=search) |
                Q(against_user__full_name__icontains=search) |
                Q(against_user__username__icontains=search) |
                Q(issue_type__name__icontains=search) |
                Q(custom_issue__icontains=search) |
                Q(description__icontains=search)
            ).distinct()

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        complaint = serializer.save(complainant=self.request.user)
        # Handle media upload attached directly in multipart request
        files = self.request.FILES.getlist('files') or self.request.FILES.getlist('media')
        if files:
            from apps.common.models import Media
            for f in files:
                Media.objects.create(
                    complaint=complaint,
                    ticket=complaint.ticket,
                    uploaded_by=self.request.user,
                    file_name=f.name[:250],
                    file_url=f
                )

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        complaint = self.get_object()
        new_status = request.data.get('status')
        resolution_notes = request.data.get('resolution_notes')

        if new_status:
            complaint.status = new_status
        if resolution_notes is not None:
            complaint.resolution_notes = resolution_notes
        complaint.save()
        return Response(ComplaintSerializer(complaint).data)

    @action(detail=True, methods=['post'])
    def add_media(self, request, pk=None):
        complaint = self.get_object()
        files = request.FILES.getlist('files') or request.FILES.getlist('media')
        if not files:
            return Response({'error': 'No files uploaded'}, status=400)

        from apps.common.models import Media
        created_media = []
        for f in files:
            m = Media.objects.create(
                complaint=complaint,
                ticket=complaint.ticket,
                uploaded_by=request.user,
                file_name=f.name[:250],
                file_url=f
            )
            created_media.append(m)

        return Response(ComplaintSerializer(complaint).data)

    @action(detail=True, methods=['delete'], url_path='delete_media/(?P<media_id>[^/.]+)')
    def delete_media(self, request, pk=None, media_id=None):
        complaint = self.get_object()
        from apps.common.models import Media
        try:
            m = Media.objects.get(media_id=media_id, complaint=complaint)
            m.delete()
            return Response({'status': 'deleted'})
        except Media.DoesNotExist:
            return Response({'error': 'Media not found'}, status=404)
