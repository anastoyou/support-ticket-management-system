from django.core.exceptions import ValidationError
from django.dispatch import receiver
from django.db.models.signals import m2m_changed
from django.db import models, transaction
from django.conf import settings
from datetime import timedelta


class ExpenseType(models.Model):
    expense_type_id = models.AutoField(primary_key=True)
    department = models.ForeignKey(
        'stores.Department', on_delete=models.CASCADE, related_name='expense_types')
    expense_name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='sub_types')
    required = models.BooleanField(default=True)
    approve_required = models.BooleanField(default=False)
    default_fill = models.BooleanField(
        default=False,
        verbose_name='Default fill',
        help_text='When enabled, automatically fills the expense remark with the predefined prefix/template.'
    )
    default_fill_template = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='Default fill prefix / template',
        help_text='Optional predefined prefix or template using {LOCATION} (e.g. "Bus ticket for {LOCATION}" or "{LOCATION} Taxi fair").'
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['department', 'expense_name'], name='unique_department_expense_name')
        ]
        permissions = [
            ('view_expense_name', 'Can view expense name'),
            ('change_expense_name', 'Can change expense name'),
            ('view_parent', 'Can view parent'),
            ('change_parent', 'Can change parent'),
        ]

    def __str__(self):
        return f"{self.parent.expense_name} > {self.expense_name}" if self.parent else self.expense_name


class EmployeeRate(models.Model):
    rate_id = models.AutoField(primary_key=True)
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='rates')
    hourly_rate = models.DecimalField(decimal_places=2, max_digits=10)
    effective_from = models.DateField()
    effective_to = models.DateField(blank=True, null=True)

    class Meta:
        permissions = [
            ('view_worker', 'Can view worker'),
            ('change_worker', 'Can change worker'),
            ('view_hourly_rate', 'Can view hourly rate'),
            ('change_hourly_rate', 'Can change hourly rate'),
            ('view_effective_from', 'Can view effective from'),
            ('change_effective_from', 'Can change effective from'),
            ('view_effective_to', 'Can view effective to'),
            ('change_effective_to', 'Can change effective to'),
        ]

    def __str__(self):
        return f"{self.worker.username} - {self.hourly_rate}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if is_new:
            with transaction.atomic():
                previous_rate = EmployeeRate.objects.filter(
                    worker=self.worker,
                    effective_from__lt=self.effective_from
                ).order_by('-effective_from').first()

                if previous_rate and (previous_rate.effective_to is None or previous_rate.effective_to >= self.effective_from):
                    previous_rate.effective_to = self.effective_from - \
                        timedelta(days=1)
                    previous_rate.save(update_fields=['effective_to'])

                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)


class WorkerClaim(models.Model):
    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('In Review', 'In Review'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
        ('Rework', 'Rework'),
        ('Paid', 'Paid'),
    ]

    claim_id = models.AutoField(primary_key=True)
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='worker_claims')
    ticket = models.ForeignKey(
        'maintenance.Ticket', on_delete=models.CASCADE, null=True, blank=True, related_name='worker_claims')
    claim_date = models.DateTimeField(auto_now_add=True)
    total_claimed_amount = models.DecimalField(
        decimal_places=3, max_digits=12, default=0)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='Draft')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_claims')
    reject_reason = models.TextField(blank=True, null=True)
    submitted_at = models.DateTimeField(blank=True, null=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_claims')
    period_from = models.DateField(blank=True, null=True)
    period_to = models.DateField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        permissions = [
            ('can_view_bundles', 'Can view bundles'),
            ('create_bundle', 'Can create claim bundle'),
            ('edit_bundle', 'Can edit claim bundle'),
            ('submit_bundle', 'Can submit claim bundle for approval'),
            ('delete_bundle', 'Can delete claim bundle'),
            ('view_bundle_report', 'Can view bundle report'),
            ('create_workerclaim', 'Can create worker claim'),
            ('edit_workerclaim', 'Can edit worker claim'),
            ('submit_workerclaim', 'Can submit worker claim for approval'),
            ('approve_workerclaim', 'Can approve worker claim'),
            ('reject_workerclaim', 'Can reject worker claim'),
            ('view_worker', 'Can view worker'),
            ('change_worker', 'Can change worker'),
            ('view_total_claimed_amount', 'Can view total claimed amount'),
            ('change_total_claimed_amount', 'Can change total claimed amount'),
            ('view_status', 'Can view status'),
            ('change_status', 'Can change status'),
            ('view_period_from', 'Can view period from'),
            ('change_period_from', 'Can change period from'),
            ('view_period_to', 'Can view period to'),
            ('change_period_to', 'Can change period to'),
            ('view_remarks', 'Can view remarks'),
            ('change_remarks', 'Can change remarks'),
        ]

    def __str__(self):
        ticket_str = f"Ticket {self.ticket.work_order_no}" if self.ticket else "Multi-Ticket Bundle"
        return f"Bundle {self.claim_id} ({self.worker.username}) - {ticket_str}"


class Expense(models.Model):
    expense_id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey(
        'maintenance.Ticket', on_delete=models.CASCADE, null=True, blank=True, related_name='expenses')
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='expenses')
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_expenses')
    expense_type = models.ForeignKey(
        ExpenseType, on_delete=models.PROTECT, related_name='expenses')
    amount = models.DecimalField(decimal_places=3, max_digits=10)
    expense_date = models.DateField()
    remarks = models.TextField(blank=True, null=True)
    # receipt = models.ForeignKey(
    #     'common.Media', on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='approved_expenses')
    responsible_store = models.ForeignKey(
        'stores.Store', on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    is_claimed = models.BooleanField(default=False)
    claim = models.ForeignKey(
        WorkerClaim, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='paid_expenses')

    class Meta:
        permissions = [
            ('can_view_expenses', 'Can view expenses'),
            ('approve_expense', 'Can approve expense'),
            ('reject_expense', 'Can reject expense'),
            ('view_ticket', 'Can view ticket'),
            ('change_ticket', 'Can change ticket'),
            ('view_worker', 'Can view worker'),
            ('change_worker', 'Can change worker'),
            ('view_expense_type', 'Can view expense type'),
            ('change_expense_type', 'Can change expense type'),
            ('view_amount', 'Can view amount'),
            ('change_amount', 'Can change amount'),
            ('view_expense_date', 'Can view expense date'),
            ('change_expense_date', 'Can change expense date'),
            ('view_remarks', 'Can view remarks'),
            ('change_remarks', 'Can change remarks'),
            ('view_receipt', 'Can view receipt'),
            ('change_receipt', 'Can change receipt'),
            ('view_approved', 'Can view approved'),
            ('change_approved', 'Can change approved'),
            ('view_approved_by', 'Can view approved by'),
            ('change_approved_by', 'Can change approved by'),
            ('view_responsible_store', 'Can view responsible store'),
            ('change_responsible_store', 'Can change responsible store'),
        ]

    def __str__(self):
        return f"Expense {self.expense_id} - {self.amount}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)


class Reconciliation(models.Model):
    reconciliation_id = models.AutoField(primary_key=True)
    ticket = models.OneToOneField(
        'maintenance.Ticket', on_delete=models.CASCADE, related_name='reconciliation')
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='verifications')
    labour_total = models.DecimalField(decimal_places=3, max_digits=12)
    expense_total = models.DecimalField(decimal_places=3, max_digits=12)
    material_total = models.DecimalField(decimal_places=3, max_digits=12)
    grand_total = models.DecimalField(decimal_places=3, max_digits=12)
    claimed_labour_total = models.DecimalField(
        decimal_places=3, max_digits=12, default=0)
    claimed_expense_total = models.DecimalField(
        decimal_places=3, max_digits=12, default=0)
    total_claimed_amount = models.DecimalField(
        decimal_places=3, max_digits=12, default=0)
    net_payable_amount = models.DecimalField(
        decimal_places=3, max_digits=12, default=0)
    remarks = models.TextField(blank=True, null=True)
    verified_date = models.DateTimeField(auto_now_add=True)
    completed = models.BooleanField(default=False)

    class Meta:
        permissions = [
            ('view_ticket', 'Can view ticket'),
            ('change_ticket', 'Can change ticket'),
            ('view_verified_by', 'Can view verified by'),
            ('change_verified_by', 'Can change verified by'),
            ('view_labour_total', 'Can view labour total'),
            ('change_labour_total', 'Can change labour total'),
            ('view_expense_total', 'Can view expense total'),
            ('change_expense_total', 'Can change expense total'),
            ('view_material_total', 'Can view material total'),
            ('change_material_total', 'Can change material total'),
            ('view_grand_total', 'Can view grand total'),
            ('change_grand_total', 'Can change grand total'),
            ('view_remarks', 'Can view remarks'),
            ('change_remarks', 'Can change remarks'),
            ('view_completed', 'Can view completed'),
            ('change_completed', 'Can change completed'),
        ]

    def __str__(self):
        return f"Reconciliation {self.reconciliation_id} - Ticket {self.ticket.work_order_no}"


class LedgerBatch(models.Model):
    batch_id = models.AutoField(primary_key=True)
    batch_name = models.CharField(max_length=255, unique=True)
    sub_departments = models.ManyToManyField(
        'stores.SubDepartment',
        related_name='ledger_batches',
        blank=True
    )
    description = models.TextField(blank=True, null=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ledger Batch'
        verbose_name_plural = 'Ledger Batches'
        ordering = ['batch_name']

    def __str__(self):
        return self.batch_name


class LedgerGroup(models.Model):
    ledger_group_id = models.AutoField(primary_key=True)
    group_name = models.CharField(max_length=150, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_ledger_groups')
    total_amount = models.DecimalField(
        decimal_places=3, max_digits=14, default=0)
    remarks = models.TextField(blank=True, null=True)
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_ledger_groups')
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='paid_ledger_groups')
    payment_method = models.CharField(
        max_length=50, blank=True, null=True, default='Cash')
    payment_reference = models.CharField(max_length=100, blank=True, null=True)
    payment_remarks = models.TextField(blank=True, null=True)
    recipient_name = models.CharField(max_length=150, blank=True, null=True)

    class Meta:
        permissions = [
            ('pay_ledger_group', 'Can pay ledger group'),
            ('settle_cash_ledger', 'Can settle cash for ledger group'),
            ('view_ledger_report', 'Can view ledger report'),
            ('worker_wise_settlement', 'Can view worker-wise settlement'),
            ('location_wise_expenses', 'Can view location-wise expenses'),
        ]

    def __str__(self):
        return f"Ledger Group #{self.ledger_group_id} - {self.group_name}"


class Ledger(models.Model):
    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('In Review', 'In Review'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
        ('Rework', 'Rework'),
        ('Paid', 'Paid'),
    ]

    ledger_id = models.AutoField(primary_key=True)
    ledger_group = models.ForeignKey(
        LedgerGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='ledgers')
    ledger_batch = models.ForeignKey(
        LedgerBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name='ledgers')
    store = models.ForeignKey(
        'stores.Store', on_delete=models.SET_NULL, null=True, blank=True, related_name='ledgers')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_ledgers')
    created_at = models.DateTimeField(auto_now_add=True)
    bundles = models.ManyToManyField(
        WorkerClaim, related_name='ledgers', blank=True)
    expenses = models.ManyToManyField(
        'finance.Expense', related_name='ledgers', blank=True)
    total_amount = models.DecimalField(
        decimal_places=3, max_digits=14, default=0)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='Draft')
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        permissions = [
            ('can_view_ledger', 'Can view ledger'),
            ('can_view_ledgers', 'Can view ledgers'),
            ('approve_ledger', 'Can approve ledger'),
            ('reject_ledger', 'Can reject ledger'),
            ('pay_ledger', 'Can pay ledger'),
            ('super_permission', 'Super permission to modify approved ledgers'),
        ]

    def __str__(self):
        return f"Ledger #{self.ledger_id} - Total: {self.total_amount} ({self.status})"


class ApprovalWorkflow(models.Model):
    ENTITY_CHOICES = [
        ('Bundle', 'Bundle (WorkerClaim)'),
        ('Ledger', 'Ledger'),
        ('Expense', 'Expense'),
    ]

    workflow_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=30, choices=ENTITY_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['entity_type'],
                condition=models.Q(is_active=True),
                name='unique_active_workflow_per_entity'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.entity_type})"


class ApprovalStep(models.Model):
    step_id = models.AutoField(primary_key=True)
    workflow = models.ForeignKey(
        ApprovalWorkflow, on_delete=models.CASCADE, related_name='steps')
    step_order = models.PositiveIntegerField()
    step_name = models.CharField(max_length=100)
    assigned_role = models.ForeignKey(
        'accounts.Role', on_delete=models.SET_NULL, null=True, blank=True, related_name='approval_steps')
    assigned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='approval_steps')
    is_final_step = models.BooleanField(default=False)

    class Meta:
        ordering = ['step_order']
        constraints = [
            models.UniqueConstraint(
                fields=['workflow', 'step_order'],
                name='unique_step_order_per_workflow'
            )
        ]

    def __str__(self):
        role_label = self.assigned_role.role_name if self.assigned_role else "User Assigned"
        return f"{self.workflow.name} - Step {self.step_order}: {self.step_name} ({role_label})"


class ApprovalInstance(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
        ('Rework', 'Rework'),
    ]

    instance_id = models.AutoField(primary_key=True)
    step = models.ForeignKey(
        ApprovalStep, on_delete=models.PROTECT, related_name='approval_instances')
    claim = models.ForeignKey(
        WorkerClaim, on_delete=models.CASCADE, null=True, blank=True, related_name='approval_instances')
    ledger = models.ForeignKey(
        Ledger, on_delete=models.CASCADE, null=True, blank=True, related_name='approval_instances')
    expense = models.ForeignKey(
        'finance.Expense', on_delete=models.CASCADE, null=True, blank=True, related_name='approval_instances')
    action_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approvals_actioned')
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='Pending')
    comments = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    actioned_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        target = f"Bundle {self.claim_id}" if self.claim else (
            f"Ledger #{self.ledger_id}" if self.ledger else f"Expense #{self.expense_id}")
        return f"Approval for {target} at Step '{self.step.step_name}': {self.status}"


class AuditEvent(models.Model):
    event_id = models.BigAutoField(primary_key=True)
    entity_name = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=50)
    action = models.CharField(max_length=50)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_events')
    timestamp = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-timestamp']
        permissions = [
            ('can_view_audit', 'Can view audit'),
        ]

    def __str__(self):
        actor_name = self.actor.username if self.actor else "System"
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {actor_name} -> {self.action} on {self.entity_name}#{self.entity_id}"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError(
                "AuditEvent records are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError(
            "AuditEvent records are immutable and cannot be deleted.")


class Payment(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('Cash', 'Cash'),
        ('Bank Transfer', 'Bank Transfer'),
        ('Check', 'Check'),
        ('Digital Wallet', 'Digital Wallet'),
        ('Other', 'Other'),
    ]

    payment_id = models.AutoField(primary_key=True)
    claim = models.ForeignKey(
        WorkerClaim, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    ledger = models.ForeignKey(
        Ledger, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    expense = models.ForeignKey(
        Expense, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    amount_paid = models.DecimalField(decimal_places=3, max_digits=12)
    payment_method = models.CharField(
        max_length=30, choices=PAYMENT_METHOD_CHOICES, default='Cash')
    transaction_reference = models.CharField(
        max_length=100, blank=True, null=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_payments')
    paid_at = models.DateTimeField(auto_now_add=True)
    recipient_name = models.CharField(max_length=150, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        permissions = [
            ('single_payment_process', 'Can process single bundle payment'),
            ('bulk_payment_process', 'Can process bulk ledger group payment'),
            ('bulk_payment_processs', 'Can process bulk ledger group payment (alias)'),
        ]

    def __str__(self):
        return f"Payment #{self.payment_id} - Amount: {self.amount_paid} ({self.payment_method})"


@receiver(m2m_changed, sender=LedgerBatch.sub_departments.through)
def prevent_duplicate_subdepartments_across_batches(sender, instance, action, pk_set, **kwargs):
    if kwargs.get('raw', False):
        return
    if action == 'pre_add' and pk_set:
        from apps.stores.models import SubDepartment
        for subdept_id in pk_set:
            existing_batch = LedgerBatch.objects.exclude(
                pk=instance.pk).filter(sub_departments__pk=subdept_id).first()
            if existing_batch:
                subdept = SubDepartment.objects.filter(pk=subdept_id).first()
                subdept_name = subdept.sub_department_name if subdept else f"ID #{subdept_id}"
                raise ValidationError(
                    f"Sub-department '{subdept_name}' is already assigned to Ledger Batch '{existing_batch.batch_name}'. A sub-department cannot belong to multiple Ledger Batches."
                )
