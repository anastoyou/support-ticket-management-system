import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, AlertTriangle, FileText,
    ChevronLeft, ChevronRight, RefreshCw, Download, Filter,
    MoreVertical, X, LayoutList, LayoutGrid, MapPin, Building2, Clock, User, Smartphone, Monitor
} from 'lucide-react';

import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';

import Can from '@/hooks/Can';
import {
    API_URL, statusColor, getMediaUrl
} from './TicketsTypesAndComponents';
import type { Ticket } from './TicketsTypesAndComponents';
import { TicketDetailModal } from './TicketDetailModal';
import { CreateTicketModal } from './RaiseSupportTicketForm';
import { DateRangePickerCard } from './DateRangePickerCard';
import { TicketsMapView } from './TicketsMapView';
import { usePermission } from '@/hooks/usePermission';
import { SearchableSelect } from '@/components/SearchableSelect';
import type { RootState } from '@/store';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── AG Grid v36 Theming API ─────────────────────────────────────────────────
const appTheme = themeQuartz.withParams({
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    rowHeight: 52,
    headerHeight: 44,
    cellHorizontalPaddingScale: 1.4,
    backgroundColor: '#ffffff',
    foregroundColor: '#191c1d',
    headerBackgroundColor: '#f3f4f5',
    headerTextColor: '#414754',
    rowHoverColor: '#e7e8e9',
    borderColor: '#E0E2E6',
    accentColor: '#1A73E8',
    spacing: 6,
    wrapperBorderRadius: 0,
});

// ─── Skeleton loader — mirrors AG Grid header + rows ─────────────────────────
const SkeletonGrid: React.FC = () => (
    <div className="border border-outline-variant rounded overflow-hidden">
        <div className="h-11 bg-surface-container-low border-b border-outline-variant flex items-center px-4 gap-6">
            {[160, 140, 200, 130, 140, 140, 110].map((w, i) => (
                <div key={i} className="h-3 bg-outline-variant rounded animate-pulse" style={{ width: w }} />
            ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[52px] border-b border-outline-variant flex items-center px-4 gap-6 bg-surface-container">
                {[80, 120, 180, 70, 80, 90, 60].map((w, j) => (
                    <div
                        key={j}
                        className="h-3 bg-surface-container-high rounded animate-pulse"
                        style={{ width: w, animationDelay: `${i * 60 + j * 20}ms` }}
                    />
                ))}
            </div>
        ))}
    </div>
);

// ─── Empty state ─────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ onClear: () => void }> = ({ onClear }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3 border border-t-0 border-outline-variant rounded-b bg-surface-container">
        <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
            <FileText className="w-6 h-6 text-on-surface-variant" />
        </div>
        <div className="text-sm font-semibold text-on-surface">No Tickets Found</div>
        <p className="text-xs text-on-surface-variant max-w-xs text-center">
            Try adjusting your search or filters, or raise a new support ticket.
        </p>
        <button onClick={onClear} className="mt-1 text-xs font-semibold text-primary hover:underline">
            Clear all filters
        </button>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export const TicketsView: React.FC = () => {
    const { subpage } = useParams<{ subpage: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { hasPermission } = usePermission();

    const overflowRef = useRef<HTMLDivElement>(null);
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Data lists
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [stores, setStores] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [statuses, setStatuses] = useState<any[]>([]);
    const [natures, setNatures] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [subDepartments, setSubDepartments] = useState<any[]>([]);
    const [expenseTypes, setExpenseTypes] = useState<any[]>([]);

    // Helper: compute first and last day of current month
    const getCurrentMonthRange = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const firstDay = `${year}-${month}-01`;
        const lastDayObj = new Date(year, now.getMonth() + 1, 0);
        const lastDayStr = String(lastDayObj.getDate()).padStart(2, '0');
        const lastDay = `${year}-${month}-${lastDayStr}`;
        return { fromDate: firstDay, toDate: lastDay };
    };

    // Filters & pagination
    const [search, setSearch] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('search');
        return p || '';
    });
    const [debouncedSearch, setDebouncedSearch] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('search');
        return p || '';
    });
    const [filterStore, setFilterStore] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('store');
        return p || '';
    });
    const [filterDept, setFilterDept] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('department') || new URLSearchParams(window.location.search).get('dept');
        return p || '';
    });
    const [filterStatus, setFilterStatus] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('status');
        return p ? p.replace(/_/g, ' ') : '';
    });
    const [filterPriority, setFilterPriority] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('priority');
        return p || '';
    });
    const [filterWorker, setFilterWorker] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('worker');
        return p || '';
    });
    const [filterSubDept, setFilterSubDept] = useState(() => {
        const p = new URLSearchParams(window.location.search).get('sub_department') || new URLSearchParams(window.location.search).get('sub_dept');
        return p || '';
    });
    const [fromDate, setFromDate] = useState<string>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlFrom = urlParams.get('from_date') || urlParams.get('fromDate');
        if (urlFrom !== null) return urlFrom;
        if (urlParams.get('store') || urlParams.get('status') || urlParams.get('search')) return '';
        const savedFrom = localStorage.getItem('ticket-filter-from-date');
        return savedFrom || '';
    });
    const [toDate, setToDate] = useState<string>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTo = urlParams.get('to_date') || urlParams.get('toDate');
        if (urlTo !== null) return urlTo;
        if (urlParams.get('store') || urlParams.get('status') || urlParams.get('search')) return '';
        const savedTo = localStorage.getItem('ticket-filter-to-date');
        return savedTo || '';
    });
    const [dateType, setDateType] = useState<string>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlType = urlParams.get('date_type') || urlParams.get('dateType');
        if (urlType !== null) return urlType;
        if (urlParams.get('store') || urlParams.get('status') || urlParams.get('search')) return 'created';
        const savedType = localStorage.getItem('ticket-filter-date-type');
        return savedType || 'created';
    });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalCount, setTotalCount] = useState(0);

    // View mode (table, kanban or map) with localStorage persistence
    const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'map'>(() => {
        const saved = localStorage.getItem('ticket-view-mode');
        return (saved === 'kanban' || saved === 'table' || saved === 'map') ? saved : 'table';
    });

    const handleViewModeChange = (mode: 'table' | 'kanban' | 'map') => {
        setViewMode(mode);
        localStorage.setItem('ticket-view-mode', mode);
    };

    // Kanban collapsed columns with reliable localStorage persistence
    const [collapsedColumns, setCollapsedColumns] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('ticket-kanban-collapsed-statuses');
            if (saved) return JSON.parse(saved);
        } catch {}
        return [];
    });

    const toggleCollapseColumn = (statusName: string, statusId?: number) => {
        const key = statusName || String(statusId);
        setCollapsedColumns(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            try {
                localStorage.setItem('ticket-kanban-collapsed-statuses', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    // Drag and Drop state
    const [draggingTicketId, setDraggingTicketId] = useState<number | null>(null);
    const [dragOverStatusId, setDragOverStatusId] = useState<number | null>(null);
    const [priorities, setPriorities] = useState<any[]>([]);

    // UI
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [lastOpenedTicketId, setLastOpenedTicketId] = useState<number | null>(null);
    const modalWasOpen = useRef(false);
    const [loading, setLoading] = useState(true);
    const [isExportingAll, setIsExportingAll] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                setMessage(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const canCreateAllDepts = hasPermission('create_ticket_all_departments');

    const handleDropTicket = async (ticketId: number, targetStatus: any) => {
        setDraggingTicketId(null);
        setDragOverStatusId(null);

        const ticket = tickets.find(t => t.ticket_id === ticketId);
        if (!ticket) return;

        const currentStatusName = ticket.status?.status_name;
        if (currentStatusName?.toLowerCase() === targetStatus.status_name?.toLowerCase()) {
            return;
        }

        // Dynamic permission check for status transition
        if (!canMoveStatus(currentStatusName, targetStatus.status_name)) {
            setMessage({
                text: `You do not have permission to move ticket from "${currentStatusName}" to "${targetStatus.status_name}"`,
                type: 'error'
            });
            return;
        }

        const ticketDeptId = Number(ticket.department?.department_id ?? ticket.department);
        const targetStatusMatch = statuses.find(s => {
            const sDeptId = Number(s.department?.department_id ?? s.department);
            return s.status_name?.toLowerCase() === targetStatus.status_name?.toLowerCase() && (!sDeptId || sDeptId === ticketDeptId);
        }) || targetStatus;

        const targetStatusId = targetStatusMatch.status_id;
        let extraData: Record<string, any> = {};

        if (targetStatus.status_name?.toLowerCase() === 'rejected') {
            const reason = window.prompt(`Please provide a reason for rejecting ticket ${ticket.work_order_no}:`);
            if (reason === null) return;
            extraData.reject_reason = reason;
        } else if (targetStatus.status_name?.toLowerCase() === 'location approval') {
            if (!window.confirm('Confirmation 1 of 2:\nAre you sure you want to mark this ticket as COMPLETED?')) return;
            if (!window.confirm('Confirmation 2 of 2 (Final):\nAre you ABSOLUTELY SURE you want to change ticket status to COMPLETED?')) return;
        } else if (targetStatus.status_name?.toLowerCase() === 'completed') {
            if (!window.confirm(`Are you sure you want to mark ticket ${ticket.work_order_no} as COMPLETED?`)) return;
        } else if (targetStatus.status_name?.toLowerCase() === 'in progress') {
            extraData.approved_by = user?.user_id;
            extraData.approved_date = new Date().toISOString();
            // Fetch allocations on-demand to validate at least one worker is assigned
            try {
                const res = await fetch(`${API_URL}/maintenance/allocation/?ticket=${ticketId}`, {
                    headers: { Authorization: `Token ${token}` }
                });
                if (res.ok) {
                    const allocs = await res.json();
                    if (!Array.isArray(allocs) || allocs.length === 0) {
                        setMessage({
                            text: `Cannot move to In Progress: At least one worker must be allocated to ticket ${ticket.work_order_no} first.`,
                            type: 'error'
                        });
                        return;
                    }
                }
            } catch {
                // If check fails, allow through (backend will be the final guard)
            }
        }

        // Optimistic UI update
        const previousTickets = [...tickets];
        setTickets(prev => prev.map(t => {
            if (t.ticket_id === ticketId) {
                return {
                    ...t,
                    status: {
                        ...t.status,
                        status_id: targetStatusId,
                        status_name: targetStatus.status_name
                    }
                };
            }
            return t;
        }));

        try {
            const response = await fetch(`${API_URL}/maintenance/ticket/${ticketId}/`, {
                method: 'PATCH',
                headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: targetStatusId, ...extraData })
            });

            if (response.ok) {
                const updatedData = await response.json();
                if (updatedData.deleted_warnings && updatedData.deleted_warnings.length > 0) {
                    setMessage({
                        text: `Ticket ${ticket.work_order_no} moved to ${targetStatus.status_name}. Warning: ${updatedData.deleted_warnings.join(', ')}`,
                        type: 'warning'
                    });
                } else {
                    setMessage({ text: `Ticket ${ticket.work_order_no} moved to ${targetStatus.status_name}`, type: 'success' });
                }
                setTickets(prev => prev.map(t => t.ticket_id === ticketId ? { ...t, ...updatedData } : t));
                fetchTickets(true);
            } else {
                setTickets(previousTickets);
                const err = await response.json();
                let errorText = '';
                if (Array.isArray(err)) {
                    errorText = err.join(', ');
                } else if (err && typeof err === 'object') {
                    const messages = err.non_field_errors || err.status || err.detail || Object.values(err).flat();
                    errorText = Array.isArray(messages) ? messages.join(', ') : String(messages);
                } else {
                    errorText = String(err);
                }
                setMessage({ text: `Failed to move status: ${errorText}`, type: 'error' });
            }
        } catch (err) {
            console.error(err);
            setTickets(previousTickets);
            setMessage({ text: 'Network error updating ticket status', type: 'error' });
        }
    };

    // Handle subpage === 'create' route opening popup automatically
    useEffect(() => {
        if (subpage === 'create') {
            setIsCreateModalOpen(true);
        }
    }, [subpage]);

    // Close overflow on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (overflowRef.current && !overflowRef.current.contains(e.target as Node))
                setOverflowOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const userDepartmentIds = useMemo(() => {
        if (canCreateAllDepts) return null;
        if (!user?.sub_departments || user.sub_departments.length === 0) return null;
        const deptIds = new Set<number>();
        user.sub_departments.forEach((sd: any) => {
            let parentDeptId: number | null = null;
            if (typeof sd === 'object' && sd !== null) {
                const d = sd.department?.department_id ?? sd.department;
                if (d && !isNaN(Number(d))) {
                    parentDeptId = Number(d);
                }
            }
            if (!parentDeptId && subDepartments.length > 0) {
                const targetId = typeof sd === 'object' ? (sd.sub_department_id ?? sd.id) : sd;
                if (targetId !== undefined && targetId !== null && !isNaN(Number(targetId))) {
                    const match = subDepartments.find(item => Number(item.sub_department_id) === Number(targetId));
                    if (match) {
                        parentDeptId = Number(match.department?.department_id ?? match.department);
                    }
                }
                if (!parentDeptId && typeof sd === 'string' && isNaN(Number(sd))) {
                    const matches = subDepartments.filter(item =>
                        item.sub_department_name?.toLowerCase() === sd.toLowerCase()
                    );
                    if (matches.length > 0) {
                        parentDeptId = Number(matches[0].department?.department_id ?? matches[0].department);
                    }
                }
            }
            if (parentDeptId && !isNaN(parentDeptId)) {
                deptIds.add(parentDeptId);
            }
        });
        return deptIds.size > 0 ? deptIds : null;
    }, [user, canCreateAllDepts, subDepartments]);

    const availableDepartments = useMemo(() => {
        if (canCreateAllDepts) return departments;
        if (!userDepartmentIds) return [];
        return departments.filter(d => userDepartmentIds.has(Number(d.department_id)));
    }, [departments, userDepartmentIds, canCreateAllDepts]);

    const filteredSubDepartments = useMemo(() => {
        const allowedDeptIds = !canCreateAllDepts && availableDepartments.length > 0
            ? new Set(availableDepartments.map(d => String(d.department_id)))
            : null;

        return subDepartments.filter(sd => {
            const sdDeptId = String(sd.department?.department_id ?? sd.department);
            if (filterDept) {
                return sdDeptId === String(filterDept);
            }
            if (allowedDeptIds) {
                return allowedDeptIds.has(sdDeptId);
            }
            if (!canCreateAllDepts && userDepartmentIds) {
                return userDepartmentIds.has(Number(sdDeptId));
            }
            return canCreateAllDepts;
        });
    }, [subDepartments, filterDept, canCreateAllDepts, availableDepartments, userDepartmentIds]);

    useEffect(() => {
        if (filterDept && filterSubDept) {
            const sdObj = subDepartments.find(s => String(s.sub_department_id) === String(filterSubDept));
            const sdDeptId = sdObj?.department?.department_id ?? sdObj?.department;
            if (sdDeptId && String(sdDeptId) !== String(filterDept)) {
                setFilterSubDept('');
            }
        }
    }, [filterDept, filterSubDept, subDepartments]);

    const uniquePriorityNames = useMemo(() => {
        const names = new Set<string>();
        priorities.forEach(p => {
            if (p.priority_name) {
                names.add(p.priority_name);
            }
        });
        return Array.from(names);
    }, [priorities]);

    const fetchMetadata = async () => {
        try {
            const headers = { Authorization: `Token ${token}` };
            const [resStores, resDepts, resSubDepts, resStat, resNat, resExp, resPrio] = await Promise.all([
                fetch(`${API_URL}/stores/store/`, { headers }),
                fetch(`${API_URL}/stores/department/`, { headers }),
                fetch(`${API_URL}/stores/subdepartment/`, { headers }),
                fetch(`${API_URL}/maintenance/status/`, { headers }),
                fetch(`${API_URL}/maintenance/worknature/`, { headers }),
                fetch(`${API_URL}/finance/expensetype/`, { headers }),
                fetch(`${API_URL}/maintenance/priority/`, { headers }),
            ]);
            if (resStores.ok) {
                const sData = await resStores.json();
                setStores(Array.isArray(sData) ? sData.filter((s: any) => s.active !== false) : sData);
            }
            if (resDepts.ok) setDepartments(await resDepts.json());
            if (resSubDepts.ok) setSubDepartments(await resSubDepts.json());
            if (resStat.ok) setStatuses(await resStat.json());
            if (resNat.ok) {
                const nData = await resNat.json();
                setNatures(Array.isArray(nData) ? nData.filter((n: any) => n.active !== false) : nData);
            }
            if (resPrio.ok) setPriorities(await resPrio.json());
            if (resExp.ok) {
                const eData = await resExp.json();
                setExpenseTypes(Array.isArray(eData) ? eData : (Array.isArray(eData?.results) ? eData.results : []));
            }
        } catch (err) {
            console.error('Failed to load metadata', err);
        }
    };

    const fetchTickets = useCallback(async (silent = false) => {
        if (!token) return;
        if (!silent) setLoading(true);
        try {
            const query = new URLSearchParams();
            query.set('page', String(page));
            query.set('page_size', String(pageSize));
            if (debouncedSearch) query.set('search', debouncedSearch);
            if (filterStore) query.set('store', filterStore);
            if (filterDept) query.set('department', filterDept);
            if (filterSubDept) query.set('sub_department', filterSubDept);
            if (filterStatus) query.set('status', filterStatus);
            if (filterPriority) query.set('priority', filterPriority);
            if (filterWorker) query.set('worker', filterWorker);
            // Skip date filters when searching so results span all dates
            if (!debouncedSearch) {
                if (fromDate) query.set('from_date', fromDate);
                if (toDate) query.set('to_date', toDate);
                if (dateType && dateType !== 'created') query.set('date_type', dateType);
            }
            const response = await fetch(`${API_URL}/maintenance/ticket/?${query.toString()}`, {
                headers: { Authorization: `Token ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    setTickets(data);
                    setTotalCount(data.length);
                } else if (data && Array.isArray(data.results)) {
                    setTickets(data.results);
                    setTotalCount(data.count ?? data.results.length);
                }
            }
        } catch (err) {
            console.error('Failed to load tickets', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [token, page, pageSize, debouncedSearch, filterStore, filterDept, filterSubDept, filterStatus, filterPriority, filterWorker, fromDate, toDate, dateType]);

    const fetchWorkersForRange = useCallback(async () => {
        if (!token) return;
        try {
            const resWork = await fetch(`${API_URL}/accounts/customuser/`, {
                headers: { Authorization: `Token ${token}` }
            });
            if (resWork.ok) {
                const uList = await resWork.json();
                setWorkers(uList.filter((u: any) => {
                    const isActive = u.active !== false && u.is_active !== false;
                    const roleName = u.role?.role_name?.toLowerCase() ?? '';
                    const isTechnicianRole = roleName === 'technician' || roleName === 'worker' || roleName.includes('admin') || roleName.includes('administrator');
                    const hasTechnicalSubDept = Array.isArray(u.sub_departments) && u.sub_departments.some((sd: any) => {
                        const name = (sd?.sub_department_name ?? '').trim().toLowerCase();
                        return name !== '';
                    });
                    const hasSkills = Array.isArray(u.skilled_natures) && u.skilled_natures.length > 0;
                    return isActive && (isTechnicianRole || hasTechnicalSubDept || hasSkills);
                }));
            }
        } catch (err) {
            console.error('Failed to load workers', err);
        }
    }, [token]);

    useEffect(() => { fetchWorkersForRange(); }, [fetchWorkersForRange]);
    useEffect(() => { fetchMetadata(); }, [token]);
    useEffect(() => {
        fetchTickets();
        const handleTicketUpdated = () => {
            fetchTickets(true);
        };
        window.addEventListener('ticket-updated', handleTicketUpdated);
        return () => {
            window.removeEventListener('ticket-updated', handleTicketUpdated);
        };
    }, [fetchTickets]);

    // Debounce search input: wait 400ms after user stops typing before querying API
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    const isTechnician = useMemo(() => {
        const roleStr = typeof user?.role === 'object' && user?.role
            ? (user.role as any).role_name
            : user?.role;
        const name = String(roleStr || '').toLowerCase();
        return name === 'technician' || name === 'worker';
    }, [user]);

    // Clear date filters by default for technicians to show all assigned tickets
    useEffect(() => {
        if (isTechnician) {
            setFromDate('');
            setToDate('');
        }
    }, [isTechnician]);

    // Auto-lock filterDept for restricted users
    useEffect(() => {
        if (isTechnician) return;
        if (!canCreateAllDepts && availableDepartments.length > 0) {
            const defaultDeptId = String(availableDepartments[0].department_id);
            if (availableDepartments.length === 1 && filterDept !== defaultDeptId) {
                setFilterDept(defaultDeptId);
                setPage(1);
            }
        }
    }, [canCreateAllDepts, availableDepartments, filterDept, isTechnician]);

    // Auto-select filterStore if there is only one store
    useEffect(() => {
        if (isTechnician) return;
        if (stores.length === 1) {
            const defaultStoreId = String(stores[0].store_id);
            if (filterStore !== defaultStoreId) {
                setFilterStore(defaultStoreId);
                setPage(1);
            }
        }
    }, [stores, filterStore, isTechnician]);
    // Sync selectedTicket to URL query parameters silently
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const queryTicketId = urlParams.get('ticket_id');
        if (selectedTicket) {
            modalWasOpen.current = true;
            if (queryTicketId !== String(selectedTicket.ticket_id)) {
                urlParams.set('ticket_id', String(selectedTicket.ticket_id));
                const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                window.history.replaceState(null, '', newUrl);
            }
        } else {
            if (modalWasOpen.current && queryTicketId) {
                urlParams.delete('ticket_id');
                urlParams.delete('log');
                const nextQuery = urlParams.toString();
                const newUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
                window.history.replaceState(null, '', newUrl);
            }
        }
    }, [selectedTicket]);

    // Ensure document.body overflow is restored whenever modals are closed (mobile scroll safety net)
    useEffect(() => {
        if (!selectedTicket && !isCreateModalOpen) {
            document.body.style.overflow = '';
        }
    }, [selectedTicket, isCreateModalOpen]);

    // Synchronize filters from URL query parameters (e.g. ?store=803&status=Location%20Approval)
    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        
        const storeParam = urlParams.get('store');
        const statusParam = urlParams.get('status');
        const deptParam = urlParams.get('department') || urlParams.get('dept');
        const subDeptParam = urlParams.get('sub_department') || urlParams.get('sub_dept');
        const priorityParam = urlParams.get('priority');
        const workerParam = urlParams.get('worker');
        const searchParam = urlParams.get('search');
        const fromDateParam = urlParams.get('from_date') || urlParams.get('fromDate');
        const toDateParam = urlParams.get('to_date') || urlParams.get('toDate');
        const dateTypeParam = urlParams.get('date_type') || urlParams.get('dateType');

        let hasFilterParam = false;

        if (storeParam !== null) {
            setFilterStore(storeParam);
            hasFilterParam = true;
        }

        if (statusParam !== null) {
            const normalizedParam = statusParam.replace(/_/g, ' ').trim().toLowerCase();
            const matchedStatus = statuses.find(
                s => String(s.status_id) === statusParam || 
                     s.status_name?.toLowerCase() === statusParam.toLowerCase() ||
                     s.status_name?.toLowerCase() === normalizedParam
            );
            setFilterStatus(matchedStatus ? matchedStatus.status_name : statusParam.replace(/_/g, ' '));
            hasFilterParam = true;
        }

        if (deptParam !== null) {
            setFilterDept(deptParam);
            hasFilterParam = true;
        }

        if (subDeptParam !== null) {
            setFilterSubDept(subDeptParam);
            hasFilterParam = true;
        }

        if (priorityParam !== null) {
            setFilterPriority(priorityParam);
            hasFilterParam = true;
        }

        if (workerParam !== null) {
            setFilterWorker(workerParam);
            hasFilterParam = true;
        }

        if (searchParam !== null) {
            setSearch(searchParam);
            setDebouncedSearch(searchParam);
            hasFilterParam = true;
        }

        if (fromDateParam !== null) {
            setFromDate(fromDateParam);
        } else if (hasFilterParam && (storeParam !== null || statusParam !== null)) {
            // When navigated with specific store/status filters (e.g. throttle warnings), clear date restrictions if not explicitly passed
            setFromDate('');
        }

        if (toDateParam !== null) {
            setToDate(toDateParam);
        } else if (hasFilterParam && (storeParam !== null || statusParam !== null)) {
            setToDate('');
        }

        if (dateTypeParam !== null) {
            setDateType(dateTypeParam);
        } else if (hasFilterParam && (storeParam !== null || statusParam !== null)) {
            setDateType('created');
        }

        if (hasFilterParam) {
            setPage(1);
        }
    }, [location.search, statuses]);

    // Load ticket from URL query parameter on refresh/load
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const queryTicketId = urlParams.get('ticket_id');
        if (!queryTicketId) {
            if (selectedTicket) setSelectedTicket(null);
            return;
        }

        const ticketIdNum = Number(queryTicketId);
        if (selectedTicket && selectedTicket.ticket_id === ticketIdNum) {
            return;
        }

        // Try to find in current tickets list
        const found = tickets.find(t => t.ticket_id === ticketIdNum);
        if (found) {
            setSelectedTicket(found);
        } else if (token) {
            // Fetch directly from backend if not found in list (e.g. on direct navigation/refresh)
            const fetchSingleTicket = async () => {
                try {
                    const res = await fetch(`${API_URL}/maintenance/ticket/${ticketIdNum}/`, {
                        headers: { Authorization: `Token ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setSelectedTicket(data);
                    }
                } catch (err) {
                    console.error('Failed to fetch ticket from URL', err);
                }
            };
            fetchSingleTicket();
        }
    }, [tickets, token, selectedTicket, location.search]);
    const handleCreateModalClose = () => {
        setIsCreateModalOpen(false);
        if (subpage === 'create') {
            navigate('/tickets/all');
        }
    };

    const handleCreateModalSuccess = () => {
        setMessage({ text: 'Support Ticket created successfully!', type: 'success' });
        fetchTickets();
    };

    const handleDateRangeChange = (from: string, to: string, type: string = 'created') => {
        setFromDate(from);
        setToDate(to);
        setDateType(type);
        if (from) localStorage.setItem('ticket-filter-from-date', from);
        else localStorage.removeItem('ticket-filter-from-date');

        if (to) localStorage.setItem('ticket-filter-to-date', to);
        else localStorage.removeItem('ticket-filter-to-date');

        if (type) localStorage.setItem('ticket-filter-date-type', type);
        else localStorage.removeItem('ticket-filter-date-type');

        setPage(1);
    };

    const handleResetDates = () => {
        setFromDate('');
        setToDate('');
        setDateType('created');
        localStorage.removeItem('ticket-filter-from-date');
        localStorage.removeItem('ticket-filter-to-date');
        localStorage.removeItem('ticket-filter-date-type');
        setPage(1);
    };

    const clearFilters = () => {
        setSearch('');
        setDebouncedSearch('');
        setFilterStore('');
        setFilterDept('');
        setFilterSubDept('');
        setFilterStatus('');
        setFilterPriority('');
        setFilterWorker('');
        handleResetDates();
        if (location.search) {
            navigate(location.pathname, { replace: true });
        }
    };

    // Returns true if user has the 'can_view_<status>_ticket' permission
    const canViewStatus = (statusName: string) => {
        const permission = `can_view_${statusName.toLowerCase().replace(/\s+/g, '_')}_ticket`;
        return hasPermission(permission);
    };

    // Returns true if user has permission to move a ticket from fromStatusName to toStatusName
    const canMoveStatus = (fromStatusName?: string, toStatusName?: string): boolean => {
        if (!fromStatusName || !toStatusName) return false;
        if (fromStatusName.toLowerCase().trim() === toStatusName.toLowerCase().trim()) return false;

        const fromSlug = fromStatusName.toLowerCase().trim().replace(/\s+/g, '_');
        const toSlug = toStatusName.toLowerCase().trim().replace(/\s+/g, '_');
        const permName = `can_move_${fromSlug}_to_${toSlug}`;

        return hasPermission(permName) || hasPermission(`maintenance.${permName}`);
    };

    // Derived active dragged ticket
    const draggingTicket = useMemo(() => {
        if (!draggingTicketId) return null;
        return tickets.find(t => t.ticket_id === draggingTicketId) || null;
    }, [tickets, draggingTicketId]);

    // Returns the list of status-view permissions the user actually has
    const getAllowedStatusPermissions = (statusList: any[]): string[] => {
        return statusList
            .map(st => `can_view_${st.status_name.toLowerCase().replace(/\s+/g, '_')}_ticket`)
            .filter(perm => hasPermission(perm));
    };

    // Group tickets by status for Kanban Board mode
    const ticketsByStatus = useMemo(() => {
        const map: Record<string, Ticket[]> = {};
        statuses.forEach(s => {
            map[s.status_name] = [];
        });
        tickets.forEach(ticket => {
            const sName = ticket.status?.status_name;
            if (sName) {
                if (!map[sName]) map[sName] = [];
                map[sName].push(ticket);
            }
        });
        return map;
    }, [tickets, statuses]);
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    // Force table view mode on mobile devices (no card/kanban view support on mobile)
    useEffect(() => {
        if (isMobile && viewMode !== 'table') {
            setViewMode('table');
        }
    }, [isMobile, viewMode]);

    const canSeeDeviceInfo = hasPermission('can_see_device_info') || hasPermission('maintenance.can_see_device_info');

    const columnDefs = useMemo<ColDef<Ticket>[]>(() => {
        const cols: ColDef<Ticket>[] = [
            {
                headerName: 'Work Order',
                field: 'work_order_no',
                width: 130,
                minWidth: 100,
                pinned: isMobile ? null : 'left',
                cellRenderer: (params: any) => (
                    <span className=" text-xs font-semibold text-primary truncate block w-full">{params.value}</span>
                )
            },
            {
                headerName: 'Store',
                valueGetter: params => params.data?.store?.store_name || '',
                flex: 1,
                minWidth: 120,
                hide: isMobile,
            },
            {
                headerName: 'Title',
                field: 'title',
                flex: 2,
                minWidth: 160,
                cellRenderer: (params: any) => (
                    <span className="font-medium text-on-surface truncate block w-full" title={params.value}>{params.value}</span>
                )
            },
            {
                headerName: 'Priority',
                valueGetter: params => params.data?.priority?.priority_name || '',
                comparator: (valueA, valueB, nodeA, nodeB) => {
                    const levelA = nodeA.data?.priority?.level ?? 0;
                    const levelB = nodeB.data?.priority?.level ?? 0;
                    return levelA - levelB;
                },
                width: 110,
                minWidth: 90,
                hide: isMobile,
                cellRenderer: (params: any) => {
                    const p = params.data?.priority;
                    if (!p) return null;
                    const isHigh = p.level >= 2;
                    return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium tracking-wide h-4 ${isHigh ? 'bg-error-container text-on-error-container' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                            {p.priority_name}
                        </span>
                    );
                }
            },
            {
                headerName: 'Status',
                valueGetter: params => params.data?.status?.status_name || '',
                comparator: (valueA, valueB, nodeA, nodeB) => {
                    const orderA = nodeA.data?.status?.order ?? 0;
                    const orderB = nodeB.data?.status?.order ?? 0;
                    return orderA - orderB;
                },
                width: 130,
                minWidth: 110,
                cellRenderer: (params: any) => {
                    const statusName = params.data?.status?.status_name;
                    if (!statusName) return null;
                    return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium tracking-wide h-4 ${statusColor(statusName)}`}>
                            {statusName}
                        </span>
                    );
                }
            }
        ];

        if (canSeeDeviceInfo) {
            cols.push({
                headerName: 'Device Info',
                field: 'device_info',
                width: 140,
                minWidth: 110,
                hide: isMobile,
                cellRenderer: (params: any) => {
                    const val = params.value;
                    if (!val) return <span className="text-outline-variant text-xs">-</span>;
                    const isMobileOs = /iOS|Android/i.test(val);
                    return (
                        <span className="inline-flex items-center gap-1  text-[11px] px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant font-medium shrink-0" title={`Created using ${val}`}>
                            {isMobileOs ? (
                                <Smartphone className="w-3 h-3 shrink-0 text-primary" />
                            ) : (
                                <Monitor className="w-3 h-3 shrink-0 text-primary" />
                            )}
                            <span className="truncate">{val}</span>
                        </span>
                    );
                }
            });
        }

        cols.push(
            {
                headerName: 'Created',
                valueGetter: params => {
                    if (!params.data?.created_date) return '';
                    return new Date(params.data.created_date).toLocaleString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                    });
                },
                width: 160,
                minWidth: 140,
                hide: isMobile,
            },
            {
                headerName: 'Age (Days)',
                field: 'age_days',
                valueFormatter: params => {
                    const val = Number(params.value);
                    return isNaN(val) ? '' : val.toFixed(1);
                },
                width: 110,
                minWidth: 90,
                hide: isMobile,
            }
        );

        return cols;
    }, [isMobile, canSeeDeviceInfo]);

    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: true,
        filter: true,
        suppressSizeToFit: false,
        wrapText: false,
        autoHeight: false,
        cellStyle: {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
        },
    }), []);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const defaultMonth = getCurrentMonthRange();
    const selectCls = 'text-xs bg-surface-container border border-outline-variant rounded px-2.5 py-2 text-on-surface focus:outline-none focus:border-primary transition-colors min-h-[36px] w-full sm:w-auto sm:max-w-[160px] truncate';

    const downloadTicketsCSV = (ticketList: Ticket[], fileNamePrefix = 'Tickets_Export') => {
        if (!ticketList || ticketList.length === 0) return;
        const headers = [
            'Ticket ID',
            'Work Order No',
            'Title',
            'Description',
            'Status',
            'Priority',
            'Store ID',
            'Store',
            'Area',
            'Department',
            'Sub Department',
            'Nature of Work',
            'Created By',
            'Created Date',
            'Approved By',
            'Approved Date',
            'Rejected By',
            'Rejected Date',
            'Reject Reason',
            'Assigned Workers',
            'Assigned By',
            'Assigned Date',
            'Closed By',
            'Closed Date',
            'Age (Days)',
            'Device Info'
        ];

        const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const fmtDate = (d: any) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

        const rows = ticketList.map(t => [
            t.ticket_id,
            esc(t.work_order_no || ''),
            esc(t.title || ''),
            esc(t.description || ''),
            esc(t.status?.status_name || ''),
            esc(t.priority?.priority_name || ''),
            esc(t.store?.store_id || ''),
            esc(t.store?.store_name || ''),
            esc(typeof t.store?.area === 'object' ? (t.store?.area as any)?.area_name || '' : t.store?.area || ''),
            esc(t.department?.department_name || ''),
            esc((t as any).sub_department?.sub_department_name || (t as any).sub_department || (t as any).nature?.sub_department?.sub_department_name || ''),
            esc(t.nature?.nature_name || ''),
            esc(t.created_by?.full_name || ''),
            esc(fmtDate(t.created_date)),
            esc(t.approved_by?.full_name || ''),
            esc(fmtDate(t.approved_date)),
            esc(t.rejected_by?.full_name || ''),
            esc(fmtDate(t.rejected_date)),
            esc(t.reject_reason || ''),
            esc((t.allocations || []).map((a: any) => a.worker?.full_name).filter(Boolean).join(', ')),
            esc((t.allocations || []).map((a: any) => a.assigned_by?.full_name).filter(Boolean).join(', ')),
            esc((t.allocations || []).map((a: any) => fmtDate(a.assigned_date)).filter(Boolean).join(', ')),
            esc(t.closed_by?.full_name || ''),
            esc(fmtDate(t.closed_date)),
            t.age_days != null ? t.age_days : '',
            esc(t.device_info || '')
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadTicketsExcel = (ticketList: Ticket[], fileNamePrefix = 'Tickets_Export') => {
        if (!ticketList || ticketList.length === 0) return;
        const headers = [
            'Ticket ID',
            'Work Order No',
            'Title',
            'Description',
            'Status',
            'Priority',
            'Store ID',
            'Store',
            'Area',
            'Department',
            'Sub Department',
            'Nature of Work',
            'Created By',
            'Created Date',
            'Approved By',
            'Approved Date',
            'Rejected By',
            'Rejected Date',
            'Reject Reason',
            'Assigned Workers',
            'Assigned By',
            'Assigned Date',
            'Closed By',
            'Closed Date',
            'Age (Days)',
            'Device Info'
        ];

        const fmtDate = (d: any) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

        const rows = ticketList.map(t => [
            t.ticket_id,
            t.work_order_no || '',
            t.title || '',
            t.description || '',
            t.status?.status_name || '',
            t.priority?.priority_name || '',
            t.store?.store_id || '',
            t.store?.store_name || '',
            typeof t.store?.area === 'object' ? (t.store?.area as any)?.area_name || '' : t.store?.area || '',
            t.department?.department_name || '',
            (t as any).sub_department?.sub_department_name || (t as any).sub_department || (t as any).nature?.sub_department?.sub_department_name || '',
            t.nature?.nature_name || '',
            t.created_by?.full_name || '',
            fmtDate(t.created_date),
            t.approved_by?.full_name || '',
            fmtDate(t.approved_date),
            t.rejected_by?.full_name || '',
            fmtDate(t.rejected_date),
            t.reject_reason || '',
            (t.allocations || []).map((a: any) => a.worker?.full_name).filter(Boolean).join(', '),
            (t.allocations || []).map((a: any) => a.assigned_by?.full_name).filter(Boolean).join(', '),
            (t.allocations || []).map((a: any) => fmtDate(a.assigned_date)).filter(Boolean).join(', '),
            t.closed_by?.full_name || '',
            fmtDate(t.closed_date),
            t.age_days != null ? t.age_days : '',
            t.device_info || ''
        ]);

        const tableContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
            </head>
            <body>
                <table border="1">
                    <thead>
                        <tr style="background-color: #005bbf; color: #ffffff; font-weight: bold;">
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `<tr>${r.map(cell => `<td>${String(cell).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xls`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const fetchAllFilteredTickets = async (): Promise<Ticket[]> => {
        if (!token) return [];
        const query = new URLSearchParams();
        query.set('all', 'true');
        if (debouncedSearch) query.set('search', debouncedSearch);
        if (filterStore) query.set('store', filterStore);
        if (filterDept) query.set('department', filterDept);
        if (filterSubDept) query.set('sub_department', filterSubDept);
        if (filterStatus) query.set('status', filterStatus);
        if (filterPriority) query.set('priority', filterPriority);
        if (filterWorker) query.set('worker', filterWorker);
        if (!debouncedSearch) {
            if (fromDate) query.set('from_date', fromDate);
            if (toDate) query.set('to_date', toDate);
            if (dateType && dateType !== 'created') query.set('date_type', dateType);
        }

        const response = await fetch(`${API_URL}/maintenance/ticket/?${query.toString()}`, {
            headers: { Authorization: `Token ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to load all tickets: ${response.statusText}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) {
            return data;
        }

        let allResults: Ticket[] = Array.isArray(data?.results) ? [...data.results] : [];
        let nextUrl = data?.next;
        while (nextUrl) {
            const nextRes = await fetch(nextUrl, {
                headers: { Authorization: `Token ${token}` }
            });
            if (!nextRes.ok) break;
            const nextData = await nextRes.json();
            if (Array.isArray(nextData)) {
                allResults = allResults.concat(nextData);
                break;
            } else if (nextData && Array.isArray(nextData.results)) {
                allResults = allResults.concat(nextData.results);
                nextUrl = nextData.next;
            } else {
                break;
            }
        }
        return allResults;
    };

    const exportToCSV = () => {
        if (!tickets || tickets.length === 0) {
            setMessage({ text: 'No tickets found to export.', type: 'warning' });
            setOverflowOpen(false);
            return;
        }
        downloadTicketsCSV(tickets, 'Tickets_Export');
        setOverflowOpen(false);
    };

    const exportAllToCSV = async () => {
        if (!token) return;
        setIsExportingAll(true);
        setOverflowOpen(false);
        setMessage({ text: 'Exporting all table data without page limit...', type: 'warning' });
        try {
            const allTickets = await fetchAllFilteredTickets();
            if (allTickets.length === 0) {
                setMessage({ text: 'No tickets found to export.', type: 'warning' });
                return;
            }
            downloadTicketsCSV(allTickets, 'Tickets_All_Export');
            setMessage({ text: `Successfully exported all ${allTickets.length.toLocaleString()} tickets to CSV.`, type: 'success' });
        } catch (err) {
            console.error('Failed to export all tickets', err);
            setMessage({ text: 'Failed to export all tickets. Please try again.', type: 'error' });
        } finally {
            setIsExportingAll(false);
        }
    };

    const exportToExcel = () => {
        if (!tickets || tickets.length === 0) {
            setMessage({ text: 'No tickets found to export.', type: 'warning' });
            setOverflowOpen(false);
            return;
        }
        downloadTicketsExcel(tickets, 'Tickets_Export');
        setOverflowOpen(false);
    };

    const exportAllToExcel = async () => {
        if (!token) return;
        setIsExportingAll(true);
        setOverflowOpen(false);
        setMessage({ text: 'Exporting all table data to Excel...', type: 'warning' });
        try {
            const allTickets = await fetchAllFilteredTickets();
            if (allTickets.length === 0) {
                setMessage({ text: 'No tickets found to export.', type: 'warning' });
                return;
            }
            downloadTicketsExcel(allTickets, 'Tickets_All_Export');
            setMessage({ text: `Successfully exported all ${allTickets.length.toLocaleString()} tickets to Excel.`, type: 'success' });
        } catch (err) {
            console.error('Failed to export all tickets', err);
            setMessage({ text: 'Failed to export all tickets. Please try again.', type: 'error' });
        } finally {
            setIsExportingAll(false);
        }
    };

    return (
        <div className={`flex flex-col gap-4 ${viewMode === 'table' ? 'sm:max-h-[calc(100vh-112px)] sm:overflow-hidden' : ''}`}>


            {/* Toast */}
            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`flex items-center gap-3 px-4 py-3 rounded border text-xs font-medium ${message.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400'
                            : message.type === 'warning'
                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400'
                                : 'bg-error-container border-error/20 text-on-error-container'
                            }`}
                    >
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1">{message.text}</span>
                        <button onClick={() => setMessage(null)} className="ml-auto opacity-60 hover:opacity-100 transition-opacity">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Ticket List View */}
            <div className="flex flex-col border border-x-0 border-outline-variant rounded overflow-hidden bg-surface-container">
                {/* Toolbar */}
                <div className="bg-surface-container-low border-b border-outline-variant  sm:p-3 flex flex-col gap-2">

                    {/* ── Row 1 (always): Search + Actions ── */}
                    <div className="flex items-center gap-2">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-0 2xl:w-[220px] 2xl:shrink-0 2xl:flex-none">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-on-surface-variant pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search work order..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                className="w-full text-xs bg-surface-container border border-outline-variant rounded pl-8 pr-8 py-2 text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/60"
                            />
                            {search && (
                                <button onClick={() => { setSearch(''); setPage(1); }}
                                    className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Filter Dropdowns — visible inline only on 2xl+ */}
                        <div className="hidden 2xl:flex items-center flex-wrap gap-1.5 flex-1 min-w-0">
                            <div className="min-w-[220px] max-w-[240px]">
                                <SearchableSelect
                                    value={filterStore}
                                    onChange={val => { setFilterStore(val); setPage(1); }}
                                    placeholder="All Stores"
                                    options={[
                                        { value: '', label: 'All Stores' },
                                        ...stores.map(s => ({ value: s.store_id, label: `${s.store_id} - ${s.store_name}` }))
                                    ]}
                                />
                            </div>
                            <Can permission='maintenance.create_ticket_all_departments'>
                                <div className="min-w-[120px] max-w-[150px]">
                                    <SearchableSelect
                                        value={filterDept}
                                        onChange={val => { setFilterDept(val); setPage(1); }}
                                        placeholder="All Departments"
                                        options={[
                                            { value: '', label: 'All Departments' },
                                            ...departments.map(d => ({ value: d.department_id, label: d.department_name }))
                                        ]}
                                    />
                                </div>
                            </Can>
                            {!canCreateAllDepts && availableDepartments.length > 1 && (
                                <div className="min-w-[120px] max-w-[150px]">
                                    <SearchableSelect
                                        value={filterDept}
                                        onChange={val => { setFilterDept(val); setPage(1); }}
                                        placeholder="Select Department"
                                        options={availableDepartments.map(d => ({ value: d.department_id, label: d.department_name }))}
                                    />
                                </div>
                            )}
                            <Can permission='maintenance.can_filter_worker_ticket'>
                                <div className="min-w-[110px] max-w-[140px]">
                                    <SearchableSelect
                                        value={filterSubDept}
                                        onChange={val => { setFilterSubDept(val); setPage(1); }}
                                        placeholder="Sub Dept"
                                        options={[
                                            { value: '', label: 'All Sub Depts' },
                                            ...filteredSubDepartments.map(sd => ({ value: sd.sub_department_id, label: sd.sub_department_name }))
                                        ]}
                                    />
                                </div>
                            </Can>
                            <Can permission={getAllowedStatusPermissions(statuses) as any}>
                                <div className="min-w-[100px] max-w-[130px]">
                                    <SearchableSelect
                                        value={filterStatus}
                                        onChange={val => { setFilterStatus(val); setPage(1); }}
                                        placeholder="Status"
                                        options={[
                                            { value: '', label: 'All Statuses' },
                                            ...statuses.filter(s => canViewStatus(s.status_name || '')).map(s => ({ value: s.status_name, label: s.status_name }))
                                        ]}
                                    />
                                </div>
                            </Can>
                            <div className="min-w-[95px] max-w-[120px]">
                                <SearchableSelect
                                    value={filterPriority}
                                    onChange={val => { setFilterPriority(val); setPage(1); }}
                                    placeholder="Priority"
                                    options={[
                                        { value: '', label: 'All Priorities' },
                                        ...uniquePriorityNames.map(pName => ({ value: pName, label: pName }))
                                    ]}
                                />
                            </div>
                            <Can permission='maintenance.can_filter_worker_ticket'>
                                <div className="min-w-[110px] max-w-[140px]">
                                    <SearchableSelect
                                        value={filterWorker}
                                        onChange={val => { setFilterWorker(val); setPage(1); }}
                                        placeholder="Worker"
                                        options={[
                                            { value: '', label: 'All Workers' },
                                            ...workers.map(w => ({ value: w.user_id, label: w.full_name || w.username }))
                                        ]}
                                    />
                                </div>
                            </Can>
                            <DateRangePickerCard
                                fromDate={fromDate}
                                toDate={toDate}
                                dateType={dateType}
                                onDateRangeChange={handleDateRangeChange}
                                onReset={handleResetDates}
                            />
                        </div>

                        {/* Actions — always visible on sm+ */}
                        <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-auto">
                            <button onClick={() => fetchTickets()} disabled={loading}
                                className="border border-outline-variant bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium p-2 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
                                title="Refresh data">
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            </button>

                            <div className="flex items-center bg-surface-container border border-outline-variant rounded p-0.5 shrink-0">
                                <button
                                    onClick={() => handleViewModeChange('table')}
                                    className={`p-1.5 rounded text-xs font-medium flex items-center transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    title="Table View"
                                >
                                    <LayoutList className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => handleViewModeChange('kanban')}
                                    className={`p-1.5 rounded text-xs font-medium flex items-center transition-colors cursor-pointer ${viewMode === 'kanban' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    title="Kanban Board View"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => handleViewModeChange('map')}
                                    className={`p-1.5 rounded text-xs font-medium flex items-center transition-colors cursor-pointer ${viewMode === 'map' ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    title="Map View (Kuwait Areas)"
                                >
                                    <MapPin className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <Can permission={['maintenance.create_ticket', 'maintenance.add_ticket']}>
                                <button
                                    onClick={() => { setIsCreateModalOpen(true); if (subpage !== 'create') navigate('/tickets/create'); }}
                                    className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-2.5 py-1.5 rounded flex items-center gap-1.5 transition-colors shrink-0"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Raise Ticket</span>
                                </button>
                            </Can>

                            <div className="relative shrink-0" ref={overflowRef}>
                                <button onClick={() => setOverflowOpen(o => !o)}
                                    className="border border-outline-variant bg-surface-container hover:bg-surface-container-high text-on-surface p-1.5 rounded flex items-center justify-center transition-colors"
                                    title="More actions">
                                    {isExportingAll ? <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
                                </button>
                                <AnimatePresence>
                                    {overflowOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                            transition={{ duration: 0.12 }}
                                            className="absolute right-0 top-full mt-1 z-50 bg-surface-container border border-outline-variant rounded shadow-lg min-w-[175px] py-1"
                                        >
                                            <button
                                                onClick={exportToCSV}
                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors"
                                            >
                                                <Download className="w-4 h-4 text-on-surface-variant" /> Export CSV
                                            </button>
                                            <button
                                                onClick={exportAllToCSV}
                                                disabled={isExportingAll}
                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                                            >
                                                {isExportingAll ? (
                                                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                                                ) : (
                                                    <Download className="w-4 h-4 text-on-surface-variant" />
                                                )}
                                                <span>{isExportingAll ? 'Exporting All...' : 'Export All'}</span>
                                            </button>
                                            <div className="border-t border-outline-variant my-1" />
                                            <button
                                                onClick={exportToExcel}
                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors"
                                            >
                                                <Download className="w-4 h-4 text-on-surface-variant" /> Export Excel
                                            </button>
                                            <button
                                                onClick={exportAllToExcel}
                                                disabled={isExportingAll}
                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                                            >
                                                {isExportingAll ? (
                                                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                                                ) : (
                                                    <Download className="w-4 h-4 text-on-surface-variant" />
                                                )}
                                                <span>{isExportingAll ? 'Exporting All Excel...' : 'Export All (Excel)'}</span>
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* ── Row 2 (hidden on 2xl+): Filter Dropdowns ── */}
                    <div className="2xl:hidden grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                        <div className="w-full sm:w-auto sm:min-w-[180px] sm:max-w-[240px]">
                            <SearchableSelect
                                value={filterStore}
                                onChange={val => { setFilterStore(val); setPage(1); }}
                                placeholder="All Stores"
                                options={[
                                    { value: '', label: 'All Stores' },
                                    ...stores.map(s => ({ value: s.store_id, label: `${s.store_id} - ${s.store_name}` }))
                                ]}
                            />
                        </div>
                        {canCreateAllDepts && (
                            <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[150px]">
                                <SearchableSelect
                                    value={filterDept}
                                    onChange={val => { setFilterDept(val); setPage(1); }}
                                    placeholder="All Departments"
                                    options={[
                                        { value: '', label: 'All Departments' },
                                        ...departments.map(d => ({ value: d.department_id, label: d.department_name }))
                                    ]}
                                />
                            </div>
                        )}
                        {!canCreateAllDepts && availableDepartments.length > 1 && (
                            <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[150px]">
                                <SearchableSelect
                                    value={filterDept}
                                    onChange={val => { setFilterDept(val); setPage(1); }}
                                    placeholder="Select Department"
                                    options={availableDepartments.map(d => ({ value: d.department_id, label: d.department_name }))}
                                />
                            </div>
                        )}
                        <Can permission='maintenance.can_filter_worker_ticket'>
                            <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[150px]">
                                <SearchableSelect
                                    value={filterSubDept}
                                    onChange={val => { setFilterSubDept(val); setPage(1); }}
                                    placeholder="All Sub Depts"
                                    options={[
                                        { value: '', label: 'All Sub Depts' },
                                        ...filteredSubDepartments.map(sd => ({ value: sd.sub_department_id, label: sd.sub_department_name }))
                                    ]}
                                />
                            </div>
                        </Can>
                        <Can permission={getAllowedStatusPermissions(statuses) as any}>
                            <div className="w-full sm:w-auto sm:min-w-[110px] sm:max-w-[135px]">
                                <SearchableSelect
                                    value={filterStatus}
                                    onChange={val => { setFilterStatus(val); setPage(1); }}
                                    placeholder="All Statuses"
                                    options={[
                                        { value: '', label: 'All Statuses' },
                                        ...statuses.filter(s => canViewStatus(s.status_name || '')).map(s => ({ value: s.status_name, label: s.status_name }))
                                    ]}
                                />
                            </div>
                        </Can>
                        <div className="w-full sm:w-auto sm:min-w-[100px] sm:max-w-[125px]">
                            <SearchableSelect
                                value={filterPriority}
                                onChange={val => { setFilterPriority(val); setPage(1); }}
                                placeholder="All Priorities"
                                options={[
                                    { value: '', label: 'All Priorities' },
                                    ...uniquePriorityNames.map(pName => ({ value: pName, label: pName }))
                                ]}
                            />
                        </div>
                        <Can permission='maintenance.can_filter_worker_ticket'>
                            <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[150px]">
                                <SearchableSelect
                                    value={filterWorker}
                                    onChange={val => { setFilterWorker(val); setPage(1); }}
                                    placeholder="All Workers"
                                    options={[
                                        { value: '', label: 'All Workers' },
                                        ...workers.map(w => ({ value: w.user_id, label: w.full_name || w.username }))
                                    ]}
                                />
                            </div>
                        </Can>
                        <div className="col-span-1 [&:nth-child(odd):last-child]:col-span-2 sm:w-auto">
                            <DateRangePickerCard
                                fromDate={fromDate}
                                toDate={toDate}
                                dateType={dateType}
                                onDateRangeChange={handleDateRangeChange}
                                onReset={handleResetDates}
                            />
                        </div>
                    </div>

                </div>


                {/* AG Grid / Kanban Board / Map View / Skeleton / Empty State */}
                {loading ? (
                    <SkeletonGrid />
                ) : tickets.length === 0 ? (
                    <EmptyState onClear={clearFilters} />
                ) : viewMode === 'map' ? (
                    <div className="pt-2">
                        <TicketsMapView
                            tickets={tickets}
                            onSelectTicket={(t) => {
                                setSelectedTicket(t);
                                setLastOpenedTicketId(t.ticket_id);
                            }}
                            stores={stores}
                            statuses={statuses}
                            priorities={priorities}
                            loading={loading}
                        />
                    </div>
                ) : (
                    <>
                        {/* ── Mobile-only card grid ──────────────────────────────── */}
                        <div className="sm:hidden pt-2 sm:p-3 grid grid-cols-1 gap-2.5">
                            {tickets.map(ticket => {
                                const isHigh = ticket.priority?.level >= 2;
                                const assignedWorkers = (ticket.allocations || []).map((a: any) => a.worker).filter(Boolean);
                                return (
                                    <button
                                        key={ticket.ticket_id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedTicket(ticket);
                                            setLastOpenedTicketId(ticket.ticket_id);
                                        }}
                                        className={`text-left flex flex-col gap-2 p-3 rounded border active:scale-[0.97] transition-all cursor-pointer shadow-xs ${lastOpenedTicketId === ticket.ticket_id
                                            ? 'bg-primary/5 border-primary'
                                            : 'bg-surface border-outline-variant'
                                            }`}
                                    >
                                        {/* Status + Priority row */}
                                        <div className="flex items-center justify-between gap-1 flex-wrap">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(ticket.status?.status_name)}`}>
                                                {ticket.status?.status_name}
                                            </span>
                                            {ticket.priority && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isHigh ? 'bg-error-container text-on-error-container' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                                                    {ticket.priority.priority_name}
                                                </span>
                                            )}
                                        </div>

                                        {/* Title */}
                                        <p className="text-xs font-semibold text-on-surface leading-snug line-clamp-2 flex-1">{ticket.title}</p>

                                        <div className="flex items-center justify-between">
                                            <span className=" text-[10px] font-bold text-primary">{ticket.work_order_no}</span>
                                            {ticket.age_days !== undefined && (
                                                <span className="text-[10px] text-outline">
                                                    Age: {Number(ticket.age_days).toFixed(1)}d
                                                </span>
                                            )}
                                        </div>

                                        {/* Footer: store + assignees */}
                                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-outline-variant/40">
                                            <span className="text-[10px] text-outline truncate flex-1">
                                                {ticket.store?.store_name || new Date(ticket.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                            {/* Assignee avatar stack */}
                                            {assignedWorkers.length > 0 ? (
                                                <div className="flex -space-x-1.5 shrink-0">
                                                    {assignedWorkers.slice(0, 3).map((w: any, idx: number) => (
                                                        <div
                                                            key={w.user_id}
                                                            className="w-5 h-5 rounded-full overflow-hidden border border-surface bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary shrink-0"
                                                            style={{ zIndex: 10 - idx }}
                                                            title={w.full_name}
                                                        >
                                                            {w.profile_image
                                                                ? <img src={getMediaUrl(w.profile_image)} alt={w.full_name} className="w-full h-full object-cover" />
                                                                : w.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                                                            }
                                                        </div>
                                                    ))}
                                                    {assignedWorkers.length > 3 && (
                                                        <div className="w-5 h-5 rounded-full bg-surface-container border border-outline-variant/60 flex items-center justify-center text-[8px] font-bold text-outline shrink-0">
                                                            +{assignedWorkers.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[9px] text-outline/60 italic shrink-0">—</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Desktop: kanban or grid ───────────────────────────────── */}
                        <div className={`hidden sm:block`}>
                            {viewMode === 'kanban' ? (
                                <div className="p-2 overflow-x-auto min-h-[550px] bg-surface-container-low scrollbar-thin">
                                    <div className="flex gap-2 min-w-max items-start">
                                        {statuses
                                            .filter(s => canViewStatus(s.status_name))
                                            .map(status => {
                                                const colTickets = ticketsByStatus[status.status_name] || [];
                                                const isOver = dragOverStatusId === status.status_id;

                                                const fromStatusName = draggingTicket?.status?.status_name;
                                                const isSameColumn = !!fromStatusName && fromStatusName.toLowerCase() === status.status_name.toLowerCase();
                                                const isMoveAllowed = !!fromStatusName && !isSameColumn && canMoveStatus(fromStatusName, status.status_name);

                                                let columnBorderBgClass = 'border-outline-variant bg-surface-container';

                                                if (draggingTicket) {
                                                    if (isSameColumn) {
                                                        columnBorderBgClass = 'border-outline-variant bg-surface-container/70 opacity-90';
                                                    } else if (isMoveAllowed) {
                                                        if (isOver) {
                                                            columnBorderBgClass = 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-500/15 shadow-md scale-[1.01]';
                                                        } else {
                                                            columnBorderBgClass = 'border-emerald-500/60 ring-1 ring-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10';
                                                        }
                                                    } else {
                                                        if (isOver) {
                                                            columnBorderBgClass = 'border-red-500 ring-2 ring-red-500/30 bg-red-500/10 cursor-not-allowed';
                                                        } else {
                                                            columnBorderBgClass = 'border-outline-variant/40 bg-surface-container-low/40 opacity-50 grayscale-25';
                                                        }
                                                    }
                                                } else if (isOver) {
                                                    columnBorderBgClass = 'border-primary ring-2 ring-primary/20 bg-surface-container-high';
                                                }

                                                const isCollapsed = collapsedColumns.includes(status.status_name) || collapsedColumns.includes(String(status.status_id));

                                                if (isCollapsed) {
                                                    return (
                                                        <div
                                                            key={status.status_id}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                if (draggingTicket && !isSameColumn && !isMoveAllowed) {
                                                                    e.dataTransfer.dropEffect = 'none';
                                                                } else {
                                                                    e.dataTransfer.dropEffect = 'move';
                                                                }
                                                                if (dragOverStatusId !== status.status_id) {
                                                                    setDragOverStatusId(status.status_id);
                                                                }
                                                            }}
                                                            onDragLeave={(e) => {
                                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                                    setDragOverStatusId(null);
                                                                }
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                setDragOverStatusId(null);
                                                                setDraggingTicketId(null);
                                                                const ticketIdStr = e.dataTransfer.getData('text/plain');
                                                                if (ticketIdStr) {
                                                                    handleDropTicket(Number(ticketIdStr), status);
                                                                }
                                                            }}
                                                            onClick={() => toggleCollapseColumn(status.status_name, status.status_id)}
                                                            className={`w-9 shrink-0 rounded-xl border flex flex-col items-center justify-between py-2.5 max-h-[70vh] min-h-[480px] shadow-xs transition-all cursor-pointer select-none hover:border-primary/60 hover:bg-surface-container-high/70 ${columnBorderBgClass}`}
                                                            title={`Click to expand ${status.status_name} (${colTickets.length} tickets)`}
                                                        >
                                                            {/* Top: Expand button and count */}
                                                            <div className="flex flex-col items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleCollapseColumn(status.status_name, status.status_id);
                                                                    }}
                                                                    className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                                                                    title="Expand column"
                                                                >
                                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                                </button>
                                                                <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-1 py-0.2 rounded-full border border-outline-variant shadow-2xs">
                                                                    {colTickets.length}
                                                                </span>
                                                            </div>

                                                            {/* Middle: Vertical Status Name */}
                                                            <div className="flex-1 flex items-center justify-center my-3 overflow-hidden">
                                                                <span
                                                                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-2xs ${statusColor(status.status_name)}`}
                                                                    style={{
                                                                        writingMode: 'vertical-rl',
                                                                        transform: 'rotate(180deg)'
                                                                    }}
                                                                >
                                                                    {status.status_name}
                                                                </span>
                                                            </div>

                                                            {/* Bottom indicator */}
                                                            <div className="w-1 h-3 rounded-full bg-outline-variant/60" />
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={status.status_id}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            if (draggingTicket && !isSameColumn && !isMoveAllowed) {
                                                                e.dataTransfer.dropEffect = 'none';
                                                            } else {
                                                                e.dataTransfer.dropEffect = 'move';
                                                            }
                                                            if (dragOverStatusId !== status.status_id) {
                                                                setDragOverStatusId(status.status_id);
                                                            }
                                                        }}
                                                        onDragLeave={(e) => {
                                                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                                setDragOverStatusId(null);
                                                            }
                                                        }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            setDragOverStatusId(null);
                                                            setDraggingTicketId(null);
                                                            const ticketIdStr = e.dataTransfer.getData('text/plain');
                                                            if (ticketIdStr) {
                                                                handleDropTicket(Number(ticketIdStr), status);
                                                            }
                                                        }}
                                                        className={`w-72 sm:w-80 shrink-0 rounded-xl border flex flex-col max-h-[70vh] shadow-xs transition-all ${columnBorderBgClass}`}
                                                    >
                                                        {/* Column Header */}
                                                        <div className="p-2 border-b border-outline-variant flex items-center justify-between bg-surface-container-high/50 rounded-t-xl sticky top-0 z-10 backdrop-blur-xs">
                                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColor(status.status_name)}`}>
                                                                {status.status_name}
                                                            </span>
                                                            <div className="flex items-center gap-1.5">
                                                                {draggingTicket ? (
                                                                    isSameColumn ? (
                                                                        <span className="text-[10px] font-bold text-on-surface-variant/60 bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant/60">
                                                                            Current
                                                                        </span>
                                                                    ) : isMoveAllowed ? (
                                                                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                                                                            ✓ Can move
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] font-medium text-on-surface-variant/40 bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant/40">
                                                                            ✕ Locked
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span className="text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant">
                                                                        {colTickets.length}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleCollapseColumn(status.status_name, status.status_id)}
                                                                    className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                                                                    title="Collapse column"
                                                                    aria-label="Collapse column"
                                                                >
                                                                    <ChevronLeft className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Column Cards */}
                                                        <div className="p-1.5 overflow-y-auto space-y-2.5 flex-1 scrollbar-thin">
                                                            {colTickets.length === 0 ? (
                                                                <div className="py-8 text-center border-2 border-dashed border-outline-variant/60 rounded-lg">
                                                                    <p className="text-xs text-on-surface-variant italic">No {status.status_name.toLowerCase()} tickets</p>
                                                                </div>
                                                            ) : (
                                                                colTickets.map(ticket => {
                                                                    const isHigh = ticket.priority?.level >= 2;
                                                                    const isDragging = draggingTicketId === ticket.ticket_id;
                                                                    const isLastOpened = lastOpenedTicketId === ticket.ticket_id;
                                                                    return (
                                                                        <motion.div
                                                                            key={ticket.ticket_id}
                                                                            draggable={true}
                                                                            onDragStart={(e: any) => {
                                                                                e.stopPropagation();
                                                                                e.dataTransfer.setData('text/plain', String(ticket.ticket_id));
                                                                                e.dataTransfer.effectAllowed = 'move';
                                                                                setDraggingTicketId(ticket.ticket_id);
                                                                            }}
                                                                            onDragEnd={(e: any) => {
                                                                                setDraggingTicketId(null);
                                                                                setDragOverStatusId(null);
                                                                            }}
                                                                            whileHover={{ scale: 1.01 }}
                                                                            whileTap={{ scale: 0.99 }}
                                                                            onClick={() => {
                                                                                setSelectedTicket(ticket);
                                                                                setLastOpenedTicketId(ticket.ticket_id);
                                                                            }}
                                                                            className={`p-3 bg-surface border rounded-lg shadow-2xs hover:shadow-md hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all space-y-2 relative overflow-hidden ${isDragging ? 'opacity-40 border-dashed border-primary' : 'border-outline-variant'
                                                                                } ${isLastOpened ? 'border-primary ring-1 ring-primary/20 bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary' : ''
                                                                                }`}
                                                                        >
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                                    <span className=" text-xs font-bold text-primary truncate">
                                                                                        {ticket.work_order_no}
                                                                                    </span>
                                                                                    {ticket.age_days !== undefined && (
                                                                                        <span className="text-[10px] text-outline shrink-0" title="Days spent in current status">
                                                                                            ({Number(ticket.age_days).toFixed(1)}d)
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {ticket.priority && (
                                                                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${isHigh ? 'bg-error-container text-on-error-container' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                                                                                        {ticket.priority.priority_name}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Title */}
                                                                            <h4 className="text-xs font-bold text-on-surface line-clamp-2 leading-snug">
                                                                                {ticket.title}
                                                                            </h4>

                                                                            {/* Description preview */}
                                                                            {ticket.description && (
                                                                                <p className="text-[11px] text-on-surface-variant line-clamp-2 leading-normal">
                                                                                    {ticket.description}
                                                                                </p>
                                                                            )}

                                                                            {/* Store & Dept Tag */}
                                                                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-on-surface-variant border-t border-outline-variant/50">
                                                                                {ticket.store?.store_name && (
                                                                                    <span className="flex items-center gap-1 font-medium bg-surface-container px-1.5 py-0.5 rounded">
                                                                                        <Building2 className="w-3 h-3 text-on-surface-variant" />
                                                                                        {ticket.store.store_name}
                                                                                    </span>
                                                                                )}
                                                                                {ticket.department?.department_name && (
                                                                                    <span className="font-medium bg-surface-container px-1.5 py-0.5 rounded">
                                                                                        {ticket.department.department_name}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Card Footer */}
                                                                            <div className="flex items-center justify-between pt-2.5 text-[10px] text-on-surface-variant border-t border-outline-variant/30 mt-1">
                                                                                {/* Creator (Left Side) */}
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center font-bold text-[9px] bg-primary/10 text-primary border border-primary/25 shadow-xs shrink-0" title={`Created by ${ticket.created_by?.full_name || 'System'}`}>
                                                                                        {ticket.created_by?.profile_image ? (
                                                                                            <img src={getMediaUrl(ticket.created_by.profile_image)} alt={ticket.created_by.full_name} className="w-full h-full object-cover" />
                                                                                        ) : (
                                                                                            <span>{ticket.created_by?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex flex-col min-w-0 leading-tight">
                                                                                        <span className="font-semibold text-on-surface truncate max-w-[90px]">{ticket.created_by?.full_name?.split(' ')[0] || 'System'}</span>
                                                                                        <span className="text-[9px] text-outline mt-0.5">{new Date(ticket.created_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Assigned Workers Stack (Right Side) */}
                                                                                {(() => {
                                                                                    const assignedWorkers = (ticket.allocations || []).map((a: any) => a.worker).filter(Boolean);
                                                                                    if (assignedWorkers.length === 0) {
                                                                                        return <span className="text-[9px] text-outline italic">Unassigned</span>;
                                                                                    }
                                                                                    return (
                                                                                        <div className="flex items-center -space-x-2.5 overflow-hidden shrink-0">
                                                                                            {assignedWorkers.slice(0, 3).map((w: any, idx: number) => (
                                                                                                <div
                                                                                                    key={w.user_id}
                                                                                                    className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center font-bold text-[9px] bg-surface dark:bg-dark-surface border border-outline-variant/60 shadow-xs shrink-0"
                                                                                                    title={`Assigned to ${w.full_name}`}
                                                                                                    style={{ zIndex: 10 - idx }}
                                                                                                >
                                                                                                    {w.profile_image ? (
                                                                                                        <img src={getMediaUrl(w.profile_image)} alt={w.full_name} className="w-full h-full object-cover" />
                                                                                                    ) : (
                                                                                                        <span>{w.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}</span>
                                                                                                    )}
                                                                                                </div>
                                                                                            ))}
                                                                                            {assignedWorkers.length > 3 && (
                                                                                                <div
                                                                                                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[8px] bg-surface-container-high border border-outline-variant/60 text-on-surface shadow-xs shrink-0 z-0"
                                                                                                    title={`${assignedWorkers.length - 3} more worker(s)`}
                                                                                                >
                                                                                                    +{assignedWorkers.length - 3}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        </motion.div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ) : (
                                <div className="ag-theme-app w-full h-[calc(100vh-220px)] min-h-[500px]">
                                    <AgGridReact<Ticket>
                                        theme={appTheme}
                                        rowData={tickets}
                                        columnDefs={columnDefs}
                                        defaultColDef={defaultColDef}
                                        animateRows={true}
                                        rowHeight={52}
                                        headerHeight={44}
                                        suppressCellFocus={false}
                                        suppressRowClickSelection={true}
                                        enableCellTextSelection={true}
                                        suppressHorizontalScroll={false}
                                        onGridReady={(params) => params.api.sizeColumnsToFit()}
                                        onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                                        onRowClicked={(event) => {
                                            if (event.data) {
                                                setSelectedTicket(event.data);
                                                setLastOpenedTicketId(event.data.ticket_id);
                                            }
                                        }}
                                        rowClass="cursor-pointer"
                                        rowClassRules={{
                                            'ag-row-last-opened': (params: any) => params.data?.ticket_id === lastOpenedTicketId
                                        }}
                                    />
                                </div>
                            )}
                        </div>{/* end sm:block desktop wrapper */}
                    </>
                )}{/* end outer ternary branch */}

                {/* Pagination — minimal */}
                {!loading && tickets.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-outline-variant bg-surface-container-low">
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] text-outline">
                                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-outline">
                                <span>Per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                    className="bg-surface border border-outline-variant rounded px-1.5 py-0.5 text-[11px] text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={page <= 1 || loading}
                                onClick={() => setPage(p => Math.max(p - 1, 1))}
                                className="w-7 h-7 flex items-center justify-center rounded border border-outline-variant text-on-surface disabled:opacity-35 hover:bg-surface-container-high transition-colors"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[11px] text-on-surface font-medium px-2">{page} / {totalPages}</span>
                            <button
                                disabled={page >= totalPages || loading}
                                onClick={() => setPage(p => p + 1)}
                                className="w-7 h-7 flex items-center justify-center rounded border border-outline-variant text-on-surface disabled:opacity-35 hover:bg-surface-container-high transition-colors"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Action Button (FAB) for Mobile Raise Ticket */}
            <Can permission={['maintenance.create_ticket', 'maintenance.add_ticket']}>
                <button
                    onClick={() => {
                        setIsCreateModalOpen(true);
                        if (subpage !== 'create') navigate('/tickets/create');
                    }}
                    className="sm:hidden fixed bottom-6 right-6 z-40 bg-primary hover:bg-primary-hover active:scale-95 text-on-primary shadow-lg p-4 rounded-full flex items-center justify-center transition-all cursor-pointer"
                    title="Raise Ticket"
                >
                    <Plus className="w-6 h-6" />
                </button>
            </Can>

            {/* Popup Create Ticket Modal */}
            <CreateTicketModal
                isOpen={isCreateModalOpen}
                onClose={handleCreateModalClose}
                onSuccess={handleCreateModalSuccess}
                token={token}
                user={user}
                stores={stores}
                departments={departments}
                availableDepartments={availableDepartments}
                natures={natures}
                canCreateAllDepts={canCreateAllDepts}
            />

            {/* Ticket Detail Modal */}
            <TicketDetailModal
                selectedTicket={selectedTicket}
                token={token}
                user={user}
                statuses={statuses}
                workers={workers}
                subDepartments={subDepartments}
                expenseTypes={expenseTypes}
                onClose={() => {
                    setSelectedTicket(null);
                    // Do not reload ticket list on close
                }}
                onRefreshList={() => fetchTickets(true)}
            />
        </div>
    );
};

export default TicketsView;
