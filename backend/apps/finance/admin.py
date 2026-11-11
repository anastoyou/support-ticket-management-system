from django.core.exceptions import ValidationError
from django import forms
from django.contrib import admin
from guardian.admin import GuardedModelAdmin
from .models import (
    ExpenseType, EmployeeRate, Expense, Reconciliation, WorkerClaim,
    LedgerBatch, LedgerGroup, Ledger, ApprovalWorkflow, ApprovalStep,
    ApprovalInstance, AuditEvent, Payment
)

from unfold.admin import ModelAdmin


@admin.register(ExpenseType)
class ExpenseTypeAdmin(ModelAdmin):
    list_display = ('expense_type_id', 'department',
                    'expense_name', 'parent', 'required', 'approve_required')
    list_filter = ('department', 'required', 'parent')
    search_fields = ('expense_name',)


@admin.register(EmployeeRate)
class EmployeeRateAdmin(ModelAdmin):
    list_display = ('rate_id', 'worker', 'hourly_rate',
                    'effective_from', 'effective_to')
    list_filter = ('effective_from', 'worker')
    search_fields = ('worker__username',)


@admin.register(WorkerClaim)
class WorkerClaimAdmin(GuardedModelAdmin):
    list_display = ('claim_id', 'worker', 'ticket', 'total_claimed_amount',
                    'status', 'claim_date', 'submitted_at', 'approved_by')
    list_filter = ('status', 'claim_date', 'period_from', 'period_to')
    search_fields = ('ticket__work_order_no', 'worker__username', 'claim_id')
    raw_id_fields = ('worker', 'ticket', 'approved_by', 'submitted_by')


@admin.register(Expense)
class ExpenseAdmin(GuardedModelAdmin):
    list_display = ('expense_id', 'ticket', 'worker', 'added_by', 'expense_type', 'amount',
                    'responsible_store', 'expense_date', 'approved', 'is_claimed', 'claim')
    list_filter = ('approved', 'is_claimed', 'expense_date',
                   'expense_type', 'responsible_store')
    search_fields = ('ticket__work_order_no', 'worker__username', 'expense_id')
    raw_id_fields = ('ticket', 'worker', 'added_by',
                     'claim', 'responsible_store')


@admin.register(Reconciliation)
class ReconciliationAdmin(ModelAdmin):
    list_display = ('reconciliation_id', 'ticket', 'verified_by', 'labour_total',
                    'expense_total', 'material_total', 'grand_total',
                    'net_payable_amount', 'verified_date', 'completed')
    list_filter = ('completed', 'verified_date')
    search_fields = ('ticket__work_order_no', 'verified_by__username')


class LedgerBatchAdminForm(forms.ModelForm):
    class Meta:
        model = LedgerBatch
        fields = '__all__'

    def clean_sub_departments(self):
        sub_departments = self.cleaned_data.get('sub_departments')
        instance = self.instance
        instance_pk = instance.pk if instance else None

        if sub_departments:
            for subdept in sub_departments:
                existing_batch = LedgerBatch.objects.exclude(
                    pk=instance_pk).filter(sub_departments=subdept).first()
                if existing_batch:
                    raise forms.ValidationError(
                        f"Sub-department '{subdept.sub_department_name}' is already assigned to Ledger Batch '{existing_batch.batch_name}'. A sub-department cannot belong to multiple Ledger Batches."
                    )
        return sub_departments


@admin.register(LedgerBatch)
class LedgerBatchAdmin(ModelAdmin):
    form = LedgerBatchAdminForm
    list_display = ('batch_id', 'batch_name',
                    'display_sub_departments', 'active', 'created_at')
    list_filter = ('active', 'sub_departments', 'created_at')
    search_fields = ('batch_name', 'description')
    filter_horizontal = ('sub_departments',)

    def display_sub_departments(self, obj):
        names = [sd.sub_department_name for sd in obj.sub_departments.all()]
        return ", ".join(names) if names else "-"
    display_sub_departments.short_description = 'Sub Departments'


@admin.register(LedgerGroup)
class LedgerGroupAdmin(ModelAdmin):
    list_display = ('ledger_group_id', 'group_name',
                    'total_amount', 'created_by', 'created_at')
    search_fields = ('group_name',)


@admin.register(Ledger)
class LedgerAdmin(GuardedModelAdmin):
    list_display = ('ledger_id', 'ledger_group', 'total_amount',
                    'status', 'created_by', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('ledger_id', 'ledger_group__group_name',
                     'created_by__username')
    filter_horizontal = ('bundles', 'expenses')


class ApprovalStepForm(forms.ModelForm):
    class Meta:
        model = ApprovalStep
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        assigned_role = cleaned_data.get('assigned_role')
        assigned_users = cleaned_data.get('assigned_users')

        has_role = bool(assigned_role)
        has_users = bool(assigned_users and (assigned_users.exists() if hasattr(
            assigned_users, 'exists') else len(assigned_users) > 0))

        if has_role and has_users:
            raise ValidationError(
                "Please configure EITHER an Assigned Role (Role-wise) OR Assigned Users (User-wise), but not both to avoid ambiguity."
            )
        if not has_role and not has_users:
            raise ValidationError(
                "Please specify an Assigned Role OR select at least one Assigned User for this approval step."
            )
        return cleaned_data


class ApprovalStepInline(admin.TabularInline):
    model = ApprovalStep
    form = ApprovalStepForm
    extra = 1
    ordering = ('step_order',)
    filter_horizontal = ('assigned_users',)


@admin.register(ApprovalWorkflow)
class ApprovalWorkflowAdmin(ModelAdmin):
    list_display = ('workflow_id', 'name', 'entity_type',
                    'is_active', 'created_at')
    list_filter = ('entity_type', 'is_active')
    inlines = [ApprovalStepInline]


@admin.register(ApprovalStep)
class ApprovalStepAdmin(ModelAdmin):
    form = ApprovalStepForm
    list_display = ('step_id', 'workflow', 'step_order', 'step_name',
                    'get_assignment_type', 'get_assigned_users', 'assigned_role', 'is_final_step')
    list_filter = ('workflow', 'assigned_role')
    filter_horizontal = ('assigned_users',)
    ordering = ('workflow', 'step_order')

    def get_assignment_type(self, obj):
        if obj.assigned_users.exists():
            return "User-Wise"
        elif obj.assigned_role:
            return "Role-Wise"
        return "Unassigned"
    get_assignment_type.short_description = "Assignment Mode"

    def get_assigned_users(self, obj):
        users = obj.assigned_users.all()
        return ", ".join([u.username for u in users]) if users.exists() else "None (Role-based)"
    get_assigned_users.short_description = "Assigned Users (User-Wise)"


@admin.register(ApprovalInstance)
class ApprovalInstanceAdmin(ModelAdmin):
    list_display = ('instance_id', 'step', 'claim', 'ledger',
                    'status', 'action_by', 'actioned_at')
    list_filter = ('status', 'created_at')
    search_fields = ('claim__claim_id', 'ledger__ledger_id',
                     'action_by__username')


@admin.register(AuditEvent)
class AuditEventAdmin(ModelAdmin):
    list_display = ('event_id', 'entity_name', 'entity_id',
                    'action', 'actor', 'timestamp', 'ip_address')
    list_filter = ('entity_name', 'action', 'timestamp')
    search_fields = ('entity_id', 'actor__username', 'action')
    readonly_fields = [f.name for f in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(ModelAdmin):
    list_display = ('payment_id', 'amount_paid', 'payment_method',
                    'transaction_reference', 'claim', 'ledger', 'expense', 'paid_by', 'paid_at')
    list_filter = ('payment_method', 'paid_at')
    search_fields = ('transaction_reference', 'claim__claim_id',
                     'ledger__ledger_id', 'paid_by__username')
