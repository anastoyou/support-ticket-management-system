export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface MediaFileItem {
  media_id: number;
  file_name: string;
  file_url: string;
  uploaded_date?: string;
}

export interface ExpenseItem {
  expense_id: number;
  amount: string;
  expense_date: string;
  remarks?: string;
  is_claimed: boolean;
  worker: any;
  worker_detail?: { id: number; username: string; full_name?: string; employee_no?: string; profile_image?: string | null; sub_departments?: SubDepartmentDetailItem[] };
  added_by?: any;
  added_by_detail?: { id: number; username: string; full_name?: string; employee_no?: string; role?: string; profile_image?: string | null };
  ticket?: number;
  ticket_details?: {
    ticket_id: number;
    work_order_no: string;
    title: string;
    store_id?: string;
    store_name?: string;
    store_type?: string;
    sub_department_id?: number;
    sub_department_name?: string;
    department_name?: string;
    status?: string;
    status_name?: string;
    status_short_code?: string;
  };
  sub_department_id?: number;
  sub_department_name?: string;
  expense_type?: { expense_id: number; expense_name: string; approve_required?: boolean };
  expense_type_detail?: { expense_name: string; approve_required?: boolean };
  receipts?: MediaFileItem[];
  receipt?: MediaFileItem;
  responsible_store?: { store_id: string; store_name: string; type?: string; store_type?: string };
  store_type?: string;
  approved?: boolean;
  status_display?: string;
  claim?: any;
  is_paid?: boolean;
  paid_at?: string;
  paid_by?: any;
}

export interface ApprovalStepInfo {
  step_id: number;
  step_order: number;
  step_name: string;
  assigned_role_name: string;
  assigned_users_ids?: number[];
  assigned_users_names?: string[];
  assigned_users_usernames?: string[];
  is_final_step?: boolean;
}

export interface TargetExpenseItem {
  expense_id: number;
  amount: string;
  expense_date?: string;
  expense_type_name?: string;
  remarks?: string;
  worker?: string;
  store_name?: string;
  ticket?: {
    ticket_id: number;
    work_order_no: string;
    title: string;
  };
  receipts?: MediaFileItem[];
}

export interface TargetSummaryItem {
  type: 'Bundle' | 'Ledger' | 'Expense';
  id: number;
  label: string;
  worker?: string;
  amount?: string;
  store_name?: string;
  expense_date?: string;
  expense_type_name?: string;
  remarks?: string;
  period_from?: string;
  period_to?: string;
  ticket?: {
    ticket_id: number;
    work_order_no: string;
    title: string;
  };
  tickets?: Array<{
    ticket_id: number;
    work_order_no: string;
    title: string;
  }>;
  receipts?: MediaFileItem[];
  ticket_attachments?: MediaFileItem[];
  expenses?: TargetExpenseItem[];
  bundles?: any[];
}

export interface ApprovalHistoryItem {
  instance_id: number;
  step_id?: number;
  step_order?: number;
  step_name: string;
  assigned_role_name?: string;
  action_by_username?: string;
  action_by_full_name?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Rework';
  comments?: string;
  actioned_at?: string;
  created_at?: string;
}

export interface ApprovalInstanceItem {
  instance_id: number;
  step_name: string;
  step_order?: number;
  assigned_role_name: string;
  assigned_users_ids?: number[];
  assigned_users_names?: string[];
  assigned_users_usernames?: string[];
  claim?: number;
  ledger?: number;
  expense?: number;
  action_by_username?: string;
  action_by_full_name?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Rework';
  comments?: string;
  created_at: string;
  actioned_at?: string;
  can_action?: boolean;
  claim_id?: number;
  ledger_id?: number;
  expense_id?: number;
  workflow_entity_type?: string;
  workflow_steps?: ApprovalStepInfo[];
  approval_history?: ApprovalHistoryItem[];
  target_summary?: TargetSummaryItem;
}

export interface SubDepartmentDetailItem {
  sub_department_id: number;
  sub_department_name: string;
  department?: number;
  department_name?: string;
}

export interface LedgerBatchItem {
  batch_id?: number;
  ledger_batch_id?: number;
  id?: number;
  batch_name: string;
  description?: string;
  sub_departments?: number[];
  sub_departments_detail?: SubDepartmentDetailItem[];
  active?: boolean;
  created_at?: string;
}

export interface WorkerClaimItem {
  claim_id: number;
  ledger_id?: number;
  worker?: number;
  worker_detail?: {
    id: number;
    username: string;
    full_name?: string;
    employee_no?: string;
    profile_image?: string | null;
    sub_departments?: SubDepartmentDetailItem[];
  };
  ticket_details?: {
    ticket_id: number;
    work_order_no: string;
    title: string;
    store_name?: string;
    sub_department_id?: number;
    sub_department_name?: string;
    department_name?: string;
    status?: string;
    status_name?: string;
    status_short_code?: string;
  };
  total_claimed_amount: string;
  status: 'Draft' | 'Submitted' | 'In Review' | 'Approved' | 'Rejected' | 'Rework' | 'Paid';
  claim_date: string;
  period_from?: string;
  period_to?: string;
  reject_reason?: string;
  remarks?: string;
  expenses?: ExpenseItem[];
  approval_history?: ApprovalInstanceItem[];
  approval_instances?: ApprovalInstanceItem[];
  ledger_details?: {
    ledger_id: number;
    ledger_group_id?: number;
    group_name: string;
    status: string;
    is_completed?: boolean;
    created_at?: string;
  } | null;
}

export interface LedgerGroupItem {
  ledger_group_id: number;
  group_name: string;
  total_amount: string;
  created_at: string;
  is_completed?: boolean;
  completed_at?: string;
  completed_by?: number;
  completed_by_detail?: { id: number; username: string; full_name?: string };
  is_paid?: boolean;
  paid_at?: string;
  paid_by?: number;
  paid_by_detail?: { id: number; username: string; full_name?: string };
  payment_method?: string;
  payment_reference?: string;
  payment_remarks?: string;
  recipient_name?: string;
  ledgers_count?: number;
  status?: string;
}

export interface StoreDetailItem {
  store_id: string;
  store_name: string;
  short_code?: string;
  type?: string;
  area?: { area_id: number; area_name: string };
  address?: string;
}

export interface LedgerItem {
  ledger_id: number;
  ledger_group?: number;
  ledger_group_id?: number;
  ledger_group_detail?: LedgerGroupItem;
  ledger_batch?: number;
  ledger_batch_detail?: LedgerBatchItem;
  store_detail?: StoreDetailItem;
  created_by_detail?: { username: string; full_name?: string };
  total_amount: string;
  status: 'Draft' | 'Submitted' | 'In Review' | 'Approved' | 'Rejected' | 'Rework' | 'Paid';
  created_at: string;
  bundles: WorkerClaimItem[];
  expenses?: ExpenseItem[];
  remarks?: string;
}

export interface AuditEventItem {
  event_id: number;
  entity_name: string;
  entity_id: string;
  action: string;
  actor_username?: string;
  timestamp: string;
  payload?: any;
  ip_address?: string;
}

export interface PaymentItem {
  payment_id: number;
  amount_paid: string;
  payment_method: string;
  transaction_reference?: string;
  claim?: number;
  ledger?: number;
  paid_by_username?: string;
  paid_at: string;
  remarks?: string;
}

export const getUserId = (userObj: any): number | null => {
  if (!userObj) return null;
  if (typeof userObj === 'number') return userObj;
  if (typeof userObj === 'string') {
    const parsed = parseInt(userObj, 10);
    return isNaN(parsed) ? null : parsed;
  }
  if (typeof userObj === 'object') {
    const val = userObj.user_id ?? userObj.id ?? userObj.pk;
    if (val !== undefined && val !== null) {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? null : parsed;
    }
  }
  return null;
};

export const formatDateDMY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (!str) return '';

  const dateOnly = str.split('T')[0].split(' ')[0];
  const parts = dateOnly.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${day}-${month}-${year}`;
  }

  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(dateOnly)) {
    return dateOnly.replace(/\//g, '-');
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return str;
};

