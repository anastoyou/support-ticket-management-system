from rest_framework import serializers
from .models import Priority, Status, WorkNature, NatureWorker, Ticket, Allocation, WorkLog, TicketHistory, TicketChatMessage, ComplaintIssueType, Complaint
from apps.finance.models import EmployeeRate
from decimal import Decimal
from apps.stores.serializers import StoreSerializer, DepartmentSerializer, SubDepartmentSerializer
from apps.stores.models import Store
from apps.accounts.models import CustomUser


from apps.accounts.serializers import RoleSerializer


class TicketUserSerializer(serializers.ModelSerializer):
    sub_departments = SubDepartmentSerializer(many=True, read_only=True)
    role = RoleSerializer(read_only=True)

    class Meta:
        model = CustomUser
        fields = [
            'user_id', 'username', 'email', 'employee_no', 'full_name',
            'phone', 'whatsapp_number', 'profile_image', 'role', 'sub_departments'
        ]


class AllocationTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['ticket_id', 'work_order_no', 'title', 'status']


class PrioritySerializer(serializers.ModelSerializer):
    department_detail = DepartmentSerializer(source='department', read_only=True)

    class Meta:
        model = Priority
        fields = ['priority_id', 'department', 'department_detail', 'priority_name', 'level']


class StatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Status
        fields = '__all__'


class WorkNatureSerializer(serializers.ModelSerializer):
    sub_department = SubDepartmentSerializer(read_only=True)
    default_priority = PrioritySerializer(read_only=True)

    class Meta:
        model = WorkNature
        fields = '__all__'


class WorkNatureWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkNature
        fields = '__all__'


class NatureWorkerSerializer(serializers.ModelSerializer):
    worker = TicketUserSerializer(read_only=True)
    nature = WorkNatureSerializer(read_only=True)

    class Meta:
        model = NatureWorker
        fields = '__all__'


class NatureWorkerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = NatureWorker
        fields = '__all__'


class TicketSerializer(serializers.ModelSerializer):
    allocations = serializers.SerializerMethodField()
    age_days = serializers.SerializerMethodField()
    ticket_age_days = serializers.SerializerMethodField()
    complaints_count = serializers.IntegerField(source="complaints.count", read_only=True)

    store = StoreSerializer(read_only=True)
    department = DepartmentSerializer(read_only=True)
    nature = WorkNatureSerializer(read_only=True)
    priority = PrioritySerializer(read_only=True)
    status = StatusSerializer(read_only=True)
    created_by = TicketUserSerializer(read_only=True)
    approved_by = TicketUserSerializer(read_only=True)
    rejected_by = TicketUserSerializer(read_only=True)
    closed_by = TicketUserSerializer(read_only=True)
    location_approved_by = TicketUserSerializer(read_only=True)

    class Meta:
        model = Ticket
        fields = '__all__'

    def get_allocations(self, obj):
        return AllocationSerializer(obj.allocations.all(), many=True).data

    def get_age_days(self, obj):
        from django.utils import timezone
        # Use cached history from Prefetch to prevent N+1 DB hits
        cached_history = getattr(obj, 'cached_history', None)
        if cached_history is not None:
            last_history = cached_history[0] if cached_history else None
        else:
            last_history = obj.history.order_by('-changed_date').first()

        if not last_history:
            return 0.0
        now = timezone.now()
        duration = now - last_history.changed_date
        return round(duration.total_seconds() / 86400.0, 4)

    def get_ticket_age_days(self, obj):
        from django.utils import timezone
        if not obj.created_date:
            return 0.0
        now = timezone.now()
        duration = now - obj.created_date
        return round(duration.total_seconds() / 86400.0, 4)

    def validate(self, data):
        department = data.get('department')
        priority = data.get('priority')
        status = data.get('status')
        nature = data.get('nature')

        if priority and department and priority.department != department:
            raise serializers.ValidationError(
                {"priority": f"Priority '{priority.priority_name}' does not belong to department '{department.department_name}'."}
            )
        if nature and department and nature.sub_department.department != department:
            raise serializers.ValidationError(
                {"nature": f"Work Nature '{nature.nature_name}' belongs to a different department than '{department.department_name}'."}
            )
        return data


class TicketWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = '__all__'
        extra_kwargs = {
            'work_order_no': {'required': False},
            'created_by': {'required': False},
            'status': {'required': False},
            'priority': {'required': False},
        }

    def validate(self, data):
        store = data.get('store') or (getattr(self.instance, 'store', None) if self.instance else None)
        department = data.get('department') or getattr(self.instance, 'department', None)
        nature = data.get('nature') or getattr(self.instance, 'nature', None)
        priority = data.get('priority') or getattr(self.instance, 'priority', None)
        status = data.get('status') or getattr(self.instance, 'status', None)
        created_by = data.get('created_by') or getattr(self.instance, 'created_by', None)

        if not created_by and 'request' in self.context and self.context['request'].user and not self.context['request'].user.is_anonymous:
            data['created_by'] = self.context['request'].user
            created_by = data['created_by']

        # Multi-tier fallback for priority
        if not priority:
            from .models import Priority
            p_obj = None
            if nature and nature.default_priority:
                p_obj = nature.default_priority
            if not p_obj and department:
                p_obj = Priority.objects.filter(department=department).order_by('level', 'priority_id').first()
            if not p_obj:
                p_obj = Priority.objects.filter(priority_name__iexact='Normal').first() or Priority.objects.first()
            if not p_obj and department:
                p_obj = Priority.objects.create(department=department, priority_name='Normal', level=1)
            
            if p_obj:
                data['priority'] = p_obj
                priority = p_obj

        # Multi-tier fallback for status
        if not status:
            from .models import Status
            s_obj = Status.objects.filter(status_name__iexact='Open').first() or Status.objects.order_by('status_id').first()
            if not s_obj:
                s_obj = Status.objects.create(status_name='Open')
            
            if s_obj:
                data['status'] = s_obj
                status = s_obj

        if self.instance and getattr(self.instance, 'work_order_no', None) and 'work_order_no' not in data:
            data['work_order_no'] = self.instance.work_order_no
        elif not data.get('work_order_no'):
            from .utils import generate_work_order_no
            data['work_order_no'] = generate_work_order_no(store)

        if priority and department and priority.department != department:
            from .models import Priority
            matching_p = Priority.objects.filter(department=department).first()
            if matching_p:
                data['priority'] = matching_p

        if nature and department and nature.sub_department.department != department:
            raise serializers.ValidationError(
                {"nature": f"Work Nature '{nature.nature_name}' belongs to a different department than '{department.department_name}'."}
            )

        # Prohibit creating new tickets if Store has reached the Location Approval throttle limit (exempt Office Admin & Administrator)
        if not self.instance and store and department:
            request = self.context.get('request')
            user = request.user if request else getattr(self.instance, '_changed_by', None)
            from .utils import is_admin_or_office_admin
            if not is_admin_or_office_admin(user):
                from apps.stores.models import check_location_approval_throttle
                throttle_info = check_location_approval_throttle(store, department)
                if throttle_info.get('is_throttled'):
                    count = throttle_info.get('count', 0)
                    limit = throttle_info.get('limit', 0)
                    store_name = getattr(store, 'store_name', str(store))
                    dept_name = getattr(department, 'department_name', str(department))
                    raise serializers.ValidationError({
                        "store": f"Cannot create new ticket: Store '{store_name}' has reached the pending Location Approval limit ({count}/{limit}) for department '{dept_name}'. You must review and approve existing pending tickets before creating new requests."
                    })


        # Strictly prohibit moving to Location Approval if any allocated worker has not logged work hours (exempt Office Admin & Administrator)
        if status and status.status_name.strip().lower() == 'location approval':
            request = self.context.get('request')
            user = request.user if request else getattr(self.instance, '_changed_by', None)
            from .utils import is_admin_or_office_admin
            if not is_admin_or_office_admin(user):
                if self.instance:
                    allocations = self.instance.allocations.all()
                    if not allocations.exists():
                        raise serializers.ValidationError({
                            "status": "Cannot move ticket to Location Approval: No workers are allocated to this ticket. At least one worker must be assigned and have logged work hours."
                        })
                    missing_workers = []
                    for alloc in allocations:
                        if not self.instance.work_logs.filter(worker=alloc.worker).exists():
                            name = alloc.worker.full_name or alloc.worker.username or f"Worker #{alloc.worker.pk}"
                            missing_workers.append(name)
                    if missing_workers:
                        raise serializers.ValidationError({
                            "status": f"Cannot move ticket to Location Approval: The following allocated worker(s) have not logged their work hours: {', '.join(missing_workers)}. All allocated workers must log their work hours before applying for location approval."
                        })

        return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if hasattr(instance, '_deleted_warnings'):
            data['deleted_warnings'] = instance._deleted_warnings
        return data

    def create(self, validated_data):
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            return super().create(validated_data)
        except DjangoValidationError as e:
            raise serializers.ValidationError(detail=e.messages if hasattr(e, 'messages') else str(e))

    def update(self, instance, validated_data):
        request = self.context.get('request')
        user = request.user if request else None
        if user and not user.is_anonymous:
            instance._changed_by = user
        remarks = validated_data.get('reject_reason') or validated_data.get('location_reject_reason') or getattr(instance, '_remarks', '')
        if remarks:
            instance._remarks = remarks
            
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as e:
            raise serializers.ValidationError(detail=e.messages if hasattr(e, 'messages') else str(e))




class AllocationSerializer(serializers.ModelSerializer):
    worker = TicketUserSerializer(read_only=True)
    ticket = AllocationTicketSerializer(read_only=True)

    class Meta:
        model = Allocation
        fields = '__all__'

class AllocationWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allocation
        fields = '__all__'


class WorkLogStoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ['store_id', 'store_name', 'short_code']


class WorkLogSerializer(serializers.ModelSerializer):
    worker = TicketUserSerializer(read_only=True)
    ticket = AllocationTicketSerializer(read_only=True)
    allocation = AllocationSerializer(read_only=True)
    stores = WorkLogStoreSerializer(many=True, read_only=True)

    class Meta:
        model = WorkLog
        fields = '__all__'

class WorkLogWriteSerializer(serializers.ModelSerializer):
    stores = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Store.objects.all(), required=False
    )
    class Meta:
        model = WorkLog
        fields = '__all__'
        # hourly_rate and labour_amount are auto-computed; mark them optional on input
        extra_kwargs = {
            'ticket': {'required': False, 'allow_null': True},
            'worker': {'required': False},
            'hourly_rate': {'required': False},
            'labour_amount': {'required': False},
            'hours': {'required': False},
            'from_time': {'required': False, 'allow_null': True},
            'to_time': {'required': False, 'allow_null': True},
            'work_done': {'required': False, 'allow_blank': True},
            'log_type': {'required': False},
        }

    def _get_rate(self, worker):
        """Return the most recent active EmployeeRate for the given worker, or None."""
        rate = (
            EmployeeRate.objects
            .filter(worker=worker)
            .order_by('-effective_from')
            .first()
        )
        return rate

    def validate(self, data):
        if 'log_type' not in data:
            data['log_type'] = 'ticket' if (data.get('ticket') or getattr(self.instance, 'ticket', None)) else 'timesheet'
        from_time = data.get('from_time') if 'from_time' in data else getattr(self.instance, 'from_time', None)
        to_time = data.get('to_time') if 'to_time' in data else getattr(self.instance, 'to_time', None)
        hours = data.get('hours') if 'hours' in data else getattr(self.instance, 'hours', None)

        if from_time and to_time:
            from datetime import datetime, date, timedelta
            dummy_date = date.today()
            dt_start = datetime.combine(dummy_date, from_time)
            dt_end = datetime.combine(dummy_date, to_time)
            if dt_end < dt_start:
                # Spans overnight into next morning
                dt_end = datetime.combine(dummy_date + timedelta(days=1), to_time)
            diff_seconds = (dt_end - dt_start).total_seconds()
            calculated_hours = round(Decimal(str(diff_seconds / 3600.0)), 2)
            if 'hours' not in data or data.get('hours') is None or data.get('hours') == '':
                data['hours'] = calculated_hours
                hours = calculated_hours
            else:
                hours = data.get('hours')

        if hours is None or Decimal(str(hours)) < 0:
            raise serializers.ValidationError({"hours": "Logged work hours cannot be negative."})
        if Decimal(str(hours)) > 20:
            raise serializers.ValidationError({"hours": "Logged work hours cannot exceed 20 hours."})

        req_user = self.context.get('request').user if getattr(self, 'context', None) and self.context.get('request') and not self.context.get('request').user.is_anonymous else None
        worker = data.get('worker') or req_user or getattr(self.instance, 'worker', None)
        if worker and hours is not None:
            rate = self._get_rate(worker)
            hourly_rate = rate.hourly_rate if rate else Decimal('0.00')
            data['hourly_rate'] = hourly_rate
            data['labour_amount'] = Decimal(str(hours)) * hourly_rate

        ticket = data.get('ticket') or getattr(self.instance, 'ticket', None)
        if not data.get('allocation') and worker and ticket:
            from .models import Allocation
            alloc = Allocation.objects.filter(ticket=ticket, worker=worker).first()
            if alloc:
                data['allocation'] = alloc
        return data


class TicketHistorySerializer(serializers.ModelSerializer):
    changed_by = TicketUserSerializer(read_only=True)
    ticket = AllocationTicketSerializer(read_only=True)

    class Meta:
        model = TicketHistory
        fields = '__all__'


class TicketChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketChatMessage
        fields = '__all__'

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if instance.sender:
            rep['sender'] = {
                'user_id': instance.sender.user_id,
                'username': instance.sender.username,
                'full_name': instance.sender.full_name,
                'employee_no': instance.sender.employee_no,
                'profile_image': instance.sender.profile_image.url if instance.sender.profile_image else None,
                'role': {
                    'role_id': instance.sender.role.role_id,
                    'role_name': instance.sender.role.role_name
                } if instance.sender.role else None
            }
        return rep



class ComplaintIssueTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplaintIssueType
        fields = ['issue_type_id', 'name', 'role_type', 'is_active', 'created_at']


class ComplaintMediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        from apps.common.models import Media
        model = Media
        fields = ['media_id', 'file_name', 'file_url', 'rotation', 'uploaded_date']

    def get_file_url(self, obj):
        if not obj.file_url:
            return ""
        url = obj.file_url.url
        if obj.uploaded_date:
            ts = int(obj.uploaded_date.timestamp())
            return f"{url}?v={ts}"
        return url


class ComplaintTicketSimpleSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.store_name', read_only=True)
    department_name = serializers.CharField(source='department.department_name', read_only=True)
    status_name = serializers.CharField(source='status.status_name', read_only=True)

    class Meta:
        model = Ticket
        fields = ['ticket_id', 'work_order_no', 'title', 'store_name', 'department_name', 'status_name']


class ComplaintSerializer(serializers.ModelSerializer):
    ticket = ComplaintTicketSimpleSerializer(read_only=True)
    ticket_id = serializers.PrimaryKeyRelatedField(
        queryset=Ticket.objects.all(), source='ticket', write_only=True)
    related_tickets = ComplaintTicketSimpleSerializer(many=True, read_only=True)
    related_ticket_ids = serializers.PrimaryKeyRelatedField(
        queryset=Ticket.objects.all(), many=True, source='related_tickets', required=False, write_only=True)
    complainant = TicketUserSerializer(read_only=True)
    against_user = TicketUserSerializer(read_only=True)
    against_user_id = serializers.PrimaryKeyRelatedField(
        queryset=CustomUser.objects.all(), source='against_user', write_only=True)
    issue_type = ComplaintIssueTypeSerializer(read_only=True)
    issue_type_id = serializers.PrimaryKeyRelatedField(
        queryset=ComplaintIssueType.objects.all(), source='issue_type', required=False, allow_null=True, write_only=True)
    media_files = ComplaintMediaSerializer(many=True, read_only=True)
    issue_display = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = [
            'complaint_id',
            'complaint_type',
            'ticket',
            'ticket_id',
            'related_tickets',
            'related_ticket_ids',
            'complainant',
            'against_user',
            'against_user_id',
            'issue_type',
            'issue_type_id',
            'custom_issue',
            'issue_display',
            'description',
            'status',
            'resolution_notes',
            'media_files',
            'created_at',
            'updated_at',
        ]

    def get_issue_display(self, obj):
        if obj.issue_type:
            return obj.issue_type.name
        return obj.custom_issue or 'Complaint'
