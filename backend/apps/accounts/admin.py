from django.contrib.auth.models import Permission, Group
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Role, CustomUser, PasswordResetOTP, WhatsAppLog


from django.utils.html import format_html
from django.utils.safestring import mark_safe

from unfold.admin import ModelAdmin


@admin.register(Role)
class RoleAdmin(ModelAdmin):
    list_display = ('role_id', 'role_name')
    search_fields = ('role_name',)


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ('user_id', 'profile_image_preview', 'username', 'email', 'employee_no', 'full_name',
                    'phone', 'whatsapp_number', 'role', 'profile_updated_at', 'active', 'is_staff')
    list_filter = ('active', 'is_staff', 'is_superuser', 'role')
    search_fields = ('username', 'email', 'employee_no', 'full_name', 'phone')
    readonly_fields = ('profile_updated_at',
                       'profile_image_preview', 'profile_image_detail')

    def profile_image_preview(self, obj):
        if obj.profile_image:
            return format_html(
                '<a href="{0}" target="_blank">'
                '<img src="{0}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid #1A73E8; vertical-align: middle;" title="Click to view full image" />'
                '</a>',
                obj.profile_image.url
            )
        return mark_safe('<span style="color: #999; font-size: 11px;">No Image</span>')
    profile_image_preview.short_description = 'Profile Image'

    def profile_image_detail(self, obj):
        if obj.profile_image:
            return format_html(
                '<div style="margin-top: 5px;">'
                '<a href="{0}" target="_blank">'
                '<img src="{0}" style="max-width: 120px; max-height: 120px; border-radius: 8px; object-fit: cover; border: 1px solid #ccc; box-shadow: 0 2px 5px rgba(0,0,0,0.15);" />'
                '</a>'
                '<br/><a href="{0}" target="_blank" style="font-size: 11px; margin-top: 4px; display: inline-block;">View full image ↗</a>'
                '</div>',
                obj.profile_image.url
            )
        return "No image uploaded"
    profile_image_detail.short_description = 'Current Image Preview'

    fieldsets = UserAdmin.fieldsets + (
        ('Custom Info', {
            'fields': ('employee_no', 'full_name', 'phone', 'whatsapp_number', 'profile_image', 'profile_image_detail', 'role', 'accessible_stores', 'sub_departments', 'profile_updated_at', 'active')
        }),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Custom Info', {
            'fields': ('employee_no', 'full_name', 'phone', 'whatsapp_number', 'profile_image', 'role', 'accessible_stores', 'sub_departments', 'profile_updated_at', 'active')
        }),
    )
    filter_horizontal = ('groups', 'user_permissions',
                         'accessible_stores', 'sub_departments')


@admin.register(PasswordResetOTP)
class PasswordResetOTPAdmin(ModelAdmin):
    list_display = ('user', 'otp', 'is_used', 'created_at')
    list_filter = ('is_used', 'created_at')
    search_fields = ('user__username', 'user__employee_no', 'otp')
    readonly_fields = ('created_at',)


@admin.register(WhatsAppLog)
class WhatsAppLogAdmin(ModelAdmin):
    list_display = ('whatsapp_number', 'user',
                    'message_type', 'status', 'created_at')
    list_filter = ('status', 'message_type', 'created_at')
    search_fields = ('whatsapp_number', 'user__username',
                     'user__employee_no', 'otp')
    readonly_fields = ('created_at',)


@admin.register(Permission)
class PermissionAdmin(ModelAdmin):
    list_display = ("id", "name", "codename", "content_type")
    list_filter = ("content_type",)
    search_fields = ("name", "codename")
    ordering = ("content_type", "codename")
    list_select_related = ("content_type",)


# admin.site.unregister(Group)


# @admin.register(Group)
# class GroupAdmin(ModelAdmin):
#     list_display = ("id", "name")
#     search_fields = ("name",)
#     ordering = ("name",)
#     filter_horizontal = ("permissions",)
