from django.http import JsonResponse
from django.urls import path
from django.contrib import admin
from .models import Priority, Status, WorkNature, NatureWorker, Ticket, Allocation, WorkLog, TicketHistory, StatusChangeRule

from unfold.admin import ModelAdmin


@admin.register(Priority)
class PriorityAdmin(ModelAdmin):
    list_display = ('priority_id', 'department', 'priority_name', 'level')
    list_filter = ('department',)
    search_fields = ('priority_name',)


@admin.register(Status)
class StatusAdmin(ModelAdmin):
    list_display = ('order', 'status_name')
    search_fields = ('status_name',)


@admin.register(WorkNature)
class WorkNatureAdmin(ModelAdmin):
    list_display = ('nature_id', 'nature_name', 'department',
                    'sub_department', 'default_priority', 'media_required', 'active')
    list_filter = ('media_required', 'active', 'sub_department')
    search_fields = ('nature_name',)

    def department(self, obj):
        return obj.sub_department.department.department_name
    department.short_description = 'Department'


@admin.register(NatureWorker)
class NatureWorkerAdmin(ModelAdmin):
    list_display = ('nature_worker_id', 'nature', 'worker')
    list_filter = ('nature', 'worker')
    search_fields = ('nature__nature_name', 'worker__username')


@admin.register(Ticket)
class TicketAdmin(ModelAdmin):
    list_display = ('ticket_id', 'work_order_no', 'store', 'department',
                    'nature', 'priority', 'status', 'created_by', 'created_date')
    list_filter = ('priority', 'status', 'store', 'department', 'created_date')
    search_fields = ('work_order_no', 'title',
                     'description', 'created_by__username')

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Allocation)
class AllocationAdmin(ModelAdmin):
    list_display = ('allocation_id', 'ticket', 'worker',
                    'assigned_by', 'assigned_date', 'planned_hours')
    list_filter = ('assigned_date', 'worker')
    search_fields = ('ticket__work_order_no',
                     'worker__username', 'assigned_by__username')


@admin.register(WorkLog)
class WorkLogAdmin(ModelAdmin):
    list_display = ('worklog_id', 'ticket', 'worker', 'work_date',
                    'hours', 'hourly_rate', 'labour_amount')
    list_filter = ('work_date', 'worker')
    search_fields = ('ticket__work_order_no', 'worker__username')


@admin.register(TicketHistory)
class TicketHistoryAdmin(ModelAdmin):
    list_display = ('history_id', 'ticket', 'status',
                    'changed_by', 'changed_date', 'remarks')
    list_filter = ('changed_date', 'status')
    search_fields = ('ticket__work_order_no', 'changed_by__username')


@admin.register(StatusChangeRule)
class StatusChangeRuleAdmin(ModelAdmin):
    list_display = ("from_status", "to_status", "mode", "type", "path", "message", "is_active",
                    )

    list_filter = ("mode", "type", "is_active", "from_status", "to_status",
                   )

    search_fields = ("path", "value", "message", "from_status__name", "to_status__name",
                     )

    list_editable = ("is_active",
                     )

    ordering = ("from_status", "to_status",
                )
