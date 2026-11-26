import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  DollarSign, Plus, Search, RefreshCw, Filter, ShieldCheck,
  CreditCard, Calendar, RotateCcw, Building2, Receipt, Layers, AlertCircle, CheckCircle2, X
} from 'lucide-react';
import type { RootState } from '../store';
import { TicketDetailModal } from './ticket/TicketDetailModal';
import { DateRangePickerCard } from './ticket/DateRangePickerCard';
import { SearchableSelect, type SelectOption } from '../components/SearchableSelect';
import { ZoomableLightbox } from '@/components/ZoomableImage';

import { API_URL, getUserId } from './finance/types';
import type {
  ExpenseItem,
  WorkerClaimItem,
  LedgerItem,
  LedgerGroupItem,
  ApprovalInstanceItem,
  AuditEventItem,
  PaymentItem
} from './finance/types';

import { BundlesSubpage } from './finance/BundlesSubpage';
import { LedgersSubpage } from './finance/LedgersSubpage';
import { ApprovalsSubpage } from './finance/ApprovalsSubpage';
import { PaymentsSubpage } from './finance/PaymentsSubpage';
import { EditBundleModal } from './finance/EditBundleModal';
import { PaymentModal } from './finance/PaymentModal';
import { ExpensesSubpage } from './finance/ExpensesSubpage';
import { renderFinanceStatusBadge } from './finance/expenseStatus';
import Can from '../hooks/Can';
import { usePermission } from '../hooks/usePermission';
import { confirmPopup } from '@/components/tailgrids/core/ConfirmationPopup';

const getCurrentMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    from: format(start),
    to: format(end)
  };
};

export const FinanceView: React.FC = () => {
  const { subpage = 'bundles' } = useParams<{ subpage: string }>();
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.auth.token);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { hasPermission } = usePermission();

  // Data states
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [bundles, setBundles] = useState<WorkerClaimItem[]>([]);
  const [ledgers, setLedgers] = useState<LedgerItem[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroupItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalInstanceItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [unclaimedExpenses, setUnclaimedExpenses] = useState<ExpenseItem[]>([]);
  const [selectedTicketForModal, setSelectedTicketForModal] = useState<any | null>(null);

  // Loading States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingBundleId, setDeletingBundleId] = useState<number | null>(null);

  // Global Filter States (Default: Current Month or from localStorage)
  // Per-subpage search queries to keep search state tied with each view (Expenses, Bundles, Ledgers, etc.)
  const [subpageSearchQueries, setSubpageSearchQueries] = useState<Record<string, string>>({});
  const searchQuery = subpageSearchQueries[subpage] || '';
  const setSearchQuery = (val: string) => {
    setSubpageSearchQueries(prev => ({
      ...prev,
      [subpage]: val
    }));
  };
  // Per-subpage date filter state so Expenses, Bundles, Ledgers, etc. each maintain separate date filtering state
  const [subpageDateFilters, setSubpageDateFilters] = useState<Record<string, { from: string; to: string; type?: string }>>(() => {
    const currentMonth = getCurrentMonthRange();
    const defaultDate = { from: currentMonth.from, to: currentMonth.to, type: '' };

    const getStoredDate = (pageKey: string) => {
      const storedFrom = localStorage.getItem(`finance_filter_date_from_${pageKey}`);
      const storedTo = localStorage.getItem(`finance_filter_date_to_${pageKey}`);
      const storedType = localStorage.getItem(`finance_filter_date_type_${pageKey}`);

      if (storedFrom !== null || storedTo !== null) {
        return {
          from: storedFrom ?? defaultDate.from,
          to: storedTo ?? defaultDate.to,
          type: storedType ?? (pageKey === 'expenses' ? '' : undefined)
        };
      }

      // Backward compatibility fallback from global storage
      const legacyFrom = localStorage.getItem('finance_filter_date_from');
      const legacyTo = localStorage.getItem('finance_filter_date_to');
      const legacyType = localStorage.getItem('finance_filter_date_type');

      return {
        from: (legacyFrom !== null && legacyFrom !== undefined) ? legacyFrom : defaultDate.from,
        to: (legacyTo !== null && legacyTo !== undefined) ? legacyTo : defaultDate.to,
        type: pageKey === 'expenses' ? (legacyType || '') : undefined
      };
    };

    return {
      expenses: getStoredDate('expenses'),
      bundles: getStoredDate('bundles'),
      ledgers: getStoredDate('ledgers'),
      payments: getStoredDate('payments')
    };
  });

  const activeDates = subpageDateFilters[subpage] || {
    from: getCurrentMonthRange().from,
    to: getCurrentMonthRange().to,
    type: ''
  };
  const filterDateFrom = activeDates.from;
  const filterDateTo = activeDates.to;
  const filterDateType = activeDates.type || '';

  const setFilterDateRange = useCallback((from: string, to: string, type?: string) => {
    setSubpageDateFilters(prev => ({
      ...prev,
      [subpage]: {
        from,
        to,
        type: type !== undefined ? type : (prev[subpage]?.type || '')
      }
    }));
  }, [subpage]);

  const setFilterDateFrom = useCallback((from: string) => {
    setSubpageDateFilters(prev => ({
      ...prev,
      [subpage]: {
        ...(prev[subpage] || { from: '', to: '', type: '' }),
        from
      }
    }));
  }, [subpage]);

  const setFilterDateTo = useCallback((to: string) => {
    setSubpageDateFilters(prev => ({
      ...prev,
      [subpage]: {
        ...(prev[subpage] || { from: '', to: '', type: '' }),
        to
      }
    }));
  }, [subpage]);

  const setFilterDateType = useCallback((type: string) => {
    setSubpageDateFilters(prev => ({
      ...prev,
      [subpage]: {
        ...(prev[subpage] || { from: '', to: '', type: '' }),
        type
      }
    }));
  }, [subpage]);
  const [ledgerBatches, setLedgerBatches] = useState<any[]>([]);
  const [ledgerBatchFilter, setLedgerBatchFilter] = useState<string>(() => {
    return localStorage.getItem('finance_filter_ledger_batch') || 'ALL';
  });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'IN_LEDGER' | 'NOT_IN_LEDGER'>('ALL');
  const [bundleFilter, setBundleFilter] = useState<'ALL' | 'IN_BUNDLE' | 'NOT_IN_BUNDLE'>('ALL');
  const [expenseWorkerFilter, setExpenseWorkerFilter] = useState<string>('ALL');
  const [allWorkersList, setAllWorkersList] = useState<any[]>([]);

  // Load all workers / users for worker-wise search & dropdown
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/accounts/customuser/?page_size=all`, {
      headers: { Authorization: `Token ${token}` }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (data.results || []);
        setAllWorkersList(list);
      })
      .catch(() => { });
  }, [token, API_URL]);

  const expenseWorkerOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [{ value: 'ALL', label: 'All Workers / Technicians' }];
    (allWorkersList || []).forEach(w => {
      const name = w.full_name || w.username;
      if (!name) return;
      const label = w.employee_no ? `${name} (${w.employee_no})` : name;
      options.push({ value: String(w.id || w.user_id), label });
    });
    return options;
  }, [allWorkersList]);

  // Status filter options tailored for the active subpage's individual items and lifecycle states
  const statusOptions = useMemo<SelectOption[]>(() => {
    if (subpage === 'expenses') {
      return [
        { value: 'ALL', label: 'All Statuses' },
        { value: 'Pending Approval', label: 'Pending Approval' },
        { value: 'Approved', label: 'Approved' },
        { value: 'Paid', label: 'Paid' },
        { value: 'Rework', label: 'Rework' },
      ];
    }
    if (subpage === 'bundles') {
      return [
        { value: 'ALL', label: 'All Statuses' },
        { value: 'Draft', label: 'Draft' },
        { value: 'In Review', label: 'In Review' },
        { value: 'Approved', label: 'Approved' },
        { value: 'Paid', label: 'Paid' },
        { value: 'Rework', label: 'Rework' },
      ];
    }
    if (subpage === 'ledgers') {
      return [
        { value: 'ALL', label: 'All Statuses' },
        { value: 'Draft', label: 'Draft' },
        { value: 'In Review', label: 'In Review' },
        { value: 'Approved', label: 'Approved' },
        { value: 'Paid', label: 'Paid' },
        { value: 'Rework', label: 'Rework' },
      ];
    }
    return [
      { value: 'ALL', label: 'All Statuses' },
      { value: 'Draft', label: 'Draft' },
      { value: 'In Review', label: 'In Review' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rework', label: 'Rework' },
      { value: 'Paid', label: 'Paid' },
    ];
  }, [subpage]);

  // When subpage changes, reset statusFilter to 'ALL' if the current status is not applicable to the new subpage
  useEffect(() => {
    const validValues = statusOptions.map(opt => String(opt.value).toLowerCase());
    if (statusFilter !== 'ALL' && !validValues.includes(statusFilter.toLowerCase())) {
      setStatusFilter('ALL');
    }
  }, [subpage, statusOptions, statusFilter]);

  // Debounced search query for server-side expense search
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Expenses server-side pagination state
  const [expensePage, setExpensePage] = useState<number>(1);
  const [expensePageSize, setExpensePageSize] = useState<number>(50);
  const [expenseTotalCount, setExpenseTotalCount] = useState<number>(0);
  const [expenseTotalAmount, setExpenseTotalAmount] = useState<number | undefined>(undefined);
  const [expenseApprovedCount, setExpenseApprovedCount] = useState<number | undefined>(undefined);
  const [expensePendingCount, setExpensePendingCount] = useState<number | undefined>(undefined);
  const [expenseUnclaimedCount, setExpenseUnclaimedCount] = useState<number | undefined>(undefined);

  // Expenses server-side sorting state
  const [expenseSortField, setExpenseSortField] = useState<string>('expense_date');
  const [expenseSortDirection, setExpenseSortDirection] = useState<'asc' | 'desc'>('desc');
  const expenseOrdering = expenseSortField ? `${expenseSortDirection === 'desc' ? '-' : ''}${expenseSortField}` : '-expense_date';

  // Reset expensePage to 1 whenever search, filters, or sorting change
  useEffect(() => {
    if (subpage === 'expenses') {
      setExpensePage(1);
    }
  }, [subpage, debouncedSearchQuery, statusFilter, bundleFilter, ledgerBatchFilter, expenseWorkerFilter, filterDateFrom, filterDateTo, filterDateType, expensePageSize, expenseOrdering]);

  // Bundles server-side pagination state
  const [bundlePage, setBundlePage] = useState<number>(1);
  const [bundlePageSize, setBundlePageSize] = useState<number>(50);
  const [bundleTotalCount, setBundleTotalCount] = useState<number>(0);
  const [bundleStats, setBundleStats] = useState<{
    total_bundles?: number;
    pending_bundles?: number;
    approved_bundles?: number;
    unclaimed_expenses?: number;
  }>({});

  // Reset bundlePage to 1 whenever search or filters change
  useEffect(() => {
    if (subpage === 'bundles') {
      setBundlePage(1);
    }
  }, [subpage, debouncedSearchQuery, statusFilter, ledgerFilter, filterDateFrom, filterDateTo, bundlePageSize]);

  // Ledgers server-side pagination state
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(10);
  const [ledgerTotalCount, setLedgerTotalCount] = useState<number>(0);

  // Reset ledgerPage to 1 whenever search or filters change
  useEffect(() => {
    if (subpage === 'ledgers') {
      setLedgerPage(1);
    }
  }, [subpage, debouncedSearchQuery, statusFilter, filterDateFrom, filterDateTo, ledgerPageSize]);


  // Fetch LedgerBatches for filtering and subpages
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/finance/ledger-batches/?page_size=200`, {
      cache: 'no-store',
      headers: { Authorization: `Token ${token}` }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const rawBatches = Array.isArray(data) ? data : (data?.results || []);
        setLedgerBatches(rawBatches);
      })
      .catch(err => console.error("Failed to fetch ledger batches", err));
  }, [token, API_URL]);

  // Sync date filter changes with localStorage per active subpage
  useEffect(() => {
    if (filterDateFrom) {
      localStorage.setItem(`finance_filter_date_from_${subpage}`, filterDateFrom);
    } else {
      localStorage.removeItem(`finance_filter_date_from_${subpage}`);
    }
  }, [subpage, filterDateFrom]);

  useEffect(() => {
    if (filterDateTo) {
      localStorage.setItem(`finance_filter_date_to_${subpage}`, filterDateTo);
    } else {
      localStorage.removeItem(`finance_filter_date_to_${subpage}`);
    }
  }, [subpage, filterDateTo]);

  useEffect(() => {
    if (filterDateType) {
      localStorage.setItem(`finance_filter_date_type_${subpage}`, filterDateType);
    } else {
      localStorage.removeItem(`finance_filter_date_type_${subpage}`);
    }
  }, [subpage, filterDateType]);

  useEffect(() => {
    if (ledgerBatchFilter && ledgerBatchFilter !== 'ALL') {
      localStorage.setItem('finance_filter_ledger_batch', ledgerBatchFilter);
    } else {
      localStorage.removeItem('finance_filter_ledger_batch');
    }
  }, [ledgerBatchFilter]);

  // Modal States
  const [showCreateExpenseModal, setShowCreateExpenseModal] = useState(false);
  const [showCreateBundleModal, setShowCreateBundleModal] = useState(false);
  const [showCreateLedgerModal, setShowCreateLedgerModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState<ApprovalInstanceItem | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<PaymentItem | WorkerClaimItem | LedgerItem | null>(null);

  // Syncing state for newly created bundle row loader
  const [isSyncingNewBundle, setIsSyncingNewBundle] = useState<boolean>(false);
  const [syncingBundleInfo, setSyncingBundleInfo] = useState<{
    claim_id?: number | string;
    worker_name?: string;
    amount?: number;
  } | null>(null);

  // Syncing state for newly created expense row loader
  const [isSyncingNewExpense, setIsSyncingNewExpense] = useState<boolean>(false);
  const [syncingExpenseInfo, setSyncingExpenseInfo] = useState<{
    expense_id?: number | string;
    category?: string;
    worker_name?: string;
    ticket_no?: string;
    sub_department?: string;
    amount?: number;
    expense_date?: string;
    remarks?: string;
    has_receipts?: boolean;
    receipts_count?: number;
  } | null>(null);

  // Syncing state for newly created ledger row loader
  const [isSyncingNewLedger, setIsSyncingNewLedger] = useState<boolean>(false);
  const [syncingLedgerInfo, setSyncingLedgerInfo] = useState<{
    ledger_id?: number | string;
    group_name?: string;
    bundles_count?: number;
    total_amount?: number;
  } | null>(null);

  // Bundle Detail View & Edit Modal States
  const [selectedBundleForView, setSelectedBundleForView] = useState<WorkerClaimItem | null>(null);
  const [selectedBundleForEdit, setSelectedBundleForEdit] = useState<WorkerClaimItem | null>(null);
  const [updatingBundleId, setUpdatingBundleId] = useState<number | null>(null);
  const [editBundleForm, setEditBundleForm] = useState<{
    period_from: string;
    period_to: string;
    remarks: string;
    selectedExpenseIds: number[];
  }>({ period_from: '', period_to: '', remarks: '', selectedExpenseIds: [] });
  const [previewMediaUrl, setPreviewMediaUrl] = useState<{ url: string; title: string } | null>(null);

  // Create Bundle Modal Filters
  const [expenseSearchWorker, setExpenseSearchWorker] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [expenseSearchText, setExpenseSearchText] = useState('');
  const [expenseFilterFrom, setExpenseFilterFrom] = useState('');
  const [expenseFilterTo, setExpenseFilterTo] = useState('');
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);
  const [bundlePeriodFrom, setBundlePeriodFrom] = useState('');
  const [bundlePeriodTo, setBundlePeriodTo] = useState('');
  const [bundleRemarks, setBundleRemarks] = useState('');

  // Create Ledger Modal Form
  const [selectedBundleIds, setSelectedBundleIds] = useState<number[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [ledgerRemarks, setLedgerRemarks] = useState('');

  // Approval Modal Form
  const [approvalAction, setApprovalAction] = useState<'APPROVED' | 'REJECTED' | 'REWORK'>('APPROVED');
  const [approvalComments, setApprovalComments] = useState('');

  // Payment Modal Form
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [paymentRecipient, setPaymentRecipient] = useState('');

  // Approval Queue Filters
  const [roleFilterOnly, setRoleFilterOnly] = useState(true);
  const [approvalEntityTab, setApprovalEntityTab] = useState<'ALL' | 'Bundle' | 'Ledger' | 'Expense'>('ALL');
  const [approvalStatusTab, setApprovalStatusTab] = useState<string>('ALL');
  const [expandedApprovalIds, setExpandedApprovalIds] = useState<Record<number, boolean>>({});

  const toggleExpandApproval = (id: number) => {
    setExpandedApprovalIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Flash Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Expanded Ledger Rows & Add Expense Modal
  const [expandedLedgerIds, setExpandedLedgerIds] = useState<Record<number, boolean>>({});
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<LedgerItem | null>(null);
  const [availableApprovedExpenses, setAvailableApprovedExpenses] = useState<ExpenseItem[]>([]);
  const [loadingAvailableExpenses, setLoadingAvailableExpenses] = useState(false);
  const [selectedAddExpenseId, setSelectedAddExpenseId] = useState<number | null>(null);

  const toggleExpandLedger = (ledgerId: number) => {
    setExpandedLedgerIds(prev => ({ ...prev, [ledgerId]: !prev[ledgerId] }));
  };

  const openAddExpenseModal = async (ledger: LedgerItem) => {
    setShowAddExpenseModal(ledger);
    setSelectedAddExpenseId(null);
    setLoadingAvailableExpenses(true);
    try {
      const storeId = ledger.store_detail?.store_id || '';
      const res = await fetch(`${API_URL}/finance/ledgers/available-approved-expenses/?store_id=${storeId}`, {
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableApprovedExpenses(data);
      }
    } catch (err: any) {
      console.error("Failed to load approved expenses", err);
    } finally {
      setLoadingAvailableExpenses(false);
    }
  };

  const openEditBundleModal = (bundle: WorkerClaimItem) => {
    setSelectedBundleForEdit(bundle);
    const existingIds = bundle.expenses ? bundle.expenses.map(e => e.expense_id) : [];
    setEditBundleForm({
      period_from: bundle.period_from || '',
      period_to: bundle.period_to || '',
      remarks: bundle.remarks || '',
      selectedExpenseIds: existingIds
    });
  };

  const handleSaveUpdateBundle = async () => {
    if (!selectedBundleForEdit) return;
    if (editBundleForm.selectedExpenseIds.length === 0) {
      setErrorMessage("A bundle must contain at least one expense.");
      return;
    }

    const updatingId = selectedBundleForEdit.claim_id;
    setUpdatingBundleId(updatingId);
    setSelectedBundleForEdit(null);
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/claim/${updatingId}/update-bundle/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expense_ids: editBundleForm.selectedExpenseIds,
          period_from: editBundleForm.period_from || undefined,
          period_to: editBundleForm.period_to || undefined,
          remarks: editBundleForm.remarks || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update bundle');

      // Instantly update the modified bundle in memory (fastest, zero redundant GET call)
      setBundles(prev => prev.map(b => (b.claim_id === updatingId ? { ...b, ...data } : b)));


      // If user had view modal open for this bundle, update it
      setSelectedBundleForView(prev => (prev?.claim_id === updatingId ? { ...prev, ...data } : prev));

      setSuccessMessage(`Bundle ${updatingId} updated successfully.`);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
      setUpdatingBundleId(null);
    }
  };

  const handleRemoveExpenseFromBundle = async (bundleId: number, expenseId: number) => {
    const targetBundle = (bundles || []).find(b => b.claim_id === bundleId);
    if ((targetBundle?.expenses?.length ?? 0) <= 1) {

      const confirmed = await confirmPopup({
        preset: "remove",
        button2: "Close",
        title: "Cannot remove",
        description: "Cannot remove the only expense. Please delete the Bundle instead.",
        showButton1: false,
      });

      if (confirmed) return;


      setErrorMessage("Cannot remove the only expense. Please delete the Bundle instead.");
      return;
    }



    const confirmed = await confirmPopup({
      preset: 'remove',
      title: ' Remove Expense',
      description: `Are you sure you want to remove Expense ${expenseId} from Bundle ${bundleId}? The bundle status will reset to Draft.`,
    });
    if (!confirmed) return;


    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/claim/${bundleId}/remove-expense/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expense_id: expenseId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to remove expense from bundle');

      // Instantly update bundle in memory so status and expenses list update immediately
      if (data && data.claim_id) {
        setBundles(prev => prev.map(b => (b.claim_id === bundleId ? { ...b, ...data } : b)));
        setSelectedBundleForView(prev => (prev?.claim_id === bundleId ? { ...prev, ...data } : prev));
      }

      setSuccessMessage(`Expense ${expenseId} removed from Bundle ${bundleId}. Bundle status reset to Draft.`);
      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBundle = async (claimId: number) => {
    const confirmed = await confirmPopup({
      preset: "delete",
      title: `Delete Bundle ${claimId}?`,
      description:
        "Are you sure you want to delete this bundle? All tied expenses will be unlinked and returned to unclaimed status.",
      button1: "Cancel",
      button2: "Delete Bundle",
    });

    if (!confirmed) return;
    setDeletingBundleId(claimId);
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/claim/${claimId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete bundle');
      }
      setSelectedBundleForView(null);
      setSelectedBundleForEdit(null);
      // Optimistically remove from state so UI updates immediately
      setBundles(prev => prev.filter(b => b.claim_id !== claimId));
      setBundleTotalCount(prev => Math.max(0, prev - 1));
      setSuccessMessage(`Bundle ${claimId} deleted. All tied expenses have been released back to unclaimed status.`);
      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setDeletingBundleId(null);
      setSubmitting(false);
    }
  };

  const handleDeleteLedger = async (ledgerId: number) => {

    const confirmed = await confirmPopup({
      preset: "delete",
      title: `Delete Ledger Batch ${ledgerId}?`,
      description: `Are you sure you want to delete Ledger Batch ${ledgerId}?`,
      button1: "Cancel",
      button2: "Delete Batch",
    });

    if (!confirmed) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledgers/${ledgerId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete ledger');
      }
      setSuccessMessage(`Ledger Batch ${ledgerId} deleted successfully.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddExpenseToLedger = async () => {
    if (!showAddExpenseModal || !selectedAddExpenseId) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledgers/${showAddExpenseModal.ledger_id}/add-expense/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_id: selectedAddExpenseId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to add expense');
      setSuccessMessage(`Expense ${selectedAddExpenseId} added to Ledger ${showAddExpenseModal.ledger_id}.`);
      setShowAddExpenseModal(null);
      setSelectedAddExpenseId(null);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveExpenseFromLedger = async (ledgerId: number, expenseId: number) => {
    const targetLedger = (ledgers || []).find(l => l.ledger_id === ledgerId);
    const targetExp = targetLedger?.expenses?.find(e => e.expense_id === expenseId)
      || (expenses || []).find(e => e.expense_id === expenseId);

    const rawClaim = targetExp ? (targetExp.claim ?? (targetExp as any).claim_id ?? (targetExp as any).bundle_id) : null;
    const claimId = rawClaim && typeof rawClaim === 'object' ? rawClaim.claim_id : rawClaim;

    const matchingBundle = claimId
      ? ((bundles || []).find(b => Number(b.claim_id || (b as any).id) === Number(claimId))
        || (targetLedger?.bundles || []).find(b => Number(b.claim_id || (b as any).id) === Number(claimId)))
      : null;

    const bundleExpensesInLedger = claimId && targetLedger?.expenses
      ? targetLedger.expenses.filter(e => {
        const c = e.claim ?? (e as any).claim_id ?? (e as any).bundle_id;
        const cid = c && typeof c === 'object' ? c.claim_id : c;
        return Number(cid) === Number(claimId);
      }).length
      : 0;

    const totalBundleExpenses = matchingBundle?.expenses?.length;

    const isOnlyExpenseInBundle = Boolean(
      claimId && (
        (totalBundleExpenses !== undefined && totalBundleExpenses <= 1) ||
        bundleExpensesInLedger <= 1
      )
    );

    const isOnlyExpenseInLedger = (targetLedger?.expenses?.length ?? 0) <= 1;

    if (isOnlyExpenseInBundle || isOnlyExpenseInLedger) {
      const description = isOnlyExpenseInBundle
        ? "The only expense cannot be removed directly. Please remove the bundle first, then remove the expense from the bundle."
        : "The only expense in this Ledger Batch cannot be removed directly. Please remove the bundle first or delete the ledger batch.";

      await confirmPopup({
        preset: "remove",
        button2: "Close",
        title: "Cannot Remove Expense",
        description,
        showButton1: false,
      });
      setErrorMessage(description);
      return;
    }


    const confirmed = await confirmPopup({
      preset: "remove",
      title: `Remove Expense ${expenseId}?`,
      description: `Are you sure you want to remove Expense ${expenseId} from this Ledger Batch?`,
      button1: "Cancel",
      button2: "Remove Expense",
    });

    if (!confirmed) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledgers/${ledgerId}/remove-expense/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_id: expenseId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to remove expense');
      setSuccessMessage(`Expense ${expenseId} removed from Ledger ${ledgerId}.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddBundleToLedger = async (ledgerId: number, bundleId: number) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledgers/${ledgerId}/add-bundle/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_id: bundleId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to add bundle to ledger');
      setSuccessMessage(`Bundle ${bundleId} attached to Ledger Batch ${ledgerId}.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddBundleToGroup = async (groupId: number, bundleId: number | number[]) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const bundleIds = Array.isArray(bundleId) ? bundleId : [bundleId];
      if (bundleIds.length === 0) return;

      const res = await fetch(`${API_URL}/finance/ledger-groups/${groupId}/add-bundle/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_ids: bundleIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to add bundle(s) to ledger group');

      const count = bundleIds.length;
      setSuccessMessage(`${count} bundle${count > 1 ? 's' : ''} successfully added to Ledger Group ${groupId}.`);
      await fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveBundleFromLedger = async (ledgerId: number, bundleId: number) => {
    const targetLedger = (ledgers || []).find(l => l.ledger_id === ledgerId);
    if ((targetLedger?.bundles?.length ?? 0) <= 1) {
      alert("Cannot remove the only bundle. Please delete the Ledger Batch instead.");
      setErrorMessage("Cannot remove the only bundle. Please delete the Ledger Batch instead.");
      return;
    }
    if (!window.confirm(`Are you sure you want to detach Bundle ${bundleId} from Ledger ${ledgerId}?`)) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledgers/${ledgerId}/remove-bundle/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_id: bundleId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to remove bundle');
      setSuccessMessage(`Bundle ${bundleId} detached from Ledger ${ledgerId}.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveBundleFromGroup = async (groupId: number, bundleId: number) => {
    const groupLedgers = (ledgers || []).filter(l => l.ledger_group === groupId || l.ledger_group_id === groupId || l.ledger_group_detail?.ledger_group_id === groupId);
    const distinctBundleIds = new Set<number>();
    groupLedgers.forEach(l => (l.bundles || []).forEach((b: any) => { const id = b.claim_id || b.id; if (id) distinctBundleIds.add(id); }));
    if (distinctBundleIds.size <= 1) {
      alert("Cannot remove the only bundle. Please delete the Ledger Batch instead.");
      setErrorMessage("Cannot remove the only bundle. Please delete the Ledger Batch instead.");
      return;
    }

    const confirmed = await confirmPopup({
      preset: "remove",
      title: "Remove Bundle from Ledger Group",
      description: `Are you sure you want to remove Bundle ${bundleId} from this Ledger Group?`,
      button1: "Cancel",
      button2: "Remove Bundle",
    });

    if (!confirmed) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledger-groups/${groupId}/remove-bundle/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_id: bundleId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to remove bundle from group');
      setSuccessMessage(`Bundle ${bundleId} removed from Ledger Group.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLedgerGroup = async (groupId: number) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledger-groups/${groupId}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Failed to delete Ledger Group');
      }
      setSuccessMessage(`Ledger Group ${groupId} deleted successfully.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const parseList = (data: any) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch API data directly from DB (with silent background mode and cancellation support)
  const fetchData = async (isSilent = false, bypassCache = false) => {
    if (!token) return;

    // Cancel any previous in-flight fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    if (!isSilent) setLoading(true);
    setErrorMessage(null);

    const headers = {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    };

    const fetchOptions: RequestInit = {
      headers,
      signal,
      ...(bypassCache ? { cache: 'no-store' as RequestCache } : {})
    };

    const dateParams = (filterDateFrom && filterDateTo)
      ? `&from_date=${filterDateFrom}&to_date=${filterDateTo}`
      : filterDateFrom
        ? `&from_date=${filterDateFrom}`
        : filterDateTo
          ? `&to_date=${filterDateTo}`
          : '';

    const approvalsUrl = roleFilterOnly
      ? `${API_URL}/finance/approvals/?assigned_to_me=true&page_size=all${dateParams}`
      : `${API_URL}/finance/approvals/?page_size=all${dateParams}`;

    try {
      if (subpage === 'expenses') {
        const dateTypeQuery = filterDateType ? `&date_type=${encodeURIComponent(filterDateType)}` : '';
        const batchQuery = (ledgerBatchFilter && ledgerBatchFilter !== 'ALL') ? `&ledger_batch=${encodeURIComponent(ledgerBatchFilter)}` : '';
        const statusQuery = (statusFilter && statusFilter !== 'ALL') ? `&status=${encodeURIComponent(statusFilter)}` : '';
        const bundleQuery = (bundleFilter && bundleFilter !== 'ALL') ? `&bundle_filter=${encodeURIComponent(bundleFilter)}` : '';
        const workerQuery = (expenseWorkerFilter && expenseWorkerFilter !== 'ALL') ? `&worker=${encodeURIComponent(expenseWorkerFilter)}` : '';
        const searchParam = debouncedSearchQuery ? `&search=${encodeURIComponent(debouncedSearchQuery)}` : '';
        const paginationParams = `&page=${expensePage}&page_size=${expensePageSize}`;
        const orderingParam = expenseOrdering ? `&ordering=${encodeURIComponent(expenseOrdering)}` : '';

        const resExp = await fetch(`${API_URL}/finance/expense/?${paginationParams}${dateParams}${dateTypeQuery}${batchQuery}${statusQuery}${bundleQuery}${workerQuery}${searchParam}${orderingParam}`, { headers, signal });
        if (signal.aborted) return;
        if (resExp.ok) {
          const expData = await resExp.json();
          if (expData && Array.isArray(expData.results)) {
            const count = expData.count ?? expData.results.length;
            const totalAmount = expData.total_amount !== undefined ? expData.total_amount : undefined;
            const approvedCount = expData.approved_count !== undefined ? expData.approved_count : undefined;
            const pendingCount = expData.pending_count !== undefined ? expData.pending_count : undefined;
            const unclaimedCount = expData.unclaimed_count !== undefined ? expData.unclaimed_count : undefined;

            setExpenses(expData.results);
            setExpenseTotalCount(count);
            setExpenseTotalAmount(totalAmount);
            setExpenseApprovedCount(approvedCount);
            setExpensePendingCount(pendingCount);
            setExpenseUnclaimedCount(unclaimedCount);
          } else {
            const list = parseList(expData);
            setExpenses(list);
            setExpenseTotalCount(list.length);
            setExpenseTotalAmount(undefined);
            setExpenseApprovedCount(undefined);
            setExpensePendingCount(undefined);
            setExpenseUnclaimedCount(undefined);
          }
        }

        fetch(`${API_URL}/finance/approvals/?page_size=100${dateParams}`, { headers, signal })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && !signal.aborted) setApprovals(parseList(data));
          })
          .catch(() => { });
      } else if (subpage === 'bundles') {
        let claimsUrl = `${API_URL}/finance/claim/?page=${bundlePage}&page_size=${bundlePageSize}${dateParams}`;
        if (statusFilter !== 'ALL') {
          claimsUrl += `&status=${encodeURIComponent(statusFilter)}`;
        }
        if (ledgerFilter !== 'ALL') {
          claimsUrl += `&ledger_filter=${encodeURIComponent(ledgerFilter)}`;
        }
        if (debouncedSearchQuery) {
          claimsUrl += `&search=${encodeURIComponent(debouncedSearchQuery)}`;
        }

        const bundleApprovalsUrl = `${API_URL}/finance/approvals/?page_size=100${dateParams}`;

        const [resClaims, resApps] = await Promise.all([
          fetch(claimsUrl, fetchOptions),
          fetch(bundleApprovalsUrl, fetchOptions)
        ]);
        if (signal.aborted) return;
        if (resClaims.ok) {
          const claimData = await resClaims.json();
          if (claimData && Array.isArray(claimData.results)) {
            const count = typeof claimData.count === 'number' ? claimData.count : claimData.results.length;
            setBundles(claimData.results);
            setSelectedBundleForView(prev => {
              if (!prev) return null;
              const updated = claimData.results.find((b: WorkerClaimItem) => b.claim_id === prev.claim_id);
              return updated ? { ...prev, ...updated } : prev;
            });
            setBundleTotalCount(count);
            const stats = {
              total_bundles: claimData.total_bundles_count ?? count,
              pending_bundles: claimData.pending_bundles_count,
              approved_bundles: claimData.approved_bundles_count,
              unclaimed_expenses: claimData.unclaimed_expenses_count
            };
            setBundleStats(stats);
          } else {
            const list = parseList(claimData);
            setBundles(list);
            setSelectedBundleForView(prev => {
              if (!prev) return null;
              const updated = list.find((b: WorkerClaimItem) => b.claim_id === prev.claim_id);
              return updated ? { ...prev, ...updated } : prev;
            });
            setBundleTotalCount(list.length);
          }
        }
        if (resApps.ok) {
          setApprovals(parseList(await resApps.json()));
        }
        if (!isSilent) setLoading(false);

        // Fetch unclaimed expenses in the background for Create/Edit Bundle modal without freezing UI
        if (unclaimedExpenses.length === 0 || bypassCache) {
          fetch(`${API_URL}/finance/expense/?is_claimed=false&page_size=all`, fetchOptions)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data && !signal.aborted) setUnclaimedExpenses(parseList(data));
            })
            .catch(() => { });
        }
      } else if (subpage === 'ledgers') {
        // 1. Fetch paginated ledgers with API-based search
        let ledgersUrl = `${API_URL}/finance/ledgers/?page=${ledgerPage}&page_size=${ledgerPageSize}${dateParams}`;
        if (debouncedSearchQuery) {
          ledgersUrl += `&search=${encodeURIComponent(debouncedSearchQuery)}`;
        }
        if (statusFilter !== 'ALL') {
          ledgersUrl += `&status=${encodeURIComponent(statusFilter)}`;
        }

        // 2. Fetch ledger groups with API-based search
        let groupsUrl = `${API_URL}/finance/ledger-groups/?page_size=all${dateParams}`;
        if (debouncedSearchQuery) {
          groupsUrl += `&search=${encodeURIComponent(debouncedSearchQuery)}`;
        }
        if (statusFilter !== 'ALL') {
          groupsUrl += `&status=${encodeURIComponent(statusFilter)}`;
        }

        // 3. Fresh fetch of approved unassigned claims, ledger batches & approvals directly from DB
        const claimsUrl = `${API_URL}/finance/claim/?status=Approved&ledger_filter=NOT_IN_LEDGER&page_size=all`;
        const ledgerApprovalsUrl = `${API_URL}/finance/approvals/?page_size=100${dateParams}`;
        const batchesUrl = `${API_URL}/finance/ledger-batches/?page_size=200`;

        const [resL, resG, resClaims, resApps, resBatches] = await Promise.all([
          fetch(ledgersUrl, fetchOptions),
          fetch(groupsUrl, fetchOptions),
          fetch(claimsUrl, fetchOptions),
          fetch(ledgerApprovalsUrl, fetchOptions),
          fetch(batchesUrl, fetchOptions)
        ]);
        if (signal.aborted) return;

        if (resL.ok) {
          const lData = await resL.json();
          if (lData && Array.isArray(lData.results)) {
            setLedgers(lData.results);
            const count = lData.count ?? lData.results.length;
            setLedgerTotalCount(count);
          } else {
            const list = parseList(lData);
            setLedgers(list);
            setLedgerTotalCount(list.length);
          }
        }

        if (resG.ok) {
          setLedgerGroups(parseList(await resG.json()));
        }

        if (resClaims.ok) {
          setBundles(parseList(await resClaims.json()));
        }

        if (resApps.ok) {
          setApprovals(parseList(await resApps.json()));
        }

        if (resBatches.ok) {
          setLedgerBatches(parseList(await resBatches.json()));
        }
      }
      else if (subpage === 'approvals') {
        const res = await fetch(approvalsUrl, { headers, signal });
        if (signal.aborted) return;
        if (res.ok) setApprovals(parseList(await res.json()));
      } else if (subpage === 'payments') {
        const [resPay, resAudit] = await Promise.all([
          fetch(`${API_URL}/finance/payments/?page_size=all${dateParams}`, { headers, signal }),
          fetch(`${API_URL}/finance/audit-events/?page_size=all${dateParams}`, { headers, signal })
        ]);
        if (signal.aborted) return;
        if (resPay.ok) setPayments(parseList(await resPay.json()));
        if (resAudit.ok) setAuditEvents(parseList(await resAudit.json()));
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) {
        // Silently return on tab cancellation
        return;
      }
      setErrorMessage(err.message || 'Failed to connect to backend server.');
    } finally {
      if (!signal.aborted) {
        if (!isSilent) setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData(false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    subpage,
    token,
    roleFilterOnly,
    filterDateFrom,
    filterDateTo,
    filterDateType,
    ledgerBatchFilter,
    debouncedSearchQuery,
    statusFilter,
    bundleFilter,
    expenseWorkerFilter,
    ledgerFilter,
    expensePage,
    expensePageSize,
    expenseOrdering,
    bundlePage,
    bundlePageSize,
    ledgerPage,
    ledgerPageSize
  ]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Status Badge Renderer
  const renderStatusBadge = (
    status: string,
    isActionableForMe?: boolean,
    stepName?: string,
    hasCurrentUserApproved?: boolean
  ) => renderFinanceStatusBadge(status, isActionableForMe, stepName, hasCurrentUserApproved);

  // Helper date checker
  const isWithinDateRange = (targetDateStr: string, fromDateStr: string, toDateStr: string) => {
    if (!targetDateStr) return true;
    const target = new Date(targetDateStr).getTime();
    if (fromDateStr && target < new Date(fromDateStr).getTime()) return false;
    if (toDateStr && target > new Date(toDateStr + 'T23:59:59').getTime()) return false;
    return true;
  };

  // Filtered lists for main tables
  const filteredBundles = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    const bundleMatch = trimmedQuery ? (
      trimmedQuery.match(/^(?:bundle|claim|b)?[\s\-_#]*(\d+)$/i) ||
      trimmedQuery.match(/(?:bundle|claim|b)[\s\-_#]+(\d+)/i) ||
      trimmedQuery.match(/#(\d+)/) ||
      trimmedQuery.match(/\b\d+\b/)
    ) : null;
    const targetBundleId = bundleMatch ? Number(bundleMatch[1] || bundleMatch[0]) : null;

    if (subpage === 'bundles') {
      if (!targetBundleId) return bundles;
      return [...bundles].sort((a, b) => {
        if (a.claim_id === targetBundleId && b.claim_id !== targetBundleId) return -1;
        if (b.claim_id === targetBundleId && a.claim_id !== targetBundleId) return 1;
        return 0;
      });
    }

    const filtered = bundles.filter((b) => {
      if (statusFilter !== 'ALL') {
        const filterLower = statusFilter.toLowerCase().trim();
        const bStatusLower = (b.status || '').toLowerCase().trim();
        const matchesStatus = (filterLower === 'in review' || filterLower === 'submitted')
          ? (bStatusLower === 'in review' || bStatusLower === 'submitted')
          : bStatusLower === filterLower;
        if (!matchesStatus && b.claim_id !== targetBundleId) return false;
      }
      if (ledgerFilter === 'IN_LEDGER' && !b.ledger_details && b.claim_id !== targetBundleId) return false;
      if (ledgerFilter === 'NOT_IN_LEDGER' && b.ledger_details && b.claim_id !== targetBundleId) return false;
      if (!isWithinDateRange(b.claim_date, filterDateFrom, filterDateTo) && b.claim_id !== targetBundleId) return false;
      if (trimmedQuery) {
        if (targetBundleId && b.claim_id === targetBundleId) return true;
        const query = trimmedQuery.toLowerCase();
        const workerName = (b.worker_detail?.full_name || b.worker_detail?.username || '').toLowerCase();
        const claimIdStr = b.claim_id.toString();
        const ticketStr = b.ticket_details?.work_order_no?.toLowerCase() || '';
        const remarksStr = (b.remarks || '').toLowerCase();
        const ledgerName = (b.ledger_details?.group_name || '').toLowerCase();
        return workerName.includes(query) || claimIdStr.includes(query) || ticketStr.includes(query) || remarksStr.includes(query) || ledgerName.includes(query);
      }
      return true;
    });

    if (targetBundleId) {
      return [...filtered].sort((a, b) => {
        if (a.claim_id === targetBundleId && b.claim_id !== targetBundleId) return -1;
        if (b.claim_id === targetBundleId && a.claim_id !== targetBundleId) return 1;
        return 0;
      });
    }
    return filtered;
  }, [subpage, bundles, statusFilter, ledgerFilter, filterDateFrom, filterDateTo, searchQuery]);

  const filteredLedgers = useMemo(() => {
    if (subpage === 'ledgers') {
      return ledgers;
    }
    // Group ledgers by group ID to determine each Ledger Group's unified status
    const groupBatchesMap = new Map<string | number, LedgerItem[]>();
    for (const l of ledgers) {
      const gId = l.ledger_group_detail?.ledger_group_id || l.ledger_group || `ungrouped_${l.ledger_id}`;
      if (!groupBatchesMap.has(gId)) {
        groupBatchesMap.set(gId, []);
      }
      groupBatchesMap.get(gId)!.push(l);
    }

    const matchingGroupIds = new Set<string | number>();

    for (const [gId, groupBatches] of groupBatchesMap.entries()) {
      const matchedDynGroup = ledgerGroups?.find(g => String(g.ledger_group_id) === String(gId));
      const isPaid = Boolean(
        matchedDynGroup?.is_paid ||
        groupBatches.some(b => b.ledger_group_detail?.is_paid) ||
        (groupBatches.length > 0 && groupBatches.every(b => b.status === 'Paid'))
      );
      const isCompleted = Boolean(
        matchedDynGroup?.is_completed ||
        groupBatches.some(b => b.ledger_group_detail?.is_completed)
      );

      // Determine unified Ledger Group status
      let groupStatus = 'Draft';
      if (isPaid) {
        groupStatus = 'Paid';
      } else if (groupBatches.some(b => b.status === 'Rework')) {
        groupStatus = 'Rework';
      } else if (groupBatches.some(b => b.status === 'In Review' || b.status === 'Submitted')) {
        groupStatus = 'In Review';
      } else if (groupBatches.some(b => b.status === 'Rejected')) {
        groupStatus = 'Rejected';
      } else if (isCompleted || (groupBatches.length > 0 && groupBatches.every(b => b.status === 'Approved' || b.status === 'Paid'))) {
        groupStatus = 'Approved';
      } else {
        groupStatus = 'Draft';
      }

      // Check Status Filter against Ledger Group Status
      if (statusFilter !== 'ALL') {
        const filterLower = statusFilter.toLowerCase();
        const statusLower = groupStatus.toLowerCase();
        const matchesStatus = filterLower === 'in review'
          ? (statusLower === 'in review' || statusLower === 'submitted')
          : statusLower === filterLower;

        if (!matchesStatus) {
          continue;
        }
      }

      // Check Date Range Filter
      const groupCreatedAt = matchedDynGroup?.created_at || groupBatches[0]?.created_at;
      const isGroupDateInRange = groupBatches.some(b => isWithinDateRange(b.created_at, filterDateFrom, filterDateTo)) ||
        (groupCreatedAt && isWithinDateRange(groupCreatedAt, filterDateFrom, filterDateTo));

      if (!isGroupDateInRange) {
        continue;
      }

      // Check Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const gName = (matchedDynGroup?.group_name || groupBatches[0]?.ledger_group_detail?.group_name || '').toLowerCase();
        const gIdStr = String(gId).toLowerCase();
        const creatorName = (groupBatches[0]?.created_by_detail?.full_name || groupBatches[0]?.created_by_detail?.username || '').toLowerCase();

        const matchesQuery = gName.includes(query) ||
          gIdStr.includes(query) ||
          creatorName.includes(query) ||
          groupBatches.some(b => {
            const bIdStr = String(b.ledger_id);
            const bName = (b.ledger_batch_detail?.batch_name || '').toLowerCase();
            const bRemarks = (b.remarks || '').toLowerCase();
            const bundlesMatch = (b.bundles || []).some((bundle: any) => {
              const bundleId = String(bundle.claim_id || bundle.id || '');
              const worker = (bundle.worker_detail?.full_name || bundle.worker_detail?.username || '').toLowerCase();
              return bundleId.includes(query) || worker.includes(query);
            });
            return bIdStr.includes(query) || bName.includes(query) || bRemarks.includes(query) || bundlesMatch;
          });

        if (!matchesQuery) {
          continue;
        }
      }

      matchingGroupIds.add(gId);
    }

    return ledgers.filter(l => {
      const gId = l.ledger_group_detail?.ledger_group_id || l.ledger_group || `ungrouped_${l.ledger_id}`;
      return matchingGroupIds.has(gId);
    });
  }, [ledgers, ledgerGroups, statusFilter, filterDateFrom, filterDateTo, searchQuery]);

  const roleFilteredApprovals = useMemo(() => {
    return approvals.filter((a) => {
      if (roleFilterOnly && currentUser) {
        const userRoleName = (
          (currentUser?.role as any)?.role_name ||
          (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
          ''
        ).toLowerCase().trim();

        const isAdmin = !!(
          currentUser?.is_superuser ||
          (currentUser as any)?.is_staff ||
          userRoleName === 'administrator' ||
          userRoleName === 'admin'
        );
        if (isAdmin) return true;

        if (a.can_action) return true;

        const currentUsername = currentUser.username;
        const assignedUsers = a.workflow_steps?.flatMap(s => s.assigned_users_names || []) || [];
        if (currentUsername && assignedUsers.includes(currentUsername)) return true;

        const userRoleStr = (
          (currentUser?.role as any)?.role_name ||
          (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
          ''
        ).toLowerCase().trim();

        const stepRoleStr = (a.assigned_role_name || '').toLowerCase().trim();
        if (userRoleStr && stepRoleStr && stepRoleStr === userRoleStr) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [approvals, roleFilterOnly, currentUser]);

  const displayedApprovals = useMemo(() => {
    return roleFilteredApprovals.filter((a) => {
      if (approvalEntityTab !== 'ALL') {
        const entityType = a.target_summary?.type || (a.claim ? 'Bundle' : (a.ledger ? 'Ledger' : 'Expense'));
        if (entityType !== approvalEntityTab) return false;
      }
      if (approvalStatusTab !== 'ALL') {
        if (a.status !== approvalStatusTab) return false;
      }
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (!isWithinDateRange(a.created_at, filterDateFrom, filterDateTo)) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const step = (a.step_name || '').toLowerCase();
        const role = (a.assigned_role_name || '').toLowerCase();
        const targetLabel = a.target_summary?.label?.toLowerCase() || '';
        const storeName = a.target_summary?.store_name?.toLowerCase() || '';
        const workerName = a.target_summary?.worker?.toLowerCase() || '';
        return step.includes(query) || role.includes(query) || targetLabel.includes(query) || storeName.includes(query) || workerName.includes(query);
      }
      return true;
    });
  }, [roleFilteredApprovals, approvalEntityTab, approvalStatusTab, statusFilter, filterDateFrom, filterDateTo, searchQuery]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (!isWithinDateRange(p.paid_at, filterDateFrom, filterDateTo)) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const method = (p.payment_method || '').toLowerCase();
        const ref = (p.transaction_reference || '').toLowerCase();
        const idStr = p.payment_id.toString();
        return method.includes(query) || ref.includes(query) || idStr.includes(query);
      }
      return true;
    });
  }, [payments, filterDateFrom, filterDateTo, searchQuery]);

  const uniqueExpenseWorkers = useMemo(() => {
    const map = new Map<number, {
      id: number;
      name: string;
      username: string;
      employee_no?: string;
      profile_image?: string | null;
      department_name?: string;
      sub_departments?: { sub_department_id: number; sub_department_name: string }[];
      unclaimed_count: number;
      unclaimed_total: number;
    }>();
    unclaimedExpenses.forEach((exp) => {
      if (exp.is_claimed || exp.claim) return;
      if (!isWithinDateRange(exp.expense_date, expenseFilterFrom, expenseFilterTo)) return;
      const workerId = getUserId(exp.worker) ?? getUserId(exp.worker_detail) ?? getUserId((exp as any).added_by);
      if (workerId !== null) {
        const workerObj = typeof exp.worker === 'object' && exp.worker ? exp.worker : (exp.worker_detail || (exp as any).added_by);
        const displayName = workerObj?.full_name || workerObj?.username || `Worker ${workerId}`;
        const deptName = (exp.ticket_details as any)?.department_name || (exp.expense_type_detail as any)?.department_name || (exp.expense_type as any)?.department?.department_name || 'General Maintenance';
        const amt = parseFloat(exp.amount || '0');
        const profImg = workerObj?.profile_image || (typeof exp.worker === 'object' ? exp.worker?.profile_image : null) || exp.worker_detail?.profile_image || null;
        const subDepts = (workerObj as any)?.sub_departments || (typeof exp.worker === 'object' ? (exp.worker as any)?.sub_departments : null) || (exp.worker_detail as any)?.sub_departments || [];
        const isEligible = (exp.expense_type && (exp.expense_type as any).approve_required === false) ||
          (exp.expense_type_detail && (exp.expense_type_detail as any).approve_required === false) ||
          exp.approved === true || (exp.approved as any) === 'true' || (exp.approved as any) === 1 ||
          exp.status_display === 'Approved';

        const existing = map.get(workerId);
        if (existing) {
          if (isEligible) {
            existing.unclaimed_count += 1;
            existing.unclaimed_total += amt;
          }
          if (workerObj?.full_name && (!existing.name || existing.name.startsWith('Worker ') || existing.name === existing.username)) {
            existing.name = workerObj.full_name;
          }
          if (!existing.employee_no && workerObj?.employee_no) {
            existing.employee_no = workerObj.employee_no;
          }
          if (!existing.username && workerObj?.username) {
            existing.username = workerObj.username;
          }
          if (!existing.department_name && deptName) {
            existing.department_name = deptName;
          }
          if (!existing.profile_image && profImg) {
            existing.profile_image = profImg;
          }
          if ((!existing.sub_departments || existing.sub_departments.length === 0) && subDepts.length > 0) {
            existing.sub_departments = subDepts;
          }
        } else {
          map.set(workerId, {
            id: workerId,
            name: displayName,
            username: workerObj?.username || '',
            employee_no: workerObj?.employee_no || '',
            profile_image: profImg,
            department_name: deptName,
            sub_departments: subDepts,
            unclaimed_count: isEligible ? 1 : 0,
            unclaimed_total: isEligible ? amt : 0
          });
        }
      }
    });
    return Array.from(map.values());
  }, [unclaimedExpenses, expenseFilterFrom, expenseFilterTo]);

  const filteredUnclaimedExpenses = useMemo(() => {
    const list = unclaimedExpenses.filter((exp) => {
      if (exp.is_claimed || exp.claim) return false;
      if (!isWithinDateRange(exp.expense_date, expenseFilterFrom, expenseFilterTo)) return false;

      // Filter by Technician / Employee selection
      if (expenseSearchWorker.trim()) {
        const query = expenseSearchWorker.toLowerCase().trim();
        const workerObj = typeof exp.worker === 'object' && exp.worker ? exp.worker : (exp.worker_detail || (exp as any).added_by);
        const workerId = getUserId(exp.worker) ?? getUserId(exp.worker_detail) ?? getUserId((exp as any).added_by);

        const fullName = (workerObj?.full_name || '').toLowerCase();
        const username = (workerObj?.username || '').toLowerCase();
        const empNo = (workerObj?.employee_no || '').toLowerCase();
        const workerIdStr = workerId !== null && workerId !== undefined ? String(workerId) : '';
        const workerLabel = `worker ${workerIdStr}`;

        const matchedWorker = uniqueExpenseWorkers.find(
          w => w.name.toLowerCase() === query ||
            (w.username && w.username.toLowerCase() === query) ||
            (w.employee_no && w.employee_no.toLowerCase() === query) ||
            String(w.id) === query
        );

        let isMatch = false;
        if (matchedWorker && workerId !== null) {
          isMatch = (workerId === matchedWorker.id) ||
            (Boolean(matchedWorker.username) && (username === matchedWorker.username?.toLowerCase())) ||
            (Boolean(matchedWorker.employee_no) && (empNo === matchedWorker.employee_no?.toLowerCase()));
        }

        if (!isMatch) {
          isMatch = fullName.includes(query) ||
            username.includes(query) ||
            empNo.includes(query) ||
            workerIdStr === query ||
            workerLabel.includes(query);
        }

        if (!isMatch) return false;
      }

      // Search by Expense Details (Ticket #, Expense Type/Name, Remarks, Store, Expense ID, Amount)
      if (expenseSearchText.trim()) {
        const query = expenseSearchText.toLowerCase();
        const ticketNo = exp.ticket_details?.work_order_no?.toLowerCase() || '';
        const ticketTitle = exp.ticket_details?.title?.toLowerCase() || '';
        const expIdStr = exp.expense_id.toString();
        const remarksStr = (exp.remarks || '').toLowerCase();
        const expTypeStr = (exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || '').toLowerCase();
        const storeStr = (exp.responsible_store?.store_name || '').toLowerCase();
        const amountStr = exp.amount ? exp.amount.toString() : '';

        const matches = ticketNo.includes(query) ||
          ticketTitle.includes(query) ||
          expIdStr.includes(query) ||
          remarksStr.includes(query) ||
          expTypeStr.includes(query) ||
          storeStr.includes(query) ||
          amountStr.includes(query);
        if (!matches) return false;
      }

      return true;
    });

    // Sort: Approved expenses first (top), unapproved expenses at the bottom
    return list.sort((a, b) => {
      const aApproved = a.approved === true || (a.approved as any) === 'true' || (a.approved as any) === 1 || ((a.expense_type as any)?.approve_required === false) || ((a.expense_type_detail as any)?.approve_required === false) || a.status_display === 'Approved';
      const bApproved = b.approved === true || (b.approved as any) === 'true' || (b.approved as any) === 1 || ((b.expense_type as any)?.approve_required === false) || ((b.expense_type_detail as any)?.approve_required === false) || b.status_display === 'Approved';

      if (aApproved && !bApproved) return -1;
      if (!aApproved && bApproved) return 1;

      // Secondary sort: by expense date descending, then expense ID descending
      const dateA = new Date(a.expense_date || 0).getTime();
      const dateB = new Date(b.expense_date || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return b.expense_id - a.expense_id;
    });
  }, [unclaimedExpenses, expenseSearchWorker, expenseSearchText, expenseFilterFrom, expenseFilterTo, uniqueExpenseWorkers]);

  const selectedExpensesTotal = useMemo(() => {
    return unclaimedExpenses
      .filter((exp) => selectedExpenseIds.includes(exp.expense_id))
      .reduce((sum, exp) => sum + parseFloat(exp.amount || '0'), 0);
  }, [unclaimedExpenses, selectedExpenseIds]);

  // Actions
  const handleCreateBundle = async () => {
    if (selectedExpenseIds.length === 0) {
      setErrorMessage('Please select at least one expense to create a bundle.');
      return;
    }
    if (!bundleRemarks || !bundleRemarks.trim()) {
      setErrorMessage('Bundle Remarks are required.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    const firstSelected = unclaimedExpenses.find(e => selectedExpenseIds.includes(e.expense_id));
    const firstWorkerObj = firstSelected ? (typeof firstSelected.worker === 'object' ? firstSelected.worker : firstSelected.worker_detail) : null;
    const targetWorkerId = selectedWorkerId ?? (getUserId(firstSelected?.worker) ?? getUserId(firstSelected?.worker_detail) ?? getUserId((firstSelected as any)?.added_by));
    const workerName = firstWorkerObj?.full_name || firstWorkerObj?.username || expenseSearchWorker || 'Worker';

    try {
      const res = await fetch(`${API_URL}/finance/claim/create-bundle/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          worker_id: targetWorkerId,
          expense_ids: selectedExpenseIds,
          period_from: bundlePeriodFrom || undefined,
          period_to: bundlePeriodTo || undefined,
          remarks: bundleRemarks || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.detail || (typeof data === 'object' ? Object.values(data).flat().join(' ') : 'Failed to create claim bundle');
        throw new Error(errorMsg);
      }

      // Activate the skeleton row loader immediately with the created bundle's metadata
      const newBundleInfo = {
        claim_id: data.claim_id,
        worker_name: (typeof data.worker_detail === 'object' ? (data.worker_detail?.full_name || data.worker_detail?.username) : '') || workerName || 'Worker',
        amount: data.total_amount ? Number(data.total_amount) : selectedExpensesTotal
      };
      setSyncingBundleInfo(newBundleInfo);
      setIsSyncingNewBundle(true);

      setSuccessMessage(`Bundle ${data.claim_id} created successfully.`);
      setShowCreateBundleModal(false);
      setSelectedExpenseIds([]);
      setSelectedWorkerId(null);
      setExpenseSearchWorker('');
      setBundleRemarks('');

      // Optimistically append/insert to bundles list if not present
      if (data && data.claim_id) {
        setBundles(prev => {
          if (prev.some(b => b.claim_id === data.claim_id)) return prev;
          return [data, ...prev];
        });
      }

      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
      // Keep skeleton loader active briefly so it transitions smoothly when fresh data is displayed
      setTimeout(() => {
        setIsSyncingNewBundle(false);
        setSyncingBundleInfo(null);
      }, 800);
    }
  };

  const handleSubmitBundle = async (claimId: number) => {
    const bundleToSubmit = (bundles || []).find(c => c.claim_id === claimId);
    if (bundleToSubmit && (!bundleToSubmit.expenses || bundleToSubmit.expenses.length === 0)) {
      setErrorMessage(`Cannot submit Bundle ${claimId}: No expenses attached to this bundle.`);
      return;
    }
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/claim/${claimId}/submit/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submission failed');
      setSuccessMessage(`Bundle ${claimId} submitted into multi-step approval workflow.`);

      // Instantly update bundle in memory with backend response so Report and In Review show immediately
      setBundles(prev => prev.map(b => b.claim_id === claimId ? { ...b, ...data, status: data.status || 'In Review' } : b));


      if (data && data.approval_instances && Array.isArray(data.approval_instances)) {
        setApprovals(prev => [
          ...data.approval_instances,
          ...prev.filter(a => a.claim !== claimId && a.claim_id !== claimId)
        ]);
      }

      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
      // Re-sync with backend to ensure the UI updates if there was a status mismatch
      await fetchData(true, true);
    }
  };

  const handleCreateLedger = async () => {
    const validUnassignedIds = new Set(
      bundles
        .filter(b => b.status === 'Approved' && !b.ledger_id && (!b.ledger_details || b.ledger_details.status === 'Rejected') && (!Array.isArray((b as any).ledgers) || (b as any).ledgers.length === 0))
        .map(b => b.claim_id)
    );
    const targetBundleIds = selectedBundleIds.filter(id => validUnassignedIds.has(id));

    if (targetBundleIds.length === 0) {
      setErrorMessage('Select at least one approved bundle.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      let gId = selectedGroupId ? parseInt(selectedGroupId, 10) : undefined;
      if (!gId && newGroupName.trim()) {
        const resG = await fetch(`${API_URL}/finance/ledger-groups/`, {
          method: 'POST',
          headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_name: newGroupName.trim() })
        });
        const groupData = await resG.json();
        if (!resG.ok) {
          const errMsg = groupData.group_name
            ? (Array.isArray(groupData.group_name) ? groupData.group_name[0] : groupData.group_name)
            : (groupData.detail || groupData.error || 'Failed to create Ledger Group');
          throw new Error(errMsg);
        }
        gId = groupData.ledger_group_id;
      }

      const res = await fetch(`${API_URL}/finance/ledgers/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle_ids: targetBundleIds,
          ledger_group: gId,
          remarks: ledgerRemarks || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
      const createdIds = Array.isArray(data)
        ? data.map((l: any) => l.ledger_id).filter(Boolean)
        : data?.ledger_id
          ? [data.ledger_id]
          : Array.isArray(data?.ledgers)
            ? data.ledgers.map((l: any) => l.ledger_id).filter(Boolean)
            : [];

      const newLedgerItems = Array.isArray(data)
        ? data
        : data?.ledger_id
          ? [data]
          : Array.isArray(data?.ledgers)
            ? data.ledgers
            : [];

      // Calculate approximate total amount from selected bundles
      const selectedBundlesObj = bundles.filter(b => targetBundleIds.includes(b.claim_id));
      const totalAmount = selectedBundlesObj.reduce((sum, b) => sum + (parseFloat(b.total_claimed_amount) || 0), 0);

      const targetGroupName = selectedGroupId
        ? ledgerGroups.find(g => String(g.ledger_group_id) === String(selectedGroupId))?.group_name
        : newGroupName.trim();

      // Trigger syncing loader state for Ledgers
      setSyncingLedgerInfo({
        ledger_id: createdIds[0],
        group_name: targetGroupName,
        bundles_count: targetBundleIds.length,
        total_amount: totalAmount
      });
      setIsSyncingNewLedger(true);

      // Optimistically sync newly created/updated ledgers and reset sibling batches in group to Draft
      if (newLedgerItems.length > 0) {
        const updatedById = new Map<number, any>();
        newLedgerItems.forEach((l: any) => {
          if (l?.ledger_id) updatedById.set(l.ledger_id, l);
        });
        setLedgers(prev => {
          const mapped = prev.map(existing => {
            if (updatedById.has(existing.ledger_id)) {
              return updatedById.get(existing.ledger_id);
            }
            const existingGroupId = existing.ledger_group_detail?.ledger_group_id ?? existing.ledger_group;
            if (gId && Number(existingGroupId) === Number(gId) && existing.status !== 'Paid') {
              return {
                ...existing,
                status: 'Draft',
                approval_history: [],
                ledger_group_detail: existing.ledger_group_detail
                  ? { ...existing.ledger_group_detail, is_completed: false }
                  : existing.ledger_group_detail
              };
            }
            return existing;
          });
          const existingIds = new Set(prev.map(l => l.ledger_id));
          const toAdd = newLedgerItems.filter((l: any) => !existingIds.has(l.ledger_id));
          return [...toAdd, ...mapped];
        });
      }

      const ledgerMsg = createdIds.length > 1
        ? `Ledgers (${createdIds.join(', ')}) assembled successfully.`
        : createdIds.length === 1
          ? `Ledger ${createdIds[0]} assembled successfully.`
          : `Ledger batch assembled successfully.`;
      setSuccessMessage(ledgerMsg);
      setShowCreateLedgerModal(false);
      setSelectedBundleIds([]);
      setNewGroupName('');

      await fetchData(true);

      setTimeout(() => {
        setIsSyncingNewLedger(false);
        setSyncingLedgerInfo(null);
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitLedger = async (ledgerId: number) => {
    const targetLedger = (ledgers || []).find(l => l.ledger_id === ledgerId);
    const bundleCount = (targetLedger?.bundles?.length || 0) + (targetLedger?.expenses?.length || 0);
    if (targetLedger && bundleCount === 0) {
      setErrorMessage(`Cannot submit Ledger Batch ${ledgerId}: Must have at least one claim bundle attached.`);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/finance/ledgers/${ledgerId}/submit/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submission failed');
      setSuccessMessage(`Ledger ${ledgerId} submitted for approval.`);
      fetchData(true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleActionApproval = async (
    customAction?: 'APPROVED' | 'REJECTED' | 'REWORK',
    customComments?: string,
    customApp?: ApprovalInstanceItem,
    customLedgerGroupId?: number | string | null,
    customNewGroupName?: string
  ) => {
    const targetApp = customApp || showApprovalModal;
    if (!targetApp) return;
    const actionToPerform = customAction || approvalAction;
    const commentsToSend = customComments !== undefined ? customComments : approvalComments;

    if (actionToPerform === 'REWORK' && !commentsToSend?.trim()) {
      setErrorMessage('A reason or comment is required when requesting rework.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const isDirectExp = (targetApp as any).is_direct_expense;
      const isBundle = Boolean(targetApp.claim || targetApp.claim_id || targetApp.target_summary?.type === 'Bundle');
      const bundleId = targetApp.claim || targetApp.claim_id || (targetApp.target_summary?.type === 'Bundle' ? targetApp.target_summary?.id : undefined);
      const isExp = Boolean(targetApp.expense || targetApp.expense_id || targetApp.target_summary?.type === 'Expense' || isDirectExp);
      const expId = targetApp.expense || targetApp.expense_id;
      let res: Response;

      const bodyPayload: any = { action: actionToPerform, comments: commentsToSend };
      if (customLedgerGroupId) {
        bodyPayload.ledger_group_id = Number(customLedgerGroupId);
      }
      if (customNewGroupName && customNewGroupName.trim()) {
        bodyPayload.new_group_name = customNewGroupName.trim();
      }

      if (isDirectExp && expId) {
        res = await fetch(`${API_URL}/finance/expense/${expId}/action/`, {
          method: 'POST',
          headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
      } else {
        res = await fetch(`${API_URL}/finance/approvals/${targetApp.instance_id}/action/`, {
          method: 'POST',
          headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        if (!res.ok) {
          if (isBundle && bundleId) {
            res = await fetch(`${API_URL}/finance/claim/${bundleId}/action/`, {
              method: 'POST',
              headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyPayload)
            });
          } else if (isExp && expId) {
            res = await fetch(`${API_URL}/finance/expense/${expId}/action/`, {
              method: 'POST',
              headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyPayload)
            });
          }
        }
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Approval action failed');
      setSuccessMessage(`Approval step actioned: ${actionToPerform}`);
      setShowApprovalModal(null);
      setApprovalComments('');

      // In-Memory Optimistic Frontend Update (No full table loading spinner)
      const updatedInstance = data.instance || (typeof data === 'object' && data.instance_id ? data : null);
      const updatedLedgerObj = data.ledger || (updatedInstance && updatedInstance.ledger_details) || null;

      // 1. Update Approvals state
      setApprovals(prev => prev.map(a => {
        if (a.instance_id === targetApp.instance_id) {
          if (updatedInstance && typeof updatedInstance === 'object') {
            return { ...a, ...updatedInstance, status: updatedInstance.status || (actionToPerform === 'APPROVED' ? 'Approved' : actionToPerform === 'REWORK' ? 'Rework' : 'Rejected') };
          }
          return {
            ...a,
            status: actionToPerform === 'APPROVED' ? 'Approved' : actionToPerform === 'REWORK' ? 'Rework' : 'Rejected'
          };
        }
        return a;
      }));

      // 2. Update Ledgers state directly in memory
      const targetLedgerId = targetApp.ledger || targetApp.ledger_id || (targetApp.target_summary?.type === 'Ledger' ? targetApp.target_summary?.id : undefined) || (updatedLedgerObj && updatedLedgerObj.ledger_id);
      if (targetLedgerId) {
        setLedgers(prev => prev.map(l => {
          if (l.ledger_id === targetLedgerId) {
            if (updatedLedgerObj && typeof updatedLedgerObj === 'object') {
              return { ...l, ...updatedLedgerObj };
            }
            const nextStatus = actionToPerform === 'REWORK'
              ? 'Rework'
              : actionToPerform === 'REJECTED'
                ? 'Rejected'
                : data.all_completed || data.status === 'Approved'
                  ? 'Approved'
                  : l.status;
            return {
              ...l,
              status: nextStatus
            };
          }
          return l;
        }));
      }

      // 3. Update Bundles state directly if applicable
      const targetClaimId = bundleId || (updatedInstance && updatedInstance.claim_id);
      if (targetClaimId) {
        setBundles(prev => prev.map(b => {
          if (b.claim_id === targetClaimId) {
            if (data.bundle && typeof data.bundle === 'object') {
              return { ...b, ...data.bundle };
            }
            const nextStatus = actionToPerform === 'REWORK'
              ? 'Rework'
              : actionToPerform === 'REJECTED'
                ? 'Rejected'
                : (data.all_completed || data.status === 'Approved')
                  ? 'Approved'
                  : b.status;
            const updatedApprovalInstances = Array.isArray(b.approval_instances)
              ? b.approval_instances.map(inst => inst.instance_id === targetApp.instance_id ? { ...inst, status: actionToPerform === 'APPROVED' ? 'Approved' : actionToPerform === 'REWORK' ? 'Rework' : 'Rejected' } : inst)
              : b.approval_instances;
            return { ...b, status: nextStatus, approval_instances: updatedApprovalInstances };
          }
          return b;
        }));

      }

      // 4. Update Expenses state directly if applicable
      if (expId) {
        setExpenses(prev => prev.map(e => {
          if (e.expense_id === expId) {
            if (data.expense && typeof data.expense === 'object') {
              return { ...e, ...data.expense };
            }
            const nextApproved = actionToPerform === 'APPROVED' && data.all_completed;
            const nextStatus = actionToPerform === 'REWORK'
              ? 'Rework'
              : actionToPerform === 'REJECTED'
                ? 'Rejected'
                : data.all_completed
                  ? 'Approved'
                  : (e.status_display || (e.approved ? 'Approved' : 'Pending Approval'));
            return { ...e, approved: !!nextApproved, status_display: nextStatus };
          }
          return e;
        }));
      }

      // 5. Silent background sync without table spinner (bypass cache to fetch fresh data)
      fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const syncReceiptInFinanceState = (
    target: PaymentItem | WorkerClaimItem | LedgerItem,
    updatedReceiptUrl: string | null
  ) => {
    const isClaimTarget = 'claim_id' in target;
    const isLedgerTarget = 'ledger_id' in target && !isClaimTarget;
    const isPaymentTarget = 'payment_id' in target;

    const claimId = isClaimTarget
      ? (target as WorkerClaimItem).claim_id
      : isPaymentTarget
        ? (target as PaymentItem).claim
        : undefined;
    const ledgerId = isLedgerTarget
      ? (target as LedgerItem).ledger_id
      : isPaymentTarget
        ? (target as PaymentItem).ledger
        : undefined;
    const paymentId = isPaymentTarget ? (target as PaymentItem).payment_id : undefined;

    setShowPaymentModal((prev) =>
      prev
        ? ({
            ...prev,
            payment_receipt_image: updatedReceiptUrl,
            receipt_image: updatedReceiptUrl,
          } as any)
        : null
    );

    if (claimId !== undefined) {
      setSelectedBundleForView((prev) =>
        prev && prev.claim_id === claimId
          ? { ...prev, payment_receipt_image: updatedReceiptUrl }
          : prev
      );
      setBundles((prev) =>
        prev.map((b) =>
          b.claim_id === claimId ? { ...b, payment_receipt_image: updatedReceiptUrl } : b
        )
      );
      setLedgers((prev) =>
        prev.map((l) => ({
          ...l,
          ...(updatedReceiptUrl === null && l.ledger_id === (target as any)?.ledger_details?.ledger_id
            ? { payment_receipt_image: null }
            : {}),
          bundles: (l.bundles || []).map((b) =>
            b.claim_id === claimId ? { ...b, payment_receipt_image: updatedReceiptUrl } : b
          ),
        }))
      );
    } else if (ledgerId !== undefined) {
      setLedgers((prev) =>
        prev.map((l) =>
          l.ledger_id === ledgerId ? { ...l, payment_receipt_image: updatedReceiptUrl } : l
        )
      );
    }

    if (paymentId !== undefined) {
      setPayments((prev) =>
        prev.map((p) =>
          p.payment_id === paymentId ? { ...p, receipt_image: updatedReceiptUrl } : p
        )
      );
    }
  };

  const getReceiptTargetIds = (target: PaymentItem | WorkerClaimItem | LedgerItem) => {
    const isClaim = 'claim_id' in target;
    const isLedger = 'ledger_id' in target && !isClaim;
    const isPayment = 'payment_id' in target;
    return {
      paymentId: isPayment ? (target as PaymentItem).payment_id : undefined,
      claimId: isClaim ? (target as WorkerClaimItem).claim_id : undefined,
      ledgerId: isLedger ? (target as LedgerItem).ledger_id : undefined,
    };
  };

  const handleUploadSettledReceipt = async (receiptFile: File) => {
    if (!showPaymentModal || !receiptFile) return;
    setSubmitting(true);
    setErrorMessage(null);
    const { paymentId, claimId, ledgerId } = getReceiptTargetIds(showPaymentModal);
    try {
      const formData = new FormData();
      if (paymentId !== undefined) formData.append('payment_id', String(paymentId));
      if (claimId !== undefined) formData.append('bundle_id', String(claimId));
      if (ledgerId !== undefined) formData.append('ledger_id', String(ledgerId));
      formData.append('receipt_image', receiptFile);

      const res = await fetch(`${API_URL}/finance/payments/upload-receipt/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
      const updatedUrl: string | null = data?.payment_receipt_image ?? data?.receipt_image ?? null;
      syncReceiptInFinanceState(showPaymentModal, updatedUrl);
      setSuccessMessage('Signed settlement receipt uploaded successfully.');
      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload settlement receipt.');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSettledReceipt = async () => {
    if (!showPaymentModal) return;
    setSubmitting(true);
    setErrorMessage(null);
    const { paymentId, claimId, ledgerId } = getReceiptTargetIds(showPaymentModal);
    try {
      const bodyPayload: Record<string, number> = {};
      if (paymentId !== undefined) bodyPayload.payment_id = paymentId;
      if (claimId !== undefined) bodyPayload.bundle_id = claimId;
      if (ledgerId !== undefined) bodyPayload.ledger_id = ledgerId;

      const res = await fetch(`${API_URL}/finance/payments/delete-receipt/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
      syncReceiptInFinanceState(showPaymentModal, null);
      setSuccessMessage('Signed settlement receipt deleted successfully.');
      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete settlement receipt.');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessPayment = async (receiptFile?: File | null) => {
    if (!showPaymentModal) return;
    if (!receiptFile) {
      setErrorMessage('Please upload the signed payment receipt image before confirming cash settlement.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    const isClaim = 'claim_id' in showPaymentModal;
    const claimId = isClaim ? (showPaymentModal as WorkerClaimItem).claim_id : undefined;
    const ledgerId = !isClaim ? (showPaymentModal as LedgerItem).ledger_id : undefined;

    try {
      const fullAmount = 'total_claimed_amount' in showPaymentModal
        ? showPaymentModal.total_claimed_amount
        : 'total_amount' in showPaymentModal
          ? showPaymentModal.total_amount
          : showPaymentModal.amount_paid;

      const formData = new FormData();
      if (claimId !== undefined) formData.append('bundle_id', String(claimId));
      if (ledgerId !== undefined) formData.append('ledger_id', String(ledgerId));
      formData.append('payment_method', 'Cash');
      formData.append('amount_paid', String(fullAmount));
      if (paymentRemarks.trim()) formData.append('remarks', paymentRemarks.trim());
      if (paymentRecipient.trim()) formData.append('recipient_name', paymentRecipient.trim());
      formData.append('receipt_image', receiptFile);

      const res = await fetch(`${API_URL}/finance/payments/process-payment/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
      setSuccessMessage(`Cash Settlement recorded successfully.`);
      setShowPaymentModal(null);
      setPaymentRemarks('');
      setPaymentRecipient('');
      await fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateExpense = async (payload: any) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      // 1. Separate JSON fields from File attachments
      const { files, media_rotations, ...expenseBody } = payload;

      const res = await fetch(`${API_URL}/finance/expense/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expenseBody)
      });
      const data = await res.json();
      if (!res.ok) {
        let msg = 'Failed to create expense entry';
        if (data && typeof data === 'object') {
          if (data.detail) {
            msg = data.detail;
          } else {
            const errEntries = Object.entries(data).map(([field, errs]) => {
              const formattedField = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              const errStr = Array.isArray(errs) ? errs.join(', ') : String(errs);
              return `${formattedField}: ${errStr}`;
            });
            if (errEntries.length > 0) msg = errEntries.join(' • ');
          }
        }
        throw new Error(msg);
      }

      // 2. Upload attached receipt files to /common/media/ linked to the new expense
      if (files && Array.isArray(files) && files.length > 0) {
        const createdExpenseId = data.expense_id;
        const uploadPromises = files.map(async (file: File) => {
          const mediaFormData = new FormData();
          if (expenseBody.ticket) mediaFormData.append('ticket', String(expenseBody.ticket));
          mediaFormData.append('file_url', file);
          mediaFormData.append('file_name', file.name);
          const workerId = expenseBody.worker || currentUser?.user_id || (currentUser as any)?.id;
          if (workerId) {
            mediaFormData.append('uploaded_by', String(workerId));
          }
          mediaFormData.append('expense', String(createdExpenseId));

          const rotObj = (media_rotations || []).find((r: any) => r.file_name === file.name);
          if (rotObj && rotObj.rotation) {
            mediaFormData.append('rotation', String(rotObj.rotation));
          }

          const mRes = await fetch(`${API_URL}/common/media/`, {
            method: 'POST',
            headers: { 'Authorization': `Token ${token}` },
            body: mediaFormData
          });
          if (!mRes.ok) {
            console.error('Failed to upload receipt file for expense:', file.name);
          }
        });

        await Promise.all(uploadPromises);
      }

      // Activate the skeleton row loader immediately with the created expense's metadata
      const newExpenseInfo = {
        expense_id: data.expense_id,
        category: (typeof data.expense_type_detail === 'object' ? data.expense_type_detail?.expense_name : '') || '',
        worker_name: (typeof data.worker_detail === 'object' ? (data.worker_detail?.full_name || data.worker_detail?.username) : '') || '',
        ticket_no: (typeof data.ticket_details === 'object' ? data.ticket_details?.work_order_no : '') || (data.ticket ? String(data.ticket) : ''),
        sub_department: (typeof data.ticket_details === 'object' ? data.ticket_details?.sub_department_name : '') || '',
        amount: data.amount ? Number(data.amount) : payload.amount,
        expense_date: data.expense_date || payload.expense_date,
        remarks: data.remarks || payload.remarks,
        has_receipts: Boolean(files && files.length > 0),
        receipts_count: (files || []).length
      };
      setSyncingExpenseInfo(newExpenseInfo);
      setIsSyncingNewExpense(true);

      // Optimistically append/insert to expenses list if not present
      if (data && data.expense_id) {
        setExpenses(prev => {
          if (prev.some(e => e.expense_id === data.expense_id)) return prev;
          return [data, ...prev];
        });
      }

      setSuccessMessage(`Expense ${data.expense_id} created successfully.`);
      fetchData(true, true);
    } catch (err: any) {
      setErrorMessage(err.message);
      throw err;
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        setIsSyncingNewExpense(false);
        setSyncingExpenseInfo(null);
      }, 800);
    }
  };

  const filteredExpenses = useMemo(() => {
    if (subpage === 'expenses') {
      return expenses;
    }
    return expenses.filter(e => {
      if (!filterDateType) {
        if (filterDateFrom && e.expense_date && e.expense_date < filterDateFrom) return false;
        if (filterDateTo && e.expense_date && e.expense_date > filterDateTo) return false;
      }

      if (statusFilter !== 'ALL') {
        const isPaid = Boolean(e.is_paid || e.status_display === 'Paid' || (e.claim && ((e.claim as any).status === 'Paid' || (e as any).claim_status === 'Paid')));
        const st = isPaid ? 'Paid' : (e.status_display || (e.approved ? 'Approved' : 'Pending Approval'));
        const filterLower = statusFilter.toLowerCase().trim();
        const stLower = st.toLowerCase().trim();
        const matchesStatus = (filterLower === 'pending approval' || filterLower === 'in review' || filterLower === 'pending')
          ? (stLower === 'pending approval' || stLower === 'in review' || stLower === 'pending')
          : stLower === filterLower;
        if (!matchesStatus) return false;
      }

      if (bundleFilter === 'IN_BUNDLE' && !e.is_claimed && !e.claim) return false;
      if (bundleFilter === 'NOT_IN_BUNDLE' && (e.is_claimed || e.claim)) return false;

      if (ledgerBatchFilter && ledgerBatchFilter !== 'ALL') {
        const batch = ledgerBatches.find(b => String(b.batch_id) === String(ledgerBatchFilter));
        if (batch) {
          const ids = new Set<number>();
          const names = new Set<string>();
          const addSd = (sd: any) => {
            if (!sd) return;
            if (typeof sd === 'object') {
              const id = sd.sub_department_id || sd.id;
              if (id != null && !isNaN(Number(id))) ids.add(Number(id));
              if (sd.sub_department_name) names.add(String(sd.sub_department_name).toLowerCase().trim());
            } else if (!isNaN(Number(sd))) {
              ids.add(Number(sd));
            }
          };
          if (Array.isArray(batch.sub_departments)) batch.sub_departments.forEach(addSd);
          if (Array.isArray(batch.sub_departments_detail)) batch.sub_departments_detail.forEach(addSd);

          const rawTicket: any = e.ticket_details || e.ticket;
          const subDeptId = Number(
            e.sub_department_id ||
            e.ticket_details?.sub_department_id ||
            (typeof rawTicket === 'object' ? rawTicket?.sub_department_id || rawTicket?.nature?.sub_department?.sub_department_id || rawTicket?.nature?.sub_department_id : null)
          );
          const subDeptName = String(
            e.ticket_details?.sub_department_name ||
            e.sub_department_name ||
            (typeof rawTicket === 'object' ? rawTicket?.sub_department_name || rawTicket?.nature?.sub_department?.sub_department_name : '') ||
            ''
          ).toLowerCase().trim();

          const matchId = !isNaN(subDeptId) && subDeptId > 0 && ids.has(subDeptId);
          const matchName = subDeptName && names.has(subDeptName);
          if (!matchId && !matchName) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const catName = (e.expense_type_detail?.expense_name || (e.expense_type as any)?.expense_name || '').toLowerCase();
        const workerObj = e.worker_detail || (typeof e.worker === 'object' ? e.worker : null);
        const workerName = (workerObj?.full_name || workerObj?.username || '').toLowerCase();
        const remarks = (e.remarks || '').toLowerCase();
        const amountStr = String(e.amount || '');
        const expIdStr = String(e.expense_id || '');

        const rawTicket: any = e.ticket_details || e.ticket;
        const ticketWo = typeof rawTicket === 'object' && rawTicket ? (rawTicket.work_order_no || '').toLowerCase() : '';
        const ticketTitle = typeof rawTicket === 'object' && rawTicket ? (rawTicket.title || '').toLowerCase() : '';
        const ticketIdStr = typeof rawTicket === 'object' && rawTicket ? String(rawTicket.ticket_id || rawTicket.id || '') : (rawTicket ? String(rawTicket) : '');
        const storeName = (e.responsible_store?.store_name || (typeof rawTicket === 'object' ? rawTicket?.store?.store_name || rawTicket?.store_name : '') || '').toLowerCase();
        const subDeptName = (
          e.ticket_details?.sub_department_name ||
          e.sub_department_name ||
          (typeof rawTicket === 'object' ? rawTicket?.sub_department_name : '') ||
          (typeof e.ticket === 'object' ? (e.ticket as any)?.nature?.sub_department?.sub_department_name : '') ||
          ''
        ).toLowerCase();

        return catName.includes(q) ||
          workerName.includes(q) ||
          remarks.includes(q) ||
          amountStr.includes(q) ||
          expIdStr.includes(q) ||
          ticketWo.includes(q) ||
          ticketTitle.includes(q) ||
          ticketIdStr.includes(q) ||
          storeName.includes(q) ||
          subDeptName.includes(q);
      }

      return true;
    });
  }, [expenses, filterDateFrom, filterDateTo, filterDateType, statusFilter, bundleFilter, ledgerBatchFilter, ledgerBatches, searchQuery]);

  // Subpage Navigation Tabs filtered by user permissions
  const navTabs = useMemo(() => [
    { key: 'expenses', label: 'Expenses', icon: Receipt, permission: 'finance.can_view_expenses' },
    { key: 'bundles', label: 'Bundles', icon: Layers, permission: 'finance.can_view_bundles' },
    { key: 'ledgers', label: 'Ledgers', icon: Building2, permission: 'finance.can_view_ledger' },
    { key: 'payments', label: 'Disbursements & Audit', icon: CreditCard, permission: 'finance.can_view_audit' }
  ].filter(tab => !tab.permission || hasPermission(tab.permission)), [hasPermission]);

  // If the user navigates directly to a subpage they lack permission for, redirect to first permitted tab
  useEffect(() => {
    if (navTabs.length > 0 && !navTabs.some(tab => tab.key === subpage)) {
      navigate(`/finance/${navTabs[0].key}`, { replace: true });
    }
  }, [subpage, navTabs, navigate]);

  const approvalsProps = {
    approvals,
    roleFilteredApprovals,
    displayedApprovals,
    loading,
    submitting,
    roleFilterOnly,
    setRoleFilterOnly,
    currentUser,
    approvalEntityTab,
    setApprovalEntityTab,
    approvalStatusTab,
    setApprovalStatusTab,
    expandedApprovalIds,
    toggleExpandApproval,
    renderStatusBadge,
    showApprovalModal,
    setShowApprovalModal,
    approvalAction,
    setApprovalAction,
    approvalComments,
    setApprovalComments,
    handleActionApproval,
    setSelectedTicketForModal,
    setPreviewMediaUrl
  };

  return (
    <div className=" min-h-screen flex flex-col gap-2 bg-surface dark:bg-dark-surface text-on-surface dark:text-dark-on-surface">

      {/* Global Floating Popup Toast (visible above all modals & full viewport) */}
      {(errorMessage || successMessage) && (
        <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:top-5 sm:right-5 z-[9999] sm:max-w-md sm:w-full animate-in slide-in-from-top-3 fade-in duration-200 pointer-events-auto">
          {errorMessage && (
            <div className="p-3.5 rounded bg-red-600 text-white text-xs flex items-start justify-between shadow-2xl border border-red-700 gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white" />
                <div className="min-w-0">
                  <strong className="block font-bold text-white mb-0.5">Error</strong>
                  <span className="text-white/95 break-words leading-relaxed">{errorMessage}</span>
                </div>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="p-1 hover:bg-white/20 rounded transition-colors text-white shrink-0 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded bg-emerald-600 text-white text-xs flex items-start justify-between shadow-2xl border border-emerald-700 gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-white" />
                <div className="min-w-0">
                  <strong className="block font-bold text-white mb-0.5">Success</strong>
                  <span className="text-white/95 break-words leading-relaxed">{successMessage}</span>
                </div>
              </div>
              <button
                onClick={() => setSuccessMessage(null)}
                className="p-1 hover:bg-white/20 rounded transition-colors text-white shrink-0 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded bg-error-container text-on-error-container text-xs flex items-center justify-between border border-error/20">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-error" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:opacity-75"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:opacity-75"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Navigation Subpage Tabs */}
      <div className="flex items-center gap-1  border-outline-variant overflow-x-auto pb-0.5">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = subpage === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => navigate(`/finance/${tab.key}`)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${isActive
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SEARCH AND DATEWISE FILTER TOOLBAR */}
      <div className="p-3.5 rounded border border-outline-variant bg-surface-container flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">        {/* Left Side: Search Input */}
        <div className="relative w-full sm:w-72 md:w-80 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder={
              subpage === 'expenses'
                ? "Search expenses by worker, ID, ticket, amount..."
                : subpage === 'bundles'
                  ? "Search bundles by worker, bundle #, amount..."
                  : subpage === 'ledgers'
                    ? "Search ledgers by name, batch, amount..."
                    : "Search by worker name, ID, ticket, amount..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 bg-surface-container-low border border-outline-variant hover:border-outline text-on-surface text-xs rounded pl-9 pr-8 focus:outline-none focus:border-primary transition-colors shadow-2xs placeholder:text-on-surface-variant/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-0.5 rounded cursor-pointer transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Side: Filters (Date Range, Status, Bundle/Ledger Filter) */}
        <div className="flex items-center gap-2.5 flex-wrap justify-start md:justify-end">
          {/* Popover Date Range Picker */}
          <DateRangePickerCard
            fromDate={filterDateFrom}
            toDate={filterDateTo}
            dateType={subpage === 'expenses' ? filterDateType : ''}
            allowEmptyDateType={subpage === 'expenses'}
            emptyDateTypeLabel="Select Option"
            hideDateType={subpage !== 'expenses'}
            onDateRangeChange={(from, to, type) => {
              setFilterDateRange(from, to, subpage === 'expenses' ? (type || '') : '');
            }}
            onReset={() => {
              const currentMonth = getCurrentMonthRange();
              setFilterDateRange(currentMonth.from, currentMonth.to, '');
            }}
          />

          {/* Status Dropdown Filter */}
          {subpage !== 'payments' && (
            <div className="w-full sm:w-48 shrink-0">
              <SearchableSelect
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                className="w-full h-9 bg-surface-container-low border border-outline-variant hover:border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary transition-colors shadow-2xs"
                options={statusOptions}
                placeholder="All Statuses"
              />
            </div>
          )}

          {/* Worker / Technician Filter (Applicable for Expenses subpage) */}
          {subpage === 'expenses' && (
            <div className="w-full sm:w-52 shrink-0">
              <SearchableSelect
                value={expenseWorkerFilter}
                onChange={(val) => {
                  setExpenseWorkerFilter(val);
                  setExpensePage(1);
                }}
                className="w-full h-9 bg-surface-container-low border border-outline-variant hover:border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary transition-colors shadow-2xs"
                options={expenseWorkerOptions}
                placeholder="All Workers"
              />
            </div>
          )}

          {/* Bundle Attachment Filter (Applicable for Expenses subpage) */}
          {subpage === 'expenses' && (
            <div className="w-full sm:w-52 shrink-0">
              <SearchableSelect
                value={bundleFilter}
                onChange={(val) => setBundleFilter(val as any)}
                className="w-full h-9 bg-surface-container-low border border-outline-variant hover:border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary transition-colors shadow-2xs"
                options={[
                  { value: 'ALL', label: 'All Expenses' },
                  { value: 'IN_BUNDLE', label: 'Attached to Bundle' },
                  { value: 'NOT_IN_BUNDLE', label: 'Not in Bundle (Unclaimed)' },
                ]}
                placeholder="Bundle Filter"
              />
            </div>
          )}

          {/* Ledger Batch Filter (Applicable for Expenses subpage) */}
          {subpage === 'expenses' && (
            <div className="w-full sm:w-52 shrink-0">
              <SearchableSelect
                value={ledgerBatchFilter}
                onChange={(val) => setLedgerBatchFilter(val)}
                className="w-full h-9 bg-surface-container-low border border-outline-variant hover:border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary transition-colors shadow-2xs"
                options={[
                  { value: 'ALL', label: 'All Ledger Batches' },
                  ...ledgerBatches.map((b: any) => ({
                    value: String(b.batch_id),
                    label: b.batch_name
                  }))
                ]}
                placeholder="All Ledger Batches"
              />
            </div>
          )}

          {/* Ledger Attachment Filter (Applicable for Bundles subpage) */}
          {subpage === 'bundles' && (
            <div className="w-full sm:w-40 shrink-0">
              <SearchableSelect
                value={ledgerFilter}
                onChange={(val) => setLedgerFilter(val as any)}
                className="w-full h-9 bg-surface-container-low border border-outline-variant hover:border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary transition-colors shadow-2xs"
                options={[
                  { value: 'ALL', label: 'All Bundles' },
                  { value: 'IN_LEDGER', label: 'Attached to Ledger' },
                  { value: 'NOT_IN_LEDGER', label: 'Not in Ledger' },
                ]}
                placeholder="Ledger Filter"
              />
            </div>
          )}
        </div>

        {/* Clear Filters Button */}
        {/* {(searchQuery || statusFilter !== 'ALL' || ledgerFilter !== 'ALL' || bundleFilter !== 'ALL' || filterDateFrom !== getCurrentMonthRange().from || filterDateTo !== getCurrentMonthRange().to) && (
          <button
            onClick={() => {
              const currentMonth = getCurrentMonthRange();
              setSearchQuery('');
              setFilterDateFrom(currentMonth.from);
              setFilterDateTo(currentMonth.to);
              setStatusFilter('ALL');
              setLedgerFilter('ALL');
              setBundleFilter('ALL');
            }}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-outline text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Filters</span>
          </button>
        )} */}
      </div>

      {/* SUBPAGES */}
      {subpage === 'expenses' && hasPermission('finance.can_view_expenses') && (
        <ExpensesSubpage
          expenses={expenses}
          filteredExpenses={filteredExpenses}
          ledgerBatches={ledgerBatches}
          loading={loading}
          submitting={submitting}
          renderStatusBadge={renderStatusBadge}
          showCreateExpenseModal={showCreateExpenseModal}
          setShowCreateExpenseModal={setShowCreateExpenseModal}
          handleCreateExpense={handleCreateExpense}
          setSelectedTicketForModal={setSelectedTicketForModal}
          setPreviewMediaUrl={setPreviewMediaUrl}
          token={token || ''}
          currentUser={currentUser}
          API_URL={API_URL}
          approvalsProps={approvalsProps}
          onRefresh={() => fetchData(true, true)}
          currentPage={expensePage}
          totalItems={expenseTotalCount}
          itemsPerPage={expensePageSize}
          onPageChange={(page) => setExpensePage(page)}
          onItemsPerPageChange={(size) => {
            setExpensePageSize(size);
            setExpensePage(1);
          }}
          serverTotalAmount={expenseTotalAmount}
          serverApprovedCount={expenseApprovedCount}
          serverPendingCount={expensePendingCount}
          serverUnclaimedCount={expenseUnclaimedCount}
          isSyncingNewExpense={isSyncingNewExpense}
          syncingExpenseInfo={syncingExpenseInfo}
          sortField={expenseSortField}
          sortDirection={expenseSortDirection}
          onSortChange={(field, direction) => {
            setExpenseSortField(field);
            setExpenseSortDirection(direction);
          }}
        />
      )}

      {subpage === 'bundles' && hasPermission('finance.can_view_bundles') && (
        <BundlesSubpage
          filteredBundles={filteredBundles}
          bundles={bundles}
          ledgers={ledgers}
          unclaimedExpenses={unclaimedExpenses}
          loading={loading}
          submitting={submitting}
          renderStatusBadge={renderStatusBadge}
          showCreateBundleModal={showCreateBundleModal}
          setShowCreateBundleModal={setShowCreateBundleModal}
          expenseSearchWorker={expenseSearchWorker}
          setExpenseSearchWorker={setExpenseSearchWorker}
          expenseSearchText={expenseSearchText}
          setExpenseSearchText={setExpenseSearchText}
          expenseFilterFrom={expenseFilterFrom}
          setExpenseFilterFrom={setExpenseFilterFrom}
          expenseFilterTo={expenseFilterTo}
          setExpenseFilterTo={setExpenseFilterTo}
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
          uniqueExpenseWorkers={uniqueExpenseWorkers}
          filteredUnclaimedExpenses={filteredUnclaimedExpenses}
          selectedExpenseIds={selectedExpenseIds}
          setSelectedExpenseIds={setSelectedExpenseIds}
          selectedExpensesTotal={selectedExpensesTotal}
          bundlePeriodFrom={bundlePeriodFrom}
          setBundlePeriodFrom={setBundlePeriodFrom}
          bundlePeriodTo={bundlePeriodTo}
          setBundlePeriodTo={setBundlePeriodTo}
          bundleRemarks={bundleRemarks}
          setBundleRemarks={setBundleRemarks}
          handleCreateBundle={handleCreateBundle}
          handleSubmitBundle={handleSubmitBundle}
          selectedBundleForView={selectedBundleForView}
          setSelectedBundleForView={setSelectedBundleForView}
          openEditBundleModal={openEditBundleModal}
          handleRemoveExpenseFromBundle={handleRemoveExpenseFromBundle}
          handleDeleteBundle={handleDeleteBundle}
          previewMediaUrl={previewMediaUrl}
          setPreviewMediaUrl={setPreviewMediaUrl}
          setShowPaymentModal={setShowPaymentModal}
          approvalsProps={approvalsProps}
          token={token || ''}
          currentUser={currentUser}
          API_URL={API_URL}
          errorMessage={errorMessage}
          setErrorMessage={setErrorMessage}
          setSelectedTicketForModal={setSelectedTicketForModal}
          onRefresh={() => fetchData(true, true)}
          isSyncingNewBundle={isSyncingNewBundle}
          syncingBundleInfo={syncingBundleInfo}
          updatingBundleId={updatingBundleId}
          deletingBundleId={deletingBundleId}
          selectedWorkerId={selectedWorkerId}
          setSelectedWorkerId={setSelectedWorkerId}
          currentPage={bundlePage}
          totalItems={bundleTotalCount}
          itemsPerPage={bundlePageSize}
          onPageChange={(page) => setBundlePage(page)}
          onItemsPerPageChange={(size) => {
            setBundlePageSize(size);
            setBundlePage(1);
          }}
          serverBundleStats={bundleStats}
        />
      )}

      {subpage === 'ledgers' && hasPermission('finance.can_view_ledger') && (
        <LedgersSubpage
          filteredLedgers={filteredLedgers}
          ledgers={ledgers}
          bundles={bundles}
          ledgerGroups={ledgerGroups}
          ledgerBatches={ledgerBatches}
          currentUser={currentUser}
          loading={loading}
          submitting={submitting}
          renderStatusBadge={renderStatusBadge}
          currentPage={ledgerPage}
          totalItems={ledgerTotalCount}
          itemsPerPage={ledgerPageSize}
          onPageChange={(page) => setLedgerPage(page)}
          onItemsPerPageChange={(size) => {
            setLedgerPageSize(size);
            setLedgerPage(1);
          }}
          showCreateLedgerModal={showCreateLedgerModal}
          setShowCreateLedgerModal={setShowCreateLedgerModal}
          selectedBundleIds={selectedBundleIds}
          setSelectedBundleIds={setSelectedBundleIds}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
          newGroupName={newGroupName}
          setNewGroupName={setNewGroupName}
          handleCreateLedger={handleCreateLedger}
          handleSubmitLedger={handleSubmitLedger}
          handleDeleteLedger={handleDeleteLedger}
          expandedLedgerIds={expandedLedgerIds}
          toggleExpandLedger={toggleExpandLedger}
          openEditBundleModal={openEditBundleModal}
          showAddExpenseModal={showAddExpenseModal}
          setShowAddExpenseModal={setShowAddExpenseModal}
          openAddExpenseModal={openAddExpenseModal}
          loadingAvailableExpenses={loadingAvailableExpenses}
          availableApprovedExpenses={availableApprovedExpenses}
          selectedAddExpenseId={selectedAddExpenseId}
          setSelectedAddExpenseId={setSelectedAddExpenseId}
          handleAddExpenseToLedger={handleAddExpenseToLedger}
          handleRemoveExpenseFromLedger={handleRemoveExpenseFromLedger}
          handleAddBundleToLedger={handleAddBundleToLedger}
          handleAddBundleToGroup={handleAddBundleToGroup}
          handleRemoveBundleFromLedger={handleRemoveBundleFromLedger}
          handleRemoveBundleFromGroup={handleRemoveBundleFromGroup}
          handleDeleteLedgerGroup={handleDeleteLedgerGroup}
          token={token || ''}
          API_URL={API_URL}
          setShowPaymentModal={setShowPaymentModal}
          approvalsProps={approvalsProps}
          setSelectedTicketForModal={setSelectedTicketForModal}
          onRefresh={() => fetchData(true, true)}
          isSyncingNewLedger={isSyncingNewLedger}
          syncingLedgerInfo={syncingLedgerInfo}
          errorMessage={errorMessage}
          setErrorMessage={setErrorMessage}
          onLedgerUpdated={(updatedLedger) => {
            setLedgers(prev => prev.map(l => l.ledger_id === updatedLedger.ledger_id ? updatedLedger : l));
            if (updatedLedger.ledger_group_detail) {
              setLedgerGroups(prev => prev.map(g => g.ledger_group_id === updatedLedger.ledger_group_detail?.ledger_group_id ? { ...g, ...updatedLedger.ledger_group_detail } : g));
            }
          }}
          onLedgersUpdated={(updatedList) => {
            const updateMap = new Map(updatedList.map(l => [l.ledger_id, l]));
            setLedgers(prev => prev.map(l => updateMap.get(l.ledger_id) || l));
            updatedList.forEach(l => {
              if (l.ledger_group_detail) {
                setLedgerGroups(prev => prev.map(g => g.ledger_group_id === l.ledger_group_detail?.ledger_group_id ? { ...g, ...l.ledger_group_detail } : g));
              }
            });
            // Instantly sync Approvals state in memory so status badges update with zero delay
            setApprovals(prev => prev.map(a => {
              const matchedLedger = updatedList.find(l => {
                const aLedgerId = a.ledger ?? a.ledger_id ?? (a.target_summary?.type === 'Ledger' ? a.target_summary?.id : undefined);
                return aLedgerId === l.ledger_id;
              });
              if (matchedLedger) {
                if (matchedLedger.status === 'Approved' || matchedLedger.status === 'Paid') {
                  return { ...a, status: 'Approved' };
                } else if (matchedLedger.status === 'Rework') {
                  return { ...a, status: 'Rework' };
                } else if (matchedLedger.status === 'Rejected') {
                  return { ...a, status: 'Rejected' };
                }
              }
              return a;
            }));
          }}
        />
      )}

      {subpage === 'payments' && hasPermission('finance.can_view_audit') && (
        <PaymentsSubpage
          filteredPayments={filteredPayments}
          payments={payments}
          auditEvents={auditEvents}
          showPaymentModal={showPaymentModal}
          setShowPaymentModal={setShowPaymentModal}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          paymentRef={paymentRef}
          setPaymentRef={setPaymentRef}
          paymentRemarks={paymentRemarks}
          setPaymentRemarks={setPaymentRemarks}
          handleProcessPayment={handleProcessPayment}
          submitting={submitting}
          setPreviewMediaUrl={setPreviewMediaUrl}
        />
      )}

      {/* POPUP MODAL: EDIT BUNDLE & MANAGE TIED EXPENSES */}
      <EditBundleModal
        selectedBundleForEdit={selectedBundleForEdit}
        setSelectedBundleForEdit={setSelectedBundleForEdit}
        editBundleForm={editBundleForm}
        setEditBundleForm={setEditBundleForm}
        unclaimedExpenses={unclaimedExpenses}
        submitting={submitting}
        handleSaveUpdateBundle={handleSaveUpdateBundle}
        errorMessage={errorMessage}
        setErrorMessage={setErrorMessage}
      />

      {/* POPUP MODAL: CASH SETTLEMENT & DISBURSEMENT PAYMENT */}
      <PaymentModal
        showPaymentModal={showPaymentModal}
        setShowPaymentModal={setShowPaymentModal}
        paymentRemarks={paymentRemarks}
        setPaymentRemarks={setPaymentRemarks}
        paymentRecipient={paymentRecipient}
        setPaymentRecipient={setPaymentRecipient}
        handleProcessPayment={handleProcessPayment}
        handleUploadSettledReceipt={handleUploadSettledReceipt}
        handleDeleteSettledReceipt={handleDeleteSettledReceipt}
        submitting={submitting}
        errorMessage={errorMessage}
      />

      {/* POPUP MODAL: TICKET DETAIL MODAL */}
      {selectedTicketForModal && (
        <TicketDetailModal
          selectedTicket={selectedTicketForModal}
          token={token}
          user={currentUser}
          statuses={[]}
          workers={[]}
          subDepartments={[]}
          expenseTypes={[]}
          readOnly={false}
          onClose={() => {
            setSelectedTicketForModal(null);
            fetchData(true, true);
          }}
          onRefreshList={() => fetchData(true, true)}
        />
      )}

      {/* POPUP MODAL: RECEIPT LIGHTBOX */}
      <ZoomableLightbox
        media={previewMediaUrl}
        onClose={() => setPreviewMediaUrl(null)}
      />
    </div>
  );
};

export default FinanceView;
