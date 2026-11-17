from django.core.exceptions import ValidationError
from django import forms
from django.contrib import admin
from guardian.admin import GuardedModelAdmin
from .models import (
    ExpenseType, EmployeeRate, Expense, Reconciliation, WorkerClaim,
    LedgerBatch, LedgerGroup, Ledger, ApprovalWorkflow, ApprovalStep,
    ApprovalInstance, AuditEvent, Payment
)

from unfold.admin import ModelAdmin as UnfoldModelAdmin
from unfold.contrib.filters.admin import AutocompleteSelectFilter, ChoicesDropdownFilter
from apps.common.admin_mixins import (
    SearchableDropdownMixin,
    SearchableModelAdmin,
    SearchableTabularInline,
)


@admin.register(ExpenseType)
class ExpenseTypeAdmin(SearchableModelAdmin):
    list_display = ('expense_type_id', 'department',
                    'expense_name', 'parent', 'required', 'approve_required')
    list_filter = (('department', AutocompleteSelectFilter), 'required', ('parent', AutocompleteSelectFilter))
    search_fields = ('expense_name',)
    autocomplete_fields = ('department', 'parent')


@admin.register(EmployeeRate)
class EmployeeRateAdmin(SearchableModelAdmin):
    list_display = ('rate_id', 'worker', 'hourly_rate',
                    'effective_from', 'effective_to')
    list_filter = ('effective_from', ('worker', AutocompleteSelectFilter))
    search_fields = ('worker__username',)
    autocomplete_fields = ('worker',)


@admin.register(WorkerClaim)
class WorkerClaimAdmin(SearchableDropdownMixin, UnfoldModelAdmin, GuardedModelAdmin):
    list_display = ('claim_id', 'worker', 'ticket', 'total_claimed_amount',
                    'status', 'claim_date', 'submitted_at', 'approved_by')
    list_filter = (('status', ChoicesDropdownFilter), 'claim_date', 'period_from', 'period_to')
    list_filter_submit = True
    search_fields = ('ticket__work_order_no', 'worker__username', 'claim_id')
    autocomplete_fields = ('worker', 'ticket', 'approved_by', 'submitted_by')


@admin.register(Expense)
class ExpenseAdmin(SearchableDropdownMixin, UnfoldModelAdmin, GuardedModelAdmin):
    list_display = ('expense_id', 'ticket', 'worker', 'added_by', 'expense_type', 'amount',
                    'responsible_store', 'expense_date', 'approved', 'is_claimed', 'claim')
    list_filter = ('approved', 'is_claimed', 'expense_date',
                   ('expense_type', AutocompleteSelectFilter), ('responsible_store', AutocompleteSelectFilter))
    list_filter_submit = True
    search_fields = ('ticket__work_order_no', 'worker__username', 'expense_id')
    autocomplete_fields = (
        'ticket', 'worker', 'added_by', 'expense_type',
        'approved_by', 'claim', 'responsible_store', 'paid_by'
    )


@admin.register(Reconciliation)
class ReconciliationAdmin(SearchableModelAdmin):
    list_display = ('reconciliation_id', 'ticket', 'verified_by', 'labour_total',
                    'expense_total', 'material_total', 'grand_total',
                    'net_payable_amount', 'verified_date', 'completed')
    list_filter = ('completed', 'verified_date')
    search_fields = ('ticket__work_order_no', 'verified_by__username')
    autocomplete_fields = ('ticket', 'verified_by')


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
class LedgerBatchAdmin(SearchableModelAdmin):
    form = LedgerBatchAdminForm
    list_display = ('batch_id', 'batch_name',
                    'display_sub_departments', 'active', 'created_at')
    list_filter = ('active', ('sub_departments', AutocompleteSelectFilter), 'created_at')
    search_fields = ('batch_name', 'description')
    filter_horizontal = ('sub_departments',)

    def display_sub_departments(self, obj):
        names = [sd.sub_department_name for sd in obj.sub_departments.all()]
        return ", ".join(names) if names else "-"
    display_sub_departments.short_description = 'Sub Departments'


@admin.register(LedgerGroup)
class LedgerGroupAdmin(SearchableModelAdmin):
    list_display = ('ledger_group_id', 'group_name',
                    'total_amount', 'created_by', 'created_at')
    search_fields = ('group_name',)
    autocomplete_fields = ('created_by', 'completed_by', 'paid_by')


@admin.register(Ledger)
class LedgerAdmin(SearchableDropdownMixin, UnfoldModelAdmin, GuardedModelAdmin):
    list_display = ('ledger_id', 'ledger_group', 'total_amount',
                    'status', 'created_by', 'created_at')
    list_filter = (('status', ChoicesDropdownFilter), 'created_at')
    list_filter_submit = True
    search_fields = ('ledger_id', 'ledger_group__group_name',
                     'created_by__username')
    autocomplete_fields = ('ledger_group', 'ledger_batch', 'store', 'created_by')
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


class ApprovalStepInline(SearchableTabularInline):
    model = ApprovalStep
    form = ApprovalStepForm
    extra = 1
    ordering = ('step_order',)
    autocomplete_fields = ('assigned_role',)
    filter_horizontal = ('assigned_users',)


@admin.register(ApprovalWorkflow)
class ApprovalWorkflowAdmin(SearchableModelAdmin):
    list_display = ('workflow_id', 'name', 'entity_type',
                    'is_active', 'created_at')
    list_filter = (('entity_type', ChoicesDropdownFilter), 'is_active')
    search_fields = ('name', 'entity_type')
    inlines = [ApprovalStepInline]


@admin.register(ApprovalStep)
class ApprovalStepAdmin(SearchableModelAdmin):
    form = ApprovalStepForm
    list_display = ('step_id', 'workflow', 'step_order', 'step_name',
                    'get_assignment_type', 'get_assigned_users', 'assigned_role', 'is_final_step')
    list_filter = (('workflow', AutocompleteSelectFilter), ('assigned_role', AutocompleteSelectFilter))
    search_fields = ('step_name', 'workflow__name', 'assigned_role__role_name')
    autocomplete_fields = ('workflow', 'assigned_role')
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
class ApprovalInstanceAdmin(SearchableModelAdmin):
    list_display = ('instance_id', 'step', 'claim', 'ledger',
                    'status', 'action_by', 'actioned_at')
    list_filter = (('status', ChoicesDropdownFilter), 'created_at')
    search_fields = ('claim__claim_id', 'ledger__ledger_id',
                     'action_by__username')
    autocomplete_fields = ('step', 'claim', 'ledger', 'expense', 'action_by')


@admin.register(AuditEvent)
class AuditEventAdmin(SearchableModelAdmin):
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
class PaymentAdmin(SearchableModelAdmin):
    list_display = ('payment_id', 'amount_paid', 'payment_method',
                    'transaction_reference', 'claim', 'ledger', 'expense', 'paid_by', 'paid_at')
    list_filter = (('payment_method', ChoicesDropdownFilter), 'paid_at')
    search_fields = ('transaction_reference', 'claim__claim_id',
                     'ledger__ledger_id', 'paid_by__username')
    autocomplete_fields = ('claim', 'ledger', 'expense', 'paid_by')
