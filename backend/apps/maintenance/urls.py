from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PriorityViewSet, StatusViewSet, WorkNatureViewSet,
    NatureWorkerViewSet, TicketViewSet, AllocationViewSet,
    WorkLogViewSet, TicketHistoryViewSet, TicketChatMessageViewSet,
    ComplaintViewSet, ComplaintIssueTypeViewSet
)

router = DefaultRouter()
router.register(r'priority', PriorityViewSet)
router.register(r'status', StatusViewSet)
router.register(r'worknature', WorkNatureViewSet)
router.register(r'natureworker', NatureWorkerViewSet)
router.register(r'ticket', TicketViewSet)
router.register(r'allocation', AllocationViewSet)
router.register(r'worklog', WorkLogViewSet)
router.register(r'tickethistory', TicketHistoryViewSet)
router.register(r'ticketchat', TicketChatMessageViewSet)
router.register(r'complaint', ComplaintViewSet)
router.register(r'complaint-issues', ComplaintIssueTypeViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
