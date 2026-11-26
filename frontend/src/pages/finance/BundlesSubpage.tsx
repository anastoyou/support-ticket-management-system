import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt, PlusCircle, FileText, Trash2, Search, X, Check, Paperclip, ExternalLink, Loader2, Eye, Maximize2, ShieldCheck, Layers, AlertCircle,
  Clock, RotateCcw, MessageSquare, CheckCircle, CheckCircle2, DollarSign, ChevronDown, ChevronRight, Rows3, ChevronsUp, RefreshCw, Plus,
  ArrowUpDown, ArrowUp, ArrowDown, Banknote
} from 'lucide-react';
import type { WorkerClaimItem, ExpenseItem, MediaFileItem, ApprovalStepInfo, ApprovalInstanceItem, LedgerBatchItem, LedgerItem } from './types';
import { getUserId, formatDateDMY } from './types';
import { Pagination } from './Pagination';
import { DateRangePickerCard } from '../ticket/DateRangePickerCard';
import type { ApprovalsSubpageProps } from './ApprovalsSubpage';
import { AvatarCircle, getMediaUrl } from '../ticket/TicketsTypesAndComponents';
import Can from '../../hooks/Can';
import { usePermission } from '../../hooks/usePermission';
import { BundleReportModal } from './BundleReportModal';
import { CreateWorkerBundleModal } from './CreateWorkerBundleModal';
import { ExpensePreviewModal } from './ExpensePreviewModal';
import { confirmPopup } from '../../components/tailgrids/core/ConfirmationPopup';

interface BundlesSubpageProps {
  filteredBundles?: WorkerClaimItem[];
  bundles: WorkerClaimItem[];
  ledgers?: LedgerItem[];
  unclaimedExpenses: ExpenseItem[];
  loading: boolean;
  submitting: boolean;
  renderStatusBadge: (status: string, isActionableForMe?: boolean, stepName?: string, hasCurrentUserApproved?: boolean) => React.ReactNode;
  setSelectedBundleForView: (b: WorkerClaimItem | null) => void;
  selectedBundleForView: WorkerClaimItem | null;
  openEditBundleModal: (b: WorkerClaimItem) => void;
  handleSubmitBundle: (claimId: number) => void;
  handleDeleteBundle: (claimId: number) => void;
  showCreateBundleModal: boolean;
  setShowCreateBundleModal: (show: boolean) => void;
  handleCreateBundle: () => void;
  expenseSearchWorker: string;
  setExpenseSearchWorker: (v: string) => void;
  expenseSearchText?: string;
  setExpenseSearchText?: (v: string) => void;
  expenseFilterFrom: string;
  setExpenseFilterFrom: (v: string) => void;
  expenseFilterTo: string;
  setExpenseFilterTo: (v: string) => void;
  uniqueExpenseWorkers: {
    id: number;
    name: string;
    username?: string;
    employee_no?: string;
    profile_image?: string | null;
    department_name?: string;
    sub_departments?: { sub_department_id: number; sub_department_name: string }[];
    unclaimed_count?: number;
    unclaimed_total?: number;
  }[];
  filteredUnclaimedExpenses: ExpenseItem[];
  selectedExpenseIds: number[];
  setSelectedExpenseIds: (ids: number[]) => void;
  selectedExpensesTotal: number;
  bundlePeriodFrom: string;
  setBundlePeriodFrom: (v: string) => void;
  bundlePeriodTo: string;
  setBundlePeriodTo: (v: string) => void;
  bundleRemarks: string;
  setBundleRemarks: (v: string) => void;
  handleRemoveExpenseFromBundle?: (bundleId: number, expenseId: number) => Promise<void>;
  previewMediaUrl: { url: string; title: string } | null;
  setPreviewMediaUrl: (media: { url: string; title: string } | null) => void;
  approvalsProps?: ApprovalsSubpageProps;
  token?: string;
  currentUser?: any;
  API_URL?: string;
  errorMessage?: string | null;
  setErrorMessage?: (msg: string | null) => void;
  setShowPaymentModal?: (item: any) => void;
  setSelectedTicketForModal?: (ticket: any) => void;
  onRefresh?: () => Promise<void> | void;
  currentPage?: number;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
  onItemsPerPageChange?: (num: number) => void;
  isSyncingNewBundle?: boolean;
  syncingBundleInfo?: {
    claim_id?: number | string;
    worker_name?: string;
    amount?: number;
  } | null;
  updatingBundleId?: number | null;
  deletingBundleId?: number | null;
  selectedWorkerId?: number | null;
  setSelectedWorkerId?: (id: number | null) => void;
  serverBundleStats?: {
    total_bundles?: number;
    pending_bundles?: number;
    approved_bundles?: number;
    unclaimed_expenses?: number;
  };
  filterDateFrom?: string;
  filterDateTo?: string;
}

export const BundlesSubpage: React.FC<BundlesSubpageProps> = ({
  bundles,
  filteredBundles = bundles,
  ledgers = [],
  unclaimedExpenses,
  loading,
  submitting,
  renderStatusBadge,
  setSelectedBundleForView,
  selectedBundleForView,
  openEditBundleModal,
  handleSubmitBundle,
  handleDeleteBundle,
  showCreateBundleModal,
  setShowCreateBundleModal,
  handleCreateBundle,
  expenseSearchWorker,
  setExpenseSearchWorker,
  expenseSearchText = '',
  setExpenseSearchText,
  expenseFilterFrom,
  setExpenseFilterFrom,
  expenseFilterTo,
  setExpenseFilterTo,
  uniqueExpenseWorkers,
  filteredUnclaimedExpenses,
  selectedExpenseIds,
  setSelectedExpenseIds,
  selectedExpensesTotal,
  bundlePeriodFrom,
  setBundlePeriodFrom,
  bundlePeriodTo,
  setBundlePeriodTo,
  bundleRemarks,
  setBundleRemarks,
  handleRemoveExpenseFromBundle,
  previewMediaUrl,
  setPreviewMediaUrl,
  approvalsProps,
  token = '',
  currentUser,
  API_URL = '',
  errorMessage,
  setErrorMessage,
  setShowPaymentModal,
  setSelectedTicketForModal,
  onRefresh,
  currentPage: propCurrentPage,
  totalItems: propTotalItems,
  itemsPerPage: propItemsPerPage,
  onPageChange: propOnPageChange,
  onItemsPerPageChange: propOnItemsPerPageChange,
  isSyncingNewBundle = false,
  syncingBundleInfo = null,
  updatingBundleId = null,
  deletingBundleId = null,
  selectedWorkerId,
  setSelectedWorkerId,
  serverBundleStats,
  filterDateFrom,
  filterDateTo
}) => {
  // Inline Approval State
  const [reworkComments, setReworkComments] = useState<Record<number, string>>({});
  const [reworkErrors, setReworkErrors] = useState<Record<number, string>>({});
  const [localDeletingBundleId, setLocalDeletingBundleId] = useState<number | null>(null);
  const activeDeletingId = deletingBundleId ?? localDeletingBundleId;

  const onDeleteBundle = async (claimId: number) => {
    setLocalDeletingBundleId(claimId);
    try {
      await handleDeleteBundle(claimId);
    } finally {
      setLocalDeletingBundleId(null);
    }
  };
  const [actioningBundleId, setActioningBundleId] = useState<number | null>(null);
  const [actioningActionType, setActioningActionType] = useState<'APPROVED' | 'REWORK' | null>(null);

  // Refreshing State
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleRefreshClick = async () => {
    if (isRefreshing || loading || !onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Multi-line & Bulk Action State
  const [isMultiLineView, setIsMultiLineView] = useState<boolean>(false);
  const [bulkApproving, setBulkApproving] = useState<boolean>(false);
  const [submittingBundleIds, setSubmittingBundleIds] = useState<Record<number, boolean>>({});
  const [selectedBundleForReport, setSelectedBundleForReport] = useState<WorkerClaimItem | null>(null);

  const onHandleSubmitBundle = async (claimId: number) => {
    const targetBundle = (bundles || []).find(b => b.claim_id === claimId);
    if (!targetBundle?.expenses || targetBundle.expenses.length === 0) {
      if (setErrorMessage) setErrorMessage(`Cannot submit Bundle ${claimId}: No expenses attached to this bundle.`);
      return;
    }
    setSubmittingBundleIds(prev => ({ ...prev, [claimId]: true }));
    try {
      await handleSubmitBundle(claimId);
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setSubmittingBundleIds(prev => {
        const next = { ...prev };
        delete next[claimId];
        return next;
      });
    }
  };
  const [bulkActionMsg, setBulkActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Main Table Pagination State
  const [localPage, setLocalPage] = useState(1);
  const [localItemsPerPage, setLocalItemsPerPage] = useState(10);

  const currentPage = propCurrentPage !== undefined ? propCurrentPage : localPage;
  const itemsPerPage = propItemsPerPage !== undefined ? propItemsPerPage : localItemsPerPage;
  const handlePageChange = propOnPageChange || setLocalPage;
  const handleItemsPerPageChange = propOnItemsPerPageChange || ((num: number) => {
    setLocalItemsPerPage(num);
    setLocalPage(1);
  });

  const isServerPaginated = propOnPageChange !== undefined;
  const totalItemsCount = propTotalItems !== undefined ? propTotalItems : filteredBundles.length;

  // Expanded bundle accordion state
  const [expandedBundleIds, setExpandedBundleIds] = useState<Record<number, boolean>>({});
  const toggleExpandBundle = (bundleId: number) =>
    setExpandedBundleIds(prev => ({ ...prev, [bundleId]: !prev[bundleId] }));

  // Last active row state for clicked row highlight
  const [lastActiveRowId, setLastActiveRowId] = useState<number | string | null>(null);

  // Admin and current user privilege resolution
  const isAdmin = Boolean(
    currentUser?.is_superuser ||
    (currentUser?.role as any)?.role_name?.toLowerCase() === 'administrator' ||
    (currentUser?.role as any)?.role_name?.toLowerCase() === 'admin' ||
    (typeof currentUser?.role === 'string' && (currentUser.role.toLowerCase() === 'administrator' || currentUser.role.toLowerCase() === 'admin')) ||
    currentUser?.role_name?.toLowerCase() === 'administrator' ||
    currentUser?.role_name?.toLowerCase() === 'admin'
  );
  const currentUserId = currentUser?.id ?? currentUser?.user_id;
  const currentUsername = currentUser?.username;
  const currentRoleName = (
    (currentUser?.role as any)?.role_name ||
    (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
    currentUser?.role_name ||
    ''
  ).toLowerCase().trim();

  const { hasPermission } = usePermission();

  const isCashOffice = useMemo(() => {
    if (isAdmin) return true;
    const roleName = currentRoleName;
    return (
      roleName === 'cash office' ||
      roleName === 'cash officer' ||
      roleName === 'cashier' ||
      hasPermission('finance.pay_ledger') ||
      hasPermission('finance.pay_ledger_group') ||
      hasPermission('finance.settle_cash_ledger')
    );
  }, [isAdmin, currentRoleName, hasPermission]);

  // Helper to determine whether the current user has permission to action a given approval step
  const checkCanUserActionStep = (activeApp: any, currentStepInfo?: any) => {
    // 1. Admin has all privileges to approve
    if (isAdmin) return true;
    if (activeApp?.can_action === true) return true;

    const assignedUserIds: any[] = currentStepInfo?.assigned_users_ids || activeApp?.assigned_users_ids || [];
    const assignedUserNames: string[] = currentStepInfo?.assigned_users_names || activeApp?.assigned_users_names || [];

    const isUserMatch = Boolean(
      (currentUserId && assignedUserIds.some(id => String(id) === String(currentUserId))) ||
      (currentUsername && assignedUserNames.some(u => u.toLowerCase() === currentUsername.toLowerCase())) ||
      (currentUser?.full_name && assignedUserNames.some(u => u.toLowerCase() === currentUser.full_name.toLowerCase()))
    );

    const stepRoleName = (currentStepInfo?.assigned_role_name || activeApp?.assigned_role_name || '').toLowerCase().trim();
    const isRoleMatch = Boolean(stepRoleName && currentRoleName && stepRoleName === currentRoleName);

    // 2. If users are assigned, then ONLY they can approve
    if (assignedUserIds.length > 0 || assignedUserNames.length > 0) {
      return isUserMatch;
    }

    // 3. If role is selected, whoever has the role can approve
    if (stepRoleName) {
      return isRoleMatch;
    }

    return false;
  };

  // Helper to extract approval data and workflow pipeline for a bundle
  const getBundleApprovalGroup = (bundle: WorkerClaimItem) => {
    // 1. Direct approval instances on the bundle object from API serializer (always freshest from /finance/claim/)
    const bundleDirectInstances: ApprovalInstanceItem[] =
      (bundle as any).approval_history || (bundle as any).approval_instances || [];

    // 2. Global matching approval instances
    const allApprovals = [
      ...(approvalsProps?.approvals || []),
      ...(approvalsProps?.displayedApprovals || []),
      ...(approvalsProps?.roleFilteredApprovals || [])
    ];

    const isBundleInReview = bundle.status === 'In Review' || bundle.status === 'Submitted';
    const isBundleRework = bundle.status === 'Rework' || (bundle.status as string) === 'Rework Needed';
    const isBundleRejected = bundle.status === 'Rejected';

    const directMatch = bundleDirectInstances.length > 0
      ? (isBundleInReview
        ? bundleDirectInstances.find(a => a.status === 'Pending')
        : isBundleRework
          ? [...bundleDirectInstances].reverse().find(a => a.status === 'Rework')
          : isBundleRejected
            ? [...bundleDirectInstances].reverse().find(a => a.status === 'Rejected')
            : undefined) || bundleDirectInstances[bundleDirectInstances.length - 1]
      : null;

    const matchingFromAll = (isBundleInReview ? allApprovals.find(a =>
      (a.claim === bundle.claim_id ||
        a.claim_id === bundle.claim_id ||
        (a.target_summary?.type === 'Bundle' && a.target_summary?.id === bundle.claim_id)) &&
      a.status === 'Pending'
    ) : null) || allApprovals.find(a =>
      (a.claim === bundle.claim_id ||
        a.claim_id === bundle.claim_id ||
        (a.target_summary?.type === 'Bundle' && a.target_summary?.id === bundle.claim_id)) &&
      (isBundleRework ? a.status === 'Rework' : isBundleRejected ? a.status === 'Rejected' : true)
    );

    const matchingApp = directMatch || matchingFromAll;

    // Combine history items — prefer fresh bundleDirectInstances over potentially stale matchingApp.approval_history
    let historyItems: ApprovalInstanceItem[] = [];
    if (bundleDirectInstances.length > 0) {
      historyItems = [...bundleDirectInstances];
    } else if (matchingApp?.approval_history && matchingApp.approval_history.length > 0) {
      historyItems = [...(matchingApp.approval_history as any)];
    } else if (matchingApp) {
      historyItems = [matchingApp];
    }

    // If bundle is in Rework/Rejected/Draft, ensure no stale Pending status remains in historyItems
    if (!isBundleInReview && (isBundleRework || isBundleRejected || bundle.status === 'Draft')) {
      historyItems = historyItems.map(item =>
        item.status === 'Pending'
          ? { ...item, status: (isBundleRework ? 'Rework' : isBundleRejected ? 'Rejected' : item.status) as any }
          : item
      );
    }

    // Try to find full workflow steps (e.g. all levels)
    let workflowSteps: ApprovalStepInfo[] = [];
    if (matchingApp?.workflow_steps && matchingApp.workflow_steps.length > 0) {
      workflowSteps = matchingApp.workflow_steps;
    } else {
      for (const inst of bundleDirectInstances) {
        if (inst.workflow_steps && inst.workflow_steps.length > 0) {
          workflowSteps = inst.workflow_steps;
          break;
        }
      }
    }

    if (workflowSteps.length === 0 && allApprovals.length > 0) {
      const anyBundleApp = allApprovals.find(a =>
        a.workflow_steps && a.workflow_steps.length > 0 &&
        (a.target_summary?.type === 'Bundle' || a.claim || a.claim_id)
      );
      if (anyBundleApp?.workflow_steps) {
        workflowSteps = anyBundleApp.workflow_steps;
      }
    }

    if (matchingApp || historyItems.length > 0) {
      if (workflowSteps.length > 0 && historyItems.length > 0) {
        historyItems[0] = { ...historyItems[0], workflow_steps: workflowSteps };
      }

      return {
        app: matchingApp,
        group: {
          label: `Bundle ${bundle.claim_id}`,
          type: 'Bundle' as const,
          id: bundle.claim_id,
          items: historyItems,
          isApproved: bundle.status === 'Approved' || bundle.status === 'Paid',
          isPaid: bundle.status === 'Paid',
          isCompleted: Boolean(bundle.ledger_details?.is_completed || bundle.status === 'Paid'),
          status: bundle.status,
          remarks: typeof bundle.remarks === 'string' ? bundle.remarks : '',
          ledger_details: bundle.ledger_details
        }
      };
    }

    const isBundleApproved = bundle.status === 'Approved' || bundle.status === 'Paid';
    if (isBundleApproved) {
      const approvedItems = workflowSteps.length > 0 ? workflowSteps.map(s => ({
        instance_id: bundle.claim_id,
        step_id: s.step_id,
        step_name: s.step_name,
        step_order: s.step_order,
        assigned_role_name: s.assigned_role_name || 'Finance / Admin',
        assigned_users_names: s.assigned_users_names || [],
        assigned_users_ids: s.assigned_users_ids || [],
        status: 'Approved' as const,
        created_at: bundle.claim_date || '',
        workflow_steps: workflowSteps
      })) : [
        {
          instance_id: bundle.claim_id,
          step_name: 'Approval',
          step_order: 1,
          assigned_role_name: 'Finance / Admin',
          status: 'Approved' as const,
          created_at: bundle.claim_date || ''
        }
      ];

      return {
        app: null,
        group: {
          label: `Bundle ${bundle.claim_id}`,
          type: 'Bundle' as const,
          id: bundle.claim_id,
          items: approvedItems as any,
          isApproved: true,
          isPaid: bundle.status === 'Paid',
          isCompleted: Boolean(bundle.ledger_details?.is_completed || bundle.status === 'Paid'),
          status: bundle.status,
          ledger_details: bundle.ledger_details
        }
      };
    }

    // Pending approval fallback for bundle items in Submitted / In Review
    if (bundle.status === 'Submitted' || bundle.status === 'In Review') {
      const fallbackItems = workflowSteps.length > 0 ? workflowSteps.map((s, idx) => ({
        instance_id: bundle.claim_id,
        step_id: s.step_id,
        step_name: s.step_name,
        step_order: s.step_order,
        assigned_role_name: s.assigned_role_name || 'Authorized Approver',
        assigned_users_names: s.assigned_users_names || [],
        assigned_users_ids: s.assigned_users_ids || [],
        status: idx === 0 ? ('Pending' as const) : ('Pending' as const),
        created_at: bundle.claim_date || '',
        can_action: idx === 0,
        claim: bundle.claim_id,
        claim_id: bundle.claim_id,
        workflow_steps: workflowSteps
      })) : [
        {
          instance_id: bundle.claim_id,
          step_name: 'Bundle Approval',
          step_order: 1,
          assigned_role_name: 'Authorized Approver',
          status: 'Pending' as const,
          created_at: bundle.claim_date || '',
          can_action: true,
          claim: bundle.claim_id,
          claim_id: bundle.claim_id
        }
      ];

      return {
        app: fallbackItems[0] as any,
        group: {
          label: `Bundle ${bundle.claim_id}`,
          type: 'Bundle' as const,
          id: bundle.claim_id,
          items: fallbackItems as any,
          isApproved: false,
          isPaid: false,
          isCompleted: false,
          status: bundle.status,
          ledger_details: bundle.ledger_details
        }
      };
    }

    // Fallback for Draft / Rework / Rejected
    if (workflowSteps.length > 0) {
      const draftItems = workflowSteps.map(s => ({
        instance_id: bundle.claim_id,
        step_id: s.step_id,
        step_name: s.step_name,
        step_order: s.step_order,
        assigned_role_name: s.assigned_role_name || 'Approver',
        assigned_users_names: s.assigned_users_names || [],
        assigned_users_ids: s.assigned_users_ids || [],
        status: (bundle.status === 'Rework' || bundle.status === 'Rejected') ? (bundle.status as any) : ('Pending' as const),
        created_at: bundle.claim_date || '',
        workflow_steps: workflowSteps
      }));

      return {
        app: draftItems[0] as any,
        group: {
          label: `Bundle ${bundle.claim_id}`,
          type: 'Bundle' as const,
          id: bundle.claim_id,
          items: draftItems as any,
          isApproved: false,
          isPaid: false,
          isCompleted: false,
          status: bundle.status,
          ledger_details: bundle.ledger_details
        }
      };
    }

    return null;
  };

  // Inline Bundle Approval Action (Approve / Rework)
  const handleInlineBundleAction = async (bundle: WorkerClaimItem, action: 'APPROVED' | 'REWORK') => {
    const approvalData = getBundleApprovalGroup(bundle);
    const comment = (reworkComments[bundle.claim_id] || '').trim();

    if (action === 'REWORK' && !comment) {
      setReworkErrors(prev => ({ ...prev, [bundle.claim_id]: 'Comment is required for rework.' }));
      return;
    }
    setReworkErrors(prev => ({ ...prev, [bundle.claim_id]: '' }));

    setActioningBundleId(bundle.claim_id);
    setActioningActionType(action);

    try {
      const activePendingApp = approvalData?.group?.items?.find(i => i.status === 'Pending') || approvalData?.app;

      let actionDone = false;
      if (approvalsProps?.handleActionApproval && activePendingApp && activePendingApp.instance_id && activePendingApp.instance_id !== bundle.claim_id) {
        try {
          await approvalsProps.handleActionApproval(action, comment, activePendingApp);
          actionDone = true;
        } catch (e) {
          // If handleActionApproval fails, fall through to direct endpoints
        }
      }

      if (!actionDone) {
        let res: Response | null = null;
        if (activePendingApp?.instance_id && activePendingApp.instance_id !== bundle.claim_id) {
          res = await fetch(`${API_URL}/finance/approvals/${activePendingApp.instance_id}/action/`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, comments: comment })
          });
        }
        if (!res || !res.ok) {
          res = await fetch(`${API_URL}/finance/claim/${bundle.claim_id}/action/`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, comments: comment })
          });
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to action bundle');
        }
      }

      setReworkComments(prev => ({ ...prev, [bundle.claim_id]: '' }));
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setReworkErrors(prev => ({ ...prev, [bundle.claim_id]: err.message || 'Failed to action bundle' }));
    } finally {
      setActioningBundleId(null);
      setActioningActionType(null);
    }
  };

  // Render Visual Stepper Pipeline UI (Start -> Steps -> Ledger Status -> Cash Office) matching ExpensesSubpage
  const renderApprovalStepper = (group: {
    label: string;
    type: 'Bundle' | 'Ledger' | 'Expense';
    id: number;
    items: ApprovalInstanceItem[];
    isApproved?: boolean;
    isPaid?: boolean;
    isCompleted?: boolean;
    status?: string;
    remarks?: string;
    ledger_details?: {
      ledger_id: number;
      ledger_group_id?: number;
      group_name: string;
      status: string;
      is_completed?: boolean;
      created_at?: string;
    } | null;
  }, compact = false) => {
    let steps: ApprovalStepInfo[] = [];
    for (const item of group.items) {
      if (item.workflow_steps && item.workflow_steps.length > 0) {
        steps = item.workflow_steps;
        break;
      }
    }

    if (steps.length === 0 && approvalsProps?.approvals) {
      const matchInAll = approvalsProps.approvals.find(a =>
        (a.workflow_steps && a.workflow_steps.length > 0) &&
        (a.target_summary?.type === group.type || (group.type === 'Bundle' && (a.claim || a.claim_id)))
      );
      if (matchInAll?.workflow_steps) {
        steps = matchInAll.workflow_steps;
      }
    }

    if (steps.length === 0) {
      const stepNamesSeen = new Set<string>();
      group.items.forEach(i => {
        if (!stepNamesSeen.has(i.step_name)) {
          stepNamesSeen.add(i.step_name);
          steps.push({
            step_id: steps.length + 1,
            step_order: steps.length + 1,
            step_name: i.step_name,
            assigned_role_name: i.assigned_role_name || ''
          });
        }
      });
    }

    // Is the overall pipeline completely finished/approved?
    const isGroupReworkOrRejectedOrPending = group.status === 'Rework' || group.status === 'Rejected' || group.status === 'In Review' || group.status === 'Submitted' || group.status === 'Draft';
    const isFinished = !isGroupReworkOrRejectedOrPending && (
      group.isApproved ||
      (steps.length > 0 && group.items.some(i => i.status === 'Approved' && ((i as any).is_final_step || i.step_order === steps.length))) ||
      (group.items.length > 0 && group.items.every(i => i.status === 'Approved'))
    );

    // Find the current active step index if pending
    const activePendingItem = (group.status === 'In Review' || group.status === 'Submitted')
      ? group.items.find(i => i.status === 'Pending')
      : undefined;
    const activePendingOrder: number = (activePendingItem && typeof activePendingItem.step_order === 'number') ? activePendingItem.step_order : (isFinished ? steps.length + 1 : 1);

    return (
      <div className={compact ? "p-1.5 bg-transparent overflow-x-auto" : "p-4 bg-surface-container-low border border-outline-variant/60 rounded overflow-x-auto shadow-2xs"}>
        <div className={`flex items-start justify-between px-1 py-1 ${compact ? 'min-w-[660px]' : 'min-w-[850px]'}`}>
          {/* START NODE */}
          <div className={`flex flex-col items-center shrink-0 ${compact ? 'w-12' : 'w-16'}`}>
            <div className={`${compact ? 'w-6 h-6 text-[9px]' : 'w-7 h-7 text-[10px]'} rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/40 shrink-0`}>
              Start
            </div>
            <span className="text-[9px] text-on-surface-variant mt-0.5 font-medium">Submitted</span>
          </div>

          {/* STEP NODES & CONNECTORS */}
          {steps.map((step, idx) => {
            const stepOrderNum = typeof step.step_order === 'number' ? step.step_order : (idx + 1);
            const matchingStepItems = group.items.filter(i => i.step_name === step.step_name || i.step_order === step.step_order);
            const stepInst = matchingStepItems.length > 0
              ? (matchingStepItems.find(i => i.status === 'Pending' && (group.status === 'In Review' || group.status === 'Submitted')) ||
                (group.status === 'Rework' ? [...matchingStepItems].reverse().find(i => i.status === 'Rework') : undefined) ||
                matchingStepItems[matchingStepItems.length - 1])
              : undefined;

            const isPending = !isFinished && (activePendingItem ? (stepOrderNum === activePendingOrder) : (stepInst?.status === 'Pending'));
            const isApproved = !isPending && (isFinished || (activePendingItem ? (stepOrderNum < activePendingOrder && stepInst?.status === 'Approved') : (stepInst?.status === 'Approved')));
            const isRejected = !isFinished && !activePendingItem && (stepInst?.status === 'Rejected');
            const isRework = !isFinished && !activePendingItem && (stepInst?.status === 'Rework');
            const isUpcoming = !isApproved && !isPending && !isRejected && !isRework;

            let circleClass = "bg-surface-container-high text-on-surface-variant border-outline";
            let labelBadge = step.assigned_role_name;
            if (step.assigned_users_names && step.assigned_users_names.length > 0) {
              labelBadge = `${step.assigned_role_name ? step.assigned_role_name + ': ' : ''}${step.assigned_users_names.join(', ')}`;
            }
            let iconNode: React.ReactNode = step.step_order;

            const actionUserDisplay = stepInst?.action_by_full_name || stepInst?.action_by_username || (typeof (stepInst as any)?.action_by === 'object' ? ((stepInst as any).action_by?.full_name || (stepInst as any).action_by?.username) : '') || '';

            if (isApproved) {
              circleClass = "bg-emerald-500 text-white border-emerald-600 font-bold shadow-sm";
              iconNode = <Check className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = actionUserDisplay ? `Approved by ${actionUserDisplay}` : `Approved (${labelBadge || 'Level ' + stepOrderNum})`;
            } else if (isPending) {
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-md ring-2 ring-amber-500/30";
              iconNode = step.step_order;
              labelBadge = `Pending (${labelBadge || 'Level ' + stepOrderNum})`;
            } else if (isRejected) {
              circleClass = "bg-rose-600 text-white border-rose-700 font-bold shadow-sm";
              iconNode = <X className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = `Rejected by ${actionUserDisplay || 'User'}`;
            } else if (isRework) {
              circleClass = "bg-purple-600 text-white border-purple-700 font-bold shadow-sm";
              iconNode = <RotateCcw className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = `Rework requested by ${actionUserDisplay || 'User'}`;
            } else if (isUpcoming) {
              circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
              iconNode = step.step_order;
              labelBadge = `Upcoming (${labelBadge || 'Level ' + stepOrderNum})`;
            }

            // Connector line before this step (from previous node)
            const isPrevCompleted = idx === 0 ? true : (isFinished || (stepOrderNum <= activePendingOrder));

            return (
              <React.Fragment key={step.step_id ?? `step-${idx}`}>
                {/* CONNECTOR LINE */}
                <div className={`flex-1 h-0.5 mx-1 ${compact ? 'mt-3' : 'mt-3.5'} transition-colors ${isPrevCompleted && (isApproved || isPending) ? 'bg-emerald-500' : 'bg-outline-variant'}`} />

                {/* STEP NODE */}
                <div className={`flex flex-col items-center text-center shrink-0 ${compact ? 'w-[130px]' : 'w-[170px]'}`}>
                  <div className={`${compact ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs'} rounded-full flex items-center justify-center transition-all border shrink-0 ${circleClass}`}>
                    {iconNode}
                  </div>
                  <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold text-on-surface mt-1 line-clamp-1 w-full`}>{step.step_name}</span>
                  <span className="text-[9px] text-on-surface-variant line-clamp-1 w-full">{labelBadge}</span>

                  {stepInst && stepInst.actioned_at && (
                    <span className="text-[8px] text-on-surface-variant mt-0.5">
                      {formatDateDMY(stepInst.actioned_at)}
                    </span>
                  )}

                  {(() => {
                    const stepNameNormalized = (step.step_name || '').toLowerCase().trim();
                    const collectedComments: Array<{
                      comment: string;
                      author?: string;
                      status?: string;
                      date?: string;
                    }> = [];

                    const seenComments = new Set<string>();

                    // Gather comments from all approval history instances for this step
                    group.items.forEach(i => {
                      const itemStepName = (i.step_name || '').toLowerCase().trim();
                      if (itemStepName === stepNameNormalized || i.step_order === step.step_order) {
                        if (i.comments && String(i.comments).trim()) {
                          const cleanComment = String(i.comments).trim();
                          const authorName = i.action_by_full_name || i.action_by_username || (typeof (i as any).action_by === 'object' ? ((i as any).action_by?.full_name || (i as any).action_by?.username) : (i as any).action_by) || '';
                          const key = `${cleanComment}_${authorName}`;
                          if (!seenComments.has(key)) {
                            seenComments.add(key);
                            collectedComments.push({
                              comment: cleanComment,
                              author: authorName,
                              status: i.status,
                              date: i.actioned_at ? formatDateDMY(i.actioned_at) : undefined
                            });
                          }
                        }
                      }
                    });

                    if (collectedComments.length === 0) return null;

                    return (
                      <div className="mt-1.5 p-1.5 rounded bg-surface-container border border-outline-variant text-[10px] text-on-surface w-full shadow-xs text-left font-sans space-y-1">
                        <div className="flex items-center gap-1 font-semibold text-[8px] text-primary not-italic uppercase tracking-wider">
                          <MessageSquare className="w-2.5 h-2.5 shrink-0" /> Comment{collectedComments.length > 1 ? `s (${collectedComments.length})` : ''}:
                        </div>
                        {collectedComments.map((c, cIdx) => (
                          <div key={cIdx} className={`text-[9px] ${cIdx > 0 ? 'pt-1 border-t border-outline-variant/60' : ''}`}>
                            <p className="italic text-on-surface font-normal">"{c.comment}"</p>
                            {(c.author || c.date) && (
                              <span className="text-[8px] text-on-surface-variant/80 block mt-0.5 font-medium">
                                - {c.author} {c.date ? `(${c.date})` : ''}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </React.Fragment>
            );
          })}

          {/* LEDGER STATUS NODE (BEFORE CASH OFFICE) */}
          {(() => {
            const ledgerInfo = group.ledger_details || (ledgers && ledgers.length > 0 ? (() => {
              const match = ledgers.find(l => (l.bundles || []).some((b: any) => (b.claim_id ?? b.id) === group.id));
              if (!match) return null;
              return {
                ledger_id: match.ledger_id,
                ledger_group_id: match.ledger_group,
                group_name: match.ledger_group_detail?.group_name || `Ledger #${match.ledger_id}`,
                status: match.status,
                is_completed: Boolean(match.ledger_group_detail?.is_completed)
              };
            })() : null);

            const hasLedger = Boolean(ledgerInfo);
            const ledgerStatus = (ledgerInfo?.status || '').trim();

            const isLedgerCompleted = ledgerStatus === 'Approved' || ledgerStatus === 'Paid' || Boolean(ledgerInfo?.is_completed);
            const isLedgerInReview = ledgerStatus === 'In Review' || ledgerStatus === 'Submitted';
            const isLedgerDraft = ledgerStatus === 'Draft';
            const isLedgerRework = ledgerStatus === 'Rework';
            const isLedgerRejected = ledgerStatus === 'Rejected';

            let circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
            let labelBadge = "Upcoming";
            let iconNode: React.ReactNode = <Layers className={compact ? "w-3 h-3 opacity-60" : "w-3.5 h-3.5 opacity-60"} />;

            if (isLedgerCompleted) {
              circleClass = "bg-emerald-500 text-white border-emerald-600 font-bold shadow-sm";
              iconNode = <Check className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Approved";
            } else if (isLedgerInReview) {
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-md ring-2 ring-amber-500/30";
              iconNode = <Clock className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "In Review";
            } else if (isLedgerDraft) {
              circleClass = "bg-indigo-500 text-white border-indigo-600 font-bold shadow-sm";
              iconNode = <Layers className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Draft";
            } else if (isLedgerRework) {
              circleClass = "bg-purple-600 text-white border-purple-700 font-bold shadow-sm";
              iconNode = <RotateCcw className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Rework";
            } else if (isLedgerRejected) {
              circleClass = "bg-rose-600 text-white border-rose-700 font-bold shadow-sm";
              iconNode = <X className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Rejected";
            } else if (isFinished) {
              // Bundle is approved, but not yet added to a ledger -> Active / blinking step!
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-md ring-2 ring-amber-500/30";
              iconNode = <Layers className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Pending Assembly";
            } else {
              // Bundle is still in approval stages
              circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
              iconNode = <Layers className={compact ? "w-3 h-3 opacity-60" : "w-3.5 h-3.5 opacity-60"} />;
              labelBadge = "Upcoming";
            }

            const isConnectorActive = isFinished;
            const connectorColor = isConnectorActive
              ? (isLedgerCompleted ? 'bg-emerald-500' : isLedgerInReview || !hasLedger ? 'bg-amber-500' : 'bg-indigo-500')
              : 'bg-outline-variant';

            return (
              <React.Fragment key="pipeline-ledger-status-node">
                {/* Connector from last approval step to Ledger node */}
                <div className={`flex-1 h-0.5 mx-1 ${compact ? 'mt-3' : 'mt-3.5'} transition-colors ${connectorColor}`} />

                {/* Ledger Node */}
                <div
                  className={`flex flex-col items-center text-center shrink-0 ${compact ? 'w-[110px]' : 'w-[140px]'}`}
                  title={hasLedger ? `Ledger: ${ledgerInfo?.group_name} (Status: ${isLedgerCompleted ? 'Approved' : ledgerStatus})` : isFinished ? 'Bundle approved, waiting to be assembled into a Ledger' : 'Ledger assembly'}
                >
                  <div className={`${compact ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs'} rounded-full flex items-center justify-center transition-all border shrink-0 ${circleClass}`}>
                    {iconNode}
                  </div>
                  <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold text-on-surface mt-1 line-clamp-1 w-full`}>
                    Ledger
                  </span>
                  <span className="text-[9px] text-on-surface-variant line-clamp-1 w-full font-medium" title={labelBadge}>
                    {labelBadge}
                  </span>
                  {hasLedger && ledgerInfo?.group_name && (
                    <span className="text-[8px] text-on-surface-variant/80 line-clamp-1 w-full" title={ledgerInfo.group_name}>
                      {ledgerInfo.group_name}
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })()}

          {/* FINAL CASH OFFICE NODE (VISUAL STEPPER FINAL STAGE) */}
          {(() => {
            const ledgerInfo = group.ledger_details || (ledgers && ledgers.length > 0 ? (() => {
              const match = ledgers.find(l => (l.bundles || []).some((b: any) => (b.claim_id ?? b.id) === group.id));
              if (!match) return null;
              return {
                ledger_id: match.ledger_id,
                status: match.status,
                is_completed: Boolean(match.ledger_group_detail?.is_completed)
              };
            })() : null);

            const isLedgerCompleted = ledgerInfo?.status === 'Approved' || ledgerInfo?.status === 'Paid' || Boolean(ledgerInfo?.is_completed);
            const isPaid = Boolean(group.isPaid || group.status === 'Paid' || ledgerInfo?.status === 'Paid');
            const isCashOfficeCompleted = isPaid;
            // Cash office ONLY pends when the ledger is approved/completed and not yet paid!
            const isCashOfficePending = !isPaid && isLedgerCompleted;
            const isCashOfficeUpcoming = !isPaid && !isCashOfficePending;

            let circleClass = "bg-surface-container-high text-on-surface-variant border-outline";
            let labelBadge = "Cash Office";
            let iconNode: React.ReactNode = <Banknote className={compact ? "w-3 h-3 opacity-60" : "w-3.5 h-3.5 opacity-60"} />;

            if (isCashOfficeCompleted) {
              circleClass = "bg-teal-600 text-white border-teal-700 font-bold shadow-sm";
              iconNode = <Check className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Paid / Settled";
            } else if (isCashOfficePending) {
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-md ring-2 ring-amber-500/30";
              iconNode = <Banknote className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />;
              labelBadge = "Pending Settlement";
            } else if (isCashOfficeUpcoming) {
              circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
              iconNode = <Banknote className={compact ? "w-3 h-3 opacity-60" : "w-3.5 h-3.5 opacity-60"} />;
              labelBadge = "Upcoming";
            }

            const isConnectorActive = isLedgerCompleted || isPaid;

            return (
              <React.Fragment key="final-cash-office-node">
                <div className={`flex-1 h-0.5 mx-1 ${compact ? 'mt-3' : 'mt-3.5'} transition-colors ${isConnectorActive ? (isCashOfficeCompleted ? 'bg-teal-500' : 'bg-emerald-500') : 'bg-outline-variant'}`} />
                <div className={`flex flex-col items-center text-center shrink-0 ${compact ? 'w-[110px]' : 'w-[140px]'}`}>
                  <div className={`${compact ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs'} rounded-full flex items-center justify-center transition-all border shrink-0 ${circleClass}`}>
                    {iconNode}
                  </div>
                  <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold text-on-surface mt-1 line-clamp-1 w-full`} title="Cash Office Settlement">
                    Cash Office
                  </span>
                  <span className="text-[9px] text-on-surface-variant line-clamp-1 w-full" title={labelBadge}>
                    {labelBadge}
                  </span>
                </div>
              </React.Fragment>
            );
          })()}
        </div>
      </div>
    );
  };

  const renderBundleApprovalStepper = (bundle: WorkerClaimItem, compact = false) => {
    if (bundle.status === 'Draft') return null;
    const approvalData = getBundleApprovalGroup(bundle);
    if (!approvalData?.group) return null;
    return renderApprovalStepper(approvalData.group, compact);
  };

  // Find all pending bundles that the current user can action
  const pendingActionableBundles = useMemo(() => {
    return filteredBundles.filter(b => {
      if (b.status !== 'Submitted' && b.status !== 'In Review') return false;
      const approvalData = getBundleApprovalGroup(b);
      const activePendingApp = approvalData?.group?.items?.find(i => i.status === 'Pending') || approvalData?.app;
      if (!activePendingApp) return false;
      const currentStepInfo = activePendingApp.workflow_steps?.find(
        (s: any) => s.step_id === activePendingApp.step_id || s.step_name === activePendingApp.step_name || s.step_order === activePendingApp.step_order
      );
      return checkCanUserActionStep(activePendingApp, currentStepInfo);
    });
  }, [filteredBundles, approvalsProps?.approvals, approvalsProps?.displayedApprovals, currentUser, isAdmin, currentRoleName, currentUserId, currentUsername]);

  const handleBulkApproveBundles = async () => {
    if (pendingActionableBundles.length === 0) return;

    const confirmed = await confirmPopup({
      preset: 'approve',
      title: 'Approve All Pending Bundles',
      description: `Are you sure you want to approve all ${pendingActionableBundles.length} pending claim bundle(s)? This will advance them through their current approval stage.`,
      button1: 'Cancel',
      button2: 'Approve All',
      variant: 'primary',
    });
    if (!confirmed) return;

    setBulkApproving(true);
    setBulkActionMsg(null);
    try {
      let count = 0;
      for (const b of pendingActionableBundles) {
        const bundleApp = (approvalsProps?.displayedApprovals || approvalsProps?.approvals || []).find(
          a => (a.claim === b.claim_id || a.claim_id === b.claim_id || (a.target_summary?.type === 'Bundle' && a.target_summary?.id === b.claim_id)) && a.status === 'Pending'
        );
        if (bundleApp && approvalsProps?.handleActionApproval) {
          await approvalsProps.handleActionApproval('APPROVED', 'Bulk approved', bundleApp);
          count++;
        }
      }
      if (onRefresh) {
        await onRefresh();
      }
      setBulkActionMsg({
        type: 'success',
        text: `Successfully approved ${count} pending claim bundle(s)!`
      });
      setTimeout(() => setBulkActionMsg(null), 4000);
    } catch (err: any) {
      setBulkActionMsg({
        type: 'error',
        text: err.message || 'Error occurred during bulk approval.'
      });
    } finally {
      setBulkApproving(false);
    }
  };

  const getCleanRemarks = (raw?: string) => {
    if (!raw) return '';
    const lines = raw.split('\n');
    const cleanLines = lines.filter(line => !line.trim().match(/^\[.+?\]:/));
    return cleanLines.join('\n').trim();
  };

  const isExpenseEligibleForClaim = (exp: ExpenseItem | any): boolean => {
    if (!exp) return false;
    if (exp.is_claimed || exp.claim) return false;
    if (exp.expense_type && (exp.expense_type as any).approve_required === false) return true;
    if (exp.expense_type_detail && (exp.expense_type_detail as any).approve_required === false) return true;
    if (exp.approved === true || (exp.approved as any) === 'true' || (exp.approved as any) === 1) return true;
    if (exp.status_display === 'Approved' || exp.status_display === 'APPROVED') return true;
    return false;
  };

  const isWithinDateRange = (targetDateStr?: string, fromDateStr?: string, toDateStr?: string) => {
    if (!fromDateStr && !toDateStr) return true;
    if (!targetDateStr) return false;
    const target = targetDateStr.slice(0, 10);
    if (fromDateStr && target < fromDateStr) return false;
    if (toDateStr && target > toDateStr) return false;
    return true;
  };

  const eligibleExpensesFallbackCount = useMemo(() => {
    const effectiveFrom = expenseFilterFrom || filterDateFrom;
    const effectiveTo = expenseFilterTo || filterDateTo;
    return unclaimedExpenses.filter(e =>
      !e.is_claimed &&
      !e.claim &&
      isExpenseEligibleForClaim(e) &&
      isWithinDateRange(e.expense_date, effectiveFrom, effectiveTo)
    ).length;
  }, [unclaimedExpenses, expenseFilterFrom, expenseFilterTo, filterDateFrom, filterDateTo]);

  // Create Bundle Modal Pagination State
  const [modalPage, setModalPage] = useState(1);
  const modalItemsPerPage = 50;

  // On-demand Technician & Expense Loading
  const [unclaimedWorkersList, setUnclaimedWorkersList] = useState<any[]>([]);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState<boolean>(false);
  const [workerExpenses, setWorkerExpenses] = useState<ExpenseItem[]>([]);
  const [isLoadingWorkerExpenses, setIsLoadingWorkerExpenses] = useState<boolean>(false);
  const [selectedWorkerObj, setSelectedWorkerObj] = useState<any | null>(null);
  const [showWorkerBundleBuilder, setShowWorkerBundleBuilder] = useState<boolean>(false);

  // Employee List Pagination & Filter State inside Create Bundle Modal
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [apiSearchedWorkers, setApiSearchedWorkers] = useState<any[]>([]);
  const [isSearchingWorkers, setIsSearchingWorkers] = useState<boolean>(false);
  const [previewExpense, setPreviewExpense] = useState<ExpenseItem | null>(null);
  const [ledgerBatches, setLedgerBatches] = useState<LedgerBatchItem[]>([]);
  const [selectedLedgerBatchId, setSelectedLedgerBatchId] = useState<string>('ALL');
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);
  const [userSubDeptMap, setUserSubDeptMap] = useState<Record<number, number[]>>({});
  const employeeItemsPerPage = 12;

  const getBundleUploadedReceiptUrl = (bundle: WorkerClaimItem): string | null => {
    const directUrl =
      (bundle as any)?.payment_receipt_image ||
      (bundle as any)?.receipt_image ||
      null;
    if (directUrl) return directUrl;
    const ledgerId = bundle.ledger_details?.ledger_id;
    if (bundle.status === 'Paid' && ledgerId && Array.isArray(ledgers)) {
      const parentLedger = ledgers.find((l) => l.ledger_id === ledgerId);
      if ((parentLedger as any)?.payment_receipt_image) {
        return (parentLedger as any).payment_receipt_image;
      }
    }
    return null;
  };

  const openBundleReceiptPreview = (bundle: WorkerClaimItem) => {
    const rawUrl = getBundleUploadedReceiptUrl(bundle);
    if (setShowPaymentModal) {
      setShowPaymentModal({
        ...bundle,
        payment_receipt_image: rawUrl || (bundle as any)?.payment_receipt_image || null,
      } as any);
      return;
    }
    if (!rawUrl) return;
    const resolvedUrl = getMediaUrl(rawUrl);
    const workerLabel =
      bundle.worker_detail?.full_name ||
      bundle.worker_detail?.username ||
      (bundle as any).worker_name ||
      'Worker';
    setPreviewMediaUrl({
      url: resolvedUrl,
      title: `Signed Receipt • Bundle #${bundle.claim_id} (${workerLabel})`,
    });
  };

  // Frontend-based sorting for expanded bundle expenses table
  type BundleExpSortField = 'expense_id' | 'category' | 'remarks' | 'date' | 'store' | 'ticket' | 'amount';
  const [bundleExpSort, setBundleExpSort] = useState<{
    field: BundleExpSortField;
    dir: 'asc' | 'desc';
  }>({ field: 'expense_id', dir: 'desc' });

  const handleSortBundleExpenses = (field: BundleExpSortField) => {
    setBundleExpSort(prev => {
      if (prev.field === field) {
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { field, dir: (field === 'expense_id' || field === 'amount' || field === 'date') ? 'desc' : 'asc' };
    });
  };

  const sortBundleExpensesList = (expenses: any[], field: BundleExpSortField, dir: 'asc' | 'desc') => {
    return [...expenses].sort((a: any, b: any) => {
      let comparison = 0;
      if (field === 'expense_id') {
        comparison = Number(a.expense_id || 0) - Number(b.expense_id || 0);
      } else if (field === 'amount') {
        comparison = parseFloat(a.amount || '0') - parseFloat(b.amount || '0');
      } else if (field === 'date') {
        const aDate = a.expense_date || '';
        const bDate = b.expense_date || '';
        comparison = aDate.localeCompare(bDate);
      } else if (field === 'category') {
        const aCat = (a.expense_type_detail?.expense_name || (typeof a.expense_type === 'object' && a.expense_type ? a.expense_type.expense_name : '')).toLowerCase();
        const bCat = (b.expense_type_detail?.expense_name || (typeof b.expense_type === 'object' && b.expense_type ? b.expense_type.expense_name : '')).toLowerCase();
        comparison = aCat.localeCompare(bCat);
      } else if (field === 'remarks') {
        const aRem = getCleanRemarks(a.remarks).toLowerCase();
        const bRem = getCleanRemarks(b.remarks).toLowerCase();
        comparison = aRem.localeCompare(bRem);
      } else if (field === 'store') {
        const aStore = (typeof a.responsible_store === 'object' && a.responsible_store ? a.responsible_store.store_name : (a.store_detail?.store_name || '')).toLowerCase();
        const bStore = (typeof b.responsible_store === 'object' && b.responsible_store ? b.responsible_store.store_name : (b.store_detail?.store_name || '')).toLowerCase();
        comparison = aStore.localeCompare(bStore);
      } else if (field === 'ticket') {
        const aTkt = String(a.ticket_details?.work_order_no || (typeof a.ticket === 'object' && a.ticket ? a.ticket.work_order_no : (a.ticket || ''))).toLowerCase();
        const bTkt = String(b.ticket_details?.work_order_no || (typeof b.ticket === 'object' && b.ticket ? b.ticket.work_order_no : (b.ticket || ''))).toLowerCase();
        comparison = aTkt.localeCompare(bTkt);
      }
      return dir === 'asc' ? comparison : -comparison;
    });
  };

  // Fetch Unclaimed Workers on demand when modal opens
  useEffect(() => {
    if (!showCreateBundleModal) {
      setWorkerExpenses([]);
      setSelectedWorkerObj(null);
      return;
    }

    const fetchWorkers = async () => {
      setIsLoadingWorkers(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Token ${token}`;
        const baseApi = API_URL || '';
        let url = `${baseApi}/finance/claim/unclaimed-workers/?`;
        const effectiveFrom = expenseFilterFrom || filterDateFrom;
        const effectiveTo = expenseFilterTo || filterDateTo;
        if (effectiveFrom) url += `from_date=${effectiveFrom}&`;
        if (effectiveTo) url += `to_date=${effectiveTo}&`;
        if (selectedLedgerBatchId && selectedLedgerBatchId !== 'ALL') url += `ledger_batch=${selectedLedgerBatchId}&`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          setUnclaimedWorkersList(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Error fetching unclaimed workers:', err);
      } finally {
        setIsLoadingWorkers(false);
      }
    };

    fetchWorkers();
  }, [showCreateBundleModal, token, API_URL, expenseFilterFrom, expenseFilterTo, filterDateFrom, filterDateTo, selectedLedgerBatchId]);

  const handleSelectWorker = async (emp: any) => {
    setSelectedWorkerObj(emp);
    if (setSelectedWorkerId) setSelectedWorkerId(emp.id || emp.user_id);
    setExpenseSearchWorker(emp.name);
    setSelectedExpenseIds([]);
    setIsLoadingWorkerExpenses(true);
    setModalPage(1);
    setShowWorkerBundleBuilder(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Token ${token}`;
      const baseApi = API_URL || '';
      let url = `${baseApi}/finance/expense/?is_claimed=false&worker=${emp.id || emp.user_id}&page_size=all`;
      const effectiveFrom = expenseFilterFrom || filterDateFrom;
      const effectiveTo = expenseFilterTo || filterDateTo;
      if (effectiveFrom) url += `&from_date=${effectiveFrom}`;
      if (effectiveTo) url += `&to_date=${effectiveTo}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const list: ExpenseItem[] = Array.isArray(data) ? data : (data.results || []);
        const targetWorkerId = Number(emp.id || emp.user_id);
        const filteredList = list.filter(exp => {
          const expWid = getUserId(exp.worker) ?? getUserId(exp.worker_detail);
          return expWid ? Number(expWid) === targetWorkerId : true;
        });
        setWorkerExpenses(filteredList);
        // Do not automatically add expenses; user must choose them explicitly
        setSelectedExpenseIds([]);
      }
    } catch (err) {
      console.error('Error fetching worker expenses:', err);
    } finally {
      setIsLoadingWorkerExpenses(false);
    }
  };

  const handleClearWorker = () => {
    setSelectedWorkerObj(null);
    if (setSelectedWorkerId) setSelectedWorkerId(null);
    setExpenseSearchWorker('');
    setWorkerExpenses([]);
    setSelectedExpenseIds([]);
    setShowWorkerBundleBuilder(false);
  };

  const handleCloseWorkerBundleBuilder = () => {
    setShowWorkerBundleBuilder(false);
    setSelectedWorkerObj(null);
    if (setSelectedWorkerId) setSelectedWorkerId(null);
    setExpenseSearchWorker('');
    setWorkerExpenses([]);
    setSelectedExpenseIds([]);
    setBundleRemarks('');
  };

  const displayExpenses = useMemo(() => {
    const list = selectedWorkerObj ? workerExpenses : filteredUnclaimedExpenses;
    if (!expenseSearchText.trim()) return list;
    const q = expenseSearchText.toLowerCase();
    return list.filter(exp => {
      const ticketNo = exp.ticket_details?.work_order_no?.toLowerCase() || '';
      const expIdStr = String(exp.expense_id);
      const remarksStr = (exp.remarks || '').toLowerCase();
      const expTypeStr = (exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || '').toLowerCase();
      const storeStr = (exp.responsible_store?.store_name || '').toLowerCase();
      return ticketNo.includes(q) || expIdStr.includes(q) || remarksStr.includes(q) || expTypeStr.includes(q) || storeStr.includes(q);
    });
  }, [selectedWorkerObj, workerExpenses, filteredUnclaimedExpenses, expenseSearchText]);

  const activeSelectedTotal = useMemo(() => {
    const source = selectedWorkerObj ? workerExpenses : unclaimedExpenses;
    return source
      .filter(exp => selectedExpenseIds.includes(exp.expense_id) && isExpenseEligibleForClaim(exp))
      .reduce((sum, exp) => sum + parseFloat(exp.amount || '0'), 0);
  }, [selectedWorkerObj, workerExpenses, unclaimedExpenses, selectedExpenseIds]);

  const eligibleExpenses = useMemo(() => {
    return displayExpenses.filter(e => isExpenseEligibleForClaim(e));
  }, [displayExpenses]);

  const unapprovedExpenses = useMemo(() => {
    return displayExpenses.filter(e => !isExpenseEligibleForClaim(e));
  }, [displayExpenses]);

  // Fetch Ledger Batches and User Sub-departments map when Create Bundle Modal opens
  useEffect(() => {
    if (!showCreateBundleModal) {
      setSelectedLedgerBatchId('ALL');
      return;
    }

    const fetchBatches = async () => {
      if (ledgerBatches.length === 0) setIsLoadingBatches(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Token ${token}`;
        const baseApi = API_URL || '';
        const res = await fetch(`${baseApi}/finance/ledger-batches/?page_size=200`, {
          cache: 'no-store',
          headers
        });
        if (res.ok) {
          const data = await res.json();
          const results = Array.isArray(data) ? data : (data.results || []);
          setLedgerBatches(results);
        }
      } catch (err) {
        console.error('Error fetching ledger batches:', err);
      } finally {
        setIsLoadingBatches(false);
      }
    };

    const fetchUserSubDepts = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Token ${token}`;
        const baseApi = API_URL || '';
        const res = await fetch(`${baseApi}/accounts/customuser/?page_size=200`, { headers });
        if (res.ok) {
          const data = await res.json();
          const results = Array.isArray(data) ? data : (data.results || []);
          const map: Record<number, number[]> = {};
          results.forEach((u: any) => {
            const uid = u.user_id || u.id;
            if (uid && Array.isArray(u.sub_departments)) {
              map[uid] = u.sub_departments.map((sd: any) =>
                typeof sd === 'object' ? (sd.sub_department_id || sd.id) : Number(sd)
              );
            }
          });
          setUserSubDeptMap(map);
        }
      } catch (err) {
        console.error('Error fetching users for sub departments map:', err);
      }
    };

    fetchBatches();
    fetchUserSubDepts();
  }, [showCreateBundleModal, token, API_URL]);

  // API Search for Workers / Technicians
  useEffect(() => {
    if (!showCreateBundleModal) {
      setApiSearchedWorkers([]);
      setIsSearchingWorkers(false);
      return;
    }

    const trimmed = employeeSearchQuery.trim();
    if (!trimmed) {
      setApiSearchedWorkers([]);
      setIsSearchingWorkers(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingWorkers(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Token ${token}`;
        const baseApi = API_URL || '';
        const res = await fetch(`${baseApi}/accounts/customuser/?search=${encodeURIComponent(trimmed)}&page_size=10`, { headers });
        if (res.ok) {
          const data = await res.json();
          const results = Array.isArray(data) ? data : (data.results || []);

          const mapped = results.slice(0, 10).map((u: any) => {
            const uid = u.user_id || u.id;
            const uName = u.full_name || u.username || `Worker ${uid}`;

            const existing = unclaimedWorkersList.find(w => w.id === uid || w.user_id === uid)
              || uniqueExpenseWorkers.find(w => w.id === uid || w.name.toLowerCase() === uName.toLowerCase());
            if (existing) {
              return existing;
            }

            const effectiveFrom = expenseFilterFrom || filterDateFrom;
            const effectiveTo = expenseFilterTo || filterDateTo;
            const workerExps = unclaimedExpenses.filter(exp => {
              if (exp.is_claimed || exp.claim) return false;
              if (!isWithinDateRange(exp.expense_date, effectiveFrom, effectiveTo)) return false;
              const expWid = getUserId(exp.worker) ?? getUserId(exp.worker_detail) ?? getUserId((exp as any).added_by);
              return expWid === uid || (exp.worker as any)?.username === u.username;
            });

            const eligibleWorkerExps = workerExps.filter(exp => isExpenseEligibleForClaim(exp));
            const eligibleCount = eligibleWorkerExps.length;
            const eligibleTotal = eligibleWorkerExps.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
            const totalCount = workerExps.length;
            const totalAmt = workerExps.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);

            return {
              id: uid,
              name: uName,
              username: u.username || '',
              employee_no: u.employee_no || '',
              profile_image: u.profile_image || null,
              department_name: u.sub_departments?.[0]?.sub_department_name || u.role?.role_name || '',
              sub_departments: u.sub_departments || [],
              unclaimed_count: eligibleCount,
              unclaimed_total: eligibleTotal,
              total_unclaimed_count: totalCount,
              total_unclaimed_amount: totalAmt
            };
          });

          setApiSearchedWorkers(mapped);
        }
      } catch (err) {
        console.error('Error searching workers via API:', err);
      } finally {
        setIsSearchingWorkers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [employeeSearchQuery, showCreateBundleModal, token, API_URL, uniqueExpenseWorkers, unclaimedExpenses, expenseFilterFrom, expenseFilterTo, filterDateFrom, filterDateTo]);

  const filteredEmployees = useMemo(() => {
    let list = unclaimedWorkersList.length > 0 ? unclaimedWorkersList : uniqueExpenseWorkers;
    if (employeeSearchQuery.trim()) {
      if (apiSearchedWorkers.length > 0) {
        list = apiSearchedWorkers;
      } else {
        const q = employeeSearchQuery.toLowerCase();
        list = list.filter(w => {
          const nameMatch = (w.name || '').toLowerCase().includes(q);
          const empNoMatch = (w.employee_no || '').toLowerCase().includes(q);
          const userMatch = (w.username || '').toLowerCase().includes(q);
          return nameMatch || empNoMatch || userMatch;
        });
      }
    }

    if (selectedLedgerBatchId !== 'ALL') {
      const selectedBatch = ledgerBatches.find(
        b => String(b.batch_id ?? b.id ?? b.ledger_batch_id) === selectedLedgerBatchId
      );
      if (selectedBatch) {
        const batchSubDeptIds = new Set<number>();
        if (Array.isArray(selectedBatch.sub_departments)) {
          selectedBatch.sub_departments.forEach((id: any) => {
            const num = Number(typeof id === 'object' ? (id.sub_department_id || id.id) : id);
            if (!isNaN(num)) batchSubDeptIds.add(num);
          });
        }
        if (Array.isArray(selectedBatch.sub_departments_detail)) {
          selectedBatch.sub_departments_detail.forEach((sd: any) => {
            const num = Number(sd.sub_department_id || sd.id);
            if (!isNaN(num)) batchSubDeptIds.add(num);
          });
        }

        list = list.filter(w => {
          // 1. Check worker's sub_departments array on object
          const workerSubDepts = (w as any).sub_departments;
          if (Array.isArray(workerSubDepts) && workerSubDepts.length > 0) {
            const hasMatch = workerSubDepts.some((sd: any) => {
              const sdId = Number(typeof sd === 'object' ? (sd.sub_department_id || sd.id) : sd);
              return batchSubDeptIds.has(sdId);
            });
            if (hasMatch) return true;
          }

          // 2. Fallback to userSubDeptMap by worker id
          const mappedSubDepts = userSubDeptMap[w.id];
          if (Array.isArray(mappedSubDepts) && mappedSubDepts.length > 0) {
            return mappedSubDepts.some(sdId => batchSubDeptIds.has(Number(sdId)));
          }

          return false;
        });
      }
    }

    return list;
  }, [unclaimedWorkersList, uniqueExpenseWorkers, employeeSearchQuery, apiSearchedWorkers, selectedLedgerBatchId, ledgerBatches, userSubDeptMap]);

  const paginatedEmployees = useMemo(() => {
    const start = (employeePage - 1) * employeeItemsPerPage;
    return filteredEmployees.slice(start, start + employeeItemsPerPage);
  }, [filteredEmployees, employeePage, employeeItemsPerPage]);

  const totalEmployeePages = Math.ceil(filteredEmployees.length / employeeItemsPerPage) || 1;

  useEffect(() => {
    setEmployeePage(1);
  }, [filteredEmployees.length, employeeSearchQuery, selectedLedgerBatchId]);

  // Reset page when filter length changes
  useEffect(() => {
    setLocalPage(1);
  }, [filteredBundles.length]);

  useEffect(() => {
    setModalPage(1);
  }, [displayExpenses.length, expenseSearchWorker, expenseSearchText, expenseFilterFrom, expenseFilterTo]);

  const paginatedBundles = useMemo(() => {
    if (isServerPaginated) return filteredBundles;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBundles.slice(start, start + itemsPerPage);
  }, [isServerPaginated, filteredBundles, currentPage, itemsPerPage]);

  const paginatedModalExpenses = useMemo(() => {
    const start = (modalPage - 1) * modalItemsPerPage;
    return displayExpenses.slice(start, start + modalItemsPerPage);
  }, [displayExpenses, modalPage, modalItemsPerPage]);

  const totalModalPages = Math.ceil(displayExpenses.length / modalItemsPerPage) || 1;



  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded border border-outline-variant bg-surface-container">
          <span className="text-xs font-medium text-on-surface-variant block">Total Bundles</span>
          <span className="text-2xl font-semibold text-on-surface mt-1 block">
            {serverBundleStats?.total_bundles ?? propTotalItems ?? filteredBundles.length}
          </span>
        </div>
        <div className="p-4 rounded border border-outline-variant bg-surface-container">
          <span className="text-xs font-medium text-on-surface-variant block">Pending Approval</span>
          <span className="text-2xl font-semibold text-amber-500 mt-1 block">
            {serverBundleStats?.pending_bundles ?? filteredBundles.filter(b => b.status === 'Submitted' || b.status === 'In Review').length}
          </span>
        </div>
        <div className="p-4 rounded border border-outline-variant bg-surface-container">
          <span className="text-xs font-medium text-on-surface-variant block">Approved & Ready</span>
          <span className="text-2xl font-semibold text-emerald-500 mt-1 block">
            {serverBundleStats?.approved_bundles ?? filteredBundles.filter(b => b.status === 'Approved').length}
          </span>
        </div>
        <div className="p-4 rounded border border-outline-variant bg-surface-container">
          <span className="text-xs font-medium text-on-surface-variant block">Eligible Expenses</span>
          <span className="text-2xl font-semibold text-blue-500 mt-1 block">
            {serverBundleStats?.unclaimed_expenses ?? eligibleExpensesFallbackCount}
          </span>
        </div>
      </div>

      {/* Table Container */}
      <div className="border border-outline-variant rounded overflow-hidden bg-surface-container flex flex-col">
        <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface">Worker Expense Claims & Bundles</span>
            <span className="text-xs text-on-surface-variant font-medium">Showing {filteredBundles.length} of {propTotalItems ?? bundles.length}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Multi-line Stepper View Toggle */}
            <button
              type="button"
              onClick={() => setIsMultiLineView(prev => !prev)}
              className={`px-2.5 py-1.5 rounded border text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${isMultiLineView
                ? 'bg-primary/15 border-primary text-primary dark:bg-primary/25 font-semibold shadow-2xs'
                : 'border-outline-variant text-on-surface hover:bg-surface-container'
                }`}
              title="Toggle multi-line view: shows approval steps & quick approve/rework buttons on every row"
            >
              <Rows3 className="w-3.5 h-3.5" />
              <span>{isMultiLineView ? 'Multi-line: ON' : 'Multi-line: OFF'}</span>
            </button>

            {/* Close All Button */}
            <button
              type="button"
              onClick={() => {
                setExpandedBundleIds({});
                setIsMultiLineView(false);
              }}
              className="px-2.5 py-1.5 rounded border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-container flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Collapse all opened accordions and multi-line rows (single-line view)"
            >
              <ChevronsUp className="w-3.5 h-3.5 text-on-surface-variant" />
              <span>Close All</span>
            </button>

            {pendingActionableBundles.length > 0 && (
              <button
                type="button"
                disabled={bulkApproving}
                onClick={handleBulkApproveBundles}
                className="px-3.5 py-1.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Approve pending claim bundles in one click"
              >
                {bulkApproving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve All Pending ({pendingActionableBundles.length})</span>
                  </>
                )}
              </button>
            )}

            {onRefresh && (
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isRefreshing || loading}
                className="px-2.5 py-1.5 rounded border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-container flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={isRefreshing ? "Refreshing Bundles..." : "Refresh Bundles"}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || loading ? 'animate-spin text-primary' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            )}

            <Can permission={["finance.create_bundle", "finance.create_workerclaim", "finance.add_workerclaim"] as any}>
              <button
                type="button"
                onClick={() => {
                  if (filterDateFrom && !expenseFilterFrom) setExpenseFilterFrom(filterDateFrom);
                  if (filterDateTo && !expenseFilterTo) setExpenseFilterTo(filterDateTo);
                  setShowCreateBundleModal(true);
                }}
                className="bg-primary hover:bg-primary/90 text-on-primary text-[11px] font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Bundle</span>
              </button>
            </Can>
          </div>
        </div>

        {bulkActionMsg && (
          <div className={`px-4 py-2 text-xs flex items-center justify-between border-b ${bulkActionMsg.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900'
            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900'
            }`}>
            <div className="flex items-center gap-2">
              {bulkActionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{bulkActionMsg.text}</span>
            </div>
            <button onClick={() => setBulkActionMsg(null)} className="text-on-surface-variant hover:text-on-surface cursor-pointer ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading bundles...
          </div>
        ) : filteredBundles.length === 0 && !isSyncingNewBundle ? (
          <div className="p-12 text-center text-on-surface-variant space-y-2">
            <Receipt className="w-8 h-8 mx-auto text-outline" />
            <p className="text-xs font-medium text-on-surface">No worker claims match your search/filters</p>
            <p className="text-xs">Try resetting the date range or search query, or create a new bundle.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left text-on-surface">
                <thead className="bg-surface-container-low text-on-surface-variant  text-[10px] tracking-wider border-b border-outline-variant">
                  <tr>
                    <th className="w-8 px-2 py-3"></th>
                    <th className="px-4 py-3">Bundle ID</th>
                    <th className="px-4 py-3">Worker Name</th>
                    <th className="px-4 py-3">Claim Date</th>
                    <th className="px-4 py-3">Ledger Batch</th>
                    <th className="px-4 py-3 text-right">Amount (KD)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {/* SKELETON / ROW LOADER UNTIL THE NEW BUNDLE IS VISIBLE IN UI */}
                  {isSyncingNewBundle && (
                    <React.Fragment key="syncing-bundle-skeleton">
                      <tr className="animate-pulse bg-primary/10 dark:bg-primary/20 border-l-4 border-l-primary transition-all">
                        <td className="w-8 px-2 py-3 text-center">
                          <div className="w-5 h-5 mx-auto rounded flex items-center justify-center bg-primary/20 text-primary">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-primary">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-primary">
                              {syncingBundleInfo?.claim_id ? `Bundle ${syncingBundleInfo.claim_id}` : 'New Bundle'}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/25 text-primary font-bold animate-pulse">
                              Syncing...
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </div>
                            <span className="font-medium text-on-surface">
                              {syncingBundleInfo?.worker_name || 'Technician'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">
                          <span className="text-xs font-mono">Today</span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">
                          <div className="h-4 w-24 bg-slate-300/60 dark:bg-slate-700/60 rounded animate-pulse" />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                          {syncingBundleInfo?.amount ? `KD ${syncingBundleInfo.amount.toFixed(3)}` : (
                            <div className="h-4 w-16 bg-slate-300/60 dark:bg-slate-700/60 rounded ml-auto animate-pulse" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Creating...</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-40 pointer-events-none">
                            <div className="h-6 w-14 bg-slate-300/60 dark:bg-slate-700/60 rounded" />
                          </div>
                        </td>
                      </tr>
                      {isMultiLineView && (
                        <tr className="border-b-2 border-outline-variant/80 bg-primary/5 dark:bg-primary/10">
                          <td colSpan={8} className="px-4 py-2.5">
                            <div className="flex items-center gap-2 p-2.5 rounded border border-outline-variant/60 bg-surface-container-low animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                              <span className="text-xs text-on-surface-variant font-medium">Preparing approval workflow pipeline...</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )}
                  {paginatedBundles
                    .filter(b => !isSyncingNewBundle || String(b.claim_id) !== String(syncingBundleInfo?.claim_id))
                    .map((b, idx) => {
                      const isExpanded = !!expandedBundleIds[b.claim_id];
                      const isOdd = idx % 2 === 1;
                      const bundleExpenses = Array.isArray(b.expenses) ? b.expenses : [];
                      const approvalData = getBundleApprovalGroup(b);

                      const isBundleStatusRework = (
                        b.status === 'Rework' ||
                        (b.status as string) === 'Rework Needed' ||
                        (b as any).status_display === 'Rework' ||
                        (b as any).status_display === 'Rework Needed'
                      );
                      const isBundleStatusRejected = (
                        b.status === 'Rejected' ||
                        (b as any).status_display === 'Rejected'
                      );

                      const activePendingInstance = (!isBundleStatusRework && !isBundleStatusRejected && b.status !== 'Draft')
                        ? (approvalData?.group?.items?.find(i => i.status === 'Pending') ||
                          (Array.isArray((b as any).approval_instances) && (b as any).approval_instances.find((i: any) => i.status === 'Pending')))
                        : undefined;
                      const reworkInstance = [...(approvalData?.group?.items || [])].reverse().find((i: any) => i.status === 'Rework');
                      const rejectedInstance = [...(approvalData?.group?.items || [])].reverse().find((i: any) => i.status === 'Rejected');
                      const itemsList = approvalData?.group?.items || [];
                      const latestInstance = activePendingInstance || approvalData?.app || itemsList[itemsList.length - 1];

                      const isBundleApproved = b.status === 'Approved' || b.status === 'Paid';
                      const isLedgerApproved = Boolean(
                        (b.ledger_details && (b.ledger_details.status === 'Approved' || b.ledger_details.status === 'Paid' || b.ledger_details.is_completed)) ||
                        ((b as any).ledger_status === 'Approved' || (b as any).ledger_status === 'Paid') ||
                        (Array.isArray((b as any).ledgers) && (b as any).ledgers.some((l: any) => l.status === 'Approved' || l.status === 'Paid'))
                      );

                      // A bundle is in Rework if its backend status is Rework or latest step is Rework AND it is not actively In Review / Pending
                      const isRework = !isBundleApproved && b.status !== 'In Review' && b.status !== 'Submitted' && (
                        isBundleStatusRework ||
                        (!activePendingInstance && (
                          (latestInstance?.status === 'Rework') ||
                          (approvalData?.app?.status === 'Rework')
                        ))
                      );

                      const isCurrentlyRejected = !isBundleApproved && !isRework && b.status !== 'In Review' && b.status !== 'Submitted' && (
                        isBundleStatusRejected ||
                        (!activePendingInstance && (
                          (latestInstance?.status === 'Rejected') ||
                          (approvalData?.app?.status === 'Rejected')
                        ))
                      );

                      const isRejected = isCurrentlyRejected;
                      const isRejectedOrRework = isRework || isRejected;

                      const isBundlePending = b.status !== 'Draft' && !isBundleApproved && !isRejectedOrRework && (
                        b.status === 'Submitted' || b.status === 'In Review' || !!activePendingInstance
                      );

                      const activeApp: any = isRework
                        ? (reworkInstance || approvalData?.app)
                        : (activePendingInstance || reworkInstance || rejectedInstance || approvalData?.app) || {
                          instance_id: b.claim_id,
                          step_name: 'Bundle Approval',
                          step_order: 1,
                          assigned_role_name: 'Administrator',
                          status: isRework ? ('Rework' as const) : isRejected ? ('Rejected' as const) : ('Pending' as const),
                          created_at: b.claim_date || '',
                          can_action: isAdmin,
                          claim: b.claim_id,
                          claim_id: b.claim_id
                        };

                      const currentStepInfo = activeApp?.workflow_steps?.find(
                        (s: any) => s.step_id === activeApp.step_id || s.step_name === activeApp.step_name || s.step_order === activeApp.step_order
                      );

                      const canActionBundle = b.status !== 'Draft' && !isBundleApproved && !isRejectedOrRework && checkCanUserActionStep(activeApp, currentStepInfo);

                      const bundleHistoryList = (b as any).approval_instances || (b as any).approval_history || [];
                      const hasCurrentUserApproved = !isRejectedOrRework && (b.status === 'In Review' || b.status === 'Submitted') && Boolean(
                        [...(approvalData?.group?.items || []), ...bundleHistoryList].some(
                          (inst: any) => inst.status === 'Approved' && (
                            (inst.action_by_username && currentUsername && inst.action_by_username.toLowerCase() === currentUsername.toLowerCase()) ||
                            (inst.action_by && currentUserId && (String(inst.action_by) === String(currentUserId) || String(inst.action_by?.id) === String(currentUserId)))
                          )
                        )
                      );

                      const hasPriorApprovedSteps = Boolean(
                        (approvalData?.group?.items || []).some((i: any) => i.status === 'Approved') ||
                        bundleHistoryList.some((i: any) => i.status === 'Approved')
                      );

                      const isFirstApproval = !isRejectedOrRework &&
                        (b.status === 'Submitted' || b.status === 'In Review' || isBundlePending) &&
                        !hasPriorApprovedSteps &&
                        (!activePendingInstance?.step_order || activePendingInstance.step_order === 1);

                      const isLastActive = lastActiveRowId === b.claim_id;

                      const isDeletingThisBundle = activeDeletingId === b.claim_id;

                      return (
                        <React.Fragment key={b.claim_id ?? `bundle-${idx}`}>
                          <tr
                            onClick={() => {
                              setLastActiveRowId(b.claim_id);
                              toggleExpandBundle(b.claim_id);
                            }}
                            className={`cursor-pointer transition-colors ${isDeletingThisBundle ? 'opacity-60 pointer-events-none bg-rose-500/5 select-none' : ''} ${isLastActive
                              ? 'bg-blue-100/75 dark:bg-blue-900/40 border-l-4 border-l-blue-600 dark:border-l-blue-400 ring-1 ring-inset ring-blue-500/30'
                              : isExpanded
                                ? 'bg-primary/10 dark:bg-primary/20 border-l-4 border-l-primary'
                                : isMultiLineView
                                  ? isOdd
                                    ? 'bg-slate-100/90 dark:bg-slate-800/45 hover:bg-slate-200/90 dark:hover:bg-slate-700/60'
                                    : 'bg-white dark:bg-surface-container-lowest hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                  : 'hover:bg-surface-container-high'
                              }`}
                          >
                            <td className="w-8 px-2 py-3 text-center" onClick={(e) => { e.stopPropagation(); setLastActiveRowId(b.claim_id); toggleExpandBundle(b.claim_id); }}>
                              <button
                                type="button"
                                className={`p-1 rounded transition-colors cursor-pointer ${isExpanded ? 'bg-primary text-on-primary shadow-xs' : 'hover:bg-surface-container-highest text-on-surface-variant'}`}
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 font-semibold text-primary">
                              Bundle {b.claim_id}
                              {bundleExpenses.length > 0 && (
                                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                                  {bundleExpenses.length} exp
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-2 min-w-0">
                                <AvatarCircle
                                  user={b.worker_detail}
                                  name={b.worker_detail ? (b.worker_detail.full_name || b.worker_detail.username) : `Worker ${(b.worker_detail as any)?.id || ''}`}
                                  size="xs"
                                />
                                <span className="truncate">{b.worker_detail ? `${b.worker_detail.full_name || b.worker_detail.username}` : `Worker ${(b.worker_detail as any)?.id || ''}`}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-on-surface-variant">{formatDateDMY(b.claim_date)}</td>
                            <td className="px-4 py-3 font-medium">
                              {b.ledger_details ? (
                                <span
                                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 inline-flex items-center gap-1"
                                  title={`Ledger ID ${b.ledger_details.ledger_id} (${b.ledger_details.status})`}
                                >
                                  <span>{b.ledger_details.group_name} ({b.ledger_details.status})</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-on-surface-variant/60 italic">No Ledger</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{parseFloat(b.total_claimed_amount).toFixed(3)}</td>
                            <td className="px-4 py-3">
                              {renderStatusBadge(
                                isRework ? 'Rework' : isRejected ? 'Rejected' : b.status,
                                (b.status === 'Submitted' || b.status === 'In Review') && canActionBundle,
                                (activePendingInstance || activeApp)?.step_name,
                                hasCurrentUserApproved
                              )}
                            </td>
                            <td className="px-4 py-3 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              {isRejectedOrRework ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                    <button
                                      type="button"
                                      onClick={() => openEditBundleModal(b)}
                                      disabled={updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                      className="px-2.5 py-1 rounded border border-primary/40 text-primary text-[11px] font-medium hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                      title="Edit Bundle & Modify Tied Expenses"
                                    >
                                      {updatingBundleId === b.claim_id ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          <span>Bundle Updating...</span>
                                        </>
                                      ) : (
                                        <>
                                          <PlusCircle className="w-3.5 h-3.5" />
                                          <span>Edit</span>
                                        </>
                                      )}
                                    </button>
                                  </Can>
                                  <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim", "finance.add_workerclaim"] as any}>
                                    <button
                                      type="button"
                                      onClick={() => onHandleSubmitBundle(b.claim_id)}
                                      disabled={updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                      className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-medium hover:bg-primary-container transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-xs"
                                      title="Submit / Resubmit Bundle for Approval"
                                    >
                                      {updatingBundleId === b.claim_id ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          <span>Bundle Updating...</span>
                                        </>
                                      ) : submittingBundleIds[b.claim_id] ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          <span>Submitting...</span>
                                        </>
                                      ) : (
                                        <>
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          <span>Submit</span>
                                        </>
                                      )}
                                    </button>
                                  </Can>
                                  <Can permission={isAdmin || ["finance.delete_bundle", "finance.delete_workerclaim", "finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLastActiveRowId(b.claim_id);
                                        onDeleteBundle(b.claim_id);
                                      }}
                                      disabled={isDeletingThisBundle || Boolean(activeDeletingId) || updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                      className={`p-1 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 transition-colors inline-flex items-center ${isDeletingThisBundle ? 'bg-rose-500/10 cursor-not-allowed opacity-100' : 'hover:bg-rose-500/10 cursor-pointer disabled:opacity-50'}`}
                                      title={isDeletingThisBundle ? "Deleting bundle..." : "Delete Bundle & Release Tied Expenses"}
                                    >
                                      {isDeletingThisBundle ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </Can>
                                </div>
                              ) : (b.status === 'Draft') ? (
                                <div className="inline-flex items-center gap-1.5">
                                  {!isLedgerApproved && (
                                    <Can permission={["finance.view_bundle_report", "reports.can_generate_report"] as any}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setLastActiveRowId(b.claim_id);
                                          setSelectedBundleForReport(b);
                                        }}
                                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                        title="Print bundle settlement report"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>Report</span>
                                      </button>
                                    </Can>
                                  )}
                                  <Can permission={["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                    <button
                                      onClick={() => {
                                        setLastActiveRowId(b.claim_id);
                                        openEditBundleModal(b);
                                      }}
                                      className="px-2.5 py-1 rounded border border-primary/40 text-primary text-[11px] font-medium hover:bg-primary/10 transition-colors cursor-pointer inline-flex items-center gap-1"
                                      title="Edit Bundle & Modify Tied Expenses"
                                    >
                                      <PlusCircle className="w-3.5 h-3.5" />
                                      <span>Edit</span>
                                    </button>
                                  </Can>
                                  <Can permission={["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                    <button
                                      onClick={() => {
                                        setLastActiveRowId(b.claim_id);
                                        onHandleSubmitBundle(b.claim_id);
                                      }}
                                      disabled={Boolean(submittingBundleIds[b.claim_id])}
                                      className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-medium hover:bg-primary-container transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-xs"
                                    >
                                      {submittingBundleIds[b.claim_id] ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          <span>Submitting...</span>
                                        </>
                                      ) : (
                                        <span>Submit Approval</span>
                                      )}
                                    </button>
                                  </Can>
                                  <Can permission={isAdmin || ["finance.delete_bundle", "finance.delete_workerclaim", "finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLastActiveRowId(b.claim_id);
                                        onDeleteBundle(b.claim_id);
                                      }}
                                      disabled={isDeletingThisBundle || Boolean(activeDeletingId) || submitting}
                                      className={`p-1 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 transition-colors inline-flex items-center ${isDeletingThisBundle ? 'bg-rose-500/10 cursor-not-allowed opacity-100' : 'hover:bg-rose-500/10 cursor-pointer disabled:opacity-50'}`}
                                      title={isDeletingThisBundle ? "Deleting bundle..." : "Delete Bundle & Release Tied Expenses"}
                                    >
                                      {isDeletingThisBundle ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </Can>
                                </div>
                              ) : (b.status === 'Submitted' || b.status === 'In Review') ? (
                                <div className="inline-flex items-center gap-1.5">
                                  {isFirstApproval && !isLedgerApproved && (
                                    <Can permission={["finance.view_bundle_report", "reports.can_generate_report"] as any}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setLastActiveRowId(b.claim_id);
                                          setSelectedBundleForReport(b);
                                        }}
                                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                        title="Print bundle settlement report"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>Report</span>
                                      </button>
                                    </Can>
                                  )}
                                  {canActionBundle ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLastActiveRowId(b.claim_id);
                                        toggleExpandBundle(b.claim_id);
                                      }}
                                      className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[11px] font-semibold hover:bg-amber-500/25 transition-all cursor-pointer inline-flex items-center gap-1"
                                      title="Click to expand row and action approval"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Review / Action</span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium italic">
                                      In Review
                                    </span>
                                  )}
                                </div>
                              ) : isBundleApproved ? (
                                <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                                  {/* Paid Badge if already settled, otherwise Cash Settlement button */}
                                  {b.status === 'Paid' ? (
                                    <>
                                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 inline-flex items-center gap-1 shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                        <span>Settled</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setLastActiveRowId(b.claim_id);
                                          openBundleReceiptPreview(b);
                                        }}
                                        className="px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                        title={
                                          getBundleUploadedReceiptUrl(b)
                                            ? 'Preview uploaded settlement receipt'
                                            : 'View settlement details & payment slip'
                                        }
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>Preview</span>
                                      </button>
                                    </>
                                  ) : (
                                    setShowPaymentModal && (
                                      <Can permission="finance.single_payment_process">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setLastActiveRowId(b.claim_id);
                                            setShowPaymentModal(b);
                                          }}
                                          className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-all shadow-xs hover:shadow cursor-pointer shrink-0"
                                          title={`Perform Cash Settlement for Bundle #${b.claim_id}`}
                                        >
                                          <Banknote className="w-3.5 h-3.5" />
                                          <span>Cash Settlement</span>
                                        </button>
                                      </Can>
                                    )
                                  )}
                                </div>
                              ) : null}

                            </td>
                          </tr>

                          {/* MULTI-LINE VIEW SECOND ROW (Pipeline 1-----2-----3-----4 + Quick Approve/Rework) */}
                          {isMultiLineView && !isExpanded && (
                            <tr
                              onClick={() => setLastActiveRowId(b.claim_id)}
                              className={`border-b-2 border-outline-variant/80 transition-colors ${isLastActive
                                ? 'bg-blue-50/70 dark:bg-blue-950/30 border-l-4 border-l-blue-600 dark:border-l-blue-400'
                                : isOdd
                                  ? 'bg-slate-100/90 dark:bg-slate-800/45'
                                  : 'bg-white dark:bg-surface-container-lowest'
                                }`}
                            >
                              <td colSpan={8} className="px-4 py-2.5">
                                <div className={`flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 p-2.5 rounded border ${isOdd
                                  ? 'bg-white dark:bg-surface-container/70 border-outline-variant/80 shadow-xs'
                                  : 'bg-surface-container-low dark:bg-surface-container-low/70 border-outline-variant/60 shadow-2xs'
                                  }`}>
                                  {/* Left/Main: Compact Horizontal Stepper Pipeline */}
                                  <div className="flex-1 overflow-x-auto min-w-0">
                                    {b.status !== 'Draft' && (approvalData?.group ? (
                                      renderApprovalStepper(approvalData.group, true)
                                    ) : (
                                      <div className="text-xs text-on-surface-variant/70 italic px-2 py-1">
                                        No approval workflow required for this bundle.
                                      </div>
                                    ))}
                                    {b.status === 'Draft' && (
                                      <div className="text-xs text-on-surface-variant/70 italic px-2 py-1">
                                        Draft Bundle — Submit approval when ready to initiate workflow.
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: Quick Action Controls (Comment Box + Approve + Rework) */}
                                  <div className="shrink-0 flex flex-col items-end gap-1.5 pt-2 xl:pt-0 border-t xl:border-t-0 border-outline-variant/40">
                                    {isBundlePending && !isRejectedOrRework && canActionBundle ? (
                                      <>
                                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full xl:w-auto">
                                          <input
                                            type="text"
                                            value={reworkComments[b.claim_id] || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setReworkComments(prev => ({ ...prev, [b.claim_id]: val }));
                                              if (val.trim() && reworkErrors[b.claim_id]) {
                                                setReworkErrors(prev => {
                                                  const next = { ...prev };
                                                  delete next[b.claim_id];
                                                  return next;
                                                });
                                              }
                                            }}
                                            placeholder="Comment (Required for Rework)..."
                                            className={`px-2.5 py-1.5 rounded border text-xs text-on-surface focus:outline-none placeholder:text-on-surface-variant/60 w-full sm:w-48 xl:w-56 transition-all ${reworkErrors[b.claim_id]
                                              ? 'border-rose-500 bg-rose-500/10 focus:border-rose-600 focus:ring-1 focus:ring-rose-500'
                                              : 'border-outline bg-surface-container-low focus:border-primary'
                                              }`}
                                          />
                                          <button
                                            type="button"
                                            disabled={actioningBundleId === b.claim_id}
                                            onClick={() => handleInlineBundleAction(b, 'APPROVED')}
                                            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                                            title="Approve this claim bundle step"
                                          >
                                            {actioningBundleId === b.claim_id && actioningActionType === 'APPROVED' ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Approving...</span>
                                              </>
                                            ) : (
                                              <>
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Approve</span>
                                              </>
                                            )}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={actioningBundleId === b.claim_id}
                                            onClick={() => handleInlineBundleAction(b, 'REWORK')}
                                            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                                            title="Request rework for this claim bundle"
                                          >
                                            {actioningBundleId === b.claim_id && actioningActionType === 'REWORK' ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Reworking...</span>
                                              </>
                                            ) : (
                                              <>
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Rework</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                        {reworkErrors[b.claim_id] && (
                                          <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 animate-pulse self-start sm:self-auto">
                                            <span>{reworkErrors[b.claim_id]}</span>
                                          </div>
                                        )}
                                      </>
                                    ) : (isRejectedOrRework || b.status === 'Draft') ? (
                                      <div className="flex items-center gap-1.5">
                                        <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                          <button
                                            type="button"
                                            onClick={() => openEditBundleModal(b)}
                                            disabled={updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                            className="px-2.5 py-1.5 rounded border border-primary/40 text-primary text-xs font-medium hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                            title="Edit Bundle & Modify Tied Expenses"
                                          >
                                            {updatingBundleId === b.claim_id ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Updating...</span>
                                              </>
                                            ) : (
                                              <>
                                                <PlusCircle className="w-3.5 h-3.5" />
                                                <span>Edit</span>
                                              </>
                                            )}
                                          </button>
                                        </Can>
                                        <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim", "finance.add_workerclaim", "finance.submit_bundle", "finance.submit_workerclaim"] as any}>
                                          <button
                                            type="button"
                                            onClick={() => onHandleSubmitBundle(b.claim_id)}
                                            disabled={updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-medium hover:bg-primary-container transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-xs"
                                          >
                                            {updatingBundleId === b.claim_id ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Bundle Updating...</span>
                                              </>
                                            ) : submittingBundleIds[b.claim_id] ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Submitting...</span>
                                              </>
                                            ) : (
                                              <span>{b.status === 'Rework' || b.status === 'Rejected' ? 'Resubmit' : 'Submit'}</span>
                                            )}
                                          </button>
                                        </Can>
                                        <Can permission={isAdmin || ["finance.delete_bundle", "finance.delete_workerclaim", "finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setLastActiveRowId(b.claim_id);
                                              onDeleteBundle(b.claim_id);
                                            }}
                                            disabled={isDeletingThisBundle || Boolean(activeDeletingId) || updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                            className={`px-2.5 py-1.5 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 transition-colors inline-flex items-center gap-1 text-xs font-medium ${isDeletingThisBundle ? 'bg-rose-500/10 cursor-not-allowed opacity-100' : 'hover:bg-rose-500/10 cursor-pointer disabled:opacity-50'}`}
                                            title={isDeletingThisBundle ? "Deleting bundle..." : "Delete Bundle & Release Tied Expenses"}
                                          >
                                            {isDeletingThisBundle ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Deleting...</span>
                                              </>
                                            ) : (
                                              <>
                                                <Trash2 className="w-3.5 h-3.5" />
                                                <span>Delete</span>
                                              </>
                                            )}
                                          </button>
                                        </Can>
                                      </div>
                                    ) : b.status === 'Approved' ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                          <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                                        </span>
                                      </div>
                                    ) : b.status === 'Paid' ? (
                                      <span className="px-2.5 py-1 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> Settled
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* EXPANDED ACCORDION VIEW: VISUAL APPROVAL STEPPER PIPELINE & TIED EXPENSES */}
                          {isExpanded && (
                            <tr
                              onClick={() => setLastActiveRowId(b.claim_id)}
                              className={`transition-colors ${isLastActive
                                ? 'bg-blue-50/40 dark:bg-blue-950/20 border-l-4 border-l-blue-600 dark:border-l-blue-400'
                                : 'bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary'
                                }`}
                            >
                              <td colSpan={8} className="px-6 py-4 border-b border-outline-variant space-y-4">
                                {/* Visual Stepper Pipeline with "Approval Progress Steps" header */}
                                {b.status !== 'Draft' && (approvalData?.group ? (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                                        Approval Progress Steps
                                      </span>
                                      {approvalData.app && (
                                        <span className="text-[11px] text-on-surface-variant font-medium">
                                          Current Step: <strong className="text-primary">{approvalData.app.step_name}</strong>
                                        </span>
                                      )}
                                    </div>
                                    {renderApprovalStepper(approvalData.group)}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-surface-container-low rounded border border-outline-variant text-xs text-on-surface-variant italic">
                                    No approval workflow required or assigned for this claim bundle.
                                  </div>
                                ))}

                                {/* Rejected or Rework Banner & Edit Button */}
                                {isRejectedOrRework && (
                                  <div className={`p-3.5 rounded border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs ${isRejected ? 'border-rose-500/30 bg-rose-500/10' : 'border-purple-500/30 bg-purple-500/10'
                                    }`}>
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold text-white shadow-xs ${isRejected ? 'bg-rose-600' : 'bg-purple-600'}`}>
                                          {isRejected ? 'Rejected' : 'Rework'}
                                        </span>
                                        <span className="text-xs font-semibold text-on-surface">
                                          {(reworkInstance?.step_name || rejectedInstance?.step_name || activeApp.step_name) || 'Approval'}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-on-surface-variant">
                                        {(reworkInstance?.comments || rejectedInstance?.comments || activeApp.comments)
                                          ? `Reason: ${reworkInstance?.comments || rejectedInstance?.comments || activeApp.comments}`
                                          : isRejected
                                            ? 'Rejected. Please edit bundle and resubmit.'
                                            : 'Rework needed. Please edit bundle and resubmit.'}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                        <button
                                          type="button"
                                          disabled={updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                          onClick={() => openEditBundleModal(b)}
                                          className="px-3.5 py-1.5 rounded border border-outline hover:border-primary text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                                          title="Edit Bundle & Modify Tied Expenses"
                                        >
                                          {updatingBundleId === b.claim_id ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                              <span>Bundle Updating...</span>
                                            </>
                                          ) : (
                                            <>
                                              <PlusCircle className="w-3.5 h-3.5 text-primary" />
                                              <span>Edit Bundle</span>
                                            </>
                                          )}
                                        </button>
                                      </Can>
                                      <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim", "finance.add_workerclaim"] as any}>
                                        <button
                                          type="button"
                                          disabled={updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                          onClick={() => onHandleSubmitBundle(b.claim_id)}
                                          className={`px-3.5 py-1.5 rounded text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 disabled:opacity-50 ${isRejected ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'
                                            }`}
                                          title="Submit / Resubmit Bundle for Approval"
                                        >
                                          {updatingBundleId === b.claim_id ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              <span>Bundle Updating...</span>
                                            </>
                                          ) : submittingBundleIds[b.claim_id] ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              <span>Submitting...</span>
                                            </>
                                          ) : (
                                            <>
                                              <RotateCcw className="w-3.5 h-3.5" />
                                              <span>Submit Bundle</span>
                                            </>
                                          )}
                                        </button>
                                      </Can>
                                      <Can permission={isAdmin || ["finance.delete_bundle", "finance.delete_workerclaim", "finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                        <button
                                          type="button"
                                          disabled={isDeletingThisBundle || Boolean(activeDeletingId) || updatingBundleId === b.claim_id || Boolean(submittingBundleIds[b.claim_id]) || submitting}
                                          onClick={() => {
                                            setLastActiveRowId(b.claim_id);
                                            onDeleteBundle(b.claim_id);
                                          }}
                                          className={`px-3.5 py-1.5 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs ${isDeletingThisBundle ? 'bg-rose-500/10 cursor-not-allowed opacity-100' : 'hover:bg-rose-500/10 cursor-pointer disabled:opacity-50'}`}
                                          title={isDeletingThisBundle ? "Deleting Bundle..." : "Delete Bundle & Release Tied Expenses"}
                                        >
                                          {isDeletingThisBundle ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              <span>Deleting Bundle...</span>
                                            </>
                                          ) : (
                                            <>
                                              <Trash2 className="w-3.5 h-3.5" />
                                              <span>Delete Bundle</span>
                                            </>
                                          )}
                                        </button>
                                      </Can>
                                    </div>
                                  </div>
                                )}

                                {/* Action / Review Card if pending, not rework/rejected, and user can action or is administrator */}
                                {isBundlePending && !isRejectedOrRework && canActionBundle && (
                                  <div className="p-3.5 rounded border border-outline-variant bg-surface-container flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                          Pending Action
                                        </span>
                                        <span className="text-xs font-semibold text-on-surface">
                                          {activeApp.step_name || 'Bundle Approval'} ({activeApp.assigned_role_name || (currentStepInfo?.assigned_users_names?.length ? currentStepInfo.assigned_users_names.join(', ') : 'Administrator')})
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 w-full md:w-auto">
                                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full md:w-auto">
                                        <input
                                          type="text"
                                          value={reworkComments[b.claim_id] || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setReworkComments(prev => ({ ...prev, [b.claim_id]: val }));
                                            if (val.trim()) setReworkErrors(prev => ({ ...prev, [b.claim_id]: '' }));
                                          }}
                                          placeholder="Review comments (required for rework)..."
                                          className={`px-3 py-1.5 rounded border text-xs text-on-surface focus:outline-none placeholder:text-on-surface-variant/60 w-full sm:w-64 transition-all ${reworkErrors[b.claim_id]
                                            ? 'border-rose-500 bg-rose-500/10 focus:border-rose-600 focus:ring-1 focus:ring-rose-500'
                                            : 'border-outline-variant bg-surface-container-low focus:border-primary'
                                            }`}
                                        />
                                        <button
                                          type="button"
                                          disabled={actioningBundleId === b.claim_id}
                                          onClick={() => handleInlineBundleAction(b, 'APPROVED')}
                                          className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                                          title="Approve this bundle step"
                                        >
                                          {actioningBundleId === b.claim_id && actioningActionType === 'APPROVED' ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              <span>Approving...</span>
                                            </>
                                          ) : (
                                            <>
                                              <Check className="w-3.5 h-3.5" />
                                              <span>Approve</span>
                                            </>
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actioningBundleId === b.claim_id}
                                          onClick={() => handleInlineBundleAction(b, 'REWORK')}
                                          className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                                          title="Request rework for this bundle"
                                        >
                                          {actioningBundleId === b.claim_id && actioningActionType === 'REWORK' ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              <span>Reworking...</span>
                                            </>
                                          ) : (
                                            <>
                                              <RotateCcw className="w-3.5 h-3.5" />
                                              <span>Rework</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                      {reworkErrors[b.claim_id] && (
                                        <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 animate-pulse self-start sm:self-auto">
                                          <span>{reworkErrors[b.claim_id]}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold  tracking-wider text-on-surface">
                                    Expenses in Bundle {b.claim_id} ({bundleExpenses.length})
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {b.status === 'Paid' && (
                                      <>
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center gap-1 shrink-0">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> Settled
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openBundleReceiptPreview(b);
                                          }}
                                          className="px-2 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                          title={
                                            getBundleUploadedReceiptUrl(b)
                                              ? 'Preview uploaded settlement receipt'
                                              : 'View settlement details & payment slip'
                                          }
                                        >
                                          <Eye className="w-3 h-3" />
                                          <span>Preview</span>
                                        </button>
                                      </>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedBundleForView(b);
                                      }}
                                      className="text-xs text-primary hover:underline font-medium cursor-pointer flex items-center gap-1"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>View Full</span>
                                    </button>
                                  </div>
                                </div>

                                {bundleExpenses.length === 0 ? (
                                  <p className="text-xs text-on-surface-variant italic">No expenses recorded in this bundle.</p>
                                ) : (
                                  <div className="border border-outline-variant rounded overflow-hidden bg-surface-container shadow-sm">
                                    <table className="w-full text-xs text-left text-on-surface">
                                      <thead className="bg-surface-container-low text-on-surface-variant text-[9px] tracking-wider border-b border-outline-variant select-none">
                                        <tr>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('expense_id');
                                            }}
                                            className="px-3 py-2 cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Exp"
                                          >
                                            <div className="inline-flex items-center gap-1 font-bold">
                                              <span>Exp</span>
                                              {bundleExpSort.field === 'expense_id' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('category');
                                            }}
                                            className="px-3 py-2 cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Category"
                                          >
                                            <div className="inline-flex items-center gap-1 font-bold">
                                              <span>Category</span>
                                              {bundleExpSort.field === 'category' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('remarks');
                                            }}
                                            className="px-3 py-2 min-w-[130px] cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Remarks"
                                          >
                                            <div className="inline-flex items-center gap-1 font-bold">
                                              <span>Remarks</span>
                                              {bundleExpSort.field === 'remarks' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('date');
                                            }}
                                            className="px-3 py-2 cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Date"
                                          >
                                            <div className="inline-flex items-center gap-1 font-bold">
                                              <span>Date</span>
                                              {bundleExpSort.field === 'date' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('store');
                                            }}
                                            className="px-3 py-2 cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Responsible Store"
                                          >
                                            <div className="inline-flex items-center gap-1 font-bold">
                                              <span>Responsible Store</span>
                                              {bundleExpSort.field === 'store' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('ticket');
                                            }}
                                            className="px-3 py-2 cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Ticket / Work Order"
                                          >
                                            <div className="inline-flex items-center gap-1 font-bold">
                                              <span>Ticket / Work Order</span>
                                              {bundleExpSort.field === 'ticket' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSortBundleExpenses('amount');
                                            }}
                                            className="px-3 py-2 text-right cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                                            title="Click to sort by Amount (KD)"
                                          >
                                            <div className="inline-flex items-center justify-end w-full gap-1 font-bold">
                                              <span>Amount (KD)</span>
                                              {bundleExpSort.field === 'amount' ? (
                                                bundleExpSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                                              ) : (
                                                <ArrowUpDown className="w-2.5 h-2.5 opacity-30 hover:opacity-80" />
                                              )}
                                            </div>
                                          </th>
                                          <th className="px-3 py-2 text-right font-bold">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-outline-variant">
                                        {sortBundleExpensesList(bundleExpenses, bundleExpSort.field, bundleExpSort.dir).map((exp: any, expIdx: number) => {
                                          const storeName = typeof exp.responsible_store === 'object' && exp.responsible_store ? exp.responsible_store.store_name : (exp.store_detail?.store_name || 'N/A');
                                          const ticketNo = exp.ticket_details?.work_order_no || (typeof exp.ticket === 'object' && exp.ticket ? exp.ticket.work_order_no : (exp.ticket ? `${exp.ticket}` : 'N/A'));
                                          const catName = exp.expense_type_detail?.expense_name || (typeof exp.expense_type === 'object' && exp.expense_type ? exp.expense_type.expense_name : 'General');
                                          const cleanRemarks = getCleanRemarks(exp.remarks);
                                          return (
                                            <tr
                                              key={exp.expense_id ?? `exp-${expIdx}`}
                                              onClick={() => setPreviewExpense(exp)}
                                              className="hover:bg-surface-container-high transition-colors cursor-pointer"
                                            >
                                              <td className="px-3 py-2 font-semibold text-primary">{exp.expense_id}</td>
                                              <td className="px-3 py-2 text-on-surface font-medium">{catName}</td>
                                              <td className="px-3 py-2 text-on-surface-variant max-w-[200px]" title={cleanRemarks || undefined}>
                                                {cleanRemarks ? (
                                                  <div className="text-[11px] text-on-surface leading-tight line-clamp-2">
                                                    {cleanRemarks}
                                                  </div>
                                                ) : (
                                                  <span className="text-on-surface-variant/40 italic text-[11px]">-</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2 text-on-surface-variant">{formatDateDMY(exp.expense_date) || 'N/A'}</td>
                                              <td className="px-3 py-2 text-on-surface-variant">{storeName}</td>
                                              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                {((exp.ticket_details || exp.ticket) && setSelectedTicketForModal) ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setSelectedTicketForModal(typeof (exp.ticket_details || exp.ticket) === 'object' ? (exp.ticket_details || exp.ticket) : { ticket_id: (exp.ticket_details || exp.ticket) })}
                                                    className="font-mono font-medium text-primary hover:underline text-[11px] cursor-pointer"
                                                  >
                                                    {ticketNo}
                                                  </button>
                                                ) : (
                                                  <span className="text-on-surface-variant/60 font-mono text-[11px]">{ticketNo}</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                {parseFloat(exp.amount || '0').toFixed(3)}
                                              </td>
                                              <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="inline-flex items-center justify-end gap-1.5">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setPreviewExpense(exp);
                                                    }}
                                                    className="px-2 py-0.5 rounded border border-outline text-[11px] text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                                    title="Preview Expense Receipt & Details"
                                                  >
                                                    {/* <Eye className="w-3 h-3" /> */}
                                                    <span>Receipt</span>
                                                  </button>
                                                  {b.status !== 'Paid' && !isLedgerApproved && (!b.ledger_details || isRejectedOrRework || b.status === 'Draft' || b.ledger_details.status === 'Rework' || b.ledger_details.status === 'Draft' || b.ledger_details.status === 'Rejected') && handleRemoveExpenseFromBundle && (
                                                    <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                                                      <button
                                                        type="button"
                                                        onClick={async (e) => {
                                                          e.stopPropagation();
                                                          if ((b.expenses?.length || 0) <= 1) {
                                                            const confirmed = await confirmPopup({
                                                              preset: "remove",
                                                              button2: "Close",
                                                              title: "Cannot remove",
                                                              description: "Cannot remove the only expense. Please delete the Bundle instead.",
                                                              showButton1: false,
                                                            });

                                                            if (confirmed) return;
                                                          }
                                                          handleRemoveExpenseFromBundle(b.claim_id, exp.expense_id);
                                                        }}
                                                        className="px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                                        title="Remove Expense from Bundle"
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                        <span>Remove</span>
                                                      </button>
                                                    </Can>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination Component */}
            <Pagination
              currentPage={currentPage}
              totalItems={totalItemsCount}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </>
        )}
      </div>

      {/* MODAL: CREATE BUNDLE DIRECT MODAL */}
      {showCreateBundleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-surface-container rounded border border-outline-variant/80 max-w-5xl w-full h-[88vh] max-h-[860px] min-h-[640px] flex flex-col p-4 sm:p-4 shadow-2xl overflow-hidden transition-all">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/80 pb-3.5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface tracking-tight">Create Worker Claim Bundle</h3>

                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateBundleModal(false)}
                className="p-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DIRECT MODAL BODY */}
            <div className="flex-1 min-h-0 flex flex-col justify-between space-y-3 pt-3 overflow-hidden">
              {/* Modal-level Error Banner */}
              {errorMessage && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between shadow-2xs shrink-0 animate-in fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-semibold">{errorMessage}</span>
                  </div>
                  {setErrorMessage && (
                    <button
                      type="button"
                      onClick={() => setErrorMessage(null)}
                      className="p-1 hover:bg-red-500/10 rounded transition-colors text-red-500 shrink-0 cursor-pointer"
                      title="Dismiss error"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Previous bundle finalizing alert */}
              {isSyncingNewBundle && (
                <div className="p-2.5 px-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between shadow-2xs shrink-0 animate-in fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-4 h-4 shrink-0 text-amber-500 animate-spin" />
                    <span className="font-semibold truncate">
                      {syncingBundleInfo?.claim_id
                        ? `Previous bundle ${syncingBundleInfo.claim_id} (${syncingBundleInfo.worker_name || 'Technician'}) is currently being finalized...`
                        : 'Previous bundle is currently being created...'}
                    </span>
                  </div>

                </div>
              )}

              {/* 1. SELECT EMPLOYEE / TECHNICIAN GRID */}
              <div className="flex-1 min-h-0 flex flex-col p-3.5 bg-surface-container-low border border-outline-variant/80 rounded space-y-3 overflow-hidden shadow-2xs">
                <div className="flex items-center justify-between shrink-0">
                  <span className="font-bold text-on-surface text-xs block tracking-wider text-primary">
                    Select Technician
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {filteredEmployees.length} Technicians
                  </span>
                </div>

                {/* Search & Date Filter Header */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
                  {/* Search Employee Name */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-on-surface-variant" />
                    <input
                      type="text"
                      placeholder="Search technician by name, username, employee ID... (API Search)"
                      value={employeeSearchQuery}
                      onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                      className="w-full bg-surface-container border border-outline-variant text-on-surface text-xs rounded pl-9 pr-8 py-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs hover:border-outline"
                    />
                    {isSearchingWorkers ? (
                      <Loader2 className="w-4 h-4 absolute right-2.5 top-2.5 text-primary animate-spin" />
                    ) : employeeSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setEmployeeSearchQuery('')}
                        className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface p-0.5 rounded cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>

                  {/* Date Filter */}
                  <div className="shrink-0 flex justify-end">
                    <DateRangePickerCard
                      fromDate={expenseFilterFrom || filterDateFrom || ''}
                      toDate={expenseFilterTo || filterDateTo || ''}
                      hideDateType={true}
                      allowEmptyDateType={true}
                      onDateRangeChange={(from, to) => {
                        setExpenseFilterFrom(from);
                        setExpenseFilterTo(to);
                      }}
                      onReset={() => {
                        setExpenseFilterFrom('');
                        setExpenseFilterTo('');
                      }}
                    />
                  </div>
                </div>

                {/* Ledger Batch Filtration Bar */}
                <div className="p-2.5 bg-surface-container rounded border border-outline-variant/60 shadow-2xs space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      <span>Filter by Ledger Batch:</span>
                    </div>
                    {selectedLedgerBatchId !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLedgerBatchId('ALL');
                          setEmployeePage(1);
                        }}
                        className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                      >
                        Reset to All Batches
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLedgerBatchId('ALL');
                        setEmployeePage(1);
                      }}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${selectedLedgerBatchId === 'ALL'
                        ? 'bg-primary text-on-primary shadow-xs ring-1 ring-primary/30'
                        : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/70'
                        }`}
                    >
                      All Batches
                    </button>

                    {isLoadingBatches && ledgerBatches.length === 0 ? (
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant py-1 px-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        <span>Loading batches...</span>
                      </div>
                    ) : (
                      ledgerBatches.map((b, bIdx) => {
                        const bId = String(b.batch_id ?? b.id ?? b.ledger_batch_id ?? `batch-${bIdx}`);
                        const isSelected = selectedLedgerBatchId === bId;
                        const subDeptCount = b.sub_departments?.length ?? b.sub_departments_detail?.length ?? 0;
                        return (
                          <button
                            key={bId}
                            type="button"
                            onClick={() => {
                              setSelectedLedgerBatchId(isSelected ? 'ALL' : bId);
                              setEmployeePage(1);
                            }}
                            title={b.description || b.batch_name}
                            className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1.5 ${isSelected
                              ? 'bg-primary text-on-primary font-bold shadow-xs ring-1 ring-primary/40'
                              : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/70 font-medium'
                              }`}
                          >
                            <span className="truncate max-w-[220px]">{b.batch_name}</span>
                            {subDeptCount > 0 && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isSelected
                                  ? 'bg-on-primary/20 text-on-primary'
                                  : 'bg-surface-container-highest text-on-surface-variant'
                                  }`}
                              >
                                {subDeptCount}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Paginated Employee Cards Grid */}
                {isLoadingWorkers ? (
                  <div className="flex-1 p-8 text-center text-xs text-on-surface-variant flex flex-col items-center justify-center gap-2 border border-outline-variant/80 rounded bg-surface-container">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span>Loading technicians...</span>
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="flex-1 p-6 text-center text-xs text-on-surface-variant italic border border-outline-variant/80 rounded bg-surface-container flex items-center justify-center">
                    No technicians match the search/date criteria.
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {filteredEmployees.map((emp, empIdx) => {
                          const isSelected = (selectedWorkerObj?.id || selectedWorkerObj?.user_id) === (emp.id || emp.user_id);
                          const eligibleCount = emp.unclaimed_count ?? 0;
                          const totalCount = emp.total_unclaimed_count ?? 0;
                          const eligibleTotal = emp.unclaimed_total ?? 0;
                          const totalAmt = emp.total_unclaimed_amount ?? 0;

                          return (
                            <div
                              key={emp.id ?? emp.user_id ?? `emp-${empIdx}`}
                              onClick={() => handleSelectWorker(emp)}
                              className={`p-2.5 rounded border cursor-pointer transition-all flex items-center justify-between gap-2.5 ${isSelected
                                ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/30'
                                : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/80 shadow-2xs hover:border-primary/50'
                                }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <AvatarCircle
                                  user={emp}
                                  name={emp.name}
                                  image={emp.profile_image}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-on-surface truncate flex items-center gap-1">
                                    <span>{emp.name}</span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                  </h4>

                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[10px] text-primary font-bold block">
                                  {eligibleCount > 0
                                    ? `${eligibleCount} Eligible`
                                    : totalCount > 0
                                      ? `${totalCount} Unapproved`
                                      : '0 Expenses'}
                                </span>
                                <span className={`text-[11px] font-bold ${eligibleTotal > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-on-surface-variant/70'
                                  }`}>
                                  {eligibleTotal.toFixed(3)} KD
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION FOOTER */}
              <div className="shrink-0 pt-2 border-t border-outline-variant/80 flex items-center justify-between gap-3">
                <span className="text-xs text-on-surface-variant">
                  Click any technician card above to build their expense claim bundle.
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreateBundleModal(false)}
                  className="px-4 py-2 rounded border border-outline-variant text-xs text-on-surface hover:bg-surface-container-high transition-colors font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL ON TOP OF CREATE BUNDLE: EDIT BUNDLE STYLE BUILDER */}
      <CreateWorkerBundleModal
        isOpen={showWorkerBundleBuilder && !!selectedWorkerObj}
        onClose={handleCloseWorkerBundleBuilder}
        worker={selectedWorkerObj}
        workerExpenses={workerExpenses}
        isLoadingExpenses={isLoadingWorkerExpenses}
        selectedExpenseIds={selectedExpenseIds}
        setSelectedExpenseIds={setSelectedExpenseIds}
        bundleRemarks={bundleRemarks}
        setBundleRemarks={setBundleRemarks}
        handleCreateBundle={() => {
          handleCreateBundle();
          setShowWorkerBundleBuilder(false);
        }}
        submitting={submitting}
        isSyncingNewBundle={isSyncingNewBundle}
        errorMessage={errorMessage}
        setErrorMessage={setErrorMessage}
        fromDate={expenseFilterFrom || filterDateFrom}
        toDate={expenseFilterTo || filterDateTo}
        token={token}
        currentUser={currentUser}
        API_URL={API_URL}
        setWorkerExpenses={setWorkerExpenses}
        setPreviewMediaUrl={setPreviewMediaUrl}
        setSelectedTicketForModal={setSelectedTicketForModal}
        onRefreshParent={onRefresh}
      />

      {/* POPUP MODAL 1: VIEW BUNDLE BILLS & MEDIA */}
      {selectedBundleForView && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-surface-container rounded border border-outline-variant/80 max-w-3xl w-full p-6 sm:p-7 space-y-5 shadow-2xl my-8 text-on-surface">
            <div className="flex items-center justify-between border-b border-outline-variant/80 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-2 tracking-tight">
                    Bundle {selectedBundleForView.claim_id} Details
                    {(() => {
                      const currentUserId = currentUser?.id ?? currentUser?.user_id;
                      const currentUsername = currentUser?.username;
                      const hasModalUserApproved = (selectedBundleForView.status === 'In Review' || selectedBundleForView.status === 'Submitted') && Boolean(
                        selectedBundleForView.approval_history?.some(
                          (inst: any) => inst.status === 'Approved' && (
                            (inst.action_by_username && currentUsername && inst.action_by_username.toLowerCase() === currentUsername.toLowerCase()) ||
                            (inst.action_by && currentUserId && (String(inst.action_by) === String(currentUserId) || String(inst.action_by?.id) === String(currentUserId)))
                          )
                        )
                      );
                      return renderStatusBadge(
                        selectedBundleForView.status,
                        false,
                        selectedBundleForView.approval_history?.find(i => i.status === 'Pending')?.step_name,
                        hasModalUserApproved
                      );
                    })()}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-normal mt-0.5">

                    <AvatarCircle
                      user={selectedBundleForView.worker_detail}
                      name={selectedBundleForView.worker_detail?.full_name || selectedBundleForView.worker_detail?.username || 'Technician'}
                      size="xs"
                    />
                    <span className="font-semibold text-on-surface">{selectedBundleForView.worker_detail?.full_name || selectedBundleForView.worker_detail?.username || 'Technician'}</span>
                    {selectedBundleForView.claim_date && ` • Created: ${formatDateDMY(selectedBundleForView.claim_date)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedBundleForView.status === 'Paid' && (
                  <button
                    type="button"
                    onClick={() => openBundleReceiptPreview(selectedBundleForView)}
                    className="px-3 py-1.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    title={
                      getBundleUploadedReceiptUrl(selectedBundleForView)
                        ? 'Preview uploaded settlement receipt'
                        : 'View settlement details & payment slip'
                    }
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                )}
                {(() => {
                  const isModalLedgerApproved = Boolean(
                    (selectedBundleForView.ledger_details && (selectedBundleForView.ledger_details.status === 'Approved' || selectedBundleForView.ledger_details.status === 'Paid')) ||
                    ((selectedBundleForView as any).ledger_status === 'Approved' || (selectedBundleForView as any).ledger_status === 'Paid') ||
                    (Array.isArray((selectedBundleForView as any).ledgers) && (selectedBundleForView as any).ledgers.some((l: any) => l.status === 'Approved' || l.status === 'Paid'))
                  );
                  if (isModalLedgerApproved) return null;
                  // return (selectedBundleForView.status === 'Draft' || selectedBundleForView.status === 'In Review' || selectedBundleForView.status === 'Submitted') && 
                  return (
                    <Can permission={["finance.view_bundle_report", "reports.can_generate_report"] as any}>
                      <button
                        type="button"
                        onClick={() => setSelectedBundleForReport(selectedBundleForView)}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-xs hover:shadow cursor-pointer"
                        title="Print bundle settlement report"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Report</span>
                      </button>
                    </Can>
                  );
                })()}
                <button onClick={() => setSelectedBundleForView(null)} className="p-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded bg-surface-container-low border border-outline-variant/80 shadow-2xs">
                <span className="text-on-surface-variant block text-[10px]  tracking-wider font-semibold">Total Amount</span>
                <span className="font-bold text-sm text-primary mt-0.5 block">KD {parseFloat(selectedBundleForView.total_claimed_amount).toFixed(3)}</span>
              </div>
              <div className="p-3 rounded bg-surface-container-low border border-outline-variant/80 shadow-2xs">
                <span className="text-on-surface-variant block text-[10px]  tracking-wider font-semibold">Coverage Period</span>
                <span className="font-semibold text-on-surface mt-0.5 block">
                  {selectedBundleForView.period_from && selectedBundleForView.period_to ? `${formatDateDMY(selectedBundleForView.period_from)} → ${formatDateDMY(selectedBundleForView.period_to)}` : 'All Expenses'}
                </span>
              </div>
              <div className="p-3 rounded bg-surface-container-low border border-outline-variant/80 shadow-2xs">
                <span className="text-on-surface-variant block text-[10px]  tracking-wider font-semibold">Tied Bills / Expenses</span>
                <span className="font-semibold text-on-surface mt-0.5 block">{selectedBundleForView.expenses?.length || 0} Bills</span>
              </div>
            </div>

            {selectedBundleForView.ledger_details && (
              <div className="p-3.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs">
                <span className="text-blue-600 dark:text-blue-400 font-semibold block text-[10px]  tracking-wider flex items-center gap-1 mb-1">
                  Attached Ledger Batch
                </span>
                <span className="font-semibold text-xs text-on-surface">
                  {selectedBundleForView.ledger_details.group_name} <span className="text-on-surface-variant font-normal">(Ledger {selectedBundleForView.ledger_details.ledger_id} • Status: {selectedBundleForView.ledger_details.status})</span>
                </span>
              </div>
            )}

            {selectedBundleForView.remarks && (
              <div className="p-3.5 rounded bg-surface-container-low border border-outline-variant/80 text-xs shadow-2xs">
                <span className="font-semibold text-on-surface block mb-1">Remarks:</span>
                <p className="text-on-surface-variant italic">{selectedBundleForView.remarks}</p>
              </div>
            )}

            {/* Visual Approval Pipeline Stepper inside View Modal */}
            {(() => {
              if (selectedBundleForView.status === 'Draft') return null;
              const modalApprovalData = getBundleApprovalGroup(selectedBundleForView);
              if (!modalApprovalData?.group) return null;
              return (
                <div className="p-3.5 bg-surface-container-low rounded border border-outline-variant/80 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Approval Progress Steps
                    </span>
                    {modalApprovalData.app && (
                      <span className="text-[11px] text-on-surface-variant font-medium">
                        Current Step: <strong className="text-primary">{modalApprovalData.app.step_name}</strong>
                      </span>
                    )}
                  </div>
                  {renderApprovalStepper(modalApprovalData.group)}
                </div>
              );
            })()}

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold  tracking-wider text-on-surface flex items-center justify-between">
                <span>Tied Bills & Receipts ({selectedBundleForView.expenses?.length || 0})</span>
              </h4>

              {(!selectedBundleForView.expenses || selectedBundleForView.expenses.length === 0) ? (
                <div className="p-6 text-center text-xs text-on-surface-variant border border-outline-variant/80 rounded bg-surface-container-low">
                  No expenses currently attached to this bundle.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                  {selectedBundleForView.expenses.map((exp, vExpIdx) => {
                    const receiptsList: MediaFileItem[] = [];
                    if (exp.receipt) receiptsList.push(exp.receipt);
                    if (exp.receipts && Array.isArray(exp.receipts)) {
                      exp.receipts.forEach(r => {
                        if (!receiptsList.some(ex => ex.media_id === r.media_id)) {
                          receiptsList.push(r);
                        }
                      });
                    }

                    const statusText = (exp.expense_type && (exp.expense_type as any).approve_required === false)
                      ? 'Approved'
                      : (exp.status_display || (exp.approved ? 'Approved' : ((exp.claim?.status === 'Rejected' || exp.claim?.status === 'Rework') ? exp.claim.status : 'Pending Approval')));
                    const isExpApproved = statusText === 'Approved';
                    const isExpRejected = statusText === 'Rejected';
                    const isExpRework = statusText === 'Rework';

                    return (
                      <div key={exp.expense_id ?? `view-exp-${vExpIdx}`} className="p-3.5 rounded border border-outline-variant/80 bg-surface-container-low space-y-2.5 text-xs shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-bold text-on-surface text-sm">
                              {exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || 'Expense'}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant mt-0.5">
                              <span>Date: {formatDateDMY(exp.expense_date)}</span>
                              {exp.ticket_details && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedTicketForModal && setSelectedTicketForModal(exp.ticket_details)}
                                  className="px-2 py-0.5 rounded-md bg-surface-container-high text-primary font-semibold hover:underline cursor-pointer"
                                >
                                  {exp.ticket_details.work_order_no}
                                </button>
                              )}
                              {exp.responsible_store && (
                                <span className="text-on-surface-variant font-medium">
                                  Store: {exp.responsible_store.store_name}
                                </span>
                              )}
                            </div>
                            {getCleanRemarks(exp.remarks) && (
                              <div className="mt-1.5 text-[11px] text-on-surface bg-surface-container px-2.5 py-1 rounded border border-outline-variant/50 flex items-start gap-1">
                                <span className="font-semibold text-primary shrink-0">Remarks:</span>
                                <span className="text-on-surface leading-tight">{getCleanRemarks(exp.remarks)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${isExpApproved
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : isExpRejected
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                : isExpRework
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              }`}>
                              {statusText}
                            </span>
                            <span className="font-bold text-sm text-on-surface shrink-0">
                              KD {parseFloat(exp.amount).toFixed(3)}
                            </span>
                            {selectedBundleForView?.status !== 'Paid' && !(selectedBundleForView?.ledger_details && (selectedBundleForView.ledger_details.status === 'Approved' || selectedBundleForView.ledger_details.status === 'Paid' || selectedBundleForView.ledger_details.is_completed)) && handleRemoveExpenseFromBundle && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if ((selectedBundleForView.expenses?.length || 0) <= 1) {
                                    const confirmed = await confirmPopup({
                                      preset: "remove",
                                      button2: "Close",
                                      title: "Cannot remove",
                                      description: "Cannot remove the only expense. Please delete the Bundle instead.",
                                      showButton1: false,
                                    });

                                    if (confirmed) return;
                                  }
                                  await handleRemoveExpenseFromBundle(selectedBundleForView.claim_id, exp.expense_id);
                                  const updatedExpenses = (selectedBundleForView.expenses || []).filter(item => item.expense_id !== exp.expense_id);
                                  if (updatedExpenses.length === 0) {
                                    setSelectedBundleForView(null);
                                  } else {
                                    const updatedTotal = updatedExpenses.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
                                    setSelectedBundleForView({
                                      ...selectedBundleForView,
                                      status: 'Draft',
                                      expenses: updatedExpenses,
                                      total_claimed_amount: updatedTotal.toFixed(3)
                                    });
                                  }
                                }}
                                className="p-1 rounded hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:border-rose-500/40 transition-colors cursor-pointer"
                                title="Remove Expense from Bundle"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {receiptsList.length > 0 && (
                          <div className="pt-2.5 border-t border-outline-variant/60">
                            <span className="text-[10px] font-bold  text-on-surface-variant block mb-1.5 flex items-center gap-1">
                              <Paperclip className="w-3.5 h-3.5" /> Receipts / Media ({receiptsList.length})
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {receiptsList.map((m, rIdx) => (
                                <div
                                  key={m.media_id ?? `receipt-${rIdx}`}
                                  onClick={() => setPreviewMediaUrl({ url: getMediaUrl(m.file_url), title: m.file_name || `Receipt ${m.media_id}` })}
                                  className="group relative w-16 h-16 rounded border border-outline-variant overflow-hidden bg-black/10 cursor-pointer hover:border-primary transition-all shadow-2xs"
                                >
                                  <img
                                    src={getMediaUrl(m.file_url)}
                                    alt={m.file_name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* View Modal Footer & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-outline-variant/80">
              <div className="flex items-center gap-2">
                {(() => {
                  const modalApprovalData = getBundleApprovalGroup(selectedBundleForView);
                  const isModalRework = selectedBundleForView.status === 'Rework' ||
                    (selectedBundleForView.status as string) === 'Rework Needed' ||
                    (selectedBundleForView as any).status_display === 'Rework' ||
                    (selectedBundleForView as any).status_display === 'Rework Needed' ||
                    modalApprovalData?.group?.items?.some((i: any) => i.status === 'Rework') ||
                    modalApprovalData?.app?.status === 'Rework';

                  return (
                    <>
                      {(selectedBundleForView.status === 'Draft' || isModalRework) && (
                        <Can permission={isAdmin || ["finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                          <button
                            onClick={() => {
                              const b = selectedBundleForView;
                              setSelectedBundleForView(null);
                              openEditBundleModal(b);
                            }}
                            className="px-3.5 py-2 rounded border border-primary text-primary hover:bg-primary/10 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <PlusCircle className="w-4 h-4" />
                            <span>Edit Bundle</span>
                          </button>
                        </Can>
                      )}
                      {(selectedBundleForView.status === 'Draft' || isModalRework || (selectedBundleForView.status !== 'Approved' && selectedBundleForView.status !== 'Paid')) && (
                        <Can permission={isAdmin || ["finance.delete_bundle", "finance.delete_workerclaim", "finance.edit_bundle", "finance.edit_workerclaim", "finance.change_workerclaim"] as any}>
                          <button
                            type="button"
                            disabled={activeDeletingId === selectedBundleForView.claim_id || submitting}
                            onClick={async () => {
                              const id = selectedBundleForView.claim_id;
                              await onDeleteBundle(id);
                              setSelectedBundleForView(null);
                            }}
                            className={`px-3.5 py-2 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeDeletingId === selectedBundleForView.claim_id ? 'bg-rose-500/10 cursor-not-allowed opacity-100' : 'hover:bg-rose-500/10 cursor-pointer disabled:opacity-50'}`}
                          >
                            {activeDeletingId === selectedBundleForView.claim_id ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Deleting Bundle...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-4 h-4" />
                                <span>Delete Bundle</span>
                              </>
                            )}
                          </button>
                        </Can>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2.5">
                {(selectedBundleForView.status === 'Submitted' || selectedBundleForView.status === 'In Review') && (() => {
                  const modalApprovalData = getBundleApprovalGroup(selectedBundleForView);
                  const activePendingInstance = modalApprovalData?.group?.items?.find(i => i.status === 'Pending');
                  const reworkInstance = modalApprovalData?.group?.items?.find((i: any) => i.status === 'Rework');
                  const rejectedInstance = modalApprovalData?.group?.items?.find((i: any) => i.status === 'Rejected');
                  const activeApp: any = activePendingInstance || reworkInstance || rejectedInstance || modalApprovalData?.app;
                  const currentStepInfo = activeApp?.workflow_steps?.find(
                    (s: any) => s.step_id === activeApp.step_id || s.step_name === activeApp.step_name || s.step_order === activeApp.step_order
                  );
                  const canApproveView = checkCanUserActionStep(activeApp, currentStepInfo);

                  if (!canApproveView) return null;

                  const isActing = actioningBundleId === selectedBundleForView.claim_id;

                  return (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Add review comment..."
                        value={reworkComments[selectedBundleForView.claim_id] || ''}
                        onChange={(e) => setReworkComments(prev => ({ ...prev, [selectedBundleForView.claim_id]: e.target.value }))}
                        className="px-2.5 py-1.5 text-xs bg-surface border border-outline-variant rounded focus:outline-hidden focus:border-primary w-48 text-on-surface"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await handleInlineBundleAction(selectedBundleForView, 'APPROVED');
                          setSelectedBundleForView(null);
                        }}
                        disabled={isActing}
                        className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleInlineBundleAction(selectedBundleForView, 'REWORK');
                          setSelectedBundleForView(null);
                        }}
                        disabled={isActing}
                        className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Rework</span>
                      </button>
                    </div>
                  );
                })()}

                {(() => {
                  const modalApprovalData = getBundleApprovalGroup(selectedBundleForView);
                  const isModalRework = selectedBundleForView.status === 'Rework' ||
                    (selectedBundleForView.status as string) === 'Rework Needed' ||
                    (selectedBundleForView as any).status_display === 'Rework' ||
                    (selectedBundleForView as any).status_display === 'Rework Needed' ||
                    modalApprovalData?.group?.items?.some((i: any) => i.status === 'Rework') ||
                    modalApprovalData?.app?.status === 'Rework';

                  if (selectedBundleForView.status !== 'Draft' && !isModalRework) return null;

                  return (
                    <Can permission={isAdmin || ["finance.submit_bundle", "finance.submit_workerclaim"] as any}>
                      <button
                        onClick={async () => {
                          await onHandleSubmitBundle(selectedBundleForView.claim_id);
                          setSelectedBundleForView(null);
                        }}
                        disabled={Boolean(submittingBundleIds[selectedBundleForView.claim_id])}
                        className="px-4 py-2 rounded bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer shadow-md hover:shadow-primary/25 active:scale-[0.98] inline-flex items-center gap-1.5"
                      >
                        {submittingBundleIds[selectedBundleForView.claim_id] ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <span>{isModalRework ? 'Resubmit Approval' : 'Submit Approval'}</span>
                        )}
                      </button>
                    </Can>
                  );
                })()}
                <button
                  onClick={() => setSelectedBundleForView(null)}
                  className="px-4 py-2 rounded border border-outline-variant text-xs text-on-surface hover:bg-surface-container-high transition-colors font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: EXPENSE MAIN PREVIEW & DETAILS */}
      <ExpensePreviewModal
        expense={previewExpense}
        onClose={() => setPreviewExpense(null)}
        zIndexClass="z-[60]"
        setPreviewMediaUrl={setPreviewMediaUrl}
        setSelectedTicketForModal={setSelectedTicketForModal}
      />

      {/* POPUP MODAL 4: BUNDLE SETTLEMENT REPORT */}
      {selectedBundleForReport && (
        <BundleReportModal
          bundle={selectedBundleForReport}
          onClose={() => setSelectedBundleForReport(null)}
          setSelectedTicketForModal={setSelectedTicketForModal}
          token={token}
          currentUser={currentUser}
          API_URL={API_URL}
          autoPrint={false}
        />
      )}
    </div>
  );
};
