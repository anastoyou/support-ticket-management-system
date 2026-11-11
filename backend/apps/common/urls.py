from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MediaCategoryViewSet, MediaViewSet, NotificationViewSet, SubscribePushView, UnsubscribePushView, GithubWebhookView, DashboardUpdateViewSet

router = DefaultRouter()
router.register(r'mediacategory', MediaCategoryViewSet)
router.register(r"media", MediaViewSet, basename="media")
router.register(r'notification', NotificationViewSet)
router.register(r'dashboard-updates', DashboardUpdateViewSet, basename='dashboard-updates')

urlpatterns = [
    path('', include(router.urls)),

    path(
        'push/subscribe/',
        SubscribePushView.as_view(),
        name='push-subscribe'
    ),

    path(
        'push/unsubscribe/',
        UnsubscribePushView.as_view(),
        name='push-unsubscribe'
    ),

    path(
        'deploy/webhook/',
        GithubWebhookView.as_view(),
        name='deploy-webhook'
    ),

]
