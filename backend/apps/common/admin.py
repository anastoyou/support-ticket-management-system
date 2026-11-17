from .models import DashboardUpdate
from django.contrib import admin
from unfold.contrib.filters.admin import AutocompleteSelectFilter
from apps.common.admin_mixins import SearchableModelAdmin
from .models import MediaCategory, Media, Notification, PushSubscription


@admin.register(MediaCategory)
class MediaCategoryAdmin(SearchableModelAdmin):
    list_display = ('category_id', 'department', 'category_name')
    list_filter = (('department', AutocompleteSelectFilter),)
    search_fields = ('category_name',)
    autocomplete_fields = ('department',)


@admin.register(Media)
class MediaAdmin(SearchableModelAdmin):
    list_display = ('media_id', 'file_name', 'ticket',
                    'uploaded_by', 'category', 'uploaded_date')
    list_filter = (('category', AutocompleteSelectFilter), 'uploaded_date')
    search_fields = ('file_name', 'ticket__work_order_no',
                     'uploaded_by__username')
    autocomplete_fields = ('ticket', 'uploaded_by', 'category', 'expense')


@admin.register(Notification)
class NotificationAdmin(SearchableModelAdmin):
    list_display = ('notification_id', 'user', 'ticket',
                    'notification_type', 'title', 'is_read', 'created_date')
    list_filter = ('notification_type', 'is_read', 'created_date')
    search_fields = ('user__username',
                     'ticket__work_order_no', 'title', 'message')
    autocomplete_fields = ('user', 'ticket')


@admin.register(DashboardUpdate)
class DashboardUpdateAdmin(SearchableModelAdmin):
    list_display = (
        'title',
        'is_vertical',
        'is_active',
        'priority',
        'hide_after',
        'is_visible',
        'created_at',
    )

    list_editable = (
        'is_vertical',
        'is_active',
        'priority',
    )

    list_filter = (
        'is_active',
        'is_vertical',
        ('roles', AutocompleteSelectFilter),
        'created_at',
    )

    search_fields = (
        'title',
        'description',
    )

    filter_horizontal = ('roles',)

    ordering = ('-priority', '-created_at')

    readonly_fields = (
        'created_at',
        'is_visible',
    )

    fieldsets = (
        ('Basic Information', {
            'fields': (
                'title',
                'description',
                'roles',
            )
        }),
        ('Media & Orientation', {
            'fields': (
                'video_url',
                'is_vertical',
            )
        }),
        ('Visibility & Settings', {
            'fields': (
                'is_active',
                'priority',
                'hide_after',
            )
        }),
        ('Metadata', {
            'fields': (
                'created_at',
                'is_visible',
            )
        }),
    )


@admin.register(PushSubscription)
class PushSubscriptionAdmin(SearchableModelAdmin):
    list_display = ('subscription_id', 'user', 'is_active', 'created_date')
    list_filter = ('is_active', 'created_date')
    search_fields = ('user__username', 'endpoint')
    autocomplete_fields = ('user',)
