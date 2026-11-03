from django.db import models
from django.dispatch import receiver


class Priority(models.Model):
    priority_id = models.AutoField(primary_key=True)
    department = models.ForeignKey(
        'stores.Department', on_delete=models.CASCADE, related_name='priorities')
    priority_name = models.CharField(max_length=50)
    level = models.IntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['department', 'priority_name'], name='unique_department_priority_name')
        ]
        permissions = [
            ("view_priority_name", "Can view priority name"),
            ("change_priority_name", "Can change priority name"),
            ("view_level", "Can view level"),
            ("change_level", "Can change level")

        ]

    def __str__(self):
        return self.priority_name


class Status(models.Model):
    status_id = models.AutoField(primary_key=True)
    status_name = models.CharField(max_length=50)
    short_code = models.CharField(max_length=10, blank=True, null=True)
    active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order"]
        constraints = [
            models.UniqueConstraint(
                fields=["status_name"],
                name="unique_status_name"
            )
        ]

    def __str__(self):
        return f"{self.status_name} ({self.short_code})" if self.short_code else self.status_name


class StatusChangeRule(models.Model):
    TYPE_CHOICES = [
        ("field", "Field"),
        ("related", "Related"),
    ]

    MODE_CHOICES = [
        ("check", "Check"),
        ("delete", "Delete"),
        ("set", "Set"),
        ("warning", "Warning"),
    ]

    from_status = models.ForeignKey(
        "maintenance.Status",
        on_delete=models.CASCADE,
        related_name="from_rules",
    )

    to_status = models.ForeignKey(
        "maintenance.Status",
        on_delete=models.CASCADE,
        related_name="to_rules",
    )

    mode = models.CharField(
        max_length=10,
        choices=MODE_CHOICES,
        default="check",
        help_text=(
            "Check: validate before status change.\n"
            "Delete: remove related fields/records before status change.\n"
            "Set: set the field/relationship value to value before status change.\n"
            "Warning: warn if condition fails, but allow status change."
        ),
    )

    type = models.CharField(
        max_length=10,
        choices=TYPE_CHOICES,
        default="field",
    )

    path = models.CharField(
        max_length=255,
        help_text=(
            "Field/relationship path.\n"
            "Examples:\n"
            "store.name\n"
            "created_by.username\n"
            "attachments.file_name\n"
            "allocations.name"
        ),
    )

    value = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Expected value (used for check, set, and warning modes).",
    )

    message = models.TextField(
        blank=True,
        null=True,
        help_text=(
            "For Check/Warning mode: error/warning message displayed when validation fails.\n"
            "Example: 'Store must be assigned before closing.'\n\n"
            "For Delete mode: describe what will be deleted.\n"
            "Example: 'Delete all attachments and allocations.'"
        ),
    )

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "status_change_rule"

    def __str__(self):
        return f"{self.from_status} → {self.to_status}"


class WorkNature(models.Model):
    nature_id = models.AutoField(primary_key=True)
    nature_name = models.CharField(max_length=255)
    sub_department = models.ForeignKey(
        'stores.SubDepartment', on_delete=models.CASCADE, related_name='work_natures', default=1)
    default_priority = models.ForeignKey(
        Priority, on_delete=models.SET_NULL, null=True, blank=True, related_name='default_natures')
    media_required = models.BooleanField(default=True)
    active = models.BooleanField(default=True)

    class Meta:
        permissions = [
            ("view_nature_name", "Can view nature name"),
            ("change_nature_name", "Can change nature name"),
            ("view_sub_department", "Can view sub department"),
            ("change_sub_department", "Can change sub department"),
            ("view_default_priority", "Can view default priority"),
            ("change_default_priority", "Can change default priority"),
            ("view_active", "Can view active"),
            ("change_active", "Can change active"),
        ]

    def __str__(self):
        return self.nature_name

    def delete(self, *args, **kwargs):
        is_office_nature = self.nature_name.lower().strip() == 'office related' or (
            self.sub_department and self.sub_department.sub_department_name.lower().strip() == 'office'
        )
        if is_office_nature:
            from django.core.exceptions import ValidationError
            raise ValidationError(
                'System work nature "Office Related" cannot be deleted.')
        super().delete(*args, **kwargs)


class NatureWorker(models.Model):
    nature_worker_id = models.AutoField(primary_key=True)
    nature = models.ForeignKey(
        WorkNature, on_delete=models.CASCADE, related_name='nature_workers')
    worker = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='skilled_natures')

    class Meta:
        permissions = [
            ("view_nature", "Can view nature"),
            ("change_nature", "Can change nature"),
            ("view_worker", "Can view worker"),
            ("change_worker", "Can change worker"),
        ]

    def __str__(self):
        return f"{self.nature.nature_name} - {self.worker.username}"


class Ticket(models.Model):
    ticket_id = models.AutoField(primary_key=True)
    work_order_no = models.CharField(max_length=100, unique=True)
    store = models.ForeignKey(
        'stores.Store', on_delete=models.CASCADE, related_name='tickets')
    department = models.ForeignKey(
        'stores.Department', on_delete=models.CASCADE, related_name='tickets')
    nature = models.ForeignKey(
        WorkNature, on_delete=models.CASCADE, related_name='tickets')
    priority = models.ForeignKey(
        Priority, on_delete=models.PROTECT, related_name='tickets')
    status = models.ForeignKey(
        Status, on_delete=models.PROTECT, related_name='tickets')
    title = models.CharField(max_length=255)
    description = models.TextField()
    created_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.PROTECT, related_name='created_tickets')
    created_date = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey('accounts.CustomUser', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='approved_tickets')
    approved_date = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey('accounts.CustomUser', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='rejected_tickets')
    rejected_date = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(null=True, blank=True)
    closed_by = models.ForeignKey('accounts.CustomUser', on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name='closed_tickets')
    closed_date = models.DateTimeField(null=True, blank=True)
    location_approval = models.CharField(
        max_length=100, default='Pending', null=True, blank=True)
    location_approved_by = models.ForeignKey('accounts.CustomUser', on_delete=models.SET_NULL,
                                             null=True, blank=True, related_name='location_approved_tickets')
    location_approved_date = models.DateTimeField(null=True, blank=True)
    location_reject_reason = models.TextField(null=True, blank=True)
    device_info = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        permissions = [
            ("view_work_order_no", "Can view work order no"),
            ("change_work_order_no", "Can change work order no"),
            ("view_store", "Can view store"),
            ("change_store", "Can change store"),
            ("view_department", "Can view department"),
            ("change_department", "Can change department"),
            ("view_nature", "Can view nature"),
            ("change_nature", "Can change nature"),
            ("view_priority", "Can view priority"),
            ("change_priority", "Can change priority"),
            ("view_status", "Can view status"),
            ("change_status", "Can change status"),
            ("view_title", "Can view title"),
            ("change_title", "Can change title"),
            ("view_description", "Can view description"),
            ("change_description", "Can change description"),
            ("view_created_by", "Can view created by"),
            ("change_created_by", "Can change created by"),
            ("view_approved_by", "Can view approved by"),
            ("change_approved_by", "Can change approved by"),
            ("view_approved_date", "Can view approved date"),
            ("change_approved_date", "Can change approved date"),
            ("view_rejected_by", "Can view rejected by"),
            ("change_rejected_by", "Can change rejected by"),
            ("view_rejected_date", "Can view rejected date"),
            ("change_rejected_date", "Can change rejected date"),
            ("view_reject_reason", "Can view reject reason"),
            ("change_reject_reason", "Can change reject reason"),
            ("view_closed_by", "Can view closed by"),
            ("change_closed_by", "Can change closed by"),
            ("view_closed_date", "Can view closed date"),
            ("change_closed_date", "Can change closed date"),
            ("create_ticket", "Can create ticket"),
            ("approve_ticket", "Can approve ticket"),
            ("reject_ticket", "Can reject ticket"),
            ("complete_ticket", "Can complete ticket"),
            ("view_all_department_tickets", "Can view all department tickets"),
            ("create_ticket_all_departments",
             "Can create ticket under all departments"),


            ("can_view_open_ticket", "Can view open ticket"),
            ("can_view_reconciled_ticket", "Can view reconciled ticket"),
            ("can_view_in_progress_ticket", "Can view in progress ticket"),
            ("can_view_completed_ticket", "Can view completed ticket"),
            ("can_view_rejected_ticket", "Can view rejected ticket"),
            ("can_view_blocked_ticket", "Can view blocked ticket"),
            ("can_filter_worker_ticket", "Can filter worker ticket"),
            ("can_call_worker", "Can call worker"),
            ("can_call_store", "Can call store"),
            ("can_view_my_instruction", "Can view my instruction"),
            ("can_view_all_instruction", "Can view all instruction"),
            ("can_see_device_info", "Can see ticket device info"),
            ("can_view_expance_for_ticket",
             "Can view the all expance the having in a tickets with detaild view when ticket"),
            ("can_view_dashboard", "Can view dashboard"),
            ("can_view_tickets", "Can view tickets"),
        ]

    def __str__(self):
        return f"{self.work_order_no} - {self.title}"

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError(
            'Tickets cannot be deleted to preserve system audit log and tracking integrity.')

    def clean(self):
        super().clean()
        if self.pk:
            old_instance = Ticket.objects.get(pk=self.pk)
            if old_instance.status != self.status:
                from .utils import is_admin_or_office_admin
                user = getattr(self, '_changed_by', None)
                is_exempt = is_admin_or_office_admin(user)

                # Validation: Strictly prohibit moving to Location Approval if any allocated worker has not logged work hours (exempt Office Admin & Administrator)
                if self.status and self.status.status_name.strip().lower() == 'location approval' and not is_exempt:
                    from django.core.exceptions import ValidationError
                    allocations = self.allocations.all()
                    if not allocations.exists():
                        raise ValidationError(
                            "Cannot move ticket to Location Approval: No workers are allocated to this ticket. At least one worker must be assigned and have logged work hours.")
                    missing_workers = []
                    for alloc in allocations:
                        if not self.work_logs.filter(worker=alloc.worker).exists():
                            name = alloc.worker.full_name or alloc.worker.username or f"Worker #{alloc.worker.pk}"
                            missing_workers.append(name)
                    if missing_workers:
                        raise ValidationError(
                            f"Cannot move ticket to Location Approval: The following allocated worker(s) have not logged their work hours: {', '.join(missing_workers)}. All allocated workers must log their work hours before applying for location approval.")

                from .utils import get_value_from_path, compare_values, set_value_on_path
                from .models import StatusChangeRule

                # Apply set rules first
                set_rules = StatusChangeRule.objects.filter(
                    from_status=old_instance.status,
                    to_status=self.status,
                    is_active=True,
                    mode="set"
                )
                for rule in set_rules:
                    set_value_on_path(self, rule.path, rule.value)

                # Run check rules validation
                rules = StatusChangeRule.objects.filter(
                    from_status=old_instance.status,
                    to_status=self.status,
                    is_active=True,
                    mode="check"
                )
                from django.core.exceptions import ValidationError
                for rule in rules:
                    # Office Admin & Administrator can bypass work_logs check rule when moving to Location Approval
                    if is_exempt and rule.path == 'work_logs' and self.status and self.status.status_name.strip().lower() == 'location approval':
                        continue

                    val = get_value_from_path(self, rule.path)

                    if rule.value is None or rule.value == "":
                        if rule.type == "field":
                            if val is None or val == "":
                                raise ValidationError(rule.message)
                        elif rule.type == "related":
                            exists = False
                            if hasattr(val, 'exists') and callable(val.exists):
                                exists = val.exists()
                            elif isinstance(val, (list, tuple, set)):
                                exists = len(val) > 0
                            elif val:
                                exists = True
                            if not exists:
                                raise ValidationError(rule.message)
                    else:
                        if not compare_values(val, rule.value):
                            raise ValidationError(rule.message)

    def save(self, *args, **kwargs):
        if not self.work_order_no:
            from .utils import generate_work_order_no
            self.work_order_no = generate_work_order_no(self.store)
        if self.pk:
            old_instance = Ticket.objects.get(pk=self.pk)
            if old_instance.status != self.status:
                if getattr(self, '_bypass_status_rule', False):
                    super().save(*args, **kwargs)
                    return

                new_status = self.status
                self.status = old_instance.status

                from .utils import change_status
                change_status(
                    self,
                    new_status,
                    changed_by=getattr(self, '_changed_by', None),
                    remarks=getattr(self, '_remarks', None)
                )
                return
        super().save(*args, **kwargs)


class Allocation(models.Model):
    allocation_id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name='allocations')
    worker = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='allocations')
    assigned_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, related_name='assigned_allocations')
    assigned_date = models.DateTimeField(auto_now_add=True)
    planned_hours = models.DecimalField(max_digits=5, decimal_places=2)
    remarks = models.TextField(null=True, blank=True)
    voice_note = models.FileField(
        upload_to='allocation_voice_notes/', null=True, blank=True)

    class Meta:
        permissions = [
            ("view_ticket", "Can view ticket"),
            ("change_ticket", "Can change ticket"),
            ("view_worker", "Can view worker"),
            ("change_worker", "Can change worker"),
            ("view_assigned_by", "Can view assigned by"),
            ("change_assigned_by", "Can change assigned by"),
            ("view_planned_hours", "Can view planned hours"),
            ("change_planned_hours", "Can change planned hours"),
            ("view_remarks", "Can view remarks"),
            ("change_remarks", "Can change remarks"),
            ("can_add_worker_in_location_approval", "Can add worker in Location Approval"),
            ("can_add_worker_in_completed", "Can add worker in Completed"),
            ("can_add_worker_in_reconciled", "Can add worker in Reconciled"),
            ("can_add_worker_in_rejected", "Can add worker in Rejected"),
            ("can_add_worker_in_blocked", "Can add worker in Blocked"),
        ]

    def __str__(self):
        return f"Alloc {self.allocation_id} - Ticket {self.ticket.work_order_no} to {self.worker.username}"


@receiver(models.signals.post_save, sender=Allocation)
def add_store_to_worker_accessible_stores(sender, instance, **kwargs):
    if kwargs.get('raw', False):
        return
    if instance.worker and instance.ticket and instance.ticket.store:
        instance.worker.accessible_stores.add(instance.ticket.store)


class WorkLog(models.Model):
    worklog_id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name='work_logs')
    worker = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='work_logs')
    allocation = models.ForeignKey(
        Allocation, on_delete=models.SET_NULL, null=True, blank=True, related_name='work_logs')
    work_date = models.DateField()
    from_time = models.TimeField(null=True, blank=True)
    to_time = models.TimeField(null=True, blank=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    labour_amount = models.DecimalField(max_digits=10, decimal_places=2)
    work_done = models.TextField()
    created_date = models.DateTimeField(auto_now_add=True)
    is_claimed = models.BooleanField(default=False)
    claim = models.ForeignKey(
        'finance.WorkerClaim', on_delete=models.SET_NULL, null=True, blank=True, related_name='work_logs')

    class Meta:
        permissions = [
            ("view_ticket", "Can view ticket"),
            ("change_ticket", "Can change ticket"),
            ("view_worker", "Can view worker"),
            ("change_worker", "Can change worker"),
            ("view_allocation", "Can view allocation"),
            ("change_allocation", "Can change allocation"),
            ("view_work_date", "Can view work date"),
            ("change_work_date", "Can change work date"),
            ("view_from_time", "Can view from time"),
            ("change_from_time", "Can change from time"),
            ("view_to_time", "Can view to time"),
            ("change_to_time", "Can change to time"),
            ("view_hours", "Can view hours"),
            ("change_hours", "Can change hours"),
            ("view_hourly_rate", "Can view hourly rate"),
            ("change_hourly_rate", "Can change hourly rate"),
            ("view_labour_amount", "Can view labour amount"),
            ("change_labour_amount", "Can change labour amount"),
            ("view_work_done", "Can view work done"),
            ("change_work_done", "Can change work done"),
        ]

    def clean(self):
        super().clean()
        from decimal import Decimal
        from django.core.exceptions import ValidationError
        if self.hours is not None:
            if Decimal(str(self.hours)) < 0:
                raise ValidationError(
                    {'hours': 'Logged work hours cannot be negative.'})
            if Decimal(str(self.hours)) > 20:
                raise ValidationError(
                    {'hours': 'Logged work hours cannot exceed 20 hours.'})

    def __str__(self):
        return f"WorkLog {self.worklog_id} by {self.worker.username}"


class TicketHistory(models.Model):
    history_id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name='history')

    # Snapshot of Ticket fields
    store = models.ForeignKey(
        'stores.Store', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_store')
    department = models.ForeignKey(
        'stores.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_department')
    nature = models.ForeignKey(
        WorkNature, on_delete=models.SET_NULL, null=True, blank=True, related_name='history_nature')
    priority = models.ForeignKey(
        Priority, on_delete=models.SET_NULL, null=True, blank=True, related_name='history_priority')
    status = models.ForeignKey(
        Status, on_delete=models.SET_NULL, null=True, blank=True, related_name='history_status')
    title = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_created_tickets')
    created_date = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_approved_tickets')
    approved_date = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_rejected_tickets')
    rejected_date = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(null=True, blank=True)
    closed_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_closed_tickets')
    closed_date = models.DateTimeField(null=True, blank=True)
    location_approval = models.CharField(
        max_length=100, default='Pending', null=True, blank=True)
    location_approved_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_location_approved_tickets')
    location_approved_date = models.DateTimeField(null=True, blank=True)
    location_reject_reason = models.TextField(null=True, blank=True)

    # History metadata fields
    changed_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket_history_changes')
    changed_date = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(null=True, blank=True)
    age_days = models.DecimalField(
        max_digits=10, decimal_places=4, default=0.0)

    class Meta:
        permissions = [
            ("view_ticket", "Can view ticket"),
            ("change_ticket", "Can change ticket"),
            ("view_status", "Can view status"),
            ("change_status", "Can change status"),
            ("view_changed_by", "Can view changed by"),
            ("change_changed_by", "Can change changed by"),
            ("view_remarks", "Can view remarks"),
            ("change_remarks", "Can change remarks"),
        ]

    def __str__(self):
        return f"History {self.history_id} - Ticket {self.ticket.work_order_no}"


@receiver(models.signals.post_save, sender=Ticket)
def create_ticket_history_on_save(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return
    from django.utils import timezone

    # 1. Try to find the last history record for this ticket
    last_history = TicketHistory.objects.filter(
        ticket=instance).order_by('-changed_date').first()

    is_new_status = False
    if created or not last_history or last_history.status != instance.status:
        is_new_status = True

    # 2. If leaving a status, update its age_days
    if last_history and last_history.status != instance.status:
        now = timezone.now()
        duration = now - last_history.changed_date
        session_days = duration.total_seconds() / 86400.0

        # Calculate sum of all previous completed durations for this status
        previous_history = TicketHistory.objects.filter(
            ticket=instance,
            status=last_history.status
        ).exclude(pk=last_history.pk)

        previous_days_sum = sum(
            h.age_days for h in previous_history if h.age_days is not None)

        # Update the last_history record with the accumulated age_days
        last_history.age_days = float(previous_days_sum) + float(session_days)
        last_history.save(update_fields=['age_days'])

    # 3. Create a new history entry as a snapshot
    if is_new_status:
        changed_by = getattr(instance, '_changed_by', None)
        if not changed_by:
            # Pick the most specific actor available on the ticket, in priority order.
            # No status names are hardcoded — purely field-based.
            for actor_field in ('closed_by', 'rejected_by', 'approved_by', 'created_by'):
                actor = getattr(instance, actor_field, None)
                if actor:
                    changed_by = actor
                    break

        remarks = getattr(instance, '_remarks', '')
        if not remarks:
            if instance.reject_reason:
                remarks = instance.reject_reason
            elif instance.status:
                remarks = f"Status changed to {instance.status.status_name}"
            else:
                remarks = "Ticket saved"

        TicketHistory.objects.create(
            ticket=instance,
            store=instance.store,
            department=instance.department,
            nature=instance.nature,
            priority=instance.priority,
            status=instance.status,
            title=instance.title,
            description=instance.description,
            created_by=instance.created_by,
            created_date=instance.created_date,
            approved_by=instance.approved_by,
            approved_date=instance.approved_date,
            rejected_by=instance.rejected_by,
            rejected_date=instance.rejected_date,
            reject_reason=instance.reject_reason,
            closed_by=instance.closed_by,
            closed_date=instance.closed_date,
            location_approval=instance.location_approval,
            location_approved_by=instance.location_approved_by,
            location_approved_date=instance.location_approved_date,
            location_reject_reason=instance.location_reject_reason,
            changed_by=changed_by,
            remarks=remarks,
            age_days=0.0
        )


def get_chat_media_path(instance, filename):
    import os
    ext = os.path.splitext(filename)[1].lower()
    if ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'):
        media_type = 'images'
    elif ext in ('.mp4', '.mov', '.avi', '.mkv', '.webm'):
        media_type = 'videos'
    elif ext in ('.mp3', '.wav', '.ogg', '.m4a', '.aac'):
        media_type = 'voices'
    else:
        media_type = 'others'

    ticket = instance.ticket
    if ticket:
        store_slug = ticket.store.store_name.lower().replace(
            ' ', '_') if ticket.store else 'unknown_store'
        return f"stores/{store_slug}/tickets/ticket_{ticket.ticket_id}/chats/{media_type}/{filename}"
    return f"general/chats/{media_type}/{filename}"


class TicketChatMessage(models.Model):
    message_id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name='chat_messages')
    sender = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='sent_chat_messages')
    message_text = models.TextField(null=True, blank=True)
    image = models.ImageField(
        upload_to=get_chat_media_path, null=True, blank=True)
    video = models.FileField(
        upload_to=get_chat_media_path, null=True, blank=True)
    voice = models.FileField(
        upload_to=get_chat_media_path, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_date']

    def __str__(self):
        return f"Msg {self.message_id} on Ticket {self.ticket.work_order_no} by {self.sender.username}"


class ComplaintIssueType(models.Model):
    ROLE_TYPE_CHOICES = [
        ('all', 'All Roles'),
        ('manager_against_worker', 'Manager against Worker'),
        ('worker_against_manager', 'Worker against Manager'),
    ]

    issue_type_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=200)
    role_type = models.CharField(max_length=50, choices=ROLE_TYPE_CHOICES, default='all')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['name', 'role_type'], name='unique_complaint_issue_role')
        ]

    def __str__(self):
        return f"{self.name} ({self.role_type})"


class Complaint(models.Model):
    COMPLAINT_TYPES = [
        ('manager_against_worker', 'Manager complaint against Worker'),
        ('worker_against_manager', 'Worker complaint against Manager'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('under_review', 'Under Review'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]

    complaint_id = models.AutoField(primary_key=True)
    complaint_type = models.CharField(max_length=50, choices=COMPLAINT_TYPES)
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name='complaints')
    related_tickets = models.ManyToManyField(
        Ticket, blank=True, related_name='related_complaints')
    complainant = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='filed_complaints')
    against_user = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='complaints_received')
    issue_type = models.ForeignKey(
        ComplaintIssueType, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    custom_issue = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField()
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    resolution_notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        permissions = [
            ("can_view_manager_complaint", "Can view manager complaints against workers"),
            ("can_view_worker_complaint", "Can view worker complaints against managers"),
            ("can_view_all_complaint", "Can view all complaints across profiles"),
            ("all_complaint_view", "Can view all complaints across profiles"),
            ("can_create_complaint", "Can create complaint"),
        ]

    def __str__(self):
        issue_name = self.issue_type.name if self.issue_type else (self.custom_issue or "Complaint")
        return f"Complaint #{self.complaint_id} ({self.get_complaint_type_display()}): {issue_name} against {self.against_user}"


@receiver(models.signals.pre_save, sender=Ticket)
def store_old_status(sender, instance, **kwargs):
    if kwargs.get('raw', False):
        return
    if instance.pk:
        try:
            old_inst = Ticket.objects.get(pk=instance.pk)
            instance._old_status = old_inst.status
            instance._old_location_approval = old_inst.location_approval
        except Ticket.DoesNotExist:
            instance._old_status = None
            instance._old_location_approval = None
    else:
        instance._old_status = None
        instance._old_location_approval = None


@receiver(models.signals.post_save, sender=Ticket)
def send_notification_on_ticket_save(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return
    from apps.common.models import Notification
    from apps.accounts.models import CustomUser

    def get_store_managers():
        return CustomUser.objects.filter(
            role__role_name__iexact="Store Manager",
            accessible_stores=instance.store,
            active=True
        )

    def get_allocated_workers():
        return [a.worker for a in instance.allocations.all() if a.worker]

    def get_before_image():
        before_img = instance.attachments.filter(
            category__category_name='Before Repair').first()
        return before_img.file_url.url if before_img else None

    def get_after_image():
        after_img = instance.attachments.filter(
            category__category_name='After Repair').first()
        if after_img:
            return after_img.file_url.url
        # Fallback to before image if after is missing
        return get_before_image()

    notified_users = set()

    def notify(user, ntype, title, message, image=None):
        key = (user.pk, ntype)
        if key in notified_users:
            return
        notified_users.add(key)

        try:
            Notification.objects.create(
                user=user,
                ticket=instance,
                notification_type=ntype,
                title=title,
                message=message,
                image=image,
            )
        except Exception as err:
            print(f"[Notification] Failed to notify {user}: {err}")

    # ----------------------------------------------------------------
    # Scenario A: High/Very High priority ticket created (level >= 4)
    #   -> Notify responsive department office admins only.
    #   -> Falls back to ALL office admins if none have sub_departments set up.
    # ----------------------------------------------------------------
    if created and instance.priority and instance.priority.level >= 4:
        office_admins = CustomUser.objects.filter(
            role__role_name__iexact="Office Administrator",
            sub_departments__department=instance.department,
            active=True
        ).distinct()

        # Fallback: if no department-specific admins found, notify all office admins
        if not office_admins.exists():
            office_admins = CustomUser.objects.filter(
                role__role_name__iexact="Office Administrator",
                active=True
            ).distinct()

        before_img_url = get_before_image()
        for admin in office_admins:
            notify(
                admin,
                "High Priority Ticket",
                "High Priority Ticket Created",
                f"High priority ticket {instance.work_order_no} ({instance.priority.priority_name}) "
                f"has been created: {instance.title}.",
                image=before_img_url
            )

    # ----------------------------------------------------------------
    # Scenario B: Status / location_approval changed
    # ----------------------------------------------------------------
    if not created:
        old_status = getattr(instance, "_old_status", None)
        new_status = instance.status

        # --- Location approval field changed ---
        old_loc_app = getattr(instance, "_old_location_approval", None)
        new_loc_app = instance.location_approval

        if old_loc_app != new_loc_app:
            # Approved -> notify assigned workers
            if new_loc_app == 'Approved':
                after_img_url = get_after_image()
                for worker in get_allocated_workers():
                    notify(
                        worker,
                        "Ticket Completed",
                        "Ticket Completed & Approved",
                        f"Your ticket {instance.work_order_no} has been completed "
                        f"and approved by the Store Manager.",
                        image=after_img_url
                    )

            # Rejected -> notify assigned workers
            elif new_loc_app == 'Rejected':
                after_img_url = get_after_image()
                msg = f"Your ticket {instance.work_order_no} has been rejected by the Store Manager and needs attention."
                if instance.location_reject_reason:
                    msg += f" Reason: {instance.location_reject_reason}"
                for worker in get_allocated_workers():
                    notify(
                        worker,
                        "Ticket Rejected",
                        "Location Approval Rejected",
                        msg,
                        image=after_img_url
                    )

        # --- Status changed ---
        if old_status and old_status != new_status:
            status_lower = new_status.status_name.lower()

            # 1. In Progress
            if status_lower == 'in progress':
                old_status_lower = old_status.status_name.lower() if old_status else ""
                if old_status_lower in ['location approval', 'completed']:
                    # This is a REJECTION / SEND BACK from completion or location approval!
                    after_img_url = get_after_image()
                    reason = instance.reject_reason or instance.location_reject_reason
                    msg = f"Your ticket {instance.work_order_no} has been rejected by the Store Manager and is back in progress."
                    if reason:
                        msg += f" Reason: {reason}"
                    for worker in get_allocated_workers():
                        notify(
                            worker,
                            "Ticket Rejected",
                            "Ticket Rejected / Sent Back",
                            msg,
                            image=after_img_url
                        )
                else:
                    # Regular transition to in progress (Approved/First assignment)
                    if instance.created_by:
                        notify(
                            instance.created_by,
                            "Ticket Approved",
                            "Ticket Approved",
                            f"Your ticket {instance.work_order_no} has been approved."
                        )
                    for manager in get_store_managers():
                        if instance.created_by and manager.pk == instance.created_by.pk:
                            continue
                        notify(
                            manager,
                            "Ticket Approved",
                            "Ticket Approved",
                            f"Ticket {instance.work_order_no} for your store "
                            f"{instance.store.store_name} has been approved and is now in progress."
                        )
                    # Notify pre-assigned workers now that they can view the ticket
                    before_img_url = get_before_image()
                    for worker in get_allocated_workers():
                        notify(
                            worker,
                            "Assignment",
                            "New Ticket Assignment",
                            f"You have been assigned to ticket {instance.work_order_no}: {instance.title}.",
                            image=before_img_url
                        )

            # 2. Location Approval -> notify store managers to review
            elif status_lower == 'location approval':
                after_img_url = get_after_image()
                for manager in get_store_managers():
                    notify(
                        manager,
                        "Location Approval Required",
                        "Ticket Awaiting Location Approval",
                        f"Ticket {instance.work_order_no} has been completed by the worker "
                        f"and is waiting for your location approval.",
                        image=after_img_url
                    )

            # 3. Completed -> notify store managers (waiting for approval)
            elif status_lower == 'completed':
                after_img_url = get_after_image()
                for manager in get_store_managers():
                    notify(
                        manager,
                        "Ticket Completed",
                        "Ticket Completed (Pending Approval)",
                        f"Ticket {instance.work_order_no} has been completed by the worker "
                        f"and is waiting for your approval.",
                        image=after_img_url
                    )

            # 4. Blocked -> notify store managers + assigned workers
            elif status_lower == 'blocked':
                for manager in get_store_managers():
                    notify(
                        manager,
                        "Ticket Blocked",
                        "Ticket Blocked",
                        f"Ticket {instance.work_order_no} has been blocked: {instance.title}."
                    )
                for worker in get_allocated_workers():
                    notify(
                        worker,
                        "Ticket Blocked",
                        "Ticket Blocked",
                        f"Ticket {instance.work_order_no} has been marked as blocked."
                    )

            # 5. Rejected -> notify creator + store managers
            elif status_lower == 'rejected':
                reason = instance.reject_reason
                msg = f"Your ticket {instance.work_order_no} has been rejected."
                if reason:
                    msg += f" Reason: {reason}"

                # Notify creator
                if instance.created_by:
                    notify(
                        instance.created_by,
                        "Ticket Rejected",
                        "Ticket Rejected",
                        msg
                    )
                # Notify store managers
                for manager in get_store_managers():
                    if instance.created_by and manager.pk == instance.created_by.pk:
                        continue
                    notify(
                        manager,
                        "Ticket Rejected",
                        "Ticket Rejected",
                        f"Ticket {instance.work_order_no} for your store {instance.store.store_name} has been rejected." + (
                            f" Reason: {reason}" if reason else "")
                    )


@receiver(models.signals.post_save, sender=Allocation)
def send_notification_on_allocation_save(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return
    if created:
        from apps.common.models import Notification
        if instance.worker and instance.ticket:
            # Only notify worker if ticket is already In Progress (already approved and visible)
            if instance.ticket.status.status_name.lower() == 'in progress':
                try:
                    Notification.objects.create(
                        user=instance.worker,
                        ticket=instance.ticket,
                        notification_type="Assignment",
                        title="New Ticket Assignment",
                        message=f"You have been assigned to ticket {instance.ticket.work_order_no}: {instance.ticket.title}."
                    )
                except Exception as err:
                    print("Failed to notify worker about allocation:", err)


@receiver(models.signals.post_save, sender='common.Media')
def send_notification_on_media_save(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return

    if created and instance.ticket:
        from apps.common.models import Notification
        from apps.common.services import send_push_notification

        ticket = instance.ticket
        category_name = instance.category.category_name if instance.category else ""

        # 1. Before Repair image uploaded for High Priority ticket
        if category_name == 'Before Repair' and ticket.priority and ticket.priority.level >= 4:
            notifs = Notification.objects.filter(
                ticket=ticket,
                notification_type="High Priority Ticket",
                image__isnull=True
            )
            for notif in notifs:
                notif.image = instance.file_url.url
                notif.save(update_fields=['image'])
                try:
                    send_push_notification(notif)
                except Exception as err:
                    print("Failed to resend push notification on media save:", err)

        # 2. After Repair image uploaded for Location Approval / Completed ticket
        elif category_name == 'After Repair':
            notifs = Notification.objects.filter(
                ticket=ticket,
                notification_type__in=[
                    "Location Approval Required", "Ticket Completed"],
                image__isnull=True
            )
            for notif in notifs:
                notif.image = instance.file_url.url
                notif.save(update_fields=['image'])
                try:
                    send_push_notification(notif)
                except Exception as err:
                    print("Failed to resend push notification on media save:", err)


@receiver(models.signals.post_save, sender=Ticket)
def broadcast_ticket_update(sender, instance, **kwargs):
    if kwargs.get('raw', False):
        return
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from apps.maintenance.serializers import TicketSerializer

        channel_layer = get_channel_layer()
        if channel_layer:
            serializer = TicketSerializer(instance)
            ticket_data = serializer.data

            metadata = {
                "ticket_id": instance.ticket_id,
                "store_id": instance.store_id,
                "department_id": instance.department_id,
                "status_id": instance.status_id,
                "status_name": instance.status.status_name if instance.status else None,
                "allocated_worker_ids": list(instance.allocations.values_list('worker_id', flat=True)),
            }

            async_to_sync(channel_layer.group_send)(
                "tickets_updates",
                {
                    "type": "ticket_updated",
                    "metadata": metadata,
                    "ticket_data": ticket_data,
                }
            )
    except Exception as err:
        print("[WebSocket Broadcast] Failed to broadcast ticket update:", err)


@receiver(models.signals.post_save, sender=TicketChatMessage)
def broadcast_chat_message(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return
    if created:
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            from apps.maintenance.serializers import TicketChatMessageSerializer

            channel_layer = get_channel_layer()
            if channel_layer:
                serializer = TicketChatMessageSerializer(instance)
                message_data = serializer.data

                group_name = f"chat_ticket_{instance.ticket_id}"
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "chat_message",
                        "message_data": message_data,
                    }
                )
        except Exception as err:
            print("[WebSocket Broadcast] Failed to broadcast chat message:", err)
