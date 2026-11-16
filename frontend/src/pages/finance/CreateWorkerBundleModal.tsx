import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  AlertCircle,
  CheckCircle2,
  Search,
  Check,
  Plus,
  Minus,
  Loader2,
  ArrowLeft,
  Paperclip,
  Pencil,
  Sparkles,
  Receipt,
  Maximize2,
  FileText
} from 'lucide-react';
import type { ExpenseItem, MediaFileItem } from './types';
import { formatDateDMY } from './types';
import { AvatarCircle, getMediaUrl } from '../ticket/TicketsTypesAndComponents';
import { confirmPopup } from '@/components/tailgrids/core/ConfirmationPopup';
import { ExpensePreviewModal } from './ExpensePreviewModal';

interface CreateWorkerBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: any;
  workerExpenses: ExpenseItem[];
  isLoadingExpenses?: boolean;
  selectedExpenseIds: number[];
  setSelectedExpenseIds: (ids: number[]) => void;
  bundleRemarks: string;
  setBundleRemarks: (r: string) => void;
  handleCreateBundle: () => void;
  submitting: boolean;
  isSyncingNewBundle?: boolean;
  errorMessage?: string | null;
  setErrorMessage?: (msg: string | null) => void;
  fromDate?: string;
  toDate?: string;
  token?: string;
  currentUser?: any;
  API_URL?: string;
  setWorkerExpenses?: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  setPreviewMediaUrl?: (media: { url: string; title: string } | null) => void;
  setSelectedTicketForModal?: (ticket: any) => void;
  onRefreshParent?: () => Promise<void> | void;
}

type TabType = 'unapproved' | 'available' | 'selected';

export const CreateWorkerBundleModal: React.FC<CreateWorkerBundleModalProps> = ({
  isOpen,
  onClose,
  worker,
  workerExpenses,
  isLoadingExpenses = false,
  selectedExpenseIds,
  setSelectedExpenseIds,
  bundleRemarks,
  setBundleRemarks,
  handleCreateBundle,
  submitting,
  isSyncingNewBundle = false,
  errorMessage,
  setErrorMessage,
  fromDate,
  toDate,
  token,
  API_URL = '',
  setWorkerExpenses,
  setPreviewMediaUrl,
  setSelectedTicketForModal,
  onRefreshParent
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilterTab, setActiveFilterTab] = useState<TabType>('available');
  const [approvingExpenseId, setApprovingExpenseId] = useState<number | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Expense Preview Modal State
  const [previewExpense, setPreviewExpense] = useState<ExpenseItem | null>(null);

  // Edit Expense State
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editExpenseTypeId, setEditExpenseTypeId] = useState<string>('');
  const [isUpdatingExpense, setIsUpdatingExpense] = useState<boolean>(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Dropdown options for edit
  const [expenseTypes, setExpenseTypes] = useState<any[]>([]);

  // Dynamic Remarks Mode (Auto-generated from activity unless user custom edits)
  const [isRemarksAuto, setIsRemarksAuto] = useState<boolean>(true);

  const isExpenseEligible = (exp: ExpenseItem | any): boolean => {
    if (!exp) return false;
    if (exp.is_claimed || exp.claim) return false;
    if (exp.expense_type && (exp.expense_type as any).approve_required === false) return true;
    if (exp.expense_type_detail && (exp.expense_type_detail as any).approve_required === false) return true;
    if (exp.approved === true || (exp.approved as any) === 'true' || (exp.approved as any) === 1) return true;
    if (exp.status_display === 'Approved' || exp.status_display === 'APPROVED') return true;
    return false;
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setFeedbackMsg(null);
      setEditingExpense(null);
      setIsRemarksAuto(true);
      // Auto-select tab based on available data
      const hasAvailable = workerExpenses.some(e => !selectedExpenseIds.includes(e.expense_id) && isExpenseEligible(e));
      const hasUnapproved = workerExpenses.some(e => !selectedExpenseIds.includes(e.expense_id) && !isExpenseEligible(e));
      if (!hasAvailable && hasUnapproved) {
        setActiveFilterTab('unapproved');
      } else {
        setActiveFilterTab('available');
      }

      // Fetch expense types for edit dropdown if not fetched
      if (token && expenseTypes.length === 0) {
        fetch(`${API_URL}/finance/expensetype/?page_size=all`, {
          headers: { 'Authorization': `Token ${token}` }
        })
          .then(res => res.ok ? res.json() : [])
          .then(data => {
            const list = Array.isArray(data) ? data : (data.results || []);
            setExpenseTypes(list);
          })
          .catch(err => console.error('Failed to load expense types:', err));
      }
    }
  }, [isOpen, worker]);

  const getCleanRemarks = (raw?: string) => {
    if (!raw) return '';
    const lines = raw.split('\n');
    const cleanLines = lines.filter(line => !line.trim().match(/^\[.+?\]:/));
    return cleanLines.join('\n').trim();
  };

  // 1. UNAPPROVED: Unclaimed, unadded expenses that need approval
  const unapprovedExpenses = useMemo(() => {
    return workerExpenses.filter(e => !selectedExpenseIds.includes(e.expense_id) && !isExpenseEligible(e));
  }, [workerExpenses, selectedExpenseIds]);

  // 2. AVAILABLE: Unclaimed, unadded expenses that are approved and ready to add
  const availableExpenses = useMemo(() => {
    return workerExpenses.filter(e => !selectedExpenseIds.includes(e.expense_id) && isExpenseEligible(e));
  }, [workerExpenses, selectedExpenseIds]);

  // 3. SELECTED: Expenses currently added to this bundle
  const selectedExpenses = useMemo(() => {
    return workerExpenses.filter(e => selectedExpenseIds.includes(e.expense_id));
  }, [workerExpenses, selectedExpenseIds]);

  // Dynamic Remarks Generator based on activity
  const generateDynamicRemarks = (expenses: ExpenseItem[]): string => {
    if (!expenses || expenses.length === 0) return '';

    // Collect distinct activity categories
    const categories: string[] = [];
    expenses.forEach(exp => {
      const name = exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name;
      if (name && !categories.includes(name.trim())) {
        categories.push(name.trim());
      }
    });

    // Check if single expense
    if (expenses.length === 1) {
      const exp = expenses[0];
      const cat = exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || '';
      const cleanRem = getCleanRemarks(exp.remarks);
      const ticketObj = (exp as any).ticket_details || (exp as any).ticket;
      const wo = typeof ticketObj === 'object' && ticketObj ? ticketObj.work_order_no : '';

      const parts: string[] = [];
      if (wo) parts.push(`WO#${wo}`);
      if (cat) parts.push(cat);
      if (cleanRem && cleanRem.toLowerCase() !== cat.toLowerCase()) parts.push(cleanRem);

      return parts.length > 0 ? parts.join(' - ') : (cat || 'Expense claim');
    }

    // Multiple expenses: check for common work order
    const workOrders: string[] = [];
    expenses.forEach(exp => {
      const ticketObj = (exp as any).ticket_details || (exp as any).ticket;
      const wo = typeof ticketObj === 'object' && ticketObj ? ticketObj.work_order_no : '';
      if (wo && !workOrders.includes(wo)) {
        workOrders.push(wo);
      }
    });

    let activityStr = '';
    if (categories.length === 1) {
      activityStr = `${categories[0]} (${expenses.length} items)`;
    } else if (categories.length === 2) {
      activityStr = `${categories[0]} & ${categories[1]} (${expenses.length} items)`;
    } else if (categories.length > 2) {
      activityStr = `${categories[0]}, ${categories[1]} +${categories.length - 2} more (${expenses.length} items)`;
    } else {
      activityStr = `Expenses (${expenses.length} items)`;
    }

    if (workOrders.length === 1) {
      return `WO#${workOrders[0]} - ${activityStr}`;
    }

    return activityStr;
  };

  // Sync bundle remarks dynamically based on activity
  useEffect(() => {
    if (!isOpen) return;
    if (isRemarksAuto) {
      const dyn = generateDynamicRemarks(selectedExpenses);
      if (dyn) {
        setBundleRemarks(dyn);
      } else if (selectedExpenses.length === 0) {
        setBundleRemarks('');
      }
    }
  }, [selectedExpenses, isRemarksAuto, isOpen]);

  // Search filter
  const matchesSearch = (exp: ExpenseItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const expIdStr = String(exp.expense_id || '');
    const categoryName = (exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || '').toLowerCase();
    const remarks = (exp.remarks || '').toLowerCase();
    const ticketObj = (exp as any).ticket_details || (exp as any).ticket;
    const workOrderNo = (typeof ticketObj === 'object' && ticketObj ? (ticketObj.work_order_no || '') : String(ticketObj || '')).toLowerCase();
    const amountStr = String(exp.amount || '');
    const dateStr = (exp.expense_date || '').toLowerCase();
    const formattedDateStr = formatDateDMY(exp.expense_date).toLowerCase();
    return (
      expIdStr.includes(q) ||
      `#${expIdStr}`.includes(q) ||
      categoryName.includes(q) ||
      remarks.includes(q) ||
      workOrderNo.includes(q) ||
      amountStr.includes(q) ||
      dateStr.includes(q) ||
      formattedDateStr.includes(q)
    );
  };

  const filteredUnapproved = useMemo(() => unapprovedExpenses.filter(matchesSearch), [unapprovedExpenses, searchQuery]);
  const filteredAvailable = useMemo(() => availableExpenses.filter(matchesSearch), [availableExpenses, searchQuery]);
  const filteredSelected = useMemo(() => selectedExpenses.filter(matchesSearch), [selectedExpenses, searchQuery]);

  // Totals
  const unapprovedTotal = unapprovedExpenses.reduce((acc, curr) => acc + parseFloat(curr.amount || '0'), 0);
  const availableTotal = availableExpenses.reduce((acc, curr) => acc + parseFloat(curr.amount || '0'), 0);
  const selectedTotal = selectedExpenses.reduce((acc, curr) => acc + parseFloat(curr.amount || '0'), 0);
  const totalApprovedAmount = availableTotal + selectedTotal;

  // Toggle selection
  const handleToggleExpense = (exp: ExpenseItem) => {
    const isSelected = selectedExpenseIds.includes(exp.expense_id);
    if (!isSelected && !isExpenseEligible(exp)) return;

    if (isSelected) {
      setSelectedExpenseIds(selectedExpenseIds.filter(id => id !== exp.expense_id));
    } else {
      setSelectedExpenseIds([...selectedExpenseIds, exp.expense_id]);
    }
  };

  const handleAddAllAvailable = async () => {

    const confirmed = await confirmPopup({
      preset: "approve",
      title: "All All Expenses To Bundle",
      description: `Are you sure you want to add all available expenses.`,
      button1: "Cancel",
      button2: "Add All",
      variant: "warning",
    });

    if (!confirmed) return;

    const idsToAdd = filteredAvailable.map(e => e.expense_id);
    if (idsToAdd.length === 0) return;
    setSelectedExpenseIds(Array.from(new Set([...selectedExpenseIds, ...idsToAdd])));
  };

  const handleRemoveAllSelected = () => {
    const idsToRemove = filteredSelected.map(exp => exp.expense_id);
    if (idsToRemove.length === 0) return;
    setSelectedExpenseIds(selectedExpenseIds.filter(id => !idsToRemove.includes(id)));
  };

  // Inline Approve
  const handleApproveExpense = async (exp: ExpenseItem) => {
    if (!exp || approvingExpenseId === exp.expense_id) return;
    setApprovingExpenseId(exp.expense_id);
    setFeedbackMsg(null);
    if (setErrorMessage) setErrorMessage(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Token ${token}`;
      const baseApi = API_URL || '';

      const pendingInstance = (exp as any).approval_instances?.find((i: any) => i.status === 'Pending') ||
        (exp as any).active_pending_instance;

      let res: Response;
      if (pendingInstance && pendingInstance.instance_id) {
        res = await fetch(`${baseApi}/finance/approvals/${pendingInstance.instance_id}/action/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'APPROVED', comments: 'Approved from Create Bundle' })
        });
        if (!res.ok) {
          res = await fetch(`${baseApi}/finance/expense/${exp.expense_id}/action/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'APPROVED', comments: 'Approved from Create Bundle' })
          });
        }
      } else {
        res = await fetch(`${baseApi}/finance/expense/${exp.expense_id}/action/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'APPROVED', comments: 'Approved from Create Bundle' })
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Failed to approve expense');
      }

      const resData = await res.json().catch(() => ({}));
      const updatedExpData = resData.expense || resData;

      const updatedExpense: ExpenseItem = {
        ...exp,
        ...updatedExpData,
        approved: true,
        status_display: 'Approved'
      };

      if (setWorkerExpenses) {
        setWorkerExpenses(prev => prev.map(e => e.expense_id === exp.expense_id ? updatedExpense : e));
      }

      setFeedbackMsg({
        type: 'success',
        text: `Expense #${exp.expense_id} approved and moved to Available.`
      });

      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to approve expense';
      setFeedbackMsg({ type: 'error', text: msg });
      if (setErrorMessage) setErrorMessage(msg);
    } finally {
      setApprovingExpenseId(null);
    }
  };

  // Bulk Approve
  const handleBulkApproveUnapproved = async () => {
    const unapprovedIds = filteredUnapproved.map(exp => exp.expense_id);
    if (unapprovedIds.length === 0) return;


    const confirmed = await confirmPopup({
      preset: "approve",
      title: "Bulk Approve Expenses",
      description: `Are you sure you want to approve all ${unapprovedIds.length} selected expense(s)? They will be moved to Available.`,
      button1: "Cancel",
      button2: "Approve All",
      variant: "warning",
    });

    if (!confirmed) return;


    setIsBulkApproving(true);
    setFeedbackMsg(null);
    if (setErrorMessage) setErrorMessage(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Token ${token}`;
      const baseApi = API_URL || '';

      const res = await fetch(`${baseApi}/finance/expense/bulk-approve/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          expense_ids: unapprovedIds,
          comments: 'Bulk approved from Create Bundle modal'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Bulk approve failed');
      }

      const approvedSet = new Set(unapprovedIds);
      if (setWorkerExpenses) {
        setWorkerExpenses(prev => prev.map(e => approvedSet.has(e.expense_id) ? { ...e, approved: true, status_display: 'Approved' } : e));
      }

      setFeedbackMsg({
        type: 'success',
        text: `Approved all ${unapprovedIds.length} expense(s). They are now in Available.`
      });

      // Switch to available tab
      setActiveFilterTab('available');

      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch (err: any) {
      const msg = err.message || 'Bulk approve failed';
      setFeedbackMsg({ type: 'error', text: msg });
      if (setErrorMessage) setErrorMessage(msg);
    } finally {
      setIsBulkApproving(false);
    }
  };

  // Edit Expense Handlers
  const handleOpenEdit = (exp: ExpenseItem) => {
    setEditingExpense(exp);
    setEditAmount(String(exp.amount || ''));
    setEditRemarks(exp.remarks || '');
    setEditDate(exp.expense_date || '');
    const typeId = (exp as any).expense_type_id ||
      (exp as any).expense_type_detail?.expense_type_id ||
      (exp as any).expense_type?.expense_type_id ||
      (exp as any).expense_type?.expense_id ||
      (exp as any).expense_type?.id ||
      (typeof exp.expense_type === 'number' ? exp.expense_type : '');
    setEditExpenseTypeId(String(typeId || ''));
    setEditFormError(null);
  };

  const handleCloseEdit = () => {
    setEditingExpense(null);
    setEditFormError(null);
    setIsUpdatingExpense(false);
  };

  const handleSaveEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    setEditFormError(null);

    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditFormError('Please enter a valid amount greater than 0.');
      return;
    }

    if (!editDate) {
      setEditFormError('Expense date is required.');
      return;
    }

    setIsUpdatingExpense(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Token ${token}`;
      const baseApi = API_URL || '';

      const payload: any = {
        amount: parsedAmount,
        expense_date: editDate,
        remarks: editRemarks.trim() || undefined
      };

      if (editExpenseTypeId) {
        payload.expense_type = parseInt(editExpenseTypeId, 10);
      }

      const res = await fetch(`${baseApi}/finance/expense/${editingExpense.expense_id}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        let errMsg = 'Failed to update expense';
        if (data.detail) {
          errMsg = data.detail;
        } else if (typeof data === 'object') {
          const entries = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
          if (entries.length) errMsg = entries.join(' • ');
        }
        throw new Error(errMsg);
      }

      // Selected category object
      const selectedTypeObj = expenseTypes.find(et => String(et.expense_type_id || et.id) === String(editExpenseTypeId));

      const updatedExpense: ExpenseItem = {
        ...editingExpense,
        ...data,
        amount: String(parsedAmount),
        remarks: editRemarks.trim(),
        expense_date: editDate,
        expense_type_detail: selectedTypeObj || editingExpense.expense_type_detail
      };

      if (setWorkerExpenses) {
        setWorkerExpenses(prev => prev.map(e => e.expense_id === editingExpense.expense_id ? updatedExpense : e));
      }

      setFeedbackMsg({
        type: 'success',
        text: `Expense #${editingExpense.expense_id} updated successfully.`
      });

      handleCloseEdit();

      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch (err: any) {
      setEditFormError(err.message || 'Failed to update expense');
    } finally {
      setIsUpdatingExpense(false);
    }
  };

  // Render individual expense card
  const renderExpenseCard = (exp: ExpenseItem, type: 'unapproved' | 'available' | 'selected') => {
    const isSelected = selectedExpenseIds.includes(exp.expense_id);
    const cleanRemarks = getCleanRemarks(exp.remarks);

    const firstReceipt = exp.receipts && exp.receipts.length > 0
      ? exp.receipts[0]
      : (exp.receipt ? { file: exp.receipt } : null);

    return (
      <div
        key={exp.expense_id}
        onClick={() => setPreviewExpense(exp)}
        className={`px-3 py-2.5 rounded border text-xs flex items-center justify-between gap-3 transition-colors cursor-pointer ${type === 'selected'
          ? 'bg-primary/5 border-primary/30 hover:border-primary/50'
          : type === 'unapproved'
            ? 'bg-surface-container-low border-amber-500/20 hover:border-amber-500/40'
            : 'bg-surface-container-low border-outline-variant/60 hover:bg-surface-container/60 hover:border-primary/40'
          }`}
      >
        {/* Left Info: Category, ID, Receipt, Date, WO, Remarks */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-on-surface truncate">
              {exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || `Expense #${exp.expense_id}`}
            </span>
            <span className="text-[10px] text-on-surface-variant font-mono">
              #{exp.expense_id}
            </span>

            {firstReceipt && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewExpense(exp);
                }}
                className="px-2 py-0.5 rounded border border-outline text-[11px] text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors inline-flex items-center gap-1 cursor-pointer"
                title="Preview Expense Receipt & Details"
              >
                <Paperclip className="w-2.5 h-2.5" />
                <span>Receipt</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-on-surface-variant truncate mt-0.5">
            <span>{formatDateDMY(exp.expense_date)}</span>
            {exp.ticket_details?.work_order_no && (
              <span>• WO: <strong className="text-on-surface">{exp.ticket_details.work_order_no}</strong></span>
            )}
            {cleanRemarks && (
              <span className="truncate" title={cleanRemarks}>• {cleanRemarks}</span>
            )}
          </div>
        </div>

        {/* Middle: Amount & Status */}
        <div className="text-right shrink-0">
          <div className="text-xs font-bold text-on-surface">
            {parseFloat(exp.amount).toFixed(3)} KD
          </div>
          <div className="text-[10px]">
            {type === 'unapproved' ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">Needs Approval</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Approved</span>
            )}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="shrink-0 pl-1 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {type === 'unapproved' ? (
            <>
              {/* Edit button in Unapproved */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(exp);
                }}
                className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/60"
                title="Edit expense details"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Approve button */}
              <button
                type="button"
                disabled={approvingExpenseId === exp.expense_id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleApproveExpense(exp);
                }}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                title="Approve this expense"
              >
                {approvingExpenseId === exp.expense_id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Approve</span>
                  </>
                )}
              </button>
            </>
          ) : type === 'available' ? (
            <>
              {/* Edit button in Available */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(exp);
                }}
                className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/60"
                title="Edit expense details"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Add button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleExpense(exp);
                }}
                className="px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-on-primary text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                title="Add to bundle"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </>
          ) : (
            /* Remove button in Selected */
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpense(exp);
              }}
              className="px-3 py-1.5 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Remove from bundle"
            >
              <Minus className="w-3 h-3" />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  const workerName = worker?.name || worker?.full_name || worker?.username || 'Technician';

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-surface-container rounded border border-outline-variant/80 max-w-3xl w-full h-[86vh] max-h-[90vh] flex flex-col shadow-2xl text-on-surface relative overflow-hidden">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/70 px-4 py-3 shrink-0 bg-surface-container-high/40">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-outline-variant/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer mr-0.5"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <AvatarCircle
              user={worker}
              name={workerName}
              image={worker?.profile_image}
              size="sm"
            />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-on-surface tracking-tight truncate">
                Create Claim Bundle
              </h3>
              <div className="text-xs text-on-surface-variant truncate">
                <span>{workerName}</span>
                <span className="mx-1.5">•</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Approved Total: {totalApprovedAmount.toFixed(3)} KD
                </span>
                {(fromDate || toDate) && (
                  <>
                    <span className="mx-1.5">•</span>
                    <span>{formatDateDMY(fromDate) || 'Any'} → {formatDateDMY(toDate) || 'Present'}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin flex flex-col min-h-0">

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between shadow-2xs shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span className="font-medium truncate">{errorMessage}</span>
              </div>
              {setErrorMessage && (
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="p-1 hover:bg-red-500/10 rounded transition-colors text-red-500 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Feedback Notification */}
          {feedbackMsg && (
            <div
              className={`p-2.5 rounded text-xs flex items-center justify-between shadow-2xs shrink-0 ${feedbackMsg.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
                }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {feedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                )}
                <span className="font-medium truncate">{feedbackMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackMsg(null)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Search bar & 3 Distinct Tabs: Unapproved, Available, Selected */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 justify-between shrink-0">
            {/* Search input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by category, WO#, remarks..."
                className="w-full bg-surface-container-low border border-outline-variant/70 text-on-surface text-xs rounded pl-8 pr-8 py-2 focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 3 Separate Sections / Tabs */}
            <div className="flex items-center bg-surface-container-low border border-outline-variant/70 p-0.5 rounded shrink-0 text-xs font-semibold self-start sm:self-auto">
              {/* Tab 1: Unapproved */}
              <button
                type="button"
                onClick={() => setActiveFilterTab('unapproved')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 ${activeFilterTab === 'unapproved'
                  ? 'bg-amber-600 text-white shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                <span>Unapproved</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeFilterTab === 'unapproved'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                >
                  {unapprovedExpenses.length}
                </span>
              </button>

              {/* Tab 2: Available */}
              <button
                type="button"
                onClick={() => setActiveFilterTab('available')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 ${activeFilterTab === 'available'
                  ? 'bg-surface-container-high text-on-surface shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                <span>Available</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-highest text-on-surface-variant font-bold">
                  {availableExpenses.length}
                </span>
              </button>

              {/* Tab 3: Selected */}
              <button
                type="button"
                onClick={() => setActiveFilterTab('selected')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 ${activeFilterTab === 'selected'
                  ? 'bg-primary text-on-primary shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                <span>Selected</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeFilterTab === 'selected'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}
                >
                  {selectedExpenses.length}
                </span>
              </button>
            </div>
          </div>

          {/* List Container for Selected Tab */}
          <div className="flex-1 min-h-[300px] flex flex-col rounded border border-outline-variant/70 bg-surface-container-lowest overflow-hidden">
            {isLoadingExpenses ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-on-surface-variant text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Loading expenses...</span>
              </div>
            ) : workerExpenses.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-on-surface-variant">
                No unclaimed expenses found for this technician.
              </div>
            ) : activeFilterTab === 'unapproved' ? (
              /* UNAPPROVED SECTION */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-amber-500/[0.06] border-b border-amber-500/20 shrink-0">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Unapproved Expenses ({unapprovedExpenses.length}) • {unapprovedTotal.toFixed(3)} KD
                  </span>
                  {filteredUnapproved.length > 0 && (
                    <button
                      type="button"
                      disabled={isBulkApproving}
                      onClick={handleBulkApproveUnapproved}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                      title="Approve all unapproved expenses"
                    >
                      {isBulkApproving ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Approving all...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Approve All ({filteredUnapproved.length})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
                  {filteredUnapproved.length === 0 ? (
                    <div className="h-full flex items-center justify-center p-6 text-center text-xs text-on-surface-variant/70">
                      {searchQuery
                        ? 'No unapproved expenses match your search.'
                        : 'No unapproved expenses. All available expenses are approved.'}
                    </div>
                  ) : (
                    filteredUnapproved.map(exp => renderExpenseCard(exp, 'unapproved'))
                  )}
                </div>
              </div>
            ) : activeFilterTab === 'available' ? (
              /* AVAILABLE SECTION */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-surface-container-high/40 border-b border-outline-variant/60 shrink-0">
                  <span className="text-xs font-semibold text-on-surface">
                    Available Expenses ({availableExpenses.length}) • {availableTotal.toFixed(3)} KD
                  </span>
                  {filteredAvailable.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddAllAvailable}
                      className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                    >
                      Add All ({filteredAvailable.length})
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
                  {filteredAvailable.length === 0 ? (
                    <div className="h-full flex items-center justify-center p-6 text-center text-xs text-on-surface-variant/70">
                      {searchQuery
                        ? 'No available expenses match your search.'
                        : unapprovedExpenses.length > 0
                          ? 'No approved expenses available yet. Check the "Unapproved" tab to approve expenses.'
                          : 'All available expenses have been added to the bundle.'}
                    </div>
                  ) : (
                    filteredAvailable.map(exp => renderExpenseCard(exp, 'available'))
                  )}
                </div>
              </div>
            ) : (
              /* SELECTED SECTION */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-surface-container-high/40 border-b border-outline-variant/60 shrink-0">
                  <span className="text-xs font-semibold text-on-surface">
                    Selected in Bundle ({selectedExpenses.length}) • {selectedTotal.toFixed(3)} KD
                  </span>
                  {filteredSelected.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveAllSelected}
                      className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium cursor-pointer"
                    >
                      Remove All
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
                  {filteredSelected.length === 0 ? (
                    <div className="h-full flex items-center justify-center p-6 text-center text-xs text-on-surface-variant/70">
                      {searchQuery
                        ? 'No selected expenses match your search.'
                        : 'No expenses selected yet. Switch to "Available" or "Unapproved" tab to add expenses.'}
                    </div>
                  ) : (
                    filteredSelected.map(exp => renderExpenseCard(exp, 'selected'))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bundle Remarks Row */}
        <div className="px-4 py-2.5 bg-surface-container border-t border-outline-variant/60 flex items-center gap-3 shrink-0">
          <label className="text-xs font-semibold text-on-surface shrink-0 flex items-center gap-1.5">
            <span>Remarks</span>
            <span className="text-red-500 font-bold">*</span>

          </label>
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              required
              value={bundleRemarks}
              onChange={(e) => {
                setBundleRemarks(e.target.value);
                setIsRemarksAuto(false);
              }}
              placeholder={selectedExpenses.length === 0 ? "Select expenses to generate remarks dynamically..." : "Dynamic remarks based on activity..."}
              className="flex-1 bg-surface-container-low border border-outline-variant/80 text-on-surface text-xs rounded px-3 py-1.5 focus:outline-none focus:border-primary placeholder:text-on-surface-variant/50"
            />
            <button
              type="button"
              onClick={() => {
                setIsRemarksAuto(true);
                const dyn = generateDynamicRemarks(selectedExpenses);
                if (dyn) setBundleRemarks(dyn);
              }}
              title="Regenerate dynamic remarks from activity"
              className={`px-2.5 py-1.5 rounded text-xs font-medium border inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${isRemarksAuto
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-outline-variant/80 bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
            >

              <span className="text-[11px]">Auto</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-outline-variant/70 bg-surface-container-high/30 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">Selected:</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {selectedTotal.toFixed(3)} KD
            </span>
            <span className="text-xs text-on-surface-variant hidden sm:inline">
              ({selectedExpenses.length} {selectedExpenses.length === 1 ? 'item' : 'items'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded border border-outline-variant/70 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedExpenses.length === 0) return;
                if (!bundleRemarks.trim()) {
                  const fallback = generateDynamicRemarks(selectedExpenses) || 'Worker Expense Claim';
                  setBundleRemarks(fallback);
                  setTimeout(() => handleCreateBundle(), 50);
                  return;
                }
                handleCreateBundle();
              }}
              disabled={submitting || isSyncingNewBundle || selectedExpenses.length === 0 || (!bundleRemarks.trim() && !generateDynamicRemarks(selectedExpenses))}
              className="px-4 py-2 rounded bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer shadow-md hover:shadow-primary/25 active:scale-[0.98] flex items-center gap-2"
            >
              {isSyncingNewBundle ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Finalizing...</span>
                </span>
              ) : submitting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </span>
              ) : (
                'Create Claim Bundle'
              )}
            </button>
          </div>
        </div>

      </div>

      {/* POPUP MODAL: EDIT EXPENSE */}
      {editingExpense && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-surface-container rounded border border-outline-variant/80 max-w-md w-full p-5 shadow-2xl space-y-4 text-on-surface animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-outline-variant/70 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-bold text-on-surface">
                  Edit Expense #{editingExpense.expense_id}
                </h4>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editFormError && (
              <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditExpense} className="space-y-3.5 text-xs">
              {/* Category */}
              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Expense Category
                </label>
                {expenseTypes.length > 0 ? (
                  <select
                    value={editExpenseTypeId}
                    onChange={(e) => setEditExpenseTypeId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant text-on-surface text-xs rounded p-2 focus:outline-none focus:border-primary"
                  >
                    <option value="">Select Category...</option>
                    {expenseTypes.map((et: any) => (
                      <option key={et.expense_type_id || et.id} value={String(et.expense_type_id || et.id)}>
                        {et.expense_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={editingExpense.expense_type_detail?.expense_name || editingExpense.expense_type?.expense_name || 'General Expense'}
                    className="w-full bg-surface-container-high border border-outline-variant text-on-surface-variant text-xs rounded p-2 cursor-not-allowed opacity-80"
                  />
                )}
              </div>

              {/* Amount & Date side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface mb-1">
                    Amount (KD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0.000"
                    className="w-full bg-surface-container-low border border-outline-variant text-on-surface text-xs rounded p-2 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant text-on-surface text-xs rounded p-2 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Remarks / Description
                </label>
                <textarea
                  rows={2}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Notes or details about this expense..."
                  className="w-full bg-surface-container-low border border-outline-variant text-on-surface text-xs rounded p-2 focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/60">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="px-3.5 py-1.5 rounded border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingExpense}
                  className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isUpdatingExpense ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPENSE PREVIEW MODAL */}
      <ExpensePreviewModal
        expense={previewExpense}
        onClose={() => setPreviewExpense(null)}
        fallbackWorker={worker}
        zIndexClass="z-[85]"
        setPreviewMediaUrl={setPreviewMediaUrl}
        setSelectedTicketForModal={setSelectedTicketForModal}
      />

    </div>
  );
};
