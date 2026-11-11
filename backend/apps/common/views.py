from rest_framework.decorators import action
from django.conf import settings
from django.utils import timezone
import os
import shutil
import hashlib
import hmac
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
import threading
import subprocess
from .models import PushSubscription
import json
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from .models import MediaCategory, Media, Notification, DashboardUpdate
from django.db.models import Q
from rest_framework import exceptions
from .serializers import MediaCategorySerializer, MediaSerializer, NotificationSerializer, MediaWriteSerializer, DashboardUpdateSerializer
from apps.stores.models import SubDepartment
from rest_framework.exceptions import ValidationError


class MediaCategoryViewSet(viewsets.ModelViewSet):
    queryset = MediaCategory.objects.all()
    serializer_class = MediaCategorySerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        sub_department_id = self.request.query_params.get("department")

        if sub_department_id:
            try:
                sub_department = SubDepartment.objects.select_related("department").get(
                    pk=sub_department_id
                )
                queryset = queryset.filter(
                    department=sub_department.department)
            except SubDepartment.DoesNotExist:
                raise ValidationError(
                    {"department": "Invalid sub-department ID."}
                )

        return queryset


def replace_or_copy(temp_path, target_path):
    if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
        return False
    try:
        os.replace(temp_path, target_path)
        return True
    except (PermissionError, OSError):
        pass

    try:
        shutil.copyfile(temp_path, target_path)
        try:
            os.remove(temp_path)
        except Exception:
            pass
        return True
    except Exception as err:
        print("replace_or_copy error:", err)
        return False


def rotate_video_file(file_path, angle):
    """
    Physically transposes video frame pixels upright using FFmpeg so watermark is stamped at the correct bottom-left location.
    """
    if not os.path.exists(file_path):
        return False

    angle = angle % 360
    if angle == 0:
        return True

    temp_path = file_path + ".tmp_rotated.mp4"
    ffmpeg_cmd = "ffmpeg"
    if os.path.exists(r"C:\ffmpeg\bin\ffmpeg.exe"):
        ffmpeg_cmd = r"C:\ffmpeg\bin\ffmpeg.exe"

    vf = "transpose=1"
    if angle == 180:
        vf = "transpose=1,transpose=1"
    elif angle == 270:
        vf = "transpose=2"

    try:
        cmd = [
            ffmpeg_cmd, "-y", "-i", file_path,
            "-vf", vf,
            "-metadata:s:v:0", "rotate=0",
            "-c:a", "copy",
            temp_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            # Fallback for silent / audio-less videos
            cmd = [
                ffmpeg_cmd, "-y", "-i", file_path,
                "-vf", vf,
                "-metadata:s:v:0", "rotate=0",
                temp_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)

        if res.returncode == 0 and os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
            if replace_or_copy(temp_path, file_path):
                return True
    except Exception as e:
        print("FFmpeg physical video rotation error:", e)

    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass
    return False


def add_image_watermark(file_path, firstname, date_str, location, ticket_no=""):
    """
    Stamps proof text (Ticket , First Name, Date/Time, Location) onto the bottom-left corner of an image file.
    """
    if not os.path.exists(file_path):
        return False
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
        with Image.open(file_path) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert('RGB')
            W, H = img.size

            font_size = max(16, int(min(W, H) * 0.033))
            font_path = r"C:\Windows\Fonts\arial.ttf"
            if not os.path.exists(font_path):
                font_path = "arial.ttf"

            try:
                font = ImageFont.truetype(font_path, font_size)
            except Exception:
                font = ImageFont.load_default()

            lines = []
            if ticket_no:
                lines.append(ticket_no)
            lines.extend([
                f"Uploaded by: {firstname}",
                f"Date: {date_str}",
                f"Location: {location}"
            ])

            draw = ImageDraw.Draw(img)
            line_heights = []
            line_widths = []
            for line in lines:
                bbox = draw.textbbox((0, 0), line, font=font)
                w = bbox[2] - bbox[0]
                h = bbox[3] - bbox[1]
                line_widths.append(w)
                line_heights.append(h + int(font_size * 0.2))

            max_w = max(line_widths)
            total_h = sum(line_heights)

            padding = max(4, font_size // 3)
            margin_left = max(6, W // 120)
            margin_bottom = max(6, H // 120)

            box_x1 = margin_left
            box_y2 = H - margin_bottom
            box_x2 = min(W, box_x1 + max_w + (padding * 2))
            box_y1 = max(0, box_y2 - total_h - (padding * 2))

            overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            overlay_draw.rectangle(
                [box_x1, box_y1, box_x2, box_y2], fill=(0, 0, 0, 160))

            img = Image.alpha_composite(
                img.convert('RGBA'), overlay).convert('RGB')
            draw = ImageDraw.Draw(img)

            curr_y = box_y1 + padding
            for i, line in enumerate(lines):
                x = box_x1 + padding
                draw.text((x + 1, curr_y + 1), line,
                          font=font, fill=(0, 0, 0, 220))
                draw.text((x, curr_y), line, font=font,
                          fill=(255, 255, 255, 255))
                curr_y += line_heights[i]

            img.save(file_path, format='JPEG', quality=95)
            return True
    except Exception as e:
        print("Image watermark error:", e)
        return False


def add_video_watermark(file_path, firstname, date_str, location, angle=0, ticket_no=""):
    """
    Stamps proof text (Ticket, First Name, Date/Time, Location) onto the bottom-left corner of a video file using FFmpeg,
    applying physical frame rotation FIRST if angle is non-zero so watermark is stamped on the upright video.
    """
    if not os.path.exists(file_path):
        return False

    temp_path = file_path + ".tmp_watermarked.mp4"
    ffmpeg_cmd = "ffmpeg"
    if os.path.exists(r"C:\ffmpeg\bin\ffmpeg.exe"):
        ffmpeg_cmd = r"C:\ffmpeg\bin\ffmpeg.exe"

    font_path = r"C\:/Windows/Fonts/arial.ttf"

    def clean_text(txt):
        return str(txt).replace(":", "\\:").replace("'", "").replace('"', "")

    text_lines = []
    if ticket_no:
        text_lines.append(ticket_no)
    text_lines.extend([
        f"Uploaded by: {firstname}",
        f"Date: {date_str}",
        f"Location: {location}"
    ])
    full_text = clean_text("\n".join(text_lines))

    watermark_draw = (
        f"drawtext=fontfile='{font_path}':text='{full_text}':fontcolor=white:fontsize=h/30:"
        f"line_spacing=5:box=1:boxcolor=black@0.65:boxborderw=5:x=12:y=h-th-12"
    )

    angle = (angle or 0) % 360
    filters = []
    if angle != 0:
        rad = f"{angle}*PI/180"
        filters.append(f"rotate={rad}:ow=rotw({rad}):oh=roth({rad})")

    filters.append(watermark_draw)
    vf = ",".join(filters)

    try:
        cmd = [
            ffmpeg_cmd, "-y",
            "-noautorotate",
            "-i", file_path,
            "-vf", vf,
            "-metadata:s:v:0", "rotate=0",
            "-c:a", "copy",
            temp_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            # Fallback for silent / audio-less videos
            cmd = [
                ffmpeg_cmd, "-y",
                "-noautorotate",
                "-i", file_path,
                "-vf", vf,
                "-metadata:s:v:0", "rotate=0",
                temp_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)

        if res.returncode == 0 and os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
            if replace_or_copy(temp_path, file_path):
                return True
        else:
            print("FFmpeg video watermark failed stderr:", res.stderr)
    except Exception as e:
        print("FFmpeg video watermark error:", e)

    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass
    return False


def watermark_media_instance(media, extra_angle=0):
    """
    Helper to extract metadata and stamp proof text onto a Media file.
    """
    if not media or not media.file_url:
        return False

    file_path = media.file_url.path
    if not os.path.exists(file_path):
        return False

    firstname = ""
    if media.uploaded_by:
        if media.uploaded_by.first_name and media.uploaded_by.first_name.strip():
            firstname = media.uploaded_by.first_name.strip()
        elif media.uploaded_by.full_name and media.uploaded_by.full_name.strip():
            firstname = media.uploaded_by.full_name.strip().split()[0]
        else:
            firstname = media.uploaded_by.username
    if not firstname:
        firstname = "User"

    dt = media.uploaded_date or timezone.now()
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    date_str = dt.strftime("%d/%m/%Y %I:%M %p")

    location = ""
    if media.ticket and media.ticket.store:
        location = media.ticket.store.store_name
    if not location:
        location = "Maintenance"

    ticket_no = f"WO: {media.ticket.work_order_no}" if (
        media.ticket and media.ticket.work_order_no) else ""

    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']:
        rot_angle = (getattr(media, 'rotation', 0) or 0) + (extra_angle or 0)
        success = add_video_watermark(
            file_path, firstname, date_str, location, angle=rot_angle, ticket_no=ticket_no)
        if success and rot_angle % 360 != 0:
            media.rotation = 0
            try:
                media.save(update_fields=['rotation'])
            except Exception:
                pass
        return success
    elif ext in ['.jpg', '.jpeg', '.png', '.webp']:
        return add_image_watermark(file_path, firstname, date_str, location, ticket_no=ticket_no)
    return False


class MediaViewSet(viewsets.ModelViewSet):
    queryset = Media.objects.all()
    serializer_class = MediaSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        if not serializer.validated_data.get('uploaded_by') and self.request.user and self.request.user.is_authenticated:
            serializer.save(uploaded_by=self.request.user)
        else:
            serializer.save()

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MediaWriteSerializer
        return MediaSerializer

    def get_queryset(self):
        queryset = self.queryset

        ticket = self.request.query_params.get("ticket")
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)

        return queryset

    @action(detail=True, methods=['post'], url_path='rotate')
    def rotate_media(self, request, pk=None):
        media = self.get_object()
        angle = request.data.get('angle', 90)
        try:
            angle = int(angle)
        except (ValueError, TypeError):
            return Response({'detail': 'Invalid rotation angle.'}, status=status.HTTP_400_BAD_REQUEST)

        if media.file_url:
            file_path = media.file_url.path
            if os.path.exists(file_path):
                ext = os.path.splitext(file_path)[1].lower()
                if ext in ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']:
                    rotate_video_file(file_path, angle)
                    media.rotation = 0
                else:
                    try:
                        from PIL import Image, ImageOps
                        with Image.open(file_path) as img:
                            img = ImageOps.exif_transpose(img)
                            rotated_img = img.rotate(-angle, expand=True)
                            fmt = img.format or 'JPEG'
                            if fmt.upper() in ['JPEG', 'JPG']:
                                rotated_img.save(
                                    file_path, format='JPEG', quality=95)
                            else:
                                rotated_img.save(file_path, format=fmt)
                        media.rotation = 0
                    except Exception as img_err:
                        print("PIL rotation note:", img_err)
                        current_rot = getattr(media, 'rotation', 0) or 0
                        media.rotation = (current_rot + angle) % 360

        from django.utils import timezone
        media.uploaded_date = timezone.now()
        media.save()
        return Response(MediaSerializer(media).data)

    def perform_destroy(self, instance):
        if instance.ticket and instance.category:
            cat_name = (instance.category.category_name or '').lower().strip()
            if cat_name == 'before repair' or 'issue' in cat_name:
                file_name = (instance.file_name or '').lower()
                is_audio = 'voice_note' in file_name or 'recording' in file_name or file_name.endswith(('.mp3', '.wav', '.ogg', '.m4a', '.aac'))
                if not is_audio:
                    before_media = Media.objects.filter(
                        ticket=instance.ticket,
                        category=instance.category
                    ).exclude(media_id=instance.media_id)
                    non_audio_remaining = [
                        m for m in before_media
                        if not ('voice_note' in (m.file_name or '').lower() or 'recording' in (m.file_name or '').lower() or (m.file_name or '').lower().endswith(('.mp3', '.wav', '.ogg', '.m4a', '.aac')))
                    ]
                    if len(non_audio_remaining) < 1:
                        from rest_framework.exceptions import ValidationError
                        raise ValidationError({'detail': 'Cannot delete media: At least one Before Repair photo or video must be kept.'})
        instance.delete()


class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated:
            return self.queryset.filter(user=user)
        return self.queryset.none()


class SubscribePushView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            subscription = request.data.get("subscription")
            old_endpoint = request.data.get("old_endpoint")

            if not subscription:
                return Response(
                    {"success": False, "message": "Subscription is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            endpoint = subscription.get("endpoint")
            keys = subscription.get("keys", {})
            p256dh = keys.get("p256dh")
            auth = keys.get("auth")

            if not endpoint:
                return Response(
                    {"success": False, "message": "Endpoint is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not p256dh or not auth:
                return Response(
                    {"success": False, "message": "Subscription keys are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if old_endpoint and old_endpoint != endpoint:
                PushSubscription.objects.filter(
                    user=request.user, endpoint=old_endpoint).delete()

            PushSubscription.objects.update_or_create(
                endpoint=endpoint,
                defaults={
                    "user": request.user,
                    "p256dh": p256dh,
                    "auth": auth,
                    "is_active": True,
                },
            )

            return Response({"success": True, "message": "Push subscription saved."})

        except Exception as error:
            return Response(
                {"success": False, "message": str(error)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class UnsubscribePushView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            endpoint = request.data.get("endpoint")

            if not endpoint:
                return Response(
                    {"success": False, "message": "Endpoint is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            PushSubscription.objects.filter(
                user=request.user,
                endpoint=endpoint,
            ).update(is_active=False)

            return Response({"success": True})

        except Exception as error:
            return Response(
                {"success": False, "message": str(error)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


PROJECT_DIR = str(settings.BASE_DIR.parent)


def run_command(command, cwd=None):
    result = subprocess.run(
        command,
        cwd=cwd,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    return {
        "command": command,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "success": result.returncode == 0,
    }


def create_deployment_notification(title, message):
    from apps.common.models import Notification
    User = get_user_model()

    # Notify superusers so they know deployment status
    users = User.objects.filter(is_superuser=True)
    if not users.exists():
        users = User.objects.filter(is_staff=True)
    if not users.exists():
        users = User.objects.all()[:1]

    for user in users:
        try:
            Notification.objects.create(
                user=user,
                notification_type="deployment",
                title=title,
                message=message,
            )
        except Exception as e:
            print("Failed to create deployment notification:", e)


def log_to_file(text):
    log_file_path = os.path.join(PROJECT_DIR, "deploy.log")
    try:
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(f"[{timezone.now().isoformat()}] {text}\n\n")
    except Exception as e:
        print("Failed to write to deploy.log file:", e)


def run_deployment():
    start_msg = "Deployment process has started on the server."
    create_deployment_notification("Deployment Started", start_msg)
    log_to_file(f"STATUS: Deployment Started\n{start_msg}")

    logs = []

    commands = [
        (
            "refresh.bat",
            PROJECT_DIR,
        ),
    ]

    try:
        for command, cwd in commands:
            result = run_command(command, cwd)
            log_entry = (
                f"COMMAND: {command}\n"
                f"RETURN CODE: {result['returncode']}\n"
                f"STDOUT:\n{result['stdout']}\n"
                f"STDERR:\n{result['stderr']}\n"
                f"{'='*40}"
            )
            logs.append(log_entry + "\n")
            log_to_file(log_entry)

            if not result["success"]:
                error_msg = result["stderr"] or result["stdout"]
                fail_msg = f"Command '{command}' failed.\n\nError:\n{error_msg}\n\nFull Logs:\n" + "\n".join(
                    logs)
                create_deployment_notification("Deployment Failed", fail_msg)
                log_to_file(f"STATUS: Deployment Failed\n{fail_msg}")
                return

        success_msg = "Deployment completed successfully!\n\nFull Logs:\n" + \
            "\n".join(logs)
        create_deployment_notification("Deployment Success", success_msg)
        log_to_file(f"STATUS: Deployment Success\n{success_msg}")

    except Exception as exc:
        err_msg = f"An unexpected error occurred: {exc}\n\nFull Logs:\n" + "\n".join(
            logs)
        create_deployment_notification("Deployment Failed", err_msg)
        log_to_file(f"STATUS: Deployment Failed\n{err_msg}")


class GithubWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        # Verify Github Signature if secret is configured
        signature = request.headers.get("X-Hub-Signature-256")
        secret = os.getenv("GITHUB_WEBHOOK_SECRET") or getattr(
            settings, "GITHUB_WEBHOOK_SECRET", None)

        if secret:
            if not signature:
                return Response(
                    {"success": False, "message": "Signature is required when GITHUB_WEBHOOK_SECRET is set."},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            try:
                sha_name, signature_hash = signature.split('=')
                if sha_name != 'sha256':
                    return Response(
                        {"success": False,
                            "message": "Only sha256 signature is supported."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                mac = hmac.new(secret.encode('utf-8'),
                               msg=request.body, digestmod=hashlib.sha256)
                if not hmac.compare_digest(mac.hexdigest(), signature_hash):
                    return Response(
                        {"success": False, "message": "Invalid signature check."},
                        status=status.HTTP_403_FORBIDDEN
                    )
            except Exception as e:
                return Response(
                    {"success": False,
                        "message": f"Verification error: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        thread = threading.Thread(target=run_deployment)
        thread.daemon = True
        thread.start()
        return Response({"success": True, "message": "Deployment triggered."})



class DashboardUpdateViewSet(viewsets.ModelViewSet):
    """
    API endpoint for viewing and managing Dashboard Updates (What's New / Tutorials).
    """
    queryset = DashboardUpdate.objects.all()
    serializer_class = DashboardUpdateSerializer
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def _check_admin_permission(self):
        user = self.request.user
        role_name = (user.role.role_name.lower().strip() if hasattr(user, 'role') and user.role else '') if user else ''
        is_admin = (
            user.is_superuser or
            getattr(user, 'is_staff', False) or
            role_name in ('administrator', 'admin', 'office administrator', 'office admin', 'management', 'main administrator', 'main_admin') or
            user.has_perm('common.add_dashboardupdate') or
            user.has_perm('common.change_dashboardupdate')
        )
        if not is_admin:
            raise exceptions.PermissionDenied({'detail': 'You do not have permission to manage dashboard updates.'})

    def perform_create(self, serializer):
        self._check_admin_permission()
        serializer.save()

    def perform_update(self, serializer):
        self._check_admin_permission()
        serializer.save()

    def perform_destroy(self, instance):
        self._check_admin_permission()
        instance.delete()

    def get_queryset(self):
        user = self.request.user
        role_name = (user.role.role_name.lower().strip() if hasattr(user, 'role') and user.role else '') if user else ''
        is_admin = (
            user.is_superuser or
            getattr(user, 'is_staff', False) or
            role_name in ('administrator', 'admin', 'office administrator', 'office admin', 'management', 'main administrator', 'main_admin') or
            user.has_perm('common.change_dashboardupdate')
        )

        # For single object actions (retrieve, update, partial_update, destroy), allow access if admin
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
            if is_admin:
                return DashboardUpdate.objects.all().prefetch_related('roles')

        all_param = self.request.query_params.get('all', '').lower() in ('true', '1')
        if is_admin and all_param:
            return DashboardUpdate.objects.all().prefetch_related('roles').order_by('-priority', '-created_at')

        now = timezone.now()
        qs = DashboardUpdate.objects.filter(is_active=True).filter(
            Q(hide_after__isnull=True) | Q(hide_after__gt=now)
        )

        if user and not user.is_anonymous and hasattr(user, 'role') and user.role:
            qs = qs.filter(
                Q(roles__isnull=True) | Q(roles=user.role)
            )
        elif not is_admin:
            qs = qs.filter(roles__isnull=True)

        return qs.prefetch_related('roles').distinct().order_by('-priority', '-created_at')
