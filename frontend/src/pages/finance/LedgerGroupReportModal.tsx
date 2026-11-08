import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X, Printer, Download, Copy, Check, FileText,
  Boxes, Building2, User, UserCheck, Layers, CheckCircle2,
  DollarSign, Receipt, Search, ShieldCheck, Loader2, Pencil, Store
} from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getUserId, type LedgerItem, type ExpenseItem, type LedgerBatchItem, type WorkerClaimItem } from './types';
import Can from '@/hooks/Can';
import { usePermission } from '@/hooks/usePermission';

export interface LedgerGroupCluster {
  groupId: number | string;
  groupName: string;
  createdByName: string;
  createdAt: string;
  isCompleted?: boolean;
  completedAt?: string;
  completedByName?: string;
  isPaid?: boolean;
  paidAt?: string;
  paidByName?: string;
  paymentMethod?: string;
  paymentReference?: string;
  paymentRemarks?: string;
  recipientName?: string;
  ledgers: LedgerItem[];
  totalAmount: number;
  totalBundlesCount: number;
  totalExpensesCount: number;
  totalWorkersCount?: number;
  allApproved: boolean;
  approvedCount: number;
  totalCount: number;
}

interface LedgerGroupReportModalProps {
  group: LedgerGroupCluster;
  onClose: () => void;
  setSelectedTicketForModal?: (ticket: any) => void;
  token?: string;
  API_URL?: string;
  onGroupRenamed?: (groupId: number | string, newName: string) => void;
}

interface ExpenseColumnCategory {
  parentName: string;
  children: string[];
}

interface TicketExpenseRow {
  uniqueKey: string;
  workerId: number | string;
  workerName: string;
  workerEmployeeNo?: string;
  bundleId: number | string;
  expNo: string | number;
  ticketNo?: string;
  expenseIds?: (string | number)[];
  location: string;
  storeType?: string;
  storeTypeLabel?: string;
  subDepartment: string;
  issueTitle: string;
  remarks?: string;
  ledgerBatch: string;
  ledgerGroup: string;
  ledgerId: number;
  amountsByType: Record<string, number>;
  total: number;
  ticketObj?: any;
  labourAmount: number;
}

const STORE_TYPE_LABELS: Record<string, string> = {
  SUPER_MARKET: 'Super Market',
  HYPER_MARKET: 'Hyper Market',
  WAREHOUSE: 'Warehouse',
  FRESH: 'Fresh Market',
  COSTO: 'Costo',
  CAMP: 'Camp',
  KITCHEN: 'Central Kitchen',
  ROASTERY: 'Roastery',
  'FINE DINE': 'Fine Dine',
};

export const LedgerGroupReportModal: React.FC<LedgerGroupReportModalProps> = ({
  group,
  onClose,
  setSelectedTicketForModal,
  token,
  API_URL,
  onGroupRenamed,
}) => {
  const { hasPermission } = usePermission();
  const canWorkerWise = hasPermission('finance.worker_wise_settlement') || hasPermission('worker_wise_settlement');
  const canLocationWise = hasPermission('finance.location_wise_expenses') || hasPermission('location_wise_expenses');

  const [activeTab, setActiveTab] = useState<'userwise' | 'storewise' | 'consolidated'>(() => {
    if (!canWorkerWise && canLocationWise) return 'storewise';
    return 'userwise';
  });
  const [storeReportGrouping, setStoreReportGrouping] = useState<'batch' | 'store_type'>('batch');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('all');
  const [selectedStoreTypeFilter, setSelectedStoreTypeFilter] = useState<string>('all');
  const [groupByLocation, setGroupByLocation] = useState(true);
  const [isVerticalOrientation, setIsVerticalOrientation] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showWorkerDetailsInSummary, setShowWorkerDetailsInSummary] = useState(true);
  const [showWorkerSummary, setShowWorkerSummary] = useState(true);
  const [showWorkerDetailed, setShowWorkerDetailed] = useState(false);
  const [fetchedExpenseTypes, setFetchedExpenseTypes] = useState<any[]>([]);
  const [fetchedBatches, setFetchedBatches] = useState<LedgerBatchItem[]>([]);
  const [fetchedStores, setFetchedStores] = useState<any[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  // Ledger Group Rename States
  const [currentGroupName, setCurrentGroupName] = useState(group.groupName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(group.groupName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Sync if prop changes
  useEffect(() => {
    setCurrentGroupName(group.groupName);
    setEditNameValue(group.groupName);
  }, [group.groupName]);

  const handleSaveGroupName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      setNameError('Group name cannot be empty');
      return;
    }
    if (trimmed === currentGroupName) {
      setIsEditingName(false);
      setNameError(null);
      return;
    }
    if (!API_URL) {
      setNameError('API URL is not configured');
      return;
    }
    setIsSavingName(true);
    setNameError(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Token ${token}`;

      const res = await fetch(`${API_URL}/finance/ledger-groups/${group.groupId}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ group_name: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = Array.isArray(data.group_name)
          ? data.group_name[0]
          : (data.group_name || data.detail || data.error || 'Failed to rename ledger group');
        throw new Error(errorMsg);
      }
      const updatedName = data.group_name || trimmed;
      setCurrentGroupName(updatedName);
      group.groupName = updatedName;
      setIsEditingName(false);
      if (onGroupRenamed) {
        onGroupRenamed(group.groupId, updatedName);
      }
    } catch (err: any) {
      setNameError(err.message || 'Failed to rename ledger group');
    } finally {
      setIsSavingName(false);
    }
  };

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Fetch complete expense type hierarchy and ledger batches from API
  useEffect(() => {
    if (!API_URL) return;
    const headers: Record<string, string> = token ? { Authorization: `Token ${token}` } : {};

    // 1. Fetch Expense Types
    fetch(`${API_URL}/finance/expensetype/`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
        setFetchedExpenseTypes(list);
      })
      .catch(err => console.error('Failed to fetch expense types:', err));

    // 2. Fetch Ledger Batches
    fetch(`${API_URL}/finance/ledger-batches/`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
        setFetchedBatches(list);
      })
      .catch(err => console.error('Failed to fetch ledger batches:', err));

    // 3. Fetch Stores (for Store Type mapping)
    fetch(`${API_URL}/stores/?limit=1000`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
        setFetchedStores(list);
      })
      .catch(err => console.error('Failed to fetch stores:', err));
  }, [API_URL, token]);

  // Flatten all itemized expenses across all ledgers & bundles in this group
  const allExpenses = useMemo(() => {
    const list: (ExpenseItem & {
      ledger_id: number;
      batch_name: string;
      bundle_id?: number | string;
    })[] = [];
    const seenExpenseIds = new Set<number>();

    // Phase 1: First gather all expenses directly assigned to each ledger batch
    for (const l of group.ledgers) {
      const batchName = l.ledger_batch_detail?.batch_name ||
        (typeof l.ledger_batch === 'object' ? (l.ledger_batch as any)?.batch_name : null) ||
        `Ledger Batch ${l.ledger_id}`;

      const directExps = Array.isArray(l.expenses) ? l.expenses : [];
      for (const exp of directExps) {
        const expId = exp.expense_id;
        if (expId != null) {
          if (seenExpenseIds.has(expId)) continue;
          seenExpenseIds.add(expId);
        }
        const bundleId = (exp as any).claim_id ||
          (typeof exp.claim === 'object' ? exp.claim?.claim_id : exp.claim) ||
          undefined;
        list.push({ ...exp, ledger_id: l.ledger_id, batch_name: batchName, bundle_id: bundleId });
      }
    }

    // Phase 2: Also gather expenses from bundles for any ledger expenses not directly present
    for (const l of group.ledgers) {
      if (Array.isArray(l.bundles)) {
        const batchName = l.ledger_batch_detail?.batch_name ||
          (typeof l.ledger_batch === 'object' ? (l.ledger_batch as any)?.batch_name : null) ||
          `Ledger Batch ${l.ledger_id}`;

        for (const bundle of l.bundles) {
          const bundleId = bundle.claim_id;
          const bundleExps = Array.isArray(bundle.expenses) ? bundle.expenses : [];
          for (const exp of bundleExps) {
            const expId = exp.expense_id;
            if (expId != null) {
              if (seenExpenseIds.has(expId)) continue;
              seenExpenseIds.add(expId);
            }
            list.push({ ...exp, ledger_id: l.ledger_id, batch_name: batchName, bundle_id: bundleId });
          }
        }
      }
    }

    return list;
  }, [group.ledgers]);

  // Build parent map from API and expenses
  const expenseTypeParentMap = useMemo(() => {
    const childToParent = new Map<string, string>();

    // From API
    for (const et of fetchedExpenseTypes) {
      const childName = (et.expense_name || '').trim();
      const parentName = (et.parent?.expense_name || et.parent_name || '').trim();
      if (childName && parentName) {
        childToParent.set(childName.toLowerCase(), parentName);
      }
    }

    // From actual expenses
    for (const exp of allExpenses) {
      const expTypeObj = exp.expense_type_detail || exp.expense_type;
      const childName = ((expTypeObj as any)?.expense_name || '').trim();
      const parentName = ((expTypeObj as any)?.parent_name || (expTypeObj as any)?.parent?.expense_name || '').trim();
      if (childName && parentName) {
        childToParent.set(childName.toLowerCase(), parentName);
      }
    }

    return childToParent;
  }, [fetchedExpenseTypes, allExpenses]);

  // Dynamic Multi-Level Expense Columns structure (Parent -> Children)
  const expenseColumnsHierarchy = useMemo<ExpenseColumnCategory[]>(() => {
    const parentToChildrenMap = new Map<string, Set<string>>();
    const knownParentsOrder = ['Travel Fair', 'Transportation', 'Material', 'Other', 'Miscellaneous'];

    // Discover all expense type names used in this group
    const usedTypeNames = new Set<string>();
    for (const exp of allExpenses) {
      const typeName = (exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || '').trim();
      if (typeName) {
        usedTypeNames.add(typeName);
      }
    }

    // Default template if no expenses yet
    if (usedTypeNames.size === 0) {
      return [
        { parentName: 'Travel Fair', children: ['BusFair', 'taxi fair'] },
        { parentName: 'Material', children: ['Cost', 'Transportation'] }
      ];
    }

    for (const typeName of usedTypeNames) {
      const lower = typeName.toLowerCase();
      let parent = expenseTypeParentMap.get(lower);

      if (!parent) {
        if (lower.includes('bus') || lower.includes('taxi') || lower.includes('fare') || lower.includes('fair') || lower.includes('travel') || lower.includes('transport')) {
          parent = 'Travel Fair';
        } else if (lower.includes('cost') || lower.includes('material') || lower.includes('item') || lower.includes('spare') || lower.includes('part') || lower.includes('hardware')) {
          parent = 'Material';
        } else {
          parent = 'Other';
        }
      }

      if (!parentToChildrenMap.has(parent)) {
        parentToChildrenMap.set(parent, new Set());
      }
      parentToChildrenMap.get(parent)!.add(typeName);
    }

    // Sort parents with known parents first
    const sortedParents = Array.from(parentToChildrenMap.keys()).sort((a, b) => {
      const idxA = knownParentsOrder.indexOf(a);
      const idxB = knownParentsOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedParents.map(parentName => ({
      parentName,
      children: Array.from(parentToChildrenMap.get(parentName)!)
    }));
  }, [allExpenses, expenseTypeParentMap]);

  // Flattened list of all distinct child columns
  const allChildExpenseColumns = useMemo<string[]>(() => {
    const list: string[] = [];
    for (const cat of expenseColumnsHierarchy) {
      for (const child of cat.children) {
        if (!list.includes(child)) {
          list.push(child);
        }
      }
    }
    return list;
  }, [expenseColumnsHierarchy]);

  // Helper to resolve the correct LedgerBatch name for a ledger or ticket
  const resolveLedgerBatchName = useMemo(() => {
    return (ledger: LedgerItem, subDeptId?: number, subDeptName?: string): string => {
      // 1. Direct from ledger batch detail
      if (ledger.ledger_batch_detail?.batch_name) {
        return ledger.ledger_batch_detail.batch_name;
      }
      if (typeof ledger.ledger_batch === 'object' && (ledger.ledger_batch as any)?.batch_name) {
        return (ledger.ledger_batch as any).batch_name;
      }

      // 2. Lookup by sub-department if batch detail missing
      if (subDeptId && fetchedBatches.length > 0) {
        const matched = fetchedBatches.find(b =>
          Array.isArray(b.sub_departments) && b.sub_departments.includes(subDeptId)
        );
        if (matched) return matched.batch_name;
      }
      if (subDeptName && fetchedBatches.length > 0) {
        const lowerName = subDeptName.toLowerCase().trim();
        const matched = fetchedBatches.find(b =>
          b.sub_departments_detail?.some(sd => sd.sub_department_name.toLowerCase().trim() === lowerName)
        );
        if (matched) return matched.batch_name;
      }

      return currentGroupName || `Ledger ${ledger.ledger_id}`;
    };
  }, [fetchedBatches, currentGroupName]);

  // Map all bundles in group by ID for quick lookup of worker and details
  const groupBundlesMap = useMemo(() => {
    const map = new Map<string, WorkerClaimItem>();
    for (const l of group.ledgers) {
      if (Array.isArray(l.bundles)) {
        for (const b of l.bundles) {
          if (b.claim_id != null) {
            map.set(String(b.claim_id), b);
          }
        }
      }
    }
    return map;
  }, [group.ledgers]);

  // Map of expense_id -> bundle for reverse lookup
  const expenseToBundleMap = useMemo(() => {
    const map = new Map<number, WorkerClaimItem>();
    for (const l of group.ledgers) {
      if (Array.isArray(l.bundles)) {
        for (const b of l.bundles) {
          if (Array.isArray(b.expenses)) {
            for (const bexp of b.expenses) {
              if (bexp.expense_id != null) {
                map.set(bexp.expense_id, b);
              }
            }
          }
        }
      }
    }
    return map;
  }, [group.ledgers]);

  // Create store lookup map: lowercase trimmed store name / code / id -> store_type
  const storeTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of fetchedStores) {
      const type = s.store_type;
      if (!type) continue;
      if (s.store_name) map.set(s.store_name.trim().toLowerCase(), type);
      if (s.store_code) map.set(s.store_code.trim().toLowerCase(), type);
      if (s.store_id != null) map.set(String(s.store_id), type);
      if (s.id != null) map.set(String(s.id), type);
    }
    return map;
  }, [fetchedStores]);

  // Build Structured Ticket/Expense Rows
  const structuredRows = useMemo<TicketExpenseRow[]>(() => {
    const rowMap = new Map<string, TicketExpenseRow>();
    const processedBundleIds = new Set<string | number>();

    // 1. Build rows from all expenses
    for (const exp of allExpenses) {
      const rawClaimId = exp.bundle_id || (exp as any).claim_id || (typeof exp.claim === 'object' ? exp.claim?.claim_id : exp.claim);
      const matchedBundle = (rawClaimId != null ? groupBundlesMap.get(String(rawClaimId)) : undefined)
        || (exp.expense_id != null ? expenseToBundleMap.get(exp.expense_id) : undefined);

      const wObj = (typeof exp.worker === 'object' && exp.worker ? exp.worker : null)
        || exp.worker_detail
        || matchedBundle?.worker_detail
        || (typeof matchedBundle?.worker === 'object' ? matchedBundle.worker : null);

      const resolvedWorkerId = getUserId(wObj) ?? getUserId(exp.worker) ?? getUserId(matchedBundle?.worker_detail) ?? getUserId(matchedBundle?.worker);
      const workerId = resolvedWorkerId != null ? resolvedWorkerId : 'unknown';
      const workerName = wObj?.full_name || wObj?.username || matchedBundle?.worker_detail?.full_name || matchedBundle?.worker_detail?.username || (workerId !== 'unknown' ? `Technician ${workerId}` : 'Unknown Technician');
      const workerEmpNo = wObj?.employee_no || matchedBundle?.worker_detail?.employee_no || '';

      const rawTicket = (exp.ticket_details || (exp as any).ticket) as any;
      const ticketId = exp.ticket_details?.ticket_id ||
        (typeof rawTicket === 'object' ? rawTicket?.ticket_id || rawTicket?.id : (typeof exp.ticket === 'number' ? exp.ticket : null));
      const workOrderNo = exp.ticket_details?.work_order_no ||
        (typeof rawTicket === 'object' && rawTicket?.work_order_no ? rawTicket.work_order_no : '') ||
        '';
      const ticketNo = workOrderNo || (ticketId ? `WO-${ticketId}` : (exp.expense_id ? `EXP-${exp.expense_id}` : 'General'));
      const expNo = ticketNo;
      const expId = exp.expense_id != null ? String(exp.expense_id) : '';
      const bundleId = exp.bundle_id || rawClaimId || (matchedBundle ? matchedBundle.claim_id : '-');

      if (bundleId && bundleId !== '-') {
        processedBundleIds.add(String(bundleId));
      }

      const location = exp.responsible_store?.store_name || exp.ticket_details?.store_name || (exp as any).store_name || 'General';
      const rawStoreType = (exp.responsible_store as any)?.store_type ||
        (exp.ticket_details as any)?.store_type ||
        (exp as any).store_type ||
        (exp.responsible_store?.store_id != null ? storeTypeMap.get(String(exp.responsible_store.store_id)) : undefined) ||
        (location ? storeTypeMap.get(location.trim().toLowerCase()) : undefined) ||
        'OTHER';

      const storeTypeLabel = STORE_TYPE_LABELS[rawStoreType] ||
        (rawStoreType ? rawStoreType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Other');

      const subDept = exp.ticket_details?.sub_department_name || exp.sub_department_name || 'General';
      const rawRemarks = (exp.remarks || '').trim();
      const rawTitle = (exp.ticket_details?.title || (exp as any).title || '').trim();
      const issueTitle = rawRemarks
        ? (rawTitle && rawTitle.toLowerCase() !== rawRemarks.toLowerCase()
          ? `${rawTitle} - ${rawRemarks}`
          : rawRemarks)
        : (rawTitle || 'Maintenance Request');

      const ledgerObj = group.ledgers.find(l => l.ledger_id === exp.ledger_id) || ({} as LedgerItem);
      const ledgerBatch = exp.batch_name || resolveLedgerBatchName(ledgerObj, exp.ticket_details?.sub_department_id || exp.sub_department_id, subDept);
      const ledgerGroup = currentGroupName || ledgerBatch;

      const key = exp.expense_id != null
        ? `exp_${exp.expense_id}`
        : `exp_${workerId}_${bundleId}_${ticketId || 'no_ticket'}_${location}_${subDept}_${Math.random()}`;

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          uniqueKey: key,
          workerId,
          workerName,
          workerEmployeeNo: workerEmpNo,
          bundleId,
          expNo,
          ticketNo,
          expenseIds: expId ? [expId] : [],
          location,
          storeType: rawStoreType,
          storeTypeLabel,
          subDepartment: subDept,
          issueTitle,
          remarks: rawRemarks,
          ledgerBatch,
          ledgerGroup,
          ledgerId: exp.ledger_id,
          amountsByType: {},
          total: 0,
          ticketObj: exp.ticket_details || (typeof rawTicket === 'object' ? rawTicket : null),
          labourAmount: 0
        });
      } else {
        const row = rowMap.get(key)!;
        if (expId && !row.expenseIds?.includes(expId)) {
          if (!row.expenseIds) row.expenseIds = [];
          row.expenseIds.push(expId);
        }
        if (rawRemarks) {
          if (!row.remarks) {
            row.remarks = rawRemarks;
          } else if (!row.remarks.includes(rawRemarks)) {
            row.remarks = `${row.remarks}; ${rawRemarks}`;
          }
        }
      }

      const row = rowMap.get(key)!;
      const typeName = (exp.expense_type_detail?.expense_name || exp.expense_type?.expense_name || 'Other').trim();
      const amt = parseFloat(exp.amount || '0');
      row.amountsByType[typeName] = (row.amountsByType[typeName] || 0) + amt;
      row.total += amt;
      const lowerType = typeName.toLowerCase();
      if (lowerType.includes('labour') || lowerType.includes('labor') || lowerType.includes('workmanship')) {
        row.labourAmount += amt;
      }
    }

    // 2. Also include worker claims from bundles only if the bundle has NO itemized expenses
    for (const l of group.ledgers) {
      if (Array.isArray(l.bundles)) {
        for (const bundle of l.bundles) {
          const bundleId = bundle.claim_id;
          if (processedBundleIds.has(String(bundleId))) {
            continue;
          }
          if (Array.isArray(bundle.expenses) && bundle.expenses.length > 0) {
            continue;
          }

          const wObj = bundle.worker_detail || (typeof bundle.worker === 'object' ? bundle.worker : null);
          const resolvedWorkerId = getUserId(wObj) ?? getUserId(bundle.worker);
          const workerId = resolvedWorkerId != null ? resolvedWorkerId : 'unknown';
          const workerName = wObj?.full_name || wObj?.username || (workerId !== 'unknown' ? `Technician ${workerId}` : 'Unknown Technician');
          const workerEmpNo = wObj?.employee_no || '';
          const location = bundle.ticket_details?.store_name || l.store_detail?.store_name || 'General';
          const rawStoreType = (bundle.ticket_details as any)?.store_type ||
            (bundle as any).store_type ||
            (l.store_detail as any)?.store_type ||
            (location ? storeTypeMap.get(location.trim().toLowerCase()) : undefined) ||
            'OTHER';

          const storeTypeLabel = STORE_TYPE_LABELS[rawStoreType] ||
            (rawStoreType ? rawStoreType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Other');

          const subDept = bundle.ticket_details?.sub_department_name || 'General';
          const issueTitle = bundle.ticket_details?.title || bundle.remarks || 'Worker Settlement';
          const ledgerBatch = resolveLedgerBatchName(l, bundle.ticket_details?.sub_department_id, subDept);
          const ledgerGroup = currentGroupName || ledgerBatch;
          const rawTicket = bundle.ticket_details;
          const ticketId = bundle.ticket_details?.ticket_id;
          const workOrderNo = bundle.ticket_details?.work_order_no || '';
          const ticketNo = workOrderNo || (ticketId ? `WO-${ticketId}` : `CLAIM-${bundle.claim_id}`);
          const expNo = ticketNo;
          const expId = bundle.claim_id ? String(bundle.claim_id) : '';

          const key = `claim_${workerId}_${bundleId}_${bundle.ticket_details?.ticket_id || bundleId}_${location}_${subDept}`;
          if (!rowMap.has(key)) {
            const claimedAmt = parseFloat(bundle.total_claimed_amount || '0');
            rowMap.set(key, {
              uniqueKey: key,
              workerId,
              workerName,
              workerEmployeeNo: workerEmpNo,
              bundleId,
              expNo,
              ticketNo,
              expenseIds: expId ? [expId] : [],
              location,
              storeType: rawStoreType,
              storeTypeLabel,
              subDepartment: subDept,
              issueTitle,
              remarks: (bundle.remarks || '').trim(),
              ledgerBatch,
              ledgerGroup,
              ledgerId: l.ledger_id,
              amountsByType: {},
              total: claimedAmt,
              ticketObj: bundle.ticket_details,
              labourAmount: claimedAmt
            });
          }
        }
      }
    }

    return Array.from(rowMap.values());
  }, [allExpenses, group.ledgers, currentGroupName, resolveLedgerBatchName, groupBundlesMap, expenseToBundleMap, storeTypeMap]);

  // Helper to format ticket and its expense numbers across multiple lines if vertical orientation is enabled
  const formatTicketExpenseLines = (ticket: string, expIds: string[], isVertical: boolean): string[] => {
    if (!expIds || expIds.length === 0) return [ticket];
    if (ticket === `EXP-${expIds[0]}` && expIds.length === 1) return [ticket];
    if (!isVertical || expIds.length <= 3) {
      return [`${ticket}(${expIds.join(',')})`];
    }

    const lines: string[] = [];
    const firstChunk = expIds.slice(0, 3);
    const remaining = expIds.slice(3);

    lines.push(`${ticket}(${firstChunk.join(',')},`);
    const chunkSize = 7;
    for (let i = 0; i < remaining.length; i += chunkSize) {
      const chunk = remaining.slice(i, i + chunkSize);
      const isLast = (i + chunkSize) >= remaining.length;
      lines.push(`${chunk.join(',')}${isLast ? ')' : ','}`);
    }
    return lines;
  };

  // Helper to group any list of TicketExpenseRow by Location with tickets & summaries merged
  const groupRowsByLocation = (rows: TicketExpenseRow[], cols: string[], isVertical: boolean = isVerticalOrientation) => {
    const locMap = new Map<string, {
      location: string;
      rows: TicketExpenseRow[];
      ticketExpMap: Map<string, string[]>;
      ledgerBatches: string[];
      subDepartments: string[];
      summary: string;
      amountsByType: Record<string, number>;
      total: number;
    }>();

    for (const row of rows) {
      const loc = (row.location || 'Unknown Location').trim();
      if (!locMap.has(loc)) {
        locMap.set(loc, {
          location: loc,
          rows: [],
          ticketExpMap: new Map<string, string[]>(),
          ledgerBatches: [],
          subDepartments: [],
          summary: '',
          amountsByType: {},
          total: 0
        });
      }
      const entry = locMap.get(loc)!;
      entry.rows.push(row);

      const tKey = row.ticketNo || String(row.expNo || 'Ticket');
      if (!entry.ticketExpMap.has(tKey)) {
        entry.ticketExpMap.set(tKey, []);
      }
      const expList = entry.ticketExpMap.get(tKey)!;
      if (Array.isArray(row.expenseIds)) {
        for (const id of row.expenseIds) {
          const s = String(id).trim();
          if (s && !expList.includes(s)) {
            expList.push(s);
          }
        }
      }

      if (row.ledgerBatch && !entry.ledgerBatches.includes(row.ledgerBatch)) {
        entry.ledgerBatches.push(row.ledgerBatch);
      }
      if (row.subDepartment && !entry.subDepartments.includes(row.subDepartment)) {
        entry.subDepartments.push(row.subDepartment);
      }
      entry.total += row.total;
      for (const col of cols) {
        entry.amountsByType[col] = (entry.amountsByType[col] || 0) + (row.amountsByType[col] || 0);
      }
    }

    const result = Array.from(locMap.values()).map(entry => {
      // Use expense remarks as summary (not tickets title)
      const remarksList = entry.rows
        .map(r => (r.remarks || '').trim())
        .filter(Boolean);
      const uniqueRemarks = Array.from(new Set(remarksList));

      const summaryText = uniqueRemarks.length > 0
        ? `${entry.rows.length > 1 ? `[${entry.rows.length}] ` : ''}${uniqueRemarks.slice(0, 4).join('; ')}${uniqueRemarks.length > 4 ? ` (+${uniqueRemarks.length - 4} more)` : ''}`
        : (entry.rows.length > 1 ? `${entry.rows.length} Expenses` : '-');

      const ticketLines: string[] = [];
      entry.ticketExpMap.forEach((expIds, ticket) => {
        ticketLines.push(...formatTicketExpenseLines(ticket, expIds, isVertical));
      });

      return {
        ...entry,
        summary: summaryText,
        subDeptStr: entry.subDepartments.join(', '),
        ticketLines,
        expNoStr: ticketLines.join(' '),
        ticketLinesPrint: ticketLines.join('<br />'),
        ticketLinesText: ticketLines.join('\n'),
        batchStr: entry.ledgerBatches.join(', ')
      };
    });

    result.sort((a, b) => a.location.localeCompare(b.location));
    return result;
  };

  // Group structured rows by Worker for Tab 1 (User-wise Report)
  const workerGroupedRows = useMemo(() => {
    const map = new Map<string, {
      workerId: string | number;
      workerName: string;
      workerEmployeeNo?: string;
      rows: TicketExpenseRow[];
      subtotalByType: Record<string, number>;
      totalAmount: number;
      uniqueLocationsCount: number;
      locationRows: ReturnType<typeof groupRowsByLocation>;
    }>();

    for (const row of structuredRows) {
      const key = String(row.workerId && row.workerId !== 'unknown' ? row.workerId : (row.workerName || 'unknown'));
      if (!map.has(key)) {
        map.set(key, {
          workerId: row.workerId,
          workerName: row.workerName,
          workerEmployeeNo: row.workerEmployeeNo,
          rows: [],
          subtotalByType: {},
          totalAmount: 0,
          uniqueLocationsCount: 0,
          locationRows: []
        });
      }

      const groupEntry = map.get(key)!;
      groupEntry.rows.push(row);
      groupEntry.totalAmount += row.total;

      for (const col of allChildExpenseColumns) {
        const amt = row.amountsByType[col] || 0;
        groupEntry.subtotalByType[col] = (groupEntry.subtotalByType[col] || 0) + amt;
      }
    }

    for (const entry of map.values()) {
      const locationsSet = new Set(entry.rows.map(r => r.location.trim().toLowerCase()));
      entry.uniqueLocationsCount = locationsSet.size;
      entry.locationRows = groupRowsByLocation(entry.rows, allChildExpenseColumns, isVerticalOrientation);
    }

    return Array.from(map.values()).sort((a, b) => a.workerName.localeCompare(b.workerName));
  }, [structuredRows, allChildExpenseColumns, isVerticalOrientation]);

  // Overall Grand Totals for User-wise Report
  const userwiseGrandTotals = useMemo(() => {
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;
    const allLocations = new Set<string>();

    for (const row of structuredRows) {
      grandTotal += row.total;
      allLocations.add(row.location.trim().toLowerCase());
      for (const col of allChildExpenseColumns) {
        colTotals[col] = (colTotals[col] || 0) + (row.amountsByType[col] || 0);
      }
    }

    return {
      colTotals,
      grandTotal,
      uniqueLocationsCount: allLocations.size
    };
  }, [structuredRows, allChildExpenseColumns]);

  // All Dynamic Ledger Batches present in group or system
  const dynamicLedgerBatches = useMemo(() => {
    const set = new Set<string>();

    // 1. From active group ledgers
    for (const l of group.ledgers) {
      if (l.ledger_batch_detail?.batch_name) {
        set.add(l.ledger_batch_detail.batch_name.trim());
      }
    }

    // 2. From structured rows
    for (const r of structuredRows) {
      if (r.ledgerBatch) {
        set.add(r.ledgerBatch.trim());
      }
    }

    // 3. Fallback to fetched batches if needed
    if (set.size === 0 && fetchedBatches.length > 0) {
      fetchedBatches.forEach(b => {
        if (b.batch_name) set.add(b.batch_name.trim());
      });
    }

    return Array.from(set).sort();
  }, [group.ledgers, structuredRows, fetchedBatches]);

  // Filtered rows for Tab 2 Store-wise Report
  const storewiseFilteredRows = useMemo(() => {
    let rows = structuredRows;
    if (selectedBatchFilter !== 'all') {
      rows = rows.filter(r => (r.ledgerBatch || '').trim().toLowerCase() === selectedBatchFilter.trim().toLowerCase());
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.workerName.toLowerCase().includes(q) ||
        String(r.expNo).toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.subDepartment.toLowerCase().includes(q) ||
        r.issueTitle.toLowerCase().includes(q) ||
        (r.remarks || '').toLowerCase().includes(q) ||
        r.ledgerBatch.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [structuredRows, selectedBatchFilter, searchTerm]);

  // Store-wise Section Totals
  const storewiseTotals = useMemo(() => {
    const colTotals: Record<string, number> = {};
    let total = 0;
    for (const row of storewiseFilteredRows) {
      total += row.total;
      for (const col of allChildExpenseColumns) {
        colTotals[col] = (colTotals[col] || 0) + (row.amountsByType[col] || 0);
      }
    }
    return { colTotals, total };
  }, [storewiseFilteredRows, allChildExpenseColumns]);

  // Location-Grouped Rows for entire filtered set
  const locationGroupedRows = useMemo(() => {
    return groupRowsByLocation(storewiseFilteredRows, allChildExpenseColumns, isVerticalOrientation);
  }, [storewiseFilteredRows, allChildExpenseColumns, isVerticalOrientation]);

  // Group rows by dynamic Ledger Batch for Store-wise Reporting (each batch includes locationRows)
  const storewiseByBatch = useMemo(() => {
    return dynamicLedgerBatches.map(batchName => {
      const batchRows = structuredRows.filter(r => (r.ledgerBatch || '').trim().toLowerCase() === batchName.trim().toLowerCase());
      const batchTotals: Record<string, number> = {};
      let batchTotal = 0;
      for (const row of batchRows) {
        batchTotal += row.total;
        for (const col of allChildExpenseColumns) {
          batchTotals[col] = (batchTotals[col] || 0) + (row.amountsByType[col] || 0);
        }
      }
      const locationRows = groupRowsByLocation(batchRows, allChildExpenseColumns, isVerticalOrientation);
      return {
        batchName,
        rows: batchRows,
        locationRows,
        subtotalByType: batchTotals,
        batchTotal
      };
    }).filter(b => b.rows.length > 0);
  }, [dynamicLedgerBatches, structuredRows, allChildExpenseColumns, isVerticalOrientation]);

  // Filtered storewise grouped by batch (for UI view with batch filters and search)
  const storewiseFilteredByBatch = useMemo(() => {
    const batches = selectedBatchFilter === 'all'
      ? dynamicLedgerBatches
      : dynamicLedgerBatches.filter(b => b.trim().toLowerCase() === selectedBatchFilter.trim().toLowerCase());

    return batches.map(batchName => {
      const batchRows = storewiseFilteredRows.filter(r => (r.ledgerBatch || '').trim().toLowerCase() === batchName.trim().toLowerCase());
      const batchTotals: Record<string, number> = {};
      let batchTotal = 0;
      for (const row of batchRows) {
        batchTotal += row.total;
        for (const col of allChildExpenseColumns) {
          batchTotals[col] = (batchTotals[col] || 0) + (row.amountsByType[col] || 0);
        }
      }
      const locationRows = groupRowsByLocation(batchRows, allChildExpenseColumns, isVerticalOrientation);
      return {
        batchName,
        rows: batchRows,
        locationRows,
        subtotalByType: batchTotals,
        batchTotal
      };
    }).filter(b => b.rows.length > 0);
  }, [dynamicLedgerBatches, selectedBatchFilter, storewiseFilteredRows, allChildExpenseColumns, isVerticalOrientation]);

  // Dynamic list of store type labels present in structuredRows
  const dynamicStoreTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of structuredRows) {
      if (r.storeTypeLabel) {
        set.add(r.storeTypeLabel);
      }
    }
    if (set.size === 0) {
      return ['Other / General'];
    }
    return Array.from(set).sort();
  }, [structuredRows]);

  // Filtered rows for Tab 2 Store Type Report
  const storewiseFilteredRowsByStoreType = useMemo(() => {
    let rows = structuredRows;
    if (selectedStoreTypeFilter !== 'all') {
      rows = rows.filter(r => (r.storeTypeLabel || '').trim().toLowerCase() === selectedStoreTypeFilter.trim().toLowerCase());
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.workerName.toLowerCase().includes(q) ||
        String(r.expNo).toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        (r.storeTypeLabel || '').toLowerCase().includes(q) ||
        r.subDepartment.toLowerCase().includes(q) ||
        r.issueTitle.toLowerCase().includes(q) ||
        (r.remarks || '').toLowerCase().includes(q) ||
        r.ledgerBatch.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [structuredRows, selectedStoreTypeFilter, searchTerm]);

  // Group rows by dynamic Store Type for Reporting (each store type includes locationRows)
  const storewiseByStoreType = useMemo(() => {
    return dynamicStoreTypes.map(typeName => {
      const typeRows = structuredRows.filter(r => (r.storeTypeLabel || '').trim().toLowerCase() === typeName.trim().toLowerCase());
      const typeTotals: Record<string, number> = {};
      let typeTotal = 0;
      for (const row of typeRows) {
        typeTotal += row.total;
        for (const col of allChildExpenseColumns) {
          typeTotals[col] = (typeTotals[col] || 0) + (row.amountsByType[col] || 0);
        }
      }
      const locationRows = groupRowsByLocation(typeRows, allChildExpenseColumns, isVerticalOrientation);
      return {
        typeName,
        rows: typeRows,
        locationRows,
        subtotalByType: typeTotals,
        typeTotal
      };
    }).filter(t => t.rows.length > 0);
  }, [dynamicStoreTypes, structuredRows, allChildExpenseColumns, isVerticalOrientation]);

  // Filtered storewise grouped by store type (for UI view with filters and search)
  const storewiseFilteredByStoreType = useMemo(() => {
    const types = selectedStoreTypeFilter === 'all'
      ? dynamicStoreTypes
      : dynamicStoreTypes.filter(t => t.trim().toLowerCase() === selectedStoreTypeFilter.trim().toLowerCase());

    return types.map(typeName => {
      const typeRows = storewiseFilteredRowsByStoreType.filter(r => (r.storeTypeLabel || '').trim().toLowerCase() === typeName.trim().toLowerCase());
      const typeTotals: Record<string, number> = {};
      let typeTotal = 0;
      for (const row of typeRows) {
        typeTotal += row.total;
        for (const col of allChildExpenseColumns) {
          typeTotals[col] = (typeTotals[col] || 0) + (row.amountsByType[col] || 0);
        }
      }
      const locationRows = groupRowsByLocation(typeRows, allChildExpenseColumns, isVerticalOrientation);
      return {
        typeName,
        rows: typeRows,
        locationRows,
        subtotalByType: typeTotals,
        typeTotal
      };
    }).filter(t => t.rows.length > 0);
  }, [dynamicStoreTypes, selectedStoreTypeFilter, storewiseFilteredRowsByStoreType, allChildExpenseColumns, isVerticalOrientation]);

  // Store-wise Section Totals for Store Type mode
  const storewiseTypeTotals = useMemo(() => {
    const colTotals: Record<string, number> = {};
    let total = 0;
    for (const row of storewiseFilteredRowsByStoreType) {
      total += row.total;
      for (const col of allChildExpenseColumns) {
        colTotals[col] = (colTotals[col] || 0) + (row.amountsByType[col] || 0);
      }
    }
    const uniqueLocationsCount = new Set(storewiseFilteredRowsByStoreType.map(r => r.location.trim().toLowerCase())).size;
    return {
      colTotals,
      total,
      grandTotal: total,
      uniqueLocationsCount,
      ticketsCount: storewiseFilteredRowsByStoreType.length
    };
  }, [storewiseFilteredRowsByStoreType, allChildExpenseColumns]);

  // Consolidated Store Type Statement Data
  const consolidatedStoreTypeData = useMemo(() => {
    const typeMap = new Map<string, {
      section: string;
      storeType: string;
      storeTypeLabel: string;
      storesCount: number;
      locationsCount: number;
      uniqueLocations: Set<string>;
      ticketsCount: number;
      labourCharge: number;
      expense: number;
      total: number;
    }>();

    for (const tName of dynamicStoreTypes) {
      typeMap.set(tName, {
        section: tName,
        storeType: tName,
        storeTypeLabel: tName,
        storesCount: 0,
        locationsCount: 0,
        uniqueLocations: new Set(),
        ticketsCount: 0,
        labourCharge: 0,
        expense: 0,
        total: 0
      });
    }

    for (const row of structuredRows) {
      const tName = row.storeTypeLabel || 'Other / General';
      if (!typeMap.has(tName)) {
        typeMap.set(tName, {
          section: tName,
          storeType: tName,
          storeTypeLabel: tName,
          storesCount: 0,
          locationsCount: 0,
          uniqueLocations: new Set(),
          ticketsCount: 0,
          labourCharge: 0,
          expense: 0,
          total: 0
        });
      }
      const entry = typeMap.get(tName)!;
      const expAmt = row.total - row.labourAmount;
      entry.expense += expAmt;
      entry.labourCharge += row.labourAmount;
      entry.total += row.total;
      entry.ticketsCount += 1;
      if (row.location) entry.uniqueLocations.add(row.location.trim().toLowerCase());
    }

    const list = Array.from(typeMap.values()).map(t => ({
      ...t,
      storesCount: t.uniqueLocations.size,
      locationsCount: t.uniqueLocations.size
    })).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

    const grandLabour = list.reduce((s, x) => s + x.labourCharge, 0);
    const grandExpense = list.reduce((s, x) => s + x.expense, 0);
    const grandTotal = list.reduce((s, x) => s + x.total, 0);
    const totalStoresCount = new Set(structuredRows.map(r => r.location.trim().toLowerCase())).size;

    return {
      list,
      grandLabour,
      grandExpense,
      grandTotal,
      totalStoresCount,
      totalLocations: totalStoresCount
    };
  }, [structuredRows, dynamicStoreTypes]);

  // Consolidated Dynamic Ledger Batch Data for Tab 3 (Sheet 5 in Excel)
  const consolidatedBatchData = useMemo(() => {
    const batchMap = new Map<string, {
      section: string;
      labourCharge: number;
      expense: number;
      total: number;
      workers: Map<string, {
        workerId: string | number;
        workerName: string;
        workerEmployeeNo?: string;
        labourCharge: number;
        expense: number;
        total: number;
      }>;
    }>();

    // Initialize all dynamic batches
    for (const bName of dynamicLedgerBatches) {
      batchMap.set(bName, {
        section: bName,
        labourCharge: 0,
        expense: 0,
        total: 0,
        workers: new Map()
      });
    }

    for (const row of structuredRows) {
      const bName = row.ledgerBatch || 'General Maintenance';
      if (!batchMap.has(bName)) {
        batchMap.set(bName, {
          section: bName,
          labourCharge: 0,
          expense: 0,
          total: 0,
          workers: new Map()
        });
      }
      const entry = batchMap.get(bName)!;
      const expAmt = row.total - row.labourAmount;
      entry.expense += expAmt;
      entry.labourCharge += row.labourAmount;
      entry.total += row.total;

      const wKey = String(row.workerId && row.workerId !== 'unknown' ? row.workerId : (row.workerName || 'unknown'));
      if (!entry.workers.has(wKey)) {
        entry.workers.set(wKey, {
          workerId: row.workerId,
          workerName: row.workerName,
          workerEmployeeNo: row.workerEmployeeNo,
          labourCharge: 0,
          expense: 0,
          total: 0
        });
      }
      const wEntry = entry.workers.get(wKey)!;
      wEntry.labourCharge += row.labourAmount;
      wEntry.expense += expAmt;
      wEntry.total += row.total;
    }

    const list = Array.from(batchMap.values()).map(b => ({
      ...b,
      workerList: Array.from(b.workers.values()).sort((a, b) => a.workerName.localeCompare(b.workerName))
    })).sort((a, b) => a.section.localeCompare(b.section));

    const grandLabour = list.reduce((s, x) => s + x.labourCharge, 0);
    const grandExpense = list.reduce((s, x) => s + x.expense, 0);
    const grandTotal = list.reduce((s, x) => s + x.total, 0);

    return { list, grandLabour, grandExpense, grandTotal };
  }, [structuredRows, dynamicLedgerBatches]);

  // Consolidated User Payout Data for Tab 1 (User & amount to be given to him)
  const consolidatedUserData = useMemo(() => {
    let uSl = 1;
    const list = workerGroupedRows.map(w => {
      const rawBundleIds = Array.from(new Set(w.rows.map(r => r.bundleId).filter(b => b && b !== '-' && b !== 'unknown')));
      const sortedBundleIds = rawBundleIds.sort((a, b) => {
        const numA = Number(String(a).replace(/^[^\d]*/, ''));
        const numB = Number(String(b).replace(/^[^\d]*/, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a).localeCompare(String(b));
      });
      const formattedBundleIds = sortedBundleIds.map(id => String(id).startsWith('#') ? String(id) : `${id}`);
      const bundleNumbersStr = formattedBundleIds.join(', ');
      const uniqueTickets = new Set(w.rows.map(r => r.ticketNo || r.expNo).filter(Boolean));
      return {
        sl: uSl++,
        workerId: w.workerId,
        workerName: w.workerName,
        workerEmployeeNo: w.workerEmployeeNo,
        bundleCount: sortedBundleIds.length,
        bundleIds: sortedBundleIds,
        bundleNumbersStr,
        ticketCount: uniqueTickets.size,
        locationCount: w.uniqueLocationsCount,
        totalAmount: w.totalAmount
      };
    });
    const grandTotal = list.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalTickets = list.reduce((sum, item) => sum + item.ticketCount, 0);
    const totalBundles = list.reduce((sum, item) => sum + item.bundleCount, 0);
    return { list, grandTotal, totalTickets, totalBundles };
  }, [workerGroupedRows]);

  // Professional Print Output Engine (Vector HTML Table Document)
  const handlePrintProfessionalReport = (targetTab?: 'userwise' | 'storewise' | 'consolidated') => {
    setIsCapturing(true);
    try {
      const isAllOrActiveTab = targetTab || activeTab;

      // 1. Build table headers HTML based on parent/child hierarchy
      let parentHeadersHtml = '';
      let subHeadersHtml = '';

      for (const cat of expenseColumnsHierarchy) {
        parentHeadersHtml += `<th colspan="${cat.children.length}" style="text-align:center;background:#e5e7eb;font-weight:700;border:1px solid #9ca3af;padding:5px 4px;text-transform:uppercase;font-size:10px;color:#111827;">${cat.parentName}</th>`;
        for (const child of cat.children) {
          subHeadersHtml += `<th style="text-align:right;background:#f3f4f6;font-weight:600;border:1px solid #9ca3af;padding:4px 5px;font-size:9.5px;color:#374151;">${child}</th>`;
        }
      }

      // Build Consolidated Table Rows HTML
      const totalSummaryWorkerRows = showWorkerDetailsInSummary
        ? consolidatedBatchData.list.reduce((sum, item) => sum + (item.workerList?.length || 0), 0)
        : 0;
      const totalSummaryRows = consolidatedBatchData.list.length + totalSummaryWorkerRows;
      const isCompactSummary = totalSummaryRows > 18;
      const batchRowPad = isCompactSummary ? '3px 8px' : '5px 10px';
      const batchFontSize = isCompactSummary ? '9.5px' : '10.5px';
      const workerRowPad = isCompactSummary ? '2px 8px 2px 18px' : '3.5px 10px 3.5px 24px';
      const workerCellPad = isCompactSummary ? '2px 8px' : '3.5px 10px';
      const workerFontSize = isCompactSummary ? '8.5px' : '9.5px';

      let consolidatedRowsHtml = '';
      let cSl = 1;
      for (const item of consolidatedBatchData.list) {
        consolidatedRowsHtml += `
          <tr style="border:1px solid #d1d5db;background:#f9fafb;line-height:1.2;">
            <td style="text-align:center;padding:${batchRowPad};border:1px solid #d1d5db;font-size:${batchFontSize};font-weight:700;color:#4b5563;">${cSl++}</td>
            <td style="padding:${batchRowPad};border:1px solid #d1d5db;font-size:${batchFontSize};font-weight:700;color:#111827;">${item.section}</td>
            <td style="text-align:right;padding:${batchRowPad};border:1px solid #d1d5db;font-size:${batchFontSize};font-weight:700;color:#1f2937;">${item.labourCharge > 0 ? `KD ${item.labourCharge.toFixed(3)}` : '-'}</td>
            <td style="text-align:right;padding:${batchRowPad};border:1px solid #d1d5db;font-size:${batchFontSize};font-weight:700;color:#1f2937;">KD ${item.expense.toFixed(3)}</td>
            <td style="text-align:right;padding:${batchRowPad};border:1px solid #d1d5db;font-size:${batchFontSize};font-weight:800;color:#065f46;background:#ecfdf5;">KD ${item.total.toFixed(3)}</td>
          </tr>
        `;

        if (showWorkerDetailsInSummary && item.workerList && item.workerList.length > 0) {
          for (const w of item.workerList) {
            consolidatedRowsHtml += `
              <tr style="border:1px solid #e5e7eb;background:#ffffff;line-height:1.15;">
                <td style="text-align:center;padding:${workerCellPad};border:1px solid #e5e7eb;font-size:8.5px;color:#9ca3af;">•</td>
                <td style="padding:${workerRowPad};border:1px solid #e5e7eb;font-size:${workerFontSize};color:#1e40af;font-weight:600;">
                  ▸ ${w.workerName} ${w.workerEmployeeNo ? `<span style="font-size:8px;color:#6b7280;font-weight:normal;">(${w.workerEmployeeNo})</span>` : ''}
                </td>
                <td style="text-align:right;padding:${workerCellPad};border:1px solid #e5e7eb;font-size:${workerFontSize};color:#374151;">
                  ${w.labourCharge > 0 ? `KD ${w.labourCharge.toFixed(3)}` : '-'}
                </td>
                <td style="text-align:right;padding:${workerCellPad};border:1px solid #e5e7eb;font-size:${workerFontSize};color:#374151;">
                  ${w.expense > 0 ? `KD ${w.expense.toFixed(3)}` : '-'}
                </td>
                <td style="text-align:right;padding:${workerCellPad};border:1px solid #e5e7eb;font-size:${workerFontSize};font-weight:600;color:#065f46;">
                  KD ${w.total.toFixed(3)}
                </td>
              </tr>
            `;
          }
        }
      }
      consolidatedRowsHtml += `
        <tr style="background:#e5e7eb;font-weight:800;border:2px solid #111827;line-height:1.2;">
          <td colspan="2" style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};font-size:${isCompactSummary ? '10px' : '11px'};color:#111827;border:1.5px solid #374151;text-transform:uppercase;">GRAND TOTAL:</td>
          <td style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1.5px solid #374151;font-size:${isCompactSummary ? '10px' : '11px'};font-weight:800;color:#111827;">${consolidatedBatchData.grandLabour > 0 ? `KD ${consolidatedBatchData.grandLabour.toFixed(3)}` : '-'}</td>
          <td style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1.5px solid #374151;font-size:${isCompactSummary ? '10px' : '11px'};font-weight:800;color:#111827;">KD ${consolidatedBatchData.grandExpense.toFixed(3)}</td>
          <td style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1.5px solid #374151;font-size:${isCompactSummary ? '10.5px' : '11.5px'};font-weight:900;color:#064e3b;background:#a7f3d0;">KD ${consolidatedBatchData.grandTotal.toFixed(3)}</td>
        </tr>
      `;

      // Build Consolidated User Payout Rows HTML
      let consolidatedUserRowsHtml = '';
      let cuSl = 1;
      for (const item of consolidatedUserData.list) {
        consolidatedUserRowsHtml += `
          <tr style="border:1px solid #d1d5db;">
            <td style="text-align:center;padding:7px 8px;border:1px solid #d1d5db;font-size:10.5px;color:#4b5563;">${cuSl++}</td>
            <td style="padding:7px 12px;border:1px solid #d1d5db;font-size:11px;font-weight:700;color:#111827;">
              ${item.workerName} ${item.workerEmployeeNo ? `<span style="font-weight:normal;color:#6b7280;font-size:10px;">(${item.workerEmployeeNo})</span>` : ''}
            </td>
            <td style="text-align:center;padding:7px 8px;border:1px solid #d1d5db;font-size:11px;color:#1f2937;">
              ${item.bundleCount} ${item.bundleNumbersStr ? `<span style="font-size:10px;color:#4b5563;font-weight:600;">(${item.bundleNumbersStr})</span>` : ''}
            </td>
            <td style="text-align:center;padding:7px 8px;border:1px solid #d1d5db;font-size:11px;color:#1f2937;">${item.ticketCount}</td>
            <td style="text-align:center;padding:7px 8px;border:1px solid #d1d5db;font-size:11px;color:#1f2937;">${item.locationCount}</td>
            <td style="text-align:right;padding:7px 14px;border:1px solid #d1d5db;font-size:11.5px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${item.totalAmount.toFixed(3)}</td>
            <td style="text-align:center;padding:7px 8px;border:1px solid #d1d5db;vertical-align:bottom;">
              <div style="border-bottom:1.5px solid #6b7280;width:80%;margin:0 auto 4px auto;height:16px;"></div>
            </td>
          </tr>
        `;
      }
      consolidatedUserRowsHtml += `
        <tr style="background:#e5e7eb;font-weight:800;border:2px solid #111827;">
          <td colspan="2" style="text-align:right;padding:9px 12px;font-size:12px;color:#111827;border:1.5px solid #374151;text-transform:uppercase;">GRAND TOTAL:</td>
          <td style="text-align:center;padding:9px 8px;border:1.5px solid #374151;font-size:11.5px;font-weight:800;color:#111827;">${consolidatedUserData.totalBundles}</td>
          <td style="text-align:center;padding:9px 8px;border:1.5px solid #374151;font-size:11.5px;font-weight:800;color:#111827;">${consolidatedUserData.totalTickets}</td>
          <td style="text-align:center;padding:9px 8px;border:1.5px solid #374151;font-size:11.5px;font-weight:800;color:#111827;">${userwiseGrandTotals.uniqueLocationsCount}</td>
          <td style="text-align:right;padding:9px 14px;border:1.5px solid #374151;font-size:13px;font-weight:900;color:#064e3b;background:#a7f3d0;">KD ${consolidatedUserData.grandTotal.toFixed(3)}</td>
          <td style="border:1.5px solid #374151;background:#e5e7eb;"></td>
        </tr>
      `;

      // Build Userwise Rows HTML
      let userwiseRowsHtml = '';
      let globalSl = 1;
      const userLeadingSpan = groupByLocation ? 5 : 7;
      const userTotalSpan = userLeadingSpan + allChildExpenseColumns.length + 1;

      for (const groupRow of workerGroupedRows) {
        userwiseRowsHtml += `
          <tr style="background:#eef2ff;font-weight:700;border:1px solid #9ca3af;">
            <td colspan="${userTotalSpan}" style="padding:6px 8px;font-size:11px;color:#1e3a8a;border:1px solid #9ca3af;">
              👷 ${groupRow.workerName} ${groupRow.workerEmployeeNo ? `(${groupRow.workerEmployeeNo})` : ''} 
              <span style="font-weight:normal;color:#4b5563;font-size:10px;margin-left:8px;">
                — ${groupRow.rows.length} Tickets | ${groupRow.uniqueLocationsCount} Locations | Subtotal: KD ${groupRow.totalAmount.toFixed(3)}
              </span>
            </td>
          </tr>
        `;

        if (groupByLocation) {
          for (const locRow of groupRow.locationRows) {
            let expCols = '';
            for (const c of allChildExpenseColumns) {
              const val = locRow.amountsByType[c] || 0;
              expCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #d1d5db;font-size:9.5px;color:${val > 0 ? '#111827' : '#9ca3af'};">${val > 0 ? val.toFixed(3) : '-'}</td>`;
            }

            userwiseRowsHtml += `
              <tr style="border:1px solid #d1d5db;">
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${globalSl++}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#1e40af;line-height:1.35;white-space:nowrap;">${locRow.ticketLines && locRow.ticketLines.length > 0 ? locRow.ticketLines.join('<br />') : (locRow.expNoStr || '-')}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:700;color:#111827;">${locRow.location}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${locRow.subDeptStr || '-'}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#111827;">${locRow.summary}</td>
                ${expCols}
                <td style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${locRow.total.toFixed(3)}</td>
              </tr>
            `;
          }
        } else {
          for (const row of groupRow.rows) {
            let expCols = '';
            for (const c of allChildExpenseColumns) {
              const val = row.amountsByType[c] || 0;
              expCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #d1d5db;font-size:9.5px;color:${val > 0 ? '#111827' : '#9ca3af'};">${val > 0 ? val.toFixed(3) : '-'}</td>`;
            }

            userwiseRowsHtml += `
              <tr style="border:1px solid #d1d5db;">
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${globalSl++}</td>
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#1e40af;">${row.bundleId}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:500;">
                  ${row.expNo}${row.expenseIds?.[0] && String(row.expNo) !== `EXP-${row.expenseIds[0]}` ? `<br/><span style="font-size:8.5px;color:#6b7280;">(EXP-${row.expenseIds[0]})</span>` : ''}
                </td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#111827;">${row.location}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${row.subDepartment}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#111827;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.issueTitle}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${row.ledgerBatch}</td>
                ${expCols}
                <td style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${row.total.toFixed(3)}</td>
              </tr>
            `;
          }
        }

        let subtotalCols = '';
        for (const c of allChildExpenseColumns) {
          const sum = groupRow.subtotalByType[c] || 0;
          subtotalCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #9ca3af;font-size:9.5px;font-weight:700;color:#1f2937;">${sum > 0 ? sum.toFixed(3) : '-'}</td>`;
        }

        userwiseRowsHtml += `
          <tr style="background:#f3f4f6;font-weight:700;border:1px solid #9ca3af;">
            <td colspan="${userLeadingSpan}" style="text-align:right;padding:5px 8px;font-size:10px;color:#1f2937;border:1px solid #9ca3af;">
              Subtotal (${groupRow.workerName}):
            </td>
            ${subtotalCols}
            <td style="text-align:right;padding:5px 6px;border:1px solid #9ca3af;font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;">KD ${groupRow.totalAmount.toFixed(3)}</td>
          </tr>
        `;
      }

      let grandCols = '';
      for (const c of allChildExpenseColumns) {
        const sum = userwiseGrandTotals.colTotals[c] || 0;
        grandCols += `<td style="text-align:right;padding:6px 5px;border:1.5px solid #374151;font-size:10px;font-weight:800;color:#111827;">${sum.toFixed(3)}</td>`;
      }

      userwiseRowsHtml += `
        <tr style="background:#e5e7eb;font-weight:800;border:2px solid #111827;">
          <td colspan="${userLeadingSpan}" style="text-align:right;padding:7px 8px;font-size:11px;color:#111827;border:1.5px solid #374151;text-transform:uppercase;letter-spacing:0.5px;">
            GRAND TOTAL (${new Set(structuredRows.map(r => r.ticketNo || r.expNo).filter(Boolean)).size} Tickets / ${userwiseGrandTotals.uniqueLocationsCount} Locations):
          </td>
          ${grandCols}
          <td style="text-align:right;padding:7px 6px;border:1.5px solid #374151;font-size:11.5px;font-weight:900;color:#064e3b;background:#a7f3d0;">KD ${userwiseGrandTotals.grandTotal.toFixed(3)}</td>
        </tr>
      `;

      // 7-Tier Signatures Block HTML (Verify By MEngg before Verify By Engg)
      const signaturesHtml = `
        <div class="signatures">
          <div class="sign-box">
            <strong>Prepared By</strong>
            <span>${group.createdByName || 'Site Accountant'}</span>
          </div>
          <div class="sign-box">
            <strong>Verify By MEngg</strong>
            <span>Maintenance Engineer</span>
          </div>
          <div class="sign-box">
            <strong>Verify By Engg</strong>
            <span>Project / Site Engineer</span>
          </div>
          <div class="sign-box">
            <strong>Accountant</strong>
            <span>Accounts Dept</span>
          </div>
          <div class="sign-box">
            <strong>Audit</strong>
            <span>Internal Audit</span>
          </div>
          <div class="sign-box">
            <strong>Finance</strong>
            <span>Finance Manager</span>
          </div>
          <div class="sign-box">
            <strong>CEO / CCOO / Director</strong>
            <span>${group.completedByName || 'Executive Approval'}</span>
          </div>
        </div>
      `;

      const reportTitle = isAllOrActiveTab === 'userwise'
        ? 'Worker-wise Settlement'
        : 'Expenses by Location';

      const getHeaderHtml = (subtitle: string, customTitle?: string, showLogo: boolean = false) => `
        <div class="report-header">
          ${showLogo ? `
          <div class="report-header-logo">
            <img src="${window.location.origin}/document_logo.png" onerror="this.onerror=null;this.src='/document_logo.png';" alt="Logo" />
          </div>
          ` : ''}
          <div>
            <h1 class="report-title">${customTitle || reportTitle}</h1>
            <p class="report-subtitle">${subtitle}</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;font-weight:700;color:#111827;">${currentGroupName}</div>
            <div style="font-size:10px;color:#6b7280;">Ledger : ${group.groupId} | Date: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
      `;

      const metaGridHtml = `
        <div class="meta-grid">
          <div class="meta-item">
            <span>TOTAL SETTLEMENT</span>
            <strong style="color:#065f46;font-size:12px;">KD ${userwiseGrandTotals.grandTotal.toFixed(3)}</strong>
          </div>
          <div class="meta-item">
            <span>TOTAL TECHNICIANS</span>
            <strong>${workerGroupedRows.length} Workers</strong>
          </div>
          <div class="meta-item">
            <span>LOCATIONS COVERED</span>
            <strong>${userwiseGrandTotals.uniqueLocationsCount} Locations</strong>
          </div>
          <div class="meta-item">
            <span>${storeReportGrouping === 'store_type' && isAllOrActiveTab !== 'userwise' ? 'STORE TYPES' : 'LEDGER BATCHES'}</span>
            <strong>${storeReportGrouping === 'store_type' && isAllOrActiveTab !== 'userwise' ? `${dynamicStoreTypes.length} Store Types` : `${dynamicLedgerBatches.length} Batches (${group.approvedCount}/${group.totalCount} Approved)`}</strong>
          </div>
        </div>
      `;

      // Build Storewise Batch Pages HTML (Each Ledger Batch starts on a dedicated new page)
      let storewiseBatchPagesHtml = '';
      const totalColSpan = (groupByLocation ? 5 : 7) + allChildExpenseColumns.length + 1;
      const leadingColSpan = groupByLocation ? 5 : 7;

      storewiseByBatch.forEach((batch, batchIndex) => {
        const isLastBatch = batchIndex === storewiseByBatch.length - 1;
        let batchRowsHtml = '';

        if (groupByLocation) {
          let sl = 1;
          for (const locRow of batch.locationRows) {
            let expCols = '';
            for (const c of allChildExpenseColumns) {
              const val = locRow.amountsByType[c] || 0;
              expCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #d1d5db;font-size:9.5px;color:${val > 0 ? '#111827' : '#9ca3af'};">${val > 0 ? val.toFixed(3) : '-'}</td>`;
            }

            batchRowsHtml += `
              <tr style="border:1px solid #d1d5db;">
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${sl++}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#1e40af;line-height:1.35;white-space:nowrap;">${locRow.ticketLines && locRow.ticketLines.length > 0 ? locRow.ticketLines.join('<br />') : (locRow.expNoStr || '-')}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:700;color:#111827;">${locRow.location}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${locRow.subDeptStr || '-'}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#111827;">${locRow.summary}</td>
                ${expCols}
                <td style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${locRow.total.toFixed(3)}</td>
              </tr>
            `;
          }
        } else {
          let sl = 1;
          for (const row of batch.rows) {
            let expCols = '';
            for (const c of allChildExpenseColumns) {
              const val = row.amountsByType[c] || 0;
              expCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #d1d5db;font-size:9.5px;color:${val > 0 ? '#111827' : '#9ca3af'};">${val > 0 ? val.toFixed(3) : '-'}</td>`;
            }

            batchRowsHtml += `
              <tr style="border:1px solid #d1d5db;">
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${sl++}</td>
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#1e40af;">${row.bundleId}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:500;">${row.expNo}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#111827;">${row.location}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${row.subDepartment}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#111827;">${row.issueTitle}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${row.ledgerGroup}</td>
                ${expCols}
                <td style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${row.total.toFixed(3)}</td>
              </tr>
            `;
          }
        }

        let subtotalCols = '';
        for (const c of allChildExpenseColumns) {
          const sum = batch.subtotalByType[c] || 0;
          subtotalCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #9ca3af;font-size:9.5px;font-weight:700;color:#1f2937;">${sum > 0 ? sum.toFixed(3) : '-'}</td>`;
        }

        const subtotalRowHtml = `
          <tr style="background:#f3f4f6;font-weight:700;border:1px solid #9ca3af;">
            <td colspan="${leadingColSpan}" style="text-align:right;padding:5px 8px;font-size:10px;color:#1f2937;border:1px solid #9ca3af;">
              Batch Subtotal (${batch.batchName}):
            </td>
            ${subtotalCols}
            <td style="text-align:right;padding:5px 6px;border:1px solid #9ca3af;font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;">KD ${batch.batchTotal.toFixed(3)}</td>
          </tr>
        `;

        const grandTotalRowHtml = isLastBatch ? `
          <tr style="background:#e5e7eb;font-weight:800;border:2px solid #111827;">
            <td colspan="${leadingColSpan}" style="text-align:right;padding:7px 8px;font-size:11px;color:#111827;border:1.5px solid #374151;text-transform:uppercase;">
              GRAND TOTAL (ALL LEDGER BATCHES):
            </td>
            ${grandCols}
            <td style="text-align:right;padding:7px 6px;border:1.5px solid #374151;font-size:11.5px;font-weight:900;color:#064e3b;background:#a7f3d0;">KD ${userwiseGrandTotals.grandTotal.toFixed(3)}</td>
          </tr>
        ` : '';

        storewiseBatchPagesHtml += `
          <!-- LEDGER BATCH PAGE: ${batch.batchName} -->
          <div class="print-page batch-page" style="page-break-before: always; break-before: page; padding-top: 12px;">
            ${getHeaderHtml(`Sub-Department Wise Detailed — ${batch.batchName}`, undefined, false)}
            <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#fff;border:1px solid #9ca3af;">
              <thead>
                <tr style="background:#e5e7eb;border:1px solid #9ca3af;">
                  ${groupByLocation ? `
                    <th rowspan="2" style="width:35px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">SL</th>
                    <th rowspan="2" style="width:140px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">TICKET -NO</th>
                    <th rowspan="2" style="width:115px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LOCATION</th>
                    <th rowspan="2" style="width:95px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">SUB DEPT</th>
                    <th rowspan="2" style="text-align:left;border:1px solid #9ca3af;padding:6px 6px;font-size:10px;font-weight:700;color:#111827;">SUMMARY[Exp]</th>
                  ` : `
                    <th rowspan="2" style="width:35px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">SL</th>
                    <th rowspan="2" style="width:55px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">BUNDLE</th>
                    <th rowspan="2" style="width:70px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">TICKET -NO</th>
                    <th rowspan="2" style="width:100px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LOCATION</th>
                    <th rowspan="2" style="width:90px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">SUB DEPT</th>
                    <th rowspan="2" style="text-align:left;border:1px solid #9ca3af;padding:6px 6px;font-size:10px;font-weight:700;color:#111827;">ISSUE TITLE</th>
                    <th rowspan="2" style="width:85px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LEDGER BATCH</th>
                  `}
                  ${parentHeadersHtml}
                  <th rowspan="2" style="width:75px;text-align:right;border:1px solid #9ca3af;padding:6px 6px;font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;">TOTAL</th>
                </tr>
                <tr>
                  ${subHeadersHtml}
                </tr>
              </thead>
              <tbody>
                <tr style="background:#e0e7ff;font-weight:700;border:1px solid #9ca3af;">
                  <td colspan="${totalColSpan}" style="padding:6px 8px;font-size:11px;color:#1e3a8a;border:1px solid #9ca3af;">
                    🔹 LEDGER BATCH: ${batch.batchName} 
                    <span style="font-weight:normal;color:#4b5563;font-size:10px;margin-left:8px;">
                      — ${batch.rows.length} Tickets | Subtotal: KD ${batch.batchTotal.toFixed(3)}
                    </span>
                  </td>
                </tr>
                ${batchRowsHtml}
                ${subtotalRowHtml}
                ${grandTotalRowHtml}
              </tbody>
            </table>
          </div>
        `;
      });

      // Build Storewise Store Type Pages HTML (Each Store Type starts on a dedicated new page)
      let storewiseStoreTypePagesHtml = '';
      storewiseByStoreType.forEach((typeGroup, typeIndex) => {
        const isLastType = typeIndex === storewiseByStoreType.length - 1;
        let typeRowsHtml = '';

        if (groupByLocation) {
          let sl = 1;
          for (const locRow of typeGroup.locationRows) {
            let expCols = '';
            for (const c of allChildExpenseColumns) {
              const val = locRow.amountsByType[c] || 0;
              expCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #d1d5db;font-size:9.5px;color:${val > 0 ? '#111827' : '#9ca3af'};">${val > 0 ? val.toFixed(3) : '-'}</td>`;
            }

            typeRowsHtml += `
              <tr style="border:1px solid #d1d5db;">
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${sl++}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#1e40af;line-height:1.35;white-space:nowrap;">${locRow.ticketLines && locRow.ticketLines.length > 0 ? locRow.ticketLines.join('<br />') : (locRow.expNoStr || '-')}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:700;color:#111827;">${locRow.location}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${locRow.subDeptStr || '-'}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#111827;">${locRow.summary}</td>
                ${expCols}
                <td style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${locRow.total.toFixed(3)}</td>
              </tr>
            `;
          }
        } else {
          let sl = 1;
          for (const row of typeGroup.rows) {
            let expCols = '';
            for (const c of allChildExpenseColumns) {
              const val = row.amountsByType[c] || 0;
              expCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #d1d5db;font-size:9.5px;color:${val > 0 ? '#111827' : '#9ca3af'};">${val > 0 ? val.toFixed(3) : '-'}</td>`;
            }

            typeRowsHtml += `
              <tr style="border:1px solid #d1d5db;">
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${sl++}</td>
                <td style="text-align:center;padding:4px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#1e40af;">${row.bundleId}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:500;">${row.expNo}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;font-weight:600;color:#111827;">${row.location}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${row.subDepartment}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#111827;">${row.issueTitle}</td>
                <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:9.5px;color:#4b5563;">${row.ledgerBatch}</td>
                ${expCols}
                <td style="text-align:right;padding:4px 6px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;">KD ${row.total.toFixed(3)}</td>
              </tr>
            `;
          }
        }

        let subtotalCols = '';
        for (const c of allChildExpenseColumns) {
          const sum = typeGroup.subtotalByType[c] || 0;
          subtotalCols += `<td style="text-align:right;padding:4px 5px;border:1px solid #9ca3af;font-size:9.5px;font-weight:700;color:#1f2937;">${sum > 0 ? sum.toFixed(3) : '-'}</td>`;
        }

        const subtotalRowHtml = `
          <tr style="background:#f3f4f6;font-weight:700;border:1px solid #9ca3af;">
            <td colspan="${leadingColSpan}" style="text-align:right;padding:5px 8px;font-size:10px;color:#1f2937;border:1px solid #9ca3af;">
              Store Type Subtotal (${typeGroup.typeName}):
            </td>
            ${subtotalCols}
            <td style="text-align:right;padding:5px 6px;border:1px solid #9ca3af;font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;">KD ${typeGroup.typeTotal.toFixed(3)}</td>
          </tr>
        `;

        const grandTotalRowHtml = isLastType ? `
          <tr style="background:#e5e7eb;font-weight:800;border:2px solid #111827;">
            <td colspan="${leadingColSpan}" style="text-align:right;padding:7px 8px;font-size:11px;color:#111827;border:1.5px solid #374151;text-transform:uppercase;">
              GRAND TOTAL (ALL STORE TYPES):
            </td>
            ${grandCols}
            <td style="text-align:right;padding:7px 6px;border:1.5px solid #374151;font-size:11.5px;font-weight:900;color:#064e3b;background:#a7f3d0;">KD ${userwiseGrandTotals.grandTotal.toFixed(3)}</td>
          </tr>
        ` : '';

        storewiseStoreTypePagesHtml += `
          <!-- STORE TYPE PAGE: ${typeGroup.typeName} -->
          <div class="print-page batch-page" style="page-break-before: always; break-before: page; padding-top: 12px;">
            ${getHeaderHtml(`Store Type Wise Detailed — ${typeGroup.typeName}`, undefined, false)}
            <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#fff;border:1px solid #9ca3af;">
              <thead>
                <tr style="background:#e5e7eb;border:1px solid #9ca3af;">
                  ${groupByLocation ? `
                    <th rowspan="2" style="width:35px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">SL</th>
                    <th rowspan="2" style="width:140px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">TICKET -NO</th>
                    <th rowspan="2" style="width:115px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LOCATION</th>
                    <th rowspan="2" style="width:95px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">SUB DEPT</th>
                    <th rowspan="2" style="text-align:left;border:1px solid #9ca3af;padding:6px 6px;font-size:10px;font-weight:700;color:#111827;">SUMMARY[Exp]</th>
                  ` : `
                    <th rowspan="2" style="width:35px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">SL</th>
                    <th rowspan="2" style="width:55px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">BUNDLE</th>
                    <th rowspan="2" style="width:70px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">TICKET -NO</th>
                    <th rowspan="2" style="width:100px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LOCATION</th>
                    <th rowspan="2" style="width:90px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">SUB DEPT</th>
                    <th rowspan="2" style="text-align:left;border:1px solid #9ca3af;padding:6px 6px;font-size:10px;font-weight:700;color:#111827;">ISSUE TITLE</th>
                    <th rowspan="2" style="width:85px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LEDGER BATCH</th>
                  `}
                  ${parentHeadersHtml}
                  <th rowspan="2" style="width:75px;text-align:right;border:1px solid #9ca3af;padding:6px 6px;font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;">TOTAL</th>
                </tr>
                <tr>
                  ${subHeadersHtml}
                </tr>
              </thead>
              <tbody>
                <tr style="background:#e0e7ff;font-weight:700;border:1px solid #9ca3af;">
                  <td colspan="${totalColSpan}" style="padding:6px 8px;font-size:11px;color:#1e3a8a;border:1px solid #9ca3af;">
                    🔹 STORE TYPE: ${typeGroup.typeName} 
                    <span style="font-weight:normal;color:#4b5563;font-size:10px;margin-left:8px;">
                      — ${typeGroup.rows.length} Tickets | Subtotal: KD ${typeGroup.typeTotal.toFixed(3)}
                    </span>
                  </td>
                </tr>
                ${typeRowsHtml}
                ${subtotalRowHtml}
                ${grandTotalRowHtml}
              </tbody>
            </table>
          </div>
        `;
      });

      // Build Store Type Summary Rows HTML
      let consolidatedStoreTypeRowsHtml = '';
      let stSl = 1;
      for (const item of consolidatedStoreTypeData.list) {
        consolidatedStoreTypeRowsHtml += `
          <tr style="border:1px solid #d1d5db;background:#f9fafb;line-height:1.2;">
            <td style="text-align:center;padding:5px 8px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#4b5563;">${stSl++}</td>
            <td style="padding:5px 10px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#111827;">${item.section}</td>
            <td style="text-align:center;padding:5px 8px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#1f2937;">${item.locationsCount}</td>
            <td style="text-align:right;padding:5px 10px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#1f2937;">${item.labourCharge > 0 ? `KD ${item.labourCharge.toFixed(3)}` : '-'}</td>
            <td style="text-align:right;padding:5px 10px;border:1px solid #d1d5db;font-size:10px;font-weight:700;color:#1f2937;">KD ${item.expense.toFixed(3)}</td>
            <td style="text-align:right;padding:5px 10px;border:1px solid #d1d5db;font-size:10px;font-weight:800;color:#065f46;background:#ecfdf5;">KD ${item.total.toFixed(3)}</td>
          </tr>
        `;
      }
      consolidatedStoreTypeRowsHtml += `
        <tr style="background:#e5e7eb;font-weight:800;border:2px solid #111827;line-height:1.2;">
          <td colspan="2" style="text-align:right;padding:6px 10px;font-size:10.5px;color:#111827;border:1.5px solid #374151;text-transform:uppercase;">GRAND TOTAL:</td>
          <td style="text-align:center;padding:6px 8px;border:1.5px solid #374151;font-size:10.5px;font-weight:800;color:#111827;">${consolidatedStoreTypeData.totalLocations}</td>
          <td style="text-align:right;padding:6px 10px;border:1.5px solid #374151;font-size:10.5px;font-weight:800;color:#111827;">${consolidatedStoreTypeData.grandLabour > 0 ? `KD ${consolidatedStoreTypeData.grandLabour.toFixed(3)}` : '-'}</td>
          <td style="text-align:right;padding:6px 10px;border:1.5px solid #374151;font-size:10.5px;font-weight:800;color:#111827;">KD ${consolidatedStoreTypeData.grandExpense.toFixed(3)}</td>
          <td style="text-align:right;padding:6px 10px;border:1.5px solid #374151;font-size:11px;font-weight:900;color:#064e3b;background:#a7f3d0;">KD ${consolidatedStoreTypeData.grandTotal.toFixed(3)}</td>
        </tr>
      `;

      // Build Main Printable Content
      let mainBodyHtml = '';
      if (isAllOrActiveTab === 'userwise') {
        const includeSummary = showWorkerSummary || (!showWorkerSummary && !showWorkerDetailed);
        const includeDetailed = showWorkerDetailed;

        const summaryPageHtml = includeSummary ? `
          <div class="print-page first-page" style="page-break-after: ${includeDetailed ? 'always' : 'auto'}; break-after: ${includeDetailed ? 'page' : 'auto'}; box-sizing: border-box; min-height: ${isVerticalOrientation ? '276mm' : '185mm'}; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${getHeaderHtml('Worker Summary Report', undefined, true)}
              ${metaGridHtml}
              <div style="margin-top:16px;">
                <table style="width:100%;border-collapse:collapse;background:#fff;border:1.5px solid #374151;">
                  <thead>
                    <tr style="background:#e5e7eb;border:1.5px solid #374151;">
                      <th style="width:45px;text-align:center;padding:8px 6px;border:1px solid #9ca3af;font-size:11px;font-weight:700;color:#111827;">SL</th>
                      <th style="text-align:left;padding:8px 12px;border:1px solid #9ca3af;font-size:11px;font-weight:700;color:#111827;">TECHNICIAN / USER</th>
                      <th style="width:90px;text-align:center;padding:8px 8px;border:1px solid #9ca3af;font-size:11px;font-weight:700;color:#111827;">BUNDLES</th>
                      <th style="width:90px;text-align:center;padding:8px 8px;border:1px solid #9ca3af;font-size:11px;font-weight:700;color:#111827;">TICKETS</th>
                      <th style="width:100px;text-align:center;padding:8px 8px;border:1px solid #9ca3af;font-size:11px;font-weight:700;color:#111827;">LOCATIONS</th>
                      <th style="width:160px;text-align:right;padding:8px 14px;border:1px solid #9ca3af;font-size:11.5px;font-weight:800;color:#065f46;background:#d1fae5;">AMOUNT TO BE GIVEN</th>
                      <th style="width:110px;text-align:center;padding:8px 8px;border:1px solid #9ca3af;font-size:11px;font-weight:700;color:#111827;">PAID</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${consolidatedUserRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ` : '';

        const detailedPageHtml = includeDetailed ? `
          <div class="print-page batch-page second-page">
            ${getHeaderHtml('Worker Wise Detailed Statement', undefined, !includeSummary)}
            ${metaGridHtml}
            <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#fff;border:1px solid #9ca3af;">
              <thead>
                <tr style="background:#e5e7eb;border:1px solid #9ca3af;">
                  ${groupByLocation ? `
                    <th rowspan="2" style="width:35px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">SL</th>
                    <th rowspan="2" style="width:140px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">TICKET -NO</th>
                    <th rowspan="2" style="width:115px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LOCATION</th>
                    <th rowspan="2" style="width:95px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">SUB DEPT</th>
                    <th rowspan="2" style="text-align:left;border:1px solid #9ca3af;padding:6px 6px;font-size:10px;font-weight:700;color:#111827;">SUMMARY[Exp]</th>
                  ` : `
                    <th rowspan="2" style="width:35px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">SL</th>
                    <th rowspan="2" style="width:55px;text-align:center;border:1px solid #9ca3af;padding:6px 4px;font-size:10px;font-weight:700;color:#111827;">BUNDLE</th>
                    <th rowspan="2" style="width:70px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">TICKET -NO</th>
                    <th rowspan="2" style="width:100px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LOCATION</th>
                    <th rowspan="2" style="width:90px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">SUB DEPT</th>
                    <th rowspan="2" style="text-align:left;border:1px solid #9ca3af;padding:6px 6px;font-size:10px;font-weight:700;color:#111827;">ISSUE TITLE</th>
                    <th rowspan="2" style="width:85px;text-align:left;border:1px solid #9ca3af;padding:6px 5px;font-size:10px;font-weight:700;color:#111827;">LEDGER BATCH</th>
                  `}
                  ${parentHeadersHtml}
                  <th rowspan="2" style="width:75px;text-align:right;border:1px solid #9ca3af;padding:6px 6px;font-size:10.5px;font-weight:800;color:#065f46;background:#d1fae5;">TOTAL</th>
                </tr>
                <tr>
                  ${subHeadersHtml}
                </tr>
              </thead>
              <tbody>
                ${userwiseRowsHtml}
              </tbody>
            </table>
          </div>
        ` : '';

        mainBodyHtml = summaryPageHtml + detailedPageHtml;
      } else if (storeReportGrouping === 'store_type') {
        // STORE TYPE GROUPED REPORT:
        // Page 1 is Store Type Summary Statement + Signatures
        // Each subsequent page is a dedicated Store Type page
        mainBodyHtml = `
          <!-- PAGE 1: Store Type Summary Statement -->
          <div class="print-page first-page" style="page-break-after: always; break-after: page; box-sizing: border-box; min-height: ${isVerticalOrientation ? '276mm' : '185mm'}; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${getHeaderHtml('Store Type Wise Summary', undefined, true)}
              ${metaGridHtml}
              <div style="margin-top:12px;">
                <table class="summary-table" style="width:100%;border-collapse:collapse;background:#fff;border:1.5px solid #374151;">
                  <thead>
                    <tr style="background:#e5e7eb;border:1.5px solid #374151;">
                      <th style="width:50px;text-align:center;padding:6px 6px;border:1px solid #9ca3af;font-size:10px;font-weight:700;color:#111827;">SL</th>
                      <th style="text-align:left;padding:6px 10px;border:1px solid #9ca3af;font-size:10px;font-weight:700;color:#111827;">STORE TYPE</th>
                      <th style="width:80px;text-align:center;padding:6px 8px;border:1px solid #9ca3af;font-size:10px;font-weight:700;color:#111827;">STORES</th>
                      <th style="text-align:right;padding:6px 10px;border:1px solid #9ca3af;font-size:10px;font-weight:700;color:#111827;">LABOUR CHARGE</th>
                      <th style="text-align:right;padding:6px 10px;border:1px solid #9ca3af;font-size:10px;font-weight:700;color:#111827;">EXPENSE</th>
                      <th style="text-align:right;padding:6px 10px;border:1px solid #9ca3af;font-size:10px;font-weight:800;color:#065f46;background:#d1fae5;">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${consolidatedStoreTypeRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
            ${signaturesHtml}
          </div>

          ${storewiseStoreTypePagesHtml}
        `;
      } else {
        // STOREWISE / CONSOLIDATED MERGED TAB:
        // Page 1 is Consolidated Financial Settlement Report + Signatures
        // Each subsequent page is a dedicated Ledger Batch page (Store & Department Expense Statement)
        mainBodyHtml = `
          <!-- PAGE 1: Consolidated Financial Settlement Report -->
          <div class="print-page first-page" style="page-break-after: always; break-after: page; box-sizing: border-box; min-height: ${isVerticalOrientation ? '276mm' : '185mm'}; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${getHeaderHtml('Sub-Department Wise Summery', undefined, true)}
              ${metaGridHtml}
              <div style="margin-top:${isCompactSummary ? '8px' : '12px'};">
                <table class="summary-table" style="width:100%;border-collapse:collapse;background:#fff;border:1.5px solid #374151;">
                  <thead>
                    <tr style="background:#e5e7eb;border:1.5px solid #374151;">
                      <th style="width:50px;text-align:center;padding:${isCompactSummary ? '4px 6px' : '6px 6px'};border:1px solid #9ca3af;font-size:${isCompactSummary ? '9.5px' : '10.5px'};font-weight:700;color:#111827;">SL</th>
                      <th style="text-align:left;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1px solid #9ca3af;font-size:${isCompactSummary ? '9.5px' : '10.5px'};font-weight:700;color:#111827;">SECTION (LEDGER BATCH)</th>
                      <th style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1px solid #9ca3af;font-size:${isCompactSummary ? '9.5px' : '10.5px'};font-weight:700;color:#111827;">LABOUR CHARGE</th>
                      <th style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1px solid #9ca3af;font-size:${isCompactSummary ? '9.5px' : '10.5px'};font-weight:700;color:#111827;">EXPENSE</th>
                      <th style="text-align:right;padding:${isCompactSummary ? '4px 8px' : '6px 10px'};border:1px solid #9ca3af;font-size:${isCompactSummary ? '9.5px' : '10.5px'};font-weight:800;color:#065f46;background:#d1fae5;">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${consolidatedRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
            ${signaturesHtml}
          </div>

          ${storewiseBatchPagesHtml}
        `;
      }

      // 4. Construct Full Printable Document
      const printDoc = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${reportTitle} - ${currentGroupName}</title>
            <meta charset="utf-8" />
            <base href="${window.location.origin}/" />
            <style>
              @page {
                size: ${isVerticalOrientation ? 'portrait' : 'landscape'};
                margin: ${isVerticalOrientation ? '8mm 6mm 8mm 6mm' : '10mm 8mm 10mm 8mm'};
              }
              *, *:before, *:after {
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
                color: #111827;
                background: #ffffff;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              ${isVerticalOrientation ? `
                .batch-page table {
                  font-size: 8.5px !important;
                }
                .batch-page th, .batch-page td {
                  padding: 3px 2.5px !important;
                }
              ` : ''}
              .report-header {
                position: relative;
                border-bottom: 2px solid #111827;
                padding-bottom: ${isCompactSummary ? '7px' : '10px'};
                margin-bottom: ${isCompactSummary ? '8px' : '12px'};
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
              }
              .report-header-logo {
                position: absolute;
                left: 50%;
                bottom: 2px;
                transform: translateX(-50%);
                pointer-events: none;
                display: flex;
                align-items: flex-end;
                justify-content: center;
              }
              .report-header-logo img {
                height: ${isCompactSummary ? '52px' : '64px'};
                width: auto;
                max-width: 160px;
                object-fit: contain;
                display: block;
              }
              .report-title {
                font-size: 18px;
                font-weight: 800;
                color: #111827;
                letter-spacing: -0.3px;
                text-transform: uppercase;
                margin: 0 0 4px 0;
              }
              .report-subtitle {
                font-size: 11px;
                color: #4b5563;
                margin: 0;
              }
              .meta-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: ${isCompactSummary ? '6px 10px' : '8px 12px'};
                margin-bottom: ${isCompactSummary ? '8px' : '14px'};
              }
              .meta-item {
                font-size: 10px;
              }
              .meta-item span {
                color: #6b7280;
                display: block;
                font-weight: 500;
              }
              .meta-item strong {
                color: #111827;
                font-size: 11px;
                font-weight: 700;
              }
              thead {
                display: table-header-group;
              }
              tr {
                page-break-inside: avoid;
              }
              .signatures {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                page-break-inside: avoid;
                break-inside: avoid;
                padding-top: 24px;
              }
              .first-page {
                box-sizing: border-box;
                height: auto;
                min-height: ${isVerticalOrientation ? '276mm' : '185mm'};
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                page-break-after: always;
                break-after: page;
              }
              .first-page.multi-page {
                display: block !important;
                min-height: 0 !important;
                page-break-inside: auto !important;
                break-inside: auto !important;
              }
              .first-page .signatures {
                margin-top: auto;
                padding-top: 24px;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              .batch-page {
                box-sizing: border-box;
                page-break-before: always;
                break-before: page;
              }
              .sign-box {
                flex: 1;
                text-align: center;
                border-top: 1.5px solid #374151;
                padding-top: 4px;
                font-size: 8px;
                color: #374151;
              }
              .sign-box strong {
                display: block;
                font-size: 9px;
                color: #111827;
                font-weight: 700;
                margin-bottom: 2px;
                text-transform: uppercase;
              }
              .sign-box span {
                display: block;
                font-size: 7.5px;
                color: #6b7280;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 0;
                }
                .first-page:not(.multi-page) {
                  box-sizing: border-box !important;
                  height: auto !important;
                  min-height: ${isVerticalOrientation ? '276mm' : '185mm'} !important;
                  display: flex !important;
                  flex-direction: column !important;
                  justify-content: space-between !important;
                  page-break-after: always !important;
                  break-after: page !important;
                }
                .first-page:not(.multi-page) .signatures {
                  margin-top: auto !important;
                  padding-top: 24px !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
                .second-page {
                  padding-top: 4px;
                }
                .batch-page {
                  page-break-before: always !important;
                  break-before: page !important;
                  padding-top: 4px;
                }
              }
            </style>
          </head>
          <body>
            ${mainBodyHtml}
            <script>
              (function() {
                function alignFirstPageSignatures() {
                  var firstPage = document.querySelector('.first-page');
                  if (!firstPage) return;
                  var sig = firstPage.querySelector('.signatures');
                  if (!sig) return;
                  var topWrap = firstPage.firstElementChild;
                  if (!topWrap || topWrap === sig) return;

                  firstPage.classList.remove('multi-page');
                  sig.style.removeProperty('margin-top');

                  var pxPerMm = 3.779527559;
                  var isPortrait = ${isVerticalOrientation ? 'true' : 'false'};
                  var pageHeightPx = (isPortrait ? 276 : 185) * pxPerMm;

                  var topH = topWrap.offsetHeight;
                  var sigH = sig.offsetHeight || 52;

                  if (topH + sigH + 8 <= pageHeightPx) {
                    firstPage.classList.remove('multi-page');
                    sig.style.setProperty('margin-top', 'auto', 'important');
                  } else {
                    firstPage.classList.add('multi-page');
                    var headerEl = firstPage.querySelector('.report-header');
                    var metaEl = firstPage.querySelector('.meta-grid');
                    var tableEl = firstPage.querySelector('table');
                    var theadEl = tableEl ? tableEl.querySelector('thead') : null;
                    var rows = tableEl ? Array.prototype.slice.call(tableEl.querySelectorAll('tbody > tr')) : [];

                    var theadH = theadEl ? theadEl.offsetHeight : 26;
                    var usedPx = (headerEl ? headerEl.offsetHeight + 10 : 0) + (metaEl ? metaEl.offsetHeight + 10 : 0) + 10 + theadH;

                    for (var i = 0; i < rows.length; i++) {
                      var rH = rows[i].offsetHeight;
                      if (usedPx + rH > pageHeightPx) {
                        usedPx = theadH + rH;
                      } else {
                        usedPx += rH;
                      }
                    }

                    if (usedPx + sigH + 16 > pageHeightPx) {
                      usedPx = 0;
                    }

                    var fillerPx = Math.max(20, Math.floor(pageHeightPx - usedPx - sigH - 8));
                    sig.style.setProperty('margin-top', fillerPx + 'px', 'important');
                  }
                }

                window.addEventListener('load', alignFirstPageSignatures);
                window.addEventListener('beforeprint', alignFirstPageSignatures);
                alignFirstPageSignatures();
              })();
            </script>
          </body>
        </html>
      `;

      // Use properly sized off-screen iframe so modern browsers render the document layout before printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-10000px';
      iframe.style.top = '0';
      iframe.style.width = isVerticalOrientation ? '794px' : '1024px';
      iframe.style.height = isVerticalOrientation ? '1123px' : '768px';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const win = iframe.contentWindow;
      if (win) {
        win.document.open();
        win.document.write(printDoc);
        win.document.close();

        let isPrinted = false;
        const triggerPrint = () => {
          if (isPrinted) return;
          isPrinted = true;
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.error('Error invoking print dialog on iframe:', e);
            // Fallback to popup window if iframe print was blocked
            const popup = window.open('', '_blank');
            if (popup) {
              popup.document.open();
              popup.document.write(printDoc);
              popup.document.close();
              setTimeout(() => {
                popup.focus();
                popup.print();
              }, 250);
            }
          } finally {
            win.onafterprint = () => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            };
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 60000);
          }
        };

        if (win.document.readyState === 'complete') {
          setTimeout(triggerPrint, 250);
        } else {
          win.onload = () => setTimeout(triggerPrint, 250);
        }
      }
    } catch (err) {
      console.error('Failed to print professional report:', err);
      window.print();
    } finally {
      setIsCapturing(false);
    }
  };

  // High-Resolution Professional Vector PDF Export via jsPDF & autoTable
  const handleDownloadPdf = async (targetTab?: 'userwise' | 'storewise' | 'consolidated') => {
    setIsCapturing(true);
    try {
      const isTargetTab = targetTab || activeTab;
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF(isVerticalOrientation ? 'p' : 'l', 'mm', 'a4');
      const pageWidth = isVerticalOrientation ? 210 : 297;
      const pageHeight = isVerticalOrientation ? 297 : 210;

      // Header Section
      const pdfMainTitle = isTargetTab === 'userwise'
        ? 'WORKER SETTLEMENT (FOR CASH OFFICE)'
        : 'LOCATION-WISE EXPENSE (FOR ACCOUNTS)';

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text(pdfMainTitle, 14, 14);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(75, 85, 99);
      doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   Generated: ${new Date().toLocaleDateString()}   |   Status: ${group.isCompleted ? 'Completed' : 'Pending Approval'}`, 14, 20);

      // Summary Metric Box
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(14, 23, pageWidth - 28, 12, 1.5, 1.5, 'F');
      doc.setFontSize(8.5);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text(`Grand Total: KD ${userwiseGrandTotals.grandTotal.toFixed(3)}`, 18, 30.5);
      doc.setFont('helvetica', 'normal');
      if (isVerticalOrientation) {
        doc.setFontSize(7.5);
        doc.text(`Techs: ${workerGroupedRows.length} | Locs: ${userwiseGrandTotals.uniqueLocationsCount} | Batches: ${dynamicLedgerBatches.length} | Tickets: ${structuredRows.length}`, 88, 30.5);
      } else {
        doc.text(`Technicians: ${workerGroupedRows.length}   |   Locations: ${userwiseGrandTotals.uniqueLocationsCount}   |   Batches: ${dynamicLedgerBatches.length}   |   Tickets: ${structuredRows.length}`, 95, 30.5);
      }

      if (isTargetTab === 'storewise') {
        if (storeReportGrouping === 'store_type') {
          // --- PAGE 1: CONSOLIDATED STORE TYPE STATEMENT ---
          const head1 = [['SL', 'Store Type', 'Stores', 'Labour Charge', 'Expense', 'Total']];
          const body1: any[] = [];
          let cSl = 1;
          for (const item of consolidatedStoreTypeData.list) {
            body1.push([
              cSl++,
              item.section,
              item.locationsCount,
              item.labourCharge > 0 ? `KD ${item.labourCharge.toFixed(3)}` : '-',
              `KD ${item.expense.toFixed(3)}`,
              `KD ${item.total.toFixed(3)}`
            ]);
          }
          body1.push([
            { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: String(consolidatedStoreTypeData.totalLocations), styles: { fontStyle: 'bold', halign: 'center', fillColor: [229, 231, 235] } },
            { content: consolidatedStoreTypeData.grandLabour > 0 ? `KD ${consolidatedStoreTypeData.grandLabour.toFixed(3)}` : '-', styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: `KD ${consolidatedStoreTypeData.grandExpense.toFixed(3)}`, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: `KD ${consolidatedStoreTypeData.grandTotal.toFixed(3)}`, styles: { fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } }
          ]);

          autoTable(doc, {
            startY: 38,
            head: head1,
            body: body1,
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8.5 },
            columnStyles: {
              0: { cellWidth: 15, halign: 'center' },
              1: { cellWidth: 80, fontStyle: 'bold' },
              2: { cellWidth: 25, halign: 'center' },
              3: { cellWidth: 40, halign: 'right' },
              4: { cellWidth: 40, halign: 'right' },
              5: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: 14, right: 14 }
          });

          // 7-Tier Signatures on Page 1
          const signHead = [['Prepared By', 'Verify By MEngg', 'Verify By Engg', 'Accountant', 'Audit', 'Finance', 'CEO / CCOO / Director']];
          const signBody = [
            [
              `\n\n___________________\n${group.createdByName || 'Site Accountant'}`,
              '\n\n___________________\nMaintenance Engineer',
              '\n\n___________________\nProject Engineer',
              '\n\n___________________\nAccounts Dept',
              '\n\n___________________\nInternal Audit',
              '\n\n___________________\nFinance Manager',
              `\n\n___________________\n${group.completedByName || 'Executive Approval'}`
            ]
          ];

          const finalTableY = (doc as any).lastAutoTable?.finalY || 100;
          const targetBottomSigY = pageHeight - 28;
          let sigStartY = targetBottomSigY;
          if (finalTableY + 6 > targetBottomSigY) {
            doc.addPage();
            sigStartY = targetBottomSigY;
          }

          autoTable(doc, {
            startY: sigStartY,
            head: signHead,
            body: signBody,
            theme: 'plain',
            headStyles: { fontStyle: 'bold', fontSize: 7, halign: 'center', textColor: [17, 24, 39], fillColor: [243, 244, 246] },
            bodyStyles: { fontSize: 6.5, halign: 'center', textColor: [75, 85, 99], cellPadding: 1 },
            margin: { left: 14, right: 14, bottom: 6 },
            pageBreak: 'avoid'
          });

          // --- PAGE 2+: STORE TYPE DETAILED STATEMENTS ---
          doc.addPage();
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(17, 24, 39);
          doc.text('WEEKLY EXPENSE PAYOUT & SETTLEMENT REPORT', 14, 14);

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(75, 85, 99);
          doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   Store Type Expense Statement`, 14, 20);

          const headerRow1: any[] = groupByLocation ? [
            { content: 'SL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'TICKET -NO', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'LOCATION', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUB DEPT', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUMMARY', rowSpan: 2, styles: { valign: 'middle' } }
          ] : [
            { content: 'SL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'BUNDLE', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'TICKET -NO', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'LOCATION', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUB DEPT', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'ISSUE TITLE', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'BATCH', rowSpan: 2, styles: { valign: 'middle' } }
          ];

          for (const cat of expenseColumnsHierarchy) {
            headerRow1.push({
              content: cat.parentName,
              colSpan: cat.children.length,
              styles: { halign: 'center', fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' }
            });
          }
          headerRow1.push({ content: 'TOTAL', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });

          const headerRow2: any[] = [];
          for (const cat of expenseColumnsHierarchy) {
            for (const child of cat.children) {
              headerRow2.push({ content: child, styles: { halign: 'right', fontSize: 7.5 } });
            }
          }
          const head2 = [headerRow1, headerRow2];

          storewiseByStoreType.forEach((typeGroup, typeIndex) => {
            if (typeIndex > 0) {
              doc.addPage();
              doc.setFontSize(14);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(17, 24, 39);
              doc.text('WEEKLY EXPENSE PAYOUT & SETTLEMENT REPORT', 14, 14);

              doc.setFontSize(9);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(75, 85, 99);
              doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   Store Type Detailed — ${typeGroup.typeName}`, 14, 20);
            } else {
              doc.setFillColor(255, 255, 255);
              doc.rect(14, 16, 260, 6, 'F');
              doc.setFontSize(9);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(75, 85, 99);
              doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   Store Type Detailed — ${typeGroup.typeName}`, 14, 20);
            }

            const isLastType = typeIndex === storewiseByStoreType.length - 1;
            const typeBody: any[] = [];

            if (groupByLocation) {
              typeBody.push([
                {
                  content: `🔹 STORE TYPE: ${typeGroup.typeName} — ${typeGroup.rows.length} Tickets | Subtotal: KD ${typeGroup.typeTotal.toFixed(3)}`,
                  colSpan: 5 + allChildExpenseColumns.length + 1,
                  styles: { fillColor: [224, 231, 255], fontStyle: 'bold', textColor: [30, 58, 138] }
                }
              ]);

              let sl = 1;
              for (const locRow of typeGroup.locationRows) {
                const rowData: any[] = [
                  sl++,
                  locRow.ticketLinesText || locRow.expNoStr,
                  locRow.location,
                  locRow.subDeptStr || '-',
                  locRow.summary
                ];
                for (const c of allChildExpenseColumns) {
                  const val = locRow.amountsByType[c] || 0;
                  rowData.push(val > 0 ? val.toFixed(3) : '-');
                }
                rowData.push(`KD ${locRow.total.toFixed(3)}`);
                typeBody.push(rowData);
              }

              const subtotalRow: any[] = [
                { content: `Store Type Subtotal (${typeGroup.typeName}):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } }
              ];
              for (const c of allChildExpenseColumns) {
                const sum = typeGroup.subtotalByType[c] || 0;
                subtotalRow.push({ content: sum > 0 ? sum.toFixed(3) : '-', styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } });
              }
              subtotalRow.push({ content: `KD ${typeGroup.typeTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });
              typeBody.push(subtotalRow);

              if (isLastType) {
                const grandTotalRow: any[] = [
                  { content: 'GRAND TOTAL (ALL STORE TYPES):', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } }
                ];
                for (const c of allChildExpenseColumns) {
                  const sum = userwiseGrandTotals.colTotals[c] || 0;
                  grandTotalRow.push({ content: sum.toFixed(3), styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } });
                }
                grandTotalRow.push({ content: `KD ${userwiseGrandTotals.grandTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } });
                typeBody.push(grandTotalRow);
              }
            } else {
              typeBody.push([
                {
                  content: `🔹 STORE TYPE: ${typeGroup.typeName} — ${typeGroup.rows.length} Tickets | Subtotal: KD ${typeGroup.typeTotal.toFixed(3)}`,
                  colSpan: 7 + allChildExpenseColumns.length + 1,
                  styles: { fillColor: [224, 231, 255], fontStyle: 'bold', textColor: [30, 58, 138] }
                }
              ]);

              let sl = 1;
              for (const row of typeGroup.rows) {
                const rowTicketDisplay = row.expenseIds?.[0] && String(row.expNo) !== `EXP-${row.expenseIds[0]}`
                  ? `${row.expNo} (EXP-${row.expenseIds[0]})`
                  : row.expNo;
                const rowData: any[] = [
                  sl++,
                  `${row.bundleId}`,
                  rowTicketDisplay,
                  row.location,
                  row.subDepartment,
                  row.issueTitle,
                  row.ledgerBatch
                ];
                for (const c of allChildExpenseColumns) {
                  const val = row.amountsByType[c] || 0;
                  rowData.push(val > 0 ? val.toFixed(3) : '-');
                }
                rowData.push(`KD ${row.total.toFixed(3)}`);
                typeBody.push(rowData);
              }

              const subtotalRow: any[] = [
                { content: `Store Type Subtotal (${typeGroup.typeName}):`, colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } }
              ];
              for (const c of allChildExpenseColumns) {
                const sum = typeGroup.subtotalByType[c] || 0;
                subtotalRow.push({ content: sum > 0 ? sum.toFixed(3) : '-', styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } });
              }
              subtotalRow.push({ content: `KD ${typeGroup.typeTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });
              typeBody.push(subtotalRow);

              if (isLastType) {
                const grandTotalRow: any[] = [
                  { content: 'GRAND TOTAL (ALL STORE TYPES):', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } }
                ];
                for (const c of allChildExpenseColumns) {
                  const sum = userwiseGrandTotals.colTotals[c] || 0;
                  grandTotalRow.push({ content: sum.toFixed(3), styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } });
                }
                grandTotalRow.push({ content: `KD ${userwiseGrandTotals.grandTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } });
                typeBody.push(grandTotalRow);
              }
            }

            autoTable(doc, {
              startY: 28,
              head: head2,
              body: typeBody,
              theme: 'grid',
              headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: isVerticalOrientation ? 6.5 : 7.5 },
              bodyStyles: { fontSize: isVerticalOrientation ? 6 : 7, cellPadding: isVerticalOrientation ? 1 : 1.5 },
              margin: { left: isVerticalOrientation ? 6 : 10, right: isVerticalOrientation ? 6 : 10 }
            });
          });
        } else {
          // --- PAGE 1: CONSOLIDATED FINANCIAL SETTLEMENT REPORT ---
          const head1 = [['SL', 'Section (Ledger Batch)', 'Labour Charge', 'Expense', 'Total']];
          const body1: any[] = [];
          let cSl = 1;
          for (const item of consolidatedBatchData.list) {
            body1.push([
              cSl++,
              item.section,
              item.labourCharge > 0 ? `KD ${item.labourCharge.toFixed(3)}` : '-',
              `KD ${item.expense.toFixed(3)}`,
              `KD ${item.total.toFixed(3)}`
            ]);

            if (showWorkerDetailsInSummary && item.workerList && item.workerList.length > 0) {
              for (const w of item.workerList) {
                body1.push([
                  '•',
                  `   ${w.workerName}${w.workerEmployeeNo ? ` (${w.workerEmployeeNo})` : ''}`,
                  w.labourCharge > 0 ? `KD ${w.labourCharge.toFixed(3)}` : '-',
                  w.expense > 0 ? `KD ${w.expense.toFixed(3)}` : '-',
                  `KD ${w.total.toFixed(3)}`
                ]);
              }
            }
          }
          body1.push([
            { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: consolidatedBatchData.grandLabour > 0 ? `KD ${consolidatedBatchData.grandLabour.toFixed(3)}` : '-', styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: `KD ${consolidatedBatchData.grandExpense.toFixed(3)}`, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: `KD ${consolidatedBatchData.grandTotal.toFixed(3)}`, styles: { fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } }
          ]);

          autoTable(doc, {
            startY: 38,
            head: head1,
            body: body1,
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8.5 },
            columnStyles: {
              0: { cellWidth: 15, halign: 'center' },
              1: { cellWidth: 95, fontStyle: 'bold' },
              2: { cellWidth: 45, halign: 'right' },
              3: { cellWidth: 45, halign: 'right' },
              4: { cellWidth: 48, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: 14, right: 14 }
          });

          // 7-Tier Signatures on Page 1
          const signHead = [['Prepared By', 'Verify By MEngg', 'Verify By Engg', 'Accountant', 'Audit', 'Finance', 'CEO / CCOO / Director']];
          const signBody = [
            [
              `\n\n___________________\n${group.createdByName || 'Site Accountant'}`,
              '\n\n___________________\nMaintenance Engineer',
              '\n\n___________________\nProject Engineer',
              '\n\n___________________\nAccounts Dept',
              '\n\n___________________\nInternal Audit',
              '\n\n___________________\nFinance Manager',
              `\n\n___________________\n${group.completedByName || 'Executive Approval'}`
            ]
          ];

          const finalTableY = (doc as any).lastAutoTable?.finalY || 100;
          const targetBottomSigY = pageHeight - 28;
          let sigStartY = targetBottomSigY;
          if (finalTableY + 6 > targetBottomSigY) {
            doc.addPage();
            sigStartY = targetBottomSigY;
          }

          autoTable(doc, {
            startY: sigStartY,
            head: signHead,
            body: signBody,
            theme: 'plain',
            headStyles: { fontStyle: 'bold', fontSize: 7, halign: 'center', textColor: [17, 24, 39], fillColor: [243, 244, 246] },
            bodyStyles: { fontSize: 6.5, halign: 'center', textColor: [75, 85, 99], cellPadding: 1 },
            margin: { left: 14, right: 14, bottom: 6 },
            pageBreak: 'avoid'
          });

          // --- PAGE 2: STORE & DEPARTMENT EXPENSE STATEMENT BY LEDGER BATCHES ---
          doc.addPage();
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(17, 24, 39);
          doc.text('WEEKLY EXPENSE PAYOUT & SETTLEMENT REPORT', 14, 14);

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(75, 85, 99);
          doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   ${groupByLocation ? `Store & Department Expense Statement by Location (${userwiseGrandTotals.uniqueLocationsCount} Locations)` : 'Store & Department Expense Statement by Ledger Batches'}`, 14, 20);

          const headerRow1: any[] = groupByLocation ? [
            { content: 'SL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'TICKET -NO', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'LOCATION', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUB DEPT', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUMMARY', rowSpan: 2, styles: { valign: 'middle' } }
          ] : [
            { content: 'SL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'BUNDLE', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'TICKET -NO', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'LOCATION', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUB DEPT', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'ISSUE TITLE', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'BATCH', rowSpan: 2, styles: { valign: 'middle' } }
          ];

          for (const cat of expenseColumnsHierarchy) {
            headerRow1.push({
              content: cat.parentName,
              colSpan: cat.children.length,
              styles: { halign: 'center', fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' }
            });
          }

          headerRow1.push({ content: 'TOTAL', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });

          const headerRow2: any[] = [];
          for (const cat of expenseColumnsHierarchy) {
            for (const child of cat.children) {
              headerRow2.push({ content: child, styles: { halign: 'right', fontSize: 7.5 } });
            }
          }

          const head2 = [headerRow1, headerRow2];

          storewiseByBatch.forEach((batch, batchIndex) => {
            if (batchIndex > 0) {
              doc.addPage();
              doc.setFontSize(14);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(17, 24, 39);
              doc.text('WEEKLY EXPENSE PAYOUT & SETTLEMENT REPORT', 14, 14);

              doc.setFontSize(9);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(75, 85, 99);
              doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   Sub-Department Wise Detailed — ${batch.batchName}`, 14, 20);
            } else {
              // Update subtitle on first batch page to include the batch name
              doc.setFillColor(255, 255, 255);
              doc.rect(14, 16, 260, 6, 'F');
              doc.setFontSize(9);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(75, 85, 99);
              doc.text(`Group: ${currentGroupName} (ID ${group.groupId})   |   Sub-Department Wise Detailed — ${batch.batchName}`, 14, 20);
            }

            const isLastBatch = batchIndex === storewiseByBatch.length - 1;
            const batchBody: any[] = [];

            if (groupByLocation) {
              batchBody.push([
                {
                  content: `🔹 LEDGER BATCH: ${batch.batchName} — ${batch.rows.length} Tickets | Subtotal: KD ${batch.batchTotal.toFixed(3)}`,
                  colSpan: 5 + allChildExpenseColumns.length + 1,
                  styles: { fillColor: [224, 231, 255], fontStyle: 'bold', textColor: [30, 58, 138] }
                }
              ]);

              let sl = 1;
              for (const locRow of batch.locationRows) {
                const rowData: any[] = [
                  sl++,
                  locRow.ticketLinesText || locRow.expNoStr,
                  locRow.location,
                  locRow.subDeptStr || '-',
                  locRow.summary
                ];
                for (const c of allChildExpenseColumns) {
                  const val = locRow.amountsByType[c] || 0;
                  rowData.push(val > 0 ? val.toFixed(3) : '-');
                }
                rowData.push(`KD ${locRow.total.toFixed(3)}`);
                batchBody.push(rowData);
              }

              const subtotalRow: any[] = [
                { content: `Batch Subtotal (${batch.batchName}):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } }
              ];
              for (const c of allChildExpenseColumns) {
                const sum = batch.subtotalByType[c] || 0;
                subtotalRow.push({ content: sum > 0 ? sum.toFixed(3) : '-', styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } });
              }
              subtotalRow.push({ content: `KD ${batch.batchTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });
              batchBody.push(subtotalRow);

              if (isLastBatch) {
                const grandTotalRow: any[] = [
                  { content: `GRAND TOTAL (ALL LEDGER BATCHES):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } }
                ];
                for (const c of allChildExpenseColumns) {
                  const sum = userwiseGrandTotals.colTotals[c] || 0;
                  grandTotalRow.push({ content: sum.toFixed(3), styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } });
                }
                grandTotalRow.push({ content: `KD ${userwiseGrandTotals.grandTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } });
                batchBody.push(grandTotalRow);
              }
            } else {
              batchBody.push([
                {
                  content: `🔹 LEDGER BATCH: ${batch.batchName} — ${batch.rows.length} Tickets | Subtotal: KD ${batch.batchTotal.toFixed(3)}`,
                  colSpan: 7 + allChildExpenseColumns.length + 1,
                  styles: { fillColor: [224, 231, 255], fontStyle: 'bold', textColor: [30, 58, 138] }
                }
              ]);

              let sl = 1;
              for (const row of batch.rows) {
                const rowData: any[] = [
                  sl++,
                  `${row.bundleId}`,
                  row.expNo,
                  row.location,
                  row.subDepartment,
                  row.issueTitle,
                  row.ledgerGroup
                ];
                for (const c of allChildExpenseColumns) {
                  const val = row.amountsByType[c] || 0;
                  rowData.push(val > 0 ? val.toFixed(3) : '-');
                }
                rowData.push(`KD ${row.total.toFixed(3)}`);
                batchBody.push(rowData);
              }

              const subtotalRow: any[] = [
                { content: `Batch Subtotal (${batch.batchName}):`, colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } }
              ];
              for (const c of allChildExpenseColumns) {
                const sum = batch.subtotalByType[c] || 0;
                subtotalRow.push({ content: sum > 0 ? sum.toFixed(3) : '-', styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } });
              }
              subtotalRow.push({ content: `KD ${batch.batchTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });
              batchBody.push(subtotalRow);

              if (isLastBatch) {
                const grandTotalRow: any[] = [
                  { content: 'GRAND TOTAL (ALL LEDGER BATCHES):', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } }
                ];
                for (const c of allChildExpenseColumns) {
                  const sum = userwiseGrandTotals.colTotals[c] || 0;
                  grandTotalRow.push({ content: sum.toFixed(3), styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } });
                }
                grandTotalRow.push({ content: `KD ${userwiseGrandTotals.grandTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } });
                batchBody.push(grandTotalRow);
              }
            }

            autoTable(doc, {
              startY: 28,
              head: head2,
              body: batchBody,
              theme: 'grid',
              headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: isVerticalOrientation ? 6.5 : 7.5 },
              bodyStyles: { fontSize: isVerticalOrientation ? 6 : 7, cellPadding: isVerticalOrientation ? 1 : 1.5 },
              margin: { left: isVerticalOrientation ? 6 : 10, right: isVerticalOrientation ? 6 : 10 }
            });
          });
        }
      } else {
        const includeSummary = showWorkerSummary || (!showWorkerSummary && !showWorkerDetailed);
        const includeDetailed = showWorkerDetailed;

        if (includeSummary) {
          // --- PAGE 1: CONSOLIDATED TECHNICIAN / USER PAYOUT STATEMENT ---
          const userSummaryHead = [['SL', 'Technician / User', 'Bundles', 'Tickets', 'Locations', 'Amount to be Given (KD)', 'Paid']];
          const userSummaryBody: any[] = [];
          let uSl = 1;
          for (const item of consolidatedUserData.list) {
            userSummaryBody.push([
              uSl++,
              `${item.workerName}${item.workerEmployeeNo ? ` (${item.workerEmployeeNo})` : ''}`,
              item.bundleNumbersStr ? `${item.bundleCount} (${item.bundleNumbersStr})` : item.bundleCount,
              item.ticketCount,
              item.locationCount,
              `KD ${item.totalAmount.toFixed(3)}`,
              '__________'
            ]);
          }
          userSummaryBody.push([
            { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } },
            { content: String(consolidatedUserData.totalBundles), styles: { fontStyle: 'bold', halign: 'center', fillColor: [229, 231, 235] } },
            { content: String(consolidatedUserData.totalTickets), styles: { fontStyle: 'bold', halign: 'center', fillColor: [229, 231, 235] } },
            { content: String(userwiseGrandTotals.uniqueLocationsCount), styles: { fontStyle: 'bold', halign: 'center', fillColor: [229, 231, 235] } },
            { content: `KD ${consolidatedUserData.grandTotal.toFixed(3)}`, styles: { fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } },
            { content: '', styles: { fillColor: [229, 231, 235] } }
          ]);

          autoTable(doc, {
            startY: 38,
            head: userSummaryHead,
            body: userSummaryBody,
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8.5 },
            columnStyles: {
              0: { cellWidth: 14, halign: 'center' },
              1: { cellWidth: 80, fontStyle: 'bold' },
              2: { cellWidth: 26, halign: 'center' },
              3: { cellWidth: 24, halign: 'center' },
              4: { cellWidth: 28, halign: 'center' },
              5: { cellWidth: 44, halign: 'right', fontStyle: 'bold' },
              6: { cellWidth: 32, halign: 'center', fontStyle: 'normal' }
            },
            margin: { left: 14, right: 14 }
          });
        }

        if (includeDetailed) {
          if (includeSummary) {
            // --- PAGE 2+: DETAILED USER-WISE STATEMENT ---
            doc.addPage();
          }

          // Header for Detailed Statement
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(17, 24, 39);
          doc.text('WORKER WISE DETAILED STATEMENT', 14, 14);

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(75, 85, 99);
          doc.text(`Group: ${currentGroupName}   |   Itemized Category Breakdown Statement`, 14, 20);

          // Multi-level Header for Userwise
          const headerRow1: any[] = groupByLocation ? [
            { content: 'SL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'TICKET -NO', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'LOCATION', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUB DEPT', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUMMARY', rowSpan: 2, styles: { valign: 'middle' } }
          ] : [
            { content: 'SL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'BUNDLE', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: 'TICKET -NO', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'LOCATION', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'SUB DEPT', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'ISSUE TITLE', rowSpan: 2, styles: { valign: 'middle' } },
            { content: 'BATCH', rowSpan: 2, styles: { valign: 'middle' } }
          ];

          for (const cat of expenseColumnsHierarchy) {
            headerRow1.push({
              content: cat.parentName,
              colSpan: cat.children.length,
              styles: { halign: 'center', fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' }
            });
          }

          headerRow1.push({ content: 'TOTAL', rowSpan: 2, styles: { halign: 'right', valign: 'middle', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });

          const headerRow2: any[] = [];
          for (const cat of expenseColumnsHierarchy) {
            for (const child of cat.children) {
              headerRow2.push({ content: child, styles: { halign: 'right', fontSize: 7.5 } });
            }
          }

          const head = [headerRow1, headerRow2];
          const body: any[] = [];
          const leadingColSpan = groupByLocation ? 5 : 7;

          let globalSl = 1;
          for (const workerGroup of workerGroupedRows) {
            const uniqueTkts = new Set(workerGroup.rows.map(r => r.ticketNo || r.expNo).filter(Boolean)).size;
            body.push([
              {
                content: `Worker: ${workerGroup.workerName} (${uniqueTkts} Tickets, ${workerGroup.uniqueLocationsCount} Locations) - Subtotal: KD ${workerGroup.totalAmount.toFixed(3)}`,
                colSpan: leadingColSpan + allChildExpenseColumns.length + 1,
                styles: { fillColor: [238, 242, 255], fontStyle: 'bold', textColor: [30, 58, 138] }
              }
            ]);

            if (groupByLocation) {
              for (const locRow of workerGroup.locationRows) {
                const rowData: any[] = [
                  globalSl++,
                  locRow.ticketLinesText || locRow.expNoStr,
                  locRow.location,
                  locRow.subDeptStr || '-',
                  locRow.summary
                ];
                for (const c of allChildExpenseColumns) {
                  const val = locRow.amountsByType[c] || 0;
                  rowData.push(val > 0 ? val.toFixed(3) : '-');
                }
                rowData.push(`KD ${locRow.total.toFixed(3)}`);
                body.push(rowData);
              }
            } else {
              for (const row of workerGroup.rows) {
                const rowTicketDisplay = row.expenseIds?.[0] && String(row.expNo) !== `EXP-${row.expenseIds[0]}`
                  ? `${row.expNo} (EXP-${row.expenseIds[0]})`
                  : row.expNo;
                const rowData: any[] = [
                  globalSl++,
                  `${row.bundleId}`,
                  rowTicketDisplay,
                  row.location,
                  row.subDepartment,
                  row.issueTitle,
                  row.ledgerBatch
                ];
                for (const c of allChildExpenseColumns) {
                  const val = row.amountsByType[c] || 0;
                  rowData.push(val > 0 ? val.toFixed(3) : '-');
                }
                rowData.push(`KD ${row.total.toFixed(3)}`);
                body.push(rowData);
              }
            }

            // Subtotal row
            const subtotalRow: any[] = [
              { content: `Subtotal (${workerGroup.workerName}):`, colSpan: leadingColSpan, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } }
            ];
            for (const c of allChildExpenseColumns) {
              const sum = workerGroup.subtotalByType[c] || 0;
              subtotalRow.push({ content: sum > 0 ? sum.toFixed(3) : '-', styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 244, 246] } });
            }
            subtotalRow.push({ content: `KD ${workerGroup.totalAmount.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [6, 95, 70] } });
            body.push(subtotalRow);
          }

          // Grand Total Row
          const grandTotalRow: any[] = [
            { content: 'GRAND TOTAL:', colSpan: leadingColSpan, styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } }
          ];
          for (const c of allChildExpenseColumns) {
            const sum = userwiseGrandTotals.colTotals[c] || 0;
            grandTotalRow.push({ content: sum.toFixed(3), styles: { halign: 'right', fontStyle: 'bold', fillColor: [229, 231, 235] } });
          }
          grandTotalRow.push({ content: `KD ${userwiseGrandTotals.grandTotal.toFixed(3)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [6, 78, 59] } });
          body.push(grandTotalRow);

          autoTable(doc, {
            startY: 26,
            head,
            body,
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: isVerticalOrientation ? 6.5 : 7.5 },
            bodyStyles: { fontSize: isVerticalOrientation ? 6 : 7, cellPadding: isVerticalOrientation ? 1 : 1.5 },
            margin: { left: isVerticalOrientation ? 6 : 10, right: isVerticalOrientation ? 6 : 10 }
          });
        }
      }

      // Add page numbering footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${i} of ${totalPages}   |   ${currentGroupName} Settlement Report`, 14, pageHeight - 6);
      }

      const fileName = `Weekly_Expense_Report_${currentGroupName.replace(/\s+/g, '_')}_${isTargetTab}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Failed to export vector PDF:', err);
      alert('Failed to generate PDF. Please check console.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Export Multi-Sheet Excel matching weekly.xlsx dynamically
  const handleExportMultiSheetExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // ==========================================
      // SHEET 1: Consolidated Financial Settlement Report (First Sheet)
      // ==========================================
      let s5Data: any[][];
      let s5SheetName = 'Consolidated Settlement';
      let s5Cols: any[] = [{ wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      let s5Merges: XLSX.Range[] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 3 } }];

      if (storeReportGrouping === 'store_type') {
        s5SheetName = 'Store Type Summary';
        s5Cols = [{ wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
        s5Merges = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 5 } }];
        s5Data = [
          ['', 'Store Type Expense Summary Report'],
          ['SL', 'Store Type', 'Stores Count', 'Labour Charge (KD)', 'Expense (KD)', 'Total Amount (KD)']
        ];

        consolidatedStoreTypeData.list.forEach((item, idx) => {
          s5Data.push([
            idx + 1,
            item.storeTypeLabel,
            item.storesCount,
            Number(item.labourCharge.toFixed(3)),
            Number(item.expense.toFixed(3)),
            Number(item.total.toFixed(3))
          ]);
        });

        s5Data.push([
          'GRAND TOTAL',
          '',
          consolidatedStoreTypeData.totalStoresCount,
          Number(consolidatedStoreTypeData.grandLabour.toFixed(3)),
          Number(consolidatedStoreTypeData.grandExpense.toFixed(3)),
          Number(consolidatedStoreTypeData.grandTotal.toFixed(3))
        ]);

        s5Data.push([]);
        s5Data.push(['SIGNATURES & APPROVALS:']);
        s5Data.push(['Prepared By', 'Verify By MEngg', 'Verify By Engg', 'Accountant', 'Audit', 'Finance', 'CEO / CCOO / Director']);
        s5Data.push([group.createdByName || 'Site Accountant', 'Maintenance Engineer', 'Project Engineer', 'Accounts Dept', 'Internal Audit', 'Finance Manager', group.completedByName || 'Executive Management']);
      } else {
        s5Data = [
          ['', 'Consolidated Financial Settlement Report'],
          ['Section', 'Labour Charge', 'Expense', 'Total']
        ];

        for (const item of consolidatedBatchData.list) {
          s5Data.push([
            item.section,
            Number(item.labourCharge.toFixed(3)),
            Number(item.expense.toFixed(3)),
            Number(item.total.toFixed(3))
          ]);

          if (showWorkerDetailsInSummary && item.workerList && item.workerList.length > 0) {
            for (const w of item.workerList) {
              s5Data.push([
                `    • ${w.workerName}${w.workerEmployeeNo ? ` (${w.workerEmployeeNo})` : ''}`,
                Number(w.labourCharge.toFixed(3)),
                Number(w.expense.toFixed(3)),
                Number(w.total.toFixed(3))
              ]);
            }
          }
        }

        s5Data.push([
          'GRAND TOTAL',
          Number(consolidatedBatchData.grandLabour.toFixed(3)),
          Number(consolidatedBatchData.grandExpense.toFixed(3)),
          Number(consolidatedBatchData.grandTotal.toFixed(3))
        ]);

        // Signatures row for Consolidated Sheet
        s5Data.push([]);
        s5Data.push(['SIGNATURES & APPROVALS:']);
        s5Data.push(['Prepared By', 'Verify By MEngg', 'Verify By Engg', 'Accountant', 'Audit', 'Finance', 'CEO / CCOO / Director']);
        s5Data.push([group.createdByName || 'Site Accountant', 'Maintenance Engineer', 'Project Engineer', 'Accounts Dept', 'Internal Audit', 'Finance Manager', group.completedByName || 'Executive Management']);
      }

      const ws5 = XLSX.utils.aoa_to_sheet(s5Data);
      ws5['!merges'] = s5Merges;
      ws5['!cols'] = s5Cols;
      XLSX.utils.book_append_sheet(wb, ws5, s5SheetName);

      // ==========================================
      // SHEET 2: Consolidated Technician Payout Summary
      // ==========================================
      const includeExcelSummary = showWorkerSummary || (!showWorkerSummary && !showWorkerDetailed);
      if (includeExcelSummary) {
        const sUserData: any[][] = [
          ['', 'Consolidated Technician Payout Statement (Executive Summary)'],
          ['SL', 'Technician / User', 'Employee ID', 'Bundles', 'Tickets', 'Locations', 'Amount to be Given (KD)', 'Paid']
        ];
        for (const item of consolidatedUserData.list) {
          sUserData.push([
            item.sl,
            item.workerName,
            item.workerEmployeeNo || '-',
            item.bundleNumbersStr ? `${item.bundleCount} (${item.bundleNumbersStr})` : item.bundleCount,
            item.ticketCount,
            item.locationCount,
            Number(item.totalAmount.toFixed(3)),
            ''
          ]);
        }
        sUserData.push([
          'GRAND TOTAL', '', '',
          consolidatedUserData.totalBundles,
          consolidatedUserData.totalTickets,
          userwiseGrandTotals.uniqueLocationsCount,
          Number(consolidatedUserData.grandTotal.toFixed(3)),
          ''
        ]);

        const wsUserSummary = XLSX.utils.aoa_to_sheet(sUserData);
        wsUserSummary['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsUserSummary, 'User Payout Summary');
      }

      // ==========================================
      // SHEET 3: Weekly Expance Payout Report userwise
      // ==========================================
      if (showWorkerDetailed) {
        const s1HeaderRow1: any[] = groupByLocation
          ? ['Worker', 'SL', 'TICKET -NO', 'LOCATION', 'SUB DEPARTMENT', 'SUMMARY']
          : ['Worker', 'SLNo', 'BUNDLE ID', 'TICKET -NO', 'LOCATION', 'SUB DEPARTMENT', 'ISSUE TITLE', 'Ledger Group'];
        const s1HeaderRow2: any[] = groupByLocation
          ? ['', '', '', '', '', '']
          : ['', '', '', '', '', '', '', ''];
        const s1LeadingCols = groupByLocation ? 6 : 8;

        const s1Merges: XLSX.Range[] = [
          { s: { r: 0, c: groupByLocation ? 4 : 6 }, e: { r: 0, c: (groupByLocation ? 4 : 6) + allChildExpenseColumns.length } },
          { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
          { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
          { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
          { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } },
          { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
        ];

        if (groupByLocation) {
          s1Merges.push({ s: { r: 2, c: 5 }, e: { r: 3, c: 5 } });
        } else {
          s1Merges.push(
            { s: { r: 2, c: 5 }, e: { r: 3, c: 5 } },
            { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } },
            { s: { r: 2, c: 7 }, e: { r: 3, c: 7 } },
          );
        }

        let colIdx = s1LeadingCols;
        for (const cat of expenseColumnsHierarchy) {
          const startC = colIdx;
          const endC = colIdx + cat.children.length - 1;
          s1HeaderRow1.push(cat.parentName);
          for (let i = 1; i < cat.children.length; i++) {
            s1HeaderRow1.push('');
          }
          for (const child of cat.children) {
            s1HeaderRow2.push(child);
          }
          if (endC > startC) {
            s1Merges.push({ s: { r: 2, c: startC }, e: { r: 2, c: endC } });
          }
          colIdx += cat.children.length;
        }
        s1HeaderRow1.push('TOTAL');
        s1HeaderRow2.push('');
        s1Merges.push({ s: { r: 2, c: colIdx }, e: { r: 3, c: colIdx } });

        const s1Data: any[][] = [
          ['report for maintenances', '', '', '', '', '', 'Weekly Expance Payout Worker Report'],
          [],
          s1HeaderRow1,
          s1HeaderRow2
        ];

        let currentSheet1Row = 4;
        let globalSlNo = 1;

        for (const wGroup of workerGroupedRows) {
          const startWorkerRow = currentSheet1Row;

          if (groupByLocation) {
            wGroup.locationRows.forEach((loc, rIdx) => {
              const rowData: any[] = [
                rIdx === 0 ? wGroup.workerName : '',
                globalSlNo++,
                loc.ticketLinesText || loc.expNoStr,
                loc.location,
                loc.subDeptStr || '-',
                loc.summary
              ];

              for (const colName of allChildExpenseColumns) {
                const amt = loc.amountsByType[colName];
                rowData.push(amt !== undefined && amt > 0 ? Number(amt.toFixed(3)) : '-');
              }
              rowData.push(Number(loc.total.toFixed(3)));
              s1Data.push(rowData);
              currentSheet1Row++;
            });

            if (wGroup.locationRows.length > 1) {
              s1Merges.push({ s: { r: startWorkerRow, c: 0 }, e: { r: currentSheet1Row - 1, c: 0 } });
            }

            // Worker Subtotal Row
            const subtotalRow: any[] = [
              '',
              '',
              'Subtotal',
              `${wGroup.locationRows.length} Locations (${new Set(wGroup.rows.map(r => r.ticketNo || r.expNo).filter(Boolean)).size} Tickets)`,
              '',
              ''
            ];
            for (const colName of allChildExpenseColumns) {
              const sAmt = wGroup.subtotalByType[colName] || 0;
              subtotalRow.push(sAmt > 0 ? Number(sAmt.toFixed(3)) : '-');
            }
            subtotalRow.push(Number(wGroup.totalAmount.toFixed(3)));
            s1Data.push(subtotalRow);
            currentSheet1Row++;
          } else {
            wGroup.rows.forEach((row, rIdx) => {
              const rowTicketDisplay = row.expenseIds?.[0] && String(row.expNo) !== `EXP-${row.expenseIds[0]}`
                ? `${row.expNo} (EXP-${row.expenseIds[0]})`
                : row.expNo;
              const rowData: any[] = [
                rIdx === 0 ? wGroup.workerName : '',
                globalSlNo++,
                row.bundleId,
                rowTicketDisplay,
                row.location,
                row.subDepartment,
                row.issueTitle,
                row.ledgerBatch
              ];

              for (const colName of allChildExpenseColumns) {
                const amt = row.amountsByType[colName];
                rowData.push(amt !== undefined && amt > 0 ? Number(amt.toFixed(3)) : '-');
              }
              rowData.push(Number(row.total.toFixed(3)));
              s1Data.push(rowData);
              currentSheet1Row++;
            });

            if (wGroup.rows.length > 1) {
              s1Merges.push({ s: { r: startWorkerRow, c: 0 }, e: { r: currentSheet1Row - 1, c: 0 } });
            }

            // Worker Subtotal Row
            const subtotalRow: any[] = [
              '',
              '',
              '',
              '',
              `${wGroup.uniqueLocationsCount} Locations (${new Set(wGroup.rows.map(r => r.ticketNo || r.expNo).filter(Boolean)).size} Tickets, ${wGroup.rows.length} Expenses)`,
              '',
              '',
              ''
            ];
            for (const colName of allChildExpenseColumns) {
              const sAmt = wGroup.subtotalByType[colName] || 0;
              subtotalRow.push(sAmt > 0 ? Number(sAmt.toFixed(3)) : '-');
            }
            subtotalRow.push(Number(wGroup.totalAmount.toFixed(3)));
            s1Data.push(subtotalRow);
            currentSheet1Row++;
          }
        }

        // Grand Total Row
        const grandTotalRow: any[] = groupByLocation
          ? [
            'GRAND TOTAL',
            '',
            '',
            `${userwiseGrandTotals.uniqueLocationsCount} Locations (${structuredRows.length} Tickets)`,
            '',
            ''
          ]
          : [
            'GRAND TOTAL',
            '',
            '',
            '',
            `${userwiseGrandTotals.uniqueLocationsCount} Locations`,
            '',
            '',
            ''
          ];
        for (const colName of allChildExpenseColumns) {
          const gAmt = userwiseGrandTotals.colTotals[colName] || 0;
          grandTotalRow.push(gAmt > 0 ? Number(gAmt.toFixed(3)) : '-');
        }
        grandTotalRow.push(Number(userwiseGrandTotals.grandTotal.toFixed(3)));
        s1Data.push(grandTotalRow);

        // Signatures row for Sheet 1
        s1Data.push([]);
        s1Data.push(['SIGNATURES & APPROVALS:']);
        s1Data.push(['Prepared By', 'Verify By MEngg', 'Verify By Engg', 'Accountant', 'Audit', 'Finance', 'CEO / CCOO / Director']);
        s1Data.push([group.createdByName || 'Site Accountant', 'Maintenance Engineer', 'Project Engineer', 'Accounts Dept', 'Internal Audit', 'Finance Manager', group.completedByName || 'Executive Management']);

        const ws1 = XLSX.utils.aoa_to_sheet(s1Data);
        ws1['!merges'] = s1Merges;
        ws1['!cols'] = groupByLocation
          ? [
            { wch: 18 }, { wch: 8 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 28 },
            ...allChildExpenseColumns.map(() => ({ wch: 14 })),
            { wch: 14 }
          ]
          : [
            { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
            { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 22 },
            ...allChildExpenseColumns.map(() => ({ wch: 14 })),
            { wch: 14 }
          ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Userwise Payout');
      }

      // =========================================================
      // SHEETS 2, 3, 4...: DYNAMIC LEDGER BATCHES OR STORE TYPES (Store-wise)
      // =========================================================
      if (storeReportGrouping === 'store_type') {
        const typesToExport = dynamicStoreTypes.length > 0 ? dynamicStoreTypes : ['Other'];

        typesToExport.forEach((typeName) => {
          const typeRows = structuredRows.filter(r => (r.storeTypeLabel || '').trim().toLowerCase() === typeName.trim().toLowerCase());
          if (typeRows.length === 0) return;
          const cleanSheetTitle = typeName.slice(0, 31).replace(/[:\\\/\?\*\[\]]/g, '_');
          const sHeaderRow1: any[] = ['SLNO', 'BUNDLE ID', 'TICKET -NO', 'LOCATION', 'SUB DEPARTMENT', 'Issue Title(Consolidation)', 'Store Type'];
          const sHeaderRow2: any[] = ['', '', '', '', '', '', ''];
          const sMerges: XLSX.Range[] = [
            { s: { r: 1, c: 3 }, e: { r: 1, c: 6 } },
            { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
            { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
            { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } },
            { s: { r: 3, c: 3 }, e: { r: 4, c: 3 } },
            { s: { r: 3, c: 4 }, e: { r: 4, c: 4 } },
            { s: { r: 3, c: 5 }, e: { r: 4, c: 5 } },
            { s: { r: 3, c: 6 }, e: { r: 4, c: 6 } },
          ];

          let sColIdx = 7;
          for (const cat of expenseColumnsHierarchy) {
            const startC = sColIdx;
            const endC = sColIdx + cat.children.length - 1;
            sHeaderRow1.push(cat.parentName);
            for (let i = 1; i < cat.children.length; i++) {
              sHeaderRow1.push('');
            }
            for (const child of cat.children) {
              sHeaderRow2.push(child);
            }
            if (endC > startC) {
              sMerges.push({ s: { r: 3, c: startC }, e: { r: 3, c: endC } });
            }
            sColIdx += cat.children.length;
          }
          sHeaderRow1.push('TOTAL');
          sHeaderRow2.push('');
          sMerges.push({ s: { r: 3, c: sColIdx }, e: { r: 4, c: sColIdx } });

          const sData: any[][] = [
            [],
            ['', '', '', `STORE TYPE: ${typeName}`],
            [],
            sHeaderRow1,
            sHeaderRow2
          ];

          const typeColTotals: Record<string, number> = {};
          let typeTotalAmt = 0;

          typeRows.forEach((row, idx) => {
            typeTotalAmt += row.total;
            const rowData: any[] = [
              idx + 1,
              row.bundleId,
              row.expNo,
              row.location,
              row.subDepartment,
              row.issueTitle,
              row.storeTypeLabel || row.storeType || '-'
            ];
            for (const colName of allChildExpenseColumns) {
              const amt = row.amountsByType[colName] || 0;
              typeColTotals[colName] = (typeColTotals[colName] || 0) + amt;
              rowData.push(amt > 0 ? Number(amt.toFixed(3)) : '-');
            }
            rowData.push(Number(row.total.toFixed(3)));
            sData.push(rowData);
          });

          const totalRow: any[] = ['', '', '', 'Total', '', '', ''];
          for (const colName of allChildExpenseColumns) {
            const cAmt = typeColTotals[colName] || 0;
            totalRow.push(cAmt > 0 ? Number(cAmt.toFixed(3)) : '-');
          }
          totalRow.push(Number(typeTotalAmt.toFixed(3)));
          sData.push(totalRow);

          const wsType = XLSX.utils.aoa_to_sheet(sData);
          wsType['!merges'] = sMerges;
          wsType['!cols'] = [
            { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
            { wch: 18 }, { wch: 24 }, { wch: 22 },
            ...allChildExpenseColumns.map(() => ({ wch: 14 })),
            { wch: 14 }
          ];
          XLSX.utils.book_append_sheet(wb, wsType, cleanSheetTitle);
        });

        if (groupByLocation) {
          const locHeaders = ['SL', 'TICKET -NO', 'LOCATION', 'SUB DEPARTMENT', 'SUMMARY', ...allChildExpenseColumns, 'TOTAL'];
          const locData: any[][] = [
            [],
            ['', '', 'Store & Department Expense Statement (Grouped by Store Type)'],
            [],
            locHeaders
          ];

          storewiseByStoreType.forEach(typeGroup => {
            locData.push([
              `STORE TYPE: ${typeGroup.typeName} — ${typeGroup.rows.length} Tickets | Subtotal: KD ${typeGroup.typeTotal.toFixed(3)}`,
              '', '', '', '',
              ...allChildExpenseColumns.map(() => ''),
              ''
            ]);

            typeGroup.locationRows.forEach((loc, idx) => {
              const rowData: any[] = [
                idx + 1,
                loc.ticketLinesText || loc.expNoStr,
                loc.location,
                loc.subDeptStr || '-',
                loc.summary
              ];
              for (const c of allChildExpenseColumns) {
                const amt = loc.amountsByType[c] || 0;
                rowData.push(amt > 0 ? Number(amt.toFixed(3)) : '-');
              }
              rowData.push(Number(loc.total.toFixed(3)));
              locData.push(rowData);
            });

            const subtotalRow: any[] = [`Type Subtotal (${typeGroup.typeName})`, '', '', '', ''];
            for (const c of allChildExpenseColumns) {
              const sAmt = typeGroup.subtotalByType[c] || 0;
              subtotalRow.push(sAmt > 0 ? Number(sAmt.toFixed(3)) : '-');
            }
            subtotalRow.push(Number(typeGroup.typeTotal.toFixed(3)));
            locData.push(subtotalRow);
            locData.push([]);
          });

          const locTotalRow: any[] = [`GRAND TOTAL (${storewiseTypeTotals.uniqueLocationsCount} Locations)`, '', '', '', ''];
          for (const c of allChildExpenseColumns) {
            const cAmt = storewiseTypeTotals.colTotals[c] || 0;
            locTotalRow.push(cAmt > 0 ? Number(cAmt.toFixed(3)) : '-');
          }
          locTotalRow.push(Number(storewiseTypeTotals.grandTotal.toFixed(3)));
          locData.push(locTotalRow);

          const wsLoc = XLSX.utils.aoa_to_sheet(locData);
          wsLoc['!cols'] = [
            { wch: 8 }, { wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 30 },
            ...allChildExpenseColumns.map(() => ({ wch: 14 })),
            { wch: 14 }
          ];
          XLSX.utils.book_append_sheet(wb, wsLoc, 'Store Type Statement');
        }
      } else {
        const batchesToExport = dynamicLedgerBatches.length > 0 ? dynamicLedgerBatches : ['General Maintenance'];

        batchesToExport.forEach((batchName) => {
          const batchRows = structuredRows.filter(r => r.ledgerBatch === batchName);
          const cleanSheetTitle = batchName.slice(0, 31).replace(/[:\\\/\?\*\[\]]/g, '_');
          const sHeaderRow1: any[] = ['SLNO', 'BUNDLE ID', 'TICKET -NO', 'LOCATION', 'SUB DEPARTMENT', 'Issue Title(Consolidation)', 'Ledger Group'];
          const sHeaderRow2: any[] = ['', '', '', '', '', '', ''];
          const sMerges: XLSX.Range[] = [
            { s: { r: 1, c: 3 }, e: { r: 1, c: 6 } },
            { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
            { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
            { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } },
            { s: { r: 3, c: 3 }, e: { r: 4, c: 3 } },
            { s: { r: 3, c: 4 }, e: { r: 4, c: 4 } },
            { s: { r: 3, c: 5 }, e: { r: 4, c: 5 } },
            { s: { r: 3, c: 6 }, e: { r: 4, c: 6 } },
          ];

          let sColIdx = 7;
          for (const cat of expenseColumnsHierarchy) {
            const startC = sColIdx;
            const endC = sColIdx + cat.children.length - 1;
            sHeaderRow1.push(cat.parentName);
            for (let i = 1; i < cat.children.length; i++) {
              sHeaderRow1.push('');
            }
            for (const child of cat.children) {
              sHeaderRow2.push(child);
            }
            if (endC > startC) {
              sMerges.push({ s: { r: 3, c: startC }, e: { r: 3, c: endC } });
            }
            sColIdx += cat.children.length;
          }
          sHeaderRow1.push('TOTAL');
          sHeaderRow2.push('');
          sMerges.push({ s: { r: 3, c: sColIdx }, e: { r: 4, c: sColIdx } });

          const sData: any[][] = [
            [],
            ['', '', '', batchName],
            [],
            sHeaderRow1,
            sHeaderRow2
          ];

          const batchColTotals: Record<string, number> = {};
          let batchTotalAmt = 0;

          batchRows.forEach((row, idx) => {
            batchTotalAmt += row.total;
            const rowData: any[] = [
              idx + 1,
              row.bundleId,
              row.expNo,
              row.location,
              row.subDepartment,
              row.issueTitle,
              row.ledgerBatch
            ];
            for (const colName of allChildExpenseColumns) {
              const amt = row.amountsByType[colName] || 0;
              batchColTotals[colName] = (batchColTotals[colName] || 0) + amt;
              rowData.push(amt > 0 ? Number(amt.toFixed(3)) : '-');
            }
            rowData.push(Number(row.total.toFixed(3)));
            sData.push(rowData);
          });

          const totalRow: any[] = ['', '', '', 'Total', '', '', ''];
          for (const colName of allChildExpenseColumns) {
            const cAmt = batchColTotals[colName] || 0;
            totalRow.push(cAmt > 0 ? Number(cAmt.toFixed(3)) : '-');
          }
          totalRow.push(Number(batchTotalAmt.toFixed(3)));
          sData.push(totalRow);

          const wsBatch = XLSX.utils.aoa_to_sheet(sData);
          wsBatch['!merges'] = sMerges;
          wsBatch['!cols'] = [
            { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
            { wch: 18 }, { wch: 24 }, { wch: 22 },
            ...allChildExpenseColumns.map(() => ({ wch: 14 })),
            { wch: 14 }
          ];
          XLSX.utils.book_append_sheet(wb, wsBatch, cleanSheetTitle);
        });

        if (groupByLocation) {
          const locHeaders = ['SL', 'TICKET -NO', 'LOCATION', 'SUB DEPARTMENT', 'SUMMARY', ...allChildExpenseColumns, 'TOTAL'];
          const locData: any[][] = [
            [],
            ['', '', 'Store & Department Expense Statement (Grouped by Location & Ledger Batches)'],
            [],
            locHeaders
          ];

          storewiseByBatch.forEach(batch => {
            locData.push([
              `LEDGER BATCH: ${batch.batchName} — ${batch.rows.length} Tickets | Subtotal: KD ${batch.batchTotal.toFixed(3)}`,
              '', '', '', '',
              ...allChildExpenseColumns.map(() => ''),
              ''
            ]);

            batch.locationRows.forEach((loc, idx) => {
              const rowData: any[] = [
                idx + 1,
                loc.ticketLinesText || loc.expNoStr,
                loc.location,
                loc.subDeptStr || '-',
                loc.summary
              ];
              for (const c of allChildExpenseColumns) {
                const amt = loc.amountsByType[c] || 0;
                rowData.push(amt > 0 ? Number(amt.toFixed(3)) : '-');
              }
              rowData.push(Number(loc.total.toFixed(3)));
              locData.push(rowData);
            });

            const subtotalRow: any[] = [`Batch Subtotal (${batch.batchName})`, '', '', '', ''];
            for (const c of allChildExpenseColumns) {
              const sAmt = batch.subtotalByType[c] || 0;
              subtotalRow.push(sAmt > 0 ? Number(sAmt.toFixed(3)) : '-');
            }
            subtotalRow.push(Number(batch.batchTotal.toFixed(3)));
            locData.push(subtotalRow);
            locData.push([]);
          });

          const locTotalRow: any[] = [`GRAND TOTAL (${userwiseGrandTotals.uniqueLocationsCount} Locations)`, '', '', '', ''];
          for (const c of allChildExpenseColumns) {
            const cAmt = userwiseGrandTotals.colTotals[c] || 0;
            locTotalRow.push(cAmt > 0 ? Number(cAmt.toFixed(3)) : '-');
          }
          locTotalRow.push(Number(userwiseGrandTotals.grandTotal.toFixed(3)));
          locData.push(locTotalRow);

          const wsLoc = XLSX.utils.aoa_to_sheet(locData);
          wsLoc['!cols'] = [
            { wch: 8 }, { wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 30 },
            ...allChildExpenseColumns.map(() => ({ wch: 14 })),
            { wch: 14 }
          ];
          XLSX.utils.book_append_sheet(wb, wsLoc, 'Location Statement');
        }
      }

      const fileName = `Weekly_Expense_Payout_Report_${currentGroupName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
      alert('Failed to generate Excel report. Please check console.');
    }
  };



  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-surface-container border border-outline-variant rounded  w-full shadow-2xl overflow-hidden flex flex-col h-full .max-h-[94vh] print:max-h-none print:shadow-none print:border-0 print:p-0">

        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 border-b border-outline-variant bg-surface-container-low flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <FileText className="w-5 h-5" />
            </div>
            <div>

              {isEditingName ? (
                <div className="mt-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => {
                        setEditNameValue(e.target.value);
                        if (nameError) setNameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveGroupName();
                        if (e.key === 'Escape') {
                          setIsEditingName(false);
                          setNameError(null);
                          setEditNameValue(currentGroupName);
                        }
                      }}
                      disabled={isSavingName}
                      autoFocus
                      className="px-2.5 py-1 text-sm font-semibold rounded border border-primary bg-surface-container-low text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-64 sm:w-80 shadow-2xs"
                      placeholder="Enter new group name..."
                    />
                    <button
                      type="button"
                      onClick={handleSaveGroupName}
                      disabled={isSavingName}
                      className="px-2.5 py-1 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer shadow-xs"
                      title="Save Group Name"
                    >
                      {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingName(false);
                        setNameError(null);
                        setEditNameValue(currentGroupName);
                      }}
                      disabled={isSavingName}
                      className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {nameError && (
                    <span className="text-[11px] text-rose-500 font-medium">
                      {nameError}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-0.5 group">
                  <h2 className="text-base sm:text-lg font-bold text-on-surface">
                    {currentGroupName}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setEditNameValue(currentGroupName);
                      setNameError(null);
                      setIsEditingName(true);
                    }}
                    className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors cursor-pointer opacity-80 hover:opacity-100"
                    title="Rename Ledger Group"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-on-surface-variant font-medium">
                  Ledger - {group.groupId}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            {/* Global Vertical (Portrait) Orientation Checkbox */}
            <label className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-container border border-outline-variant text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs">
              <input
                type="checkbox"
                checked={groupByLocation}
                onChange={(e) => setGroupByLocation(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
              />
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span>Group by Location</span>
            </label>

            {/* Ledger Batch vs Store Type Grouping Switcher in Header */}
            {/* <div className="flex items-center bg-surface-container border border-outline-variant rounded p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('storewise');
                  setStoreReportGrouping('batch');
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'storewise' && storeReportGrouping === 'batch'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                title="Group report by Ledger Batch"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>By Ledger Batch</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('storewise');
                  setStoreReportGrouping('store_type');
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'storewise' && storeReportGrouping === 'store_type'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                title="Group report by Store Type"
              >
                <Store className="w-3.5 h-3.5" />
                <span>By Store Type</span>
              </button>
            </div> */}



            {activeTab === 'userwise' ? (
              <>
                {/* <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs">
                  <input
                    type="checkbox"
                    checked={showWorkerSummary}
                    onChange={(e) => setShowWorkerSummary(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Worker Summary Report</span>
                </label>

                <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs">
                  <input
                    type="checkbox"
                    checked={showWorkerDetailed}
                    onChange={(e) => setShowWorkerDetailed(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>Worker Wise Detailed Statement</span>
                </label> */}
              </>
            ) : (
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs">
                <input
                  type="checkbox"
                  checked={showWorkerDetailsInSummary}
                  onChange={(e) => setShowWorkerDetailsInSummary(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                />
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                <span>Worker Details in Summary</span>
              </label>
            )}

            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs mr-1">
              <input
                type="checkbox"
                checked={isVerticalOrientation}
                onChange={(e) => setIsVerticalOrientation(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
              />
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Vertical Orientation</span>
            </label>

            {/* <button
              onClick={handleCopySummary}
              className="px-3 py-1.5 rounded border border-outline text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Copy summary to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-on-surface-variant" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button> */}

            <button
              onClick={handleExportMultiSheetExcel}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs hover:shadow cursor-pointer"
              title="Download exact multi-sheet weekly.xlsx Excel file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              disabled={isCapturing}
              onClick={() => handleDownloadPdf()}
              className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs hover:shadow cursor-pointer disabled:opacity-50"
              title="Download professional vector PDF report"
            >
              {isCapturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>PDF</span>
            </button>

            <button
              disabled={isCapturing}
              onClick={() => handlePrintProfessionalReport()}
              className="px-3.5 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Print professional formatted tabular report"
            >
              {isCapturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>Print</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-surface scrollbar-thin">

          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded bg-surface-container border border-outline-variant shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-[11px] font-medium">Grand Settlement Total</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                KD {userwiseGrandTotals.grandTotal.toFixed(3)}
              </div>
              <span className="text-[10px] text-on-surface-variant mt-0.5 block font-medium">
                {structuredRows.length} itemized ticket entries
              </span>
            </div>

            <div className="p-3.5 rounded bg-surface-container border border-outline-variant shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-[11px] font-medium">Locations Covered</span>
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="text-xl font-bold text-primary mt-1">
                {userwiseGrandTotals.uniqueLocationsCount} Locations
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 block font-medium">
                Across {dynamicLedgerBatches.length} ledger batches
              </span>
            </div>

            <div className="p-3.5 rounded bg-surface-container border border-outline-variant shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-[11px] font-medium">Technicians Payout</span>
                <User className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl font-bold text-on-surface mt-1">
                {workerGroupedRows.length} Technicians
              </div>
              <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                {group.totalBundlesCount} worker claims
              </span>
            </div>

            <div className="p-3.5 rounded bg-surface-container border border-outline-variant shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-[11px] font-medium">Ledger Batches</span>
                <Boxes className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-on-surface mt-1">
                {dynamicLedgerBatches.length} Batches
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 block font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                All Batches Approved
              </span>
            </div>
          </div>

          {/* REPORT VIEW TABS */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-outline-variant pb-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              <Can permission={['finance.worker_wise_settlement', 'reports.can_generate_report'] as any}>
                <button
                  onClick={() => setActiveTab('userwise')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'userwise'
                    ? 'bg-primary text-on-primary shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Worker-wise Settlement(For Cash Office)</span>
                </button>
              </Can>

              <Can permission={['finance.location_wise_expenses', 'reports.can_generate_report'] as any}>
                <button
                  onClick={() => {
                    setActiveTab('storewise');
                    setStoreReportGrouping('batch');
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'storewise' && storeReportGrouping === 'batch'
                    ? 'bg-primary text-on-primary shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Expenses by Ledger Batch</span>
                </button>
              </Can>

              <Can permission={['finance.location_wise_expenses', 'reports.can_generate_report'] as any}>
                <button
                  onClick={() => {
                    setActiveTab('storewise');
                    setStoreReportGrouping('store_type');
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'storewise' && storeReportGrouping === 'store_type'
                    ? 'bg-primary text-on-primary shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Expenses by Store Type</span>
                </button>
              </Can>
            </div>

            {/* Search Input, Worker View Toggles */}
            <div className="flex items-center gap-2.5 print:hidden flex-wrap">
              {activeTab === 'userwise' && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs">
                    <input
                      type="checkbox"
                      checked={showWorkerSummary}
                      onChange={(e) => setShowWorkerSummary(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                    />
                    <UserCheck className="w-3.5 h-3.5 text-primary" />
                    <span>Worker Summary Report</span>
                  </label>

                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors select-none shadow-2xs">
                    <input
                      type="checkbox"
                      checked={showWorkerDetailed}
                      onChange={(e) => setShowWorkerDetailed(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                    />
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>Worker Wise Detailed Statement</span>
                  </label>
                </div>
              )}

              <div className="relative w-60">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search ticket, store, worker..."
                  className="w-full pl-8 pr-3 py-1.5 rounded border border-outline bg-surface-container text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* HTML2CANVAS CAPTURE CONTAINER */}
          <div ref={printAreaRef} className="space-y-4 bg-surface p-1">

            {/* ========================================== */}
            {/* TAB 1: WEEKLY EXPENSE PAYOUT REPORT USERWISE */}
            {/* ========================================== */}
            {activeTab === 'userwise' && (
              <div className="space-y-8">
                {/* 1. FIRST SECTION: CONSOLIDATED TECHNICIAN PAYOUT STATEMENT */}
                {showWorkerSummary && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-primary/10 border border-primary/25 rounded px-4 py-2.5 text-xs text-primary font-bold">
                      <span className="flex items-center gap-2">
                        <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <UserCheck className="w-5 h-5" />
                        </div>
                        {/* <FileText className="w-4 h-4" /> */}
                        Worker Summary Report
                      </span>
                      <div className="flex items-center gap-3">

                        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          Total Payout: KD {consolidatedUserData.grandTotal.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    <div className="border border-outline-variant rounded overflow-hidden bg-surface-container shadow-2xs">
                      <table className="w-full text-xs text-left text-on-surface">
                        <thead className="bg-surface-container-high text-on-surface-variant uppercase text-[11px] font-bold tracking-wider border-b border-outline-variant">
                          <tr>
                            <th className="px-4 py-3 text-center w-12">SL</th>
                            <th className="px-5 py-3">Worker</th>
                            <th className="px-4 py-3 text-center">Bundles(ID)</th>
                            <th className="px-4 py-3 text-center">Tickets</th>
                            <th className="px-4 py-3 text-center">Locations</th>
                            <th className="px-5 py-3 text-right bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">Amount to be Given (KD)</th>
                            <th className="px-5 py-3 text-center w-36">Paid</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {consolidatedUserData.list.map((item) => (
                            <tr key={item.workerId || item.workerName} className="hover:bg-surface-container-high/40 transition-colors">
                              <td className="px-4 py-3 text-center font-mono text-on-surface-variant">
                                {item.sl}
                              </td>
                              <td className="px-5 py-3 font-semibold text-on-surface">
                                <div className="flex items-center gap-2.5">
                                  <User className="w-4 h-4 text-primary shrink-0" />
                                  <div>
                                    <span className="font-bold text-on-surface">{item.workerName}</span>
                                    {item.workerEmployeeNo && (
                                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-surface-container-high text-on-surface-variant font-mono">
                                        {item.workerEmployeeNo}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-mono font-medium text-on-surface">
                                <span>{item.bundleCount}</span>
                                {item.bundleNumbersStr && (
                                  <span className="ml-1.5 text-[11px] font-semibold text-primary">
                                    ({item.bundleNumbersStr})
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-mono font-medium text-on-surface">
                                {item.ticketCount}
                              </td>
                              <td className="px-4 py-3 text-center font-mono font-medium text-on-surface">
                                {item.locationCount}
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 text-sm">
                                KD {item.totalAmount.toFixed(3)}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <div className="w-24 mx-auto border-b-2 border-dashed border-outline-variant/80 h-5" title="Manually mark payment status"></div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-surface-container-high font-extrabold border-t-2 border-outline-variant text-xs">
                          <tr>
                            <td colSpan={2} className="px-5 py-3.5 text-on-surface uppercase tracking-wider">
                              GRAND TOTAL
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono text-on-surface">
                              {consolidatedUserData.totalBundles}
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono text-on-surface">
                              {consolidatedUserData.totalTickets}
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono text-on-surface">
                              {userwiseGrandTotals.uniqueLocationsCount}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-500/15 font-black">
                              KD {consolidatedUserData.grandTotal.toFixed(3)}
                            </td>
                            <td className="px-5 py-3.5 text-center"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. SECOND SECTION: ITEMIZED / LOCATION-GROUPED EXPENSE STATEMENT BY CATEGORIES */}
                {showWorkerDetailed && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-primary/10 border border-primary/25 rounded px-4 py-2.5 text-xs text-primary font-bold">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Worker Wise Detailed Statement
                        {/* - {groupByLocation ? 'Location-Grouped' : 'Itemized'} */}
                      </span>
                      <div className="flex items-center gap-3">

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-3">

                            <span
                              className={
                                groupByLocation
                                  ? "text-[11px] font-normal text-on-surface-variant"
                                  : "text-[10px] font-normal text-red-600 animate-pulse"
                              }
                            >
                              {groupByLocation
                                ? `Grouped by location (${userwiseGrandTotals.uniqueLocationsCount} locations)`
                                : "⚠ Location Will Be repeated"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border border-outline-variant rounded overflow-x-auto bg-surface-container shadow-2xs">
                      <table className="w-full text-xs text-left text-on-surface border-collapse">
                        <thead className="bg-surface-container-high text-on-surface-variant text-[11px] font-bold border-b-2 border-outline-variant sticky top-0 z-10">
                          <tr>
                            {groupByLocation ? (
                              <>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-center bg-surface-container-low font-bold">Worker</th>
                                <th rowSpan={2} className="px-2.5 py-2.5 border-r border-outline-variant text-center w-12 font-bold">SL</th>
                                <th rowSpan={2} className="px-3.5 py-2.5 border-r border-outline-variant text-left font-bold min-w-[150px]">TICKET -NO</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant text-left font-bold">LOCATION</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-left font-bold">SUB DEPARTMENT</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant text-left font-bold">SUMMARY[Exp]</th>
                              </>
                            ) : (
                              <>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-center bg-surface-container-low font-bold">Worker</th>
                                <th rowSpan={2} className="px-2.5 py-2.5 border-r border-outline-variant text-center">SLNo</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-center">BUNDLE ID</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">TICKET -NO</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">LOCATION</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">SUB DEPARTMENT</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant">ISSUE TITLE</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">Ledger Group</th>
                              </>
                            )}

                            {/* Parent Expense Categories */}
                            {expenseColumnsHierarchy.map(cat => (
                              <th
                                key={cat.parentName}
                                colSpan={cat.children.length}
                                className="px-3 py-1.5 text-center border-r border-outline-variant bg-surface-container-lowest font-bold text-primary dark:text-primary-container uppercase tracking-wider text-[10px]"
                              >
                                {cat.parentName}
                              </th>
                            ))}

                            <th rowSpan={2} className="px-3.5 py-2.5 text-right font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                              TOTAL
                            </th>
                          </tr>

                          {/* Sub Expense Types */}
                          <tr>
                            {expenseColumnsHierarchy.map(cat => (
                              cat.children.map(child => (
                                <th
                                  key={`${cat.parentName}_${child}`}
                                  className="px-2.5 py-1.5 text-right border-r border-outline-variant bg-surface-container-low font-medium text-[10px] text-on-surface-variant whitespace-nowrap"
                                >
                                  {child}
                                </th>
                              ))
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-outline-variant/60 text-xs">
                          {workerGroupedRows.length === 0 ? (
                            <tr>
                              <td colSpan={(groupByLocation ? 6 : 8) + allChildExpenseColumns.length + 1} className="p-8 text-center text-on-surface-variant">
                                No expenses found matching the current criteria.
                              </td>
                            </tr>
                          ) : (
                            workerGroupedRows.map((wGroup, wIdx) => (
                              <React.Fragment key={wGroup.workerId || wGroup.workerName || wIdx}>
                                {groupByLocation ? (
                                  wGroup.locationRows.map((locRow, locIdx) => (
                                    <tr key={locRow.location || locIdx} className="hover:bg-surface-container-high/40 transition-colors">
                                      {locIdx === 0 && (
                                        <td
                                          rowSpan={wGroup.locationRows.length}
                                          className="px-3 py-2.5 font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest align-top"
                                        >
                                          <div className="sticky top-12 space-y-0.5">
                                            <span className="font-semibold text-primary">{wGroup.workerName}</span>
                                            {wGroup.workerEmployeeNo && (
                                              <span className="block text-[10px] font-mono text-on-surface-variant">{wGroup.workerEmployeeNo}</span>
                                            )}
                                          </div>
                                        </td>
                                      )}
                                      <td className="px-2.5 py-2 border-r border-outline-variant text-center font-mono text-on-surface-variant text-[11px]">
                                        {locIdx + 1}
                                      </td>
                                      <td className="px-3.5 py-2.5 border-r border-outline-variant font-mono text-[11px]">
                                        <div className="flex flex-col gap-0.5 whitespace-nowrap font-semibold text-primary">
                                          {locRow.ticketLines && locRow.ticketLines.length > 0 ? (
                                            locRow.ticketLines.map((line, lIdx) => (
                                              <span key={lIdx}>{line}</span>
                                            ))
                                          ) : (
                                            <span>{locRow.expNoStr || '-'}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-bold text-on-surface">
                                        <div className="flex items-center gap-1.5">
                                          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                                          <span>{locRow.location}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        {locRow.subDeptStr || '-'}
                                      </td>
                                      <td className="px-4 py-2 border-r border-outline-variant text-on-surface text-[11px] max-w-sm truncate" title={locRow.summary}>
                                        <span className="font-medium text-on-surface">{locRow.summary}</span>
                                      </td>

                                      {allChildExpenseColumns.map(colName => {
                                        const amt = locRow.amountsByType[colName];
                                        return (
                                          <td
                                            key={colName}
                                            className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-[11px] text-on-surface"
                                          >
                                            {amt !== undefined && amt > 0 ? (
                                              <span className="font-semibold">{amt.toFixed(3)}</span>
                                            ) : (
                                              <span className="text-on-surface-variant/40">-</span>
                                            )}
                                          </td>
                                        );
                                      })}

                                      <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-500/5">
                                        {locRow.total.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  wGroup.rows.map((row, rIdx) => (
                                    <tr key={row.uniqueKey || rIdx} className="hover:bg-surface-container-high/40 transition-colors">
                                      {rIdx === 0 && (
                                        <td
                                          rowSpan={wGroup.rows.length}
                                          className="px-3 py-2.5 font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest align-top"
                                        >
                                          <div className="sticky top-12 space-y-0.5">
                                            <span className="font-semibold text-primary">{wGroup.workerName}</span>
                                            {wGroup.workerEmployeeNo && (
                                              <span className="block text-[10px] font-mono text-on-surface-variant">{wGroup.workerEmployeeNo}</span>
                                            )}
                                          </div>
                                        </td>
                                      )}
                                      <td className="px-2.5 py-2 border-r border-outline-variant text-center font-mono text-on-surface-variant text-[11px]">
                                        {rIdx + 1}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-center font-mono text-primary font-semibold text-[11px]">
                                        #{row.bundleId}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-mono font-medium text-[11px]">
                                        <div className="flex flex-col">
                                          {row.ticketObj && setSelectedTicketForModal ? (
                                            <button
                                              type="button"
                                              onClick={() => setSelectedTicketForModal(row.ticketObj)}
                                              className="text-primary hover:underline cursor-pointer font-bold text-left"
                                            >
                                              {row.expNo}
                                            </button>
                                          ) : (
                                            <span>{row.expNo}</span>
                                          )}
                                          {row.expenseIds?.[0] && String(row.expNo) !== `EXP-${row.expenseIds[0]}` && (
                                            <span className="text-[10px] text-on-surface-variant font-mono">
                                              (EXP-{row.expenseIds[0]})
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-medium text-on-surface">
                                        {row.location}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        {row.subDepartment}
                                      </td>
                                      <td className="px-4 py-2 border-r border-outline-variant font-normal text-on-surface truncate max-w-xs" title={row.issueTitle}>
                                        {row.issueTitle}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[10px] border border-outline-variant/60 font-medium">
                                          {row.ledgerBatch}
                                        </span>
                                      </td>

                                      {allChildExpenseColumns.map(colName => {
                                        const amt = row.amountsByType[colName];
                                        return (
                                          <td
                                            key={colName}
                                            className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-[11px] text-on-surface"
                                          >
                                            {amt !== undefined && amt > 0 ? (
                                              <span className="font-semibold">{amt.toFixed(3)}</span>
                                            ) : (
                                              <span className="text-on-surface-variant/40">-</span>
                                            )}
                                          </td>
                                        );
                                      })}

                                      <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-500/5">
                                        {row.total.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))
                                )}

                                {/* Worker Subtotal Row */}
                                <tr className="bg-surface-container-high/70 font-semibold border-b-2 border-outline-variant text-[11px]">
                                  {groupByLocation ? (
                                    <>
                                      <td colSpan={2} className="px-3 py-2 border-r border-outline-variant text-right text-on-surface-variant font-bold">
                                        Subtotal
                                      </td>
                                      <td colSpan={2} className="px-3 py-2 border-r border-outline-variant font-bold text-primary">
                                        {wGroup.locationRows.length} Locations ({new Set(wGroup.rows.map(r => r.ticketNo || r.expNo).filter(Boolean)).size} Tickets)
                                      </td>
                                      <td colSpan={2} className="px-3 py-2 border-r border-outline-variant"></td>
                                    </>
                                  ) : (
                                    <>
                                      <td colSpan={4} className="px-3 py-2 border-r border-outline-variant text-right text-on-surface-variant font-bold">
                                        Subtotal
                                      </td>
                                      <td colSpan={2} className="px-3 py-2 border-r border-outline-variant font-bold text-primary">
                                        {wGroup.uniqueLocationsCount} Locations ({new Set(wGroup.rows.map(r => r.ticketNo || r.expNo).filter(Boolean)).size} Tickets, {wGroup.rows.length} Expenses)
                                      </td>
                                      <td colSpan={3} className="px-3 py-2 border-r border-outline-variant"></td>
                                    </>
                                  )}

                                  {allChildExpenseColumns.map(colName => {
                                    const sAmt = wGroup.subtotalByType[colName] || 0;
                                    return (
                                      <td
                                        key={`subtotal_${colName}`}
                                        className="px-2.5 py-2 text-right border-r border-outline-variant font-bold font-mono text-on-surface"
                                      >
                                        {sAmt > 0 ? sAmt.toFixed(3) : '-'}
                                      </td>
                                    );
                                  })}

                                  <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10">
                                    {wGroup.totalAmount.toFixed(3)}
                                  </td>
                                </tr>
                              </React.Fragment>
                            ))
                          )}
                        </tbody>

                        {/* TFOOT: GRAND TOTAL ROW */}
                        <tfoot className="bg-surface-container-high font-bold border-t-2 border-outline-variant text-xs sticky bottom-0 z-10 shadow-lg">
                          <tr className="border-t border-outline-variant">
                            {groupByLocation ? (
                              <>
                                <td colSpan={2} className="px-4 py-3 text-on-surface font-extrabold uppercase tracking-wider">
                                  GRAND TOTAL
                                </td>
                                <td colSpan={2} className="px-3 py-3 border-r border-outline-variant font-extrabold text-primary">
                                  {userwiseGrandTotals.uniqueLocationsCount} Locations ({structuredRows.length} Tickets)
                                </td>
                                <td colSpan={2} className="px-3 py-3 border-r border-outline-variant"></td>
                              </>
                            ) : (
                              <>
                                <td colSpan={4} className="px-4 py-3 text-on-surface font-extrabold uppercase tracking-wider">
                                  GRAND TOTAL
                                </td>
                                <td className="px-3 py-3 border-r border-outline-variant font-extrabold text-primary">
                                  {userwiseGrandTotals.uniqueLocationsCount} Locations
                                </td>
                                <td colSpan={3} className="px-3 py-3 border-r border-outline-variant"></td>
                              </>
                            )}

                            {allChildExpenseColumns.map(colName => {
                              const gAmt = userwiseGrandTotals.colTotals[colName] || 0;
                              return (
                                <td
                                  key={`grand_${colName}`}
                                  className="px-2.5 py-3 text-right border-r border-outline-variant font-extrabold font-mono text-on-surface"
                                >
                                  {gAmt > 0 ? gAmt.toFixed(3) : '-'}
                                </td>
                              );
                            })}

                            <td className="px-3.5 py-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm bg-emerald-500/15">
                              KD {userwiseGrandTotals.grandTotal.toFixed(3)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {!showWorkerSummary && !showWorkerDetailed && (
                  <div className="p-12 text-center text-on-surface-variant border border-dashed border-outline-variant rounded bg-surface-container">
                    <p className="text-xs font-medium text-on-surface">No reports selected.</p>
                    <p className="text-xs mt-1">Please select "Worker Summary Report" or "Worker Wise Detailed Statement" from the options above.</p>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: CONSOLIDATED FINANCIAL SETTLEMENT & DYNAMIC LEDGER BATCH / STORE TYPE REPORTS */}
            {/* ========================================================================= */}
            {activeTab === 'storewise' && (
              <div className="space-y-6">
                {/* Storewise Grouping Mode Switcher */}
                {/* <div className="flex items-center justify-between flex-wrap gap-3 bg-surface-container-high/60 p-2.5 rounded-lg border border-outline-variant">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-primary" />
                      Report Grouping:
                    </span>
                    <div className="flex items-center bg-surface-container-lowest p-0.5 rounded border border-outline-variant">
                      <button
                        type="button"
                        onClick={() => setStoreReportGrouping('batch')}
                        className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${storeReportGrouping === 'batch'
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface'
                          }`}
                      >
                        <Boxes className="w-3.5 h-3.5" />
                        By Ledger Batch
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoreReportGrouping('store_type')}
                        className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${storeReportGrouping === 'store_type'
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface'
                          }`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        By Store Type
                      </button>
                    </div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">
                    {storeReportGrouping === 'store_type'
                      ? `Categorized by ${dynamicStoreTypes.length} Store Types across all branches`
                      : `Categorized by ${dynamicLedgerBatches.length} Ledger Batches`}
                  </span>
                </div> */}

                {/* 1. FIRST SHEET / SUMMARY SECTION */}
                {storeReportGrouping === 'store_type' ? (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-primary/10 border border-primary/25 rounded px-4 py-2.5 text-xs text-primary font-bold">
                      <span className="flex items-center gap-2">
                        <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Store className="w-5 h-5" />
                        </div>
                        Store Type Summary Statement
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          Total Payout: KD {consolidatedStoreTypeData.grandTotal.toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <div className="border border-outline-variant rounded overflow-hidden bg-surface-container shadow-2xs">
                      <table className="w-full text-xs text-left text-on-surface">
                        <thead className="bg-surface-container-high text-on-surface-variant uppercase text-[11px] font-bold tracking-wider border-b border-outline-variant">
                          <tr>
                            <th className="px-5 py-3">Store Type</th>
                            <th className="px-5 py-3 text-center">Stores Count</th>
                            <th className="px-5 py-3 text-right">Labour Charge</th>
                            <th className="px-5 py-3 text-right">Expense</th>
                            <th className="px-5 py-3 text-right bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {consolidatedStoreTypeData.list.map((item) => (
                            <tr key={item.storeType} className="hover:bg-surface-container-high/40 transition-colors">
                              <td className="px-5 py-3 font-semibold text-on-surface">
                                <div className="flex items-center gap-2">
                                  <Store className="w-4 h-4 text-primary shrink-0" />
                                  <span>{item.storeTypeLabel}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-center font-mono font-medium text-on-surface">
                                <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[11px] font-semibold">
                                  {item.storesCount} {item.storesCount === 1 ? 'Store' : 'Stores'}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-medium text-on-surface">
                                {item.labourCharge > 0 ? item.labourCharge.toFixed(3) : '-'}
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-medium text-on-surface">
                                {item.expense.toFixed(3)}
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                                KD {item.total.toFixed(3)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-surface-container-high font-extrabold border-t-2 border-outline-variant text-xs">
                          <tr>
                            <td className="px-5 py-3.5 text-on-surface uppercase tracking-wider">
                              GRAND TOTAL
                            </td>
                            <td className="px-5 py-3.5 text-center font-mono font-bold text-primary">
                              {consolidatedStoreTypeData.totalStoresCount} Stores
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-on-surface">
                              {consolidatedStoreTypeData.grandLabour > 0 ? consolidatedStoreTypeData.grandLabour.toFixed(3) : '-'}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-on-surface">
                              {consolidatedStoreTypeData.grandExpense.toFixed(3)}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-500/15">
                              KD {consolidatedStoreTypeData.grandTotal.toFixed(3)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-primary/10 border border-primary/25 rounded px-4 py-2.5 text-xs text-primary font-bold">
                      <span className="flex items-center gap-2">
                        <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <UserCheck className="w-5 h-5" />
                        </div>
                        Location Summary Report
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          Total Payout: KD {consolidatedUserData.grandTotal.toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <div className="border border-outline-variant rounded overflow-hidden bg-surface-container shadow-2xs">
                      <table className="w-full text-xs text-left text-on-surface">
                        <thead className="bg-surface-container-high text-on-surface-variant uppercase text-[11px] font-bold tracking-wider border-b border-outline-variant">
                          <tr>
                            <th className="px-5 py-3">Section (Ledger Batch)</th>
                            <th className="px-5 py-3 text-right">Labour Charge</th>
                            <th className="px-5 py-3 text-right">Expense</th>
                            <th className="px-5 py-3 text-right bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {consolidatedBatchData.list.map((item) => (
                            <React.Fragment key={item.section}>
                              <tr className="hover:bg-surface-container-high/40 transition-colors">
                                <td className="px-5 py-3 font-semibold text-on-surface">
                                  <div className="flex items-center gap-2">
                                    <Boxes className="w-4 h-4 text-primary shrink-0" />
                                    <span>{item.section}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-medium text-on-surface">
                                  {item.labourCharge > 0 ? item.labourCharge.toFixed(3) : '-'}
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-medium text-on-surface">
                                  {item.expense.toFixed(3)}
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                                  KD {item.total.toFixed(3)}
                                </td>
                              </tr>
                              {showWorkerDetailsInSummary && item.workerList && item.workerList.map((w) => (
                                <tr key={`${item.section}_${w.workerId || w.workerName}`} className="bg-surface-container-lowest/50 hover:bg-surface-container-high/30 transition-colors text-[11px]">
                                  <td className="px-5 py-2 pl-11 text-on-surface flex items-center gap-2">
                                    <span className="text-primary font-bold">•</span>
                                    <User className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                    <span className="font-semibold text-on-surface">{w.workerName}</span>
                                    {w.workerEmployeeNo && (
                                      <span className="text-[10px] text-on-surface-variant font-mono">({w.workerEmployeeNo})</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2 text-right font-mono text-on-surface-variant">
                                    {w.labourCharge > 0 ? w.labourCharge.toFixed(3) : '-'}
                                  </td>
                                  <td className="px-5 py-2 text-right font-mono text-on-surface-variant">
                                    {w.expense.toFixed(3)}
                                  </td>
                                  <td className="px-5 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                                    KD {w.total.toFixed(3)}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot className="bg-surface-container-high font-extrabold border-t-2 border-outline-variant text-xs">
                          <tr>
                            <td className="px-5 py-3.5 text-on-surface uppercase tracking-wider">
                              GRAND TOTAL
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-on-surface">
                              {consolidatedBatchData.grandLabour > 0 ? consolidatedBatchData.grandLabour.toFixed(3) : '-'}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-on-surface">
                              {consolidatedBatchData.grandExpense.toFixed(3)}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-500/15">
                              KD {consolidatedBatchData.grandTotal.toFixed(3)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}

                {/* 2. SECOND SECTION: DETAILED STATEMENT BY STORE TYPE OR LEDGER BATCHES */}
                {storeReportGrouping === 'store_type' ? (
                  <div className="space-y-4 pt-2">
                    {/* Dynamic Store Type Selector Pills */}
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-surface-container p-2.5 rounded border border-outline-variant print:hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setSelectedStoreTypeFilter('all')}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${selectedStoreTypeFilter === 'all'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                            }`}
                        >
                          All Store Types ({structuredRows.length} tickets | {allExpenses.length} exp)
                        </button>
                        {dynamicStoreTypes.map(tName => {
                          const count = structuredRows.filter(r => (r.storeTypeLabel || '').trim().toLowerCase() === tName.trim().toLowerCase()).length;
                          const storeCount = new Set(structuredRows.filter(r => (r.storeTypeLabel || '').trim().toLowerCase() === tName.trim().toLowerCase()).map(r => r.location)).size;
                          return (
                            <button
                              key={tName}
                              onClick={() => setSelectedStoreTypeFilter(tName)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${selectedStoreTypeFilter === tName
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                                }`}
                            >
                              {tName} ({count} tickets · {storeCount} stores)
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-primary/10 border border-primary/25 rounded px-4 py-2.5 text-xs text-primary font-bold">
                      <h3 className="text-md font-bold tracking-wider flex items-center gap-2">
                        <Store className="w-4 h-4 text-primary" />
                        <span>{selectedStoreTypeFilter === 'all' ? 'Store Type Detailed Report' : selectedStoreTypeFilter}</span>
                      </h3>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            groupByLocation
                              ? "text-[11px] font-normal text-on-surface-variant"
                              : "text-[10px] font-normal text-red-600 animate-pulse"
                          }
                        >
                          {groupByLocation
                            ? `Grouped by location (${storewiseTypeTotals.uniqueLocationsCount} locations)`
                            : "⚠ Location Will Be repeated"}
                        </span>
                      </div>
                    </div>

                    {/* Table with Multi-Level Headers for Store Type */}
                    <div className="border border-outline-variant rounded overflow-x-auto bg-surface-container shadow-2xs">
                      <table className="w-full text-xs text-left text-on-surface border-collapse">
                        <thead className="bg-surface-container-high text-on-surface-variant text-[11px] font-bold border-b-2 border-outline-variant sticky top-0 z-10">
                          <tr>
                            {groupByLocation ? (
                              <>
                                <th rowSpan={2} className="px-2.5 py-2.5 border-r border-outline-variant text-center w-12 font-bold">SL</th>
                                <th rowSpan={2} className="px-3.5 py-2.5 border-r border-outline-variant text-left font-bold min-w-[150px]">TICKET -NO</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant text-left font-bold">LOCATION</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-left font-bold">SUB DEPARTMENT</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant text-left font-bold">SUMMARY[Exp]</th>
                              </>
                            ) : (
                              <>
                                <th rowSpan={2} className="px-2.5 py-2.5 border-r border-outline-variant text-center">SLNO</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-center">BUNDLE ID</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">TICKET -NO</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">LOCATION</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">SUB DEPARTMENT</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant">Issue Title (Consolidation)</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">Store Type</th>
                              </>
                            )}

                            {/* Parent Expense Categories */}
                            {expenseColumnsHierarchy.map(cat => (
                              <th
                                key={cat.parentName}
                                colSpan={cat.children.length}
                                className="px-3 py-1.5 text-center border-r border-outline-variant bg-surface-container-lowest font-bold text-primary uppercase tracking-wider text-[10px]"
                              >
                                {cat.parentName}
                              </th>
                            ))}

                            <th rowSpan={2} className="px-3.5 py-2.5 text-right font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                              TOTAL
                            </th>
                          </tr>

                          <tr>
                            {expenseColumnsHierarchy.map(cat => (
                              cat.children.map(child => (
                                <th
                                  key={`${cat.parentName}_${child}`}
                                  className="px-2.5 py-1.5 text-right border-r border-outline-variant bg-surface-container-low font-medium text-[10px] text-on-surface-variant whitespace-nowrap"
                                >
                                  {child}
                                </th>
                              ))
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-outline-variant/60 text-xs">
                          {groupByLocation ? (
                            storewiseFilteredByStoreType.length === 0 ? (
                              <tr>
                                <td colSpan={5 + allChildExpenseColumns.length + 1} className="p-8 text-center text-on-surface-variant">
                                  No records found for the selected store type.
                                </td>
                              </tr>
                            ) : (
                              storewiseFilteredByStoreType.map(typeGroup => (
                                <React.Fragment key={typeGroup.typeName}>
                                  {/* STORE TYPE HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary print:break-before-page">
                                    <td
                                      colSpan={5 + allChildExpenseColumns.length + 1}
                                      className="px-4 py-2.5 text-xs tracking-wide"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Store className="w-4 h-4 text-primary" />
                                          <span className="font-bold">🔹 STORE TYPE: {typeGroup.typeName}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {typeGroup.rows.length} Tickets
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                          Subtotal: KD {typeGroup.typeTotal.toFixed(3)}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* STORE TYPE LOCATION ROWS */}
                                  {typeGroup.locationRows.map((locRow, idx) => (
                                    <tr key={locRow.location || idx} className="hover:bg-surface-container-high/40 transition-colors">
                                      <td className="px-2.5 py-2.5 border-r border-outline-variant text-center font-mono text-on-surface-variant text-[11px]">
                                        {idx + 1}
                                      </td>
                                      <td className="px-3.5 py-2.5 border-r border-outline-variant font-mono text-[11px]">
                                        <div className="flex flex-col gap-0.5 whitespace-nowrap font-semibold text-primary">
                                          {locRow.ticketLines && locRow.ticketLines.length > 0 ? (
                                            locRow.ticketLines.map((line, lIdx) => (
                                              <span key={lIdx}>{line}</span>
                                            ))
                                          ) : (
                                            <span>{locRow.expNoStr || '-'}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 border-r border-outline-variant font-bold text-on-surface">
                                        <div className="flex items-center gap-1.5">
                                          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                                          <span>{locRow.location}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        {locRow.subDeptStr || '-'}
                                      </td>
                                      <td className="px-4 py-2.5 border-r border-outline-variant text-on-surface text-[11px] max-w-sm truncate" title={locRow.summary}>
                                        <span className="font-medium text-on-surface">{locRow.summary}</span>
                                      </td>

                                      {allChildExpenseColumns.map(colName => {
                                        const amt = locRow.amountsByType[colName];
                                        return (
                                          <td
                                            key={colName}
                                            className="px-2.5 py-2.5 text-right border-r border-outline-variant font-mono text-[11px] text-on-surface"
                                          >
                                            {amt !== undefined && amt > 0 ? (
                                              <span className="font-semibold">{amt.toFixed(3)}</span>
                                            ) : (
                                              <span className="text-on-surface-variant/40">-</span>
                                            )}
                                          </td>
                                        );
                                      })}

                                      <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-500/5">
                                        {locRow.total.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))}

                                  {/* STORE TYPE SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={5} className="px-4 py-2 text-right text-on-surface font-semibold uppercase">
                                      Type Subtotal ({typeGroup.typeName}):
                                    </td>
                                    {allChildExpenseColumns.map(colName => {
                                      const sum = typeGroup.subtotalByType[colName] || 0;
                                      return (
                                        <td
                                          key={colName}
                                          className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-on-surface"
                                        >
                                          {sum > 0 ? (
                                            <span className="font-semibold">{sum.toFixed(3)}</span>
                                          ) : (
                                            <span className="text-on-surface-variant/40">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10">
                                      KD {typeGroup.typeTotal.toFixed(3)}
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          ) : (
                            storewiseFilteredByStoreType.length === 0 ? (
                              <tr>
                                <td colSpan={8 + allChildExpenseColumns.length} className="p-8 text-center text-on-surface-variant">
                                  No records found for the selected store type.
                                </td>
                              </tr>
                            ) : (
                              storewiseFilteredByStoreType.map(typeGroup => (
                                <React.Fragment key={typeGroup.typeName}>
                                  {/* STORE TYPE HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary print:break-before-page">
                                    <td
                                      colSpan={7 + allChildExpenseColumns.length + 1}
                                      className="px-4 py-2 text-xs tracking-wide"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Store className="w-4 h-4 text-primary" />
                                          <span className="font-bold">🔹 STORE TYPE: {typeGroup.typeName}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {typeGroup.rows.length} Tickets
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                          Subtotal: KD {typeGroup.typeTotal.toFixed(3)}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* STORE TYPE ROWS */}
                                  {typeGroup.rows.map((row, idx) => (
                                    <tr key={row.uniqueKey || idx} className="hover:bg-surface-container-high/40 transition-colors">
                                      <td className="px-2.5 py-2 border-r border-outline-variant text-center font-mono text-on-surface-variant text-[11px]">
                                        {idx + 1}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-center font-mono text-primary font-semibold text-[11px]">
                                        #{row.bundleId}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-mono font-medium text-[11px]">
                                        {row.ticketObj && setSelectedTicketForModal ? (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedTicketForModal(row.ticketObj)}
                                            className="text-primary hover:underline cursor-pointer font-bold"
                                          >
                                            {row.expNo}
                                          </button>
                                        ) : (
                                          <span>{row.expNo}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-medium text-on-surface">
                                        {row.location}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        {row.subDepartment}
                                      </td>
                                      <td className="px-4 py-2 border-r border-outline-variant font-normal text-on-surface truncate max-w-xs" title={row.issueTitle}>
                                        {row.issueTitle}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[10px] border border-outline-variant/60 font-medium">
                                          {row.storeTypeLabel || row.storeType || '-'}
                                        </span>
                                      </td>

                                      {allChildExpenseColumns.map(colName => {
                                        const amt = row.amountsByType[colName];
                                        return (
                                          <td
                                            key={colName}
                                            className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-[11px] text-on-surface"
                                          >
                                            {amt !== undefined && amt > 0 ? (
                                              <span className="font-semibold">{amt.toFixed(3)}</span>
                                            ) : (
                                              <span className="text-on-surface-variant/40">-</span>
                                            )}
                                          </td>
                                        );
                                      })}

                                      <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-500/5">
                                        {row.total.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))}

                                  {/* STORE TYPE SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={7} className="px-4 py-2 text-right text-on-surface font-semibold uppercase">
                                      Type Subtotal ({typeGroup.typeName}):
                                    </td>
                                    {allChildExpenseColumns.map(colName => {
                                      const sum = typeGroup.subtotalByType[colName] || 0;
                                      return (
                                        <td
                                          key={colName}
                                          className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-on-surface"
                                        >
                                          {sum > 0 ? (
                                            <span className="font-semibold">{sum.toFixed(3)}</span>
                                          ) : (
                                            <span className="text-on-surface-variant/40">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10">
                                      KD {typeGroup.typeTotal.toFixed(3)}
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          )}
                        </tbody>

                        <tfoot className="bg-surface-container-high font-bold border-t-2 border-outline-variant text-xs sticky bottom-0 z-10 shadow-lg">
                          <tr>
                            <td colSpan={groupByLocation ? 5 : 7} className="px-4 py-3 text-on-surface font-extrabold uppercase">
                              {groupByLocation ? `Total (${storewiseTypeTotals.uniqueLocationsCount} Locations)` : 'Total'}
                            </td>

                            {allChildExpenseColumns.map(colName => {
                              const amt = storewiseTypeTotals.colTotals[colName] || 0;
                              return (
                                <td
                                  key={`store_type_total_${colName}`}
                                  className="px-2.5 py-3 text-right border-r border-outline-variant font-extrabold font-mono text-on-surface"
                                >
                                  {amt > 0 ? amt.toFixed(3) : '-'}
                                </td>
                              );
                            })}

                            <td className="px-3.5 py-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm bg-emerald-500/15">
                              KD {storewiseTypeTotals.grandTotal.toFixed(3)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    {/* Dynamic Ledger Batch Selector Pills */}
                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-surface-container p-2.5 rounded border border-outline-variant print:hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setSelectedBatchFilter('all')}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${selectedBatchFilter === 'all'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                            }`}
                        >
                          All Batches ({structuredRows.length} tickets | {allExpenses.length} exp)
                        </button>
                        {dynamicLedgerBatches.map(bName => {
                          const count = structuredRows.filter(r => (r.ledgerBatch || '').trim().toLowerCase() === bName.trim().toLowerCase()).length;
                          const expCount = allExpenses.filter(e => (e.batch_name || '').trim().toLowerCase() === bName.trim().toLowerCase()).length;
                          return (
                            <button
                              key={bName}
                              onClick={() => setSelectedBatchFilter(bName)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${selectedBatchFilter === bName
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                                }`}
                            >
                              {bName} ({count} tickets | {expCount} exp)
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2.5 bg-primary/10 border border-primary/25 rounded px-4 py-2.5 text-xs text-primary font-bold">
                      <h3 className="text-md font-bold tracking-wider flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-primary" />
                        <span>{selectedBatchFilter === 'all' ? 'Location Detailed Report' : selectedBatchFilter}</span>
                      </h3>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            groupByLocation
                              ? "text-[11px] font-normal text-on-surface-variant"
                              : "text-[10px] font-normal text-red-600 animate-pulse"
                          }
                        >
                          {groupByLocation
                            ? `Grouped by location (${userwiseGrandTotals.uniqueLocationsCount} locations)`
                            : "⚠ Location Will Be repeated"}
                        </span>
                      </div>
                    </div>

                    {/* Table with Multi-Level Headers */}
                    <div className="border border-outline-variant rounded overflow-x-auto bg-surface-container shadow-2xs">
                      <table className="w-full text-xs text-left text-on-surface border-collapse">
                        <thead className="bg-surface-container-high text-on-surface-variant text-[11px] font-bold border-b-2 border-outline-variant sticky top-0 z-10">
                          <tr>
                            {groupByLocation ? (
                              <>
                                <th rowSpan={2} className="px-2.5 py-2.5 border-r border-outline-variant text-center w-12 font-bold">SL</th>
                                <th rowSpan={2} className="px-3.5 py-2.5 border-r border-outline-variant text-left font-bold min-w-[150px]">TICKET -NO</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant text-left font-bold">LOCATION</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-left font-bold">SUB DEPARTMENT</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant text-left font-bold">SUMMARY[Exp]</th>
                              </>
                            ) : (
                              <>
                                <th rowSpan={2} className="px-2.5 py-2.5 border-r border-outline-variant text-center">SLNO</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant text-center">BUNDLE ID</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">TICKET -NO</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">LOCATION</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">SUB DEPARTMENT</th>
                                <th rowSpan={2} className="px-4 py-2.5 border-r border-outline-variant">Issue Title (Consolidation)</th>
                                <th rowSpan={2} className="px-3 py-2.5 border-r border-outline-variant">Ledger Group</th>
                              </>
                            )}

                            {/* Parent Expense Categories */}
                            {expenseColumnsHierarchy.map(cat => (
                              <th
                                key={cat.parentName}
                                colSpan={cat.children.length}
                                className="px-3 py-1.5 text-center border-r border-outline-variant bg-surface-container-lowest font-bold text-primary uppercase tracking-wider text-[10px]"
                              >
                                {cat.parentName}
                              </th>
                            ))}

                            <th rowSpan={2} className="px-3.5 py-2.5 text-right font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                              TOTAL
                            </th>
                          </tr>

                          <tr>
                            {expenseColumnsHierarchy.map(cat => (
                              cat.children.map(child => (
                                <th
                                  key={`${cat.parentName}_${child}`}
                                  className="px-2.5 py-1.5 text-right border-r border-outline-variant bg-surface-container-low font-medium text-[10px] text-on-surface-variant whitespace-nowrap"
                                >
                                  {child}
                                </th>
                              ))
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-outline-variant/60 text-xs">
                          {groupByLocation ? (
                            storewiseFilteredByBatch.length === 0 ? (
                              <tr>
                                <td colSpan={5 + allChildExpenseColumns.length + 1} className="p-8 text-center text-on-surface-variant">
                                  No records found for the selected criteria.
                                </td>
                              </tr>
                            ) : (
                              storewiseFilteredByBatch.map(batch => (
                                <React.Fragment key={batch.batchName}>
                                  {/* BATCH HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary print:break-before-page">
                                    <td
                                      colSpan={5 + allChildExpenseColumns.length + 1}
                                      className="px-4 py-2.5 text-xs tracking-wide"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Boxes className="w-4 h-4 text-primary" />
                                          <span className="font-bold">🔹 LEDGER BATCH: {batch.batchName}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {batch.rows.length} Tickets
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                          Subtotal: KD {batch.batchTotal.toFixed(3)}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* BATCH LOCATION ROWS */}
                                  {batch.locationRows.map((locRow, idx) => (
                                    <tr key={locRow.location || idx} className="hover:bg-surface-container-high/40 transition-colors">
                                      <td className="px-2.5 py-2.5 border-r border-outline-variant text-center font-mono text-on-surface-variant text-[11px]">
                                        {idx + 1}
                                      </td>
                                      <td className="px-3.5 py-2.5 border-r border-outline-variant font-mono text-[11px]">
                                        <div className="flex flex-col gap-0.5 whitespace-nowrap font-semibold text-primary">
                                          {locRow.ticketLines && locRow.ticketLines.length > 0 ? (
                                            locRow.ticketLines.map((line, lIdx) => (
                                              <span key={lIdx}>{line}</span>
                                            ))
                                          ) : (
                                            <span>{locRow.expNoStr || '-'}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 border-r border-outline-variant font-bold text-on-surface">
                                        <div className="flex items-center gap-1.5">
                                          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                                          <span>{locRow.location}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        {locRow.subDeptStr || '-'}
                                      </td>
                                      <td className="px-4 py-2.5 border-r border-outline-variant text-on-surface text-[11px] max-w-sm truncate" title={locRow.summary}>
                                        <span className="font-medium text-on-surface">{locRow.summary}</span>
                                      </td>

                                      {allChildExpenseColumns.map(colName => {
                                        const amt = locRow.amountsByType[colName];
                                        return (
                                          <td
                                            key={colName}
                                            className="px-2.5 py-2.5 text-right border-r border-outline-variant font-mono text-[11px] text-on-surface"
                                          >
                                            {amt !== undefined && amt > 0 ? (
                                              <span className="font-semibold">{amt.toFixed(3)}</span>
                                            ) : (
                                              <span className="text-on-surface-variant/40">-</span>
                                            )}
                                          </td>
                                        );
                                      })}

                                      <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-500/5">
                                        {locRow.total.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))}

                                  {/* BATCH SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={5} className="px-4 py-2 text-right text-on-surface font-semibold uppercase">
                                      Batch Subtotal ({batch.batchName}):
                                    </td>
                                    {allChildExpenseColumns.map(colName => {
                                      const sum = batch.subtotalByType[colName] || 0;
                                      return (
                                        <td
                                          key={colName}
                                          className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-on-surface"
                                        >
                                          {sum > 0 ? (
                                            <span className="font-semibold">{sum.toFixed(3)}</span>
                                          ) : (
                                            <span className="text-on-surface-variant/40">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10">
                                      KD {batch.batchTotal.toFixed(3)}
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          ) : (
                            storewiseFilteredByBatch.length === 0 ? (
                              <tr>
                                <td colSpan={8 + allChildExpenseColumns.length} className="p-8 text-center text-on-surface-variant">
                                  No records found for the selected ledger batch.
                                </td>
                              </tr>
                            ) : (
                              storewiseFilteredByBatch.map(batch => (
                                <React.Fragment key={batch.batchName}>
                                  {/* BATCH HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary print:break-before-page">
                                    <td
                                      colSpan={7 + allChildExpenseColumns.length + 1}
                                      className="px-4 py-2 text-xs tracking-wide"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Boxes className="w-4 h-4 text-primary" />
                                          <span className="font-bold">🔹 LEDGER BATCH: {batch.batchName}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {batch.rows.length} Tickets
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                          Subtotal: KD {batch.batchTotal.toFixed(3)}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* BATCH ROWS */}
                                  {batch.rows.map((row, idx) => (
                                    <tr key={row.uniqueKey || idx} className="hover:bg-surface-container-high/40 transition-colors">
                                      <td className="px-2.5 py-2 border-r border-outline-variant text-center font-mono text-on-surface-variant text-[11px]">
                                        {idx + 1}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-center font-mono text-primary font-semibold text-[11px]">
                                        #{row.bundleId}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-mono font-medium text-[11px]">
                                        {row.ticketObj && setSelectedTicketForModal ? (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedTicketForModal(row.ticketObj)}
                                            className="text-primary hover:underline cursor-pointer font-bold"
                                          >
                                            {row.expNo}
                                          </button>
                                        ) : (
                                          <span>{row.expNo}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant font-medium text-on-surface">
                                        {row.location}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        {row.subDepartment}
                                      </td>
                                      <td className="px-4 py-2 border-r border-outline-variant font-normal text-on-surface truncate max-w-xs" title={row.issueTitle}>
                                        {row.issueTitle}
                                      </td>
                                      <td className="px-3 py-2 border-r border-outline-variant text-on-surface-variant text-[11px]">
                                        <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[10px] border border-outline-variant/60 font-medium">
                                          {row.ledgerBatch}
                                        </span>
                                      </td>

                                      {allChildExpenseColumns.map(colName => {
                                        const amt = row.amountsByType[colName];
                                        return (
                                          <td
                                            key={colName}
                                            className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-[11px] text-on-surface"
                                          >
                                            {amt !== undefined && amt > 0 ? (
                                              <span className="font-semibold">{amt.toFixed(3)}</span>
                                            ) : (
                                              <span className="text-on-surface-variant/40">-</span>
                                            )}
                                          </td>
                                        );
                                      })}

                                      <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-500/5">
                                        {row.total.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))}

                                  {/* BATCH SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={7} className="px-4 py-2 text-right text-on-surface font-semibold uppercase">
                                      Batch Subtotal ({batch.batchName}):
                                    </td>
                                    {allChildExpenseColumns.map(colName => {
                                      const sum = batch.subtotalByType[colName] || 0;
                                      return (
                                        <td
                                          key={colName}
                                          className="px-2.5 py-2 text-right border-r border-outline-variant font-mono text-on-surface"
                                        >
                                          {sum > 0 ? (
                                            <span className="font-semibold">{sum.toFixed(3)}</span>
                                          ) : (
                                            <span className="text-on-surface-variant/40">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-3.5 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10">
                                      KD {batch.batchTotal.toFixed(3)}
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          )}
                        </tbody>

                        <tfoot className="bg-surface-container-high font-bold border-t-2 border-outline-variant text-xs sticky bottom-0 z-10 shadow-lg">
                          <tr>
                            <td colSpan={groupByLocation ? 5 : 7} className="px-4 py-3 text-on-surface font-extrabold uppercase">
                              {groupByLocation ? `Total (${locationGroupedRows.length} Locations)` : 'Total'}
                            </td>

                            {allChildExpenseColumns.map(colName => {
                              const amt = storewiseTotals.colTotals[colName] || 0;
                              return (
                                <td
                                  key={`store_total_${colName}`}
                                  className="px-2.5 py-3 text-right border-r border-outline-variant font-extrabold font-mono text-on-surface"
                                >
                                  {amt > 0 ? amt.toFixed(3) : '-'}
                                </td>
                              );
                            })}

                            <td className="px-3.5 py-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm bg-emerald-500/15">
                              KD {storewiseTotals.total.toFixed(3)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7-TIER VERIFICATION & AUTHORIZATION WORKFLOW (BOTTOM SIDE) */}
            {/* {renderSignaturesBlock()} */}

          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 border-t border-outline-variant bg-surface-container-low flex items-center justify-between shrink-0">
          <span className="text-[11px] text-on-surface-variant">
            Official Financial Settlement Document • {currentGroupName}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
