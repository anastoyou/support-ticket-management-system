import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2, XCircle, AlertCircle, Clock, Calendar,
    User, Search, RefreshCw, Filter, Check, X,
    ChevronLeft, ChevronRight, Palmtree, Sun, Sunrise, Sunset,
    ShieldAlert, MessageSquare, Building2, Wrench, FileText,
    CheckCheck, AlertTriangle, Eye, ArrowUpDown, ChevronDown
} from 'lucide-react';
import type { RootState } from '@/store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface AdminLeaveItem {
    leave_id: number;
    worker: number;
    worker_name?: string;
    worker_employee_no?: string;
    worker_role?: string;
    worker_department?: string;
    leave_type: 'annual' | 'sick' | 'casual' | 'unpaid' | string;
    leave_type_display: string;
    start_date: string;
    end_date: string;
    is_half_day: boolean;
    half_day_slot?: 'first_half' | 'second_half' | '' | string;
    half_day_slot_display?: string;
    duration_days: number;
    hours: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    status_display: string;
    approved_by?: number;
    approved_by_name?: string;
    admin_notes?: string;
    created_at: string;
    updated_at: string;
}

interface LeaveStats {
    total: number;
    pending: number;
    approved_this_month: number;
    active_today: number;
    rejected: number;
}

export const EmployeeLeaveAdminView: React.FC = () => {
    const { token, user } = useSelector((state: RootState) => state.auth);

    // Main data states
    const [leaves, setLeaves] = useState<AdminLeaveItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [stats, setStats] = useState<LeaveStats>({
        total: 0,
        pending: 0,
        approved_this_month: 0,
        active_today: 0,
        rejected: 0,
    });

    // Filter states
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('all');
    const [search, setSearch] = useState<string>('');
    const [monthFilter, setMonthFilter] = useState<string>(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    });

    // Selection states for bulk actions
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Modal states
    const [rejectingItem, setRejectingItem] = useState<AdminLeaveItem | null>(null);
    const [rejectReason, setRejectReason] = useState<string>('');
    const [inspectingItem, setInspectingItem] = useState<AdminLeaveItem | null>(null);

    // Toast alert messages
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(10);

    const showToast = (type: 'success' | 'error', text: string) => {
        setFeedback({ type, text });
        setTimeout(() => setFeedback(null), 4000);
    };

    // Fetch stats
    const fetchStats = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/maintenance/leaves/stats/`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (err) {
            console.error('Failed to fetch leave stats:', err);
        }
    }, [token]);

    // Fetch leaves list
    const fetchLeaves = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter && statusFilter !== 'all') {
                params.set('status', statusFilter);
            }
            if (leaveTypeFilter && leaveTypeFilter !== 'all') {
                params.set('leave_type', leaveTypeFilter);
            }
            if (search.trim()) {
                params.set('search', search.trim());
            }
            if (monthFilter) {
                const [year, month] = monthFilter.split('-');
                if (year && month) {
                    params.set('year', year);
                    params.set('month', month);
                }
            }

            const res = await fetch(`${API_URL}/maintenance/leaves/?${params.toString()}`, {
                headers: { Authorization: `Token ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.results || []);
                setLeaves(list);
            } else {
                showToast('error', 'Failed to load employee leave requests.');
            }
        } catch (err) {
            console.error('Failed to fetch leaves:', err);
            showToast('error', 'An error occurred while loading leave requests.');
        } finally {
            setLoading(false);
        }
    }, [token, statusFilter, leaveTypeFilter, search, monthFilter]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        fetchLeaves();
        setSelectedIds([]);
        setCurrentPage(1);
    }, [fetchLeaves]);

    // Approve a single leave
    const handleApprove = async (leave: AdminLeaveItem) => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/leaves/${leave.leave_id}/approve/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });
            if (res.ok) {
                showToast('success', `Approved leave for ${leave.worker_name || 'Worker'} successfully.`);
                fetchLeaves();
                fetchStats();
            } else {
                const errData = await res.json().catch(() => ({}));
                showToast('error', errData.detail || 'Failed to approve leave.');
            }
        } catch {
            showToast('error', 'An error occurred while approving leave.');
        } finally {
            setActionLoading(false);
        }
    };

    // Confirm rejection
    const handleConfirmReject = async () => {
        if (!rejectingItem) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/leaves/${rejectingItem.leave_id}/reject/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ admin_notes: rejectReason.trim() }),
            });
            if (res.ok) {
                showToast('success', `Rejected leave request for ${rejectingItem.worker_name || 'Worker'}.`);
                setRejectingItem(null);
                setRejectReason('');
                fetchLeaves();
                fetchStats();
            } else {
                const errData = await res.json().catch(() => ({}));
                showToast('error', errData.detail || 'Failed to reject leave.');
            }
        } catch {
            showToast('error', 'An error occurred while rejecting leave.');
        } finally {
            setActionLoading(false);
        }
    };

    // Bulk approve selected pending leaves
    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to approve all ${selectedIds.length} selected leave request(s)?`)) return;

        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/leaves/bulk_approve/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ leave_ids: selectedIds }),
            });
            if (res.ok) {
                const data = await res.json();
                showToast('success', `Successfully approved ${data.approved_count || selectedIds.length} leave requests.`);
                setSelectedIds([]);
                fetchLeaves();
                fetchStats();
            } else {
                showToast('error', 'Failed to bulk approve leaves.');
            }
        } catch {
            showToast('error', 'An error occurred during bulk approval.');
        } finally {
            setActionLoading(false);
        }
    };

    // Selection helpers
    const toggleSelectAll = () => {
        const pendingOnPage = paginatedData.filter(l => l.status === 'pending').map(l => l.leave_id);
        const allSelected = pendingOnPage.length > 0 && pendingOnPage.every(id => selectedIds.includes(id));
        if (allSelected) {
            setSelectedIds(prev => prev.filter(id => !pendingOnPage.includes(id)));
        } else {
            setSelectedIds(prev => Array.from(new Set([...prev, ...pendingOnPage])));
        }
    };

    const toggleSelectRow = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Pagination calculations
    const totalItems = leaves.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedData = leaves.slice(startIndex, endIndex);

    // Leave type styling pill
    const getLeaveTypeBadge = (type: string, isHalf: boolean, slot?: string) => {
        switch (type) {
            case 'annual':
                return {
                    label: 'Annual Leave',
                    icon: Palmtree,
                    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
                };
            case 'sick':
                return {
                    label: isHalf ? `Sick Leave (${slot === 'first_half' ? '1st Half' : '2nd Half'})` : 'Sick Leave',
                    icon: Sunrise,
                    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
                };
            case 'casual':
                return {
                    label: isHalf ? `Casual Leave (${slot === 'first_half' ? '1st Half' : '2nd Half'})` : 'Casual Leave',
                    icon: Sun,
                    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
                };
            case 'unpaid':
            default:
                return {
                    label: 'Unpaid Leave',
                    icon: ShieldAlert,
                    className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
                };
        }
    };

    // Status pill
    const getStatusPill = (status: AdminLeaveItem['status']) => {
        switch (status) {
            case 'approved':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Approved
                    </span>
                );
            case 'pending':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                        <Clock className="w-3 h-3 text-amber-600" />
                        Pending Approval
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-300 dark:border-red-800">
                        <XCircle className="w-3 h-3 text-red-600" />
                        Rejected
                    </span>
                );
            case 'cancelled':
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        <AlertCircle className="w-3 h-3 text-slate-500" />
                        Cancelled
                    </span>
                );
        }
    };

    return (
        <div className="space-y-4">
            {/* Toast feedback notification */}
            <AnimatePresence>
                {feedback && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`p-3 rounded border text-xs font-semibold flex items-center justify-between gap-3 shadow-md ${
                            feedback.type === 'success'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                                : 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/60 dark:text-red-200'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            {feedback.type === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                            )}
                            <span>{feedback.text}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFeedback(null)}
                            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Top KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                    onClick={() => setStatusFilter('pending')}
                    className={`p-3.5 rounded border transition-all cursor-pointer ${
                        statusFilter === 'pending'
                            ? 'bg-amber-500/10 border-amber-500/50 ring-2 ring-amber-500/30'
                            : 'bg-surface-container border-outline-variant hover:bg-surface-container-high'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                            Pending Requests
                        </span>
                        <div className="w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-xl font-bold text-on-surface tabular-nums">
                            {stats.pending}
                        </span>
                        {stats.pending > 0 && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded-full">
                                Action Needed
                            </span>
                        )}
                    </div>
                </div>

                <div
                    onClick={() => setStatusFilter('approved')}
                    className={`p-3.5 rounded border transition-all cursor-pointer ${
                        statusFilter === 'approved'
                            ? 'bg-emerald-500/10 border-emerald-500/50 ring-2 ring-emerald-500/30'
                            : 'bg-surface-container border-outline-variant hover:bg-surface-container-high'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                            Approved This Month
                        </span>
                        <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <span className="text-xl font-bold text-on-surface tabular-nums">
                            {stats.approved_this_month}
                        </span>
                    </div>
                </div>

                <div className="p-3.5 rounded border bg-surface-container border-outline-variant">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                            Workers Away Today
                        </span>
                        <div className="w-7 h-7 rounded-full bg-sky-500/15 text-sky-600 flex items-center justify-center">
                            <Palmtree className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <span className="text-xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                            {stats.active_today}
                        </span>
                    </div>
                </div>

                <div
                    onClick={() => setStatusFilter('rejected')}
                    className={`p-3.5 rounded border transition-all cursor-pointer ${
                        statusFilter === 'rejected'
                            ? 'bg-red-500/10 border-red-500/50 ring-2 ring-red-500/30'
                            : 'bg-surface-container border-outline-variant hover:bg-surface-container-high'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                            Rejected Requests
                        </span>
                        <div className="w-7 h-7 rounded-full bg-red-500/15 text-red-600 flex items-center justify-center">
                            <XCircle className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <span className="text-xl font-bold text-on-surface tabular-nums">
                            {stats.rejected}
                        </span>
                    </div>
                </div>
            </div>

            {/* Filter and Control Toolbar */}
            <div className="p-3.5 rounded bg-surface-container border border-outline-variant space-y-3">
                {/* Row 1: Search + Dropdowns + Refresh */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by employee name, ID, or reason..."
                                className="w-full pl-8 pr-8 py-1.5 text-xs rounded bg-surface-container-low border border-outline-variant text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Leave Type Filter */}
                        <select
                            value={leaveTypeFilter}
                            onChange={e => setLeaveTypeFilter(e.target.value)}
                            className="bg-surface-container-low border border-outline-variant text-on-surface text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary cursor-pointer shrink-0"
                        >
                            <option value="all">All Leave Types</option>
                            <option value="annual">Annual Leave</option>
                            <option value="sick">Sick Leave</option>
                            <option value="casual">Casual Leave</option>
                            <option value="unpaid">Unpaid Leave</option>
                        </select>

                        {/* Month Filter */}
                        <input
                            type="month"
                            value={monthFilter}
                            onChange={e => setMonthFilter(e.target.value)}
                            className="bg-surface-container-low border border-outline-variant text-on-surface text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary cursor-pointer shrink-0"
                            title="Filter by Month"
                        />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* Bulk Approve button if items selected */}
                        {selectedIds.length > 0 && (
                            <button
                                type="button"
                                onClick={handleBulkApprove}
                                disabled={actionLoading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Approve Selected ({selectedIds.length})</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                fetchLeaves();
                                fetchStats();
                            }}
                            disabled={loading}
                            className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                            title="Refresh leave requests"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                    </div>
                </div>

                {/* Row 2: Status Pill Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-outline-variant/60">
                    {[
                        { id: 'pending', label: 'Pending Approval', count: stats.pending, isAlert: stats.pending > 0 },
                        { id: 'approved', label: 'Approved', count: null, isAlert: false },
                        { id: 'rejected', label: 'Rejected', count: stats.rejected, isAlert: false },
                        { id: 'all', label: 'All Requests', count: stats.total, isAlert: false },
                        { id: 'cancelled', label: 'Cancelled', count: null, isAlert: false },
                    ].map(tab => {
                        const isActive = statusFilter === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setStatusFilter(tab.id)}
                                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                                    isActive
                                        ? 'bg-primary text-on-primary shadow-xs'
                                        : 'bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant'
                                }`}
                            >
                                <span>{tab.label}</span>
                                {tab.count !== null && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                                        isActive
                                            ? 'bg-white/20 text-white'
                                            : tab.isAlert
                                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                            : 'bg-surface-container-high text-on-surface-variant'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Leave Requests Table */}
            <div className="border border-outline-variant rounded bg-surface-container overflow-hidden shadow-xs">
                {loading ? (
                    <div className="p-12 text-center text-on-surface-variant space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
                        <p className="text-xs font-medium">Loading employee leave requests...</p>
                    </div>
                ) : leaves.length === 0 ? (
                    <div className="p-12 text-center text-on-surface-variant space-y-2">
                        <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center mx-auto text-on-surface-variant">
                            <Palmtree className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-semibold text-on-surface">No Leave Requests Found</h4>
                        <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
                            {statusFilter === 'pending'
                                ? 'There are currently no pending leave requests awaiting approval.'
                                : 'No leave records match the selected filters. Try adjusting your search or month.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-surface-container-low border-b border-outline-variant text-[11px] font-bold text-on-surface-variant uppercase tracking-wider select-none">
                                    <tr>
                                        {statusFilter === 'pending' && (
                                            <th className="py-3 px-3 w-8 text-center">
                                                <input
                                                    type="checkbox"
                                                    onChange={toggleSelectAll}
                                                    checked={
                                                        paginatedData.filter(l => l.status === 'pending').length > 0 &&
                                                        paginatedData
                                                            .filter(l => l.status === 'pending')
                                                            .every(l => selectedIds.includes(l.leave_id))
                                                    }
                                                    className="rounded border-outline cursor-pointer accent-primary"
                                                />
                                            </th>
                                        )}
                                        <th className="py-3 px-4">Employee</th>
                                        <th className="py-3 px-4">Leave Type</th>
                                        <th className="py-3 px-4">Duration &amp; Date</th>
                                        <th className="py-3 px-4 text-right">Deduction</th>
                                        <th className="py-3 px-4">Reason / Notes</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant">
                                    {paginatedData.map(item => {
                                        const isSelected = selectedIds.includes(item.leave_id);
                                        const typeBadge = getLeaveTypeBadge(item.leave_type, item.is_half_day, item.half_day_slot);
                                        const TypeIcon = typeBadge.icon;

                                        return (
                                            <tr
                                                key={item.leave_id}
                                                className={`transition-colors hover:bg-surface-container-high/60 ${
                                                    isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                                                }`}
                                            >
                                                {/* Checkbox column for pending */}
                                                {statusFilter === 'pending' && (
                                                    <td className="py-3 px-3 text-center">
                                                        {item.status === 'pending' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggleSelectRow(item.leave_id)}
                                                                className="rounded border-outline cursor-pointer accent-primary"
                                                            />
                                                        ) : (
                                                            <span className="text-on-surface-variant/30">&bull;</span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* Employee details */}
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                                            {(item.worker_name || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-on-surface truncate">
                                                                {item.worker_name || `Worker #${item.worker}`}
                                                            </div>
                                                            <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5 flex-wrap">
                                                                {item.worker_employee_no && (
                                                                    <span className="font-mono">{item.worker_employee_no}</span>
                                                                )}
                                                                {item.worker_role && (
                                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high border border-outline-variant/60">
                                                                        {item.worker_role}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Leave Type */}
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border ${typeBadge.className}`}>
                                                        <TypeIcon className="w-3.5 h-3.5 shrink-0" />
                                                        <span>{typeBadge.label}</span>
                                                    </span>
                                                </td>

                                                {/* Duration & Dates */}
                                                <td className="py-3 px-4">
                                                    <div className="font-semibold text-on-surface font-mono text-[11px]">
                                                        {item.start_date === item.end_date ? (
                                                            <span>{item.start_date}</span>
                                                        ) : (
                                                            <span>{item.start_date} &rarr; {item.end_date}</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-on-surface-variant mt-0.5">
                                                        {item.is_half_day ? (
                                                            <span>
                                                                {item.half_day_slot_display || (item.half_day_slot === 'first_half' ? 'First Half (Morning)' : 'Second Half (Afternoon)')}
                                                            </span>
                                                        ) : (
                                                            <span>{item.duration_days} Day{item.duration_days > 1 ? 's' : ''} (Full Day)</span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Hours deduction */}
                                                <td className="py-3 px-4 text-right">
                                                    <span className="font-bold text-on-surface tabular-nums">
                                                        {Number(item.hours).toFixed(1)} hrs
                                                    </span>
                                                    <div className="text-[10px] text-on-surface-variant">
                                                        deducted
                                                    </div>
                                                </td>

                                                {/* Reason / Notes */}
                                                <td className="py-3 px-4 max-w-[200px]">
                                                    {item.reason ? (
                                                        <p className="truncate text-on-surface" title={item.reason}>
                                                            {item.reason}
                                                        </p>
                                                    ) : (
                                                        <span className="text-on-surface-variant/50 italic">None specified</span>
                                                    )}
                                                    {item.admin_notes && (
                                                        <p className="text-[10px] text-red-600 dark:text-red-400 truncate mt-0.5" title={`Admin Note: ${item.admin_notes}`}>
                                                            Note: {item.admin_notes}
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Status */}
                                                <td className="py-3 px-4">
                                                    {getStatusPill(item.status)}
                                                    {item.approved_by_name && (
                                                        <div className="text-[10px] text-on-surface-variant mt-0.5">
                                                            by {item.approved_by_name}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Action buttons */}
                                                <td className="py-3 px-4 text-right">
                                                    {item.status === 'pending' ? (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApprove(item)}
                                                                disabled={actionLoading}
                                                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                                                                title="Approve Leave Request"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                                <span>Approve</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setRejectingItem(item);
                                                                    setRejectReason('');
                                                                }}
                                                                disabled={actionLoading}
                                                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                                                                title="Reject Leave Request"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                                <span>Reject</span>
                                                            </button>
                                                        </div>
                                                    ) : item.status === 'rejected' ? (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApprove(item)}
                                                                disabled={actionLoading}
                                                                className="bg-emerald-600/90 hover:bg-emerald-700 text-white text-xs font-medium px-2 py-1.5 rounded inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                                                                title="Re-Approve this leave"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                                <span>Re-Approve</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setInspectingItem(item)}
                                                                className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-2 py-1.5 rounded inline-flex items-center gap-1 transition-colors cursor-pointer"
                                                                title="View Details"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-on-surface-variant" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setInspectingItem(item)}
                                                                className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-2.5 py-1.5 rounded inline-flex items-center gap-1 transition-colors cursor-pointer"
                                                                title="View Details"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-on-surface-variant" />
                                                                <span>Details</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Bar */}
                        <div className="p-3 border-t border-outline-variant flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant">
                            <div>
                                Showing <span className="font-semibold text-on-surface">{startIndex + 1}</span> to{' '}
                                <span className="font-semibold text-on-surface">{endIndex}</span> of{' '}
                                <span className="font-semibold text-on-surface">{totalItems}</span> records
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <span>Rows per page:</span>
                                    <select
                                        value={itemsPerPage}
                                        onChange={e => {
                                            setItemsPerPage(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="bg-surface-container-low border border-outline-variant text-on-surface rounded px-2 py-1 text-xs focus:outline-none"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        className="p-1.5 rounded border border-outline-variant hover:bg-surface-container-high disabled:opacity-30 cursor-pointer"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="px-2 font-semibold text-on-surface">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="p-1.5 rounded border border-outline-variant hover:bg-surface-container-high disabled:opacity-30 cursor-pointer"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Rejection Remarks Modal */}
            <AnimatePresence>
                {rejectingItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.6 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setRejectingItem(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            className="relative bg-surface-container border border-outline-variant w-full max-w-md rounded shadow-2xl overflow-hidden z-10 p-5 text-on-surface"
                        >
                            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-red-500/15 text-red-600 flex items-center justify-center font-bold">
                                        <XCircle className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-on-surface">Reject Leave Request</h4>
                                        <p className="text-xs text-on-surface-variant">
                                            For {rejectingItem.worker_name || 'Worker'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setRejectingItem(null)}
                                    className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="py-4 space-y-3 text-xs">
                                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                    <div className="flex justify-between text-on-surface font-semibold">
                                        <span>{rejectingItem.leave_type_display}</span>
                                        <span>{Number(rejectingItem.hours).toFixed(1)} hrs</span>
                                    </div>
                                    <div className="text-[11px] text-on-surface-variant mt-0.5">
                                        {rejectingItem.start_date} {rejectingItem.start_date !== rejectingItem.end_date && `→ ${rejectingItem.end_date}`}
                                    </div>
                                    {rejectingItem.reason && (
                                        <p className="text-[11px] text-on-surface-variant italic mt-1">
                                            "{rejectingItem.reason}"
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-on-surface mb-1">
                                        Reason for Rejection (Optional)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        placeholder="Explain reason to employee (e.g. operational staffing requirement, overlapping critical tasks)..."
                                        className="w-full bg-surface-container-low border border-outline/50 text-on-surface text-xs rounded p-2.5 focus:outline-none focus:border-red-500 resize-y"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant">
                                <button
                                    type="button"
                                    onClick={() => setRejectingItem(null)}
                                    disabled={actionLoading}
                                    className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3.5 py-2 rounded transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmReject}
                                    disabled={actionLoading}
                                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                >
                                    {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Inspect / Quick Details Modal */}
            <AnimatePresence>
                {inspectingItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.6 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setInspectingItem(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            className="relative bg-surface-container border border-outline-variant w-full max-w-lg rounded shadow-2xl overflow-hidden z-10 p-5 text-on-surface"
                        >
                            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-on-surface">Leave Record Details</h4>
                                        <p className="text-xs text-on-surface-variant font-mono">
                                            REF #{inspectingItem.leave_id} &bull; {inspectingItem.worker_name}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setInspectingItem(null)}
                                    className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="py-4 space-y-3.5 text-xs">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                        <div className="text-[10px] text-on-surface-variant uppercase font-semibold">Employee</div>
                                        <div className="font-bold text-on-surface mt-0.5">{inspectingItem.worker_name}</div>
                                        <div className="text-[11px] text-on-surface-variant">{inspectingItem.worker_role || 'Technician'}</div>
                                    </div>

                                    <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                        <div className="text-[10px] text-on-surface-variant uppercase font-semibold">Status</div>
                                        <div className="mt-1">{getStatusPill(inspectingItem.status)}</div>
                                        {inspectingItem.approved_by_name && (
                                            <div className="text-[10px] text-on-surface-variant mt-1">
                                                By: {inspectingItem.approved_by_name}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                        <div className="text-[10px] text-on-surface-variant uppercase font-semibold">Leave Type</div>
                                        <div className="font-bold text-on-surface mt-0.5">{inspectingItem.leave_type_display}</div>
                                        <div className="text-[11px] text-on-surface-variant">
                                            {inspectingItem.is_half_day ? (inspectingItem.half_day_slot_display || 'Half Day') : 'Full Day'}
                                        </div>
                                    </div>

                                    <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                        <div className="text-[10px] text-on-surface-variant uppercase font-semibold">Deduction</div>
                                        <div className="font-bold text-on-surface mt-0.5 tabular-nums">{Number(inspectingItem.hours).toFixed(1)} Hours</div>
                                        <div className="text-[11px] text-on-surface-variant">{inspectingItem.duration_days} Day(s)</div>
                                    </div>
                                </div>

                                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                    <div className="text-[10px] text-on-surface-variant uppercase font-semibold">Date Range</div>
                                    <div className="font-semibold text-on-surface mt-0.5 font-mono">
                                        {inspectingItem.start_date} {inspectingItem.start_date !== inspectingItem.end_date && `→ ${inspectingItem.end_date}`}
                                    </div>
                                </div>

                                {inspectingItem.reason && (
                                    <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                                        <div className="text-[10px] text-on-surface-variant uppercase font-semibold">Worker's Reason</div>
                                        <p className="text-on-surface mt-0.5 italic">"{inspectingItem.reason}"</p>
                                    </div>
                                )}

                                {inspectingItem.admin_notes && (
                                    <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30">
                                        <div className="text-[10px] text-red-800 dark:text-red-300 uppercase font-semibold">Admin Notes / Remarks</div>
                                        <p className="text-red-900 dark:text-red-200 mt-0.5">{inspectingItem.admin_notes}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-3 border-t border-outline-variant">
                                <div className="flex items-center gap-2">
                                    {inspectingItem.status === 'pending' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleApprove(inspectingItem);
                                                    setInspectingItem(null);
                                                }}
                                                disabled={actionLoading}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Approve Leave</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const item = inspectingItem;
                                                    setInspectingItem(null);
                                                    setRejectingItem(item);
                                                    setRejectReason('');
                                                }}
                                                disabled={actionLoading}
                                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                <span>Reject Leave</span>
                                            </button>
                                        </>
                                    )}

                                    {inspectingItem.status === 'rejected' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleApprove(inspectingItem);
                                                setInspectingItem(null);
                                            }}
                                            disabled={actionLoading}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Re-Approve Leave</span>
                                        </button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setInspectingItem(null)}
                                    className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-4 py-2 rounded transition-colors cursor-pointer"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

