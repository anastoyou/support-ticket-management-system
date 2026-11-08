from django.utils import timezone
from rest_framework import serializers
from .models import (
    ExpenseType, EmployeeRate, Expense, Reconciliation, WorkerClaim,
    LedgerBatch, LedgerGroup, Ledger, ApprovalWorkflow, ApprovalStep,
    ApprovalInstance, AuditEvent, Payment
)
from apps.common.serializers import MediaSerializer
from apps.accounts.models import CustomUser
from apps.stores.serializers import SubDepartmentSerializer


import time

_USER_SUMMARY_CACHE = {}
_STEP_SUMMARY_CACHE = {}
_WORKFLOW_STEPS_CACHE = {}


def get_cached_workflow_steps(workflow_id):
    if not workflow_id:
        return []
    now = time.time()
    cached = _WORKFLOW_STEPS_CACHE.get(workflow_id)
    if cached and (now - cached[0]) < 30:
        return cached[1]

    steps = ApprovalStep.objects.filter(workflow_id=workflow_id).select_related('assigned_role').prefetch_related('assigned_users').order_by('step_order')
    res = [
        {
            'step_id': s.step_id,
            'step_order': s.step_order,
            'step_name': s.step_name,
            'assigned_role_name': s.assigned_role.role_name if s.assigned_role else '',
            'assigned_users_ids': [u.pk for u in s.assigned_users.all()],
            'assigned_users_names': [u.full_name or u.username for u in s.assigned_users.all()],
            'is_final_step': s.is_final_step
        }
        for s in steps
    ]
    _WORKFLOW_STEPS_CACHE[workflow_id] = (now, res)
    return res


def get_cached_step_info(step):
    if not step:
        return {}
    sid = getattr(step, 'step_id', None)
    now = time.time()
    if sid:
        cached = _STEP_SUMMARY_CACHE.get(sid)
        if cached and (now - cached[0]) < 30:
            return cached[1]

    assigned_users = list(step.assigned_users.all())
    info = {
        'step_id': step.step_id,
        'step_name': step.step_name,
        'step_order': step.step_order,
        'assigned_role_name': step.assigned_role.role_name if (getattr(step, 'assigned_role', None)) else '',
        'assigned_users_names': [u.full_name or u.username for u in assigned_users],
        'assigned_users_usernames': [u.username for u in assigned_users],
        'assigned_users_ids': [u.pk for u in assigned_users],
        'workflow_id': step.workflow_id
    }
    if sid:
        _STEP_SUMMARY_CACHE[sid] = (now, info)
    return info


def serialize_user_summary(user):
    if not user:
        return None
    uid = getattr(user, 'pk', None)
    now = time.time()
    if uid:
        cached = _USER_SUMMARY_CACHE.get(uid)
        if cached and (now - cached[0]) < 30:
            return cached[1]

    profile_image_url = None
    if getattr(user, 'profile_image', None):
        try:
            profile_image_url = user.profile_image.url
        except Exception:
            profile_image_url = None

    role_name = None
    if getattr(user, 'role', None):
        role_name = getattr(user.role, 'role_name', None) or (user.role if isinstance(user.role, str) else None)
    if not role_name and hasattr(user, 'groups'):
        g = user.groups.first()
        if g:
            role_name = g.name

    sub_departments_data = []
    if hasattr(user, 'sub_departments'):
        try:
            sub_departments_data = [
                {
                    'sub_department_id': sd.sub_department_id,
                    'sub_department_name': sd.sub_department_name,
                }
                for sd in user.sub_departments.all()
            ]
        except Exception:
            pass

    res = {
        'id': user.pk,
        'user_id': user.pk,
        'username': getattr(user, 'username', '') or '',
        'first_name': getattr(user, 'first_name', '') or '',
        'last_name': getattr(user, 'last_name', '') or '',
        'full_name': getattr(user, 'full_name', '') or getattr(user, 'username', '') or '',
        'employee_no': getattr(user, 'employee_no', '') or '',
        'profile_image': profile_image_url,
        'role': role_name,
        'sub_departments': sub_departments_data,
        'phone': getattr(user, 'phone', '') or '',
        'email': getattr(user, 'email', '') or '',
    }
    if uid:
        _USER_SUMMARY_CACHE[uid] = (now, res)
    return res


def serialize_approval_instance_summary(inst, user=None):
    if not inst:
        return None
    action_by_full_name = None
    if inst.action_by:
        action_by_full_name = getattr(inst.action_by, 'full_name', '') or inst.action_by.username

    step_info = get_cached_step_info(inst.step) if inst.step else {}
    workflow_steps = []
    if step_info.get('workflow_id'):
        workflow_steps = get_cached_workflow_steps(step_info['workflow_id'])

    can_action = False
    if user and getattr(user, 'is_authenticated', False) and inst.status == 'Pending':
        from .services import ApprovalService
        can_action = ApprovalService.can_user_action_step(user, inst.step, inst)

    return {
        'instance_id': inst.instance_id,
        'step_id': step_info.get('step_id'),
        'step_name': step_info.get('step_name', 'Step'),
        'step_order': step_info.get('step_order', 0),
        'assigned_role_name': step_info.get('assigned_role_name', ''),
        'assigned_users_names': step_info.get('assigned_users_names', []),
        'assigned_users_usernames': step_info.get('assigned_users_usernames', []),
        'assigned_users_ids': step_info.get('assigned_users_ids', []),
        'workflow_steps': workflow_steps,
        'can_action': can_action,
        'action_by': inst.action_by_id,
        'action_by_username': inst.action_by.username if inst.action_by else None,
        'action_by_full_name': action_by_full_name,
        'status': inst.status,
        'comments': inst.comments or '',
        'created_at': inst.created_at.isoformat() if inst.created_at else None,
        'actioned_at': inst.actioned_at.isoformat() if inst.actioned_at else None,
        'claim': inst.claim_id,
        'ledger': inst.ledger_id,
        'expense': inst.expense_id,
    }



def serialize_ticket_summary(ticket):
    if not ticket:
        return None
    sub_id = None
    sub_name = None
    dept_name = None
    nature = getattr(ticket, 'nature', None)
    if nature and getattr(nature, 'sub_department', None):
        sub_dept = nature.sub_department
        sub_id = sub_dept.sub_department_id
        sub_name = sub_dept.sub_department_name
        if getattr(sub_dept, 'department', None):
            dept_name = sub_dept.department.department_name
    elif getattr(ticket, 'department', None):
        dept_name = ticket.department.department_name

    status_obj = getattr(ticket, 'status', None)
    status_name = status_obj.status_name if status_obj else None
    status_short_code = getattr(status_obj, 'short_code', None) if status_obj else None
    if not status_short_code and status_name:
        STATUS_CODE_MAP = {
            'rejected': 'REJ',
            'open': 'OPN',
            'blocked': 'BLK',
            'in progress': 'PRG',
            'location approval': 'LAP',
            'completed': 'CMP',
            'reconciled': 'REC',
        }
        status_short_code = STATUS_CODE_MAP.get(status_name.lower().strip())

    store = getattr(ticket, 'store', None)
    return {
        'ticket_id': ticket.ticket_id,
        'work_order_no': ticket.work_order_no,
        'title': ticket.title,
        'store_id': store.store_id if store else None,
        'store_name': store.store_name if store else None,
        'store_type': store.type if store else None,
        'sub_department_id': sub_id,
        'sub_department_name': sub_name,
        'department_name': dept_name,
        'status': status_name,
        'status_name': status_name,
        'status_short_code': status_short_code,
    }


def serialize_receipt_summary(r):
    if not r:
        return None
    url = ''
    if getattr(r, 'file_url', None):
        try:
            url = r.file_url.url
            if getattr(r, 'uploaded_date', None):
                ts = int(r.uploaded_date.timestamp())
                url = f"{url}?v={ts}"
        except Exception:
            url = ''
    return {
        'media_id': r.media_id,
        'file_name': getattr(r, 'file_name', None) or getattr(r, 'original_file_name', None) or '',
        'file_url': url,
        'file_type': getattr(r, 'file_type', None),
        'media_type': getattr(r, 'media_type', None),
        'title': getattr(r, 'title', '') or '',
    }


class ExpenseTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseType
        fields = '__all__'
        depth = 1

    def validate(self, data):
        parent = data.get('parent')
        department = data.get('department')
        if parent and department and parent.department != department:
            raise serializers.ValidationError(
                {"parent": f"Parent expense type must belong to the same department ({department.department_name})."}
            )
        return data


class ExpenseTypeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseType
        fields = '__all__'

    def validate(self, data):
        parent = data.get('parent')
        department = data.get('department')
        if parent and department and parent.department != department:
            raise serializers.ValidationError(
                {"parent": f"Parent expense type must belong to the same department ({department.department_name})."}
            )
        return data


class EmployeeRateSerializer(serializers.ModelSerializer):
    worker = serializers.PrimaryKeyRelatedField(
        queryset=CustomUser.objects.all()
    )

    class Meta:
        model = EmployeeRate
        fields = '__all__'
        depth = 1

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if instance.worker:
            rep['worker'] = serialize_user_summary(instance.worker)
        else:
            rep['worker'] = None
        return rep


class ExpenseSerializer(serializers.ModelSerializer):
    receipts = serializers.SerializerMethodField()
    approval_instances = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    reject_reason = serializers.SerializerMethodField()
    ticket_details = serializers.SerializerMethodField()
    worker_detail = serializers.SerializerMethodField()
    added_by_detail = serializers.SerializerMethodField()
    expense_type_detail = serializers.SerializerMethodField()
    sub_department_id = serializers.SerializerMethodField()
    sub_department_name = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = '__all__'

    def get_receipts(self, obj):
        return [serialize_receipt_summary(r) for r in obj.receipts.all()]


    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Populate object representations using already-computed summaries without firing nested queries
        if instance.ticket_id and 'ticket_details' in rep:
            rep['ticket'] = rep['ticket_details']
        if instance.expense_type_id and 'expense_type_detail' in rep:
            rep['expense_type'] = rep['expense_type_detail']
        if instance.worker_id and 'worker_detail' in rep:
            rep['worker'] = rep['worker_detail']
        if instance.added_by_id and 'added_by_detail' in rep:
            rep['added_by'] = rep['added_by_detail']
        return rep

    def _get_sorted_approval_instances(self, obj):
        if hasattr(obj, '_cached_sorted_approval_instances'):
            return obj._cached_sorted_approval_instances
        insts = list(obj.approval_instances.all())
        insts.sort(key=lambda x: x.created_at or timezone.now(), reverse=True)
        obj._cached_sorted_approval_instances = insts
        return insts

    def get_approval_instances(self, obj):
        insts = self._get_sorted_approval_instances(obj)
        return [serialize_approval_instance_summary(inst) for inst in insts]

    def get_status_display(self, obj):
        is_paid = getattr(obj, 'is_paid', False)
        if not is_paid and obj.claim and obj.claim.status == 'Paid':
            is_paid = True
        if not is_paid:
            if hasattr(obj, '_prefetched_objects_cache') and 'ledgers' in obj._prefetched_objects_cache:
                is_paid = any(l.status == 'Paid' for l in obj.ledgers.all())
            elif hasattr(obj, 'ledgers'):
                is_paid = obj.ledgers.filter(status='Paid').exists()
        if is_paid:
            return 'Paid'
        insts = self._get_sorted_approval_instances(obj)
        if insts:
            pending_inst = next((i for i in insts if i.status == 'Pending'), None)
            if pending_inst and not obj.approved:
                return 'Pending Approval'
            latest_inst = insts[0]
            if latest_inst.status in ['Rejected', 'Rework']:
                return latest_inst.status
        if obj.approved or (obj.expense_type and not obj.expense_type.approve_required):
            return 'Approved'
        if obj.claim and obj.claim.status in ['Rejected', 'Rework']:
            return obj.claim.status
        return 'Pending Approval'


    def get_reject_reason(self, obj):
        insts = self._get_sorted_approval_instances(obj)
        for inst in insts:
            if inst.status in ['Rejected', 'Rework'] and inst.comments:
                return inst.comments
        if obj.claim and obj.claim.reject_reason:
            return obj.claim.reject_reason
        return None

    def get_ticket_details(self, obj):
        return serialize_ticket_summary(obj.ticket)

    def get_sub_department_id(self, obj):
        if obj.ticket and obj.ticket.nature and obj.ticket.nature.sub_department:
            return obj.ticket.nature.sub_department.sub_department_id
        return None

    def get_sub_department_name(self, obj):
        if obj.ticket and obj.ticket.nature and obj.ticket.nature.sub_department:
            return obj.ticket.nature.sub_department.sub_department_name
        return None

    def get_worker_detail(self, obj):
        return serialize_user_summary(obj.worker)

    def get_added_by_detail(self, obj):
        return serialize_user_summary(obj.added_by)

    def get_expense_type_detail(self, obj):
        if obj.expense_type:
            parent = obj.expense_type.parent
            return {
                'expense_type_id': obj.expense_type.expense_type_id,
                'expense_id': obj.expense_type.expense_type_id,
                'expense_name': obj.expense_type.expense_name,
                'parent_id': parent.expense_type_id if parent else None,
                'parent_name': parent.expense_name if parent else None,
                'approve_required': obj.expense_type.approve_required,
                'department_name': obj.expense_type.department.department_name if obj.expense_type.department else None
            }
        return None


class ExpenseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = '__all__'

    def validate(self, data):
        ticket = data.get('ticket') or (getattr(self.instance, 'ticket', None) if self.instance else None)
        expense_type = data.get('expense_type') or (getattr(self.instance, 'expense_type', None) if self.instance else None)
        if ticket and expense_type and hasattr(ticket, 'department') and hasattr(expense_type, 'department') and ticket.department and expense_type.department and expense_type.department != ticket.department:
            raise serializers.ValidationError(
                {"expense_type": f"Expense Type '{expense_type.expense_name}' does not belong to ticket department '{ticket.department.department_name}'."}
            )

        expense_date = data.get('expense_date') or (getattr(self.instance, 'expense_date', None) if self.instance else None)
        if ticket and expense_date and hasattr(ticket, 'created_date') and ticket.created_date:
            ticket_date = ticket.created_date.date() if hasattr(ticket.created_date, 'date') else ticket.created_date
            if expense_date < ticket_date:
                raise serializers.ValidationError(
                    {"expense_date": f"Expense date ({expense_date}) cannot be before the ticket creation date ({ticket_date})."}
                )

        remarks = data.get('remarks') or (getattr(self.instance, 'remarks', None) if self.instance else None)
        if expense_type and getattr(expense_type, 'required', False):
            if not remarks or not str(remarks).strip():
                raise serializers.ValidationError(
                    {"remarks": f"Remarks / Description is required for expense category '{expense_type.expense_name}'."}
                )
        return data


def serialize_claim_expense_summary(exp):
    receipts_list = []
    for r in exp.receipts.all():
        receipts_list.append({
            'media_id': r.media_id,
            'file_name': r.file_name,
            'file_url': r.file_url.url if r.file_url else '',
            'file_type': getattr(r, 'file_type', None)
        })
    store = exp.responsible_store
    exp_type = exp.expense_type
    return {
        'expense_id': exp.expense_id,
        'amount': str(exp.amount),
        'expense_date': exp.expense_date.isoformat() if exp.expense_date else None,
        'remarks': exp.remarks or '',
        'receipts': receipts_list,
        'ticket': exp.ticket_id,
        'ticket_details': serialize_ticket_summary(exp.ticket),
        'worker': exp.worker_id,
        'worker_detail': serialize_user_summary(exp.worker),
        'responsible_store': {
            'store_id': store.store_id,
            'store_name': store.store_name,
            'type': store.type,
            'store_type': store.type,
        } if store else None,
        'expense_type': exp_type.expense_type_id if exp_type else None,
        'expense_type_detail': {
            'expense_type_id': exp_type.expense_type_id,
            'expense_name': exp_type.expense_name
        } if exp_type else None,
        'is_claimed': exp.is_claimed,
        'approved': exp.approved
    }


class WorkerClaimSerializer(serializers.ModelSerializer):
    worker_detail = serializers.SerializerMethodField()
    approved_by_detail = serializers.SerializerMethodField()
    ticket_details = serializers.SerializerMethodField()
    expenses = serializers.SerializerMethodField()
    approval_history = serializers.SerializerMethodField()
    approval_instances = serializers.SerializerMethodField()
    ledger_details = serializers.SerializerMethodField()

    class Meta:
        model = WorkerClaim
        fields = '__all__'

    def get_worker_detail(self, obj):
        return serialize_user_summary(obj.worker)

    def get_approved_by_detail(self, obj):
        return serialize_user_summary(obj.approved_by)

    def get_ticket_details(self, obj):
        if obj.ticket:
            return serialize_ticket_summary(obj.ticket)
        # In-memory scan of prefetched expenses
        for exp in obj.expenses.all():
            if exp.ticket:
                return serialize_ticket_summary(exp.ticket)
        return None

    def get_expenses(self, obj):
        return [serialize_claim_expense_summary(exp) for exp in obj.expenses.all()]

    def get_approval_history(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        insts = list(obj.approval_instances.all())
        insts.sort(key=lambda x: (x.step.step_order if x.step else 0, x.created_at or timezone.now()))
        return [serialize_approval_instance_summary(inst, user=user) for inst in insts]

    def get_approval_instances(self, obj):
        return self.get_approval_history(obj)

    def get_ledger_details(self, obj):
        ledgers = list(obj.ledgers.all())
        if ledgers:
            ledger = ledgers[0]
            group_name = ledger.ledger_group.group_name if ledger.ledger_group else f"Ledger Batch #{ledger.ledger_id}"
            is_completed = bool(ledger.ledger_group and ledger.ledger_group.is_completed)
            return {
                'ledger_id': ledger.ledger_id,
                'ledger_group_id': ledger.ledger_group_id,
                'group_name': group_name,
                'status': ledger.status,
                'is_completed': is_completed,
                'created_at': ledger.created_at.isoformat() if ledger.created_at else None
            }
        return None


class WorkerClaimWriteSerializer(serializers.ModelSerializer):
    expense_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True)

    class Meta:
        model = WorkerClaim
        fields = '__all__'


class ReconciliationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reconciliation
        fields = '__all__'
        depth = 1


class LedgerBatchSerializer(serializers.ModelSerializer):
    sub_departments_detail = SubDepartmentSerializer(source='sub_departments', many=True, read_only=True)

    class Meta:
        model = LedgerBatch
        fields = '__all__'


class LedgerBatchWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerBatch
        fields = '__all__'

    def validate_sub_departments(self, sub_departments):
        instance = self.instance
        instance_pk = instance.pk if instance else None

        for subdept in sub_departments:
            existing_batch = LedgerBatch.objects.exclude(pk=instance_pk).filter(sub_departments=subdept).first()
            if existing_batch:
                raise serializers.ValidationError(
                    f"Sub-department '{subdept.sub_department_name}' is already assigned to Ledger Batch '{existing_batch.batch_name}'. A sub-department cannot belong to multiple Ledger Batches."
                )
        return sub_departments


class LedgerGroupSerializer(serializers.ModelSerializer):
    created_by_detail = serializers.SerializerMethodField()
    completed_by_detail = serializers.SerializerMethodField()
    paid_by_detail = serializers.SerializerMethodField()
    ledgers_count = serializers.SerializerMethodField()

    class Meta:
        model = LedgerGroup
        fields = '__all__'

    def validate_group_name(self, value):
        clean_name = value.strip() if value else ''
        if not clean_name:
            raise serializers.ValidationError("Group name is required.")
        qs = LedgerGroup.objects.filter(group_name__iexact=clean_name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"A Ledger Group named '{clean_name}' already exists. Group names must be unique.")
        return clean_name

    def get_ledgers_count(self, obj):
        if hasattr(obj, 'annotated_ledgers_count'):
            return obj.annotated_ledgers_count
        if hasattr(obj, 'ledgers'):
            return len(obj.ledgers.all())
        return 0

    def get_created_by_detail(self, obj):
        return serialize_user_summary(obj.created_by)

    def get_completed_by_detail(self, obj):
        return serialize_user_summary(obj.completed_by)

    status = serializers.SerializerMethodField()

    def get_status(self, obj):
        if getattr(obj, 'is_paid', False):
            return 'Paid'
        ledgers = list(obj.ledgers.all()) if hasattr(obj, 'ledgers') else []
        if ledgers:
            statuses = [getattr(l, 'status', 'Draft') for l in ledgers]
            if all(s == 'Paid' for s in statuses):
                return 'Paid'
            if any(s == 'Rework' for s in statuses):
                return 'Rework'
            if any(s in ('In Review', 'Submitted', 'Pending') for s in statuses):
                return 'In Review'
            if any(s == 'Rejected' for s in statuses):
                return 'Rejected'
            if all(s in ('Approved', 'Paid') for s in statuses):
                return 'Approved'
            return 'Draft'
        if getattr(obj, 'is_completed', False):
            return 'Approved'
        return 'Draft'

    def get_paid_by_detail(self, obj):
        return serialize_user_summary(obj.paid_by)


class LedgerSerializer(serializers.ModelSerializer):
    bundles = WorkerClaimSerializer(many=True, read_only=True)
    expenses = ExpenseSerializer(many=True, read_only=True)
    created_by_detail = serializers.SerializerMethodField()
    ledger_group_detail = LedgerGroupSerializer(
        source='ledger_group', read_only=True)
    ledger_batch_detail = LedgerBatchSerializer(
        source='ledger_batch', read_only=True)
    store_detail = serializers.SerializerMethodField()
    approval_history = serializers.SerializerMethodField()

    class Meta:
        model = Ledger
        fields = '__all__'

    def get_created_by_detail(self, obj):
        return serialize_user_summary(obj.created_by)

    def get_store_detail(self, obj):
        if obj.store:
            from apps.stores.serializers import StoreSerializer
            return StoreSerializer(obj.store).data
        return None

    def get_approval_history(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        insts = list(obj.approval_instances.all())
        insts.sort(key=lambda x: (x.step.step_order if x.step else 0, x.created_at or timezone.now()))
        return [serialize_approval_instance_summary(inst, user=user) for inst in insts]


class LedgerWriteSerializer(serializers.ModelSerializer):
    bundle_ids = serializers.ListField(
        child=serializers.IntegerField(), required=True, write_only=True)

    class Meta:
        model = Ledger
        fields = '__all__'


class ApprovalStepSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(
        source='assigned_role.role_name', read_only=True)
    assigned_users_detail = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalStep
        fields = '__all__'

    def validate(self, attrs):
        assigned_role = attrs.get('assigned_role')
        assigned_users = attrs.get('assigned_users')
        if assigned_role and assigned_users:
            raise serializers.ValidationError("Please specify either Assigned Role (Role-wise) OR Assigned Users (User-wise), but not both.")
        return attrs

    def get_assigned_users_detail(self, obj):
        return [
            {
                'user_id': u.pk,
                'username': u.username,
                'full_name': getattr(u, 'full_name', '') or u.username
            }
            for u in obj.assigned_users.all()
        ]


class ApprovalWorkflowSerializer(serializers.ModelSerializer):
    steps = ApprovalStepSerializer(many=True, read_only=True)

    class Meta:
        model = ApprovalWorkflow
        fields = '__all__'


class ApprovalInstanceSerializer(serializers.ModelSerializer):
    step_name = serializers.CharField(source='step.step_name', read_only=True)
    step_order = serializers.IntegerField(
        source='step.step_order', read_only=True)
    assigned_role_name = serializers.CharField(
        source='step.assigned_role.role_name', read_only=True)
    assigned_users_ids = serializers.SerializerMethodField()
    assigned_users_names = serializers.SerializerMethodField()
    assigned_users_usernames = serializers.SerializerMethodField()
    action_by_username = serializers.CharField(
        source='action_by.username', read_only=True)
    action_by_full_name = serializers.SerializerMethodField()
    target_summary = serializers.SerializerMethodField()
    workflow_steps = serializers.SerializerMethodField()
    approval_history = serializers.SerializerMethodField()
    can_action = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalInstance
        fields = '__all__'

    def get_assigned_users_ids(self, obj):
        if obj.step:
            return list(obj.step.assigned_users.values_list('pk', flat=True))
        return []

    def get_assigned_users_names(self, obj):
        if obj.step:
            return [u.full_name or u.username for u in obj.step.assigned_users.all()]
        return []

    def get_assigned_users_usernames(self, obj):
        if obj.step:
            return list(obj.step.assigned_users.values_list('username', flat=True))
        return []

    def get_action_by_full_name(self, obj):
        if obj.action_by:
            return obj.action_by.full_name or obj.action_by.username
        return None

    def get_can_action(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        from .services import ApprovalService
        return ApprovalService.can_user_action_step(request.user, obj.step, obj)

    def get_approval_history(self, obj):
        request = self.context.get('request')
        history_cache = self.context.setdefault('_history_cache', {})
        cache_key = f"claim_{obj.claim_id}" if obj.claim_id else (f"ledger_{obj.ledger_id}" if obj.ledger_id else (f"expense_{obj.expense_id}" if obj.expense_id else None))
        if cache_key and cache_key in history_cache:
            return history_cache[cache_key]

        queryset = None
        if obj.claim:
            queryset = ApprovalInstance.objects.filter(claim=obj.claim)
        elif obj.ledger:
            queryset = ApprovalInstance.objects.filter(ledger=obj.ledger)
        elif obj.expense:
            queryset = ApprovalInstance.objects.filter(expense=obj.expense)

        if queryset:
            from .services import ApprovalService
            instances = queryset.prefetch_related('step__assigned_users').select_related(
                'step', 'step__assigned_role', 'action_by').order_by('step__step_order', 'created_at')
            res = [
                {
                    'instance_id': inst.instance_id,
                    'step_id': inst.step_id if inst.step else None,
                    'step_order': inst.step.step_order if inst.step else 0,
                    'step_name': inst.step.step_name if inst.step else 'Step',
                    'assigned_role_name': inst.step.assigned_role.role_name if (inst.step and inst.step.assigned_role) else '',
                    'assigned_users_names': [u.full_name or u.username for u in inst.step.assigned_users.all()] if inst.step else [],
                    'assigned_users_ids': [u.pk for u in inst.step.assigned_users.all()] if inst.step else [],
                    'can_action': ApprovalService.can_user_action_step(request.user, inst.step, inst) if (request and request.user and request.user.is_authenticated and inst.status == 'Pending') else False,
                    'action_by_username': inst.action_by.username if inst.action_by else None,
                    'action_by_full_name': (inst.action_by.full_name or inst.action_by.username) if inst.action_by else None,
                    'status': inst.status,
                    'comments': inst.comments or '',
                    'actioned_at': inst.actioned_at.isoformat() if inst.actioned_at else None,
                    'created_at': inst.created_at.isoformat() if inst.created_at else None,
                }
                for inst in instances
            ]
            if cache_key:
                history_cache[cache_key] = res
            return res
        return []

    def get_workflow_steps(self, obj):
        if obj.step and obj.step.workflow:
            steps = sorted(obj.step.workflow.steps.all(), key=lambda s: s.step_order)
            return [
                {
                    'step_id': s.step_id,
                    'step_order': s.step_order,
                    'step_name': s.step_name,
                    'assigned_role_name': s.assigned_role.role_name if s.assigned_role else '',
                    'assigned_users_ids': [u.pk for u in s.assigned_users.all()],
                    'assigned_users_names': [u.full_name or u.username for u in s.assigned_users.all()],
                    'is_final_step': s.is_final_step
                }
                for s in steps
            ]
        return []

    def get_target_summary(self, obj):
        if obj.claim:
            claim_expenses = list(obj.claim.expenses.all())
            first_exp = claim_expenses[0] if claim_expenses else None
            store_name = first_exp.responsible_store.store_name if first_exp and first_exp.responsible_store else (
                obj.claim.ticket.store.store_name if obj.claim.ticket and getattr(obj.claim.ticket, 'store', None) else None)
            ticket_info = None
            if obj.claim.ticket:
                ticket_info = {
                    'ticket_id': obj.claim.ticket.ticket_id,
                    'work_order_no': obj.claim.ticket.work_order_no,
                    'title': obj.claim.ticket.title,
                }
            elif first_exp and first_exp.ticket:
                ticket_info = {
                    'ticket_id': first_exp.ticket.ticket_id,
                    'work_order_no': first_exp.ticket.work_order_no,
                    'title': first_exp.ticket.title,
                }

            from apps.common.serializers import MediaSerializer
            expenses_list = []
            tickets_list = []
            seen_tids = set()

            for exp in claim_expenses:
                t_info = None
                if exp.ticket:
                    t_info = {
                        'ticket_id': exp.ticket.ticket_id,
                        'work_order_no': exp.ticket.work_order_no,
                        'title': exp.ticket.title,
                    }
                    if exp.ticket.ticket_id not in seen_tids:
                        seen_tids.add(exp.ticket.ticket_id)
                        tickets_list.append(t_info)

                expenses_list.append({
                    'expense_id': exp.expense_id,
                    'amount': str(exp.amount),
                    'expense_date': str(exp.expense_date) if exp.expense_date else None,
                    'expense_type_name': exp.expense_type.expense_name if exp.expense_type else '',
                    'remarks': exp.remarks or '',
                    'store_name': exp.responsible_store.store_name if exp.responsible_store else (exp.ticket.store.store_name if exp.ticket and exp.ticket.store else None),
                    'store_type': exp.responsible_store.type if exp.responsible_store else (exp.ticket.store.type if exp.ticket and exp.ticket.store else None),
                    'ticket': t_info,
                    'receipts': [serialize_receipt_summary(r) for r in exp.receipts.all()] if hasattr(exp, 'receipts') else []
                })

            return {
                'type': 'Bundle',
                'id': obj.claim.claim_id,
                'label': f"Worker Claim Bundle {obj.claim.claim_id}",
                'worker': obj.claim.worker.full_name or obj.claim.worker.username if obj.claim.worker else 'N/A',
                'amount': str(obj.claim.total_claimed_amount),
                'store_name': store_name,
                'ticket': ticket_info,
                'tickets': tickets_list,
                'period_from': str(obj.claim.period_from) if obj.claim.period_from else None,
                'period_to': str(obj.claim.period_to) if obj.claim.period_to else None,
                'remarks': obj.claim.remarks or '',
                'expenses': expenses_list,
            }
        elif obj.ledger:
            tickets_list = []
            seen_tids = set()

            # Serialize bundles associated with this ledger
            bundles_list = []
            ledger_bundles = list(obj.ledger.bundles.all())

            for bundle in ledger_bundles:
                bundle_expenses = []
                for exp in bundle.expenses.all():
                    t_info = serialize_ticket_summary(exp.ticket)
                    if t_info and exp.ticket.ticket_id not in seen_tids:
                        seen_tids.add(exp.ticket.ticket_id)
                        tickets_list.append(t_info)

                    bundle_expenses.append({
                        'expense_id': exp.expense_id,
                        'amount': str(exp.amount),
                        'expense_date': str(exp.expense_date) if exp.expense_date else None,
                        'expense_type_name': exp.expense_type.expense_name if exp.expense_type else '',
                        'expense_type_detail': {'expense_name': exp.expense_type.expense_name} if exp.expense_type else None,
                        'remarks': exp.remarks or '',
                        'worker': exp.worker.full_name or exp.worker.username if exp.worker else 'N/A',
                        'worker_detail': serialize_user_summary(exp.worker),
                        'added_by': exp.added_by.full_name or exp.added_by.username if exp.added_by else None,
                        'added_by_detail': serialize_user_summary(exp.added_by),
                        'store_name': exp.responsible_store.store_name if exp.responsible_store else (exp.ticket.store.store_name if exp.ticket and exp.ticket.store else None),
                    'store_type': exp.responsible_store.type if exp.responsible_store else (exp.ticket.store.type if exp.ticket and exp.ticket.store else None),
                        'ticket': t_info,
                        'ticket_details': t_info,
                        'receipts': [serialize_receipt_summary(r) for r in exp.receipts.all()] if hasattr(exp, 'receipts') else []
                    })

                b_ticket = serialize_ticket_summary(bundle.ticket)
                if b_ticket and bundle.ticket.ticket_id not in seen_tids:
                    seen_tids.add(bundle.ticket.ticket_id)
                    tickets_list.append(b_ticket)

                bundles_list.append({
                    'claim_id': bundle.claim_id,
                    'worker': bundle.worker.full_name or bundle.worker.username if bundle.worker else 'N/A',
                    'worker_detail': serialize_user_summary(bundle.worker),
                    'total_claimed_amount': str(bundle.total_claimed_amount),
                    'status': bundle.status,
                    'period_from': str(bundle.period_from) if bundle.period_from else None,
                    'period_to': str(bundle.period_to) if bundle.period_to else None,
                    'remarks': bundle.remarks or '',
                    'ticket': b_ticket,
                    'ticket_details': b_ticket,
                    'expenses': bundle_expenses,
                })

            # Serialize direct ledger expenses (if any)
            ledger_expenses = list(obj.ledger.expenses.all())
            expenses_list = []
            for exp in ledger_expenses:
                t_info = serialize_ticket_summary(exp.ticket)
                if t_info and exp.ticket.ticket_id not in seen_tids:
                    seen_tids.add(exp.ticket.ticket_id)
                    tickets_list.append(t_info)

                expenses_list.append({
                    'expense_id': exp.expense_id,
                    'amount': str(exp.amount),
                    'expense_date': str(exp.expense_date) if exp.expense_date else None,
                    'expense_type_name': exp.expense_type.expense_name if exp.expense_type else '',
                    'expense_type_detail': {'expense_name': exp.expense_type.expense_name} if exp.expense_type else None,
                    'remarks': exp.remarks or '',
                    'worker': exp.worker.full_name or exp.worker.username if exp.worker else 'N/A',
                    'worker_detail': serialize_user_summary(exp.worker),
                    'added_by': exp.added_by.full_name or exp.added_by.username if exp.added_by else None,
                    'added_by_detail': serialize_user_summary(exp.added_by),
                    'store_name': exp.responsible_store.store_name if exp.responsible_store else (exp.ticket.store.store_name if exp.ticket and exp.ticket.store else None),
                    'store_type': exp.responsible_store.type if exp.responsible_store else (exp.ticket.store.type if exp.ticket and exp.ticket.store else None),
                    'ticket': t_info,
                    'ticket_details': t_info,
                    'receipts': [serialize_receipt_summary(r) for r in exp.receipts.all()] if hasattr(exp, 'receipts') else []
                })

            return {
                'type': 'Ledger',
                'id': obj.ledger.ledger_id,
                'label': f"Ledger Batch #{obj.ledger.ledger_id}",
                'amount': str(obj.ledger.total_amount),
                'store_name': obj.ledger.store.store_name if obj.ledger.store else 'General Location',
                'tickets': tickets_list,
                'remarks': obj.ledger.remarks or '',
                'bundles': bundles_list,
                'expenses': expenses_list,
            }
        elif obj.expense:
            exp = obj.expense
            st = exp.responsible_store or (
                exp.ticket.store if exp.ticket else None)
            ticket_info = None
            if exp.ticket:
                ticket_info = {
                    'ticket_id': exp.ticket.ticket_id,
                    'work_order_no': exp.ticket.work_order_no,
                    'title': exp.ticket.title,
                }

            receipts_data = []
            if hasattr(exp, 'receipts'):
                receipts_data = [serialize_receipt_summary(r) for r in exp.receipts.all()]

            ticket_attachments = []
            if exp.ticket and hasattr(exp.ticket, 'attachments'):
                ticket_attachments = [serialize_receipt_summary(a) for a in exp.ticket.attachments.all()]

            return {
                'type': 'Expense',
                'id': exp.expense_id,
                'label': f"Single Expense {exp.expense_id}",
                'worker': exp.worker.full_name or exp.worker.username if exp.worker else 'N/A',
                'amount': str(exp.amount),
                'store_name': st.store_name if st else 'General Location',
                'expense_date': str(exp.expense_date) if exp.expense_date else None,
                'expense_type_name': exp.expense_type.expense_name if exp.expense_type else '',
                'remarks': exp.remarks or '',
                'ticket': ticket_info,
                'receipts': receipts_data,
                'ticket_attachments': ticket_attachments,
            }
        return None


class AuditEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(
        source='actor.username', read_only=True)

    class Meta:
        model = AuditEvent
        fields = '__all__'


class PaymentSerializer(serializers.ModelSerializer):
    paid_by_username = serializers.CharField(
        source='paid_by.username', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
