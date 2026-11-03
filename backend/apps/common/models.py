from django.db import models
from django.dispatch import receiver


class MediaCategory(models.Model):
    category_id = models.AutoField(primary_key=True)
    department = models.ForeignKey(
        'stores.Department', on_delete=models.CASCADE, related_name='media_categories')
    category_name = models.CharField(max_length=100)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['department', 'category_name'], name='unique_department_category_name')
        ]
        permissions = [
            ("view_category_name", "Can view category name"),
            ("change_category_name", "Can change category name"),
        ]

    def __str__(self):
        return self.category_name


def get_media_upload_path(instance, filename):
    category_slug = instance.category.category_name.lower().replace(
        ' ', '_') if instance.category else ('complaint' if getattr(instance, 'complaint', None) else 'general')

    # Resolve the ticket directly
    ticket = instance.ticket
    if not ticket and getattr(instance, 'complaint', None) and instance.complaint.ticket:
        ticket = instance.complaint.ticket

    import os
    name, ext = os.path.splitext(filename)
    if len(name) > 60:
        name = name[:60]
    safe_filename = f"{name}{ext}"

    if ticket:
        store_slug = ticket.store.store_name.lower().replace(
            ' ', '_') if ticket.store else 'unknown_store'
        return f"stores/{store_slug}/tickets/ticket_{ticket.ticket_id}/{category_slug}/{safe_filename}"
    return f"general/{category_slug}/{safe_filename}"


class Media(models.Model):
    media_id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey('maintenance.Ticket', on_delete=models.CASCADE,
                               null=True, blank=True, related_name='attachments')
    uploaded_by = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='uploaded_media')
    category = models.ForeignKey(
        MediaCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='media_files')
    expense = models.ForeignKey(
        'finance.Expense', on_delete=models.SET_NULL, null=True, blank=True, related_name='receipts')
    complaint = models.ForeignKey(
        'maintenance.Complaint', on_delete=models.CASCADE, null=True, blank=True, related_name='media_files')
    file_name = models.CharField(max_length=500)
    file_url = models.FileField(upload_to=get_media_upload_path, max_length=500)
    rotation = models.IntegerField(default=0)
    uploaded_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        permissions = [
            ("view_ticket", "Can view ticket"),
            ("change_ticket", "Can change ticket"),
            ("view_uploaded_by", "Can view uploaded by"),
            ("change_uploaded_by", "Can change uploaded by"),
            ("view_category", "Can view category"),
            ("change_category", "Can change category"),
            ("view_file_name", "Can view file name"),
            ("change_file_name", "Can change file name"),
            ("view_file_url", "Can view file url"),
            ("change_file_url", "Can change file url"),
        ]

    def __str__(self):
        return self.file_name


class Notification(models.Model):
    notification_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        'accounts.CustomUser', on_delete=models.CASCADE, related_name='notifications')
    ticket = models.ForeignKey('maintenance.Ticket', on_delete=models.CASCADE,
                               null=True, blank=True, related_name='notifications')
    notification_type = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    message = models.TextField()
    image = models.TextField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        permissions = [
            ("view_user", "Can view user"),
            ("change_user", "Can change user"),
            ("view_ticket", "Can view ticket"),
            ("change_ticket", "Can change ticket"),
            ("view_notification_type", "Can view notification type"),
            ("change_notification_type", "Can change notification type"),
            ("view_title", "Can view title"),
            ("change_title", "Can change title"),
            ("view_message", "Can view message"),
            ("change_message", "Can change message"),
            ("view_is_read", "Can view is read"),
            ("change_is_read", "Can change is read"),
        ]

    def __str__(self):
        return f"Notif {self.notification_id} for {self.user.username} - {self.title}"


class PushSubscription(models.Model):
    subscription_id = models.AutoField(primary_key=True)

    user = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.CASCADE,
        related_name='push_subscriptions'
    )

    endpoint = models.TextField(unique=True)

    p256dh = models.TextField()

    auth = models.TextField()

    created_date = models.DateTimeField(auto_now_add=True)

    updated_date = models.DateTimeField(auto_now=True)

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'push_subscriptions'

    def __str__(self):
        return f"Push subscription for {self.user.username}"


@receiver(models.signals.post_save, sender=Notification)
def send_push_on_notification_create(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return
    if created:
        try:
            from apps.common.services import send_push_notification
            send_push_notification(instance)
        except Exception as err:
            print("Failed to send push notification:", err)

        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            from apps.common.serializers import NotificationSerializer

            channel_layer = get_channel_layer()
            if channel_layer:
                serializer = NotificationSerializer(instance)
                notif_data = serializer.data

                group_name = f"user_{instance.user_id}"
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "notification",
                        "notification_data": notif_data,
                    }
                )
        except Exception as wse:
            print("Failed to broadcast WebSocket notification:", wse)


@receiver(models.signals.post_save, sender=Media)
def compress_media_on_create(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return
    if created and instance.file_url:
        try:
            from apps.common.views import watermark_media_instance
            watermark_media_instance(instance)
        except Exception as w_err:
            print("Failed to watermark media on creation:", w_err)

        try:
            from apps.common.services import compress_media_file_async
            file_path = instance.file_url.path
            compress_media_file_async(file_path)
        except Exception as err:
            print("Failed to start media compression:", err)
