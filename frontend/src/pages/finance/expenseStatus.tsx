import React from 'react';

export interface ResolvedExpenseStatus {
  statusText: 'Paid' | 'Approved' | 'Rework' | 'Rejected' | 'Pending Approval';
  displayLabel: string;
  isPaid: boolean;
  isApproved: boolean;
  isRework: boolean;
  isRejected: boolean;
  isPending: boolean;
  stepName?: string;
  hasCurrentUserApproved: boolean;
  isActionableForMe: boolean;
  rejectReasonText: string | null;
  claimId: number | null;
  claimStatus: string | null;
  tooltip: string;
}

const getUserIdentifiers = (user: any) => {
  const userId = user?.id ?? user?.user_id ?? null;
  const username = (user?.username || '').toLowerCase().trim();
  const fullName = (user?.full_name || '').toLowerCase().trim();
  const roleName = (
    (user?.role as any)?.role_name ||
    (typeof user?.role === 'string' ? user.role : '') ||
    user?.role_name ||
    ''
  ).toLowerCase().trim();
  const isAdmin = Boolean(user?.is_superuser || roleName === 'administrator');
  return { userId, username, fullName, roleName, isAdmin };
};

export const resolveExpenseStatus = (exp: any, currentUser?: any): ResolvedExpenseStatus => {
  const claimObj = typeof exp?.claim === 'object' && exp?.claim ? exp.claim : (exp?.claim_detail || null);
  const claimId: number | null = typeof exp?.claim === 'number'
    ? exp.claim
    : (claimObj?.claim_id ?? null);
  const claimStatus: string | null = exp?.claim_status || claimObj?.status || null;
  const rawStatus: string = exp?.status_display || '';

  const approvalInstances: any[] = Array.isArray(exp?.approval_instances) ? exp.approval_instances : [];
  const activePendingInstance = !exp?.approved
    ? approvalInstances.find((i: any) => i?.status === 'Pending')
    : undefined;
  const reworkInstance = approvalInstances.find((i: any) => i?.status === 'Rework');
  const rejectedInstance = approvalInstances.find((i: any) => i?.status === 'Rejected');
  const latestInstance = approvalInstances[0];

  const isPaid = Boolean(exp?.is_paid || rawStatus === 'Paid' || claimStatus === 'Paid');
  const approveRequired =
    exp?.expense_type?.approve_required !== false &&
    exp?.expense_type_detail?.approve_required !== false;

  const isApproved = !isPaid && (exp?.approved === true || !approveRequired || rawStatus === 'Approved');
  const isRework =
    !isPaid &&
    !isApproved &&
    !activePendingInstance &&
    (rawStatus === 'Rework' || latestInstance?.status === 'Rework' || claimStatus === 'Rework');
  const isRejected =
    !isPaid &&
    !isApproved &&
    !activePendingInstance &&
    !isRework &&
    (rawStatus === 'Rejected' || latestInstance?.status === 'Rejected' || claimStatus === 'Rejected');

  const statusText: ResolvedExpenseStatus['statusText'] = isPaid
    ? 'Paid'
    : isApproved
      ? 'Approved'
      : isRework
        ? 'Rework'
        : isRejected
          ? 'Rejected'
          : 'Pending Approval';

  const isPending = statusText === 'Pending Approval';
  const stepName = isPending
    ? (exp?.current_step_name || activePendingInstance?.step_name || latestInstance?.step_name || undefined)
    : undefined;

  const { userId, username, fullName, roleName, isAdmin } = getUserIdentifiers(currentUser);

  let hasApprovedInCurrentCycle = false;
  if (isPending) {
    if (typeof exp?.has_current_user_approved === 'boolean') {
      hasApprovedInCurrentCycle = exp.has_current_user_approved;
    } else {
      for (const inst of approvalInstances) {
        if (inst?.status === 'Rework' || inst?.status === 'Rejected') {
          break;
        }
        if (inst?.status === 'Approved') {
          const actionById = typeof inst.action_by === 'object' ? (inst.action_by?.id ?? inst.action_by?.user_id) : inst.action_by;
          if (
            (inst.action_by_username && username && String(inst.action_by_username).toLowerCase().trim() === username) ||
            (actionById != null && userId != null && String(actionById) === String(userId))
          ) {
            hasApprovedInCurrentCycle = true;
            break;
          }
        }
      }
    }
  }
  const hasCurrentUserApproved = hasApprovedInCurrentCycle;

  let isActionableForMe = false;
  if (isPending && !hasCurrentUserApproved) {
    if (isAdmin) {
      isActionableForMe = true;
    } else if (typeof exp?.is_actionable_by_me === 'boolean') {
      isActionableForMe = exp.is_actionable_by_me;
    } else if (activePendingInstance?.can_action === true) {
      isActionableForMe = true;
    } else if (activePendingInstance) {
      const currentStepInfo = activePendingInstance.workflow_steps?.find(
        (s: any) =>
          s.step_id === activePendingInstance.step_id ||
          s.step_name === activePendingInstance.step_name ||
          s.step_order === activePendingInstance.step_order
      );
      const assignedUserIds: any[] = currentStepInfo?.assigned_users_ids || activePendingInstance.assigned_users_ids || [];
      const assignedUserNames: string[] = currentStepInfo?.assigned_users_names || activePendingInstance.assigned_users_names || [];
      if (assignedUserIds.length > 0 || assignedUserNames.length > 0) {
        isActionableForMe = Boolean(
          (userId != null && assignedUserIds.some(id => String(id) === String(userId))) ||
          (username && assignedUserNames.some(u => u.toLowerCase() === username)) ||
          (fullName && assignedUserNames.some(u => u.toLowerCase() === fullName))
        );
      } else {
        const stepRoleName = (currentStepInfo?.assigned_role_name || activePendingInstance.assigned_role_name || '').toLowerCase().trim();
        isActionableForMe = Boolean(stepRoleName && roleName && stepRoleName === roleName);
      }
    }
  }

  const rejectReasonText: string | null =
    exp?.reject_reason ||
    claimObj?.reject_reason ||
    (isRejected ? rejectedInstance?.comments : null) ||
    (isRework ? reworkInstance?.comments : null) ||
    null;

  const displayLabel =
    statusText === 'Paid'
      ? 'Paid & Settled'
      : statusText === 'Rework'
        ? 'Rework Needed'
        : hasCurrentUserApproved
          ? 'In Review'
          : statusText;

  const parts = [displayLabel];
  if (stepName && !hasCurrentUserApproved) {
    parts.push(stepName);
  }
  if (claimId) {
    parts.push(`Bundle #${claimId}${claimStatus ? ` (${claimStatus})` : ''}`);
  }
  const tooltip = parts.join(' • ');

  return {
    statusText,
    displayLabel,
    isPaid,
    isApproved,
    isRework,
    isRejected,
    isPending,
    stepName,
    hasCurrentUserApproved,
    isActionableForMe,
    rejectReasonText,
    claimId,
    claimStatus,
    tooltip,
  };
};

export interface FinanceStatusBadgeOptions {
  align?: 'start' | 'end';
  title?: string;
}

export const renderFinanceStatusBadge = (
  status: string,
  isActionableForMe?: boolean,
  stepName?: string,
  hasCurrentUserApproved?: boolean,
  options?: FinanceStatusBadgeOptions
): React.ReactNode => {
  const alignClass = options?.align === 'end' ? 'items-end' : 'items-start';
  const titleAttr = options?.title;

  switch (status) {
    case 'Draft':
      return (
        <span
          title={titleAttr}
          className="px-2 py-0.5 rounded text-xs font-medium bg-surface-container-high text-on-surface-variant border border-outline-variant"
        >
          Draft
        </span>
      );
    case 'Submitted':
    case 'In Review':
      if (hasCurrentUserApproved) {
        return (
          <span
            title={titleAttr}
            className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 italic"
          >
            In Review
          </span>
        );
      }
      return (
        <div title={titleAttr} className={`inline-flex flex-col ${alignClass} gap-0.5`}>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${
              isActionableForMe
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 animate-pulse font-bold ring-2 ring-amber-400/60 shadow-xs'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
          >
            In Review
          </span>
          {stepName && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 leading-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              {stepName}
            </span>
          )}
        </div>
      );
    case 'Pending Approval':
    case 'Pending':
      if (hasCurrentUserApproved) {
        return (
          <span
            title={titleAttr}
            className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 italic"
          >
            In Review
          </span>
        );
      }
      return (
        <div title={titleAttr} className={`inline-flex flex-col ${alignClass} gap-0.5`}>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${
              isActionableForMe
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 animate-pulse font-bold ring-2 ring-amber-400/60 shadow-xs'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
          >
            Pending Approval
          </span>
          {stepName && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 leading-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              {stepName}
            </span>
          )}
        </div>
      );
    case 'Approved':
      return (
        <span
          title={titleAttr}
          className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
        >
          Approved
        </span>
      );
    case 'Rejected':
      return (
        <span
          title={titleAttr}
          className="px-2 py-0.5 rounded text-xs font-medium bg-error-container text-error border border-error/20"
        >
          Rejected
        </span>
      );
    case 'Rework':
      return (
        <span
          title={titleAttr}
          className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
        >
          Rework Needed
        </span>
      );
    case 'Paid':
      return (
        <span
          title={titleAttr}
          className="px-2 py-0.5 rounded text-xs font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
        >
          Paid & Settled
        </span>
      );
    default:
      if (status?.toLowerCase().includes('pending')) {
        if (hasCurrentUserApproved) {
          return (
            <span
              title={titleAttr}
              className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            >
              In Review
            </span>
          );
        }
        return (
          <div title={titleAttr} className={`inline-flex flex-col ${alignClass} gap-0.5`}>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                isActionableForMe
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 animate-pulse font-bold ring-2 ring-amber-400/60 shadow-xs'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {status}
            </span>
            {stepName && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {stepName}
              </span>
            )}
          </div>
        );
      }
      return (
        <span
          title={titleAttr}
          className="px-2 py-0.5 rounded text-xs font-medium bg-surface-container text-on-surface"
        >
          {status}
        </span>
      );
  }
};
