from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from django.core.exceptions import ValidationError

from apps.accounts.models import Role
from apps.stores.models import Department, Store, SubDepartment
from apps.maintenance.models import Ticket, Priority, Status, WorkNature
from apps.finance.models import (
    ExpenseType, Expense, WorkerClaim, LedgerGroup, Ledger,
    ApprovalWorkflow, ApprovalStep, ApprovalInstance, AuditEvent, Payment
)
from apps.finance.services import BundleService, LedgerService, ApprovalService, PaymentService

User = get_user_model()


class FinancialSystemTestCase(TestCase):
    def setUp(self):
        # Create roles
        self.role_admin, _ = Role.objects.get_or_create(role_name="Office Administrator")
        self.role_manager, _ = Role.objects.get_or_create(role_name="Store Manager")
        self.role_auditor, _ = Role.objects.get_or_create(role_name="Internal Auditor")
        self.role_cashier, _ = Role.objects.get_or_create(role_name="Cash Officer")

        # Create users
        self.worker = User.objects.create_user(username="tech_john", password="password123")
        self.office_user = User.objects.create_user(username="office_mary", password="password123", role=self.role_admin)
        self.manager_user = User.objects.create_user(username="mgr_sam", password="password123", role=self.role_manager)
        self.auditor_user = User.objects.create_user(username="audit_dan", password="password123", role=self.role_auditor)
        self.cashier_user = User.objects.create_user(username="cash_lisa", password="password123", role=self.role_cashier)

        # Department & Store
        self.dept = Department.objects.create(department_name="HVAC Maintenance")
        self.store = Store.objects.create(store_id="S001", store_name="Main Branch")

        # Expense Type
        self.exp_type = ExpenseType.objects.create(
            department=self.dept,
            expense_name="Spare Parts",
            required=True,
            approve_required=False
        )

        # Priority, Status, Subdept, WorkNature
        self.priority = Priority.objects.create(department=self.dept, priority_name="High", level=1)
        self.status = Status.objects.create(status_name="Open")
        self.subdept = SubDepartment.objects.create(department=self.dept, sub_department_name="AC Repairs")
        self.nature = WorkNature.objects.create(nature_name="Compressor Repair", sub_department=self.subdept, default_priority=self.priority)
        from apps.finance.models import LedgerBatch
        self.ledger_batch = LedgerBatch.objects.create(batch_name="AC Batch", active=True)
        self.ledger_batch.sub_departments.add(self.subdept)

        # Ticket
        self.ticket = Ticket.objects.create(
            work_order_no="WO-9001",
            title="AC Repair",
            department=self.dept,
            store=self.store,
            nature=self.nature,
            priority=self.priority,
            status=self.status,
            created_by=self.office_user
        )

        # Seed Workflow
        self.workflow = ApprovalWorkflow.objects.create(
            name="Bundle 2-Step Workflow",
            entity_type="Bundle",
            is_active=True
        )
        self.step1 = ApprovalStep.objects.create(
            workflow=self.workflow,
            step_order=1,
            step_name="Office Check",
            assigned_role=self.role_admin,
            is_final_step=False
        )
        self.step2 = ApprovalStep.objects.create(
            workflow=self.workflow,
            step_order=2,
            step_name="Manager Approval",
            assigned_role=self.role_manager,
            is_final_step=True
        )

    def test_full_financial_workflow(self):
        # 1. Create individual expenses
        exp1 = Expense.objects.create(
            ticket=self.ticket,
            worker=self.worker,
            added_by=self.worker,
            expense_type=self.exp_type,
            amount=Decimal("150.00"),
            expense_date="2026-09-20",
            approved=True
        )
        exp2 = Expense.objects.create(
            ticket=self.ticket,
            worker=self.worker,
            added_by=self.worker,
            expense_type=self.exp_type,
            amount=Decimal("250.00"),
            expense_date="2026-09-21",
            approved=True
        )

        # 2. Bundle expenses into WorkerClaim (Bundle)
        bundle = BundleService.create_bundle(
            worker=self.worker,
            expense_ids=[exp1.expense_id, exp2.expense_id],
            period_from="2026-09-01",
            period_to="2026-09-20",
            remarks="Weekly HVAC repair expenses",
            created_by=self.worker
        )

        exp1.refresh_from_db()
        exp2.refresh_from_db()
        self.assertEqual(bundle.total_claimed_amount, Decimal("400.00"))
        self.assertEqual(bundle.status, "Draft")
        self.assertTrue(exp1.is_claimed)
        self.assertTrue(exp2.is_claimed)

        # 3. Submit Bundle for Approval
        BundleService.submit_bundle(bundle.claim_id, actor=self.worker)
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "In Review")

        # Verify ApprovalInstance created for Step 1
        inst1 = ApprovalInstance.objects.filter(claim=bundle, status="Pending").first()
        self.assertIsNotNone(inst1)
        self.assertEqual(inst1.step, self.step1)

        # 4. Action Step 1 (Office Check) -> Approve
        ApprovalService.action_step(inst1.instance_id, actor=self.office_user, action="APPROVED", comments="Verified receipts")
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "In Review")

        # Verify ApprovalInstance created for Step 2
        inst2 = ApprovalInstance.objects.filter(claim=bundle, status="Pending").first()
        self.assertIsNotNone(inst2)
        self.assertEqual(inst2.step, self.step2)

        # 5. Action Step 2 (Manager Approval) -> Final Approve
        ApprovalService.action_step(inst2.instance_id, actor=self.manager_user, action="APPROVED", comments="Approved by Manager")
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "Approved")

        # 6. Group Approved Bundle into Ledger
        ledger_group = LedgerGroup.objects.create(group_name="September Batch A", created_by=self.office_user)
        ledgers = LedgerService.create_ledger(
            bundle_ids=[bundle.claim_id],
            created_by=self.office_user,
            ledger_group_id=ledger_group.ledger_group_id,
            remarks="Batch 1 September"
        )
        ledger = ledgers[0] if isinstance(ledgers, list) else ledgers
        self.assertEqual(ledger.total_amount, Decimal("400.00"))
        self.assertEqual(ledger.status, "Draft")

        # 7. Process Payment for Bundle
        payment = PaymentService.process_payment(
            actor=self.cashier_user,
            payment_method="Bank Transfer",
            amount_paid=Decimal("400.00"),
            bundle_id=bundle.claim_id,
            transaction_reference="TRX-100200"
        )

        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "Paid")
        self.assertEqual(payment.amount_paid, Decimal("400.00"))

        # 8. Verify Audit Trail
        audit_events = AuditEvent.objects.filter(entity_name="WorkerClaim", entity_id=str(bundle.claim_id))
        self.assertTrue(audit_events.count() >= 4)

    def test_audit_event_immutability(self):
        audit = AuditEvent.objects.create(
            entity_name="WorkerClaim",
            entity_id="1",
            action="TEST_ACTION",
            actor=self.worker
        )
        # Attempting to modify must raise ValueError
        with self.assertRaises(ValueError):
            audit.action = "MODIFIED"
            audit.save()

        # Attempting to delete must raise ValueError
        with self.assertRaises(ValueError):
            audit.delete()

    def test_rejection_retains_expenses(self):
        exp = Expense.objects.create(
            ticket=self.ticket,
            worker=self.worker,
            expense_type=self.exp_type,
            amount=Decimal("100.00"),
            expense_date="2026-09-20",
            approved=True
        )
        bundle = BundleService.create_bundle(
            worker=self.worker,
            expense_ids=[exp.expense_id],
            period_from="2026-09-01",
            period_to="2026-09-20",
            remarks="Test bundle remarks",
            created_by=self.worker
        )
        BundleService.submit_bundle(bundle.claim_id, actor=self.worker)

        inst = ApprovalInstance.objects.filter(claim=bundle, status="Pending").first()
        ApprovalService.action_step(inst.instance_id, actor=self.office_user, action="REJECTED", comments="Invalid receipt")

        bundle.refresh_from_db()
        exp.refresh_from_db()

        self.assertEqual(bundle.status, "Rejected")
        self.assertTrue(exp.is_claimed)
        self.assertEqual(exp.claim, bundle)

    def test_guardian_object_permission_and_user_assignment(self):
        from guardian.shortcuts import assign_perm
        from apps.accounts.models import CustomUser

        custom_approver = CustomUser.objects.create_user(
            username="custom_approver", password="password123", full_name="Custom Approver"
        )

        exp = Expense.objects.create(
            ticket=self.ticket,
            worker=self.worker,
            expense_type=self.exp_type,
            amount=Decimal("80.00"),
            expense_date="2026-09-22",
            approved=True
        )
        bundle = BundleService.create_bundle(
            worker=self.worker,
            expense_ids=[exp.expense_id],
            period_from="2026-09-01",
            period_to="2026-09-20",
            remarks="Custom approver bundle",
            created_by=self.worker
        )
        BundleService.submit_bundle(bundle.claim_id, actor=self.worker)

        inst = ApprovalInstance.objects.filter(claim=bundle, status="Pending").first()

        # Step 1 without assignment should fail
        with self.assertRaises(ValidationError):
            ApprovalService.action_step(inst.instance_id, actor=custom_approver, action="APPROVED")

        # 1. Test direct user assignment to step
        self.step1.assigned_users.add(custom_approver)
        self.assertTrue(ApprovalService.can_user_action_step(custom_approver, self.step1, inst))
        
        # Action Step 1 successfully
        ApprovalService.action_step(inst.instance_id, actor=custom_approver, action="APPROVED", comments="Step 1 OK")

        # Step 2 is now pending
        inst2 = ApprovalInstance.objects.filter(claim=bundle, status="Pending").first()
        self.assertIsNotNone(inst2)

        # 2. Test Guardian object-level permission assignment for Step 2
        assign_perm('approve_workerclaim', custom_approver, bundle)
        self.assertTrue(ApprovalService.can_user_action_step(custom_approver, inst2.step, inst2))
        
        # Action Step 2 with Guardian permission
        ApprovalService.action_step(inst2.instance_id, actor=custom_approver, action="APPROVED", comments="Step 2 OK via Guardian")

        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "Approved")


class ExpenseApiFlowTestCase(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient

        self.client = APIClient()
        self.role_manager, _ = Role.objects.get_or_create(role_name="Store Manager")
        self.role_admin, _ = Role.objects.get_or_create(role_name="Office Administrator")

        self.worker = User.objects.create_user(username="worker_exp", password="password123")
        self.manager = User.objects.create_user(username="mgr_exp", password="password123", role=self.role_manager)
        self.office = User.objects.create_user(username="office_exp", password="password123", role=self.role_admin)

        self.dept = Department.objects.create(department_name="Electrical")
        self.store = Store.objects.create(store_id="S002", store_name="Branch Two")
        self.exp_type_req = ExpenseType.objects.create(
            department=self.dept,
            expense_name="Materials",
            required=False,
            approve_required=True,
        )
        self.exp_type_auto = ExpenseType.objects.create(
            department=self.dept,
            expense_name="Parking",
            required=False,
            approve_required=False,
        )
        self.priority = Priority.objects.create(department=self.dept, priority_name="Medium", level=2)
        self.status = Status.objects.create(status_name="Open")
        self.subdept = SubDepartment.objects.create(department=self.dept, sub_department_name="Wiring")
        self.nature = WorkNature.objects.create(
            nature_name="Socket Fix", sub_department=self.subdept, default_priority=self.priority
        )
        self.ticket = Ticket.objects.create(
            work_order_no="WO-9100",
            title="Socket Fix",
            department=self.dept,
            store=self.store,
            nature=self.nature,
            priority=self.priority,
            status=self.status,
            created_by=self.office,
        )

        self.exp_wf = ApprovalWorkflow.objects.create(
            name="Expense 2-Step",
            entity_type="Expense",
            is_active=True,
        )
        self.step1 = ApprovalStep.objects.create(
            workflow=self.exp_wf,
            step_order=1,
            step_name="Manager Check",
            assigned_role=self.role_manager,
            is_final_step=False,
        )
        self.step2 = ApprovalStep.objects.create(
            workflow=self.exp_wf,
            step_order=2,
            step_name="Office Approval",
            assigned_role=self.role_admin,
            is_final_step=True,
        )

    def test_expense_status_flow_and_ticket_api(self):
        # 1. Create expense requiring approval
        self.client.force_authenticate(user=self.worker)
        res = self.client.post(
            "/api/finance/expense/",
            {
                "ticket": self.ticket.ticket_id,
                "worker": self.worker.pk,
                "expense_type": self.exp_type_req.expense_type_id,
                "amount": "12.500",
                "expense_date": timezone.localdate().isoformat(),
                "remarks": "Cable reel",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        exp_id = res.data["expense_id"]

        # Manager sees Pending Approval at Step 1 and actionable
        self.client.force_authenticate(user=self.manager)
        list_res = self.client.get(f"/api/finance/expense/?ticket={self.ticket.ticket_id}")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.data["results"] if "results" in list_res.data else list_res.data
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["status_display"], "Pending Approval")
        self.assertEqual(items[0]["current_step_name"], "Manager Check")
        self.assertTrue(items[0]["is_actionable_by_me"])
        self.assertFalse(items[0]["has_current_user_approved"])

        # Manager approves Step 1 -> moves to Step 2
        act1 = self.client.post(
            f"/api/finance/expense/{exp_id}/action/",
            {"action": "APPROVED", "comments": "Looks good"},
            format="json",
        )
        self.assertEqual(act1.status_code, 200)
        self.assertEqual(act1.data["expense"]["status_display"], "Pending Approval")
        self.assertEqual(act1.data["expense"]["current_step_name"], "Office Approval")
        self.assertTrue(act1.data["expense"]["has_current_user_approved"])
        self.assertFalse(act1.data["expense"]["is_actionable_by_me"])

        # Office Admin sees Step 2 actionable
        self.client.force_authenticate(user=self.office)
        list_res2 = self.client.get(f"/api/finance/expense/?ticket={self.ticket.ticket_id}")
        items2 = list_res2.data["results"] if "results" in list_res2.data else list_res2.data
        self.assertEqual(items2[0]["current_step_name"], "Office Approval")
        self.assertFalse(items2[0]["has_current_user_approved"])
        self.assertTrue(items2[0]["is_actionable_by_me"])

        # Office Admin requests Rework
        act2 = self.client.post(
            f"/api/finance/expense/{exp_id}/action/",
            {"action": "REWORK", "comments": "Upload clearer bill"},
            format="json",
        )
        self.assertEqual(act2.status_code, 200)
        self.assertEqual(act2.data["expense"]["status_display"], "Rework")
        self.assertEqual(act2.data["expense"]["reject_reason"], "Upload clearer bill")
        self.assertIsNone(act2.data["expense"]["current_step_name"])

        # Status filter for Rework returns it, Pending Approval does not
        rework_filter = self.client.get("/api/finance/expense/?status=Rework").data
        rework_ids = [x["expense_id"] for x in (rework_filter["results"] if "results" in rework_filter else rework_filter)]
        self.assertIn(exp_id, rework_ids)

        pending_filter = self.client.get("/api/finance/expense/?status=Pending%20Approval").data
        pending_ids = [x["expense_id"] for x in (pending_filter["results"] if "results" in pending_filter else pending_filter)]
        self.assertNotIn(exp_id, pending_ids)

        # Worker resubmits -> back to Step 1 Pending Approval, and Manager does NOT show has_current_user_approved from prior cycle
        self.client.force_authenticate(user=self.worker)
        sub_res = self.client.post(f"/api/finance/expense/{exp_id}/submit/", {}, format="json")
        self.assertEqual(sub_res.status_code, 200)
        self.assertEqual(sub_res.data["expense"]["status_display"], "Pending Approval")
        self.assertEqual(sub_res.data["expense"]["current_step_name"], "Manager Check")
        self.assertIsNone(sub_res.data["expense"]["reject_reason"])

        self.client.force_authenticate(user=self.manager)
        mgr_res = self.client.get(f"/api/finance/expense/?ticket={self.ticket.ticket_id}").data
        mgr_items = mgr_res["results"] if "results" in mgr_res else mgr_res
        self.assertFalse(mgr_items[0]["has_current_user_approved"])
        self.assertTrue(mgr_items[0]["is_actionable_by_me"])

        # Complete Step 1 and Step 2 -> Approved
        self.client.post(f"/api/finance/expense/{exp_id}/action/", {"action": "APPROVED"}, format="json")
        self.client.force_authenticate(user=self.office)
        act_final = self.client.post(f"/api/finance/expense/{exp_id}/action/", {"action": "APPROVED"}, format="json")
        self.assertEqual(act_final.status_code, 200)
        self.assertEqual(act_final.data["expense"]["status_display"], "Approved")

        # Also test auto-approved expense marked Paid -> status_display must be Paid
        exp_auto = Expense.objects.create(
            ticket=self.ticket,
            worker=self.worker,
            added_by=self.worker,
            expense_type=self.exp_type_auto,
            amount=Decimal("2.000"),
            expense_date=timezone.localdate().isoformat(),
            approved=True,
            is_paid=True,
        )
        res_all = self.client.get(f"/api/finance/expense/?ticket={self.ticket.ticket_id}").data
        all_items = {x["expense_id"]: x for x in (res_all["results"] if "results" in res_all else res_all)}
        self.assertEqual(all_items[exp_auto.expense_id]["status_display"], "Paid")


class LedgerGroupBundleRemovalTestCase(TestCase):
    def setUp(self):
        from apps.finance.models import LedgerBatch

        self.role_super, _ = Role.objects.get_or_create(role_name="Administrator")
        self.role_office, _ = Role.objects.get_or_create(role_name="Office Administrator")

        self.admin_user = User.objects.create_user(
            username="super_admin_test", password="password123", role=self.role_super
        )
        self.office_user = User.objects.create_user(
            username="office_user_test", password="password123", role=self.role_office
        )
        self.worker = User.objects.create_user(
            username="tech_ledger_test", password="password123"
        )

        self.dept = Department.objects.create(department_name="Mechanical")
        self.store = Store.objects.create(store_id="S010", store_name="Test Store")
        self.exp_type = ExpenseType.objects.create(
            department=self.dept, expense_name="Parts", required=False, approve_required=False
        )
        self.priority = Priority.objects.create(department=self.dept, priority_name="Normal", level=1)
        self.status = Status.objects.create(status_name="Open")

        self.subdept1 = SubDepartment.objects.create(department=self.dept, sub_department_name="AC")
        self.subdept2 = SubDepartment.objects.create(department=self.dept, sub_department_name="Civil")
        self.batch1 = LedgerBatch.objects.create(batch_name="AC Batch", active=True)
        self.batch1.sub_departments.add(self.subdept1)
        self.batch2 = LedgerBatch.objects.create(batch_name="Civil Batch", active=True)
        self.batch2.sub_departments.add(self.subdept2)

        self.nature1 = WorkNature.objects.create(
            nature_name="AC Fix", sub_department=self.subdept1, default_priority=self.priority
        )
        self.nature2 = WorkNature.objects.create(
            nature_name="Wall Fix", sub_department=self.subdept2, default_priority=self.priority
        )
        self.ticket1 = Ticket.objects.create(
            work_order_no="WO-1001", title="AC", department=self.dept,
            store=self.store, nature=self.nature1, priority=self.priority,
            status=self.status, created_by=self.office_user
        )
        self.ticket2 = Ticket.objects.create(
            work_order_no="WO-1002", title="Civil", department=self.dept,
            store=self.store, nature=self.nature2, priority=self.priority,
            status=self.status, created_by=self.office_user
        )

    def _make_approved_bundle(self, ticket, amount_str):
        exp = Expense.objects.create(
            ticket=ticket, worker=self.worker, added_by=self.worker,
            expense_type=self.exp_type, amount=Decimal(amount_str),
            expense_date=timezone.localdate().isoformat(), approved=True
        )
        bundle = BundleService.create_bundle(
            worker=self.worker, expense_ids=[exp.expense_id],
            remarks="Test bundle", created_by=self.worker
        )
        bundle.status = "Approved"
        bundle.save(update_fields=["status"])
        return bundle

    def test_draft_group_with_stale_is_completed_allows_removing_bundle_and_resets_to_draft(self):
        b1 = self._make_approved_bundle(self.ticket1, "10.000")
        b2 = self._make_approved_bundle(self.ticket2, "20.000")
        group = LedgerGroup.objects.create(group_name="Group 10 Repro", created_by=self.admin_user)

        ledgers = LedgerService.create_ledger(
            bundle_ids=[b1.claim_id], created_by=self.admin_user, ledger_group_id=group.ledger_group_id
        )
        ledger1 = ledgers[0]
        ledger1.status = "Approved"
        ledger1.save(update_fields=["status"])
        group.is_completed = True
        group.completed_at = timezone.now()
        group.completed_by = self.admin_user
        group.save(update_fields=["is_completed", "completed_at", "completed_by"])

        # Adding a bundle to the completed group resets existing non-paid batches to Draft and clears is_completed
        created2 = LedgerService.create_ledger(
            bundle_ids=[b2.claim_id], created_by=self.admin_user, ledger_group_id=group.ledger_group_id
        )
        ledger2 = created2[0]
        group.refresh_from_db()
        ledger1.refresh_from_db()
        self.assertFalse(group.is_completed)
        self.assertEqual(ledger1.status, "Draft")
        self.assertEqual(ledger2.status, "Draft")

        # Even if stale is_completed=True existed on a Draft group, removal succeeds and resets group to Draft
        group.is_completed = True
        group.save(update_fields=["is_completed"])

        LedgerService.remove_bundle_from_group(group.ledger_group_id, b2.claim_id, actor=self.admin_user)
        group.refresh_from_db()
        ledger1.refresh_from_db()
        self.assertFalse(group.is_completed)
        self.assertFalse(Ledger.objects.filter(pk=ledger2.ledger_id).exists())
        self.assertEqual(ledger1.status, "Draft")
        self.assertEqual(group.total_amount, Decimal("10.000"))

    def test_admin_removing_bundle_from_completed_approved_group_resets_all_to_draft(self):
        b1 = self._make_approved_bundle(self.ticket1, "15.000")
        b2 = self._make_approved_bundle(self.ticket1, "25.000")
        b3 = self._make_approved_bundle(self.ticket2, "30.000")
        group = LedgerGroup.objects.create(group_name="Approved Group", created_by=self.admin_user)

        ledgers = LedgerService.create_ledger(
            bundle_ids=[b1.claim_id, b2.claim_id, b3.claim_id],
            created_by=self.admin_user,
            ledger_group_id=group.ledger_group_id
        )
        for lg in ledgers:
            lg.status = "Approved"
            lg.save(update_fields=["status"])
        group.is_completed = True
        group.completed_at = timezone.now()
        group.completed_by = self.admin_user
        group.save(update_fields=["is_completed", "completed_at", "completed_by"])

        # Non-admin cannot remove bundle from completed group
        with self.assertRaises(ValidationError):
            LedgerService.remove_bundle_from_group(group.ledger_group_id, b1.claim_id, actor=self.office_user)

        # Administrator removes b1 -> clears is_completed and resets all non-paid ledgers to Draft
        LedgerService.remove_bundle_from_group(group.ledger_group_id, b1.claim_id, actor=self.admin_user)
        group.refresh_from_db()
        self.assertFalse(group.is_completed)
        self.assertIsNone(group.completed_at)
        self.assertEqual(group.total_amount, Decimal("55.000"))
        for lg in group.ledgers.all():
            self.assertEqual(lg.status, "Draft")

    def test_paid_group_cannot_have_bundle_removed_even_by_admin(self):
        b1 = self._make_approved_bundle(self.ticket1, "10.000")
        b2 = self._make_approved_bundle(self.ticket1, "15.000")
        group = LedgerGroup.objects.create(
            group_name="Paid Group", created_by=self.admin_user
        )
        ledgers = LedgerService.create_ledger(
            bundle_ids=[b1.claim_id, b2.claim_id], created_by=self.admin_user, ledger_group_id=group.ledger_group_id
        )
        ledgers[0].status = "Paid"
        ledgers[0].save(update_fields=["status"])
        group.is_completed = True
        group.is_paid = True
        group.save(update_fields=["is_completed", "is_paid"])

        with self.assertRaises(ValidationError):
            LedgerService.remove_bundle_from_group(group.ledger_group_id, b1.claim_id, actor=self.admin_user)
        with self.assertRaises(ValidationError):
            LedgerService.remove_bundle(ledgers[0].ledger_id, b1.claim_id, actor=self.admin_user)

    def test_admin_removing_bundle_from_in_review_group_resets_to_draft(self):
        b1 = self._make_approved_bundle(self.ticket1, "12.000")
        b2 = self._make_approved_bundle(self.ticket2, "18.000")
        group = LedgerGroup.objects.create(group_name="In Review Group", created_by=self.office_user)
        ledgers = LedgerService.create_ledger(
            bundle_ids=[b1.claim_id, b2.claim_id], created_by=self.office_user, ledger_group_id=group.ledger_group_id
        )
        for lg in ledgers:
            lg.status = "In Review"
            lg.save(update_fields=["status"])

        LedgerService.remove_bundle_from_group(group.ledger_group_id, b2.claim_id, actor=self.admin_user)
        group.refresh_from_db()
        ledgers[0].refresh_from_db()
        self.assertFalse(group.is_completed)
        self.assertEqual(ledgers[0].status, "Draft")
        self.assertEqual(group.total_amount, Decimal("12.000"))

    def test_any_user_removing_draft_bundle_resets_remaining_batch_to_draft_not_approved(self):
        from apps.finance.serializers import LedgerGroupSerializer

        b1 = self._make_approved_bundle(self.ticket1, "40.000")
        b2 = self._make_approved_bundle(self.ticket2, "15.000")
        group = LedgerGroup.objects.create(group_name="Mixed Draft Group", created_by=self.office_user)
        wf = ApprovalWorkflow.objects.create(name="Ledger Workflow", entity_type="Ledger", is_active=True)
        step = ApprovalStep.objects.create(
            workflow=wf, step_order=1, step_name="ENGG Approval", assigned_role=self.role_super, is_final_step=True
        )

        # Batch 1 approved previously, Batch 2 currently in Draft inside the same group
        l1 = LedgerService.create_ledger(
            bundle_ids=[b1.claim_id], created_by=self.office_user, ledger_group_id=group.ledger_group_id
        )[0]
        LedgerService.submit_ledger(l1.ledger_id, actor=self.office_user)
        inst = ApprovalInstance.objects.get(ledger=l1, status="Pending")
        ApprovalService.action_step(inst.instance_id, actor=self.admin_user, action="APPROVED", comments="OK")
        group.refresh_from_db()
        self.assertTrue(group.is_completed)

        # Simulate pre-existing Draft Batch 2 inside the group while Batch 1 remained Approved
        l2 = Ledger.objects.create(
            ledger_group=group, ledger_batch=self.batch2, created_by=self.office_user,
            total_amount=Decimal("15.000"), status="Draft"
        )
        l2.bundles.add(b2)
        group.is_completed = False
        group.save(update_fields=["is_completed"])

        # Non-super user removes b2 from Draft l2 -> l2 deleted AND l1 must reset to Draft (never revert to Approved)
        LedgerService.remove_bundle_from_group(group.ledger_group_id, b2.claim_id, actor=self.office_user)
        l1.refresh_from_db()
        group.refresh_from_db()
        self.assertFalse(Ledger.objects.filter(pk=l2.ledger_id).exists())
        self.assertEqual(l1.status, "Draft")
        self.assertEqual(l1.approval_instances.count(), 0)
        self.assertFalse(group.is_completed)
        self.assertEqual(LedgerGroupSerializer(group).data["status"], "Draft")

        # Must be explicitly submitted and approved to become Approved again
        LedgerService.submit_ledger(l1.ledger_id, actor=self.office_user)
        l1.refresh_from_db()
        self.assertEqual(l1.status, "In Review")
        inst2 = ApprovalInstance.objects.get(ledger=l1, status="Pending")
        ApprovalService.action_step(inst2.instance_id, actor=self.admin_user, action="APPROVED", comments="Re-approved")
        l1.refresh_from_db()
        group.refresh_from_db()
        self.assertEqual(l1.status, "Approved")
        self.assertEqual(LedgerGroupSerializer(group).data["status"], "Approved")

    def test_add_bundle_and_add_bundle_to_group_always_reset_group_to_draft_until_approved(self):
        b1 = self._make_approved_bundle(self.ticket1, "20.000")
        b2 = self._make_approved_bundle(self.ticket2, "30.000")
        b3 = self._make_approved_bundle(self.ticket1, "10.000")
        group = LedgerGroup.objects.create(group_name="Re-Approval On Add", created_by=self.admin_user)
        wf = ApprovalWorkflow.objects.create(name="Ledger WF", entity_type="Ledger", is_active=True)
        ApprovalStep.objects.create(
            workflow=wf, step_order=1, step_name="Final Check", assigned_role=self.role_super, is_final_step=True
        )

        l1 = LedgerService.create_ledger(
            bundle_ids=[b1.claim_id], created_by=self.admin_user, ledger_group_id=group.ledger_group_id
        )[0]
        LedgerService.submit_ledger(l1.ledger_id, actor=self.admin_user)
        inst = ApprovalInstance.objects.get(ledger=l1, status="Pending")
        ApprovalService.action_step(inst.instance_id, actor=self.admin_user, action="APPROVED", comments="OK")
        group.refresh_from_db()
        self.assertTrue(group.is_completed)

        # Adding bundle of a different batch via add_bundle_to_group resets existing l1 back to Draft too
        LedgerService.add_bundle_to_group(group.ledger_group_id, bundle_id=b2.claim_id, actor=self.admin_user)
        l1.refresh_from_db()
        group.refresh_from_db()
        self.assertFalse(group.is_completed)
        self.assertEqual(l1.status, "Draft")
        self.assertEqual(l1.approval_instances.count(), 0)
        for lg in group.ledgers.all():
            self.assertEqual(lg.status, "Draft")

        # Approve all, then add_bundle directly onto a single batch -> resets sibling batches in group to Draft
        for lg in group.ledgers.all():
            LedgerService.submit_ledger(lg.ledger_id, actor=self.admin_user)
            pending = ApprovalInstance.objects.get(ledger=lg, status="Pending")
            ApprovalService.action_step(pending.instance_id, actor=self.admin_user, action="APPROVED", comments="OK")
        group.refresh_from_db()
        self.assertTrue(group.is_completed)

        LedgerService.add_bundle(l1.ledger_id, b3.claim_id, actor=self.admin_user)
        group.refresh_from_db()
        self.assertFalse(group.is_completed)
        for lg in group.ledgers.all():
            self.assertEqual(lg.status, "Draft")
            self.assertEqual(lg.approval_instances.count(), 0)

    def test_expense_type_default_fill_fields_and_serialization(self):
        from apps.finance.serializers import ExpenseTypeSerializer, ExpenseTypeWriteSerializer

        et = ExpenseType.objects.create(
            department=self.dept,
            expense_name="Bus Fare",
            required=False,
            approve_required=True,
            default_fill=True,
            default_fill_template="Bus ticket for {LOCATION}",
        )
        data = ExpenseTypeSerializer(et).data
        self.assertTrue(data["default_fill"])
        self.assertEqual(data["default_fill_template"], "Bus ticket for {LOCATION}")

        # Updating default_fill via write serializer
        write_ser = ExpenseTypeWriteSerializer(
            instance=et,
            data={"default_fill": False, "default_fill_template": "{Location} Taxi fair"},
            partial=True,
        )
        self.assertTrue(write_ser.is_valid(), write_ser.errors)
        updated = write_ser.save()
        self.assertFalse(updated.default_fill)
        self.assertEqual(updated.default_fill_template, "{Location} Taxi fair")

    def test_bundle_cash_settlement_saves_uploaded_receipt_image(self):
        import shutil
        import tempfile
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from rest_framework.test import APIClient

        temp_media = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=temp_media):
                bundle = self._make_approved_bundle(self.ticket1, "45.750")
                group = LedgerGroup.objects.create(
                    group_name="Receipt Test Group", created_by=self.admin_user
                )
                ledgers = LedgerService.create_ledger(
                    bundle_ids=[bundle.claim_id],
                    created_by=self.admin_user,
                    ledger_group_id=group.ledger_group_id,
                )
                ledger = ledgers[0]
                ledger.status = "Approved"
                ledger.save(update_fields=["status"])
                group.is_completed = True
                group.save(update_fields=["is_completed"])

                client = APIClient()
                client.force_authenticate(user=self.admin_user)

                receipt_file = SimpleUploadedFile(
                    "signed_voucher.png",
                    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR",
                    content_type="image/png",
                )
                resp = client.post(
                    "/api/finance/payments/process-payment/",
                    data={
                        "bundle_id": bundle.claim_id,
                        "payment_method": "Cash",
                        "amount_paid": "45.750",
                        "recipient_name": "tech_john",
                        "remarks": "Signed voucher attached",
                        "receipt_image": receipt_file,
                    },
                    format="multipart",
                )
                self.assertEqual(resp.status_code, 201, resp.data)
                self.assertTrue(resp.data.get("receipt_image"))
                self.assertIn("payment_receipts/", resp.data["receipt_image"])

                payment = Payment.objects.get(pk=resp.data["payment_id"])
                self.assertTrue(bool(payment.receipt_image))
                bundle.refresh_from_db()
                ledger.refresh_from_db()
                group.refresh_from_db()
                self.assertEqual(bundle.status, "Paid")
                self.assertEqual(ledger.status, "Paid")
                self.assertTrue(group.is_paid)

                ledger_resp = client.get(f"/api/finance/ledgers/{ledger.ledger_id}/")
                self.assertEqual(ledger_resp.status_code, 200, ledger_resp.data)
                bundles_data = ledger_resp.data.get("bundles") or []
                self.assertEqual(len(bundles_data), 1)
                self.assertTrue(bundles_data[0].get("payment_receipt_image"))
                self.assertIn("payment_receipts/", bundles_data[0]["payment_receipt_image"])
        finally:
            shutil.rmtree(temp_media, ignore_errors=True)


