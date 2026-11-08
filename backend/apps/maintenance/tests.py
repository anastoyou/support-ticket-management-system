from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from apps.stores.models import Department, SubDepartment, Store, Area
from apps.accounts.models import Role, CustomUser
from apps.maintenance.models import Priority, Status, WorkNature, Ticket, TicketChatMessage
from apps.common.models import MediaCategory, Media
from apps.finance.models import ExpenseType, Expense
from apps.maintenance.serializers import TicketWriteSerializer
from apps.common.serializers import MediaWriteSerializer
from apps.finance.serializers import ExpenseWriteSerializer, ExpenseTypeWriteSerializer
from rest_framework.exceptions import ValidationError


class DepartmentWiseValidationTestCase(TestCase):
    def setUp(self):
        # Create roles
        self.role_mgr = Role.objects.create(role_name="Store Manager")
        self.role_tech = Role.objects.create(role_name="Technician")

        # Create departments
        self.dept_it = Department.objects.create(department_name="Information Technology")
        self.dept_maint = Department.objects.create(department_name="Maintenance")

        # Create sub-departments
        self.subdept_it = SubDepartment.objects.create(
            department=self.dept_it, sub_department_name="Software Systems"
        )
        self.subdept_maint = SubDepartment.objects.create(
            department=self.dept_maint, sub_department_name="Electrical"
        )

        # Create areas and stores
        self.area = Area.objects.create(area_name="Capital Area")
        self.store = Store.objects.create(store_id="S-001", store_name="Store-001", area=self.area)

        # Create users
        self.manager = CustomUser.objects.create_user(
            username="manager1", email="m1@test.com", password="pwd",
            full_name="Mgr One", role=self.role_mgr
        )
        self.manager.accessible_stores.add(self.store)
        self.worker = CustomUser.objects.create_user(
            username="worker1", email="w1@test.com", password="pwd",
            full_name="Worker One", role=self.role_tech
        )

        # Create Priorities
        self.priority_it_high = Priority.objects.create(
            department=self.dept_it, priority_name="High", level=2
        )
        self.priority_maint_high = Priority.objects.create(
            department=self.dept_maint, priority_name="High", level=2
        )

        # Create Statuses
        self.status_it_open = Status.objects.create(
            status_name="Open"
        )
        self.status_maint_open = self.status_it_open


        # Create Work Natures
        self.nature_it = WorkNature.objects.create(
            nature_name="Database Connections", sub_department=self.subdept_it,
            default_priority=self.priority_it_high
        )
        self.nature_maint = WorkNature.objects.create(
            nature_name="Generator Fault", sub_department=self.subdept_maint,
            default_priority=self.priority_maint_high
        )

        # Create a ticket (valid IT ticket)
        self.ticket_it = Ticket.objects.create(
            work_order_no="WO-IT-001", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority_it_high, status=self.status_it_open,
            title="Database Connection Lag", description="Lagging severely",
            created_by=self.manager
        )

        # Create Media Categories
        self.cat_it_issue = MediaCategory.objects.create(
            department=self.dept_it, category_name="Issue Screenshot"
        )
        self.cat_maint_issue = MediaCategory.objects.create(
            department=self.dept_maint, category_name="Issue Photo"
        )

        # Create Expense Types
        self.exp_type_it = ExpenseType.objects.create(
            department=self.dept_it, expense_name="Software license"
        )
        self.exp_type_maint = ExpenseType.objects.create(
            department=self.dept_maint, expense_name="Spare parts"
        )

    def test_valid_ticket_serializer(self):
        data = {
            "work_order_no": "WO-IT-002",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority_it_high.priority_id,
            "status": self.status_it_open.status_id,
            "title": "Another IT issue",
            "description": "Details",
            "created_by": self.manager.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_invalid_ticket_priority_department(self):
        data = {
            "work_order_no": "WO-IT-003",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority_maint_high.priority_id, # Wrong department priority
            "status": self.status_it_open.status_id,
            "title": "Invalid Priority Ticket",
            "description": "Details",
            "created_by": self.manager.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['priority'].department, self.dept_it)

    def test_status_creation(self):
        # Placeholder since status is global
        pass

    def test_invalid_ticket_nature_department(self):
        data = {
            "work_order_no": "WO-IT-005",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_maint.nature_id, # Wrong department nature
            "priority": self.priority_it_high.priority_id,
            "status": self.status_it_open.status_id,
            "title": "Invalid Nature Ticket",
            "description": "Details",
            "created_by": self.manager.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("nature", serializer.errors)

    def test_media_category_department_validation(self):
        # Create SimpleUploadedFiles for test upload
        file_valid = SimpleUploadedFile("it_screenshot.png", b"file_content_1", content_type="image/png")
        file_invalid = SimpleUploadedFile("maint_photo.png", b"file_content_2", content_type="image/png")

        # Test valid Media (matching IT ticket and IT category)
        media_valid_data = {
            "ticket": self.ticket_it.ticket_id,
            "uploaded_by": self.manager.user_id,
            "category": self.cat_it_issue.category_id,
            "file_name": "it_screenshot.png",
            "file_url": file_valid
        }
        serializer = MediaWriteSerializer(data=media_valid_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        # Test invalid Media (matching IT ticket with Maintenance category)
        media_invalid_data = {
            "ticket": self.ticket_it.ticket_id,
            "uploaded_by": self.manager.user_id,
            "category": self.cat_maint_issue.category_id,
            "file_name": "maint_photo.png",
            "file_url": file_invalid
        }
        serializer = MediaWriteSerializer(data=media_invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("category", serializer.errors)

    def test_expense_type_department_validation(self):
        # Test valid Expense
        from django.utils import timezone
        today_str = timezone.now().date().isoformat()
        expense_valid_data = {
            "ticket": self.ticket_it.ticket_id,
            "worker": self.worker.user_id,
            "expense_type": self.exp_type_it.expense_type_id,
            "amount": "120.00",
            "expense_date": today_str,
            "remarks": "License renewal payment"
        }
        serializer = ExpenseWriteSerializer(data=expense_valid_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        # Test invalid Expense (matching IT ticket with Maintenance expense type)
        expense_invalid_data = {
            "ticket": self.ticket_it.ticket_id,
            "worker": self.worker.user_id,
            "expense_type": self.exp_type_maint.expense_type_id,
            "amount": "120.00",
            "expense_date": today_str
        }
        serializer = ExpenseWriteSerializer(data=expense_invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("expense_type", serializer.errors)

    def test_expense_type_parent_department_validation(self):
        # Try to make a parent expense type of one department the parent of a sub-type of another department
        data = {
            "department": self.dept_maint.department_id,
            "expense_name": "Maint Sub Type",
            "parent": self.exp_type_it.expense_type_id # Different department
        }
        serializer = ExpenseTypeWriteSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("parent", serializer.errors)


class TicketStatusFilteringAPITests(APITestCase):
    def setUp(self):
        # Create standard test setup
        self.role_mgr = Role.objects.create(role_name="Store Manager")
        self.dept_maint = Department.objects.create(department_name="Maintenance")
        self.area = Area.objects.create(area_name="Capital Area")
        self.store = Store.objects.create(store_id="S-001", store_name="Store-001", area=self.area)
        
        self.user = CustomUser.objects.create_user(
            username="manager1", email="m1@test.com", password="pwd",
            full_name="Mgr One", role=self.role_mgr
        )
        self.user.accessible_stores.add(self.store)
        
        self.priority = Priority.objects.create(
            department=self.dept_maint, priority_name="High", level=2
        )
        
        self.status_open = Status.objects.create(status_name="Open")
        self.status_progress = Status.objects.create(status_name="In Progress")
        self.status_completed = Status.objects.create(status_name="Completed")
        
        self.subdept_maint = SubDepartment.objects.create(
            department=self.dept_maint, sub_department_name="Electrical"
        )
        self.user.sub_departments.add(self.subdept_maint)
        self.nature = WorkNature.objects.create(
            nature_name="Generator Fault", sub_department=self.subdept_maint,
            default_priority=self.priority
        )

        self.ticket_open = Ticket.objects.create(
            work_order_no="WO-001", store=self.store, department=self.dept_maint,
            nature=self.nature, priority=self.priority, status=self.status_open,
            title="Open Ticket", description="Desc", created_by=self.user
        )
        self.ticket_progress = Ticket.objects.create(
            work_order_no="WO-002", store=self.store, department=self.dept_maint,
            nature=self.nature, priority=self.priority, status=self.status_progress,
            title="In Progress Ticket", description="Desc", created_by=self.user
        )
        self.ticket_completed = Ticket.objects.create(
            work_order_no="WO-003", store=self.store, department=self.dept_maint,
            nature=self.nature, priority=self.priority, status=self.status_completed,
            title="Completed Ticket", description="Desc", created_by=self.user
        )

        ticket_ct = ContentType.objects.get_for_model(Ticket)
        self.perm_view_open = Permission.objects.get(codename='can_view_open_ticket', content_type=ticket_ct)
        self.perm_view_progress = Permission.objects.get(codename='can_view_in_progress_ticket', content_type=ticket_ct)
        self.perm_view_completed = Permission.objects.get(codename='can_view_completed_ticket', content_type=ticket_ct)
        
        self.client.force_authenticate(user=self.user)

    def test_no_status_permissions_returns_nothing(self):
        url = '/api/maintenance/ticket/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 0)

    def test_only_open_status_permission_returns_only_open(self):
        self.user.user_permissions.add(self.perm_view_open)
        url = '/api/maintenance/ticket/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['ticket_id'], self.ticket_open.ticket_id)

    def test_multiple_status_permissions(self):
        self.user.user_permissions.add(self.perm_view_open, self.perm_view_progress)
        url = '/api/maintenance/ticket/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 2)
        ticket_ids = [t['ticket_id'] for t in response.data['results']]
        self.assertIn(self.ticket_open.ticket_id, ticket_ids)
        self.assertIn(self.ticket_progress.ticket_id, ticket_ids)
        self.assertNotIn(self.ticket_completed.ticket_id, ticket_ids)

    def test_superuser_bypass(self):
        self.user.is_superuser = True
        self.user.save()
        url = '/api/maintenance/ticket/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 3)


from apps.maintenance.models import StatusChangeRule, Allocation
from apps.maintenance.utils import get_value_from_path, compare_values, change_status
from django.core.exceptions import ValidationError

class StatusChangeRuleTestCase(TestCase):
    def setUp(self):
        self.area = Area.objects.create(area_name="Test Area")
        self.store = Store.objects.create(store_id="S-002", store_name="Store-002", area=self.area)
        self.dept = Department.objects.create(department_name="Test Dept")
        self.subdept = SubDepartment.objects.create(department=self.dept, sub_department_name="Sub-Dept")
        self.user = CustomUser.objects.create_user(username="testuser2", email="t2@test.com", password="pwd", full_name="Test User 2")
        self.priority = Priority.objects.create(department=self.dept, priority_name="Normal", level=1)
        self.priority_high = Priority.objects.create(department=self.dept, priority_name="High", level=2)
        
        self.status_open = Status.objects.create(status_name="Open")
        self.status_progress = Status.objects.create(status_name="In Progress")
        self.status_completed = Status.objects.create(status_name="Completed")
        
        self.nature = WorkNature.objects.create(nature_name="Test Nature", sub_department=self.subdept, default_priority=self.priority)
        
        self.ticket = Ticket.objects.create(
            work_order_no="WO-TEST-999",
            store=self.store,
            department=self.dept,
            nature=self.nature,
            priority=self.priority,
            status=self.status_open,
            title="Broken Light",
            description="Office light is flickering",
            created_by=self.user
        )

    def test_get_value_from_path_simple(self):
        self.assertEqual(get_value_from_path(self.ticket, "title"), "Broken Light")
        self.assertEqual(get_value_from_path(self.ticket, "store.store_name"), "Store-002")
        self.assertEqual(get_value_from_path(self.ticket, "created_by.username"), "testuser2")

    def test_get_value_from_path_related_manager(self):
        allocations_manager = get_value_from_path(self.ticket, "allocations")
        self.assertFalse(allocations_manager.exists())
        
        alloc = Allocation.objects.create(ticket=self.ticket, worker=self.user, planned_hours=2)
        self.assertTrue(allocations_manager.exists())

    def test_get_value_from_path_nested_related(self):
        Allocation.objects.create(ticket=self.ticket, worker=self.user, planned_hours=2)
        self.assertEqual(get_value_from_path(self.ticket, "allocations.worker.username"), ["testuser2"])

    def test_compare_values(self):
        self.assertTrue(compare_values("Store-002", "Store-002"))
        self.assertFalse(compare_values("Store-002", "Store-003"))
        self.assertTrue(compare_values(["Active", "Pending"], "Active"))
        self.assertFalse(compare_values(["Active", "Pending"], "Closed"))

    def test_check_rule_validation_field_success(self):
        rule = StatusChangeRule.objects.create(
            from_status=self.status_open,
            to_status=self.status_progress,
            mode="check",
            type="field",
            path="priority.priority_name",
            value="High",
            message="Priority must be High"
        )
        with self.assertRaisesMessage(ValidationError, "Priority must be High"):
            self.ticket.status = self.status_progress
            self.ticket.clean()
            
        self.ticket.priority = self.priority_high
        self.ticket.status = self.status_progress
        self.ticket.clean()
        self.ticket.save()
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, self.status_progress)

    def test_check_rule_validation_field_empty(self):
        rule = StatusChangeRule.objects.create(
            from_status=self.status_open,
            to_status=self.status_progress,
            mode="check",
            type="field",
            path="closed_by",
            value="",
            message="Closed by user required"
        )
        with self.assertRaisesMessage(ValidationError, "Closed by user required"):
            self.ticket.status = self.status_progress
            self.ticket.clean()
            
        self.ticket.closed_by = self.user
        self.ticket.status = self.status_progress
        self.ticket.clean()

    def test_check_rule_validation_related_empty(self):
        rule = StatusChangeRule.objects.create(
            from_status=self.status_open,
            to_status=self.status_progress,
            mode="check",
            type="related",
            path="allocations",
            value="",
            message="At least one worker must be allocated"
        )
        with self.assertRaisesMessage(ValidationError, "At least one worker must be allocated"):
            self.ticket.status = self.status_progress
            self.ticket.clean()
            
        Allocation.objects.create(ticket=self.ticket, worker=self.user, planned_hours=1)
        self.ticket.status = self.status_progress
        self.ticket.clean()

    def test_delete_rule_cleanup(self):
        alloc = Allocation.objects.create(ticket=self.ticket, worker=self.user, planned_hours=1)
        
        rule = StatusChangeRule.objects.create(
            from_status=self.status_progress,
            to_status=self.status_completed,
            mode="delete",
            type="related",
            path="allocations",
            message="Clean allocations"
        )
        
        self.ticket.status = self.status_progress
        self.ticket.save()
        
        self.ticket.status = self.status_completed
        self.ticket.save()
        
        self.assertFalse(Allocation.objects.filter(pk=alloc.pk).exists())

    def test_set_rule_field_execution(self):
        rule = StatusChangeRule.objects.create(
            from_status=self.status_open,
            to_status=self.status_progress,
            mode="set",
            type="field",
            path="title",
            value="Status has been set!"
        )
        self.ticket.status = self.status_progress
        self.ticket.clean()
        self.assertEqual(self.ticket.title, "Status has been set!")

    def test_set_rule_relation_execution(self):
        rule = StatusChangeRule.objects.create(
            from_status=self.status_open,
            to_status=self.status_progress,
            mode="set",
            type="field",
            path="priority",
            value="Normal"
        )
        self.ticket.priority = self.priority_high
        self.ticket.save()
        
        self.ticket.status = self.status_progress
        self.ticket.clean()
        self.assertEqual(self.ticket.priority, self.priority)

    def test_warning_rule_execution(self):
        rule = StatusChangeRule.objects.create(
            from_status=self.status_open,
            to_status=self.status_progress,
            mode="warning",
            type="field",
            path="priority.priority_name",
            value="High",
            message="Warning: Priority is not High!"
        )
        self.ticket.status = self.status_progress
        self.ticket.save()
        self.assertEqual(self.ticket.status, self.status_progress)
        self.assertIn("Warning: Priority is not High!", self.ticket._deleted_warnings)


class TicketChatMessageAPITests(APITestCase):
    def setUp(self):
        self.role_mgr = Role.objects.create(role_name="Store Manager")
        self.dept_maint = Department.objects.create(department_name="Maintenance")
        self.area = Area.objects.create(area_name="Capital Area")
        self.store = Store.objects.create(store_id="S-001", store_name="Store-001", area=self.area)
        
        self.user = CustomUser.objects.create_user(
            username="manager1", email="m1@test.com", password="pwd",
            full_name="Mgr One", role=self.role_mgr
        )
        self.user.accessible_stores.add(self.store)
        self.client.force_authenticate(user=self.user)
        
        self.priority = Priority.objects.create(
            department=self.dept_maint, priority_name="High", level=2
        )
        
        self.status_open = Status.objects.create(status_name="Open")
        self.subdept_maint = SubDepartment.objects.create(
            department=self.dept_maint, sub_department_name="Electrical"
        )
        self.nature = WorkNature.objects.create(
            nature_name="Generator Fault", sub_department=self.subdept_maint,
            default_priority=self.priority
        )

        self.ticket = Ticket.objects.create(
            work_order_no="WO-001", store=self.store, department=self.dept_maint,
            nature=self.nature, priority=self.priority, status=self.status_open,
            title="Open Ticket", description="Desc", created_by=self.user
        )

    def test_create_chat_message(self):
        url = "/api/maintenance/ticketchat/"
        data = {
            "ticket": self.ticket.ticket_id,
            "sender": self.user.user_id,
            "message_text": "Hello team!"
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["message_text"], "Hello team!")
        self.assertEqual(response.data["sender"]["user_id"], self.user.user_id)

    def test_list_chat_messages(self):
        msg = TicketChatMessage.objects.create(
            ticket=self.ticket,
            sender=self.user,
            message_text="Test message"
        )
        url = f"/api/maintenance/ticketchat/?ticket={self.ticket.ticket_id}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["message_text"], "Test message")


class WorkLogAndTimeTrackingTestCase(TestCase):
    def setUp(self):
        self.role_admin = Role.objects.create(role_name="Administrator")
        self.role_tech = Role.objects.create(role_name="Technician")

        self.dept = Department.objects.create(department_name="Operations")
        self.subdept = SubDepartment.objects.create(department=self.dept, sub_department_name="HVAC")
        self.area = Area.objects.create(area_name="East Area")
        self.store = Store.objects.create(store_id="S-100", store_name="Store-100", area=self.area)

        self.admin = CustomUser.objects.create_user(
            username="admin_user", email="adm@test.com", password="pwd",
            full_name="Admin User", role=self.role_admin
        )
        self.worker1 = CustomUser.objects.create_user(
            username="tech_worker_1", email="tw1@test.com", password="pwd",
            full_name="Tech Worker 1", role=self.role_tech
        )
        self.worker2 = CustomUser.objects.create_user(
            username="tech_worker_2", email="tw2@test.com", password="pwd",
            full_name="Tech Worker 2", role=self.role_tech
        )

        self.priority = Priority.objects.create(department=self.dept, priority_name="High", level=1)
        self.status_open = Status.objects.create(status_name="Open", order=1)
        self.status_in_progress = Status.objects.create(status_name="In Progress", order=2)
        self.status_loc_app = Status.objects.create(status_name="Location Approval", order=3)

        self.nature = WorkNature.objects.create(
            nature_name="AC Repair", sub_department=self.subdept,
            default_priority=self.priority
        )

        self.ticket = Ticket.objects.create(
            work_order_no="WO-HVAC-01", store=self.store, department=self.dept,
            nature=self.nature, priority=self.priority, status=self.status_in_progress,
            title="AC Leaking", description="Water dripping", created_by=self.admin
        )

        from apps.maintenance.models import Allocation
        self.alloc1 = Allocation.objects.create(
            ticket=self.ticket, worker=self.worker1, assigned_by=self.admin, planned_hours=4.0
        )
        self.alloc2 = Allocation.objects.create(
            ticket=self.ticket, worker=self.worker2, assigned_by=self.admin, planned_hours=4.0
        )

    def test_worklog_same_time_zero_hours_allowed(self):
        from apps.maintenance.serializers import WorkLogWriteSerializer
        from django.utils import timezone
        data = {
            "ticket": self.ticket.ticket_id,
            "worker": self.worker1.user_id,
            "from_time": "09:00:00",
            "to_time": "09:00:00",
            "work_done": "Did not work on site",
            "work_date": timezone.now().date().isoformat()
        }
        serializer = WorkLogWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertEqual(float(instance.hours), 0.0)

    def test_worklog_negative_hours_or_invalid_time_rejected(self):
        from apps.maintenance.serializers import WorkLogWriteSerializer
        from django.utils import timezone
        # Negative hours
        data_neg = {
            "ticket": self.ticket.ticket_id,
            "worker": self.worker1.user_id,
            "hours": "-1.00",
            "work_done": "Invalid work",
            "work_date": timezone.now().date().isoformat()
        }
        serializer_neg = WorkLogWriteSerializer(data=data_neg)
        self.assertFalse(serializer_neg.is_valid())
        self.assertIn("hours", serializer_neg.errors)

        # Time range exceeding 20 hours (e.g. 14:00 to 12:00 next day = 22 hours)
        data_time_inv = {
            "ticket": self.ticket.ticket_id,
            "worker": self.worker1.user_id,
            "from_time": "14:00:00",
            "to_time": "12:00:00",
            "work_done": "Exceeds 20 hours",
            "work_date": timezone.now().date().isoformat()
        }
        serializer_time = WorkLogWriteSerializer(data=data_time_inv)
        self.assertFalse(serializer_time.is_valid())
        self.assertIn("hours", serializer_time.errors)

    def test_worklog_overnight_night_to_morning_allowed(self):
        from apps.maintenance.serializers import WorkLogWriteSerializer
        from django.utils import timezone
        # Night to morning (e.g. 22:00 to 06:00 = 8.00 hours)
        data_overnight = {
            "ticket": self.ticket.ticket_id,
            "worker": self.worker1.user_id,
            "from_time": "22:00:00",
            "to_time": "06:00:00",
            "work_done": "Night shift maintenance",
            "work_date": timezone.now().date().isoformat()
        }
        serializer = WorkLogWriteSerializer(data=data_overnight)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertEqual(float(instance.hours), 8.0)

    def test_worklog_from_and_to_time_calculation(self):
        from apps.maintenance.serializers import WorkLogWriteSerializer
        from django.utils import timezone
        data = {
            "ticket": self.ticket.ticket_id,
            "worker": self.worker1.user_id,
            "from_time": "09:00:00",
            "to_time": "12:30:00",
            "work_done": "Repaired compressor",
            "work_date": timezone.now().date().isoformat()
        }
        serializer = WorkLogWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        instance = serializer.save()
        self.assertEqual(float(instance.hours), 3.5)

    def test_location_approval_rejected_if_workers_lack_worklogs(self):
        from apps.maintenance.serializers import TicketWriteSerializer
        # Only worker1 has logged hours, worker2 has none
        from apps.maintenance.models import WorkLog
        from django.utils import timezone
        WorkLog.objects.create(
            ticket=self.ticket, worker=self.worker1, allocation=self.alloc1,
            work_date=timezone.now().date(), hours=3.5, hourly_rate=5.0,
            labour_amount=17.5, work_done="Completed task 1"
        )

        serializer = TicketWriteSerializer(
            instance=self.ticket,
            data={"status": self.status_loc_app.status_id},
            partial=True
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("status", serializer.errors)
        self.assertIn("Tech Worker 2", str(serializer.errors["status"]))

    def test_location_approval_allowed_when_all_workers_logged_hours_including_zero(self):
        from apps.maintenance.serializers import TicketWriteSerializer
        from apps.maintenance.models import WorkLog
        from django.utils import timezone
        WorkLog.objects.create(
            ticket=self.ticket, worker=self.worker1, allocation=self.alloc1,
            work_date=timezone.now().date(), hours=3.5, hourly_rate=5.0,
            labour_amount=17.5, work_done="Completed task 1"
        )
        # Worker 2 has 0 hours (did not work)
        WorkLog.objects.create(
            ticket=self.ticket, worker=self.worker2, allocation=self.alloc2,
            work_date=timezone.now().date(), hours=0.0, hourly_rate=5.0,
            labour_amount=0.0, work_done="Did not work"
        )

        serializer = TicketWriteSerializer(
            instance=self.ticket,
            data={"status": self.status_loc_app.status_id},
            partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


class LocationApprovalThrottleTestCase(TestCase):
    def setUp(self):
        self.role_mgr = Role.objects.create(role_name="Store Manager")
        self.dept_it = Department.objects.create(department_name="IT Support", location_approval_throttle=2)
        self.dept_maint = Department.objects.create(department_name="Facility Maintenance", location_approval_throttle=3)

        self.subdept_it = SubDepartment.objects.create(department=self.dept_it, sub_department_name="Helpdesk")
        self.subdept_maint = SubDepartment.objects.create(department=self.dept_maint, sub_department_name="Plumbing")

        self.area = Area.objects.create(area_name="North Area")
        self.store = Store.objects.create(store_id="S-THROTTLE-1", store_name="Throttle Store 1", area=self.area)

        self.user = CustomUser.objects.create_user(
            username="manager_throttle", email="m_thr@test.com", password="pwd",
            full_name="Throttle Manager", role=self.role_mgr
        )
        self.user.accessible_stores.add(self.store)

        self.priority = Priority.objects.create(department=self.dept_it, priority_name="Normal", level=1)
        self.priority_m = Priority.objects.create(department=self.dept_maint, priority_name="Normal", level=1)

        self.status_open = Status.objects.create(status_name="Open")
        self.status_loc_app = Status.objects.create(status_name="Location Approval")
        self.status_completed = Status.objects.create(status_name="Completed")

        self.nature_it = WorkNature.objects.create(
            nature_name="Network Down", sub_department=self.subdept_it, default_priority=self.priority
        )
        self.nature_m = WorkNature.objects.create(
            nature_name="Pipe Leak", sub_department=self.subdept_maint, default_priority=self.priority_m
        )

    def test_ticket_creation_allowed_under_throttle_limit(self):
        # Create 1 ticket in Location Approval status (department limit is 2)
        Ticket.objects.create(
            work_order_no="WO-IT-APP-1", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Old Pending Ticket 1", description="Pending approval", created_by=self.user
        )

        # Attempt to create a new ticket in IT department -> Should succeed because count (1) < limit (2)
        data = {
            "work_order_no": "WO-IT-APP-NEW",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority.priority_id,
            "status": self.status_open.status_id,
            "title": "New IT Ticket",
            "description": "New issue description",
            "created_by": self.user.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ticket_creation_blocked_when_throttle_limit_reached(self):
        # Create 2 tickets in Location Approval status for IT department
        Ticket.objects.create(
            work_order_no="WO-IT-APP-1", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 1", description="Pending approval", created_by=self.user
        )
        Ticket.objects.create(
            work_order_no="WO-IT-APP-2", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 2", description="Pending approval", created_by=self.user
        )

        # Attempt to create 3rd ticket -> Should fail with throttle validation error
        data = {
            "work_order_no": "WO-IT-APP-BLOCKED",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority.priority_id,
            "status": self.status_open.status_id,
            "title": "Blocked IT Ticket",
            "description": "Should be blocked",
            "created_by": self.user.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertTrue('store' in serializer.errors or 'non_field_errors' in serializer.errors)
        error_msg = str(serializer.errors)
        self.assertIn("Location Approval", error_msg)
        self.assertIn("Location Approval limit", error_msg)

    def test_custom_store_override_allows_higher_limit(self):
        # Department limit is 2, but store override is set to 5
        self.store.location_approval_throttle = 5
        self.store.save()

        # Create 2 tickets in Location Approval status
        Ticket.objects.create(
            work_order_no="WO-IT-APP-1", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 1", description="Pending approval", created_by=self.user
        )
        Ticket.objects.create(
            work_order_no="WO-IT-APP-2", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 2", description="Pending approval", created_by=self.user
        )

        # Creating 3rd ticket should now succeed because store override is 5
        data = {
            "work_order_no": "WO-IT-APP-ALLOWED",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority.priority_id,
            "status": self.status_open.status_id,
            "title": "Allowed IT Ticket",
            "description": "Allowed by store override",
            "created_by": self.user.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_store_department_throttle_override(self):
        from apps.stores.models import StoreDepartmentThrottle
        # Set custom StoreDepartmentThrottle for (store, dept_it) = 1
        StoreDepartmentThrottle.objects.create(
            store=self.store, department=self.dept_it, throttle_limit=1
        )

        # Create 1 ticket in Location Approval
        Ticket.objects.create(
            work_order_no="WO-IT-APP-1", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 1", description="Pending approval", created_by=self.user
        )

        # Attempt to create another ticket in IT -> Blocked because limit is 1
        data_it = {
            "work_order_no": "WO-IT-APP-2",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority.priority_id,
            "status": self.status_open.status_id,
            "title": "Blocked IT Ticket",
            "description": "Blocked",
            "created_by": self.user.user_id
        }
        serializer_it = TicketWriteSerializer(data=data_it)
        self.assertFalse(serializer_it.is_valid())

        # But for Facility Maintenance department (limit 3, no tickets), creating a ticket succeeds
        data_m = {
            "work_order_no": "WO-M-APP-1",
            "store": self.store.store_id,
            "department": self.dept_maint.department_id,
            "nature": self.nature_m.nature_id,
            "priority": self.priority_m.priority_id,
            "status": self.status_open.status_id,
            "title": "Maintenance Ticket",
            "description": "Allowed",
            "created_by": self.user.user_id
        }
        serializer_m = TicketWriteSerializer(data=data_m)
        self.assertTrue(serializer_m.is_valid(), serializer_m.errors)

    def test_closing_or_approving_tickets_unblocks_creation(self):
        # Create 2 tickets in Location Approval
        t1 = Ticket.objects.create(
            work_order_no="WO-IT-APP-1", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 1", description="Pending approval", created_by=self.user
        )
        t2 = Ticket.objects.create(
            work_order_no="WO-IT-APP-2", store=self.store, department=self.dept_it,
            nature=self.nature_it, priority=self.priority, status=self.status_loc_app,
            title="Pending Ticket 2", description="Pending approval", created_by=self.user
        )

        data = {
            "work_order_no": "WO-IT-APP-NEW",
            "store": self.store.store_id,
            "department": self.dept_it.department_id,
            "nature": self.nature_it.nature_id,
            "priority": self.priority.priority_id,
            "status": self.status_open.status_id,
            "title": "New IT Ticket",
            "description": "Testing unblocking",
            "created_by": self.user.user_id
        }
        serializer = TicketWriteSerializer(data=data)
        self.assertFalse(serializer.is_valid())

        # Now approve/complete t1
        t1.status = self.status_completed
        t1.save()

        # Now serializer should pass because pending count is 1 (< limit of 2)
        serializer2 = TicketWriteSerializer(data=data)
        self.assertTrue(serializer2.is_valid(), serializer2.errors)








class TimeSheetLoggingTestCase(TestCase):
    def setUp(self):
        from apps.accounts.models import Role, CustomUser
        from apps.stores.models import Store, Department
        from apps.maintenance.models import Priority, Status, WorkNature, Ticket, WorkLog
        from apps.finance.models import EmployeeRate
        from rest_framework.test import APIClient
        from datetime import time
        from decimal import Decimal
        from django.utils import timezone

        self.client = APIClient()
        self.role_tech = Role.objects.create(role_name="Technician")
        self.worker = CustomUser.objects.create_user(
            username="tech_worker_ts", password="ts_password", role=self.role_tech,
            employee_no="EMP-TS-01"
        )
        EmployeeRate.objects.create(
            worker=self.worker, hourly_rate=Decimal("15.00"), effective_from=timezone.now().date()
        )
        self.store1 = Store.objects.create(store_id="TS-S01", store_name="Downtown Branch", short_code="DTB")
        self.store2 = Store.objects.create(store_id="TS-S02", store_name="North Warehouse", short_code="NWH")

        self.dept = Department.objects.create(department_name="TS Maintenance")
        self.priority = Priority.objects.create(priority_name="TS Normal", department=self.dept, level=1)
        self.status = Status.objects.create(status_name="Open")
        from apps.stores.models import SubDepartment
        self.subdept = SubDepartment.objects.create(sub_department_name="TS Subdept", department=self.dept)
        self.nature = WorkNature.objects.create(nature_name="TS General Repair", sub_department=self.subdept, default_priority=self.priority)
        self.ticket = Ticket.objects.create(
            work_order_no="WO-TS-001", store=self.store1, department=self.dept,
            nature=self.nature, priority=self.priority, status=self.status,
            title="Fix AC Unit", created_by=self.worker
        )

        self.client.force_authenticate(user=self.worker)

    def test_timesheet_integration_ticket_and_manual_logs(self):
        from apps.maintenance.models import WorkLog
        from datetime import time, date
        from decimal import Decimal

        today = date(2026, 11, 8)

        # 1. Ticket work log: 09:00 - 12:00 (3.0 hours)
        WorkLog.objects.create(
            ticket=self.ticket,
            worker=self.worker,
            work_date=today,
            from_time=time(9, 0),
            to_time=time(12, 0),
            hours=Decimal("3.00"),
            hourly_rate=Decimal("15.00"),
            labour_amount=Decimal("45.00"),
            work_done="Repaired compressor coil",
            log_type='ticket'
        )

        # 2. Manual timesheet log: 13:00 - 16:30 (3.5 hours) for store2
        resp_post = self.client.post("/api/maintenance/worklog/", {
            "work_date": "2026-11-08",
            "from_time": "13:00:00",
            "to_time": "16:30:00",
            "hours": "3.50",
            "stores": [self.store2.store_id],
            "work_done": "Routine store inspection and inventory check",
            "log_type": "timesheet"
        }, format="json")
        self.assertEqual(resp_post.status_code, 201)
        self.assertEqual(resp_post.data['log_type'], 'timesheet')

        # 3. Fetch timesheet for today
        resp = self.client.get("/api/maintenance/worklog/timesheet/?date=2026-11-08")
        self.assertEqual(resp.status_code, 200)
        data = resp.data

        # Total hours should be 3.0 + 3.5 = 6.5 hours
        self.assertEqual(data['total_booked_hours'], 6.5)
        # Daily goal is 10 hours -> 65% completion
        self.assertEqual(data['completion_percentage'], 65)
        self.assertEqual(len(data['sessions']), 2)

        # Ticket session is locked and has ticket info
        ticket_session = next(s for s in data['sessions'] if s['is_ticket'])
        self.assertTrue(ticket_session['is_locked'])
        self.assertEqual(ticket_session['ticket_id'], self.ticket.ticket_id)
        self.assertEqual(ticket_session['hours'], 3.0)

        # Manual session is not locked and has store2
        manual_session = next(s for s in data['sessions'] if not s['is_ticket'])
        self.assertFalse(manual_session['is_locked'])
        self.assertIn(self.store2.store_id, manual_session['locationIds'])
        self.assertEqual(manual_session['hours'], 3.5)

        # 4. Fetch timesheet calendar
        resp_cal = self.client.get("/api/maintenance/worklog/timesheet_calendar/?year=2026&month=11")
        self.assertEqual(resp_cal.status_code, 200)
        self.assertIn("2026-11-08", resp_cal.data['days'])
        self.assertEqual(resp_cal.data['days']['2026-11-08']['total_hours'], 6.5)
        self.assertEqual(resp_cal.data['days']['2026-11-08']['completion_percentage'], 65)

        # 5. Timesheet reset for manual entries
        resp_reset = self.client.post("/api/maintenance/worklog/timesheet_reset/", {
            "date": "2026-11-08"
        }, format="json")
        self.assertEqual(resp_reset.status_code, 200)
        self.assertEqual(resp_reset.data['deleted_count'], 1)

        # Ticket log remains intact!
        resp_after = self.client.get("/api/maintenance/worklog/timesheet/?date=2026-11-08")
        self.assertEqual(len(resp_after.data['sessions']), 1)
        self.assertTrue(resp_after.data['sessions'][0]['is_ticket'])
