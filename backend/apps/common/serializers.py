from rest_framework import serializers
from .models import MediaCategory, Media, Notification, DashboardUpdate
from apps.accounts.models import Role
from apps.accounts.models import CustomUser


class MediaCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaCategory
        fields = '__all__'
        depth = 1


class MediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = "__all__"
        depth = 1

    def get_file_url(self, obj):
        if not obj.file_url:
            return ""
        url = obj.file_url.url
        if obj.uploaded_date:
            ts = int(obj.uploaded_date.timestamp())
            return f"{url}?v={ts}"
        return url

class MediaWriteSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.PrimaryKeyRelatedField(
        queryset=CustomUser.objects.all(), required=False
    )

    class Meta:
        model = Media
        fields = "__all__"

    def validate(self, data):
        # Support both create and update
        ticket = data.get("ticket") or getattr(self.instance, "ticket", None)
        category = data.get("category") or getattr(self.instance, "category", None)
        complaint = data.get("complaint") or getattr(self.instance, "complaint", None)

        if not ticket and complaint and getattr(complaint, "ticket", None):
            data["ticket"] = complaint.ticket
            ticket = complaint.ticket

        if ticket and category and category.department_id != ticket.department_id:
            matching_cat = MediaCategory.objects.filter(
                department=ticket.department,
                category_name__iexact=category.category_name
            ).first()
            if matching_cat:
                data["category"] = matching_cat
            else:
                raise serializers.ValidationError({"category": f"Category '{category.category_name}' does not belong to department '{ticket.department.department_name}'."})

        return data


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'


class RoleMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['role_id', 'role_name']


class DashboardUpdateSerializer(serializers.ModelSerializer):
    roles = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Role.objects.all(),
        required=False
    )
    roles_details = RoleMiniSerializer(source='roles', many=True, read_only=True)
    is_active = serializers.BooleanField(default=True, required=False)
    is_visible = serializers.BooleanField(read_only=True)

    class Meta:
        model = DashboardUpdate
        fields = [
            'id',
            'title',
            'description',
            'roles',
            'roles_details',
            'video_url',
            'is_vertical',
            'hide_after',
            'is_active',
            'priority',
            'created_at',
            'is_visible',
        ]
