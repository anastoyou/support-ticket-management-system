from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal

from .models import (
    WorkerClaim, Expense, Ledger, LedgerGroup, LedgerBatch,
    ApprovalWorkflow, ApprovalStep, ApprovalInstance,
    AuditEvent, Payment
)
from apps.accounts.models import Role


def create_audit_event(entity_name, entity_id, action, actor=None, payload=None, ip_address=None):
    """
    Creates an immutable audit record for financial transactions.
    """
    return AuditEvent.objects.create(
        entity_name=str(entity_name),
        entity_id=str(entity_id),
        action=action,
        actor=actor,
        payload=payload or {},
        ip_address=ip_address
    )


class ApprovalService:
    @staticmethod
    def get_active_workflow(entity_type):
        return ApprovalWorkflow.objects.filter(entity_type=entity_type, is_active=True).first()

    @classmethod
    def start_workflow(cls, entity, actor, ip_address=None):
        """
        Starts the approval workflow for a given entity (WorkerClaim, Ledger, or Expense).
        """
        is_bundle = isinstance(entity, WorkerClaim)
        is_expense = isinstance(entity, Expense)
        wf_entity_type = 'Bundle' if is_bundle else (
            'Expense' if is_expense else 'Ledger')
        audit_entity_name = 'WorkerClaim' if is_bundle else (
            'Expense' if is_expense else 'Ledger')
        entity_pk = getattr(entity, 'claim_id', getattr(
            entity, 'ledger_id', getattr(entity, 'expense_id', entity.pk)))

        if is_expense and entity.expense_type and not entity.expense_type.approve_required:
            entity.approved = True
            entity.approved_by = actor
            entity.save(update_fields=['approved', 'approved_by'])
            create_audit_event(audit_entity_name, entity_pk, 'AUTO_APPROVED', actor=actor, payload={
                               'reason': 'ExpenseType does not require approval'}, ip_address=ip_address)
            return None

        workflow = cls.get_active_workflow(wf_entity_type)

        if not workflow:
            # If no multi-step workflow defined, auto-approve
            if hasattr(entity, 'approved'):
                entity.approved = True
                entity.approved_by = actor
                entity.save(update_fields=['approved', 'approved_by'])
            else:
                entity.status = 'Approved'
                if hasattr(entity, 'approved_by'):
                    entity.approved_by = actor
                entity.save(update_fields=[
                            'status'] + (['approved_by'] if hasattr(entity, 'approved_by') else []))
            create_audit_event(audit_entity_name, entity_pk, 'AUTO_APPROVED', actor=actor, payload={
                               'reason': 'No active workflow'}, ip_address=ip_address)
            return None

        first_step = workflow.steps.order_by('step_order').first()
        if not first_step:
            if hasattr(entity, 'approved'):
                entity.approved = True
                entity.save(update_fields=['approved'])
            else:
                entity.status = 'Approved'
                entity.save(update_fields=['status'])
            create_audit_event(audit_entity_name, entity_pk, 'AUTO_APPROVED', actor=actor, payload={
                               'reason': 'Workflow has no steps'}, ip_address=ip_address)
            return None

        # Update entity status to In Review if status field exists
        if hasattr(entity, 'status'):
            entity.status = 'In Review'
            entity.save(update_fields=['status'])

        # Clean up any unhandled pending instances so the workflow starts fresh from the first step (Step 1) while preserving history
        if hasattr(entity, 'approval_instances'):
            entity.approval_instances.filter(status='Pending').delete()

        # Create first approval instance
        instance = ApprovalInstance.objects.create(
            step=first_step,
            claim=entity if is_bundle else None,
            ledger=entity if not is_bundle and not is_expense else None,
            expense=entity if is_expense else None,
            status='Pending'
        )

        create_audit_event(
            audit_entity_name,
            entity_pk,
            'WORKFLOW_STARTED',
            actor=actor,
            payload={'workflow_id': workflow.workflow_id,
                     'step_id': first_step.step_id, 'step_name': first_step.step_name},
            ip_address=ip_address
        )
        return instance

    @classmethod
    def can_user_action_step(cls, actor, step, instance=None):
        """
        Determines if a user has permission to action an approval step:
        1. Superuser
        2. User-wise: Direct assignment in step.assigned_users (takes priority if configured)
        3. Role-wise: Matching step.assigned_role
        4. Fallback: Only if step has neither assigned_users nor assigned_role
        """
        if not actor or not actor.is_authenticated:
            return False
        if actor.is_superuser:
            return True

        # Check Guardian object-level permission on target instance
        target_entity = None
        perm_name = None
        if instance:
            if instance.claim:
                target_entity = instance.claim
                perm_name = 'finance.approve_workerclaim'
            elif instance.expense:
                target_entity = instance.expense
                perm_name = 'finance.approve_expense'
            elif instance.ledger:
                target_entity = instance.ledger
                perm_name = 'finance.approve_ledger'

        if perm_name and target_entity and actor.has_perm(perm_name, target_entity):
            return True

        # 1. User-wise: If specific users are assigned to the step, ONLY those assigned users can action it
        if step.assigned_users.exists():
            return step.assigned_users.filter(pk=actor.pk).exists()

        # 2. Role-wise: If a specific role is assigned to the step, ONLY users with that role can action it
        if step.assigned_role:
            actor_role = getattr(actor, 'role', None)
            if actor_role:
                return actor_role == step.assigned_role or getattr(actor_role, 'pk', None) == step.assigned_role_id
            return False

        # 3. Fallback only if step has NEITHER assigned_users NOR assigned_role
        if perm_name:
            if actor.has_perm(perm_name):
                return True

        actor_role_name = (actor.role.role_name.lower().strip(
        ) if hasattr(actor, 'role') and actor.role else '')
        if actor_role_name in ['administrator', 'admin']:
            return True

        return False

    @classmethod
    def action_step(cls, instance_id, actor, action, comments=None, ledger_group_id=None, new_group_name=None, ip_address=None):
        """
        Processes an approval action ('APPROVED', 'REJECTED', 'REWORK') for an ApprovalInstance.
        """
        valid_actions = ['APPROVED', 'REJECTED', 'REWORK']
        if action not in valid_actions:
            raise ValidationError(
                f"Invalid action '{action}'. Must be one of {valid_actions}")

        if action == 'REWORK' and not (comments and str(comments).strip()):
            raise ValidationError(
                "A reason or comment is required when requesting rework.")

        with transaction.atomic():
            instance = ApprovalInstance.objects.select_for_update().get(pk=instance_id)

            if instance.status != 'Pending':
                raise ValidationError(
                    f"Approval instance #{instance_id} is already processed ({instance.status}).")

            # Check actor permission (User-wise, Guardian object perms, Model perms, or Role)
            step = instance.step
            if not cls.can_user_action_step(actor, step, instance):
                actor_role_name = actor.role.role_name if getattr(
                    actor, 'role', None) else 'None'
                raise ValidationError(
                    f"User '{actor.username}' (role '{actor_role_name}') is not authorized for step '{step.step_name}'."
                )

            instance.action_by = actor
            instance.comments = comments
            instance.actioned_at = timezone.now()

            entity = instance.claim or instance.ledger or instance.expense
            audit_entity_name = 'WorkerClaim' if instance.claim else (
                'Expense' if instance.expense else 'Ledger')
            entity_id = instance.claim_id if instance.claim else (
                instance.expense_id if instance.expense else instance.ledger_id)

            if action == 'APPROVED':
                instance.status = 'Approved'
                instance.save()

                # Check if there is a next step
                workflow = step.workflow
                next_step = workflow.steps.filter(
                    step_order__gt=step.step_order).order_by('step_order').first()

                if next_step and not step.is_final_step:
                    # Move to next step
                    ApprovalInstance.objects.create(
                        step=next_step,
                        claim=instance.claim,
                        ledger=instance.ledger,
                        expense=instance.expense,
                        status='Pending'
                    )
                    if hasattr(entity, 'status'):
                        entity.status = 'In Review'
                        entity.save(update_fields=['status'])
                    create_audit_event(
                        audit_entity_name, entity_id, 'APPROVED_STEP', actor=actor,
                        payload={
                            'step_id': step.step_id, 'next_step_id': next_step.step_id, 'comments': comments},
                        ip_address=ip_address
                    )
                else:
                    # Final approval reached
                    if hasattr(entity, 'approved'):
                        entity.approved = True
                        entity.approved_by = actor
                        entity.save(update_fields=['approved', 'approved_by'])
                    else:
                        entity.status = 'Approved'
                        if hasattr(entity, 'approved_by'):
                            entity.approved_by = actor
                        entity.save()

                        # Auto-complete group in backend if all member ledgers are now approved
                        ledger_obj = instance.ledger or (entity if hasattr(entity, 'ledger_group') else None)
                        if ledger_obj and getattr(ledger_obj, 'ledger_group', None):
                            grp = ledger_obj.ledger_group
                            if grp.ledgers.exclude(status__in=['Approved', 'Paid']).count() == 0:
                                if not grp.is_completed:
                                    grp.is_completed = True
                                    grp.completed_at = timezone.now()
                                    grp.completed_by = actor
                                    grp.save(update_fields=['is_completed', 'completed_at', 'completed_by'])

                    create_audit_event(
                        audit_entity_name, entity_id, 'APPROVED_FINAL', actor=actor,
                        payload={'step_id': step.step_id,
                                 'comments': comments},
                        ip_address=ip_address
                    )

            elif action == 'REJECTED':
                instance.status = 'Rejected'
                instance.save()

                if hasattr(entity, 'approved'):
                    entity.approved = False
                    entity.save(update_fields=['approved'])
                elif hasattr(entity, 'status'):
                    entity.status = 'Rejected'
                    if hasattr(entity, 'reject_reason'):
                        entity.reject_reason = comments
                    entity.save()

                if instance.ledger and instance.ledger.ledger_group and instance.ledger.ledger_group.is_completed:
                    instance.ledger.ledger_group.is_completed = False
                    instance.ledger.ledger_group.completed_at = None
                    instance.ledger.ledger_group.completed_by = None
                    instance.ledger.ledger_group.save(update_fields=['is_completed', 'completed_at', 'completed_by'])

                # When a bundle or ledger is rejected, retain tied expenses in the bundle and mark status as Rejected
                if instance.claim:
                    instance.claim.status = 'Rejected'
                    if hasattr(instance.claim, 'reject_reason'):
                        instance.claim.reject_reason = comments
                    instance.claim.save()

                create_audit_event(
                    audit_entity_name, entity_id, 'REJECTED', actor=actor,
                    payload={'step_id': step.step_id, 'comments': comments},
                    ip_address=ip_address
                )

            elif action == 'REWORK':
                instance.status = 'Rework'
                instance.comments = comments
                instance.actioned_at = timezone.now()
                instance.action_by = actor
                instance.save()

                if hasattr(entity, 'approved'):
                    entity.approved = False
                    entity.save(update_fields=['approved'])

                # Remove any other pending instances so the item is cleanly paused in Rework status
                if hasattr(entity, 'approval_instances'):
                    entity.approval_instances.filter(status='Pending').exclude(
                        instance_id=instance.instance_id).delete()

                if hasattr(entity, 'status'):
                    entity.status = 'Rework'
                    if hasattr(entity, 'reject_reason'):
                        entity.reject_reason = comments
                    entity.save()

                # When a bundle has rework requested, update status
                if instance.claim:
                    instance.claim.status = 'Rework'
                    if hasattr(instance.claim, 'reject_reason'):
                        instance.claim.reject_reason = comments
                    instance.claim.save()

                if instance.ledger:
                    if instance.ledger.ledger_group and instance.ledger.ledger_group.is_completed:
                        instance.ledger.ledger_group.is_completed = False
                        instance.ledger.ledger_group.completed_at = None
                        instance.ledger.ledger_group.completed_by = None
                        instance.ledger.ledger_group.save(update_fields=['is_completed', 'completed_at', 'completed_by'])

                    # If group reassignment is specified during Ledger rework
                    if ledger_group_id or (new_group_name and str(new_group_name).strip()):
                        LedgerService.change_ledger_group(
                            ledger_id=instance.ledger.ledger_id,
                            ledger_group_id=ledger_group_id,
                            new_group_name=new_group_name,
                            actor=actor,
                            ip_address=ip_address
                        )
                        instance.ledger.refresh_from_db()

                create_audit_event(
                    audit_entity_name, entity_id, 'REWORK_REQUESTED', actor=actor,
                    payload={'step_id': step.step_id, 'comments': comments},
                    ip_address=ip_address
                )

            instance.refresh_from_db()
            return instance


class BundleService:
    @classmethod
    def create_bundle(cls, worker, expense_ids, period_from=None, period_to=None, remarks=None, created_by=None, ip_address=None):
        """
        Creates a new WorkerClaim (Bundle) containing the specified expense IDs.
        """
        if not expense_ids:
            raise ValidationError(
                "Cannot create a bundle with empty expenses list.")

        if not remarks or not str(remarks).strip():
            raise ValidationError(
                "Bundle remarks are required for creating a bundle.")

        with transaction.atomic():
            expenses = Expense.objects.select_for_update().filter(expense_id__in=expense_ids)

            if len(expenses) != len(expense_ids):
                raise ValidationError("One or more expense IDs do not exist.")

            if not worker:
                worker = expenses.first().worker

            for exp in expenses:
                if exp.worker_id != worker.pk:
                    worker_name = exp.worker.full_name or exp.worker.username if exp.worker else 'another technician'
                    target_name = worker.full_name or worker.username
                    raise ValidationError(
                        f"Expense #{exp.expense_id} belongs to '{worker_name}', but this bundle is for '{target_name}'. A bundle must contain expenses for a single technician.")
                if exp.is_claimed or exp.claim_id is not None:
                    raise ValidationError(
                        f"Expense #{exp.expense_id} is already claimed in Bundle {exp.claim_id}.")
                if not exp.approved and not (exp.expense_type and not exp.expense_type.approve_required):
                    raise ValidationError(
                        f"Expense #{exp.expense_id} is pending approval and cannot be included in a bundle until approved.")

            total_amount = sum(exp.amount for exp in expenses)

            expense_dates = [
                exp.expense_date for exp in expenses if exp.expense_date]
            derived_from = min(
                expense_dates) if expense_dates else timezone.now().date()
            derived_to = max(
                expense_dates) if expense_dates else timezone.now().date()

            bundle = WorkerClaim.objects.create(
                worker=worker,
                total_claimed_amount=total_amount,
                status='Draft',
                period_from=period_from if period_from else derived_from,
                period_to=period_to if period_to else derived_to,
                remarks=remarks,
                submitted_by=created_by
            )

            expenses.update(is_claimed=True, claim=bundle)

            create_audit_event(
                'WorkerClaim', bundle.claim_id, 'BUNDLE_CREATED', actor=created_by,
                payload={'expense_ids': list(
                    expense_ids), 'total_amount': str(total_amount)},
                ip_address=ip_address
            )

            return bundle

    @classmethod
    def update_bundle(cls, bundle_id, expense_ids=None, period_from=None, period_to=None, remarks=None, actor=None, ip_address=None):
        """
        Updates an existing WorkerClaim (Bundle), allowing adding/removing expenses and updating remarks/dates.
        """
        with transaction.atomic():
            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)

            if bundle.status not in ['Draft', 'Rework', 'Rejected', 'Approved']:
                raise ValidationError(
                    f"Bundle {bundle_id} is in status '{bundle.status}' and cannot be edited.")

            if bundle.ledgers.exists():
                for lg in bundle.ledgers.all():
                    if getattr(lg.ledger_group, 'is_completed', False) or lg.status == 'Paid':
                        raise ValidationError(
                            f"This bundle is attached to Ledger Batch #{lg.ledger_id} which is completed/paid and cannot be modified.")

            if period_from is not None:
                bundle.period_from = period_from if period_from else None
            if period_to is not None:
                bundle.period_to = period_to if period_to else None
            if remarks is not None:
                bundle.remarks = remarks

            if expense_ids is not None:
                if len(expense_ids) == 0:
                    raise ValidationError(
                        "A bundle must contain at least one expense.")

                # Get current expenses linked to this bundle
                current_expenses = list(
                    Expense.objects.select_for_update().filter(claim=bundle))
                current_ids = set(e.expense_id for e in current_expenses)
                target_ids = set(int(eid) for eid in expense_ids)

                to_remove_ids = current_ids - target_ids
                to_add_ids = target_ids - current_ids

                # Remove expenses that are unselected
                if to_remove_ids:
                    Expense.objects.filter(expense_id__in=to_remove_ids, claim=bundle).update(
                        is_claimed=False, claim=None)

                # Add new expenses that are selected
                if to_add_ids:
                    new_expenses = Expense.objects.select_for_update().filter(expense_id__in=to_add_ids)
                    for exp in new_expenses:
                        if exp.worker_id != bundle.worker_id:
                            worker_name = exp.worker.full_name or exp.worker.username if exp.worker else 'another technician'
                            target_name = bundle.worker.full_name or bundle.worker.username if bundle.worker else 'technician'
                            raise ValidationError(
                                f"Expense #{exp.expense_id} belongs to '{worker_name}', but this bundle is for '{target_name}'.")
                        if exp.is_claimed and exp.claim_id != bundle.claim_id:
                            raise ValidationError(
                                f"Expense #{exp.expense_id} is already claimed in Bundle {exp.claim_id}.")
                        if not exp.approved and not (exp.expense_type and not exp.expense_type.approve_required):
                            raise ValidationError(
                                f"Expense #{exp.expense_id} is pending approval and cannot be added.")
                    new_expenses.update(is_claimed=True, claim=bundle)

            # Recalculate total claimed amount from all expenses currently linked to bundle
            bundle.total_claimed_amount = sum(
                exp.amount for exp in Expense.objects.filter(claim=bundle))
            bundle.status = 'Draft'
            bundle.approval_instances.filter(
                status='Approved').update(status='Pending')
            bundle.save()

            # Resync any parent ledgers attached to this bundle
            for lg in bundle.ledgers.all():
                bundle_expenses = Expense.objects.filter(
                    claim__in=lg.bundles.all())
                lg.expenses.set(bundle_expenses)
                if lg.status == 'Approved':
                    lg.status = 'Draft'
                    lg.approval_instances.filter(
                        status='Approved').update(status='Pending')
                    lg.save(update_fields=['status'])
                LedgerService.recalculate_ledger_total(lg)

            create_audit_event(
                'WorkerClaim', bundle.claim_id, 'BUNDLE_UPDATED', actor=actor,
                payload={'expense_ids': list(expense_ids) if expense_ids is not None else [
                ], 'total_amount': str(bundle.total_claimed_amount), 'status': 'Draft'},
                ip_address=ip_address
            )

            return bundle

    @classmethod
    def remove_expense_from_bundle(cls, bundle_id, expense_id, actor=None, ip_address=None):
        """
        Removes an expense from a bundle and resets the bundle status back to 'Draft'.
        """
        with transaction.atomic():
            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)

            if bundle.status == 'Paid':
                raise ValidationError(
                    f"Bundle #{bundle_id} is already paid and cannot be modified.")

            if bundle.expenses.count() <= 1:
                raise ValidationError(
                    "Cannot remove the only expense. Please delete the Bundle instead.")

            for lg in bundle.ledgers.all():
                if getattr(lg.ledger_group, 'is_completed', False) or lg.status == 'Paid':
                    raise ValidationError(
                        f"Bundle #{bundle_id} is attached to a completed/paid Ledger Batch and cannot be modified.")

            expense = Expense.objects.select_for_update().get(pk=expense_id)
            if expense.claim_id != bundle.claim_id and expense.claim != bundle:
                raise ValidationError(
                    f"Expense #{expense_id} does not belong to Bundle #{bundle_id}.")

            expense.is_claimed = False
            expense.claim = None
            expense.save(update_fields=['is_claimed', 'claim'])

            # If this expense was in any attached ledgers, remove it
            for lg in bundle.ledgers.all():
                if expense in lg.expenses.all():
                    lg.expenses.remove(expense)
                if lg.status == 'Approved':
                    lg.status = 'Draft'
                    lg.approval_instances.filter(
                        status='Approved').update(status='Pending')
                    lg.save(update_fields=['status'])
                LedgerService.recalculate_ledger_total(lg)

            # Recalculate bundle total claimed amount
            remaining_expenses = Expense.objects.filter(claim=bundle)
            bundle.total_claimed_amount = sum(
                e.amount for e in remaining_expenses)
            bundle.status = 'Draft'
            bundle.approval_instances.filter(
                status='Approved').update(status='Pending')
            bundle.save()

            create_audit_event(
                'WorkerClaim', bundle.claim_id, 'EXPENSE_REMOVED_FROM_BUNDLE', actor=actor,
                payload={'expense_id': expense_id, 'amount': str(
                    expense.amount), 'new_bundle_status': 'Draft'},
                ip_address=ip_address
            )

            return bundle

    @classmethod
    def delete_bundle(cls, bundle_id, actor=None, ip_address=None):
        """
        Deletes a WorkerClaim (Bundle) and resets all attached expenses back to unclaimed status.
        """
        with transaction.atomic():
            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)

            if bundle.ledgers.exists():
                raise ValidationError(
                    "This bundle is attached to a ledger batch and cannot be deleted.")

            if bundle.status in ('Approved', 'Paid'):
                raise ValidationError(
                    "Approved or Paid bundles cannot be deleted.")

            # Reset all tied expenses back to their original unclaimed position
            Expense.objects.filter(claim=bundle).update(
                is_claimed=False, claim=None)

            create_audit_event(
                'WorkerClaim', bundle.claim_id, 'BUNDLE_DELETED', actor=actor,
                payload={'total_amount': str(bundle.total_claimed_amount)},
                ip_address=ip_address
            )

            bundle.delete()

    @classmethod
    def submit_bundle(cls, bundle_id, actor, ip_address=None):
        """
        Submits a Draft or Rework bundle for multi-step approval.
        """
        with transaction.atomic():
            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)

            if bundle.status not in ['Draft', 'Rework', 'Rejected']:
                raise ValidationError(
                    f"Bundle {bundle_id} is in status '{bundle.status}' and cannot be submitted.")

            if not bundle.expenses.exists():
                raise ValidationError(
                    f"Cannot submit Bundle #{bundle_id}: No expenses attached to this bundle.")

            bundle.submitted_at = timezone.now()
            bundle.submitted_by = actor
            bundle.status = 'In Review'
            bundle.save()

            ApprovalService.start_workflow(
                bundle, actor, ip_address=ip_address)

            create_audit_event(
                'WorkerClaim', bundle.claim_id, 'BUNDLE_SUBMITTED', actor=actor,
                payload={'total_amount': str(bundle.total_claimed_amount)},
                ip_address=ip_address
            )

            return bundle


class LedgerService:
    @classmethod
    def has_super_permission(cls, user):
        if not user:
            return False
        if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
            return True
        role_name = getattr(getattr(user, 'role', None), 'role_name', '').lower().strip()
        if role_name in ('administrator', 'admin'):
            return True
        return user.has_perm('finance.super_permission') or user.has_perm('super_permission')

    @classmethod
    def recalculate_ledger_total(cls, ledger):
        """
        Recalculates total_amount of a Ledger batch based on its expenses and/or bundles.
        """
        attached_expenses = list(ledger.expenses.all())
        if attached_expenses:
            total = sum(e.amount for e in attached_expenses)
        else:
            total = sum(b.total_claimed_amount for b in ledger.bundles.all())

        ledger.total_amount = Decimal(str(total))
        ledger.save(update_fields=['total_amount'])
        return total

    @classmethod
    def create_ledger(cls, bundle_ids, created_by, ledger_group_id=None, remarks=None, ip_address=None):
        """
        Creates one or more Ledgers combining multiple approved WorkerClaims (Bundles),
        automatically classified into Ledgers based on active LedgerBatches (by sub_department).
        If any expense belongs to a sub_department not in any active LedgerBatch, raises ValidationError.
        """
        if not bundle_ids:
            raise ValidationError("Cannot create a ledger without bundles.")

        bundle_ids = list(dict.fromkeys(int(bid) for bid in bundle_ids if bid is not None))

        with transaction.atomic():
            bundles = list(WorkerClaim.objects.select_for_update().filter(
                claim_id__in=bundle_ids))

            if len(bundles) != len(bundle_ids):
                raise ValidationError("One or more bundle IDs do not exist.")

            for b in bundles:
                if b.status != 'Approved':
                    raise ValidationError(
                        f"Bundle #{b.claim_id} is in status '{b.status}'. Only 'Approved' bundles can be added to a Ledger.")
                if b.ledgers.exists():
                    active_ledgers = b.ledgers.exclude(status='Rejected')
                    if active_ledgers.exists():
                        raise ValidationError(
                            f"Bundle #{b.claim_id} is already attached to a Ledger batch and cannot be added to another Ledger.")

            # Lock expense rows first without nullable outer joins (PostgreSQL rejects FOR UPDATE on outer joins)
            list(Expense.objects.select_for_update().filter(claim__in=bundles).values_list('pk', flat=True))

            # Load all expenses linked to these bundles with related sub_department details
            expenses = list(Expense.objects.filter(claim__in=bundles).select_related(
                'ticket__nature__sub_department',
                'ticket__department',
                'expense_type',
                'claim'
            ))

            if not expenses:
                raise ValidationError("Selected bundle(s) have no expenses.")

            # Fetch active LedgerBatches with their sub_departments
            batches = list(LedgerBatch.objects.filter(
                active=True).prefetch_related('sub_departments'))
            if not batches:
                raise ValidationError(
                    "No active Ledger Batches found. Please configure Ledger Batches in Finance settings before assembling ledgers.")

            # Map sub_department_id -> LedgerBatch
            subdept_to_batch = {}
            for batch in batches:
                for subdept in batch.sub_departments.all():
                    subdept_to_batch[subdept.sub_department_id] = batch

            # Check every expense and classify
            batch_expenses_map = {}  # batch_id -> {'batch': batch, 'expenses': [], 'bundles': set()}
            unmapped_errors = []

            for exp in expenses:
                sub_dept = None
                if exp.ticket and exp.ticket.nature and exp.ticket.nature.sub_department:
                    sub_dept = exp.ticket.nature.sub_department

                if not sub_dept:
                    unmapped_errors.append(
                        f"Expense #{exp.expense_id} has no associated Sub-Department.")
                    continue

                matching_batch = subdept_to_batch.get(
                    sub_dept.sub_department_id)
                if not matching_batch:
                    unmapped_errors.append(
                        f"Expense #{exp.expense_id} belongs to Sub-Department '{sub_dept.sub_department_name}' which is not assigned to any Ledger Batch."
                    )
                    continue

                if matching_batch.batch_id not in batch_expenses_map:
                    batch_expenses_map[matching_batch.batch_id] = {
                        'batch': matching_batch,
                        'expenses': [],
                        'bundles': set()
                    }

                batch_expenses_map[matching_batch.batch_id]['expenses'].append(
                    exp)
                if exp.claim:
                    batch_expenses_map[matching_batch.batch_id]['bundles'].add(
                        exp.claim)

            if unmapped_errors:
                raise ValidationError(
                    "Cannot assemble ledger: " + " | ".join(unmapped_errors))

            ledger_group = None
            if ledger_group_id:
                try:
                    ledger_group = LedgerGroup.objects.select_for_update().get(pk=ledger_group_id)
                except LedgerGroup.DoesNotExist:
                    raise ValidationError(f"Ledger Group #{ledger_group_id} does not exist.")

            existing_batch_map = {}
            if ledger_group:
                group_has_approved = ledger_group.ledgers.filter(status='Approved').exists()
                if group_has_approved and not cls.has_super_permission(created_by):
                    raise ValidationError(
                        f"Ledger Group '{ledger_group.group_name}' is Approved. Only users with super_permission can add bundles."
                    )
                for l in ledger_group.ledgers.select_for_update().all():
                    if l.ledger_batch_id:
                        existing_batch_map[l.ledger_batch_id] = l

            created_ledgers = []
            for b_id, data in batch_expenses_map.items():
                batch_obj = data['batch']
                batch_exp_list = data['expenses']
                batch_bundle_list = list(data['bundles'])
                batch_total = sum(e.amount for e in batch_exp_list)

                ledger = existing_batch_map.get(b_id)
                if ledger:
                    if ledger.status == 'Paid':
                        raise ValidationError(
                            f"Ledger Batch '{batch_obj.batch_name}' in this group is 'Paid' and cannot be modified."
                        )
                    if ledger.status == 'Approved' and not cls.has_super_permission(created_by):
                        raise ValidationError(
                            f"Ledger Batch '{batch_obj.batch_name}' is Approved. Only users with super_permission can add bundles to an approved ledger."
                        )
                    ledger.expenses.add(*batch_exp_list)
                    ledger.bundles.add(*batch_bundle_list)
                    if ledger.status in ['Approved', 'In Review', 'Submitted']:
                        ledger.status = 'Draft'
                        ledger.approval_instances.all().delete()
                        ledger.save(update_fields=['status'])
                    cls.recalculate_ledger_total(ledger)
                    created_ledgers.append(ledger)
                else:
                    ledger = Ledger.objects.create(
                        ledger_group=ledger_group,
                        ledger_batch=batch_obj,
                        store=None,
                        created_by=created_by,
                        total_amount=batch_total,
                        status='Draft',
                        remarks=remarks
                    )
                    ledger.bundles.set(batch_bundle_list)
                    ledger.expenses.set(batch_exp_list)

                    create_audit_event(
                        'Ledger', ledger.ledger_id, 'LEDGER_CREATED', actor=created_by,
                        payload={
                            'batch_id': batch_obj.batch_id,
                            'batch_name': batch_obj.batch_name,
                            'bundle_ids': [b.claim_id for b in batch_bundle_list],
                            'expense_ids': [e.expense_id for e in batch_exp_list],
                            'total_amount': str(batch_total)
                        },
                        ip_address=ip_address
                    )
                    created_ledgers.append(ledger)

            Expense.objects.filter(pk__in=[e.pk for e in expenses]).update(is_claimed=True)

            if ledger_group:
                group_total = sum(
                    l.total_amount for l in ledger_group.ledgers.all())
                ledger_group.total_amount = group_total
                ledger_group.save(update_fields=['total_amount'])

            return created_ledgers

    @classmethod
    def submit_ledger(cls, ledger_id, actor, ip_address=None):
        """
        Submits a Ledger for approval.
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)

            if ledger.status not in ['Draft', 'Rework', 'Rejected']:
                raise ValidationError(
                    f"Ledger #{ledger_id} is in status '{ledger.status}' and cannot be submitted.")

            if not ledger.bundles.exists() and not ledger.expenses.exists():
                raise ValidationError(
                    f"Cannot submit Ledger Batch '{ledger.batch_name}' (#{ledger_id}): Must have at least one claim bundle attached.")

            ledger.status = 'In Review'
            ledger.save()

            ApprovalService.start_workflow(
                ledger, actor, ip_address=ip_address)

            create_audit_event(
                'Ledger', ledger.ledger_id, 'LEDGER_SUBMITTED', actor=actor,
                payload={'total_amount': str(ledger.total_amount)},
                ip_address=ip_address
            )

            return ledger

    @classmethod
    def add_expense(cls, ledger_id, expense_id, actor=None, ip_address=None):
        """
        Adds an approved expense to an editable Ledger batch.
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)
            if ledger.ledger_group and getattr(ledger.ledger_group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{ledger.ledger_group.group_name}' is completed and locked. Expenses cannot be added.")
            if ledger.status == 'Paid':
                raise ValidationError(
                    f"Ledger #{ledger_id} is in status '{ledger.status}' and cannot be modified.")

            expense = Expense.objects.select_for_update().get(pk=expense_id)
            if ledger.expenses.filter(pk=expense_id).exists():
                raise ValidationError(
                    f"Expense #{expense_id} is already included in Ledger Batch #{ledger_id}.")

            ledger.expenses.add(expense)
            expense.is_claimed = True
            expense.save(update_fields=['is_claimed'])

            if ledger.status == 'Approved':
                ledger.status = 'Draft'
                ledger.approval_instances.filter(
                    status='Approved').update(status='Pending')
                ledger.save(update_fields=['status'])

            cls.recalculate_ledger_total(ledger)

            create_audit_event(
                'Ledger', ledger.ledger_id, 'EXPENSE_ADDED', actor=actor,
                payload={'expense_id': expense_id,
                         'amount': str(expense.amount)},
                ip_address=ip_address
            )
            return ledger

    @classmethod
    def remove_expense(cls, ledger_id, expense_id, actor=None, ip_address=None):
        """
        Removes an expense from a Ledger batch and its bundle (if linked).
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)
            if ledger.ledger_group and getattr(ledger.ledger_group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{ledger.ledger_group.group_name}' is completed and locked. Expenses cannot be removed.")
            if ledger.status == 'Paid':
                raise ValidationError(
                    f"Ledger #{ledger_id} is in status '{ledger.status}' and cannot be modified.")

            if ledger.expenses.count() <= 1:
                raise ValidationError(
                    "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.")

            expense = Expense.objects.select_for_update().get(pk=expense_id)

            # Check if this expense is the only expense in its bundle (claim)
            if expense.claim:
                bundle = expense.claim
                if bundle.expenses.count() <= 1:
                    raise ValidationError(
                        "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.")

                # Also prevent removing if it is the only expense of this bundle inside this ledger batch
                ledger_bundle_exp_count = ledger.expenses.filter(claim=bundle).count()
                if ledger_bundle_exp_count <= 1:
                    raise ValidationError(
                        "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.")

                # Unlink expense from its bundle if it belongs to one
                expense.is_claimed = False
                expense.claim = None
                expense.save(update_fields=['is_claimed', 'claim'])

                # Recalculate bundle total claimed amount
                bundle.total_claimed_amount = sum(
                    e.amount for e in Expense.objects.filter(claim=bundle))
                bundle.save(update_fields=['total_claimed_amount'])

            # Remove from direct expenses on ledger if present
            if expense in ledger.expenses.all():
                ledger.expenses.remove(expense)

            if not expense.claim and not expense.ledgers.exists():
                expense.is_claimed = False
                expense.save(update_fields=['is_claimed'])

            # If ledger was approved, reset to Draft for re-approval
            if ledger.status == 'Approved':
                ledger.status = 'Draft'
                ledger.approval_instances.filter(
                    status='Approved').update(status='Pending')
                ledger.save(update_fields=['status'])

            cls.recalculate_ledger_total(ledger)

            create_audit_event(
                'Ledger', ledger.ledger_id, 'EXPENSE_REMOVED', actor=actor,
                payload={'expense_id': expense_id,
                         'amount': str(expense.amount)},
                ip_address=ip_address
            )
            return ledger

    @classmethod
    def add_bundle(cls, ledger_id, bundle_id, actor=None, ip_address=None):
        """
        Attaches an approved bundle to an editable Ledger batch.
        Only expenses matching the Ledger's assigned LedgerBatch (sub-departments) will be attached.
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)
            if ledger.ledger_group and getattr(ledger.ledger_group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{ledger.ledger_group.group_name}' is completed and locked. Bundles cannot be added.")
            if ledger.status == 'Paid':
                raise ValidationError(
                    f"Ledger #{ledger_id} is in status '{ledger.status}' and cannot be modified.")
            if ledger.status == 'Approved' and not cls.has_super_permission(actor):
                raise ValidationError(
                    f"Ledger #{ledger_id} is Approved. Only users with super_permission can add bundles to an approved ledger.")

            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)
            if bundle.status != 'Approved':
                raise ValidationError(
                    f"Bundle {bundle.claim_id} is in status '{bundle.status}'. Only Approved bundles can be added to a Ledger.")

            # If ledger has an assigned LedgerBatch, ALL bundle expenses must belong to its sub-departments
            bundle_expenses = list(Expense.objects.filter(
                claim=bundle).select_related('ticket__nature__sub_department'))
            if not bundle_expenses:
                raise ValidationError(
                    f"Bundle #{bundle.claim_id} has no expenses.")

            if ledger.ledger_batch:
                allowed_sub_dept_ids = set(
                    ledger.ledger_batch.sub_departments.values_list(
                        'sub_department_id', flat=True)
                )

                mismatched = []
                for exp in bundle_expenses:
                    sub_dept = None
                    if exp.ticket and exp.ticket.nature and exp.ticket.nature.sub_department:
                        sub_dept = exp.ticket.nature.sub_department

                    if not sub_dept:
                        mismatched.append(
                            f"Expense #{exp.expense_id} (No Sub-Department)")
                    elif sub_dept.sub_department_id not in allowed_sub_dept_ids:
                        mismatched.append(
                            f"Expense #{exp.expense_id} ({sub_dept.sub_department_name})")

                if mismatched:
                    raise ValidationError(
                        f"Cannot attach Bundle #{bundle.claim_id} to Ledger Batch '{ledger.ledger_batch.batch_name}': "
                        f"all expenses in the bundle must belong to this Ledger Batch. "
                        f"Mismatched expenses: {', '.join(mismatched)}."
                    )

                new_expenses = [
                    e for e in bundle_expenses if not ledger.expenses.filter(pk=e.pk).exists()]
                if not new_expenses:
                    raise ValidationError(
                        f"Bundle #{bundle.claim_id} is already attached to this Ledger."
                    )

                ledger.bundles.add(bundle)
                ledger.expenses.add(*new_expenses)
                Expense.objects.filter(pk__in=[e.pk for e in new_expenses]).update(is_claimed=True)
                added_amount = sum(e.amount for e in new_expenses)
            else:
                # Fallback if ledger has no specific batch
                new_expenses = [
                    e for e in bundle_expenses if not ledger.expenses.filter(pk=e.pk).exists()]
                ledger.bundles.add(bundle)
                ledger.expenses.add(*new_expenses)
                Expense.objects.filter(pk__in=[e.pk for e in new_expenses]).update(is_claimed=True)
                added_amount = sum(e.amount for e in new_expenses)

            # If ledger was approved or in review, reset to Draft for re-approval
            if ledger.status in ['Approved', 'In Review', 'Submitted']:
                ledger.status = 'Draft'
                ledger.approval_instances.all().delete()
                ledger.save(update_fields=['status'])

            cls.recalculate_ledger_total(ledger)
            if ledger.ledger_group:
                group_total = sum(l.total_amount for l in ledger.ledger_group.ledgers.all())
                ledger.ledger_group.total_amount = group_total
                ledger.ledger_group.save(update_fields=['total_amount'])

            create_audit_event(
                'Ledger', ledger.ledger_id, 'BUNDLE_ADDED', actor=actor,
                payload={'bundle_id': bundle_id,
                         'batch_id': ledger.ledger_batch.batch_id if ledger.ledger_batch else None,
                         'added_expenses_count': len(new_expenses),
                         'amount': str(added_amount)},
                ip_address=ip_address
            )
            return ledger

    @classmethod
    def add_bundle_to_group(cls, ledger_group_id, bundle_id=None, bundle_ids=None, actor=None, ip_address=None):
        """
        Attaches approved WorkerClaim(s) (bundles) to a LedgerGroup.
        Automatically classifies each bundle's expenses by sub_department into matching LedgerBatches within this LedgerGroup.
        - If a matching Ledger for that LedgerBatch exists in the group and is editable (Draft/Rework/Rejected), adds the expenses & bundle to it and updates total_amount.
        - If no matching Ledger exists in the group, creates a new Ledger for that LedgerBatch in this group.
        """
        target_bundle_ids = list(bundle_ids) if bundle_ids else ([bundle_id] if bundle_id else [])
        if not target_bundle_ids:
            raise ValidationError("No bundle ID(s) provided.")

        with transaction.atomic():
            group = LedgerGroup.objects.select_for_update().get(pk=ledger_group_id)
            if group.is_completed:
                raise ValidationError(
                    f"Ledger Group '{group.group_name}' is completed and locked. Bundles cannot be added.")
            if group.ledgers.filter(status='Approved').exists() and not cls.has_super_permission(actor):
                raise ValidationError(
                    f"Ledger Group '{group.group_name}' is Approved. Only users with super_permission can add bundles.")

            bundles = list(WorkerClaim.objects.select_for_update().filter(claim_id__in=target_bundle_ids))
            if len(bundles) != len(target_bundle_ids):
                found_ids = {b.claim_id for b in bundles}
                missing = [str(bid) for bid in target_bundle_ids if bid not in found_ids]
                raise ValidationError(f"Bundle(s) not found: {', '.join(missing)}")

            for b in bundles:
                if b.status != 'Approved':
                    raise ValidationError(
                        f"Bundle #{b.claim_id} is in status '{b.status}'. Only 'Approved' bundles can be added.")

            # Lock expense rows first without nullable outer joins (PostgreSQL rejects FOR UPDATE on outer joins)
            list(Expense.objects.select_for_update().filter(claim__in=bundles).values_list('pk', flat=True))

            # Load all bundle expenses in a single query
            bundle_expenses = list(Expense.objects.filter(claim__in=bundles).select_related(
                'ticket__nature__sub_department',
                'ticket__department',
                'expense_type',
                'claim'
            ))
            if not bundle_expenses:
                raise ValidationError("Selected bundle(s) have no expenses.")

            # Fetch active LedgerBatches with their sub_departments
            batches = list(LedgerBatch.objects.filter(
                active=True).prefetch_related('sub_departments'))
            if not batches:
                raise ValidationError(
                    "No active Ledger Batches found. Please configure Ledger Batches in Finance settings.")

            subdept_to_batch = {}
            for batch in batches:
                for subdept in batch.sub_departments.all():
                    subdept_to_batch[subdept.sub_department_id] = batch

            # Classify bundle expenses into batches
            batch_expenses_map = {}  # batch_id -> {'batch': batch, 'expenses': [], 'bundles': set()}
            unmapped_errors = []

            for exp in bundle_expenses:
                sub_dept = None
                if exp.ticket and exp.ticket.nature and exp.ticket.nature.sub_department:
                    sub_dept = exp.ticket.nature.sub_department

                if not sub_dept:
                    unmapped_errors.append(
                        f"Expense #{exp.expense_id} has no associated Sub-Department.")
                    continue

                matching_batch = subdept_to_batch.get(
                    sub_dept.sub_department_id)
                if not matching_batch:
                    unmapped_errors.append(
                        f"Expense #{exp.expense_id} belongs to Sub-Department '{sub_dept.sub_department_name}' which is not assigned to any Ledger Batch."
                    )
                    continue

                if matching_batch.batch_id not in batch_expenses_map:
                    batch_expenses_map[matching_batch.batch_id] = {
                        'batch': matching_batch,
                        'expenses': [],
                        'bundles': set()
                    }
                batch_expenses_map[matching_batch.batch_id]['expenses'].append(exp)
                if exp.claim:
                    batch_expenses_map[matching_batch.batch_id]['bundles'].add(exp.claim)

            if unmapped_errors:
                raise ValidationError(
                    "Cannot attach bundle: " + " | ".join(unmapped_errors))

            # Existing ledgers in this group
            existing_ledgers = list(group.ledgers.select_for_update().all())
            existing_batch_map = {
                l.ledger_batch_id: l for l in existing_ledgers if l.ledger_batch_id}

            affected_ledgers = []
            all_added_expenses = []

            for b_id, data in batch_expenses_map.items():
                batch_obj = data['batch']
                exp_list = data['expenses']
                bundle_set = list(data['bundles'])

                ledger = existing_batch_map.get(b_id)
                if ledger:
                    if ledger.status == 'Paid':
                        raise ValidationError(
                            f"Ledger Batch '{batch_obj.batch_name}' in this group is 'Paid' and cannot be modified."
                        )
                    if ledger.status == 'Approved' and not cls.has_super_permission(actor):
                        raise ValidationError(
                            f"Ledger Batch '{batch_obj.batch_name}' is Approved. Only users with super_permission can add bundles to an approved ledger."
                        )
                    ledger.expenses.add(*exp_list)
                    ledger.bundles.add(*bundle_set)

                    if ledger.status in ['Approved', 'In Review', 'Submitted']:
                        ledger.status = 'Draft'
                        ledger.approval_instances.all().delete()
                        ledger.save(update_fields=['status'])
                    cls.recalculate_ledger_total(ledger)
                    affected_ledgers.append(ledger)
                else:
                    # Create new ledger in this group for this batch
                    batch_total = sum(e.amount for e in exp_list)
                    new_ledger = Ledger.objects.create(
                        ledger_group=group,
                        ledger_batch=batch_obj,
                        store=None,
                        created_by=actor,
                        total_amount=batch_total,
                        status='Draft'
                    )
                    new_ledger.bundles.set(bundle_set)
                    new_ledger.expenses.set(exp_list)
                    affected_ledgers.append(new_ledger)

                all_added_expenses.extend(exp_list)

            if all_added_expenses:
                Expense.objects.filter(pk__in=[e.pk for e in all_added_expenses]).update(is_claimed=True)

            # Recalculate group total_amount
            group_total = sum(l.total_amount for l in group.ledgers.all())
            group.total_amount = group_total
            group.save(update_fields=['total_amount'])

            create_audit_event(
                'LedgerGroup', group.ledger_group_id, 'BUNDLE_ADDED_TO_GROUP', actor=actor,
                payload={'bundle_ids': target_bundle_ids,
                         'affected_batches': len(affected_ledgers)},
                ip_address=ip_address
            )

            return group

    @classmethod
    def remove_bundle_from_group(cls, group_id, bundle_id, actor=None, ip_address=None):
        """
        Detaches a bundle completely from all ledger batches within the specified Ledger Group.
        If any affected ledger batch was Approved, its status is reset to Draft for re-approval.
        """
        with transaction.atomic():
            group = LedgerGroup.objects.select_for_update().get(pk=group_id)
            if getattr(group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{group.group_name}' is completed and locked. Bundles cannot be removed.")

            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)
            ledgers = list(group.ledgers.select_for_update().all())

            # Check if this is the only bundle in the group
            total_bundles = sum(l.bundles.count() for l in ledgers)
            if total_bundles <= 1:
                raise ValidationError(
                    "Cannot remove the only bundle. Please delete the Ledger Batch instead.")

            # Check if any ledger containing this bundle or its expenses is Paid or Approved without super_permission
            for l in ledgers:
                has_bundle = bundle in l.bundles.all()
                matching_expenses = [e for e in l.expenses.all() if e.claim_id == bundle_id or e.claim == bundle]
                if has_bundle or matching_expenses:
                    batch_name = l.ledger_batch.batch_name if l.ledger_batch else f"Ledger #{l.ledger_id}"
                    if l.status == 'Paid':
                        raise ValidationError(
                            f"Cannot remove Bundle #{bundle_id}: Ledger Batch '{batch_name}' is already 'Paid' and settled."
                        )
                    if l.status == 'Approved' and not cls.has_super_permission(actor):
                        raise ValidationError(
                            f"Cannot remove Bundle #{bundle_id}: Ledger Batch '{batch_name}' is Approved. Only users with super_permission can remove bundles from an approved ledger."
                        )

            affected_count = 0
            for l in ledgers:
                has_bundle = bundle in l.bundles.all()
                matching_expenses = [e for e in l.expenses.all(
                ) if e.claim_id == bundle_id or e.claim == bundle]

                if has_bundle or matching_expenses:
                    if has_bundle:
                        l.bundles.remove(bundle)
                    for exp in matching_expenses:
                        l.expenses.remove(exp)

                    # If ledger was approved or in review, reset to Draft for re-approval
                    if l.status in ['Approved', 'In Review', 'Submitted']:
                        l.status = 'Draft'
                        l.approval_instances.all().delete()
                        l.save(update_fields=['status'])

                    cls.recalculate_ledger_total(l)
                    affected_count += 1

            create_audit_event(
                'LedgerGroup', group.ledger_group_id, 'BUNDLE_REMOVED_FROM_GROUP', actor=actor,
                payload={'bundle_id': bundle_id,
                         'affected_batches': affected_count},
                ip_address=ip_address
            )
            return group

    @classmethod
    def remove_bundle(cls, ledger_id, bundle_id, actor=None, ip_address=None):
        """
        Detaches a bundle from an editable Ledger batch.
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)
            if ledger.ledger_group and getattr(ledger.ledger_group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{ledger.ledger_group.group_name}' is completed and locked. Bundles cannot be removed.")
            if ledger.status == 'Paid':
                raise ValidationError(
                    f"Ledger #{ledger_id} is in status '{ledger.status}' and cannot be modified.")
            if ledger.status == 'Approved' and not cls.has_super_permission(actor):
                raise ValidationError(
                    f"Ledger #{ledger_id} is Approved. Only users with super_permission can remove bundles from an approved ledger.")

            if ledger.bundles.count() <= 1:
                raise ValidationError(
                    "Cannot remove the only bundle. Please delete the Ledger Batch instead.")

            bundle = WorkerClaim.objects.select_for_update().get(pk=bundle_id)
            if bundle not in ledger.bundles.all():
                raise ValidationError(
                    f"Bundle {bundle.claim_id} is not attached to Ledger #{ledger_id}.")

            ledger.bundles.remove(bundle)
            for exp in Expense.objects.filter(claim=bundle):
                if exp in ledger.expenses.all():
                    ledger.expenses.remove(exp)

            if ledger.status in ['Approved', 'In Review', 'Submitted']:
                ledger.status = 'Draft'
                ledger.approval_instances.all().delete()
                ledger.save(update_fields=['status'])

            cls.recalculate_ledger_total(ledger)

            create_audit_event(
                'Ledger', ledger.ledger_id, 'BUNDLE_REMOVED', actor=actor,
                payload={'bundle_id': bundle_id,
                         'amount': str(bundle.total_claimed_amount)},
                ip_address=ip_address
            )
            return ledger

    @classmethod
    def change_ledger_group(cls, ledger_id, ledger_group_id=None, new_group_name=None, actor=None, ip_address=None):
        """
        Changes the LedgerGroup of a Ledger. Allows choosing an existing group or creating a new one.
        Updates total amounts for old and new ledger.
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)

            if ledger.status in ['Approved', 'Paid']:
                raise ValidationError(
                    f"Ledger #{ledger_id} is in status '{ledger.status}' and cannot change groups.")

            old_group = ledger.ledger_group
            if old_group and getattr(old_group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{old_group.group_name}' is completed and locked. Batches cannot be removed or reassigned.")

            target_group = None

            if new_group_name and str(new_group_name).strip():
                clean_name = str(new_group_name).strip()
                target_group = LedgerGroup.objects.filter(
                    group_name__iexact=clean_name).first()
                if not target_group:
                    target_group = LedgerGroup.objects.create(
                        group_name=clean_name,
                        remarks=f"Created via Ledger #{ledger_id} group reassignment",
                        total_amount=Decimal('0.00')
                    )
            elif ledger_group_id:
                try:
                    target_group = LedgerGroup.objects.get(pk=ledger_group_id)
                except LedgerGroup.DoesNotExist:
                    raise ValidationError(
                        f"Ledger Group #{ledger_group_id} does not exist.")

            if target_group and getattr(target_group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{target_group.group_name}' is completed and locked. Batches cannot be added to it.")

            if target_group == old_group:
                return ledger

            ledger.ledger_group = target_group
            ledger.save(update_fields=['ledger_group'])

            # Recalculate totals for both groups
            if old_group:
                old_group.total_amount = sum(
                    l.total_amount for l in old_group.ledgers.all())
                old_group.save(update_fields=['total_amount'])

            if target_group:
                target_group.total_amount = sum(
                    l.total_amount for l in target_group.ledgers.all())
                target_group.save(update_fields=['total_amount'])

            create_audit_event(
                'Ledger', ledger.ledger_id, 'LEDGER_GROUP_CHANGED', actor=actor,
                payload={
                    'old_group_id': old_group.ledger_group_id if old_group else None,
                    'old_group_name': old_group.group_name if old_group else None,
                    'new_group_id': target_group.ledger_group_id if target_group else None,
                    'new_group_name': target_group.group_name if target_group else None,
                },
                ip_address=ip_address
            )

            return ledger

    @classmethod
    def delete_ledger(cls, ledger_id, actor=None, ip_address=None):
        """
        Deletes a Ledger batch. Allowed for non-paid / non-approved ledgers (Draft, Submitted, In Review, Rejected, Rework).
        """
        with transaction.atomic():
            ledger = Ledger.objects.select_for_update().get(pk=ledger_id)

            if ledger.status in ('Approved', 'Paid'):
                raise ValidationError(
                    "Approved or Paid ledger batches cannot be deleted.")

            create_audit_event(
                'Ledger', ledger.ledger_id, 'LEDGER_DELETED', actor=actor,
                payload={'total_amount': str(ledger.total_amount)},
                ip_address=ip_address
            )

            ledger.bundles.clear()
            ledger.expenses.clear()
            ledger.delete()

    @classmethod
    def delete_group(cls, group_id, actor=None, ip_address=None):
        """
        Deletes a Ledger Group if it is in Draft, Rework, or Rejected status.
        All attached claim bundles and expenses are detached so they become available again.
        """
        with transaction.atomic():
            group = LedgerGroup.objects.select_for_update().get(pk=group_id)

            if getattr(group, 'is_completed', False):
                raise ValidationError(
                    f"Ledger Group '{group.group_name}' is completed and locked. It cannot be deleted.")

            ledgers = list(group.ledgers.select_for_update().all())

            # Check if any child ledger is Paid or In Review
            for l in ledgers:
                if l.status == 'Paid':
                    raise ValidationError(
                        f"Ledger Group '{group.group_name}' contains a 'Paid' batch (#{l.ledger_id}) and cannot be deleted.")
                if l.status in ['In Review', 'Submitted']:
                    raise ValidationError(
                        f"Ledger Group '{group.group_name}' is currently in review. Action or request rework before deleting.")

            # Detach all bundles and expenses from child ledgers, then delete child ledgers
            for l in ledgers:
                l.bundles.clear()
                l.expenses.clear()
                l.approval_instances.all().delete()
                l.delete()

            create_audit_event(
                'LedgerGroup', group_id, 'GROUP_DELETED', actor=actor,
                payload={'group_name': group.group_name},
                ip_address=ip_address
            )

            group.delete()


class PaymentService:
    @classmethod
    def process_payment(cls, actor, payment_method='Cash', amount_paid=None, bundle_id=None, ledger_id=None, expense_id=None, transaction_reference=None, remarks=None, recipient_name=None, ip_address=None):
        """
        Processes a cash settlement payment for an approved Bundle or Ledger or individual Expense.
        Supports bundle-wise cash settlement: when all bundles in a ledger are paid,
        the ledger completes payment; when all ledgers in a group are paid, the group completes payment.
        Also supports ledger-wise settlement: settling a ledger marks all attached bundles as paid.
        Payment method is strictly Cash only, and split / partial payment is not allowed (full amount enforced).
        """
        payment_method = 'Cash'

        with transaction.atomic():
            bundle = WorkerClaim.objects.select_for_update().get(
                pk=bundle_id) if bundle_id else None
            ledger = Ledger.objects.select_for_update().get(
                pk=ledger_id) if ledger_id else None
            expense = Expense.objects.select_for_update().get(
                pk=expense_id) if expense_id else None

            if not any([bundle, ledger, expense]):
                raise ValidationError(
                    "Must specify one of bundle_id, ledger_id, or expense_id to record payment.")

            target_entity = bundle or ledger or expense
            entity_name = 'WorkerClaim' if bundle else (
                'Ledger' if ledger else 'Expense')
            entity_id = getattr(target_entity, 'claim_id', getattr(
                target_entity, 'ledger_id', getattr(target_entity, 'expense_id', None)))

            # Disallow split payments: enforce full non-editable amount
            if bundle:
                full_amount = Decimal(str(bundle.total_claimed_amount))
            elif ledger:
                full_amount = Decimal(str(ledger.total_amount))
            else:
                full_amount = Decimal(str(expense.amount))

            if amount_paid is not None:
                passed_amount = Decimal(str(amount_paid))
                if passed_amount != full_amount:
                    raise ValidationError(
                        f"Split / partial payment is not allowed for {entity_name} #{entity_id}. Full cash settlement of KD {full_amount:.3f} is required."
                    )
            amount_paid = full_amount

            if target_entity.status if hasattr(target_entity, 'status') else True:
                status = getattr(target_entity, 'status', 'Approved')
                if status != 'Approved':
                    raise ValidationError(
                        f"Cannot pay {entity_name} #{entity_id} because its status is '{status}' (requires 'Approved').")

            # Determine recipient name default if not provided
            if not recipient_name:
                if bundle and bundle.worker:
                    recipient_name = bundle.worker.get_full_name() or bundle.worker.username
                elif ledger and hasattr(ledger, 'created_by') and ledger.created_by:
                    recipient_name = ledger.created_by.get_full_name() or ledger.created_by.username

            payment = Payment.objects.create(
                claim=bundle,
                ledger=ledger,
                expense=expense,
                amount_paid=amount_paid,
                payment_method='Cash',
                transaction_reference=None,
                recipient_name=recipient_name,
                paid_by=actor,
                remarks=remarks
            )

            now = timezone.now()

            if bundle:
                bundle.status = 'Paid'
                bundle.save(update_fields=['status'])
                Expense.objects.filter(claim=bundle).update(is_paid=True, paid_at=now, paid_by=actor)

                # Check all parent ledgers that contain this bundle
                parent_ledgers = list(bundle.ledgers.select_for_update().all())
                for parent_ledger in parent_ledgers:
                    unpaid_bundles_exist = parent_ledger.bundles.exclude(status='Paid').exists()
                    unpaid_expenses_exist = parent_ledger.expenses.filter(is_paid=False).exists()
                    if not unpaid_bundles_exist and not unpaid_expenses_exist:
                        parent_ledger.status = 'Paid'
                        parent_ledger.save(update_fields=['status'])
                        create_audit_event(
                            'Ledger', parent_ledger.ledger_id, 'PAYMENT_PROCESSED', actor=actor,
                            payload={
                                'trigger': 'ALL_BUNDLES_PAID',
                                'last_bundle_id': bundle.claim_id,
                                'payment_id': payment.payment_id,
                                'remarks': f"All {parent_ledger.bundles.count()} bundles settled. Ledger marked as Paid."
                            },
                            ip_address=ip_address
                        )
                        # Check if parent ledger group is now completely paid
                        if parent_ledger.ledger_group:
                            group = parent_ledger.ledger_group
                            if group.ledgers.exclude(status='Paid').count() == 0:
                                group.is_paid = True
                                group.paid_at = now
                                group.paid_by = actor
                                group.payment_method = payment_method
                                group.payment_reference = transaction_reference
                                group.payment_remarks = remarks
                                if recipient_name and not group.recipient_name:
                                    group.recipient_name = recipient_name
                                group.save(update_fields=['is_paid', 'paid_at', 'paid_by', 'payment_method', 'payment_reference', 'payment_remarks', 'recipient_name'])
                                create_audit_event(
                                    'LedgerGroup', group.ledger_group_id, 'GROUP_PAID', actor=actor,
                                    payload={
                                        'trigger': 'ALL_LEDGERS_PAID',
                                        'remarks': f"All child ledgers & bundles settled. Ledger Group '{group.group_name}' marked as Paid."
                                    },
                                    ip_address=ip_address
                                )
            elif ledger:
                ledger.status = 'Paid'
                ledger.save(update_fields=['status'])
                attached_bundles = list(ledger.bundles.select_for_update().all())
                ledger.bundles.update(status='Paid')
                ledger.expenses.update(is_paid=True, paid_at=now, paid_by=actor)
                Expense.objects.filter(claim__in=attached_bundles).update(is_paid=True, paid_at=now, paid_by=actor)

                # Record bundle-level settlement audit events
                for b in attached_bundles:
                    create_audit_event(
                        'WorkerClaim', b.claim_id, 'PAYMENT_PROCESSED', actor=actor,
                        payload={
                            'trigger': 'LEDGER_SETTLED',
                            'ledger_id': ledger.ledger_id,
                            'payment_id': payment.payment_id,
                            'remarks': f"Settled via Ledger #{ledger.ledger_id}"
                        },
                        ip_address=ip_address
                    )

                if ledger.ledger_group:
                    group = ledger.ledger_group
                    if group.ledgers.exclude(status='Paid').count() == 0:
                        group.is_paid = True
                        group.paid_at = now
                        group.paid_by = actor
                        group.payment_method = payment_method
                        group.payment_reference = transaction_reference
                        group.payment_remarks = remarks
                        if recipient_name and not group.recipient_name:
                            group.recipient_name = recipient_name
                        group.save(update_fields=['is_paid', 'paid_at', 'paid_by', 'payment_method', 'payment_reference', 'payment_remarks', 'recipient_name'])
                        create_audit_event(
                            'LedgerGroup', group.ledger_group_id, 'GROUP_PAID', actor=actor,
                            payload={
                                'trigger': 'ALL_LEDGERS_PAID',
                                'remarks': f"All ledgers in group settled. Ledger Group '{group.group_name}' marked as Paid."
                            },
                            ip_address=ip_address
                        )
            elif expense:
                expense.is_paid = True
                expense.paid_at = now
                expense.paid_by = actor
                expense.save(update_fields=['is_paid', 'paid_at', 'paid_by'])

            create_audit_event(
                entity_name, entity_id, 'PAYMENT_PROCESSED', actor=actor,
                payload={'payment_id': payment.payment_id, 'amount_paid': str(
                    amount_paid), 'payment_method': payment_method, 'reference': transaction_reference, 'recipient_name': recipient_name},
                ip_address=ip_address
            )

            return payment

    @classmethod
    def pay_ledger_group(cls, group_id, actor, payment_method='Cash', payment_reference=None, remarks=None, recipient_name=None, ip_address=None):
        """
        Disburses payment for an entire completed Ledger Group.
        Marks the Ledger Group as Paid, marks all its Ledgers as Paid,
        marks all its Bundles as Paid, and marks all tied Expenses as Paid.
        """
        with transaction.atomic():
            group = LedgerGroup.objects.select_for_update().get(pk=group_id)

            if group.is_paid:
                raise ValidationError(
                    f"Ledger Group '{group.group_name}' is already marked as Paid."
                )

            # Auto-manage group completion in backend:
            # Check if all batches in this group are approved before paying
            unapproved = group.ledgers.exclude(status__in=['Approved', 'Paid'])
            if unapproved.exists():
                raise ValidationError(
                    f"Cannot pay Ledger Group '{group.group_name}'. {unapproved.count()} ledger batch(es) are not yet approved."
                )

            now = timezone.now()
            # If not yet marked completed, automatically complete it in backend
            if not group.is_completed:
                group.is_completed = True
                group.completed_at = now
                group.completed_by = actor

            group.is_paid = True
            group.paid_at = now
            group.paid_by = actor
            group.payment_method = payment_method or 'Cash'
            group.payment_reference = payment_reference
            group.payment_remarks = remarks
            group.recipient_name = recipient_name
            group.save(update_fields=[
                'is_completed', 'completed_at', 'completed_by',
                'is_paid', 'paid_at', 'paid_by',
                'payment_method', 'payment_reference', 'payment_remarks', 'recipient_name'
            ])

            # Mark all ledgers in this group as Paid
            group.ledgers.update(status='Paid')

            # Mark all bundles in those ledgers as Paid
            all_bundles = list(WorkerClaim.objects.filter(ledgers__ledger_group=group).distinct())
            WorkerClaim.objects.filter(pk__in=[b.pk for b in all_bundles]).update(status='Paid')

            # Mark all direct expenses on ledgers as Paid
            direct_expenses = Expense.objects.filter(ledgers__ledger_group=group).distinct()
            direct_expenses.update(is_paid=True, paid_at=now, paid_by=actor)

            # Mark all bundle expenses as Paid
            bundle_expenses = Expense.objects.filter(claim__in=all_bundles).distinct()
            bundle_expenses.update(is_paid=True, paid_at=now, paid_by=actor)

            # Record Payment object
            first_ledger = group.ledgers.first()
            payment = Payment.objects.create(
                ledger=first_ledger,
                amount_paid=group.total_amount,
                payment_method=payment_method or 'Cash',
                transaction_reference=payment_reference,
                recipient_name=recipient_name,
                paid_by=actor,
                remarks=remarks or f"Cash settlement for Ledger Group '{group.group_name}'"
            )

            # Create payment audit events for every bundle settled through this ledger group
            for b in all_bundles:
                create_audit_event(
                    'WorkerClaim', b.claim_id, 'PAYMENT_PROCESSED', actor=actor,
                    payload={
                        'trigger': 'LEDGER_GROUP_PAID',
                        'ledger_group_id': group.ledger_group_id,
                        'payment_id': payment.payment_id,
                        'remarks': f"Settled via Ledger Group '{group.group_name}'"
                    },
                    ip_address=ip_address
                )

            create_audit_event(
                'LedgerGroup', group.ledger_group_id, 'GROUP_PAID', actor=actor,
                payload={
                    'payment_id': payment.payment_id,
                    'total_amount': str(group.total_amount),
                    'payment_method': payment_method,
                    'reference': payment_reference,
                    'recipient_name': recipient_name,
                    'ledgers_count': group.ledgers.count(),
                    'bundles_count': len(all_bundles),
                    'expenses_count': direct_expenses.count() + bundle_expenses.count()
                },
                ip_address=ip_address
            )

            return group
