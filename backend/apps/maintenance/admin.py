from django.http import JsonResponse
from django.urls import path, reverse
from django.shortcuts import redirect
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.contrib import admin
from unfold.contrib.filters.admin import AutocompleteSelectFilter, ChoicesDropdownFilter
from apps.common.admin_mixins import SearchableModelAdmin
from .models import Priority, Status, WorkNature, NatureWorker, Ticket, Allocation, WorkLog, TicketHistory, StatusChangeRule, WorkerLeave


@admin.register(Priority)
class PriorityAdmin(SearchableModelAdmin):
    list_display = ('priority_id', 'department', 'priority_name', 'level')
    list_filter = (('department', AutocompleteSelectFilter),)
    search_fields = ('priority_name',)
    autocomplete_fields = ('department',)


@admin.register(Status)
class StatusAdmin(SearchableModelAdmin):
    list_display = ('order', 'status_name')
    search_fields = ('status_name',)


@admin.register(WorkNature)
class WorkNatureAdmin(SearchableModelAdmin):
    list_display = ('nature_id', 'nature_name', 'department',
                    'sub_department', 'default_priority', 'media_required', 'active')
    list_filter = ('media_required', 'active', ('sub_department', AutocompleteSelectFilter))
    search_fields = ('nature_name',)
    autocomplete_fields = ('sub_department', 'default_priority')

    def department(self, obj):
        return obj.sub_department.department.department_name
    department.short_description = 'Department'


@admin.register(NatureWorker)
class NatureWorkerAdmin(SearchableModelAdmin):
    list_display = ('nature_worker_id', 'nature', 'worker')
    list_filter = (('nature', AutocompleteSelectFilter), ('worker', AutocompleteSelectFilter))
    search_fields = ('nature__nature_name', 'worker__username')
    autocomplete_fields = ('nature', 'worker')


@admin.register(Ticket)
class TicketAdmin(SearchableModelAdmin):
    list_display = ('ticket_id', 'work_order_no', 'store', 'department',
                    'nature', 'priority', 'status', 'created_by', 'created_date')
    list_filter = (
        ('priority', AutocompleteSelectFilter),
        ('status', AutocompleteSelectFilter),
        ('store', AutocompleteSelectFilter),
        ('department', AutocompleteSelectFilter),
        'created_date',
    )
    search_fields = ('work_order_no', 'title',
                     'description', 'created_by__username')
    autocomplete_fields = (
        'store', 'department', 'nature', 'priority', 'status',
        'created_by', 'approved_by', 'rejected_by', 'closed_by', 'location_approved_by'
    )

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Allocation)
class AllocationAdmin(SearchableModelAdmin):
    list_display = ('allocation_id', 'ticket', 'worker',
                    'assigned_by', 'assigned_date', 'planned_hours')
    list_filter = ('assigned_date', ('worker', AutocompleteSelectFilter))
    search_fields = ('ticket__work_order_no',
                     'worker__username', 'assigned_by__username')
    autocomplete_fields = ('ticket', 'worker', 'assigned_by')


@admin.register(WorkLog)
class WorkLogAdmin(SearchableModelAdmin):
    list_display = ('worklog_id', 'ticket', 'worker', 'work_date',
                    'hours', 'hourly_rate', 'labour_amount')
    list_filter = ('work_date', ('worker', AutocompleteSelectFilter))
    search_fields = ('ticket__work_order_no', 'worker__username')
    autocomplete_fields = ('ticket', 'worker', 'allocation', 'claim', 'stores')


@admin.register(TicketHistory)
class TicketHistoryAdmin(SearchableModelAdmin):
    list_display = ('history_id', 'ticket', 'status',
                    'changed_by', 'changed_date', 'remarks')
    list_filter = ('changed_date', ('status', AutocompleteSelectFilter))
    search_fields = ('ticket__work_order_no', 'changed_by__username')
    autocomplete_fields = (
        'ticket', 'store', 'department', 'nature', 'priority', 'status',
        'created_by', 'approved_by', 'rejected_by', 'closed_by',
        'location_approved_by', 'changed_by'
    )


@admin.register(StatusChangeRule)
class StatusChangeRuleAdmin(SearchableModelAdmin):
    list_display = ("from_status", "to_status", "mode", "type", "path", "message", "is_active",
                    )

    list_filter = (
        ("mode", ChoicesDropdownFilter),
        ("type", ChoicesDropdownFilter),
        "is_active",
        ("from_status", AutocompleteSelectFilter),
        ("to_status", AutocompleteSelectFilter),
    )

    search_fields = ("path", "value", "message", "from_status__status_name", "to_status__status_name",
                     )
    autocomplete_fields = ("from_status", "to_status")

    list_editable = ("is_active",
                     )

    ordering = ("from_status", "to_status",
                )


@admin.register(WorkerLeave)
class WorkerLeaveAdmin(SearchableModelAdmin):
    list_display = (
        'leave_id', 'worker', 'leave_type', 'start_date', 'end_date',
        'is_half_day', 'half_day_slot', 'hours', 'status', 'approved_by', 'action_buttons', 'created_at'
    )
    list_filter = (
        ('status', ChoicesDropdownFilter),
        ('leave_type', ChoicesDropdownFilter),
        'is_half_day',
        'start_date',
    )
    search_fields = (
        'worker__username', 'worker__first_name', 'worker__last_name',
        'worker__employee_no', 'reason', 'admin_notes'
    )
    autocomplete_fields = ('worker', 'approved_by')
    actions = ['approve_selected_leaves', 'reject_selected_leaves']

    def action_buttons(self, obj):
        if obj.status == 'pending':
            approve_url = reverse(
                'admin:workerleave-quick-approve', args=[obj.pk])
            reject_url = reverse(
                'admin:workerleave-quick-reject', args=[obj.pk])
            return format_html(
                '<a class="button" style="background:#10B981; color:#ffffff; font-weight:600; padding:4px 10px; border-radius:4px; text-decoration:none; margin-right:6px; display:inline-block;" href="{}">&#10003; Approve</a>'
                '<a class="button" style="background:#EF4444; color:#ffffff; font-weight:600; padding:4px 10px; border-radius:4px; text-decoration:none; display:inline-block;" href="{}">&#10005; Reject</a>',
                approve_url, reject_url
            )
        elif obj.status == 'rejected':
            approve_url = reverse(
                'admin:workerleave-quick-approve', args=[obj.pk])
            return format_html(
                '<a class="button" style="background:#059669; color:#ffffff; font-weight:600; padding:3px 8px; border-radius:4px; text-decoration:none; display:inline-block;" href="{}">Re-Approve</a>',
                approve_url
            )
        elif obj.status == 'approved':
            return mark_safe('<span style="color:#059669; font-weight:600; font-size:12px;">&#10003; Approved</span>')
        elif obj.status == 'cancelled':
            return mark_safe('<span style="color:#64748B; font-weight:500; font-size:12px;">Cancelled</span>')
        return mark_safe('<span style="opacity:0.65; font-size:12px;">-</span>')
    action_buttons.short_description = "Approve / Reject Action"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<int:leave_id>/quick-approve/', self.admin_site.admin_view(
                self.quick_approve_view), name='workerleave-quick-approve'),
            path('<int:leave_id>/quick-reject/', self.admin_site.admin_view(
                self.quick_reject_view), name='workerleave-quick-reject'),
        ]
        return custom_urls + urls

    def quick_approve_view(self, request, leave_id):
        leave = WorkerLeave.objects.filter(pk=leave_id).first()
        if not leave:
            self.message_user(request, "Leave request not found.", level='ERROR')
            return redirect('admin:maintenance_workerleave_changelist')

        conflicting = WorkerLeave.objects.filter(
            worker=leave.worker,
            status='approved',
            start_date__lte=leave.end_date,
            end_date__gte=leave.start_date,
        ).exclude(pk=leave.pk)

        has_conflict = False
        for c in conflicting:
            if not leave.is_half_day or not c.is_half_day:
                has_conflict = True
                break
            elif not leave.half_day_slot or not c.half_day_slot or leave.half_day_slot == c.half_day_slot:
                has_conflict = True
                break

        if has_conflict:
            self.message_user(
                request,
                f"Cannot approve leave #{leave_id}: An already approved leave overlaps with this period ({leave.start_date} to {leave.end_date}).",
                level='ERROR'
            )
            return redirect('admin:maintenance_workerleave_changelist')

        leave.status = 'approved'
        leave.approved_by = request.user
        leave.save()
        self.message_user(request, f"Leave #{leave_id} approved successfully.")
        return redirect('admin:maintenance_workerleave_changelist')

    def quick_reject_view(self, request, leave_id):
        WorkerLeave.objects.filter(pk=leave_id).update(
            status='rejected', approved_by=request.user)
        self.message_user(request, f"Leave #{leave_id} rejected.")
        return redirect('admin:maintenance_workerleave_changelist')

    def approve_selected_leaves(self, request, queryset):
        count = queryset.update(status='approved', approved_by=request.user)
        self.message_user(
            request, f"{count} leave request(s) approved successfully.")
    approve_selected_leaves.short_description = "Approve selected leave requests"

    def reject_selected_leaves(self, request, queryset):
        count = queryset.update(status='rejected', approved_by=request.user)
        self.message_user(request, f"{count} leave request(s) rejected.")
    reject_selected_leaves.short_description = "Reject selected leave requests"
