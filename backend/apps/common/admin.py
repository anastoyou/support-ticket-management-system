from .models import DashboardUpdate
from django.contrib import admin
from .models import MediaCategory, Media, Notification, PushSubscription


@admin.register(MediaCategory)
class MediaCategoryAdmin(admin.ModelAdmin):
    list_display = ('category_id', 'department', 'category_name')
    list_filter = ('department',)
    search_fields = ('category_name',)


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ('media_id', 'file_name', 'ticket',
                    'uploaded_by', 'category', 'uploaded_date')
    list_filter = ('category', 'uploaded_date')
    search_fields = ('file_name', 'ticket__work_order_no',
                     'uploaded_by__username')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('notification_id', 'user', 'ticket',
                    'notification_type', 'title', 'is_read', 'created_date')
    list_filter = ('notification_type', 'is_read', 'created_date')
    search_fields = ('user__username',
                     'ticket__work_order_no', 'title', 'message')


@admin.register(DashboardUpdate)
class DashboardUpdateAdmin(admin.ModelAdmin):
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

    fields = (
        'title',
        'description',
        'video_url',
        'is_vertical',
        'roles',
        'is_active',
        'priority',
        'hide_after',
        'created_at',
    )

    list_filter = (
        'is_active',
        'is_vertical',
        'roles',
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

    list_editable = (
        'is_active',
        'priority',
    )

    fieldsets = (
        ('Basic Information', {
            'fields': (
                'title',
                'description',
                'roles',
            )
        }),
        ('Media', {
            'fields': ('video_url',)
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


admin.site.register(PushSubscription)
