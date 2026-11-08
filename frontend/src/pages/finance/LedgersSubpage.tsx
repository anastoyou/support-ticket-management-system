import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers, PlusCircle, Trash2, X, AlertCircle, Loader2, Building2, ShieldCheck,
  CheckCircle2, AlertTriangle, Boxes, Tag, ChevronDown, ChevronRight, Rows3,
  ChevronsUp, Check, RotateCcw, User, Calendar, Users, Receipt,
  FileText, ExternalLink, Eye, EyeOff, Clock, FolderKanban, Lock, CheckCircle, Package,
  RefreshCw, Plus, GitCommit, Send, CreditCard, Banknote, Search,
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { getUserId, type LedgerItem, type WorkerClaimItem, type LedgerGroupItem, type ExpenseItem, type LedgerBatchItem, type ApprovalStepInfo, type ApprovalInstanceItem } from './types';
import { Pagination } from './Pagination';
import { SearchableSelect, type SelectOption } from '../../components/SearchableSelect';
import { ApprovalsSubpage, type ApprovalsSubpageProps } from './ApprovalsSubpage';
import { LedgerGroupReportModal, type LedgerGroupCluster } from './LedgerGroupReportModal';
import { MonthlyLocationReportModal } from './MonthlyLocationReportModal';
import { AvatarCircle } from '../ticket/TicketsTypesAndComponents';
import Can from '@/hooks/Can';
import { usePermission } from '@/hooks/usePermission';
import { confirmPopup } from '../../components/tailgrids/core/ConfirmationPopup';

interface LedgersSubpageProps {
  filteredLedgers?: LedgerItem[];
  ledgers: LedgerItem[];
  bundles: WorkerClaimItem[];
  ledgerGroups: LedgerGroupItem[];
  ledgerBatches?: LedgerBatchItem[];
  loading: boolean;
  submitting: boolean;
  renderStatusBadge: (status: string, isActionableForMe?: boolean, stepName?: string, hasCurrentUserApproved?: boolean) => React.ReactNode;
  expandedLedgerIds: Record<number, boolean>;
  toggleExpandLedger: (ledgerId: number) => void;
  handleSubmitLedger: (ledgerId: number) => void;
  setShowPaymentModal: (item: LedgerItem | WorkerClaimItem | any) => void;
  handleDeleteLedger: (ledgerId: number) => void;
  openEditBundleModal: (bundle: WorkerClaimItem) => void;
  openAddExpenseModal?: (ledger: LedgerItem) => void;
  handleRemoveExpenseFromLedger: (ledgerId: number, expenseId: number) => void;
  handleAddBundleToLedger?: (ledgerId: number, bundleId: number) => Promise<void>;
  handleAddBundleToGroup?: (groupId: number, bundleId: number | number[]) => Promise<void>;
  handleRemoveBundleFromLedger?: (ledgerId: number, bundleId: number) => Promise<void>;
  handleRemoveBundleFromGroup?: (groupId: number, bundleId: number) => Promise<void>;
  handleDeleteLedgerGroup?: (groupId: number) => Promise<void>;
  showCreateLedgerModal: boolean;
  setShowCreateLedgerModal: (show: boolean) => void;
  selectedBundleIds: number[];
  setSelectedBundleIds: (ids: number[]) => void;
  selectedGroupId: string;
  setSelectedGroupId: (id: string) => void;
  newGroupName: string;
  setNewGroupName: (name: string) => void;
  ledgerRemarks?: string;
  setLedgerRemarks?: (remarks: string) => void;
  handleCreateLedger: () => void;
  showAddExpenseModal?: LedgerItem | null;
  setShowAddExpenseModal?: (item: LedgerItem | null) => void;
  loadingAvailableExpenses?: boolean;
  availableApprovedExpenses?: ExpenseItem[];
  selectedAddExpenseId?: number | null;
  setSelectedAddExpenseId?: (id: number | null) => void;
  handleAddExpenseToLedger?: () => void;
  token?: string;
  API_URL?: string;
  approvalsProps?: ApprovalsSubpageProps;
  currentUser?: any;
  onRefresh?: () => Promise<void> | void;
  onLedgerUpdated?: (updatedLedger: LedgerItem) => void;
  onLedgersUpdated?: (updatedLedgers: LedgerItem[]) => void;
  currentPage?: number;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
  onItemsPerPageChange?: (num: number) => void;
  setSelectedTicketForModal?: (ticket: any) => void;
  isSyncingNewLedger?: boolean;
  syncingLedgerInfo?: {
    ledger_id?: number | string;
    group_name?: string;
    bundles_count?: number;
    total_amount?: number;
  } | null;
  errorMessage?: string | null;
  setErrorMessage?: (msg: string | null) => void;
}

export const LedgersSubpage: React.FC<LedgersSubpageProps> = ({
  ledgers,
  filteredLedgers = ledgers,
  bundles,
  ledgerGroups,
  ledgerBatches = [],
  loading,
  submitting,
  renderStatusBadge,
  expandedLedgerIds,
  toggleExpandLedger,
  handleSubmitLedger,
  setShowPaymentModal,
  handleDeleteLedger,
  openEditBundleModal,
  openAddExpenseModal,
  handleRemoveExpenseFromLedger,
  handleAddBundleToLedger,
  handleAddBundleToGroup,
  handleRemoveBundleFromLedger,
  handleRemoveBundleFromGroup,
  handleDeleteLedgerGroup,
  showCreateLedgerModal,
  setShowCreateLedgerModal,
  selectedBundleIds,
  setSelectedBundleIds,
  selectedGroupId,
  setSelectedGroupId,
  newGroupName,
  setNewGroupName,
  ledgerRemarks = '',
  setLedgerRemarks,
  handleCreateLedger,
  showAddExpenseModal,
  setShowAddExpenseModal,
  loadingAvailableExpenses,
  availableApprovedExpenses,
  selectedAddExpenseId,
  setSelectedAddExpenseId,
  handleAddExpenseToLedger,
  token,
  API_URL,
  approvalsProps,
  currentUser,
  onRefresh,
  onLedgerUpdated,
  onLedgersUpdated,
  currentPage: propCurrentPage,
  totalItems: propTotalItems,
  itemsPerPage: propItemsPerPage,
  onPageChange: propOnPageChange,
  onItemsPerPageChange: propOnItemsPerPageChange,
  setSelectedTicketForModal,
  isSyncingNewLedger = false,
  syncingLedgerInfo = null,
  errorMessage = null,
  setErrorMessage
}) => {
  // Stepper Visibility State
  const [showStepper, setShowStepper] = useState<boolean>(true);
  const [isAddingToExistingGroup, setIsAddingToExistingGroup] = useState<boolean>(false);

  useEffect(() => {
    if (!showCreateLedgerModal) {
      setIsAddingToExistingGroup(false);
    }
  }, [showCreateLedgerModal]);

  // Refreshing State
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleRefreshClick = async () => {
    if (isRefreshing || loading || !onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      if (showCreateLedgerModal) {
        await fetchLedgerGroups('');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const { hasPermission } = usePermission();

  const canSinglePay = useMemo(() => {
    if (currentUser?.is_superuser) return true;
    const roleName = (
      (currentUser?.role as any)?.role_name ||
      (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
      ''
    ).toLowerCase();
    if (roleName === 'administrator' || roleName === 'admin') return true;
    return (
      hasPermission('finance.single_payment_process') ||
      hasPermission('single_payment_process')
    );
  }, [currentUser, hasPermission]);

  const canBulkPay = useMemo(() => {
    if (currentUser?.is_superuser) return true;
    const roleName = (
      (currentUser?.role as any)?.role_name ||
      (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
      ''
    ).toLowerCase();
    if (roleName === 'administrator' || roleName === 'admin') return true;
    return (
      hasPermission('finance.bulk_payment_processs') ||
      hasPermission('finance.bulk_payment_process') ||
      hasPermission('bulk_payment_processs') ||
      hasPermission('bulk_payment_process')
    );
  }, [currentUser, hasPermission]);

  const isCashOffice = useMemo(() => {
    return canBulkPay || canSinglePay;
  }, [canBulkPay, canSinglePay]);

  // Ledger Group Accordion State (groupId -> boolean expanded)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string | number, boolean>>({});

  // Last active row state for clicked row highlight
  const [lastActiveRowKey, setLastActiveRowKey] = useState<string | number | null>(null);

  const toggleGroupAccordion = (groupId: string | number) => {
    setExpandedGroupIds(prev => {
      const isCurrentlyExpanded = !!prev[groupId];
      const next = { ...prev };
      if (isCurrentlyExpanded) {
        delete next[groupId];
        // When closing a group, collapse its child batches
        const cluster = groupedLedgerClusters.find(c => String(c.groupId) === String(groupId));
        if (cluster) {
          cluster.ledgers.forEach(l => {
            if (expandedLedgerIds[l.ledger_id]) {
              toggleExpandLedger(l.ledger_id);
            }
          });
        }
      } else {
        next[groupId] = true;
      }
      return next;
    });
  };

  const isOnlyExpenseInBundleOrLedger = (
    ledger: LedgerItem,
    exp: ExpenseItem,
    explicitBundleCount?: number
  ) => {
    if (explicitBundleCount !== undefined && explicitBundleCount <= 1) return true;
    if ((ledger.expenses?.length || 0) <= 1) return true;

    const rawClaim = exp.claim ?? (exp as any).claim_id ?? (exp as any).bundle_id;
    const claimId = rawClaim && typeof rawClaim === 'object' ? rawClaim.claim_id : rawClaim;

    if (claimId) {
      const matchingBundle = (bundles || []).find(b => Number(b.claim_id || (b as any).id) === Number(claimId))
        || (ledger.bundles || []).find((b: any) => Number(b.claim_id || (b as any).id) === Number(claimId));

      if (matchingBundle?.expenses && matchingBundle.expenses.length <= 1) {
        return true;
      }

      const bundleExpInLedger = (ledger.expenses || []).filter(e => {
        const c = e.claim ?? (e as any).claim_id ?? (e as any).bundle_id;
        const cid = c && typeof c === 'object' ? c.claim_id : c;
        return Number(cid) === Number(claimId);
      }).length;

      if (bundleExpInLedger <= 1) {
        return true;
      }
    }

    return false;
  };

  // Report Modal State for Ledger Group
  const [selectedGroupForReport, setSelectedGroupForReport] = useState<LedgerGroupCluster | null>(null);
  const [showMonthlyLocationReportModal, setShowMonthlyLocationReportModal] = useState(false);
  const [selectedGroupForAction, setSelectedGroupForAction] = useState<LedgerGroupCluster | null>(null);
  const [actionComments, setActionComments] = useState('');
  const [actionCommentError, setActionCommentError] = useState('');



  // Cash Settlement / Pay Group Modal States
  const [groupToPay, setGroupToPay] = useState<LedgerGroupCluster | null>(null);
  const [payingGroupId, setPayingGroupId] = useState<string | number | null>(null);
  const [payRecipientName, setPayRecipientName] = useState('');
  const [payRemarks, setPayRemarks] = useState('');
  const [payingGroupError, setPayingGroupError] = useState<string | null>(null);

  // Cash Settlement API Handler
  const handlePayLedgerGroup = async (cluster: LedgerGroupCluster) => {
    if (!cluster || !cluster.groupId || !API_URL) return;
    if (!payRecipientName.trim()) {
      setPayingGroupError('Please enter the recipient name.');
      return;
    }
    setPayingGroupId(cluster.groupId);
    setPayingGroupError(null);

    try {
      const res = await fetch(`${API_URL}/finance/ledger-groups/${cluster.groupId}/pay/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payment_method: 'Cash',
          recipient_name: payRecipientName.trim(),
          payment_remarks: payRemarks.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to complete cash settlement.');
      }

      const paidGroup: LedgerGroupItem = data;

      // Synchronize dynamicGroups state in place
      setDynamicGroups(prev =>
        prev.map(g => (String(g.ledger_group_id) === String(paidGroup.ledger_group_id) ? { ...g, ...paidGroup, is_paid: true, is_completed: true } : g))
      );

      // Instantly update ledgers in memory
      const updatedLedgers: LedgerItem[] = cluster.ledgers.map(l => ({
        ...l,
        status: 'Paid' as const,
        ledger_group_detail: {
          ...(l.ledger_group_detail || {}),
          ...paidGroup,
          is_paid: true,
          is_completed: true,
          paid_at: paidGroup.paid_at,
          paid_by_detail: paidGroup.paid_by_detail,
          payment_method: paidGroup.payment_method,
          payment_reference: paidGroup.payment_reference,
          payment_remarks: paidGroup.payment_remarks,
          recipient_name: paidGroup.recipient_name,
        } as LedgerGroupItem,
        bundles: (l.bundles || []).map(b => ({ ...b, status: 'Paid' as const })),
        expenses: (l.expenses || []).map(e => ({ ...e, is_paid: true, status_display: 'Paid' }))
      }));

      if (onLedgersUpdated) {
        onLedgersUpdated(updatedLedgers);
      } else if (onLedgerUpdated) {
        updatedLedgers.forEach(l => onLedgerUpdated(l));
      }

      setGroupToPay(null);
      setPayRecipientName('');
      setPayRemarks('');

      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setPayingGroupError(err.message || 'Failed to complete cash settlement.');
    } finally {
      setPayingGroupId(null);
    }
  };

  // Group-level Submission & Approval States
  const [submittingGroupIds, setSubmittingGroupIds] = useState<Record<string | number, boolean>>({});
  const [actioningGroupId, setActioningGroupId] = useState<string | number | null>(null);
  const [actioningGroupAction, setActioningGroupAction] = useState<'APPROVED' | 'REWORK' | null>(null);
  const [groupReworkComments, setGroupReworkComments] = useState<Record<string | number, string>>({});
  const [groupReworkErrors, setGroupReworkErrors] = useState<Record<string | number, string>>({});

  // Group-level Submit Handler
  const handleGroupSubmit = async (cluster: LedgerGroupCluster) => {
    if (!cluster || !cluster.groupId || !API_URL) return;
    const totalBundlesInGroup = (cluster.ledgers || []).reduce((sum, l) => sum + (l.bundles?.length || 0) + (l.expenses?.length || 0), 0);
    if (totalBundlesInGroup === 0) {
      setBulkActionMsg({
        type: 'error',
        text: `Cannot submit Ledger Group '${cluster.groupName}': Must have at least one claim bundle attached.`
      });
      return;
    }
    setSubmittingGroupIds(prev => ({ ...prev, [cluster.groupId]: true }));
    setBulkActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledger-groups/${cluster.groupId}/submit/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to submit ledger group');
      }
      if (Array.isArray(data)) {
        if (onLedgersUpdated) {
          onLedgersUpdated(data);
        } else if (onLedgerUpdated) {
          data.forEach(l => {
            onLedgerUpdated(l);
          });
        }
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setBulkActionMsg({
        type: 'error',
        text: err.message || 'Failed to submit ledger group'
      });
    } finally {
      setSubmittingGroupIds(prev => {
        const next = { ...prev };
        delete next[cluster.groupId];
        return next;
      });
    }
  };

  // Group-level Approval Action Handler
  const handleGroupAction = async (cluster: LedgerGroupCluster, action: 'APPROVED' | 'REWORK') => {
    if (!cluster || !cluster.groupId || !API_URL) return;
    const comment = groupReworkComments[cluster.groupId] || '';
    if (action === 'REWORK' && !comment.trim()) {
      setGroupReworkErrors(prev => ({ ...prev, [cluster.groupId]: 'Comment is required when requesting rework.' }));
      return;
    }
    setActioningGroupId(cluster.groupId);
    setActioningGroupAction(action);
    setBulkActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledger-groups/${cluster.groupId}/action/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, comments: comment })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to action ledger group');
      }
      if (Array.isArray(data)) {
        if (onLedgersUpdated) {
          onLedgersUpdated(data);
        } else if (onLedgerUpdated) {
          data.forEach(l => {
            onLedgerUpdated(l);
          });
        }
      }
      if (onRefresh) {
        await onRefresh();
      }
      setGroupReworkComments(prev => ({ ...prev, [cluster.groupId]: '' }));
      setGroupReworkErrors(prev => {
        const next = { ...prev };
        delete next[cluster.groupId];
        return next;
      });
    } catch (err: any) {
      setBulkActionMsg({
        type: 'error',
        text: err.message || 'Failed to action ledger group'
      });
    } finally {
      setActioningGroupId(null);
      setActioningGroupAction(null);
    }
  };

  // Delete Ledger Group State & Handler
  const [deletingGroupId, setDeletingGroupId] = useState<string | number | null>(null);
  const [removingBundleKey, setRemovingBundleKey] = useState<string | null>(null);

  const onDeleteLedgerGroup = async (cluster: LedgerGroupCluster) => {
    if (!cluster || !cluster.groupId) return;


    const confirmed = await confirmPopup({
      preset: "delete",
      title: `Delete Ledger Group "${cluster.groupName}"?`,
      description: `Are you sure you want to delete Ledger Group "${cluster.groupName}" (${cluster.groupId})?\n\nAll batches in this group will be deleted, and attached claim bundles will return to available status.`,
      button1: "Cancel",
      button2: "Delete Ledger Group",
    });

    if (!confirmed) return;


    setDeletingGroupId(cluster.groupId);
    setBulkActionMsg(null);
    try {
      if (handleDeleteLedgerGroup) {
        await handleDeleteLedgerGroup(Number(cluster.groupId));
      } else if (API_URL) {
        const res = await fetch(`${API_URL}/finance/ledger-groups/${cluster.groupId}/`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to delete Ledger Group');
        }
        if (onRefresh) {
          await onRefresh();
        }
      }
      setDynamicGroups(prev => prev.filter(g => String(g.ledger_group_id) !== String(cluster.groupId)));
    } catch (err: any) {
      setBulkActionMsg({
        type: 'error',
        text: err.message || 'Failed to delete Ledger Group'
      });
    } finally {
      setDeletingGroupId(null);
    }
  };

  // Dynamic Ledger Groups Search State (API-based, latest 10 in new-to-old order)
  const [dynamicGroups, setDynamicGroups] = useState<LedgerGroupItem[]>(ledgerGroups || []);
  const [loadingGroups, setLoadingGroups] = useState<boolean>(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback Ledger Batches State
  const [internalBatches, setInternalBatches] = useState<LedgerBatchItem[]>(ledgerBatches || []);
  const batchesFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (ledgerBatches && ledgerBatches.length > 0) {
      setInternalBatches(ledgerBatches);
    }
  }, [ledgerBatches]);

  const fetchLedgerBatches = async () => {
    if (!API_URL || batchesFetchedRef.current) return;
    batchesFetchedRef.current = true;
    try {
      const res = await fetch(`${API_URL}/finance/ledger-batches/?page_size=100`, {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const results: LedgerBatchItem[] = Array.isArray(data)
          ? data
          : (Array.isArray(data.results) ? data.results : []);
        setInternalBatches(results);
      }
    } catch (err) {
      console.error('Failed to fetch ledger batches:', err);
    }
  };

  useEffect(() => {
    if (showCreateLedgerModal && (!ledgerBatches || ledgerBatches.length === 0) && !batchesFetchedRef.current) {
      fetchLedgerBatches();
    }
  }, [showCreateLedgerModal, ledgerBatches]);

  useEffect(() => {
    if (ledgerGroups) {
      setDynamicGroups(ledgerGroups);
    }
  }, [ledgerGroups]);

  const fetchLedgerGroups = async (searchTerm: string = '') => {
    if (!API_URL) return;
    setLoadingGroups(true);
    try {
      const url = searchTerm.trim()
        ? `${API_URL}/finance/ledger-groups/?search=${encodeURIComponent(searchTerm.trim())}&page_size=50`
        : `${API_URL}/finance/ledger-groups/?page_size=50`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const results: LedgerGroupItem[] = Array.isArray(data)
          ? data
          : (Array.isArray(data.results) ? data.results : []);
        setDynamicGroups(results);
      }
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleGroupSearch = (term: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      fetchLedgerGroups(term);
    }, 300);
  };

  useEffect(() => {
    if (showCreateLedgerModal) {
      fetchLedgerGroups('');
    }
  }, [showCreateLedgerModal]);

  const isGroupUnused = (g: LedgerGroupItem) => {
    if (typeof g.ledgers_count === 'number') {
      return g.ledgers_count === 0;
    }
    const hasChildLedgers = (ledgers || []).some(
      l => l.ledger_group === g.ledger_group_id || l.ledger_group_detail?.ledger_group_id === g.ledger_group_id
    );
    if (hasChildLedgers) return false;
    return parseFloat(g.total_amount || '0') === 0;
  };

  const handleDeleteUnusedGroup = async (groupId: string | number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const group = dynamicGroups.find(g => String(g.ledger_group_id) === String(groupId)) ||
      ledgerGroups?.find(g => String(g.ledger_group_id) === String(groupId));
    const groupName = group ? group.group_name : `${groupId}`;
    if (!window.confirm(`Are you sure you want to delete the unused Ledger Group "${groupName}"?`)) {
      return;
    }
    try {
      if (handleDeleteLedgerGroup) {
        await handleDeleteLedgerGroup(Number(groupId));
      } else if (API_URL) {
        const res = await fetch(`${API_URL}/finance/ledger-groups/${groupId}/`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to delete Ledger Group');
        }
        if (onRefresh) {
          await onRefresh();
        }
      }
      setDynamicGroups(prev => prev.filter(g => String(g.ledger_group_id) !== String(groupId)));
      if (String(selectedGroupId) === String(groupId)) {
        setSelectedGroupId('');
      }
    } catch (err: any) {
      setBulkActionMsg({
        type: 'error',
        text: err.message || 'Failed to delete Ledger Group'
      });
    }
  };

  const selectedGroupTitle = useMemo(() => {
    if (!selectedGroupId) return null;
    const foundGroup = dynamicGroups.find(g => String(g.ledger_group_id) === String(selectedGroupId)) ||
      ledgerGroups?.find(g => String(g.ledger_group_id) === String(selectedGroupId));
    if (foundGroup) return foundGroup.group_name;
    const matchLedger = (ledgers || []).find(l => String(l.ledger_group || l.ledger_group_id || l.ledger_group_detail?.ledger_group_id) === String(selectedGroupId));
    if (matchLedger?.ledger_group_detail?.group_name) return matchLedger.ledger_group_detail.group_name;
    return `Ledger Group #${selectedGroupId}`;
  }, [selectedGroupId, dynamicGroups, ledgerGroups, ledgers]);

  const getGroupStatus = (g: LedgerGroupItem): string => {
    if (g.is_paid) return 'Paid';
    const childLedgers = (ledgers || []).filter(
      l => String(l.ledger_group || l.ledger_group_id || l.ledger_group_detail?.ledger_group_id) === String(g.ledger_group_id)
    );
    if (childLedgers.length > 0) {
      if (childLedgers.every(l => l.status === 'Paid')) return 'Paid';
      if (childLedgers.some(l => l.status === 'Rework')) return 'Rework';
      if (childLedgers.some(l => l.status === 'In Review' || l.status === 'Submitted')) return 'In Review';
      if (childLedgers.some(l => l.status === 'Rejected')) return 'Rejected';
      if (childLedgers.every(l => l.status === 'Approved' || l.status === 'Paid')) return 'Approved';
      return 'Draft';
    }
    if (g.status === 'Rework' || g.status === 'In Review' || g.status === 'Rejected' || g.status === 'Draft') {
      return g.status;
    }
    if (g.is_completed || g.status === 'Completed' || g.status === 'Approved') return 'Approved';
    if (g.status) return g.status;
    return 'Draft';
  };

  const ledgerGroupSelectOptions: SelectOption[] = useMemo(() => {
    // Show group names only if status is Draft or Rework
    const list = dynamicGroups.filter(g => {
      const st = getGroupStatus(g);
      return st === 'Draft' || st === 'Rework';
    });

    if (selectedGroupId && !list.some(g => String(g.ledger_group_id) === String(selectedGroupId))) {
      const foundInProp = ledgerGroups?.find(g => String(g.ledger_group_id) === String(selectedGroupId));
      if (foundInProp) {
        const st = getGroupStatus(foundInProp);
        if (st === 'Draft' || st === 'Rework' || isAddingToExistingGroup) {
          list.unshift(foundInProp);
        }
      } else {
        const matchLedger = (ledgers || []).find(l => String(l.ledger_group || l.ledger_group_id || l.ledger_group_detail?.ledger_group_id) === String(selectedGroupId));
        if (matchLedger) {
          const item: LedgerGroupItem = {
            ledger_group_id: Number(selectedGroupId),
            group_name: matchLedger.ledger_group_detail?.group_name || `Ledger Group ${selectedGroupId}`,
            total_amount: String(matchLedger.ledger_group_detail?.total_amount || '0'),
            is_completed: Boolean(matchLedger.ledger_group_detail?.is_completed),
            status: matchLedger.status || 'Draft',
            created_at: matchLedger.ledger_group_detail?.created_at || matchLedger.created_at || ''
          };
          const st = getGroupStatus(item);
          if (st === 'Draft' || st === 'Rework' || isAddingToExistingGroup) {
            list.unshift(item);
          }
        }
      }
    }
    return [
      { value: '', label: '-- Create New Ledger Group --' },
      ...list.map(g => {
        const unused = isGroupUnused(g);
        const st = getGroupStatus(g);
        return {
          value: String(g.ledger_group_id),
          label: `${g.group_name} (${parseFloat(g.total_amount || '0').toFixed(3)} KD)${unused ? ' • [Unused]' : ` • [${st}]`}`,
          canDelete: unused,
          deleteTooltip: `Delete unused group "${g.group_name}"`
        };
      })
    ];
  }, [dynamicGroups, ledgerGroups, selectedGroupId, ledgers, isAddingToExistingGroup]);

  const existingGroupWithSameName = useMemo(() => {
    const name = newGroupName.trim().toLowerCase();
    if (!name) return null;
    return (
      dynamicGroups.find(g => g.group_name?.trim().toLowerCase() === name) ||
      ledgerGroups?.find(g => g.group_name?.trim().toLowerCase() === name) ||
      null
    );
  }, [newGroupName, dynamicGroups, ledgerGroups]);

  // Multi-line View State
  const [isMultiLineView, setIsMultiLineView] = useState<boolean>(false);

  // Inline Rework Comments & Errors per Ledger
  const [reworkComments, setReworkComments] = useState<Record<number, string>>({});
  const [reworkErrors, setReworkErrors] = useState<Record<number, string>>({});
  const [actioningLedgerId, setActioningLedgerId] = useState<number | null>(null);
  const [actioningActionType, setActioningActionType] = useState<'APPROVED' | 'REWORK' | null>(null);

  // Bulk Approval State
  const [bulkApproving, setBulkApproving] = useState<boolean>(false);
  const [bulkActionMsg, setBulkActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Drill-down View Mode per Expanded Ledger: 'by_sub_department' | 'by_worker' | 'flat_table'
  // Drill-down View Mode (Global default & per Expanded Ledger): 'by_sub_department' | 'by_worker' | 'flat_table'
  // Hierarchy Display Mode: 'batch_wise' (Default) vs 'bundle_wise'
  const formatTicketDisplay = (exp: any): string => {
    if (!exp) return '-';
    if (exp.ticket_details?.work_order_no) return String(exp.ticket_details.work_order_no);
    if (exp.ticket_details?.ticket_code) return String(exp.ticket_details.ticket_code);
    if (exp.ticket_details?.ticket_id) return `${exp.ticket_details.ticket_id}`;
    if (typeof exp.ticket === 'object' && exp.ticket !== null) {
      return exp.ticket.work_order_no ? String(exp.ticket.work_order_no) : (exp.ticket.ticket_code ? String(exp.ticket.ticket_code) : (exp.ticket.ticket_id ? `${exp.ticket.ticket_id}` : '-'));
    }
    if (typeof exp.ticket === 'number' || typeof exp.ticket === 'string') {
      return String(exp.ticket);
    }
    return '-';
  };

  const getTicketForModal = (exp: any) => {
    if (!exp) return null;
    if (exp.ticket_details) return exp.ticket_details;
    if (typeof exp.ticket === 'object' && exp.ticket !== null) return exp.ticket;
    if (exp.ticket) return { ticket_id: exp.ticket };
    return null;
  };

  const [hierarchyGrouping, setHierarchyGrouping] = useState<'batch_wise' | 'bundle_wise'>('bundle_wise');
  const [expandedGroupBundleKeys, setExpandedGroupBundleKeys] = useState<Record<string, boolean>>({});

  const toggleExpandGroupBundle = (groupId: number | string, bundleId: number) => {
    const key = `${groupId}_${bundleId}`;
    setExpandedGroupBundleKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const [globalViewMode, setGlobalViewMode] = useState<'by_sub_department' | 'by_worker' | 'flat_table'>('by_sub_department');
  const [ledgerViewModes, setLedgerViewModes] = useState<Record<number, 'by_sub_department' | 'by_worker' | 'flat_table'>>({});

  // Sub-Department & Worker Accordion State inside Expanded Ledger (Default: Collapsed)
  const [expandedSubDepts, setExpandedSubDepts] = useState<Record<string, boolean>>({});
  const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({});
  const [expandedNestedWorkers, setExpandedNestedWorkers] = useState<Record<string, boolean>>({});
  const [expandedNestedSubDepts, setExpandedNestedSubDepts] = useState<Record<string, boolean>>({});

  const toggleSubDeptAccordion = (ledgerId: number, subDeptKey: string) => {
    const key = `${ledgerId}_${subDeptKey}`;
    setExpandedSubDepts(prev => {
      const willBeExpanded = !prev[key];
      // When collapsing parent sub-department, collapse all its child worker accordions
      if (!willBeExpanded) {
        setExpandedNestedWorkers(nestedPrev => {
          const updated = { ...nestedPrev };
          const prefix = `${ledgerId}_${subDeptKey}_`;
          Object.keys(updated).forEach(k => {
            if (k.startsWith(prefix)) {
              delete updated[k];
            }
          });
          return updated;
        });
      }
      return { ...prev, [key]: willBeExpanded };
    });
  };

  const toggleWorkerAccordion = (ledgerId: number, workerKey: string) => {
    const key = `${ledgerId}_${workerKey}`;
    setExpandedWorkers(prev => {
      const willBeExpanded = !prev[key];
      // When collapsing parent worker, collapse all its child sub-department accordions
      if (!willBeExpanded) {
        setExpandedNestedSubDepts(nestedPrev => {
          const updated = { ...nestedPrev };
          const prefix = `${ledgerId}_${workerKey}_`;
          Object.keys(updated).forEach(k => {
            if (k.startsWith(prefix)) {
              delete updated[k];
            }
          });
          return updated;
        });
      }
      return { ...prev, [key]: willBeExpanded };
    });
  };

  const toggleNestedWorkerAccordion = (ledgerId: number, subDeptKey: string, workerKey: string) => {
    const key = `${ledgerId}_${subDeptKey}_${workerKey}`;
    setExpandedNestedWorkers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleNestedSubDeptAccordion = (ledgerId: number, workerKey: string, subDeptKey: string) => {
    const key = `${ledgerId}_${workerKey}_${subDeptKey}`;
    setExpandedNestedSubDepts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Pagination State
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

  // Helper to find pending approval instance for a Ledger
  const getLedgerApproval = (ledgerId: number, fallbackLedger?: LedgerItem): ApprovalInstanceItem | undefined => {
    // 1. First check fallbackLedger or targetLedger's own embedded approval_history
    const targetLedger = fallbackLedger || (ledgers || []).find(l => l.ledger_id === ledgerId);
    const embeddedPending = (targetLedger as any)?.approval_history?.find((a: any) => a.status === 'Pending' || a.status === 'In Review');
    if (embeddedPending) {
      return embeddedPending;
    }

    // 2. Check full approvals list
    const allApprovals = approvalsProps?.approvals || [];
    const fromAll = allApprovals.find(a =>
      (a.ledger === ledgerId ||
        a.ledger_id === ledgerId ||
        (a.target_summary?.type === 'Ledger' && a.target_summary?.id === ledgerId) ||
        (a.workflow_entity_type?.toUpperCase() === 'LEDGER' && (a.ledger === ledgerId || a.ledger_id === ledgerId))) &&
      a.status === 'Pending'
    );
    if (fromAll) return fromAll;

    // 3. Fallback to displayed approvals
    const displayed = approvalsProps?.displayedApprovals || [];
    return displayed.find(a =>
      (a.ledger === ledgerId ||
        a.ledger_id === ledgerId ||
        (a.target_summary?.type === 'Ledger' && a.target_summary?.id === ledgerId) ||
        (a.workflow_entity_type?.toUpperCase() === 'LEDGER' && (a.ledger === ledgerId || a.ledger_id === ledgerId))) &&
      a.status === 'Pending'
    );
  };

  // Helper to check if current user can approve a Ledger strictly based on the pending approval step
  const canUserApproveLedger = (ledgerId: number, ledgerApp?: ApprovalInstanceItem, fallbackLedger?: LedgerItem): boolean => {
    const app = ledgerApp || getLedgerApproval(ledgerId, fallbackLedger);
    if (!app) return false;

    // 1. If backend evaluated can_action, trust it first
    if (app.can_action === true) return true;
    if (app.can_action === false) return false;

    // 2. Client-side evaluation against the current pending approval step ONLY
    const currentUsername = (currentUser?.username || '').toLowerCase().trim();
    const currentUserFullName = (currentUser?.full_name || '').toLowerCase().trim();
    const currentUserId = currentUser?.id ?? currentUser?.user_id;
    const userRoleStr = (
      (currentUser?.role as any)?.role_name ||
      (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
      ''
    ).toLowerCase().trim();

    // Check if the current pending step is User-wise (assigned to specific users)
    const pendingStepUserNames = (app.assigned_users_names || []).map((u: string) => String(u).toLowerCase().trim());
    const pendingStepUsernames = (app.assigned_users_usernames || []).map((u: string) => String(u).toLowerCase().trim());
    const pendingStepUserIds = (app.assigned_users_ids || []).map((id: any) => Number(id));

    if (pendingStepUserNames.length > 0 || pendingStepUsernames.length > 0 || pendingStepUserIds.length > 0) {
      const isUserAssigned = (
        (currentUserId && pendingStepUserIds.includes(Number(currentUserId))) ||
        (currentUsername && pendingStepUsernames.includes(currentUsername)) ||
        (currentUsername && pendingStepUserNames.includes(currentUsername)) ||
        (currentUserFullName && pendingStepUserNames.includes(currentUserFullName))
      );
      return Boolean(isUserAssigned);
    }

    // Check if the current pending step is Role-wise (assigned to a specific role)
    const assignedRoleStr = (app.assigned_role_name || '').toLowerCase().trim();
    if (assignedRoleStr) {
      return Boolean(userRoleStr && userRoleStr === assignedRoleStr);
    }

    // Fallback: If no users and no roles are assigned on the step, only superusers can action
    if (currentUser?.is_superuser) {
      return true;
    }

    return false;
  };

  // Inline Ledger Approval Action (Approve / Rework)
  const handleInlineLedgerAction = async (ledger: LedgerItem, action: 'APPROVED' | 'REWORK') => {
    const app = getLedgerApproval(ledger.ledger_id);
    const comment = reworkComments[ledger.ledger_id] || '';

    if (action === 'REWORK' && !comment.trim()) {
      setReworkErrors(prev => ({ ...prev, [ledger.ledger_id]: 'Comment is required for rework.' }));
      return;
    }
    setReworkErrors(prev => ({ ...prev, [ledger.ledger_id]: '' }));

    if (app && approvalsProps?.handleActionApproval) {
      setActioningLedgerId(ledger.ledger_id);
      setActioningActionType(action);
      try {
        await approvalsProps.handleActionApproval(action, comment, app);
        setReworkComments(prev => ({ ...prev, [ledger.ledger_id]: '' }));
      } finally {
        setActioningLedgerId(null);
        setActioningActionType(null);
      }
    } else if (approvalsProps?.setShowApprovalModal && app) {
      approvalsProps.setApprovalAction(action as any);
      approvalsProps.setApprovalComments(comment);
      approvalsProps.setShowApprovalModal(app);
    }
  };

  interface GroupBundleBreakdownItem {
    bundleId: number;
    workerName: string;
    workerUsername?: string;
    workerDetail?: any;
    profileImage?: string | null;
    periodFrom?: string;
    periodTo?: string;
    status?: string;
    totalAmount: number;
    expenses: ExpenseItem[];
    ledgerBatches: { batchId?: number; batchName: string; count: number; amount: number }[];
    bundleObj?: any;
  }

  const getGroupBundleBreakdown = (cluster: LedgerGroupCluster): GroupBundleBreakdownItem[] => {
    const bundleMap = new Map<number, GroupBundleBreakdownItem>();

    cluster.ledgers.forEach(l => {
      const batchName = l.ledger_batch_detail?.batch_name || `Batch ${l.ledger_id}`;
      const batchId = (l.ledger_batch_detail as any)?.batch_id || (l.ledger_batch_detail as any)?.id || l.ledger_batch;
      const lExpenses = Array.isArray(l.expenses) ? l.expenses : [];

      (l.bundles || []).forEach((b: any) => {
        const bId = b.claim_id || b.id;
        if (bId && !bundleMap.has(bId)) {
          const wObj = b.worker_detail || (typeof b.worker === 'object' ? b.worker : null);
          const matchingBundle = (bundles || []).find(mb => (mb.claim_id || (mb as any).id) === bId);
          const bStatus = (l.status === 'Paid' || cluster.isPaid) ? 'Paid' : (matchingBundle?.status || b.status || 'Approved');
          bundleMap.set(bId, {
            bundleId: bId,
            workerName: wObj?.full_name || wObj?.username || `Worker ${b.worker}`,
            workerUsername: wObj?.username,
            workerDetail: wObj,
            profileImage: wObj?.profile_image || null,
            periodFrom: b.period_from,
            periodTo: b.period_to,
            status: bStatus,
            totalAmount: 0,
            expenses: [],
            ledgerBatches: [],
            bundleObj: matchingBundle || b
          });
        }
      });

      lExpenses.forEach(exp => {
        const rawClaim = exp.claim || (exp as any).claim_id || (exp as any).bundle_id;
        const bId = typeof rawClaim === 'number'
          ? rawClaim
          : (rawClaim?.claim_id || (l.bundles && (l.bundles[0] as any)?.claim_id) || (l.bundles && (l.bundles[0] as any)?.id) || 0);

        if (bId) {
          if (!bundleMap.has(bId)) {
            const matchingBundle = (bundles || []).find(b => b.claim_id === bId);
            const wObj = matchingBundle?.worker_detail || (exp as any).worker_detail || (typeof exp.worker === 'object' ? exp.worker : null);
            const bStatus = (l.status === 'Paid' || cluster.isPaid) ? 'Paid' : (matchingBundle?.status || 'Approved');
            bundleMap.set(bId, {
              bundleId: bId,
              workerName: wObj?.full_name || wObj?.username || (exp as any).worker_name || 'Worker',
              workerUsername: wObj?.username,
              workerDetail: wObj,
              profileImage: wObj?.profile_image || null,
              periodFrom: matchingBundle?.period_from,
              periodTo: matchingBundle?.period_to,
              status: bStatus,
              totalAmount: 0,
              expenses: [],
              ledgerBatches: [],
              bundleObj: matchingBundle || { claim_id: bId, total_claimed_amount: String(exp.amount), worker_detail: wObj, status: bStatus }
            });
          }

          const bundleObj = bundleMap.get(bId)!;
          if (!bundleObj.expenses.some(e => e.expense_id === exp.expense_id)) {
            bundleObj.expenses.push(exp);
            bundleObj.totalAmount += parseFloat(exp.amount as any) || 0;

            let bBatch = bundleObj.ledgerBatches.find(bb => bb.batchName === batchName);
            if (!bBatch) {
              bBatch = { batchId, batchName, count: 0, amount: 0 };
              bundleObj.ledgerBatches.push(bBatch);
            }
            bBatch.count += 1;
            bBatch.amount += parseFloat(exp.amount as any) || 0;
          }
        }
      });
    });

    return Array.from(bundleMap.values()).sort((a, b) => b.bundleId - a.bundleId);
  };

  // Approval Stepper Pipeline Renderer for Ledger  (Sleek, Flat)
  const renderGroupApprovalStepper = (cluster: LedgerGroupCluster) => {
    const ledgerIds = new Set(cluster.ledgers.map(l => l.ledger_id));
    const instancesFromProps = (approvalsProps?.approvals || []).filter(a => {
      const aLedger = a.ledger ?? a.ledger_id;
      if (aLedger !== undefined && ledgerIds.has(aLedger)) return true;
      if (a.target_summary?.type === 'Ledger' && a.target_summary?.id !== undefined && ledgerIds.has(a.target_summary.id)) return true;
      if (a.workflow_entity_type?.toUpperCase() === 'LEDGER' && aLedger !== undefined && ledgerIds.has(aLedger)) return true;
      return false;
    });

    const instancesFromHistory = cluster.ledgers.flatMap(l => ((l as any).approval_history || (l as any).approval_instances || []));

    // Combine unique instances (prefer fresh approval_history on the ledger over background approvalsProps)
    const allInstancesMap = new Map<string | number, ApprovalInstanceItem>();
    [...instancesFromProps, ...instancesFromHistory].forEach((inst: any) => {
      if (inst && (inst.instance_id || inst.approval_id || inst.id || inst.step_name)) {
        const key = inst.instance_id || inst.approval_id || inst.id || `${inst.ledger || ''}_${inst.step_name}_${inst.step_order}`;
        allInstancesMap.set(key, inst);
      }
    });
    const allInstances = Array.from(allInstancesMap.values());

    let steps: ApprovalStepInfo[] = [];
    for (const item of allInstances) {
      if (item.workflow_steps && item.workflow_steps.length > 0) {
        steps = item.workflow_steps;
        break;
      }
    }

    if (steps.length === 0 && approvalsProps?.approvals) {
      const matchAny = approvalsProps.approvals.find(a =>
        a.workflow_steps && a.workflow_steps.length > 0 &&
        (a.target_summary?.type === 'Ledger' || a.ledger || a.workflow_entity_type?.toUpperCase() === 'LEDGER')
      );
      if (matchAny?.workflow_steps) {
        steps = matchAny.workflow_steps;
      }
    }

    if (steps.length === 0 && allInstances.length > 0) {
      const stepNamesSeen = new Set<string>();
      allInstances.forEach(i => {
        if (i.step_name && !stepNamesSeen.has(i.step_name)) {
          stepNamesSeen.add(i.step_name);
          steps.push({
            step_id: steps.length + 1,
            step_order: (typeof i.step_order === 'number' ? i.step_order : steps.length + 1),
            step_name: i.step_name,
            assigned_role_name: i.assigned_role_name || ''
          });
        }
      });
    }

    // Reliable fallback steps if workflow steps not yet loaded
    if (steps.length === 0) {
      steps = [
        {
          step_id: 1,
          step_order: 1,
          step_name: 'Department Manager Approval',
          assigned_role_name: 'Manager'
        },
        {
          step_id: 2,
          step_order: 2,
          step_name: 'Finance Review & Disbursement',
          assigned_role_name: 'Finance'
        }
      ];
    }

    const isGroupPaid = cluster.isPaid || (cluster.ledgers.length > 0 && cluster.ledgers.every(l => l.status === 'Paid'));
    const isDraft = cluster.ledgers.every(l => l.status === 'Draft') || (cluster.ledgers.length === 0);
    const hasReworkOrRejectedOrReview = cluster.ledgers.some(l => l.status === 'Rework' || l.status === 'Rejected' || l.status === 'In Review' || l.status === 'Submitted' || l.status === 'Draft');
    const isFinished = !hasReworkOrRejectedOrReview && (cluster.allApproved || cluster.isCompleted || (cluster.ledgers.length > 0 && cluster.ledgers.every(l => l.status === 'Approved' || l.status === 'Paid')));
    const activePendingItem = allInstances.find(i => i.status === 'Pending');
    const activePendingOrder: number = (activePendingItem && typeof activePendingItem.step_order === 'number')
      ? activePendingItem.step_order
      : (isFinished ? steps.length + 1 : (isDraft ? 0 : 1));

    return (
      <div className="py-2 px-1 overflow-x-auto">
        <div className="flex items-start justify-between min-w-[700px]">
          {/* START NODE */}
          <div className="flex flex-col items-center shrink-0 w-16">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border shrink-0 ${isDraft
              ? 'bg-surface-container text-on-surface-variant border-outline-variant/80'
              : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
              }`}>
              {isDraft ? '1' : <Check className="w-3 h-3" />}
            </div>
            <span className="text-[9px] text-on-surface-variant mt-1 font-medium text-center">
              {isDraft ? 'Draft' : 'Submitted'}
            </span>
          </div>

          {/* STEP NODES */}
          {steps.map((step, idx) => {
            const stepOrderNum = typeof step.step_order === 'number' ? step.step_order : (idx + 1);
            const matchingStepInstances = allInstances.filter(i => i.step_name === step.step_name || i.step_order === step.step_order);
            // Sort matching instances so the latest (or Rework/Rejected/Pending when group has rework) wins
            const stepInst = matchingStepInstances.length > 0
              ? [...matchingStepInstances].sort((a: any, b: any) => {
                  const groupHasRework = cluster.ledgers.some(l => l.status === 'Rework');
                  if (groupHasRework) {
                    if (a.status === 'Rework' && b.status !== 'Rework') return 1;
                    if (b.status === 'Rework' && a.status !== 'Rework') return -1;
                  }
                  const idA = Number(a.instance_id || a.approval_id || a.id || 0);
                  const idB = Number(b.instance_id || b.approval_id || b.id || 0);
                  if (idA !== idB) return idA - idB;
                  const timeA = a.actioned_at ? new Date(a.actioned_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                  const timeB = b.actioned_at ? new Date(b.actioned_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                  return timeA - timeB;
                })[matchingStepInstances.length - 1]
              : undefined;
            const isApproved = isFinished || (stepInst && stepInst.status === 'Approved') || (!isDraft && stepOrderNum < activePendingOrder && !stepInst);
            const isPending = !isFinished && !isDraft && ((stepInst && stepInst.status === 'Pending') || (!stepInst && stepOrderNum === activePendingOrder));
            const isRejected = !isDraft && (stepInst && stepInst.status === 'Rejected');
            const isRework = !isDraft && (stepInst && stepInst.status === 'Rework');
            const isUpcoming = !isApproved && !isPending && !isRejected && !isRework;

            let circleClass = "bg-surface-container-high text-on-surface-variant border-outline";
            let labelBadge = step.assigned_role_name;
            let iconNode: React.ReactNode = stepOrderNum;

            const actionUserDisplay = stepInst?.action_by_full_name || stepInst?.action_by_username || '';

            if (isApproved) {
              circleClass = "bg-emerald-500 text-white border-emerald-600 font-bold shadow-xs";
              iconNode = <Check className="w-3 h-3" />;
              labelBadge = actionUserDisplay ? `Approved: ${actionUserDisplay}` : `Approved (${labelBadge || 'Step ' + stepOrderNum})`;
            } else if (isPending) {
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-xs ring-2 ring-amber-500/30";
              iconNode = stepOrderNum;
              labelBadge = `Pending: ${labelBadge || 'Step ' + stepOrderNum}`;
            } else if (isRejected) {
              circleClass = "bg-rose-600 text-white border-rose-700 font-bold shadow-xs";
              iconNode = <X className="w-3 h-3" />;
              labelBadge = `Rejected: ${actionUserDisplay || 'User'}`;
            } else if (isRework) {
              circleClass = "bg-purple-600 text-white border-purple-700 font-bold shadow-xs";
              iconNode = <RotateCcw className="w-3 h-3" />;
              labelBadge = `Rework: ${actionUserDisplay || 'User'}`;
            } else if (isUpcoming) {
              circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
              iconNode = stepOrderNum;
              labelBadge = `Upcoming (${labelBadge || 'Step ' + stepOrderNum})`;
            }

            const isPrevCompleted = idx === 0 ? (!isDraft) : (isFinished || (!isDraft && stepOrderNum <= activePendingOrder));

            return (
              <React.Fragment key={step.step_id || idx}>
                <div className={`flex-1 h-0.5 mx-1 mt-2.5 transition-colors ${isPrevCompleted && (isApproved || isPending) ? 'bg-emerald-500' : 'bg-outline-variant'}`} />
                <div className="flex flex-col items-center shrink-0 w-24 text-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border transition-all ${circleClass}`}>
                    {iconNode}
                  </div>
                  <span className="text-[9px] font-bold text-on-surface mt-1 truncate max-w-full" title={step.step_name}>
                    {step.step_name}
                  </span>
                  <span className="text-[8px] text-on-surface-variant truncate max-w-full font-medium" title={labelBadge}>
                    {labelBadge}
                  </span>
                </div>
              </React.Fragment>
            );
          })}

          {/* FINAL CASH OFFICE NODE (VISUAL STEPPER FINAL STAGE) */}
          {(() => {
            const isCashOfficeCompleted = isGroupPaid;
            const isCashOfficePending = !isDraft && isFinished && !isGroupPaid;
            const isCashOfficeUpcoming = !isFinished;

            let circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
            let labelBadge = "Cash Office";
            let iconNode: React.ReactNode = <Banknote className="w-3 h-3 opacity-60" />;

            if (isCashOfficeCompleted) {
              circleClass = "bg-teal-600 text-white border-teal-700 font-bold shadow-xs";
              iconNode = <Check className="w-3 h-3" />;
              labelBadge = "Paid / Settled";
            } else if (isCashOfficePending) {
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-xs ring-2 ring-amber-500/30";
              iconNode = <Banknote className="w-3 h-3" />;
              labelBadge = "Pending Settlement";
            } else if (isCashOfficeUpcoming) {
              circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
              iconNode = <Banknote className="w-3 h-3 opacity-60" />;
              labelBadge = "Upcoming";
            }

            const isConnectorActive = isFinished && !isDraft;

            return (
              <React.Fragment key="final-cash-office-node">
                <div className={`flex-1 h-0.5 mx-1 mt-2.5 transition-colors ${isConnectorActive ? (isCashOfficeCompleted ? 'bg-teal-500' : 'bg-emerald-500') : 'bg-outline-variant'}`} />
                <div className="flex flex-col items-center shrink-0 w-24 text-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border transition-all ${circleClass}`}>
                    {iconNode}
                  </div>
                  <span className="text-[9px] font-bold text-on-surface mt-1 truncate max-w-full" title="Cash Office Settlement">
                    Cash Office
                  </span>
                  <span className="text-[8px] text-on-surface-variant truncate max-w-full font-medium" title={labelBadge}>
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

  // Grouping Helpers for Flat Hierarchical View
  const getSubDepartmentBreakdown = (expenses: ExpenseItem[]) => {
    const subDeptMap = new Map<string, {
      subDeptId: number | string;
      subDeptName: string;
      expenses: ExpenseItem[];
      totalAmount: number;
      workersCount: number;
      workers: Array<{
        workerId: number | string;
        workerName: string;
        employeeNo?: string;
        workerObj?: any;
        profileImage?: string | null;
        expenses: ExpenseItem[];
        totalAmount: number;
      }>;
    }>();

    for (const exp of expenses) {
      const sdId = exp.ticket_details?.sub_department_id ?? exp.sub_department_id ?? 'unassigned';
      const sdName = exp.ticket_details?.sub_department_name ?? exp.sub_department_name ?? 'General Sub-Department';
      const key = String(sdId);

      if (!subDeptMap.has(key)) {
        subDeptMap.set(key, {
          subDeptId: sdId,
          subDeptName: sdName,
          expenses: [],
          totalAmount: 0,
          workersCount: 0,
          workers: [],
        });
      }
      const entry = subDeptMap.get(key)!;
      entry.expenses.push(exp);
      entry.totalAmount += parseFloat(exp.amount || '0');
    }

    // Calculate nested workers per sub-department
    subDeptMap.forEach(sd => {
      const workerMap = new Map<string, {
        workerId: number | string;
        workerName: string;
        employeeNo?: string;
        workerObj?: any;
        profileImage?: string | null;
        expenses: ExpenseItem[];
        totalAmount: number;
      }>();

      sd.expenses.forEach(e => {
        const workerObj = (typeof e.worker === 'object' && e.worker !== null ? e.worker : null) || e.worker_detail;
        const workerId = workerObj?.user_id || workerObj?.id || (typeof e.worker === 'number' ? e.worker : (typeof e.worker === 'string' ? e.worker : 'unassigned'));
        const workerName = workerObj?.full_name || workerObj?.username || (typeof e.worker === 'object' && e.worker !== null ? (e.worker.full_name || e.worker.username) : '') || (e.worker ? `Worker ${e.worker}` : 'Technician');
        const empNo = workerObj?.employee_no || (typeof e.worker === 'object' ? e.worker?.employee_no : undefined);
        const profImg = workerObj?.profile_image || (typeof e.worker === 'object' ? e.worker?.profile_image : null) || null;
        const wKey = String(workerId);

        if (!workerMap.has(wKey)) {
          workerMap.set(wKey, {
            workerId,
            workerName,
            employeeNo: empNo,
            workerObj,
            profileImage: profImg,
            expenses: [],
            totalAmount: 0,
          });
        }
        const wEntry = workerMap.get(wKey)!;
        wEntry.expenses.push(e);
        wEntry.totalAmount += parseFloat(e.amount || '0');
      });

      sd.workers = Array.from(workerMap.values());
      sd.workersCount = Math.max(sd.workers.length, 1);
    });

    return Array.from(subDeptMap.values());
  };

  const getWorkerBreakdown = (expenses: ExpenseItem[]) => {
    const workerMap = new Map<string, {
      workerId: number | string;
      workerName: string;
      employeeNo?: string;
      workerObj?: any;
      profileImage?: string | null;
      expenses: ExpenseItem[];
      totalAmount: number;
      subDeptsCount: number;
      subDepartments: Array<{
        subDeptId: number | string;
        subDeptName: string;
        expenses: ExpenseItem[];
        totalAmount: number;
      }>;
    }>();

    for (const exp of expenses) {
      const workerObj = (typeof exp.worker === 'object' && exp.worker !== null ? exp.worker : null) || exp.worker_detail;
      const workerId = workerObj?.user_id || workerObj?.id || (typeof exp.worker === 'number' ? exp.worker : (typeof exp.worker === 'string' ? exp.worker : 'unassigned'));
      const workerName = workerObj?.full_name || workerObj?.username || (typeof exp.worker === 'object' && exp.worker !== null ? (exp.worker.full_name || exp.worker.username) : '') || (exp.worker ? `Worker ${exp.worker}` : 'Technician');
      const empNo = workerObj?.employee_no || (typeof exp.worker === 'object' ? exp.worker?.employee_no : undefined);
      const profImg = workerObj?.profile_image || (typeof exp.worker === 'object' ? exp.worker?.profile_image : null) || null;
      const key = String(workerId);

      if (!workerMap.has(key)) {
        workerMap.set(key, {
          workerId,
          workerName,
          employeeNo: empNo,
          workerObj,
          profileImage: profImg,
          expenses: [],
          totalAmount: 0,
          subDeptsCount: 0,
          subDepartments: [],
        });
      }
      const entry = workerMap.get(key)!;
      entry.expenses.push(exp);
      entry.totalAmount += parseFloat(exp.amount || '0');
    }

    // Calculate nested sub-departments per worker
    workerMap.forEach(w => {
      const sdMap = new Map<string, {
        subDeptId: number | string;
        subDeptName: string;
        expenses: ExpenseItem[];
        totalAmount: number;
      }>();

      w.expenses.forEach(e => {
        const sdId = e.ticket_details?.sub_department_id ?? e.sub_department_id ?? 'unassigned';
        const sdName = e.ticket_details?.sub_department_name ?? e.sub_department_name ?? 'General Sub-Department';
        const sdKey = String(sdId);

        if (!sdMap.has(sdKey)) {
          sdMap.set(sdKey, {
            subDeptId: sdId,
            subDeptName: sdName,
            expenses: [],
            totalAmount: 0,
          });
        }
        const sdEntry = sdMap.get(sdKey)!;
        sdEntry.expenses.push(e);
        sdEntry.totalAmount += parseFloat(e.amount || '0');
      });

      w.subDepartments = Array.from(sdMap.values());
      w.subDeptsCount = Math.max(w.subDepartments.length, 1);
    });

    return Array.from(workerMap.values());
  };

  const allGroupedLedgerClusters = useMemo<LedgerGroupCluster[]>(() => {
    const map = new Map<string | number, LedgerGroupCluster>();

    for (const l of filteredLedgers) {
      const gId = l.ledger_group_detail?.ledger_group_id || l.ledger_group || `ungrouped_${l.ledger_id}`;
      const matchedDynGroup = dynamicGroups?.find(g => String(g.ledger_group_id) === String(gId))
        || ledgerGroups?.find(g => String(g.ledger_group_id) === String(gId));
      const gDetail = l.ledger_group_detail || matchedDynGroup;
      const gName = gDetail?.group_name || `Ledger ${gId}`;
      const cName = l.created_by_detail?.full_name || l.created_by_detail?.username || 'User';
      const cAt = l.created_at || '';
      const isComp = Boolean(gDetail?.is_completed || matchedDynGroup?.is_completed);
      const compAt = gDetail?.completed_at || matchedDynGroup?.completed_at;
      const compByName = gDetail?.completed_by_detail?.full_name || gDetail?.completed_by_detail?.username
        || matchedDynGroup?.completed_by_detail?.full_name || matchedDynGroup?.completed_by_detail?.username;

      const isPaid = Boolean(gDetail?.is_paid || matchedDynGroup?.is_paid);
      const paidAt = gDetail?.paid_at || matchedDynGroup?.paid_at;
      const paidByName = gDetail?.paid_by_detail?.full_name || gDetail?.paid_by_detail?.username
        || matchedDynGroup?.paid_by_detail?.full_name || matchedDynGroup?.paid_by_detail?.username;
      const paymentMethod = gDetail?.payment_method || matchedDynGroup?.payment_method;
      const paymentReference = gDetail?.payment_reference || matchedDynGroup?.payment_reference;
      const paymentRemarks = gDetail?.payment_remarks || matchedDynGroup?.payment_remarks;
      const recipientName = gDetail?.recipient_name || matchedDynGroup?.recipient_name;

      if (!map.has(gId)) {
        map.set(gId, {
          groupId: gId,
          groupName: gName,
          createdByName: cName,
          createdAt: cAt,
          isCompleted: isComp || isPaid,
          completedAt: compAt,
          completedByName: compByName,
          isPaid: isPaid,
          paidAt: paidAt,
          paidByName: paidByName,
          paymentMethod: paymentMethod,
          paymentReference: paymentReference,
          paymentRemarks: paymentRemarks,
          recipientName: recipientName,
          ledgers: [],
          totalAmount: 0,
          totalBundlesCount: 0,
          totalExpensesCount: 0,
          totalWorkersCount: 0,
          allApproved: false,
          approvedCount: 0,
          totalCount: 0,
        });
      }

      const cluster = map.get(gId)!;
      cluster.ledgers.push(l);
      if (isComp) {
        cluster.isCompleted = true;
        if (compAt) cluster.completedAt = compAt;
        if (compByName) cluster.completedByName = compByName;
      }
      if (isPaid) {
        cluster.isPaid = true;
        cluster.isCompleted = true;
        if (paidAt) cluster.paidAt = paidAt;
        if (paidByName) cluster.paidByName = paidByName;
        if (paymentMethod) cluster.paymentMethod = paymentMethod;
        if (paymentReference) cluster.paymentReference = paymentReference;
        if (paymentRemarks) cluster.paymentRemarks = paymentRemarks;
        if (recipientName) cluster.recipientName = recipientName;
      }
      cluster.totalAmount += parseFloat(l.total_amount || '0');
    }

    // Compute approval, payment stats, deduplicated counts & unique workers
    for (const cluster of map.values()) {
      cluster.totalCount = cluster.ledgers.length;
      cluster.approvedCount = cluster.ledgers.filter(l => l.status === 'Approved' || l.status === 'Paid').length;
      cluster.allApproved = cluster.totalCount > 0 && cluster.approvedCount === cluster.totalCount;
      if (cluster.ledgers.some(l => l.status === 'Rework' || l.status === 'Rejected' || l.status === 'In Review' || l.status === 'Submitted' || l.status === 'Draft')) {
        if (!cluster.isPaid) {
          cluster.isCompleted = false;
        }
      }
      if (cluster.totalCount > 0 && cluster.ledgers.every(l => l.status === 'Paid')) {
        cluster.isPaid = true;
        cluster.isCompleted = true;
      }
      if (cluster.isPaid) {
        cluster.isCompleted = true;
      }

      // Deduplicate distinct bundles across ledgers in the group
      const bundleIdSet = new Set<string | number>();
      for (const l of cluster.ledgers) {
        for (const b of (l.bundles || [])) {
          const bId = b.claim_id ?? (b as any).id;
          if (bId != null) bundleIdSet.add(bId);
        }
      }
      cluster.totalBundlesCount = bundleIdSet.size > 0
        ? bundleIdSet.size
        : cluster.ledgers.reduce((acc, l) => acc + (l.bundles?.length || 0), 0);

      // Deduplicate distinct expenses across direct expenses and bundle expenses
      const expenseIdSet = new Set<string | number>();
      let noIdExpenses = 0;
      for (const l of cluster.ledgers) {
        for (const exp of (l.expenses || [])) {
          const id = exp.expense_id ?? (exp as any).id;
          if (id != null) expenseIdSet.add(id);
          else noIdExpenses++;
        }
        for (const b of (l.bundles || [])) {
          for (const exp of (b.expenses || [])) {
            const id = exp.expense_id ?? (exp as any).id;
            if (id != null) expenseIdSet.add(id);
            else noIdExpenses++;
          }
        }
      }
      cluster.totalExpensesCount = (expenseIdSet.size + noIdExpenses) > 0
        ? (expenseIdSet.size + noIdExpenses)
        : cluster.ledgers.reduce((acc, l) => acc + (l.expenses?.length || 0), 0);

      // Compute unique workers across all bundles and expenses
      const workerSet = new Set<string | number>();
      for (const l of cluster.ledgers) {
        for (const b of (l.bundles || [])) {
          const wObj = (typeof b.worker === 'object' && b.worker ? b.worker : null) || b.worker_detail;
          const wId = getUserId(wObj) ?? getUserId(b.worker);
          const wKey = wId != null ? wId : (wObj?.username || wObj?.full_name || (b.worker ? String(b.worker) : null));
          if (wKey) workerSet.add(wKey);

          for (const exp of (b.expenses || [])) {
            const expWObj = (typeof exp.worker === 'object' && exp.worker ? exp.worker : null) || exp.worker_detail;
            const expWId = getUserId(expWObj) ?? getUserId(exp.worker);
            const expKey = expWId != null ? expWId : (expWObj?.username || expWObj?.full_name || (exp.worker ? String(exp.worker) : null));
            if (expKey) workerSet.add(expKey);
          }
        }

        for (const exp of (l.expenses || [])) {
          const expWObj = (typeof exp.worker === 'object' && exp.worker ? exp.worker : null) || exp.worker_detail;
          const expWId = getUserId(expWObj) ?? getUserId(exp.worker);
          const expKey = expWId != null ? expWId : (expWObj?.username || expWObj?.full_name || (exp.worker ? String(exp.worker) : null));
          if (expKey) workerSet.add(expKey);
        }
      }
      cluster.totalWorkersCount = workerSet.size;
    }

    return Array.from(map.values());
  }, [filteredLedgers, dynamicGroups, ledgerGroups]);

  // Sort States & Handlers
  type MainSortField = 'ledger' | 'bundles' | 'expenses' | 'created_by' | 'total_amount' | 'status';
  const [mainSortField, setMainSortField] = useState<MainSortField | null>(null);
  const [mainSortDirection, setMainSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleMainSort = (field: MainSortField) => {
    if (mainSortField === field) {
      if (mainSortDirection === 'asc') {
        setMainSortDirection('desc');
      } else {
        setMainSortField(null);
        setMainSortDirection('asc');
      }
    } else {
      setMainSortField(field);
      setMainSortDirection('asc');
    }
  };

  type BundleSortField = 'bundle_id' | 'claim_bundle' | 'batches' | 'expenses' | 'worker' | 'bundle_total';
  const [bundleSortField, setBundleSortField] = useState<BundleSortField | null>(null);
  const [bundleSortDirection, setBundleSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleBundleSort = (field: BundleSortField) => {
    if (bundleSortField === field) {
      if (bundleSortDirection === 'asc') {
        setBundleSortDirection('desc');
      } else {
        setBundleSortField(null);
        setBundleSortDirection('asc');
      }
    } else {
      setBundleSortField(field);
      setBundleSortDirection('asc');
    }
  };

  type ExpenseSortField = 'exp' | 'description' | 'target_batch' | 'sub_department' | 'ticket' | 'category' | 'date' | 'amount';
  const [expenseSortField, setExpenseSortField] = useState<ExpenseSortField | null>(null);
  const [expenseSortDirection, setExpenseSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleExpenseSort = (field: ExpenseSortField) => {
    if (expenseSortField === field) {
      if (expenseSortDirection === 'asc') {
        setExpenseSortDirection('desc');
      } else {
        setExpenseSortField(null);
        setExpenseSortDirection('asc');
      }
    } else {
      setExpenseSortField(field);
      setExpenseSortDirection('asc');
    }
  };

  const renderSortIndicator = (
    currentField: string | null,
    targetField: string,
    direction: 'asc' | 'desc'
  ) => {
    if (currentField !== targetField) {
      return (
        <ArrowUpDown className="w-3 h-3 text-on-surface-variant/40 group-hover:text-on-surface-variant inline-block ml-1 transition-colors" />
      );
    }
    return direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-primary inline-block ml-1 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary inline-block ml-1 font-bold" />
    );
  };

  const getClusterStatus = (c: LedgerGroupCluster): string => {
    if (c.isPaid || (c.ledgers.length > 0 && c.ledgers.every(l => l.status === 'Paid'))) return 'Paid';
    if (c.ledgers.some(l => l.status === 'Rework')) return 'Rework';
    if (c.ledgers.some(l => l.status === 'In Review' || l.status === 'Submitted')) return 'In Review';
    if (c.ledgers.some(l => l.status === 'Rejected')) return 'Rejected';
    if (c.isCompleted || (c.ledgers.length > 0 && c.ledgers.every(l => l.status === 'Approved' || l.status === 'Paid'))) return 'Approved';
    return 'Draft';
  };

  const sortedGroupedLedgerClusters = useMemo(() => {
    if (!mainSortField) return allGroupedLedgerClusters;
    return [...allGroupedLedgerClusters].sort((a, b) => {
      let comparison = 0;
      switch (mainSortField) {
        case 'ledger':
          comparison = (a.groupName || '').localeCompare(b.groupName || '', undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'bundles': {
          const countA = a.totalBundlesCount ?? a.ledgers.length;
          const countB = b.totalBundlesCount ?? b.ledgers.length;
          comparison = countA - countB;
          break;
        }
        case 'expenses': {
          const countA = a.totalExpensesCount ?? a.ledgers.reduce((sum, l) => sum + (Array.isArray(l.expenses) ? l.expenses.length : 0), 0);
          const countB = b.totalExpensesCount ?? b.ledgers.reduce((sum, l) => sum + (Array.isArray(l.expenses) ? l.expenses.length : 0), 0);
          comparison = countA - countB;
          break;
        }
        case 'created_by': {
          const nameA = a.createdByName || '';
          const nameB = b.createdByName || '';
          comparison = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'total_amount':
          comparison = a.totalAmount - b.totalAmount;
          break;
        case 'status': {
          comparison = getClusterStatus(a).localeCompare(getClusterStatus(b));
          break;
        }
      }
      return mainSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [allGroupedLedgerClusters, mainSortField, mainSortDirection]);

  const totalItemsCount = propTotalItems !== undefined ? propTotalItems : sortedGroupedLedgerClusters.length;

  useEffect(() => {
    setLocalPage(1);
  }, [sortedGroupedLedgerClusters.length]);

  const groupedLedgerClusters = useMemo<LedgerGroupCluster[]>(() => {
    if (isServerPaginated) return sortedGroupedLedgerClusters;
    const start = (currentPage - 1) * itemsPerPage;
    return sortedGroupedLedgerClusters.slice(start, start + itemsPerPage);
  }, [isServerPaginated, sortedGroupedLedgerClusters, currentPage, itemsPerPage]);

  const getSortedGroupBundleBreakdown = (cluster: LedgerGroupCluster): GroupBundleBreakdownItem[] => {
    const list = getGroupBundleBreakdown(cluster);
    if (!bundleSortField) return list;
    return [...list].sort((a, b) => {
      let comparison = 0;
      switch (bundleSortField) {
        case 'bundle_id':
        case 'claim_bundle':
          comparison = a.bundleId - b.bundleId;
          break;
        case 'batches':
          comparison = a.ledgerBatches.length - b.ledgerBatches.length;
          break;
        case 'expenses':
          comparison = a.expenses.length - b.expenses.length;
          break;
        case 'worker':
          comparison = (a.workerName || '').localeCompare(b.workerName || '', undefined, { sensitivity: 'base' });
          break;
        case 'bundle_total':
          comparison = a.totalAmount - b.totalAmount;
          break;
      }
      return bundleSortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const getSortedBundleExpenses = (bundleItem: GroupBundleBreakdownItem) => {
    if (!expenseSortField) return bundleItem.expenses;
    return [...bundleItem.expenses].sort((a, b) => {
      let comparison = 0;
      switch (expenseSortField) {
        case 'exp':
          comparison = a.expense_id - b.expense_id;
          break;
        case 'description': {
          const descA = a.remarks || a.ticket_details?.title || (a as any).description || '';
          const descB = b.remarks || b.ticket_details?.title || (b as any).description || '';
          comparison = descA.localeCompare(descB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'target_batch': {
          const getBatch = (exp: ExpenseItem) => {
            return bundleItem.ledgerBatches.find(bb => {
              const batchObj = (ledgerBatches || internalBatches || []).find(bItem => bItem.batch_name === bb.batchName);
              const sds = (batchObj?.sub_departments || []).map(sd => typeof sd === 'number' ? sd : (sd as any).sub_department_id);
              const expSdId = exp.ticket_details?.sub_department_id ?? exp.sub_department_id;
              return expSdId && sds.includes(Number(expSdId));
            })?.batchName || bundleItem.ledgerBatches[0]?.batchName || 'Unassigned';
          };
          comparison = getBatch(a).localeCompare(getBatch(b), undefined, { sensitivity: 'base' });
          break;
        }
        case 'sub_department': {
          const sdA = a.ticket_details?.sub_department_name || (a as any).sub_department_name || '';
          const sdB = b.ticket_details?.sub_department_name || (b as any).sub_department_name || '';
          comparison = sdA.localeCompare(sdB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'ticket': {
          const tA = formatTicketDisplay(a);
          const tB = formatTicketDisplay(b);
          comparison = tA.localeCompare(tB, undefined, { numeric: true });
          break;
        }
        case 'category': {
          const getCat = (exp: ExpenseItem) =>
            exp.expense_type_detail?.expense_name ||
            (typeof exp.expense_type === 'object' && exp.expense_type ? exp.expense_type.expense_name : ((exp as any).expense_type_name || (exp as any).category_name || ''));
          comparison = getCat(a).localeCompare(getCat(b), undefined, { sensitivity: 'base' });
          break;
        }
        case 'date': {
          const timeA = a.expense_date ? new Date(a.expense_date).getTime() : 0;
          const timeB = b.expense_date ? new Date(b.expense_date).getTime() : 0;
          comparison = timeA - timeB;
          break;
        }
        case 'amount':
          comparison = parseFloat(a.amount || '0') - parseFloat(b.amount || '0');
          break;
      }
      return expenseSortDirection === 'asc' ? comparison : -comparison;
    });
  };

  type FlatExpenseSortField = 'exp' | 'description' | 'ticket' | 'category' | 'date' | 'source_bundle' | 'amount';
  const [flatExpenseSortField, setFlatExpenseSortField] = useState<FlatExpenseSortField | null>(null);
  const [flatExpenseSortDirection, setFlatExpenseSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleFlatExpenseSort = (field: FlatExpenseSortField) => {
    if (flatExpenseSortField === field) {
      if (flatExpenseSortDirection === 'asc') {
        setFlatExpenseSortDirection('desc');
      } else {
        setFlatExpenseSortField(null);
        setFlatExpenseSortDirection('asc');
      }
    } else {
      setFlatExpenseSortField(field);
      setFlatExpenseSortDirection('asc');
    }
  };

  const getSortedLedgerExpenses = (expenses: ExpenseItem[], viewMode?: string): ExpenseItem[] => {
    if (!flatExpenseSortField) return expenses;
    return [...expenses].sort((a, b) => {
      let comparison = 0;
      switch (flatExpenseSortField) {
        case 'exp':
          comparison = a.expense_id - b.expense_id;
          break;
        case 'description': {
          const getWorkerName = (exp: ExpenseItem) => {
            const wObj = exp.worker_detail || (typeof exp.worker === 'object' && exp.worker !== null ? exp.worker : null);
            return wObj?.full_name || wObj?.username || (typeof exp.worker === 'object' && exp.worker !== null ? (exp.worker.full_name || exp.worker.username || `Worker ${exp.worker.id}`) : `Worker ${exp.worker}`);
          };
          const descA = a.ticket_details?.title || a.remarks || a.expense_type_detail?.expense_name || getWorkerName(a) || '';
          const descB = b.ticket_details?.title || b.remarks || b.expense_type_detail?.expense_name || getWorkerName(b) || '';
          comparison = descA.localeCompare(descB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'ticket': {
          const tA = formatTicketDisplay(a);
          const tB = formatTicketDisplay(b);
          comparison = tA.localeCompare(tB, undefined, { numeric: true });
          break;
        }
        case 'category': {
          const getCat = (exp: ExpenseItem) =>
            exp.expense_type_detail?.expense_name ||
            (typeof exp.expense_type === 'object' && exp.expense_type ? exp.expense_type.expense_name : ((exp as any).expense_type_name || (exp as any).category_name || 'General'));
          comparison = getCat(a).localeCompare(getCat(b), undefined, { sensitivity: 'base' });
          break;
        }
        case 'date': {
          const timeA = a.expense_date ? new Date(a.expense_date).getTime() : 0;
          const timeB = b.expense_date ? new Date(b.expense_date).getTime() : 0;
          comparison = timeA - timeB;
          break;
        }
        case 'source_bundle': {
          const getClaimId = (exp: ExpenseItem) => {
            const cid = typeof exp.claim === 'object' && exp.claim !== null ? exp.claim.claim_id : exp.claim;
            return cid ? Number(cid) : 0;
          };
          comparison = getClaimId(a) - getClaimId(b);
          break;
        }
        case 'amount':
          comparison = parseFloat(a.amount || '0') - parseFloat(b.amount || '0');
          break;
      }
      return flatExpenseSortDirection === 'asc' ? comparison : -comparison;
    });
  };

  // Pending Actionable Ledger Groups for Bulk Approve
  const pendingActionableGroups = useMemo(() => {
    return groupedLedgerClusters.filter(cluster => {
      if (cluster.isCompleted) return false;
      const isGroupInReview = cluster.ledgers.some(l => l.status === 'Submitted' || l.status === 'In Review');
      if (!isGroupInReview) return false;
      return cluster.ledgers.some(l => {
        const app = getLedgerApproval(l.ledger_id);
        return canUserApproveLedger(l.ledger_id, app);
      });
    });
  }, [groupedLedgerClusters, approvalsProps?.approvals, approvalsProps?.displayedApprovals, currentUser]);

  // Bulk Approve Handler for Ledger Groups
  const handleBulkApproveLedgers = async () => {
    if (pendingActionableGroups.length === 0) return;

    const confirmed = await confirmPopup({
      preset: 'approve',
      title: 'Approve All Pending Ledger Groups',
      description: `Are you sure you want to approve all ${pendingActionableGroups.length} pending ledger group(s)?`,
      button1: 'Cancel',
      button2: 'Approve All',
      variant: 'primary',
    });
    if (!confirmed) return;

    setBulkApproving(true);
    setBulkActionMsg(null);
    try {
      let count = 0;
      for (const cluster of pendingActionableGroups) {
        await handleGroupAction(cluster, 'APPROVED');
        count++;
      }
      setBulkActionMsg({
        type: 'success',
        text: `Successfully approved ${count} pending Ledger`
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



  const areAllGroupsCollapsed = useMemo(() => {
    return groupedLedgerClusters.length > 0 && groupedLedgerClusters.every(c => !expandedGroupIds[c.groupId]);
  }, [groupedLedgerClusters, expandedGroupIds]);

  const toggleAllGroupsAccordion = () => {
    if (areAllGroupsCollapsed) {
      const allOpen: Record<string | number, boolean> = {};
      groupedLedgerClusters.forEach(c => {
        allOpen[c.groupId] = true;
      });
      setExpandedGroupIds(allOpen);
    } else {
      setExpandedGroupIds({});
      Object.keys(expandedLedgerIds).forEach(id => {
        if (expandedLedgerIds[Number(id)]) toggleExpandLedger(Number(id));
      });
      setExpandedSubDepts({});
      setExpandedWorkers({});
      setExpandedNestedWorkers({});
      setExpandedNestedSubDepts({});
    }
  };

  // Search & Select All State for Assemble Modal
  const [assembleSearch, setAssembleSearch] = useState<string>('');
  const [selectedUnmappedSubDept, setSelectedUnmappedSubDept] = useState<string | null>(null);
  const [isRefreshingAssemble, setIsRefreshingAssemble] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  const handleRefreshAssemble = async () => {
    if (isRefreshingAssemble) return;
    setIsRefreshingAssemble(true);
    try {
      await Promise.all([
        onRefresh ? onRefresh() : Promise.resolve(),
        fetchLedgerGroups(''),
        fetchLedgerBatches()
      ]);
    } finally {
      setIsRefreshingAssemble(false);
    }
  };

  useEffect(() => {
    if (showCreateLedgerModal) {
      handleRefreshAssemble();
    } else {
      setAssembleSearch('');
      setSelectedUnmappedSubDept(null);
    }
  }, [showCreateLedgerModal]);


  const availableBundlesForAssemble = useMemo(() => {
    return bundles.filter(b => {
      if (b.status !== 'Approved') return false;
      if (b.ledger_id) return false;
      if (b.ledger_details && b.ledger_details.status !== 'Rejected') return false;
      if (Array.isArray((b as any).ledgers) && (b as any).ledgers.length > 0) return false;
      return true;
    });
  }, [bundles]);

  const filteredBundlesForAssemble = useMemo(() => {
    if (!assembleSearch.trim()) return availableBundlesForAssemble;
    const q = assembleSearch.trim().toLowerCase();
    return availableBundlesForAssemble.filter(b => {
      const claimIdStr = String(b.claim_id);
      if (claimIdStr.includes(q) || `bundle ${claimIdStr}`.toLowerCase().includes(q)) return true;
      const workerName = (b.worker_detail?.full_name || b.worker_detail?.username || `worker ${b.worker}`).toLowerCase();
      if (workerName.includes(q)) return true;
      const wo = (b.ticket_details?.work_order_no || '').toLowerCase();
      const title = (b.ticket_details?.title || '').toLowerCase();
      if (wo.includes(q) || title.includes(q)) return true;
      const amountStr = parseFloat(b.total_claimed_amount).toFixed(3);
      if (amountStr.includes(q)) return true;
      if (Array.isArray(b.expenses)) {
        const hasExpMatch = b.expenses.some((e: any) => {
          const sd = (e.ticket_details?.sub_department_name || e.sub_department_name || '').toLowerCase();
          const eWo = (e.ticket_details?.work_order_no || '').toLowerCase();
          return sd.includes(q) || eWo.includes(q);
        });
        if (hasExpMatch) return true;
      }
      return false;
    });
  }, [availableBundlesForAssemble, assembleSearch]);

  const allFilteredSelected = useMemo(() => {
    return (
      filteredBundlesForAssemble.length > 0 &&
      filteredBundlesForAssemble.every(b => selectedBundleIds.includes(b.claim_id))
    );
  }, [filteredBundlesForAssemble, selectedBundleIds]);

  const someFilteredSelected = useMemo(() => {
    return (
      filteredBundlesForAssemble.length > 0 &&
      filteredBundlesForAssemble.some(b => selectedBundleIds.includes(b.claim_id))
    );
  }, [filteredBundlesForAssemble, selectedBundleIds]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredBundlesForAssemble.map(b => b.claim_id));
      setSelectedBundleIds(selectedBundleIds.filter(id => !filteredSet.has(id)));
    } else {
      const newSet = new Set(selectedBundleIds);
      filteredBundlesForAssemble.forEach(b => newSet.add(b.claim_id));
      setSelectedBundleIds(Array.from(newSet));
    }
  };

  // Classification logic for Assemble Modal
  const classificationResult = useMemo(() => {
    const effectiveBatches = (ledgerBatches && ledgerBatches.length > 0 ? ledgerBatches : internalBatches) || [];
    if (selectedBundleIds.length === 0) {
      return {
        totalExpenses: 0,
        unmappedExpenses: [] as ExpenseItem[],
        unmappedSubDepts: [] as Array<{
          subDeptId?: number;
          subDeptName: string;
          expensesCount: number;
          totalAmount: number;
          tickets: Array<{ ticketObj: any; ticketNo: string; exp: any }>;
        }>,
        unmappedTickets: [] as Array<{
          ticketObj: any;
          ticketNo: string;
          subDeptName: string;
          exp: any;
        }>,
        classifiedBatches: [] as Array<{
          batch: LedgerBatchItem;
          expenses: ExpenseItem[];
          bundles: WorkerClaimItem[];
          total: number;
        }>,
        totalAmount: 0,
        hasUnmapped: false,
      };
    }

    const subDeptToBatch = new Map<number | string, LedgerBatchItem>();
    for (const batch of effectiveBatches.filter(b => b.active)) {
      if (Array.isArray(batch.sub_departments)) {
        for (const sd of batch.sub_departments) {
          const sdId = typeof sd === 'object' && sd !== null ? (sd as any).sub_department_id : sd;
          if (sdId) subDeptToBatch.set(Number(sdId), batch);
          if (typeof sd === 'object' && (sd as any).sub_department_name) {
            subDeptToBatch.set(String((sd as any).sub_department_name).toLowerCase().trim(), batch);
          }
        }
      }
      if (Array.isArray(batch.sub_departments_detail)) {
        for (const sd of batch.sub_departments_detail) {
          if (sd && sd.sub_department_id) {
            subDeptToBatch.set(Number(sd.sub_department_id), batch);
          }
          if (sd && sd.sub_department_name) {
            subDeptToBatch.set(String(sd.sub_department_name).toLowerCase().trim(), batch);
          }
        }
      }
    }

    const validUnassignedIds = new Set(
      bundles
        .filter(b => b.status === 'Approved' && !b.ledger_id && (!b.ledger_details || b.ledger_details.status === 'Rejected') && (!Array.isArray((b as any).ledgers) || (b as any).ledgers.length === 0))
        .map(b => b.claim_id)
    );

    const selectedBundlesList = bundles.filter(b => selectedBundleIds.includes(b.claim_id) && validUnassignedIds.has(b.claim_id));
    const allExpenses: ExpenseItem[] = [];
    const expenseToBundleMap = new Map<number, WorkerClaimItem>();

    for (const b of selectedBundlesList) {
      if (Array.isArray(b.expenses)) {
        for (const exp of b.expenses) {
          allExpenses.push(exp);
          expenseToBundleMap.set(exp.expense_id, b);
        }
      }
    }

    const batchMap = new Map<number | string, {
      batch: LedgerBatchItem;
      expenses: ExpenseItem[];
      bundlesSet: Set<number>;
      total: number;
    }>();
    const unmapped: ExpenseItem[] = [];
    let sumTotal = 0;

    for (const exp of allExpenses) {
      const amt = parseFloat(exp.amount || '0');
      sumTotal += amt;
      const sdId = exp.ticket_details?.sub_department_id ?? exp.sub_department_id;
      const sdName = (exp.ticket_details?.sub_department_name ?? exp.sub_department_name ?? '').toLowerCase().trim();
      const bItem = expenseToBundleMap.get(exp.expense_id);

      const matchedBatch = (sdId ? subDeptToBatch.get(Number(sdId)) : undefined) || (sdName ? subDeptToBatch.get(sdName) : undefined);

      if (!matchedBatch) {
        unmapped.push(exp);
      } else {
        const batchKey = (matchedBatch as any).batch_id ?? matchedBatch.ledger_batch_id ?? matchedBatch.batch_name;
        if (!batchMap.has(batchKey)) {
          batchMap.set(batchKey, {
            batch: matchedBatch,
            expenses: [],
            bundlesSet: new Set<number>(),
            total: 0,
          });
        }
        const bGroup = batchMap.get(batchKey)!;
        bGroup.expenses.push(exp);
        if (bItem) bGroup.bundlesSet.add(bItem.claim_id);
        bGroup.total += amt;
      }
    }

    const classifiedBatches = Array.from(batchMap.values()).map(bg => ({
      batch: bg.batch,
      expenses: bg.expenses,
      bundles: selectedBundlesList.filter(b => bg.bundlesSet.has(b.claim_id)),
      total: bg.total,
    }));

    // Group unmapped expenses by sub-department
    const unmappedSubDeptsMap = new Map<string, {
      subDeptId?: number;
      subDeptName: string;
      expensesCount: number;
      totalAmount: number;
      ticketsMap: Map<string, { ticketObj: any; ticketNo: string; exp: any }>;
    }>();

    for (const exp of unmapped) {
      const sdId = exp.ticket_details?.sub_department_id ?? exp.sub_department_id;
      const sdName = exp.ticket_details?.sub_department_name ?? exp.sub_department_name ?? 'Unassigned Sub-Department';
      const key = String(sdId || sdName);

      if (!unmappedSubDeptsMap.has(key)) {
        unmappedSubDeptsMap.set(key, {
          subDeptId: sdId ? Number(sdId) : undefined,
          subDeptName: sdName,
          expensesCount: 0,
          totalAmount: 0,
          ticketsMap: new Map(),
        });
      }
      const entry = unmappedSubDeptsMap.get(key)!;
      entry.expensesCount++;
      entry.totalAmount += parseFloat(exp.amount || '0');

      const rawTicket: any = exp.ticket_details || exp.ticket;
      const tLabel = formatTicketDisplay(exp);
      if (rawTicket || (tLabel && tLabel !== '-')) {
        const ticketObj: any = typeof rawTicket === 'object' && rawTicket !== null ? rawTicket : { ticket_id: rawTicket };
        const ticketNo = tLabel !== '-' ? tLabel : `#${ticketObj?.ticket_id ?? ticketObj?.id ?? 'Ticket'}`;
        const tKey = String(ticketObj?.ticket_id ?? ticketObj?.id ?? ticketNo);
        if (!entry.ticketsMap.has(tKey)) {
          entry.ticketsMap.set(tKey, { ticketObj, ticketNo, exp });
        }
      }
    }

    const unmappedSubDepts = Array.from(unmappedSubDeptsMap.values()).map(entry => ({
      subDeptId: entry.subDeptId,
      subDeptName: entry.subDeptName,
      expensesCount: entry.expensesCount,
      totalAmount: entry.totalAmount,
      tickets: Array.from(entry.ticketsMap.values()),
    }));

    // Collect all unique unmapped tickets across sub-departments for quick bottom list
    const allUnmappedTicketMap = new Map<string, { ticketObj: any; ticketNo: string; subDeptName: string; exp: any }>();
    for (const sd of unmappedSubDepts) {
      for (const t of sd.tickets) {
        const tKey = String((t.ticketObj as any)?.ticket_id ?? (t.ticketObj as any)?.id ?? t.ticketNo);
        if (!allUnmappedTicketMap.has(tKey)) {
          allUnmappedTicketMap.set(tKey, {
            ...t,
            subDeptName: sd.subDeptName,
          });
        }
      }
    }
    const unmappedTickets = Array.from(allUnmappedTicketMap.values());

    return {
      totalExpenses: allExpenses.length,
      unmappedExpenses: unmapped,
      unmappedSubDepts,
      unmappedTickets,
      classifiedBatches,
      totalAmount: sumTotal,
      hasUnmapped: unmapped.length > 0,
    };
  }, [selectedBundleIds, bundles, ledgerBatches, internalBatches]);

  // Active unmapped sub-department (defaults to the first one)
  const activeUnmappedSubDept = useMemo(() => {
    if (classificationResult.unmappedSubDepts.length === 0) return null;
    if (selectedUnmappedSubDept && classificationResult.unmappedSubDepts.some(sd => sd.subDeptName === selectedUnmappedSubDept)) {
      return selectedUnmappedSubDept;
    }
    return classificationResult.unmappedSubDepts[0].subDeptName;
  }, [selectedUnmappedSubDept, classificationResult.unmappedSubDepts]);

  // Filter unmapped tickets based on clicked/active sub-department
  const displayedUnmappedTickets = useMemo(() => {
    if (!activeUnmappedSubDept) return [];
    const matched = classificationResult.unmappedSubDepts.find(
      sd => sd.subDeptName === activeUnmappedSubDept
    );
    return matched ? matched.tickets.map(t => ({ ...t, subDeptName: matched.subDeptName })) : [];
  }, [activeUnmappedSubDept, classificationResult]);

  // Auto-select the first unmapped sub-department by default
  useEffect(() => {
    if (classificationResult.unmappedSubDepts.length > 0) {
      const exists = classificationResult.unmappedSubDepts.some(sd => sd.subDeptName === selectedUnmappedSubDept);
      if (!selectedUnmappedSubDept || !exists) {
        setSelectedUnmappedSubDept(classificationResult.unmappedSubDepts[0].subDeptName);
      }
    } else if (selectedUnmappedSubDept) {
      setSelectedUnmappedSubDept(null);
    }
  }, [classificationResult.unmappedSubDepts, selectedUnmappedSubDept]);

  // Clean stale/attached bundle selections automatically
  useEffect(() => {
    if (showCreateLedgerModal) {
      const validUnassignedIds = new Set(
        bundles
          .filter(b => b.status === 'Approved' && !b.ledger_id && (!b.ledger_details || b.ledger_details.status === 'Rejected') && (!Array.isArray((b as any).ledgers) || (b as any).ledgers.length === 0))
          .map(b => b.claim_id)
      );
      const filtered = selectedBundleIds.filter(id => validUnassignedIds.has(id));
      if (filtered.length !== selectedBundleIds.length) {
        setSelectedBundleIds(filtered);
      }
    }
  }, [showCreateLedgerModal, bundles, selectedBundleIds]);

  const openAddBundleModal = (cluster: LedgerGroupCluster) => {
    setIsAddingToExistingGroup(true);
    setSelectedGroupId(String(cluster.groupId));
    setNewGroupName('');
    setSelectedBundleIds([]);
    setShowCreateLedgerModal(true);
    if (onRefresh) {
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded border border-outline-variant bg-surface-container shadow-2xs">
          <span className="text-xs font-medium text-on-surface-variant block">Total Ledgers</span>
          <span className="text-2xl font-semibold text-on-surface mt-1 block">{allGroupedLedgerClusters.length}</span>
        </div>
        <div className="p-4 rounded border border-outline-variant bg-surface-container shadow-2xs">
          <span className="text-xs font-medium text-on-surface-variant block">Pending Approvals Queue</span>
          <span className="text-2xl font-semibold text-amber-500 mt-1 block">
            {ledgers.filter(l => l.status === 'Submitted' || l.status === 'In Review').length}
          </span>
        </div>
        <div className="p-4 rounded border border-outline-variant bg-surface-container shadow-2xs">
          <span className="text-xs font-medium text-on-surface-variant block">Assigned to My Role</span>
          <span className="text-2xl font-semibold text-primary mt-1 block">
            {pendingActionableGroups.length}
          </span>
        </div>
        <div className="p-4 rounded border border-outline-variant bg-surface-container shadow-2xs">
          <span className="text-xs font-medium text-on-surface-variant block">Approved & Settled</span>
          <span className="text-2xl font-semibold text-emerald-500 mt-1 block">
            {ledgers.filter(l => l.status === 'Approved' || l.status === 'Paid').length}
          </span>
        </div>
      </div>

      {/* Main Unified Table Container */}
      <div className="border border-outline-variant rounded overflow-hidden bg-surface-container flex flex-col shadow-xs">
        {/* Table Header Controls */}
        <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-on-surface">Ledger</span>
            </div>
            <span className="text-xs text-on-surface-variant font-medium">
              Showing {allGroupedLedgerClusters.length} Ledger{allGroupedLedgerClusters.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* BATCH-WISE vs BUNDLE-WISE SWITCH */}
            <div className="flex items-center p-0.5 rounded bg-surface-container-high border border-outline-variant/70 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setHierarchyGrouping('bundle_wise')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${hierarchyGrouping === 'bundle_wise'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                title="View hierarchy grouped by Worker Claim Bundles"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Bundle-wise</span>
              </button>
              <button
                type="button"
                onClick={() => setHierarchyGrouping('batch_wise')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${hierarchyGrouping === 'batch_wise'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                title="View hierarchy grouped by Ledger Batches (Sub-Departments)"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Batch-wise</span>
              </button>
            </div>

            {/* VIEW MODE SWITCH BUTTONS (By Sub-Department, By Worker, Flat Table) - Always shown, disabled when not in Batch-wise view */}
            <div
              className={`flex items-center p-0.5 rounded bg-surface-container-high border border-outline-variant/70 text-xs transition-opacity ${hierarchyGrouping !== 'batch_wise' ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              title={hierarchyGrouping !== 'batch_wise' ? 'Select Batch-wise to change breakdown mode' : undefined}
            >
              <button
                type="button"
                disabled={hierarchyGrouping !== 'batch_wise'}
                onClick={() => {
                  setGlobalViewMode('by_sub_department');
                  setLedgerViewModes({});
                }}
                className={`px-2.5 py-1.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors ${hierarchyGrouping === 'batch_wise' && globalViewMode === 'by_sub_department'
                  ? 'bg-primary text-on-primary font-semibold shadow-2xs cursor-pointer'
                  : hierarchyGrouping === 'batch_wise'
                    ? 'text-on-surface-variant hover:text-on-surface cursor-pointer'
                    : 'text-on-surface-variant cursor-not-allowed'
                  }`}
                title="View breakdown by Sub-Department"
              >
                <Building2 className="w-3.5 h-3.5" />
                {/* <span>By Sub-Department</span> */}
              </button>
              <button
                type="button"
                disabled={hierarchyGrouping !== 'batch_wise'}
                onClick={() => {
                  setGlobalViewMode('by_worker');
                  setLedgerViewModes({});
                }}
                className={`px-2.5 py-1.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors ${hierarchyGrouping === 'batch_wise' && globalViewMode === 'by_worker'
                  ? 'bg-primary text-on-primary font-semibold shadow-2xs cursor-pointer'
                  : hierarchyGrouping === 'batch_wise'
                    ? 'text-on-surface-variant hover:text-on-surface cursor-pointer'
                    : 'text-on-surface-variant cursor-not-allowed'
                  }`}
                title="View breakdown by Worker"
              >
                <User className="w-3.5 h-3.5" />
                {/* <span>By Worker</span> */}
              </button>
              <button
                type="button"
                disabled={hierarchyGrouping !== 'batch_wise'}
                onClick={() => {
                  setGlobalViewMode('flat_table');
                  setLedgerViewModes({});
                }}
                className={`px-2.5 py-1.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors ${hierarchyGrouping === 'batch_wise' && globalViewMode === 'flat_table'
                  ? 'bg-primary text-on-primary font-semibold shadow-2xs cursor-pointer'
                  : hierarchyGrouping === 'batch_wise'
                    ? 'text-on-surface-variant hover:text-on-surface cursor-pointer'
                    : 'text-on-surface-variant cursor-not-allowed'
                  }`}
                title="View flat table of expenses"
              >
                <Receipt className="w-3.5 h-3.5" />
                {/* <span>Flat Table</span> */}
              </button>
            </div>

            {/* Toggle Stepper Visibility Button */}
            <button
              type="button"
              onClick={() => setShowStepper(prev => !prev)}
              className={`px-2.5 py-1.5 rounded border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${showStepper
                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 font-semibold'
                : 'border-outline-variant text-on-surface hover:bg-surface-container'
                }`}
              title={showStepper ? "Approval Stepper is ON - click to hide" : "Approval Stepper is OFF - click to show"}
            >
              <GitCommit className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Stepper {showStepper ? 'On' : 'Off'}</span>
            </button>

            {/* Close All Button */}
            <button
              type="button"
              onClick={() => {
                setExpandedGroupIds({});
                setExpandedGroupBundleKeys({});
                Object.keys(expandedLedgerIds).forEach(id => {
                  if (expandedLedgerIds[Number(id)]) {
                    toggleExpandLedger(Number(id));
                  }
                });
                setIsMultiLineView(false);
                setExpandedSubDepts({});
                setExpandedWorkers({});
                setExpandedNestedWorkers({});
                setExpandedNestedSubDepts({});
              }}
              className="px-2.5 py-1.5 rounded border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-container flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Collapse all opened groups, bundles, batches, and accordions"
            >
              <ChevronsUp className="w-3.5 h-3.5 text-on-surface-variant" />
              <span>Close All</span>
            </button>

            {/* Approve All Pending Groups Button */}
            {pendingActionableGroups.length > 0 && (
              <button
                type="button"
                disabled={bulkApproving}
                onClick={handleBulkApproveLedgers}
                className="px-3 py-1.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Approve all actionable pending Ledger in one click"
              >
                {bulkApproving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve All Pending Groups ({pendingActionableGroups.length})</span>
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
                title={isRefreshing ? "Refreshing Ledgers..." : "Refresh Ledgers"}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || loading ? 'animate-spin text-primary' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            )}

            <Can permission={['finance.view_ledger_report', 'reports.can_generate_report', 'finance.can_view_expenses'] as any}>
              <button
                type="button"
                onClick={() => setShowMonthlyLocationReportModal(true)}
                className="px-2.5 py-1.5 rounded border border-outline-variant bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Generate Monthly Location Expense Report or Period Comparison Report"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Monthly Location Report</span>
              </button>
            </Can>
            <Can permission="finance.add_ledger" >

              <button
                type="button"
                onClick={() => {
                  setIsAddingToExistingGroup(false);
                  setSelectedBundleIds([]);
                  setSelectedGroupId('');
                  setNewGroupName('');
                  if (setLedgerRemarks) setLedgerRemarks('');
                  setShowCreateLedgerModal(true);
                }}
                className="bg-primary hover:bg-primary/90 text-on-primary text-[11px] font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assemble Ledger</span>
              </button>
            </Can>
          </div>
        </div>

        {/* Bulk Action Result Notification Banner */}
        {bulkActionMsg && (
          <div className={`px-4 py-2 text-xs flex items-center justify-between border-b ${bulkActionMsg.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900'
            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900'
            }`}>
            <div className="flex items-center gap-2">
              {bulkActionMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{bulkActionMsg.text}</span>
            </div>
            <button onClick={() => setBulkActionMsg(null)} className="text-on-surface-variant hover:text-on-surface cursor-pointer ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {loading && ledgers.length === 0 ? (
          <div className="p-12 text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading ledgers...
          </div>
        ) : allGroupedLedgerClusters.length === 0 && !isSyncingNewLedger ? (
          <div className="p-12 text-center text-on-surface-variant space-y-2">
            <Layers className="w-8 h-8 mx-auto text-outline" />
            <p className="text-xs font-medium text-on-surface">No Ledger match your filters</p>
            <p className="text-xs">Assemble multiple approved worker claims into a unified Ledger.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left text-on-surface">
                <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider border-b border-outline-variant select-none">
                  <tr>
                    <th className="w-9 px-2 py-3 text-center"></th>
                    <th
                      onClick={() => handleMainSort('ledger')}
                      className="px-4 py-3 cursor-pointer hover:text-primary transition-colors group"
                      title="Sort by Ledger Group"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Ledger</span>
                        {renderSortIndicator(mainSortField, 'ledger', mainSortDirection)}
                      </div>
                    </th>
                    <th
                      onClick={() => handleMainSort('bundles')}
                      className="px-4 py-3 cursor-pointer hover:text-primary transition-colors group"
                      title="Sort by Bundles / Batches Count"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>{hierarchyGrouping === 'bundle_wise' ? 'Bundles' : 'Batches'}</span>
                        {renderSortIndicator(mainSortField, 'bundles', mainSortDirection)}
                      </div>
                    </th>
                    <th
                      onClick={() => handleMainSort('expenses')}
                      className="px-4 py-3 cursor-pointer hover:text-primary transition-colors group"
                      title="Sort by Expenses Count"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Expenses</span>
                        {renderSortIndicator(mainSortField, 'expenses', mainSortDirection)}
                      </div>
                    </th>
                    <th
                      onClick={() => handleMainSort('created_by')}
                      className="px-4 py-3 cursor-pointer hover:text-primary transition-colors group"
                      title="Sort by Creator"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Created By</span>
                        {renderSortIndicator(mainSortField, 'created_by', mainSortDirection)}
                      </div>
                    </th>
                    <th
                      onClick={() => handleMainSort('total_amount')}
                      className="px-4 py-3 text-right cursor-pointer hover:text-primary transition-colors group"
                      title="Sort by Group Total Amount"
                    >
                      <div className="inline-flex items-center justify-end gap-1 w-full">
                        <span>Group Total</span>
                        {renderSortIndicator(mainSortField, 'total_amount', mainSortDirection)}
                      </div>
                    </th>
                    <th
                      onClick={() => handleMainSort('status')}
                      className="px-4 py-3 text-center cursor-pointer hover:text-primary transition-colors group"
                      title="Sort by Status"
                    >
                      <div className="inline-flex items-center justify-center gap-1">
                        <span>Status</span>
                        {renderSortIndicator(mainSortField, 'status', mainSortDirection)}
                      </div>
                    </th>
                    {/* <Can permission='finance.change_ledger'> */}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {/* SKELETON / ROW LOADER UNTIL THE NEW LEDGER IS VISIBLE IN UI */}
                  {isSyncingNewLedger && (
                    <tr className="animate-pulse bg-primary/10 dark:bg-primary/20 border-l-4 border-l-primary transition-all">
                      <td className="w-9 px-2 py-3 text-center">
                        <div className="w-5 h-5 mx-auto rounded flex items-center justify-center bg-primary/20 text-primary">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-primary">
                            {syncingLedgerInfo?.group_name || (syncingLedgerInfo?.ledger_id ? `Ledger #${syncingLedgerInfo.ledger_id}` : 'New Ledger Group')}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/25 text-primary font-bold animate-pulse inline-flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>Creating Ledger...</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        <span className="text-xs font-mono">
                          {syncingLedgerInfo?.bundles_count ? `${syncingLedgerInfo.bundles_count} bundle(s)` : 'Assembling...'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        <div className="h-4 w-14 bg-primary/20 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[9px]">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </div>
                          <span className="text-xs text-on-surface-variant">You</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                        {syncingLedgerInfo?.total_amount ? `KD ${syncingLedgerInfo.total_amount.toFixed(3)}` : (
                          <div className="h-4 w-16 bg-primary/20 rounded ml-auto animate-pulse" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
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
                  )}
                  {groupedLedgerClusters.map((cluster, clusterIdx) => {
                    const isGroupCollapsed = !expandedGroupIds[cluster.groupId];

                    // Compute unified group status and permissions
                    const isGroupPaid = cluster.isPaid || (cluster.ledgers.length > 0 && cluster.ledgers.every(l => l.status === 'Paid'));
                    const groupStatus = isGroupPaid
                      ? 'Paid'
                      : cluster.ledgers.some(l => l.status === 'Rework')
                        ? 'Rework'
                        : cluster.ledgers.some(l => l.status === 'In Review' || l.status === 'Submitted')
                          ? 'In Review'
                          : cluster.ledgers.some(l => l.status === 'Rejected')
                            ? 'Rejected'
                            : (cluster.isCompleted || (cluster.ledgers.length > 0 && cluster.ledgers.every(l => l.status === 'Approved' || l.status === 'Paid')))
                              ? 'Approved'
                              : 'Draft';

                    const canUserApproveGroup = cluster.ledgers.some(l => {
                      const st = (l.status || '').toLowerCase().replace('_', ' ');
                      if (st !== 'submitted' && st !== 'in review' && st !== 'pending' && st !== 'pending approval') return false;
                      const app = getLedgerApproval(l.ledger_id, l);
                      return canUserApproveLedger(l.ledger_id, app, l);
                    });

                    const hasDraftBatches = cluster.ledgers.some(l => l.status === 'Draft' || l.status === 'Rework' || l.status === 'Rejected');
                    const isGroupInReview = cluster.ledgers.some(l => {
                      const st = (l.status || '').toLowerCase().replace('_', ' ');
                      return st === 'submitted' || st === 'in review' || st === 'pending' || st === 'pending approval';
                    });

                    const groupPendingStep = cluster.ledgers
                      .map(l => (l as any).approval_history?.find((i: any) => i.status === 'Pending')?.step_name || getLedgerApproval(l.ledger_id)?.step_name)
                      .filter(Boolean)[0] || 'Approval';

                    const currentUserId = currentUser?.id ?? currentUser?.user_id;
                    const currentUsername = currentUser?.username;
                    const hasCurrentUserApprovedGroup = isGroupInReview && cluster.ledgers.some(l =>
                      Boolean(
                        (l as any).approval_history?.some(
                          (inst: any) => inst.status === 'Approved' && (
                            (inst.action_by_username && currentUsername && inst.action_by_username.toLowerCase() === currentUsername.toLowerCase()) ||
                            (inst.action_by && currentUserId && (String(inst.action_by) === String(currentUserId) || String(inst.action_by?.id) === String(currentUserId)))
                          )
                        )
                      )
                    );

                    const isLastActiveGroup = lastActiveRowKey === `group_${cluster.groupId}` || lastActiveRowKey === cluster.groupId;

                    return (
                      <React.Fragment key={`cluster_${cluster.groupId}`}>
                        {/* 1. UNIFIED  GROUP ROW */}
                        <tr
                          onClick={() => {
                            setLastActiveRowKey(`group_${cluster.groupId}`);
                            toggleGroupAccordion(cluster.groupId);
                          }}
                          className={`select-none cursor-pointer transition-all ${isLastActiveGroup
                            ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                            : !isGroupCollapsed
                              ? 'bg-indigo-50/95 dark:bg-indigo-950/50 hover:bg-indigo-100/95 dark:hover:bg-indigo-950/70 border-t-2 border-b-2 border-indigo-500/60 border-l-4 border-l-indigo-600 shadow-xs'
                              : 'bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/90 dark:hover:bg-slate-700/80 border-t-2 border-b border-outline-variant/80'
                            }`}
                        >
                          {/* 1. Chevron */}
                          <td className="w-9 px-2 py-3 text-center" onClick={(e) => { e.stopPropagation(); setLastActiveRowKey(`group_${cluster.groupId}`); toggleGroupAccordion(cluster.groupId); }}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer flex items-center justify-center mx-auto"
                              title={isGroupCollapsed ? "Expand Ledger" : "Collapse Ledger"}
                            >
                              {isGroupCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              )}
                            </button>
                          </td>

                          {/* 2. Group Name & ID */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded transition-colors shrink-0 ${!isGroupCollapsed
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25'
                                }`}>
                                <Layers className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-xs ${!isGroupCollapsed ? 'font-bold text-indigo-950 dark:text-indigo-100' : 'font-bold text-on-surface'}`}>
                                  {cluster.groupId}  |   {cluster.groupName}
                                </span>

                              </div>
                            </div>
                          </td>

                          {/* 3. Batches / Bundles Count */}
                          <td className="px-4 py-3">
                            {hierarchyGrouping === 'bundle_wise' ? (() => {
                              const breakdown = getGroupBundleBreakdown(cluster);
                              const settledCount = breakdown.filter(b => b.status === 'Paid' || isGroupPaid).length;
                              const totalCount = breakdown.length;

                              return (
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/60 text-[11px]">
                                    {totalCount} Bundle{totalCount !== 1 ? 's' : ''}
                                  </span>
                                  {totalCount > 0 && (
                                    <span className={`text-[10px] font-bold ${settledCount === totalCount
                                      ? 'text-teal-600 dark:text-teal-400'
                                      : settledCount > 0
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-on-surface-variant'
                                      }`}>
                                      {settledCount}/{totalCount} Settled
                                    </span>
                                  )}
                                </div>
                              );
                            })() : (
                              <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/60 text-[11px] whitespace-nowrap">
                                {cluster.ledgers.length} Batch{cluster.ledgers.length !== 1 ? 'es' : ''}
                              </span>
                            )}
                          </td>

                          {/* 4. Expenses Count */}
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium text-[11px] whitespace-nowrap">
                              {cluster.ledgers.reduce((sum, l) => sum + (Array.isArray(l.expenses) ? l.expenses.length : 0), 0)} exp
                            </span>
                          </td>

                          {/* 5. Created By */}
                          <td className="px-4 py-3 text-on-surface-variant font-medium text-[11px] whitespace-nowrap">
                            {cluster.createdByName || 'User'}
                          </td>

                          {/* 6. Group Total */}
                          <td className="px-4 py-3 text-right font-bold text-on-surface text-xs whitespace-nowrap">
                            KD {cluster.totalAmount.toFixed(3)}
                          </td>

                          {/* 7. Status */}
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {renderStatusBadge(
                              groupStatus,
                              isGroupInReview && canUserApproveGroup,
                              groupPendingStep,
                              hasCurrentUserApprovedGroup
                            )}
                          </td>

                          {/* 8. Actions */}



                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Add Bundle to Group Button (If approved, requires super_permission) */}
                              {(() => {
                                const isGroupApproved = groupStatus === 'Approved' || cluster.allApproved || cluster.isCompleted;
                                const isPaidOrInReview = isGroupPaid || cluster.ledgers.some(l => l.status === 'Paid' || l.status === "In Review");
                                if (isPaidOrInReview) return null;

                                const addBundleBtn = (
                                  <button
                                    type="button"
                                    onClick={() => openAddBundleModal(cluster)}
                                    className="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 transition-colors cursor-pointer text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs shrink-0"
                                    title={`Add an approved bundle into ${cluster.groupName}`}
                                  >
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    <span>Add Bundle</span>
                                  </button>
                                );

                                return isGroupApproved ? (
                                  <Can permission="super_permission">
                                    {addBundleBtn}
                                  </Can>
                                ) : (
                                  <Can permission="finance.change_ledger">
                                    {addBundleBtn}
                                  </Can>
                                );
                              })()}

                              <Can permission='finance.change_ledger'>

                                {/* Group Submission Action (If draft/rework batches exist) */}
                                {!cluster.isCompleted && hasDraftBatches && (
                                  <button
                                    type="button"
                                    disabled={Boolean(submittingGroupIds[cluster.groupId])}
                                    onClick={() => handleGroupSubmit(cluster)}
                                    className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-container transition-colors cursor-pointer shadow-xs disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
                                    title="Submit the entire Ledger for approval"
                                  >
                                    {submittingGroupIds[cluster.groupId] ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Submitting...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>{cluster.ledgers.some(l => l.status === 'Rework' || l.status === 'Rejected') ? 'Resubmit' : 'Submit'}</span>
                                      </>
                                    )}
                                  </button>
                                )}




                                {/* Delete Group Action (If draft or rework/rejected and not completed/in review/paid) */}
                                {!cluster.isCompleted && !isGroupInReview && !cluster.ledgers.some(l => l.status === 'Paid') && (hasDraftBatches || cluster.ledgers.length === 0) && (
                                  <button
                                    type="button"
                                    disabled={deletingGroupId === cluster.groupId}
                                    onClick={() => onDeleteLedgerGroup(cluster)}
                                    className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 transition-colors cursor-pointer text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs disabled:opacity-50 shrink-0"
                                    title={`Delete Ledger "${cluster.groupName}" and return attached bundles to available status`}
                                  >
                                    {deletingGroupId === cluster.groupId ? (
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
                                )}
                              </Can>
                              {/* Cash Settlement / Pay Button for Cash Office (When group is approved/completed and NOT yet paid) */}
                              {(cluster.allApproved || cluster.isCompleted) && !isGroupPaid && canBulkPay && (
                                <Can permission={['finance.bulk_payment_processs', 'finance.bulk_payment_process']}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLastActiveRowKey(`group_${cluster.groupId}`);
                                      setGroupToPay(cluster);
                                      setPayRecipientName('');
                                      setPayRemarks('');
                                      setPayingGroupError(null);
                                    }}
                                    disabled={payingGroupId === cluster.groupId}
                                    className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-all shadow-xs hover:shadow cursor-pointer disabled:opacity-50 shrink-0"
                                    title="Perform Cash Settlement / Mark as Paid for this completed Ledger"
                                  >
                                    {payingGroupId === cluster.groupId ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Settling...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Banknote className="w-3.5 h-3.5" />
                                        <span>Cash Settlement</span>
                                      </>
                                    )}
                                  </button>
                                </Can>
                              )}

                              {/* Review / Action Button for pending approver */}
                              {isGroupInReview && canUserApproveGroup && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLastActiveRowKey(`group_${cluster.groupId}`);
                                    toggleGroupAccordion(cluster.groupId)
                                    setSelectedGroupForAction(cluster);
                                    setActionComments(groupReworkComments[cluster.groupId] || '');
                                    setActionCommentError('');
                                  }}
                                  className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[11px] font-semibold hover:bg-amber-500/25 transition-all cursor-pointer inline-flex items-center gap-1"
                                  title={`Review and action pending approval step: ${groupPendingStep}`}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Review / Action</span>
                                </button>
                              )}

                              {/* Paid Badge if already settled, otherwise Waiting in CO if approved and user cannot pay */}
                              {isGroupPaid ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 inline-flex items-center gap-1 shrink-0">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                  <span>Settled</span>
                                </span>
                              ) : (cluster.allApproved || cluster.isCompleted) && !canBulkPay ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 shrink-0" title="Waiting in Cash Office for group settlement">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  <span>Waiting in CO</span>
                                </span>
                              ) : null}

                              <Can permission={['finance.view_ledger_report', 'reports.can_generate_report'] as any}>
                                {/* Group Report Button (Available once submitted / in review / approved / completed) */}
                                {(cluster.isCompleted || groupStatus !== 'Draft') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLastActiveRowKey(`group_${cluster.groupId}`);
                                      setSelectedGroupForReport(cluster);
                                    }}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-all shadow-xs hover:shadow cursor-pointer shrink-0"
                                    title="Open comprehensive group financial settlement report"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>Report</span>
                                  </button>
                                )}
                              </Can>


                            </div>
                          </td>

                        </tr>

                        {/* 1.5 GROUP APPROVAL STEPPER & INLINE ACTION CONTROLS */}
                        {!isGroupCollapsed && (showStepper || (isGroupInReview && canUserApproveGroup)) && (groupStatus !== "Draft") && (
                          <tr className="bg-surface-container-lowest/80 border-b border-outline-variant/60">
                            <td colSpan={8} className="px-6 py-3 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3 border-l-4 border-l-indigo-500/60">
                              {showStepper && (
                                <>
                                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-outline-variant/40">
                                    <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                                      <GitCommit className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      <span>Approval Pipeline • {cluster.groupName}</span>
                                    </span>
                                    <span className="text-[10px] text-on-surface-variant font-medium">
                                      Status: <span className="font-semibold text-on-surface">{groupStatus}</span>
                                    </span>
                                  </div>
                                  {renderGroupApprovalStepper(cluster)}
                                </>
                              )}


                              {isGroupInReview && canUserApproveGroup && (
                                <div className="p-3 bg-surface-container rounded border border-outline-variant/80 flex flex-wrap items-center justify-between gap-2 shadow-xs mt-2">
                                  <div className="flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-primary" />
                                    <span className="text-xs font-bold text-on-surface">Action Pending Approval Step: {groupPendingStep}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <input
                                      type="text"
                                      value={groupReworkComments[cluster.groupId] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setGroupReworkComments(prev => ({ ...prev, [cluster.groupId]: val }));
                                        if (val.trim()) setGroupReworkErrors(prev => ({ ...prev, [cluster.groupId]: '' }));
                                      }}
                                      placeholder="Review comments (required for rework)..."
                                      className={`px-2.5 py-1.5 rounded border text-xs text-on-surface focus:outline-none placeholder:text-on-surface-variant/60 w-64 ${groupReworkErrors[cluster.groupId]
                                        ? 'border-rose-500 bg-rose-500/10'
                                        : 'border-outline-variant bg-surface-container-low focus:border-primary'
                                        }`}
                                    />
                                    <button
                                      type="button"
                                      disabled={actioningGroupId === cluster.groupId}
                                      onClick={() => handleGroupAction(cluster, 'APPROVED')}
                                      className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      {actioningGroupId === cluster.groupId && actioningGroupAction === 'APPROVED' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      )}
                                      <span>Approve</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actioningGroupId === cluster.groupId}
                                      onClick={() => handleGroupAction(cluster, 'REWORK')}
                                      className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      {actioningGroupId === cluster.groupId && actioningGroupAction === 'REWORK' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      )}
                                      <span>Rework</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}

                        {/* 2. BUNDLE-WISE VIEW ROWS IN THIS GROUP */}
                        {!isGroupCollapsed && hierarchyGrouping === 'bundle_wise' && (
                          <>
                            {/* CHILD BUNDLE SUB-HEADER */}
                            <tr className="bg-indigo-50/50 dark:bg-indigo-950/30 text-on-surface-variant uppercase text-[9px] tracking-wider border-y border-outline-variant select-none border-l-4 border-l-indigo-500/60">
                              <th className="w-9 px-2 py-2 text-center"></th>
                              <th
                                onClick={() => handleBundleSort('bundle_id')}
                                className="px-4 py-2 cursor-pointer hover:text-primary transition-colors group"
                                title="Sort by Bundle ID"
                              >
                                <div className="inline-flex items-center gap-1">
                                  <span>Bundle ID</span>
                                  {renderSortIndicator(bundleSortField, 'bundle_id', bundleSortDirection)}
                                </div>
                              </th>
                              <th
                                onClick={() => handleBundleSort('claim_bundle')}
                                className="px-4 py-2 cursor-pointer hover:text-primary transition-colors group"
                                title="Sort by Claim Bundle"
                              >
                                <div className="inline-flex items-center gap-1">
                                  <span>Claim Bundle</span>
                                  {renderSortIndicator(bundleSortField, 'claim_bundle', bundleSortDirection)}
                                </div>
                              </th>
                              <th
                                onClick={() => handleBundleSort('batches')}
                                className="px-4 py-2 cursor-pointer hover:text-primary transition-colors group"
                                title="Sort by Batches Count"
                              >
                                <div className="inline-flex items-center gap-1">
                                  <span>Batches</span>
                                  {renderSortIndicator(bundleSortField, 'batches', bundleSortDirection)}
                                </div>
                              </th>
                              <th
                                onClick={() => handleBundleSort('expenses')}
                                className="px-4 py-2 cursor-pointer hover:text-primary transition-colors group"
                                title="Sort by Expenses Count"
                              >
                                <div className="inline-flex items-center gap-1">
                                  <span>Expenses</span>
                                  {renderSortIndicator(bundleSortField, 'expenses', bundleSortDirection)}
                                </div>
                              </th>
                              <th
                                onClick={() => handleBundleSort('worker')}
                                className="px-4 py-2 cursor-pointer hover:text-primary transition-colors group"
                                title="Sort by Worker Name"
                              >
                                <div className="inline-flex items-center gap-1">
                                  <span>Worker</span>
                                  {renderSortIndicator(bundleSortField, 'worker', bundleSortDirection)}
                                </div>
                              </th>
                              <th
                                onClick={() => handleBundleSort('bundle_total')}
                                className="px-4 py-2 text-right cursor-pointer hover:text-primary transition-colors group"
                                title="Sort by Bundle Total Amount"
                              >
                                <div className="inline-flex items-center justify-end gap-1 w-full">
                                  <span>Bundle Total</span>
                                  {renderSortIndicator(bundleSortField, 'bundle_total', bundleSortDirection)}
                                </div>
                              </th>
                              {/* <Can permission='finance.change_ledger'> */}
                              <th className="px-4 py-2 text-right">Actions</th>
                              {/* </Can> */}
                            </tr>
                            {getSortedGroupBundleBreakdown(cluster).map((bundleItem, bIdx) => {
                              const bundleKey = `${cluster.groupId}_${bundleItem.bundleId}`;
                              const isBundleExpanded = !!expandedGroupBundleKeys[bundleKey];
                              const isOdd = bIdx % 2 === 1;

                              const isLastActiveBundle = lastActiveRowKey === `bundle_${bundleKey}` || lastActiveRowKey === bundleItem.bundleId;

                              return (
                                <React.Fragment key={`group_bundle_${bundleKey}`}>
                                  <tr
                                    onClick={() => {
                                      setLastActiveRowKey(`bundle_${bundleKey}`);
                                      toggleExpandGroupBundle(cluster.groupId, bundleItem.bundleId);
                                    }}
                                    className={`cursor-pointer transition-colors ${isLastActiveBundle
                                      ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                                      : 'border-l-4 border-l-indigo-500/40 ' + (isBundleExpanded
                                        ? 'bg-purple-500/10 dark:bg-purple-500/20'
                                        : isOdd
                                          ? 'bg-slate-100/90 dark:bg-slate-800/45 hover:bg-slate-200/90 dark:hover:bg-slate-700/60'
                                          : 'bg-white dark:bg-surface-container-lowest hover:bg-slate-50 dark:hover:bg-slate-800/30')
                                      }`}
                                  >
                                    <td className="w-9 px-2 py-2.5 text-center relative" onClick={(e) => { e.stopPropagation(); setLastActiveRowKey(`bundle_${bundleKey}`); toggleExpandGroupBundle(cluster.groupId, bundleItem.bundleId); }}>
                                      <div className="flex items-center justify-center relative">
                                        <button type="button" className="p-1 rounded transition-colors cursor-pointer relative z-10">
                                          {isBundleExpanded ? <ChevronDown className="w-3.5 h-3.5 text-purple-600" /> : <ChevronRight className="w-3.5 h-3.5 text-purple-600" />}
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-semibold text-purple-700 dark:text-purple-300">
                                      {bundleItem.bundleId}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                        <Package className="w-3 h-3 shrink-0" />
                                        <span>Bundle {bundleItem.bundleId}</span>
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/60" title={bundleItem.ledgerBatches.map(b => b.batchName).join(', ')}>
                                        {bundleItem.ledgerBatches.length} Batch{bundleItem.ledgerBatches.length > 1 ? 'es' : ''}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                                        {bundleItem.expenses.length} exp
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-on-surface-variant font-medium">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <AvatarCircle
                                          user={bundleItem.workerDetail}
                                          name={bundleItem.workerName}
                                          image={bundleItem.profileImage || bundleItem.workerDetail?.profile_image}
                                          size="xs"
                                        />
                                        <span className="truncate">{bundleItem.workerName}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-bold text-on-surface">
                                      {bundleItem.totalAmount.toFixed(3)}
                                    </td>
                                    <td className="px-4 py-2.5 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                        {/* Cash Settlement Action / Status for Bundle */}
                                        {bundleItem.status === 'Paid' || isGroupPaid ? (
                                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 inline-flex items-center gap-1 shrink-0">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                            <span>Settled</span>
                                          </span>
                                        ) : (cluster.allApproved || cluster.isCompleted) ? (
                                          canSinglePay ? (
                                            <Can permission="finance.single_payment_process">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const baseBundle = bundleItem.bundleObj || (bundles || []).find(b => b.claim_id === bundleItem.bundleId);
                                                  const targetBundle = {
                                                    ...(baseBundle || {}),
                                                    claim_id: bundleItem.bundleId,
                                                    total_claimed_amount: String(baseBundle?.total_claimed_amount || bundleItem.totalAmount),
                                                    worker_detail: baseBundle?.worker_detail || bundleItem.workerDetail,
                                                    worker_name: bundleItem.workerName || baseBundle?.worker_detail?.full_name,
                                                    profile_image: bundleItem.profileImage || baseBundle?.worker_detail?.profile_image,
                                                    status: 'Approved'
                                                  };
                                                  setShowPaymentModal(targetBundle as any);
                                                }}
                                                className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-all shadow-xs hover:shadow cursor-pointer shrink-0"
                                                title={`Perform Cash Settlement for Bundle #${bundleItem.bundleId}`}
                                              >
                                                <Banknote className="w-3.5 h-3.5" />
                                                <span>Cash Settlement</span>
                                              </button>
                                            </Can>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 shrink-0" title="Waiting in Cash Office for settlement">
                                              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                              <span>Waiting in CO</span>
                                            </span>
                                          )
                                        ) : (groupStatus === 'In Review' || isGroupInReview || (!cluster.allApproved && groupStatus !== 'Draft')) ? (
                                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 shrink-0" title="Waiting for ledger approval">
                                            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                            <span>Waiting Approval</span>
                                          </span>
                                        ) : null}

                                        {/* Remove Bundle action (If approved, requires super_permission) */}
                                        {(() => {
                                          if (groupStatus === "In Review" || isGroupPaid) return null;
                                          const targetLedger = cluster.ledgers.find(l => (l.bundles || []).some((b: any) => (b.claim_id || b.id) === bundleItem.bundleId));
                                          if (targetLedger?.status === 'Paid') return null;

                                          const isBundleApproved = groupStatus === 'Approved' || cluster.allApproved || cluster.isCompleted || targetLedger?.status === 'Approved';
                                          const isRemovingBundle = removingBundleKey === `${cluster.groupId}_${bundleItem.bundleId}`;

                                          const removeBundleBtn = (
                                            <button
                                              type="button"
                                              disabled={isRemovingBundle}
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const totalBundlesInGroup = getGroupBundleBreakdown(cluster).length;
                                                if (totalBundlesInGroup <= 1) {
                                                  alert("Cannot remove the only bundle. Please delete the Ledger Batch instead.");
                                                  return;
                                                }
                                                setRemovingBundleKey(`${cluster.groupId}_${bundleItem.bundleId}`);
                                                try {
                                                  if (handleRemoveBundleFromGroup) {
                                                    await handleRemoveBundleFromGroup(Number(cluster.groupId), bundleItem.bundleId);
                                                  } else if (handleRemoveBundleFromLedger) {
                                                    if (targetLedger) {
                                                      await handleRemoveBundleFromLedger(targetLedger.ledger_id, bundleItem.bundleId);
                                                    }
                                                  }
                                                } finally {
                                                  setRemovingBundleKey(null);
                                                }
                                              }}
                                              className="px-2.5 py-1 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-medium disabled:opacity-50"
                                              title="Remove Bundle from this Ledger"
                                            >
                                              {isRemovingBundle ? (
                                                <>
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                  <span>Removing...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                  <span>Remove Bundle</span>
                                                </>
                                              )}
                                            </button>
                                          );

                                          return isBundleApproved ? (
                                            <Can permission="super_permission">
                                              {removeBundleBtn}
                                            </Can>
                                          ) : (
                                            <Can permission="finance.change_ledger">
                                              {removeBundleBtn}
                                            </Can>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                  </tr>

                                  {/* EXPANDED BUNDLE DETAILS TABLE */}
                                  {isBundleExpanded && (
                                    <tr className="bg-surface-container-lowest/90 dark:bg-surface-container-low/50">
                                      <td colSpan={8} className="p-4 border-b border-outline-variant space-y-3">
                                        <div className="overflow-x-auto rounded border border-outline-variant bg-surface-container shadow-2xs">
                                          <table className="w-full text-xs text-left text-on-surface">
                                            <thead className="bg-surface-container-high/80 text-on-surface-variant uppercase text-[9px] tracking-wider border-b border-outline-variant select-none">
                                              <tr>
                                                <th
                                                  onClick={() => handleExpenseSort('exp')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Expense ID"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Exp</span>
                                                    {renderSortIndicator(expenseSortField, 'exp', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('description')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Description"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Description</span>
                                                    {renderSortIndicator(expenseSortField, 'description', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('target_batch')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Target Ledger Batch"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Target Ledger Batch</span>
                                                    {renderSortIndicator(expenseSortField, 'target_batch', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('sub_department')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Sub-Department"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Sub-Department</span>
                                                    {renderSortIndicator(expenseSortField, 'sub_department', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('ticket')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Ticket / WO"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Ticket / WO</span>
                                                    {renderSortIndicator(expenseSortField, 'ticket', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('category')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Category"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Category</span>
                                                    {renderSortIndicator(expenseSortField, 'category', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('date')}
                                                  className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Date"
                                                >
                                                  <div className="inline-flex items-center gap-1">
                                                    <span>Date</span>
                                                    {renderSortIndicator(expenseSortField, 'date', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <th
                                                  onClick={() => handleExpenseSort('amount')}
                                                  className="px-3 py-2.5 text-right cursor-pointer hover:text-primary transition-colors group"
                                                  title="Sort by Amount"
                                                >
                                                  <div className="inline-flex items-center justify-end gap-1 w-full">
                                                    <span>Amount</span>
                                                    {renderSortIndicator(expenseSortField, 'amount', expenseSortDirection)}
                                                  </div>
                                                </th>
                                                <Can permission='finance.change_ledger'>
                                                  <th className="px-3 py-2.5 text-right">Action</th>
                                                </Can>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-outline-variant/40">
                                              {getSortedBundleExpenses(bundleItem).map((exp, eIdx) => {
                                                const expSubDept = exp.ticket_details?.sub_department_name || (exp as any).sub_department_name || '-';
                                                const parentLedger = cluster.ledgers.find(l => (l.expenses || []).some(e => e.expense_id === exp.expense_id));
                                                const matchingBatch = parentLedger?.ledger_batch_detail?.batch_name
                                                  || bundleItem.ledgerBatches.find(bb => {
                                                    const batchObj = (ledgerBatches || internalBatches || []).find(b => b.batch_name === bb.batchName);
                                                    const sds = (batchObj?.sub_departments || []).map(sd => typeof sd === 'number' ? sd : (sd as any).sub_department_id);
                                                    const expSdId = exp.ticket_details?.sub_department_id ?? exp.sub_department_id;
                                                    return expSdId && sds.includes(Number(expSdId));
                                                  })?.batchName
                                                  || bundleItem.ledgerBatches[0]?.batchName
                                                  || 'Unassigned';
                                                const isExpEditable = parentLedger ? (!cluster.isCompleted && parentLedger.status !== 'Paid') : (!cluster.isCompleted);

                                                const isLastActiveExp = lastActiveRowKey === `exp_${exp.expense_id}`;

                                                return (
                                                  <tr
                                                    key={exp.expense_id}
                                                    onClick={() => setLastActiveRowKey(`exp_${exp.expense_id}`)}
                                                    className={`cursor-pointer transition-colors ${isLastActiveExp
                                                      ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                                                      : eIdx % 2 === 1 ? 'bg-surface-container-low/50' : 'bg-surface-container'
                                                      }`}
                                                  >
                                                    <td className="py-2 pr-3 pl-8 font-mono text-primary font-medium relative">
                                                      {/* Rose connector */}
                                                      <div className="absolute left-[16px] top-0 bottom-0 w-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                      <div className="absolute left-[16px] top-1/2 -translate-y-1/2 w-2.5 h-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                      <span>{exp.expense_id}</span>
                                                    </td>
                                                    <td className="px-3 py-2 font-medium text-on-surface">{exp.remarks || exp.ticket_details?.title || (exp as any).description || 'Expense'}</td>
                                                    <td className="px-3 py-2">
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                                        <Boxes className="w-2.5 h-2.5 shrink-0" />
                                                        <span>{matchingBatch}</span>
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-on-surface-variant font-medium">{expSubDept}</td>
                                                    <td className="px-3 py-2" >

                                                      <button
                                                        type="button"
                                                        onClick={() => setSelectedTicketForModal && setSelectedTicketForModal(getTicketForModal(exp))}
                                                        className="font-mono font-medium text-primary hover:underline text-[11px] cursor-pointer"
                                                      >
                                                        {formatTicketDisplay(exp)}
                                                      </button>
                                                    </td>


                                                    <td className="px-3 py-2">
                                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-container-highest text-on-surface font-medium">
                                                        {exp.expense_type_detail?.expense_name || (typeof exp.expense_type === 'object' && exp.expense_type ? exp.expense_type.expense_name : ((exp as any).expense_type_name || (exp as any).category_name || 'Expense'))}
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-on-surface-variant text-[11px]">{exp.expense_date || '-'}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                      {parseFloat(exp.amount as any || '0').toFixed(3)}
                                                    </td>
                                                    <Can permission='finance.change_ledger'>

                                                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                        {parentLedger && isExpEditable && (
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              if (isOnlyExpenseInBundleOrLedger(parentLedger, exp, bundleItem.expenses?.length)) {
                                                                confirmPopup({
                                                                  preset: "remove",
                                                                  button2: "Close",
                                                                  title: "Cannot Remove Expense",
                                                                  description: "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.",
                                                                  showButton1: false,
                                                                });
                                                                return;
                                                              }
                                                              handleRemoveExpenseFromLedger(parentLedger.ledger_id, exp.expense_id);
                                                            }}
                                                            className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
                                                            title="Remove Expense from this Ledger Batch"
                                                          >
                                                            <Trash2 className="w-3 h-3" />
                                                            <span>Remove</span>
                                                          </button>
                                                        )}
                                                      </td>
                                                    </Can>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </>
                        )}

                        {/* 2. BATCH-WISE VIEW ROWS IN THIS GROUP */}
                        {!isGroupCollapsed && hierarchyGrouping === 'batch_wise' && (
                          <>
                            {/* CHILD BATCH SUB-HEADER */}
                            <tr className="bg-indigo-50/50 dark:bg-indigo-950/30 text-on-surface-variant uppercase text-[9px] tracking-wider border-y border-outline-variant select-none border-l-4 border-l-indigo-500/60">
                              <th className="w-9 px-2 py-2 text-center"></th>
                              <th className="px-4 py-2">Batch ID</th>
                              <th className="px-4 py-2">Batch Name</th>
                              <th className="px-4 py-2">Bundles</th>
                              <th className="px-4 py-2">Expenses</th>
                              <th className="px-4 py-2">Created By</th>
                              <th className="px-4 py-2 text-right">Batch Total</th>
                              {/* <th className="px-4 py-2 text-center">Details</th> */}
                            </tr>
                            {cluster.ledgers.map((l, lIdx) => {
                              const isExpanded = !!expandedLedgerIds[l.ledger_id];
                              const isOdd = lIdx % 2 === 1;
                              const ledgerExpenses = Array.isArray(l.expenses) ? l.expenses : [];
                              const activeViewMode = ledgerViewModes[l.ledger_id] || globalViewMode;
                              const isLedgerEditable = !cluster.isCompleted && l.status !== 'Approved' && l.status !== 'Paid';

                              const isLastActiveLedger = lastActiveRowKey === `ledger_${l.ledger_id}` || lastActiveRowKey === l.ledger_id;

                              return (
                                <React.Fragment key={l.ledger_id}>
                                  {/* MAIN ROW */}
                                  <tr
                                    onClick={() => {
                                      setLastActiveRowKey(`ledger_${l.ledger_id}`);
                                      toggleExpandLedger(l.ledger_id);
                                    }}
                                    className={`cursor-pointer transition-colors ${isLastActiveLedger
                                      ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                                      : 'border-l-4 border-l-indigo-500/40 ' + (isExpanded
                                        ? 'bg-primary/10 dark:bg-primary/20'
                                        : isMultiLineView
                                          ? isOdd
                                            ? 'bg-slate-100/90 dark:bg-slate-800/45 hover:bg-slate-200/90 dark:hover:bg-slate-700/60'
                                            : 'bg-white dark:bg-surface-container-lowest hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                          : 'hover:bg-surface-container-high')
                                      }`}
                                  >
                                    <td className="w-9 px-2 py-2.5 text-center relative" onClick={(e) => { e.stopPropagation(); setLastActiveRowKey(`ledger_${l.ledger_id}`); toggleExpandLedger(l.ledger_id); }}>
                                      <div className="flex items-center justify-center relative">
                                        <button
                                          type="button"
                                          className="p-1 rounded transition-colors cursor-pointer relative z-10"
                                        >
                                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-semibold text-primary">
                                      {l.ledger_id}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {l.ledger_batch_detail ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                          <Boxes className="w-3 h-3 shrink-0" />
                                          <span>{l.ledger_batch_detail.batch_name}</span>
                                        </span>
                                      ) : (
                                        <span className="text-on-surface-variant italic text-[11px]">Unassigned</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/60">
                                        {l.bundles?.length || 0} Bundles
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                                        {ledgerExpenses.length} exp
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-on-surface-variant font-medium">
                                      {l.created_by_detail?.full_name || l.created_by_detail?.username || 'User'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-bold text-on-surface">
                                      {parseFloat(l.total_amount).toFixed(3)}
                                    </td>

                                    {/* <td className="px-4 py-2.5 text-center text-on-surface-variant text-[11px]" onClick={(e) => {

                                      e.stopPropagation()
                                      setLastActiveRowKey(`ledger_${l.ledger_id}`);
                                      toggleExpandLedger(l.ledger_id);
                                    }
                                    }>
                                      <span className="text-[10px] text-on-surface-variant font-medium">
                                        {isExpanded ? 'Expanded' : 'Click to view'}
                                      </span>
                                    </td> */}
                                  </tr>

                                  {/* MULTI-LINE VIEW SECOND ROW (Batch summary) */}
                                  {isMultiLineView && !isExpanded && (
                                    <tr
                                      onClick={() => setLastActiveRowKey(`ledger_${l.ledger_id}`)}
                                      className={`transition-colors ${isLastActiveLedger
                                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-none'
                                        : 'border-b border-outline-variant ' + (isOdd
                                          ? 'bg-slate-100/90 dark:bg-slate-800/45'
                                          : 'bg-white dark:bg-surface-container-lowest')
                                        }`}
                                    >
                                      <td colSpan={8} className="px-4 py-2">
                                        <div className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded border text-xs ${isOdd
                                          ? 'bg-white dark:bg-surface-container/70 border-outline-variant/80 shadow-xs'
                                          : 'bg-surface-container-low dark:bg-surface-container-low/70 border-outline-variant/60 shadow-2xs'
                                          }`}>
                                          <div className="flex items-center gap-3 text-on-surface-variant text-[11px]">
                                            <span className="font-semibold text-on-surface">Batch {l.ledger_id} Details:</span>
                                            <span>{l.ledger_batch_detail?.batch_name || 'Unassigned'}</span>
                                            <span>•</span>
                                            <span>{l.bundles?.length || 0} Bundle(s)</span>
                                            <span>•</span>
                                            <span>{ledgerExpenses.length} Expense(s)</span>
                                            {l.remarks && (
                                              <>
                                                <span>•</span>
                                                <span className="italic">"{l.remarks}"</span>
                                              </>
                                            )}
                                          </div>
                                          <div className="font-bold text-on-surface">
                                            KD {parseFloat(l.total_amount).toFixed(3)}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}

                                  {/* CLEAN, FLAT EXPANDED ROW (NO NESTED BOXES) */}
                                  {isExpanded && (
                                    <tr
                                      onClick={() => setLastActiveRowKey(`ledger_${l.ledger_id}`)}
                                      className={`transition-colors ${isLastActiveLedger
                                        ? 'bg-blue-50/40 dark:bg-blue-950/20 border-none'
                                        : 'bg-surface-container-lowest/90 dark:bg-surface-container-low/50'
                                        }`}
                                    >
                                      <td colSpan={8} className="p-4 border-b border-outline-variant space-y-3">



                                        {/* 4. FLAT STRUCTURED EXPENSES TABLE */}
                                        {ledgerExpenses.length === 0 ? (
                                          <p className="text-xs text-on-surface-variant italic py-2">
                                            No classified expenses attached to this Ledger Batch.
                                          </p>
                                        ) : (
                                          <div className="overflow-x-auto rounded border border-outline-variant bg-surface-container shadow-2xs">
                                            <table className="w-full text-xs text-left text-on-surface">
                                              <thead className="bg-surface-container-high/80 text-on-surface-variant uppercase text-[9px] tracking-wider border-b border-outline-variant select-none">
                                                <tr>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('exp')}
                                                    className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Expense ID"
                                                  >
                                                    <div className="inline-flex items-center gap-1">
                                                      <span>Exp</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'exp', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('description')}
                                                    className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Description"
                                                  >
                                                    <div className="inline-flex items-center gap-1">
                                                      <span>Description</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'description', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('ticket')}
                                                    className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Ticket / WO"
                                                  >
                                                    <div className="inline-flex items-center gap-1">
                                                      <span>Ticket / WO</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'ticket', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('category')}
                                                    className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Category"
                                                  >
                                                    <div className="inline-flex items-center gap-1">
                                                      <span>Category</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'category', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('date')}
                                                    className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Date"
                                                  >
                                                    <div className="inline-flex items-center gap-1">
                                                      <span>Date</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'date', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('source_bundle')}
                                                    className="px-3 py-2.5 cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Source Bundle"
                                                  >
                                                    <div className="inline-flex items-center gap-1">
                                                      <span>Source Bundle</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'source_bundle', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th
                                                    onClick={() => handleFlatExpenseSort('amount')}
                                                    className="px-3 py-2.5 text-right cursor-pointer hover:text-primary transition-colors group"
                                                    title="Sort by Amount"
                                                  >
                                                    <div className="inline-flex items-center justify-end gap-1 w-full">
                                                      <span>Amount</span>
                                                      {renderSortIndicator(flatExpenseSortField, 'amount', flatExpenseSortDirection)}
                                                    </div>
                                                  </th>
                                                  <th className="px-3 py-2.5 text-right">Actions</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-outline-variant/40">
                                                {/* VIEW MODE 1: BY SUB-DEPARTMENT */}
                                                {activeViewMode === 'by_sub_department' && (
                                                  getSubDepartmentBreakdown(ledgerExpenses).map(sd => {
                                                    const sdKey = String(sd.subDeptId || sd.subDeptName);
                                                    const isExpanded = !!expandedSubDepts[`${l.ledger_id}_${sdKey}`];

                                                    const isLastActiveSd = lastActiveRowKey === `sd_${l.ledger_id}_${sdKey}`;

                                                    return (
                                                      <React.Fragment key={sdKey}>
                                                        {/* LEVEL 3: Sub-Department Header */}
                                                        <tr
                                                          onClick={() => {
                                                            setLastActiveRowKey(`sd_${l.ledger_id}_${sdKey}`);
                                                            toggleSubDeptAccordion(l.ledger_id, sdKey);
                                                          }}
                                                          className={`cursor-pointer transition-all select-none ${isLastActiveSd
                                                            ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none shadow-2xs'
                                                            : isExpanded
                                                              ? 'border-t border-outline-variant/60 bg-purple-50/90 dark:bg-purple-950/40 hover:bg-purple-100/80 dark:hover:bg-purple-950/60 shadow-2xs'
                                                              : 'border-t border-outline-variant/60 bg-surface-container/80 hover:bg-surface-container-high text-on-surface'
                                                            }`}
                                                        >
                                                          <td colSpan={6} className="py-2.5 pr-3 pl-3.5 relative">
                                                            <div className="flex items-center gap-2 pl-1">
                                                              <button
                                                                type="button"
                                                                className="p-0.5 rounded hover:bg-surface-container-highest/60 text-on-surface-variant cursor-pointer transition-transform"
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  setLastActiveRowKey(`sd_${l.ledger_id}_${sdKey}`);
                                                                  toggleSubDeptAccordion(l.ledger_id, sdKey);
                                                                }}
                                                                title={isExpanded ? 'Collapse sub-department' : 'Expand sub-department'}
                                                              >
                                                                {isExpanded ? (
                                                                  <ChevronDown className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                                                ) : (
                                                                  <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                                                                )}
                                                              </button>
                                                              <Building2 className={`w-4 h-4 ${isExpanded ? 'text-purple-600 dark:text-purple-400' : 'text-on-surface-variant'}`} />
                                                              <span className={`text-xs ${isExpanded ? 'font-bold text-purple-950 dark:text-purple-100' : 'font-semibold text-on-surface'}`}>
                                                                {sd.subDeptName}
                                                              </span>
                                                              <span className={`text-[10px] px-2 py-0.5 roundedf font-medium ${isExpanded
                                                                ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                                                                : 'bg-surface-container-highest text-on-surface-variant'
                                                                }`}>
                                                                {sd.expenses.length} exp • {sd.workersCount} worker{sd.workersCount > 1 ? 's' : ''}
                                                              </span>
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                                            {sd.totalAmount.toFixed(3)}
                                                          </td>
                                                          <td className="px-3 py-2.5 text-right">
                                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${isExpanded
                                                              ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                                              : 'text-on-surface-variant'
                                                              }`}>
                                                              {isExpanded ? 'Expanded' : 'Collapsed'}
                                                            </span>
                                                          </td>
                                                        </tr>

                                                        {/* LEVEL 4: Nested Worker Accordions */}
                                                        {isExpanded && sd.workers.map(w => {
                                                          const wKey = String(w.workerId || w.workerName);
                                                          const isChildExpanded = !!expandedNestedWorkers[`${l.ledger_id}_${sdKey}_${wKey}`];

                                                          return (
                                                            <React.Fragment key={wKey}>
                                                              <tr
                                                                onClick={() => toggleNestedWorkerAccordion(l.ledger_id, sdKey, wKey)}
                                                                className={`cursor-pointer transition-all select-none border-t border-outline-variant/40 ${isChildExpanded
                                                                  ? 'bg-rose-50/90 dark:bg-rose-950/40 hover:bg-rose-100/80 dark:hover:bg-rose-950/60 shadow-2xs'
                                                                  : 'bg-surface-container-low/70 hover:bg-surface-container text-on-surface'
                                                                  }`}
                                                              >
                                                                <td colSpan={6} className="py-2 pr-3 pl-8 relative">
                                                                  {/* Rose Child continuous vertical line running through children */}
                                                                  <div className="absolute left-[16px] top-0 bottom-0 w-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                  {/* Branch connector from Rose line to Child */}
                                                                  <div className="absolute left-[16px] top-1/2 -translate-y-1/2 w-3 h-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                  <div className="flex items-center gap-2 pl-1">
                                                                    <button
                                                                      type="button"
                                                                      className="p-0.5 rounded hover:bg-surface-container-highest/60 text-on-surface-variant cursor-pointer"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleNestedWorkerAccordion(l.ledger_id, sdKey, wKey);
                                                                      }}
                                                                      title={isChildExpanded ? 'Collapse worker expenses' : 'Expand worker expenses'}
                                                                    >
                                                                      {isChildExpanded ? (
                                                                        <ChevronDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                                                      ) : (
                                                                        <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant" />
                                                                      )}
                                                                    </button>
                                                                    <AvatarCircle
                                                                      user={w.workerObj}
                                                                      name={w.workerName}
                                                                      image={w.profileImage || w.workerObj?.profile_image}
                                                                      size="xs"
                                                                    />
                                                                    <span className={`text-xs truncate ${isChildExpanded ? 'font-bold text-rose-950 dark:text-rose-100' : 'font-semibold text-on-surface'}`}>
                                                                      {w.workerName}
                                                                    </span>
                                                                    <span className={`text-[10px] px-1.5 py-0.2 roundedf font-medium ${isChildExpanded
                                                                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                      : 'bg-surface-container-highest text-on-surface-variant'
                                                                      }`}>
                                                                      {w.expenses.length} exp
                                                                    </span>
                                                                  </div>
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                                                                  {w.totalAmount.toFixed(3)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                  <span className={`text-[10px] px-1.5 py-0.2 rounded ${isChildExpanded
                                                                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-medium'
                                                                    : 'text-on-surface-variant/70'
                                                                    }`}>
                                                                    {isChildExpanded ? 'Expanded' : 'Collapsed'}
                                                                  </span>
                                                                </td>
                                                              </tr>

                                                              {/* EXPENSES (CHILDREN OF WORKER) */}
                                                              {isChildExpanded && getSortedLedgerExpenses(w.expenses, activeViewMode).map(exp => {
                                                                const ticketLabel = formatTicketDisplay(exp);
                                                                const claimId = typeof exp.claim === 'object' && exp.claim !== null ? exp.claim.claim_id : exp.claim;
                                                                const expDescription = exp.ticket_details?.title || exp.remarks || exp.expense_type_detail?.expense_name || 'General';

                                                                const isLastActiveExp = lastActiveRowKey === `exp_${exp.expense_id}`;

                                                                return (
                                                                  <tr
                                                                    key={exp.expense_id}
                                                                    onClick={() => setLastActiveRowKey(`exp_${exp.expense_id}`)}
                                                                    className={`cursor-pointer transition-colors ${isLastActiveExp
                                                                      ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                                                                      : 'border-b border-outline-variant/30 bg-surface hover:bg-surface-container/70'
                                                                      }`}
                                                                  >
                                                                    <td className="py-2 pr-3 pl-12 font-medium text-primary relative">
                                                                      {/* Rose Child line */}
                                                                      <div className="absolute left-[16px] top-0 bottom-0 w-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                      {/* Horizontal connector to expense from Rose line */}
                                                                      <div className="absolute left-[16px] top-1/2 -translate-y-1/2 w-3 h-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                      <div className="flex items-center gap-1.5 pl-0.5">
                                                                        <span>{exp.expense_id}</span>
                                                                      </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 font-medium text-on-surface">
                                                                      <span className="truncate max-w-xs block" title={expDescription}>
                                                                        {expDescription}
                                                                      </span>
                                                                    </td>
                                                                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                                      {exp.ticket_details || exp.ticket ? (
                                                                        <button
                                                                          type="button"
                                                                          onClick={() => setSelectedTicketForModal && setSelectedTicketForModal(getTicketForModal(exp))}
                                                                          className="font-mono font-medium text-primary hover:underline text-[11px] cursor-pointer"
                                                                        >
                                                                          {ticketLabel}
                                                                        </button>
                                                                      ) : (
                                                                        <span className="text-on-surface-variant/60 italic text-[11px]">No Ticket</span>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-on-surface-variant">
                                                                      {exp.expense_type_detail?.expense_name || 'General'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-on-surface-variant">{exp.expense_date}</td>
                                                                    <td className="px-3 py-2">
                                                                      {claimId ? (
                                                                        <span className="text-[11px] font-semibold text-primary">
                                                                          Bundle {claimId}
                                                                        </span>
                                                                      ) : (
                                                                        <span className="text-[10px] text-on-surface-variant italic">Direct</span>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                                      {parseFloat(exp.amount).toFixed(3)}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                                      {isLedgerEditable && (
                                                                        <button
                                                                          onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (isOnlyExpenseInBundleOrLedger(l, exp)) {
                                                                              confirmPopup({
                                                                                preset: "remove",
                                                                                button2: "Close",
                                                                                title: "Cannot Remove Expense",
                                                                                description: "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.",
                                                                                showButton1: false,
                                                                              });
                                                                              return;
                                                                            }
                                                                            handleRemoveExpenseFromLedger(l.ledger_id, exp.expense_id);
                                                                          }}
                                                                          className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
                                                                          title="Remove Expense from this Ledger Batch"
                                                                        >
                                                                          <Trash2 className="w-3 h-3" />
                                                                          <span>Remove</span>
                                                                        </button>
                                                                      )}
                                                                    </td>
                                                                  </tr>
                                                                );
                                                              })}
                                                            </React.Fragment>
                                                          );
                                                        })}
                                                      </React.Fragment>
                                                    );
                                                  })
                                                )}
                                                {/* VIEW MODE 2: BY WORKER */}
                                                {activeViewMode === 'by_worker' && (
                                                  getWorkerBreakdown(ledgerExpenses).map(w => {
                                                    const wKey = String(w.workerId || w.workerName);
                                                    const isExpanded = !!expandedWorkers[`${l.ledger_id}_${wKey}`];

                                                    return (
                                                      <React.Fragment key={wKey}>
                                                        {/* LEVEL 3: Worker Header */}
                                                        <tr
                                                          onClick={() => toggleWorkerAccordion(l.ledger_id, wKey)}
                                                          className={`cursor-pointer transition-all select-none border-t border-outline-variant/60 ${isExpanded
                                                            ? 'bg-purple-50/90 dark:bg-purple-950/40 hover:bg-purple-100/80 dark:hover:bg-purple-950/60 shadow-2xs'
                                                            : 'bg-surface-container/80 hover:bg-surface-container-high text-on-surface'
                                                            }`}
                                                        >
                                                          <td colSpan={6} className="py-2.5 pr-3 pl-3.5 relative">
                                                            <div className="flex items-center gap-2 pl-1">
                                                              <button
                                                                type="button"
                                                                className="p-0.5 rounded hover:bg-surface-container-highest/60 text-on-surface-variant cursor-pointer transition-transform"
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  toggleWorkerAccordion(l.ledger_id, wKey);
                                                                }}
                                                                title={isExpanded ? 'Collapse worker' : 'Expand worker'}
                                                              >
                                                                {isExpanded ? (
                                                                  <ChevronDown className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                                                ) : (
                                                                  <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                                                                )}
                                                              </button>
                                                              <AvatarCircle
                                                                user={w.workerObj}
                                                                name={w.workerName}
                                                                image={w.profileImage || w.workerObj?.profile_image}
                                                                size="xs"
                                                              />
                                                              <span className={`text-xs truncate ${isExpanded ? 'font-bold text-purple-950 dark:text-purple-100' : 'font-semibold text-on-surface'}`}>
                                                                {w.workerName}
                                                              </span>

                                                              <span
                                                                className={`text-[10px] px-2 py-0.5 roundedf font-medium ${isExpanded
                                                                  ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                                                                  : 'bg-surface-container-highest text-on-surface-variant'
                                                                  }`}
                                                              >
                                                                {w.expenses.length} exp
                                                              </span>
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                                            {w.totalAmount.toFixed(3)}
                                                          </td>
                                                          <td className="px-3 py-2.5 text-right">
                                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${isExpanded
                                                              ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                                              : 'text-on-surface-variant'
                                                              }`}>
                                                              {isExpanded ? 'Expanded' : 'Collapsed'}
                                                            </span>
                                                          </td>
                                                        </tr>

                                                        {/* LEVEL 4: Nested Sub-Department Accordions */}
                                                        {isExpanded && w.subDepartments.map(sd => {
                                                          const sdKey = String(sd.subDeptId || sd.subDeptName);
                                                          const isChildExpanded = !!expandedNestedSubDepts[`${l.ledger_id}_${wKey}_${sdKey}`];

                                                          return (
                                                            <React.Fragment key={sdKey}>
                                                              <tr
                                                                onClick={() => toggleNestedSubDeptAccordion(l.ledger_id, wKey, sdKey)}
                                                                className={`cursor-pointer transition-all select-none border-t border-outline-variant/40 ${isChildExpanded
                                                                  ? 'bg-rose-50/90 dark:bg-rose-950/40 hover:bg-rose-100/80 dark:hover:bg-rose-950/60 shadow-2xs'
                                                                  : 'bg-surface-container-low/70 hover:bg-surface-container text-on-surface'
                                                                  }`}
                                                              >
                                                                <td colSpan={6} className="py-2 pr-3 pl-8 relative">
                                                                  {/* Rose Child continuous vertical line running through children */}
                                                                  <div className="absolute left-[16px] top-0 bottom-0 w-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                  {/* Branch connector from Rose line to Child */}
                                                                  <div className="absolute left-[16px] top-1/2 -translate-y-1/2 w-3 h-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                  <div className="flex items-center gap-2 pl-1">
                                                                    <button
                                                                      type="button"
                                                                      className="p-0.5 rounded hover:bg-surface-container-highest/60 text-on-surface-variant cursor-pointer"
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleNestedSubDeptAccordion(l.ledger_id, wKey, sdKey);
                                                                      }}
                                                                      title={isChildExpanded ? 'Collapse sub-department expenses' : 'Expand expenses'}
                                                                    >
                                                                      {isChildExpanded ? (
                                                                        <ChevronDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                                                      ) : (
                                                                        <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant" />
                                                                      )}
                                                                    </button>
                                                                    <Building2 className={`w-3.5 h-3.5 ${isChildExpanded ? 'text-rose-600 dark:text-rose-400' : 'text-on-surface-variant'}`} />
                                                                    <span className={`text-xs ${isChildExpanded ? 'font-bold text-rose-950 dark:text-rose-100' : 'font-semibold text-on-surface'}`}>
                                                                      {sd.subDeptName}
                                                                    </span>
                                                                    <span className={`text-[10px] px-1.5 py-0.2 roundedf font-medium ${isChildExpanded
                                                                      ? 'bg-rose-50/20 text-rose-700 dark:text-rose-300'
                                                                      : 'bg-surface-container-highest text-on-surface-variant'
                                                                      }`}>
                                                                      {sd.expenses.length} exp
                                                                    </span>
                                                                  </div>
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                                                                  {sd.totalAmount.toFixed(3)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right">
                                                                  <span className={`text-[10px] px-1.5 py-0.2 rounded ${isChildExpanded
                                                                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-medium'
                                                                    : 'text-on-surface-variant/70'
                                                                    }`}>
                                                                    {isChildExpanded ? 'Expanded' : 'Collapsed'}
                                                                  </span>
                                                                </td>
                                                              </tr>

                                                              {/* EXPENSES */}
                                                              {isChildExpanded && getSortedLedgerExpenses(sd.expenses, activeViewMode).map(exp => {
                                                                const ticketLabel = formatTicketDisplay(exp);
                                                                const claimId = typeof exp.claim === 'object' && exp.claim !== null ? exp.claim.claim_id : exp.claim;
                                                                const expDescription = exp.ticket_details?.title || exp.remarks || exp.expense_type_detail?.expense_name || 'General';

                                                                const isLastActiveExp = lastActiveRowKey === `exp_${exp.expense_id}`;

                                                                return (
                                                                  <tr
                                                                    key={exp.expense_id}
                                                                    onClick={() => setLastActiveRowKey(`exp_${exp.expense_id}`)}
                                                                    className={`cursor-pointer transition-colors ${isLastActiveExp
                                                                      ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                                                                      : 'border-b border-outline-variant/30 bg-surface hover:bg-surface-container/70'
                                                                      }`}
                                                                  >
                                                                    <td className="py-2 pr-3 pl-12 font-medium text-primary relative">
                                                                      {/* Rose Child */}
                                                                      <div className="absolute left-[16px] top-0 bottom-0 w-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                      {/* Horizontal connector to expense from Rose line */}
                                                                      <div className="absolute left-[16px] top-1/2 -translate-y-1/2 w-3 h-[2px] bg-rose-500/60 dark:bg-rose-400/60" />
                                                                      <div className="flex items-center gap-1.5 pl-0.5">
                                                                        <span>{exp.expense_id}</span>
                                                                      </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 font-medium text-on-surface">
                                                                      <span className="truncate max-w-xs block" title={expDescription}>
                                                                        {expDescription}
                                                                      </span>
                                                                    </td>
                                                                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                                      {exp.ticket_details || exp.ticket ? (
                                                                        <button
                                                                          type="button"
                                                                          onClick={() => setSelectedTicketForModal && setSelectedTicketForModal(getTicketForModal(exp))}
                                                                          className="font-mono font-medium text-primary hover:underline text-[11px] cursor-pointer"
                                                                        >
                                                                          {ticketLabel}
                                                                        </button>
                                                                      ) : (
                                                                        <span className="text-on-surface-variant/60 italic text-[11px]">No Ticket</span>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-on-surface-variant">
                                                                      {exp.expense_type_detail?.expense_name || 'General'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-on-surface-variant">{exp.expense_date}</td>
                                                                    <td className="px-3 py-2">
                                                                      {claimId ? (
                                                                        <span className="text-[11px] font-semibold text-primary">
                                                                          Bundle {claimId}
                                                                        </span>
                                                                      ) : (
                                                                        <span className="text-[10px] text-on-surface-variant italic">Direct</span>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                                      {parseFloat(exp.amount).toFixed(3)}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                                      {isLedgerEditable && (
                                                                        <button
                                                                          onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (isOnlyExpenseInBundleOrLedger(l, exp)) {
                                                                              confirmPopup({
                                                                                preset: "remove",
                                                                                button2: "Close",
                                                                                title: "Cannot Remove Expense",
                                                                                description: "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.",
                                                                                showButton1: false,
                                                                              });
                                                                              return;
                                                                            }
                                                                            handleRemoveExpenseFromLedger(l.ledger_id, exp.expense_id);
                                                                          }}
                                                                          className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
                                                                          title="Remove Expense from this Ledger Batch"
                                                                        >
                                                                          <Trash2 className="w-3 h-3" />
                                                                          <span>Remove</span>
                                                                        </button>
                                                                      )}
                                                                    </td>
                                                                  </tr>
                                                                );
                                                              })}
                                                            </React.Fragment>
                                                          );
                                                        })}
                                                      </React.Fragment>
                                                    );
                                                  })
                                                )}
                                                {/* VIEW MODE 3: FLAT TABLE */}
                                                {activeViewMode === 'flat_table' && (
                                                  getSortedLedgerExpenses(ledgerExpenses, activeViewMode).map((exp: any) => {
                                                    const subDeptName = exp.ticket_details?.sub_department_name || exp.sub_department_name || '-';
                                                    const ticketLabel = formatTicketDisplay(exp);
                                                    const claimId = typeof exp.claim === 'object' && exp.claim !== null ? exp.claim.claim_id : exp.claim;
                                                    const workerObj = exp.worker_detail || (typeof exp.worker === 'object' && exp.worker !== null ? exp.worker : null);
                                                    const workerName = workerObj?.full_name || workerObj?.username || (typeof exp.worker === 'object' && exp.worker !== null ? (exp.worker.full_name || exp.worker.username || `Worker ${exp.worker.id}`) : `Worker ${exp.worker}`);
                                                    const expDescription = exp.ticket_details?.title || exp.remarks || exp.expense_type_detail?.expense_name || '';

                                                    const isLastActiveExp = lastActiveRowKey === `exp_${exp.expense_id}`;

                                                    return (
                                                      <tr
                                                        key={exp.expense_id}
                                                        onClick={() => setLastActiveRowKey(`exp_${exp.expense_id}`)}
                                                        className={`cursor-pointer transition-colors ${isLastActiveExp
                                                          ? 'bg-blue-100/75 dark:bg-blue-900/40 border-none'
                                                          : 'hover:bg-surface-container-high/40'
                                                          }`}
                                                      >
                                                        <td className="px-3 py-2 font-medium text-primary">{exp.expense_id}</td>
                                                        <td className="px-3 py-2">
                                                          <div className="flex flex-col min-w-0">
                                                            {expDescription ? (
                                                              <span className="font-medium text-on-surface truncate max-w-xs" title={expDescription}>
                                                                {expDescription}
                                                              </span>
                                                            ) : null}
                                                            <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
                                                              <AvatarCircle
                                                                user={workerObj}
                                                                name={workerName}
                                                                size="xs"
                                                              />
                                                              <span className="text-[11px] text-on-surface-variant truncate">{workerName}</span>
                                                              <span className="text-[10px] px-1 py-0.2 rounded bg-surface-container-highest text-on-surface-variant border border-outline-variant shrink-0">
                                                                {subDeptName}
                                                              </span>
                                                            </div>
                                                          </div>
                                                        </td>
                                                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                          {exp.ticket_details || exp.ticket ? (
                                                            <button
                                                              type="button"
                                                              onClick={() => setSelectedTicketForModal && setSelectedTicketForModal(getTicketForModal(exp))}
                                                              className="font-mono font-medium text-primary hover:underline text-[11px] cursor-pointer text-left block"
                                                            >
                                                              <span>{ticketLabel}</span>
                                                              {exp.ticket_details?.title && (
                                                                <span className="block text-[10px] text-on-surface-variant truncate max-w-xs font-normal">
                                                                  {exp.ticket_details.title}
                                                                </span>
                                                              )}
                                                            </button>
                                                          ) : (
                                                            <span className="text-on-surface-variant/60 italic text-[11px]">No Ticket</span>
                                                          )}
                                                        </td>
                                                        <td className="px-3 py-2 text-on-surface-variant">
                                                          {exp.expense_type_detail?.expense_name || 'General'}
                                                        </td>
                                                        <td className="px-3 py-2 text-on-surface-variant">{exp.expense_date}</td>
                                                        <td className="px-3 py-2">
                                                          {claimId ? (
                                                            <span className="text-[11px] font-semibold text-primary">
                                                              Bundle {claimId}
                                                            </span>
                                                          ) : (
                                                            <span className="text-[10px] text-on-surface-variant italic">Direct</span>
                                                          )}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                          {parseFloat(exp.amount).toFixed(3)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                          {isLedgerEditable && (
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (isOnlyExpenseInBundleOrLedger(l, exp)) {
                                                                  confirmPopup({
                                                                    preset: "remove",
                                                                    button2: "Close",
                                                                    title: "Cannot Remove Expense",
                                                                    description: "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle.",
                                                                    showButton1: false,
                                                                  });
                                                                  return;
                                                                }
                                                                handleRemoveExpenseFromLedger(l.ledger_id, exp.expense_id);
                                                              }}
                                                              className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
                                                              title="Remove Expense from this Ledger Batch"
                                                            >
                                                              <Trash2 className="w-3 h-3" />
                                                              <span>Remove</span>
                                                            </button>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })
                                                )}
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
                          </>
                        )}

                        {/* END OF LEDGER CLOSING FOOTER */}
                        {!isGroupCollapsed && (
                          <tr className="bg-indigo-50/70 dark:bg-indigo-950/40 border-b-2 border-indigo-500/40 border-l-4 border-l-indigo-600 select-none">
                            <td colSpan={8} className="px-5 py-2.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-indigo-950 dark:text-indigo-200 font-medium">
                                  <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                  <span>End of <strong>{cluster.groupName}</strong> (Ledger-{cluster.groupId})</span>
                                  <span className="text-outline/40">•</span>
                                  <span className="text-[11px] text-on-surface-variant font-normal">
                                    {(cluster.ledgers?.length || 0)} Batch(es) • {cluster.totalBundlesCount || 0} Bundle(s) • Total: <strong className="text-on-surface font-bold">KD {(parseFloat(String(cluster.totalAmount || 0)) || 0).toFixed(3)}</strong>
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleGroupAccordion(cluster.groupId)}
                                  className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 hover:underline flex items-center gap-1 cursor-pointer bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/25 transition-colors"
                                  title="Collapse this Ledger Group"
                                >
                                  <ChevronsUp className="w-3.5 h-3.5" />
                                  <span>Collapse Ledger</span>
                                </button>
                              </div>
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

      {/* MODAL: ASSEMBLE LEDGER */}
      {showCreateLedgerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container rounded border border-outline-variant max-w-7xl w-full p-4 space-y-4 shadow-2xl min-h-[580px] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded bg-primary/10 text-primary">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                    <span>{selectedGroupTitle ? `Add Bundles to: ${selectedGroupTitle}` : 'Assemble Ledger'}</span>
                    {selectedGroupId && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 font-semibold">
                        Group #{selectedGroupId}
                      </span>
                    )}
                  </h3>
                  {selectedGroupId && (
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      Selected bundles will be assembled into batches and attached to this existing ledger group.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshAssemble}
                  disabled={isRefreshingAssemble}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
                  title="Refresh bundles and ticket data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAssemble ? 'animate-spin text-primary' : 'text-on-surface-variant'}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (submitting) return;
                    setShowCreateLedgerModal(false);
                    setSelectedBundleIds([]);
                    setSelectedGroupId('');
                    setNewGroupName('');
                  }}
                  className="p-1 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Error Message inside modal */}
            {errorMessage && (
              <div className="p-2.5 px-3 rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center justify-between shadow-2xs shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                {setErrorMessage && (
                  <button onClick={() => setErrorMessage(null)} className="p-0.5 hover:bg-red-500/20 rounded cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 pb-20">
              <div className="space-y-2">
                {/* Search & Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-primary" />
                      <span>Select Bundles to Assemble</span>
                    </label>
                    {selectedBundleIds.length > 0 && (
                      <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {selectedBundleIds.length} bundle{selectedBundleIds.length !== 1 ? 's' : ''} selected
                      </span>
                    )}
                  </div>

                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                    <input
                      type="text"
                      value={assembleSearch}
                      onChange={(e) => setAssembleSearch(e.target.value)}
                      placeholder="Search by bundle #, worker, ticket, or amount..."
                      className="w-full pl-9 pr-8 py-2 text-xs rounded border border-outline bg-surface-container text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                    {assembleSearch && (
                      <button
                        type="button"
                        onClick={() => setAssembleSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Select All Toolbar */}
                  {availableBundlesForAssemble.length > 0 && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container rounded border border-outline-variant text-xs">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          ref={selectAllCheckboxRef}
                          checked={allFilteredSelected}
                          onChange={handleToggleSelectAll}
                          disabled={filteredBundlesForAssemble.length === 0}
                          className="accent-primary cursor-pointer rounded"
                        />
                        <span className="font-semibold text-on-surface">
                          {allFilteredSelected ? 'Deselect All' : 'Select All'}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          ({filteredBundlesForAssemble.length} {filteredBundlesForAssemble.length === 1 ? 'bundle' : 'bundles'}
                          {assembleSearch.trim() ? ` matching "${assembleSearch.trim()}"` : ' available'})
                        </span>
                      </label>
                      {selectedBundleIds.length > 0 && (
                        <div className="text-[11px] font-semibold text-on-surface-variant">
                          Selected:{' '}
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            KD {availableBundlesForAssemble
                              .filter(b => selectedBundleIds.includes(b.claim_id))
                              .reduce((sum, b) => sum + (parseFloat(b.total_claimed_amount) || 0), 0)
                              .toFixed(3)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bundle Selection Grid */}
                <div className="max-h-72 overflow-y-auto border border-outline-variant rounded bg-surface-container-low p-2.5 scrollbar-thin">
                  {availableBundlesForAssemble.length === 0 ? (
                    <div className="p-8 text-center text-xs text-on-surface-variant italic">
                      No unassigned approved bundles available.
                    </div>
                  ) : filteredBundlesForAssemble.length === 0 ? (
                    <div className="p-8 text-center text-xs text-on-surface-variant italic">
                      No bundles found matching "{assembleSearch}".
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {filteredBundlesForAssemble.map((b) => {
                        const isSelected = selectedBundleIds.includes(b.claim_id);
                        const workerObj = b.worker_detail || (typeof b.worker === 'object' ? b.worker : null) || (b.expenses && b.expenses[0]?.worker_detail) || null;
                        const workerName = workerObj?.full_name || workerObj?.username || b.worker_detail?.full_name || b.worker_detail?.username || `Worker ${b.worker}`;
                        const workerImage = workerObj?.profile_image || (typeof b.worker === 'object' ? (b.worker as any)?.profile_image : null) || (b.expenses && (b.expenses[0]?.worker_detail as any)?.profile_image) || null;
                        const expensesCount = b.expenses?.length || 0;
                        const ticketDisplay = b.ticket_details?.work_order_no || (b.ticket_details?.title ? b.ticket_details.title : (expensesCount > 0 ? `${expensesCount} expenses` : '-'));
                        const subDeptNames = Array.from(new Set(
                          (b.expenses || []).map((e: any) => e.ticket_details?.sub_department_name || e.sub_department_name).filter(Boolean)
                        ));

                        return (
                          <div
                            key={b.claim_id}
                            onClick={() => {
                              setSelectedBundleIds(
                                isSelected
                                  ? selectedBundleIds.filter(id => id !== b.claim_id)
                                  : [...selectedBundleIds, b.claim_id]
                              );
                            }}
                            className={`p-2.5 rounded border transition-all cursor-pointer flex flex-col justify-between text-xs gap-2.5 select-none ${isSelected
                              ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-xs'
                              : 'bg-surface-container border-outline-variant/70 hover:bg-surface-container-high hover:border-outline'
                              }`}
                          >
                            {/* Card Top: Checkbox, Bundle ID & Amount */}
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => { }}
                                  className="accent-primary cursor-pointer rounded shrink-0 mt-0.5"
                                />
                                <span className="font-bold text-primary truncate text-xs">
                                  Bundle {b.claim_id}
                                </span>
                              </div>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs shrink-0 whitespace-nowrap">
                                KD {parseFloat(b.total_claimed_amount).toFixed(3)}
                              </span>
                            </div>

                            {/* Card Middle: User Avatar, Name & Sub-Departments */}
                            <div className="flex items-center gap-2 min-w-0">
                              <AvatarCircle
                                user={workerObj}
                                name={workerName}
                                image={workerImage}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="text-[11px] font-semibold text-on-surface truncate" title={workerName}>
                                  {workerName}
                                </div>
                                {subDeptNames.length > 0 ? (
                                  <div className="text-[10px] text-on-surface-variant truncate" title={subDeptNames.join(', ')}>
                                    {subDeptNames.join(', ')}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-on-surface-variant/70 italic">
                                    General Sub-Dept
                                  </div>
                                )}
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-medium shrink-0">
                                {expensesCount} exp
                              </span>
                            </div>

                            {/* Card Bottom: Metadata Badges */}
                            <div className="pt-1.5 border-t border-outline-variant/40 flex items-center justify-between text-[10px] text-on-surface-variant gap-1">

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* CLASSIFICATION SUMMARY / WARNING */}
              {selectedBundleIds.length > 0 && (
                <div className="space-y-2">
                  {classificationResult.hasUnmapped && (
                    <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs space-y-3">
                      <div className="flex items-center justify-between gap-2 font-semibold text-amber-800 dark:text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>Following Sub-Department(s) are missing from your active Ledger Batch configurations:</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRefreshAssemble}
                          disabled={isRefreshingAssemble}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high border border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-medium transition-colors cursor-pointer shrink-0 shadow-2xs hover:text-primary"
                          title="Refresh and re-check sub-departments after updating tickets"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshingAssemble ? 'animate-spin text-primary' : ''}`} />
                          <span>Refresh</span>
                        </button>
                      </div>

                      {/* Clickable Sub-Department Chips */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {classificationResult.unmappedSubDepts.map(sd => {
                            const isSelected = activeUnmappedSubDept === sd.subDeptName;
                            return (
                              <button
                                key={sd.subDeptName}
                                type="button"
                                onClick={() => setSelectedUnmappedSubDept(sd.subDeptName)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold shadow-2xs transition-all cursor-pointer ${isSelected
                                  ? 'bg-amber-600 text-white border border-amber-700 ring-2 ring-amber-500/30 dark:bg-amber-500 dark:text-gray-950 font-bold'
                                  : 'bg-surface-container border border-amber-500/40 text-on-surface hover:bg-surface-container-high hover:border-amber-500'
                                  }`}
                                title={`Click to show tickets for ${sd.subDeptName}`}
                              >
                                <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white dark:text-gray-950' : 'text-amber-600 dark:text-amber-400'}`} />
                                <span>{sd.subDeptName}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${isSelected
                                  ? 'bg-white/20 text-white dark:bg-black/20 dark:text-gray-950'
                                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                                  }`}>
                                  {sd.tickets.length} ticket{sd.tickets.length !== 1 ? 's' : ''}
                                </span>
                                <ChevronDown className={`w-3 h-3 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bottom side: List tickets directly so user can open & change sub-department */}
                      {displayedUnmappedTickets.length > 0 ? (
                        <div className="pt-2 border-t border-amber-500/25 space-y-2">
                          <div className="flex items-center gap-1.5 flex-wrap max-h-36 overflow-y-auto pr-1">
                            {displayedUnmappedTickets.map(item => {
                              const exp = item.exp;
                              const ticketNo = item.ticketNo;
                              return (
                                <button
                                  key={item.ticketNo}
                                  type="button"
                                  onClick={() => setSelectedTicketForModal && setSelectedTicketForModal(typeof (exp?.ticket_details || exp?.ticket) === 'object' ? (exp?.ticket_details || exp?.ticket) : (item.ticketObj || { ticket_id: (exp?.ticket_details || exp?.ticket) }))}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container border border-amber-500/40 hover:border-primary text-primary hover:underline font-mono text-[11px] font-medium cursor-pointer shadow-2xs hover:bg-surface-container-high transition-colors"
                                  title={`Open ticket ${ticketNo} to change Sub-Department`}
                                >
                                  <span>{ticketNo}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-amber-500/25 text-xs text-on-surface-variant italic">
                          No tickets found for this sub-department.
                        </div>
                      )}
                    </div>
                  )}

                  {classificationResult.classifiedBatches.length > 0 && (
                    <div className="p-3 rounded bg-surface-container-high border border-outline-variant space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-on-surface">
                        <span className="flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5 text-primary" />
                          Ledger Batch Distribution ({classificationResult.classifiedBatches.length})
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          Total: {classificationResult.totalAmount.toFixed(3)} KD
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {classificationResult.classifiedBatches.map(group => (
                          <div
                            key={group.batch.ledger_batch_id}
                            className="p-2 rounded bg-surface-container border border-outline-variant/60 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-on-surface block">{group.batch.batch_name}</span>
                              <span className="text-[10px] text-on-surface-variant">
                                {group.bundles.length} bundle(s) • {group.expenses.length} expense(s)
                              </span>
                            </div>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {group.total.toFixed(3)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Group selection / creation */}
              <div className="space-y-3 pt-1 relative z-20">
                <div className="relative z-30">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-on-surface block">
                      Select Existing Ledger Group (Draft / Rework)
                    </label>
                    {isAddingToExistingGroup && (
                      <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium inline-flex items-center gap-1 bg-indigo-500/10 dark:bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                        <Lock className="w-3 h-3" />
                        <span>Fixed to Current Ledger</span>
                      </span>
                    )}
                  </div>
                  <SearchableSelect
                    disabled={isAddingToExistingGroup}
                    options={ledgerGroupSelectOptions}
                    value={selectedGroupId}
                    onChange={(val) => {
                      if (isAddingToExistingGroup) return;
                      setSelectedGroupId(val);
                      if (val) setNewGroupName('');
                    }}
                    onSearchChange={handleGroupSearch}
                    loading={loadingGroups}
                    disableLocalFilter={true}
                    onDeleteOption={isAddingToExistingGroup ? undefined : handleDeleteUnusedGroup}
                    placeholder="Search or select a Draft or Rework ledger group..."
                  />
                </div>

                {selectedGroupId && !isAddingToExistingGroup && (() => {
                  const currentGrp = dynamicGroups.find(g => String(g.ledger_group_id) === String(selectedGroupId)) ||
                    ledgerGroups?.find(g => String(g.ledger_group_id) === String(selectedGroupId));
                  if (currentGrp && isGroupUnused(currentGrp)) {
                    return (
                      <div className="flex items-center justify-between p-2.5 rounded bg-surface-container-high border border-outline-variant text-xs">
                        <div className="flex items-center gap-2 text-on-surface-variant">
                          <span className="w-2 h-2 roundedf bg-amber-500 shrink-0" />
                          <span>This group has no attached batches and is currently unused.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteUnusedGroup(selectedGroupId)}
                          className="px-2.5 py-1 rounded bg-error/10 text-error hover:bg-error/20 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Group</span>
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                {!selectedGroupId && (
                  <div>
                    <label className="text-xs font-medium text-on-surface block mb-1">
                      New Ledger Name
                    </label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. October 2026 Technicians Settlement"
                      className={`w-full px-3 py-2 rounded border bg-surface-container text-xs text-on-surface focus:outline-none transition-colors ${existingGroupWithSameName ? 'border-amber-500 focus:border-amber-600' : 'border-outline focus:border-primary'
                        }`}
                    />
                    {existingGroupWithSameName && (
                      <div className="mt-1.5 flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>A group named "<strong>{existingGroupWithSameName.group_name}</strong>" already exists.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGroupId(String(existingGroupWithSameName.ledger_group_id));
                            setNewGroupName('');
                          }}
                          className="px-2.5 py-1 rounded bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors text-xs shrink-0 cursor-pointer"
                        >
                          Select Existing
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {setLedgerRemarks && (
                  <div>
                    <label className="text-xs font-medium text-on-surface block mb-1">
                      Remarks / Notes (Optional)
                    </label>
                    <textarea
                      value={ledgerRemarks}
                      onChange={(e) => setLedgerRemarks(e.target.value)}
                      placeholder="Add any specific notes or context for this ledger batch..."
                      rows={2}
                      className="w-full px-3 py-2 rounded border border-outline bg-surface-container text-xs text-on-surface focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant shrink-0">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowCreateLedgerModal(false)}
                className="px-4 py-2 rounded border border-outline text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateLedger}
                disabled={submitting || selectedBundleIds.length === 0 || (!selectedGroupId && !newGroupName.trim()) || (!selectedGroupId && !!existingGroupWithSameName)}
                className="px-4 py-2 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{selectedGroupId ? 'Adding Bundles...' : 'Creating Ledger...'}</span>
                  </>
                ) : (
                  <>
                    <Boxes className="w-3.5 h-3.5" />
                    <span>
                      {selectedGroupId
                        ? `Add ${selectedBundleIds.length > 0 ? `${selectedBundleIds.length} ` : ''}Bundle${selectedBundleIds.length === 1 ? '' : 's'} to Ledger Group`
                        : classificationResult.classifiedBatches.length > 1
                          ? `${classificationResult.classifiedBatches.length} Ledgers will be created`
                          : 'Assemble Ledger Batch'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: MONTHLY LOCATION EXPENSE REPORT & COMPARISON */}
      {showMonthlyLocationReportModal && (
        <MonthlyLocationReportModal
          isOpen={showMonthlyLocationReportModal}
          onClose={() => setShowMonthlyLocationReportModal(false)}
          token={token}
          API_URL={API_URL}
          currentUser={currentUser}
        />
      )}

      {/* POPUP MODAL: LEDGER  SETTLEMENT REPORT */}
      {selectedGroupForReport && (
        <LedgerGroupReportModal
          group={selectedGroupForReport}
          onClose={() => setSelectedGroupForReport(null)}
          setSelectedTicketForModal={setSelectedTicketForModal}
          token={token}
          API_URL={API_URL}
          onGroupRenamed={(groupId, newName) => {
            setSelectedGroupForReport(prev => prev && String(prev.groupId) === String(groupId) ? { ...prev, groupName: newName } : prev);
            setDynamicGroups(prev => prev.map(g => String(g.ledger_group_id) === String(groupId) ? { ...g, group_name: newName } : g));
            if (onRefresh) {
              onRefresh();
            }
          }}
        />
      )}



      {/* Cash Settlement / Payment Modal */}
      {groupToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded shadow-2xl max-w-lg w-full p-6 text-on-surface space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-outline-variant/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30 shrink-0">
                  <Banknote className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Cash Settlement & Payment</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Role: <span className="font-semibold text-teal-600 dark:text-teal-400">Cash Office</span> • Final Payment Step
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGroupToPay(null);
                  setPayingGroupError(null);
                }}
                disabled={payingGroupId !== null}
                className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Group Summary Box */}
            <div className="p-4 rounded bg-surface-container-low border border-outline-variant/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px]  tracking-wider text-on-surface-variant font-medium">Ledger Group</div>
                  <div className="text-sm font-bold text-on-surface">{groupToPay.groupName}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px]  tracking-wider text-on-surface-variant font-medium">Settlement Total</div>
                  <div className="text-lg font-extrabold text-teal-600 dark:text-teal-400">
                    KD {groupToPay.totalAmount.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-outline-variant/50 text-center">
                <div className="p-2 rounded bg-surface-container/60">
                  <div className="text-[10px] text-on-surface-variant font-medium">Batches</div>
                  <div className="text-xs font-bold text-on-surface">{groupToPay.ledgers.length}</div>
                </div>
                <div className="p-2 rounded bg-surface-container/60">
                  <div className="text-[10px] text-on-surface-variant font-medium">Workers</div>
                  <div className="text-xs font-bold text-on-surface">{groupToPay.totalWorkersCount ?? 0}</div>
                </div>
                <div className="p-2 rounded bg-surface-container/60">
                  <div className="text-[10px] text-on-surface-variant font-medium">Expenses</div>
                  <div className="text-xs font-bold text-on-surface">{groupToPay.totalExpensesCount}</div>
                </div>
              </div>
            </div>

            {/* Payment Details Form */}
            <div className="space-y-3">


              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">
                  Recipient Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter receiver / technician / site engineer name..."
                  value={payRecipientName}
                  onChange={(e) => {
                    setPayRecipientName(e.target.value);
                    if (payingGroupError) setPayingGroupError(null);
                  }}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-outline-variant focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">
                  Remarks / Settlement Notes <span className="text-[10px] font-normal text-on-surface-variant">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Disbursement details or handover remarks..."
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-outline-variant focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none text-xs text-on-surface resize-none"
                />
              </div>
            </div>



            {payingGroupError && (
              <div className="p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{payingGroupError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setGroupToPay(null);
                  setPayingGroupError(null);
                }}
                disabled={payingGroupId !== null}
                className="px-4 py-2 rounded border border-outline-variant hover:bg-surface-container-high text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePayLedgerGroup(groupToPay)}
                disabled={payingGroupId !== null}
                className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-50"
              >
                {payingGroupId !== null ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Settling Cash Payment...</span>
                  </>
                ) : (
                  <>
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Confirm Cash Settlement</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
