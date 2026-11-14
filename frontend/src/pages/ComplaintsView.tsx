import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2, Search, Ticket as TicketIcon, FileText,
    Video, X, Phone, AlertCircle, RefreshCw, Loader2,
    SlidersHorizontal, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    ShieldAlert, LayoutGrid, List, Calendar, ArrowDown, Building2,
    ExternalLink, ArrowUpDown
} from 'lucide-react';
import type { RootState } from '@/store';
import { usePermission } from '@/hooks/usePermission';
import Can from '@/hooks/Can';
import { API_URL, getMediaUrl, isImage, isVideo, AvatarCircle } from './ticket/TicketsTypesAndComponents';
import type { Complaint } from './ticket/ComplaintModal';
import { ZoomableImage } from '@/components/ZoomableImage';
import { TicketDetailModal } from './ticket/TicketDetailModal';

export const ComplaintsView: React.FC = () => {
    const { subpage } = useParams<{ subpage?: string }>();
    const navigate = useNavigate();
    const { user, token } = useSelector((state: RootState) => state.auth);
    const { hasPermission } = usePermission();

    const userRoleName = (
        ((user as any)?.role?.role_name || (user as any)?.role) || ''
    ).toLowerCase();

    const isAdmin = Boolean(
        user?.is_superuser ||
        userRoleName.includes('admin') ||
        userRoleName.includes('management')
    );

    const canViewManagerComplaints = hasPermission('maintenance.can_view_manager_complaint') || isAdmin;
    const canViewWorkerComplaints = hasPermission('maintenance.can_view_worker_complaint') || isAdmin;
    const canViewAllComplaints = Boolean(
        isAdmin ||
        hasPermission('maintenance.all_complaint_view') ||
        hasPermission('maintenance.can_view_all_complaint')
    );

    // Active subpage tab
    const [selectedTab, setSelectedTab] = useState<'all' | 'manager' | 'worker'>('all');

    useEffect(() => {
        if (subpage === 'manager') {
            setSelectedTab('manager');
        } else if (subpage === 'worker') {
            setSelectedTab('worker');
        } else {
            if (canViewManagerComplaints && !canViewWorkerComplaints) {
                setSelectedTab('manager');
            } else if (!canViewManagerComplaints && canViewWorkerComplaints) {
                setSelectedTab('worker');
            } else {
                setSelectedTab('all');
            }
        }
    }, [subpage, canViewManagerComplaints, canViewWorkerComplaints]);

    // Data & Filter state
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_review' | 'resolved' | 'dismissed'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const itemsPerPageOptions = [5, 10, 20, 50];

    // Button dimension refs to prevent reflow during loading
    const refreshBtnRef = useRef<HTMLButtonElement>(null);
    const [refreshBtnSize, setRefreshBtnSize] = useState<{ width?: number; height?: number }>({});
    const saveStatusBtnRef = useRef<HTMLButtonElement>(null);
    const [saveBtnSize, setSaveBtnSize] = useState<{ width?: number; height?: number }>({});

    // Selected ticket for modal
    const [selectedTicketForModal, setSelectedTicketForModal] = useState<any | null>(null);
    const [loadingTicketId, setLoadingTicketId] = useState<number | null>(null);

    // Zoomable Image
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Status update modal state
    const [statusUpdatingComplaint, setStatusUpdatingComplaint] = useState<Complaint | null>(null);
    const [newStatus, setNewStatus] = useState<string>('resolved');
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [savingStatus, setSavingStatus] = useState(false);

    // Scroll container ref for smooth pagination scroll
    const listTopRef = useRef<HTMLDivElement>(null);

    // Debounce search input at 300ms per Design System v2.2
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setCurrentPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Reset pagination when tab or status filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedTab, statusFilter, sortBy]);

    // Fetch complaints
    const fetchComplaints = useCallback(async () => {
        if (!token) return;
        if (refreshBtnRef.current) {
            const rect = refreshBtnRef.current.getBoundingClientRect();
            setRefreshBtnSize({ width: rect.width, height: rect.height });
        }
        setLoading(true);
        try {
            let url = `${API_URL}/maintenance/complaint/`;
            const params: string[] = [];

            if (selectedTab === 'manager') {
                params.push('complaint_type=manager_against_worker');
            } else if (selectedTab === 'worker') {
                params.push('complaint_type=worker_against_manager');
            }

            if (statusFilter !== 'all') {
                params.push(`status=${statusFilter}`);
            }

            if (debouncedSearch.trim()) {
                params.push(`search=${encodeURIComponent(debouncedSearch.trim())}`);
            }

            if (params.length > 0) {
                url += `?${params.join('&')}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.results || []);
                setComplaints(list);
            }
        } catch (err) {
            console.error('Failed to fetch complaints list:', err);
        } finally {
            setLoading(false);
        }
    }, [token, selectedTab, statusFilter, debouncedSearch]);

    useEffect(() => {
        fetchComplaints();
    }, [fetchComplaints]);

    // Open Ticket Detail Modal by Ticket ID
    const handleOpenTicket = async (ticketId: number) => {
        if (!token || !ticketId) return;
        setLoadingTicketId(ticketId);
        try {
            const res = await fetch(`${API_URL}/maintenance/ticket/${ticketId}/`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSelectedTicketForModal(data);
            }
        } catch (err) {
            console.error('Failed to load ticket details:', err);
        } finally {
            setLoadingTicketId(null);
        }
    };

    // Handle status update submission
    const handleSaveStatusUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!statusUpdatingComplaint || !token) return;
        if (saveStatusBtnRef.current) {
            const rect = saveStatusBtnRef.current.getBoundingClientRect();
            setSaveBtnSize({ width: rect.width, height: rect.height });
        }
        setSavingStatus(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/complaint/${statusUpdatingComplaint.complaint_id}/update_status/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status: newStatus,
                    resolution_notes: resolutionNotes,
                }),
            });
            if (res.ok) {
                setStatusUpdatingComplaint(null);
                setResolutionNotes('');
                fetchComplaints();
            }
        } catch (err) {
            console.error('Failed to update complaint status:', err);
        } finally {
            setSavingStatus(false);
        }
    };

    // Calculate metrics across all fetched complaints
    const stats = useMemo(() => {
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === 'pending').length;
        const inReview = complaints.filter(c => c.status === 'under_review').length;
        const resolved = complaints.filter(c => c.status === 'resolved').length;
        const dismissed = complaints.filter(c => c.status === 'dismissed').length;
        const managerComplaintsCount = complaints.filter(c => c.complaint_type === 'manager_against_worker').length;
        const workerComplaintsCount = complaints.filter(c => c.complaint_type === 'worker_against_manager').length;
        return { total, pending, inReview, resolved, dismissed, managerComplaintsCount, workerComplaintsCount };
    }, [complaints]);

    // Sorted complaints list
    const sortedComplaints = useMemo(() => {
        return [...complaints].sort((a, b) => {
            const tA = new Date(a.created_at).getTime();
            const tB = new Date(b.created_at).getTime();
            return sortBy === 'newest' ? tB - tA : tA - tB;
        });
    }, [complaints, sortBy]);

    // Client-side pagination
    const totalItems = sortedComplaints.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const startIndex = totalItems === 0 ? 0 : (validCurrentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(validCurrentPage * itemsPerPage, totalItems);

    const paginatedComplaints = useMemo(() => {
        const start = (validCurrentPage - 1) * itemsPerPage;
        return sortedComplaints.slice(start, start + itemsPerPage);
    }, [sortedComplaints, validCurrentPage, itemsPerPage]);

    // Handle page change with smooth scroll to list anchor
    const handlePageChange = (page: number) => {
        const target = Math.min(Math.max(1, page), totalPages);
        setCurrentPage(target);
        if (listTopRef.current) {
            listTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Page numbers builder with smart ellipsis
    const pageNumbers = useMemo(() => {
        const pages: (number | 'ellipsis')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (validCurrentPage > 3) {
                pages.push('ellipsis');
            }
            const start = Math.max(2, validCurrentPage - 1);
            const end = Math.min(totalPages - 1, validCurrentPage + 1);
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            if (validCurrentPage < totalPages - 2) {
                pages.push('ellipsis');
            }
            pages.push(totalPages);
        }
        return pages;
    }, [totalPages, validCurrentPage]);

    // Status Chip Mapping per Design System v2.2 palette
    const getStatusChipClass = (status: Complaint['status']) => {
        switch (status) {
            case 'pending':
                return 'text-error bg-error-container dark:bg-error-container/20 dark:text-red-400 border border-error/20';
            case 'under_review':
                return 'text-tertiary bg-tertiary-container/20 dark:bg-amber-950/40 dark:text-amber-400 border border-tertiary/20';
            case 'resolved':
                return 'text-on-secondary-container bg-secondary-container dark:bg-emerald-950/40 dark:text-emerald-300 border border-secondary/20';
            case 'dismissed':
            default:
                return 'text-on-surface-variant bg-surface-variant dark:bg-neutral-800 dark:text-neutral-400 border border-outline-variant dark:border-dark-outline-variant';
        }
    };

    return (
        <div className=" min-h-screen flex flex-col  bg-surface dark:bg-dark-surface text-on-surface dark:text-dark-on-surface">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant dark:border-dark-outline-variant pb-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-xl font-semibold tracking-tight text-on-surface dark:text-dark-on-surface">
                            Registered Complaints
                        </h1>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface-container-high dark:bg-dark-surface-container-high text-on-surface-variant dark:text-dark-on-surface-variant">
                            {complaints.length} records
                        </span>
                    </div>
                    <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant mt-1">
                        {canViewAllComplaints
                            ? 'Track, investigate, and resolve quality, completion, and conduct complaints across maintenance operations.'
                            : 'View and track the status of complaints filed from your account.'}
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    {/* View Mode Toggle */}
                    <div className="flex items-center border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container rounded p-0.5">
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            title="Detailed Cards View"
                            className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${viewMode === 'cards'
                                ? 'bg-primary text-on-primary font-medium'
                                : 'text-on-surface-variant dark:text-dark-on-surface-variant hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high'
                                }`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            title="Compact Table View"
                            className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${viewMode === 'table'
                                ? 'bg-primary text-on-primary font-medium'
                                : 'text-on-surface-variant dark:text-dark-on-surface-variant hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high'
                                }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Refresh Button with Reflow-Safe Dimension Lock */}
                    <button
                        ref={refreshBtnRef}
                        type="button"
                        onClick={fetchComplaints}
                        disabled={loading}
                        style={loading && refreshBtnSize.width ? { width: `${refreshBtnSize.width}px`, height: `${refreshBtnSize.height}px` } : undefined}
                        className="border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium px-3 py-2 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />
                        ) : (
                            <RefreshCw className="w-4 h-4 shrink-0 text-on-surface-variant dark:text-dark-on-surface-variant" />
                        )}
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Stat Cards (Live Content + Sibling Skeletons per Design System v2.2) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Total Complaints */}
                <div className="p-4 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container transition-all hover:border-outline/40">
                    <div className={loading ? 'hidden' : 'block'}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant">Total Complaints</p>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container-high dark:bg-dark-surface-container-high text-on-surface-variant dark:text-dark-on-surface-variant">
                                All Types
                            </span>
                        </div>
                        <p className="text-2xl font-semibold text-on-surface dark:text-dark-on-surface mt-1">{stats.total}</p>
                        <div className="flex items-center gap-2 text-xs text-on-surface-variant dark:text-dark-on-surface-variant mt-1.5">
                            <span className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                {stats.managerComplaintsCount} Manager
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                                {stats.workerComplaintsCount} Worker
                            </span>
                        </div>
                    </div>
                    <div className={loading ? 'block space-y-2' : 'hidden'}>
                        <div className="h-3 w-28 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-7 w-16 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-3 w-36 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                    </div>
                </div>

                {/* Card 2: Pending Review (High Priority / Error Semantic) */}
                <div className="p-4 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container transition-all hover:border-outline/40">
                    <div className={loading ? 'hidden' : 'block'}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant">Pending Review</p>
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium text-error bg-error-container dark:bg-error-container/20 dark:text-red-400">
                                High
                            </span>
                        </div>
                        <p className="text-2xl font-semibold text-on-surface dark:text-dark-on-surface mt-1">{stats.pending}</p>
                        <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant mt-1.5">
                            Requires immediate review
                        </p>
                    </div>
                    <div className={loading ? 'block space-y-2' : 'hidden'}>
                        <div className="h-3 w-24 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-7 w-14 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-3 w-36 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                    </div>
                </div>

                {/* Card 3: Under Review (Active / Tertiary Semantic) */}
                <div className="p-4 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container transition-all hover:border-outline/40">
                    <div className={loading ? 'hidden' : 'block'}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant">Under Review</p>
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium text-tertiary bg-tertiary-container/20 dark:bg-amber-950/40 dark:text-amber-400">
                                Active
                            </span>
                        </div>
                        <p className="text-2xl font-semibold text-on-surface dark:text-dark-on-surface mt-1">{stats.inReview}</p>
                        <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant mt-1.5">
                            Investigation in progress
                        </p>
                    </div>
                    <div className={loading ? 'block space-y-2' : 'hidden'}>
                        <div className="h-3 w-24 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-7 w-14 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-3 w-32 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                    </div>
                </div>

                {/* Card 4: Resolved / Closed (Secondary Semantic) */}
                <div className="p-4 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container transition-all hover:border-outline/40">
                    <div className={loading ? 'hidden' : 'block'}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant">Resolved & Closed</p>
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium text-on-secondary-container bg-secondary-container dark:bg-emerald-950/40 dark:text-emerald-300">
                                Closed
                            </span>
                        </div>
                        <p className="text-2xl font-semibold text-on-surface dark:text-dark-on-surface mt-1">{stats.resolved}</p>
                        <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant mt-1.5">
                            {stats.dismissed > 0 ? `${stats.dismissed} dismissed` : 'Action concluded'}
                        </p>
                    </div>
                    <div className={loading ? 'block space-y-2' : 'hidden'}>
                        <div className="h-3 w-20 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-7 w-14 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                        <div className="h-3 w-28 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                    </div>
                </div>
            </div>

            {/* Toolbar: Navigation Tabs & Search/Status/Sort Filters */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-surface-container-low dark:bg-dark-surface-container-low p-3 rounded border border-outline-variant dark:border-dark-outline-variant">
                {/* Navigation Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                    {canViewAllComplaints ? (
                        <>
                            <Can permission={['maintenance.can_view_manager_complaint', 'maintenance.can_view_worker_complaint']}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTab('all');
                                        navigate('/complaints/all');
                                    }}
                                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${selectedTab === 'all'
                                        ? 'bg-primary hover:bg-primary-container text-on-primary shadow-xs'
                                        : 'border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface'
                                        }`}
                                >
                                    <span>All Complaints</span>
                                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${selectedTab === 'all' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-high dark:bg-dark-surface-container-high text-on-surface-variant'}`}>
                                        {stats.total}
                                    </span>
                                </button>
                            </Can>

                            <Can permission="maintenance.can_view_manager_complaint">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTab('manager');
                                        navigate('/complaints/manager');
                                    }}
                                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${selectedTab === 'manager'
                                        ? 'bg-primary hover:bg-primary-container text-on-primary shadow-xs'
                                        : 'border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface'
                                        }`}
                                >
                                    <span>Manager Complaints</span>
                                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${selectedTab === 'manager' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-high dark:bg-dark-surface-container-high text-on-surface-variant'}`}>
                                        {stats.managerComplaintsCount}
                                    </span>
                                </button>
                            </Can>

                            <Can permission="maintenance.can_view_worker_complaint">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTab('worker');
                                        navigate('/complaints/worker');
                                    }}
                                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${selectedTab === 'worker'
                                        ? 'bg-primary hover:bg-primary-container text-on-primary shadow-xs'
                                        : 'border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface'
                                        }`}
                                >
                                    <span>Worker Complaints</span>
                                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${selectedTab === 'worker' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-high dark:bg-dark-surface-container-high text-on-surface-variant'}`}>
                                        {stats.workerComplaintsCount}
                                    </span>
                                </button>
                            </Can>
                        </>
                    ) : (
                        <div className="px-3 py-1.5 rounded text-xs font-semibold bg-primary-fixed text-on-primary-fixed">
                            My Filed Complaints ({stats.total})
                        </div>
                    )}
                </div>

                {/* Filters: Search + Status + Sort Order */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative min-w-[220px] flex-1 sm:flex-none">
                        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-on-surface-variant dark:text-dark-on-surface-variant pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search ticket, worker, manager..."
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            className="w-full bg-surface-container dark:bg-dark-surface-container border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded pl-8 pr-7 py-2 focus:outline-none focus:border-primary"
                        />
                        {searchInput && (
                            <button
                                type="button"
                                onClick={() => setSearchInput('')}
                                className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <SlidersHorizontal className="w-4 h-4 absolute left-2.5 top-2.5 text-on-surface-variant dark:text-dark-on-surface-variant pointer-events-none" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as any)}
                            className="bg-surface-container dark:bg-dark-surface-container border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded pl-8 pr-3 py-2 focus:outline-none focus:border-primary font-medium cursor-pointer"
                        >
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="under_review">Under Review</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                        </select>
                    </div>

                    {/* Sort Order */}
                    <div className="relative">
                        <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-on-surface-variant dark:text-dark-on-surface-variant pointer-events-none" />
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
                            className="bg-surface-container dark:bg-dark-surface-container border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded pl-8 pr-3 py-2 focus:outline-none focus:border-primary font-medium cursor-pointer"
                        >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Scroll Anchor */}
            <div ref={listTopRef} />

            {/* Stateful List / Grid Region */}
            <div className="relative flex flex-col gap-4">
                {/* Skeletons Overlay */}
                <div className={loading ? 'flex flex-col gap-4' : 'hidden'}>
                    {[1, 2, 3].map(n => (
                        <div
                            key={n}
                            className="p-4 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container space-y-4"
                        >
                            <div className="flex items-center justify-between border-b border-outline-variant dark:border-dark-outline-variant pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-36 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                    <div className="h-4 w-12 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-20 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                    <div className="h-7 w-24 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="h-36 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                <div className="lg:col-span-2 space-y-3">
                                    <div className="h-10 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                    <div className="h-24 rounded bg-outline-variant dark:bg-dark-outline-variant animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Content Block */}
                <div className={loading ? 'hidden' : 'flex flex-col gap-4'}>
                    {paginatedComplaints.length === 0 ? (
                        <div className="p-12 text-center rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container">
                            <CheckCircle2 className="w-10 h-10 mx-auto text-on-surface-variant dark:text-dark-on-surface-variant mb-3 opacity-60" />
                            <h3 className="text-sm font-semibold text-on-surface dark:text-dark-on-surface">
                                No complaints found
                            </h3>
                            <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant mt-1.5 max-w-sm mx-auto">
                                No registered complaints match your current filter and search criteria.
                            </p>
                            {(searchInput || statusFilter !== 'all' || selectedTab !== 'all') && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchInput('');
                                        setStatusFilter('all');
                                        setSelectedTab('all');
                                        navigate('/complaints/all');
                                    }}
                                    className="mt-4 border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-xs font-medium px-3 py-1.5 rounded text-on-surface cursor-pointer"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'cards' ? (
                        /* ================== DETAILED CARDS VIEW ================== */
                        <div className="grid grid-cols-1 gap-4">
                            {paginatedComplaints.map(item => {
                                const isMgrComplaint = item.complaint_type === 'manager_against_worker';
                                const complainantPhone = item.complainant?.phone || item.complainant?.whatsapp_number;
                                const againstPhone = item.against_user?.phone || item.against_user?.whatsapp_number;
                                const isTicketLoading = loadingTicketId === item.ticket?.ticket_id;

                                return (
                                    <motion.div
                                        key={item.complaint_id}
                                        layout
                                        className="p-4 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container space-y-4 hover:border-outline/40 transition-colors"
                                    >
                                        {/* Card Top Header Row */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant dark:border-dark-outline-variant pb-3">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-xs font-medium ${isMgrComplaint
                                                        ? 'bg-primary-fixed text-on-primary-fixed dark:bg-blue-950/60 dark:text-blue-300'
                                                        : 'bg-tertiary-fixed text-on-tertiary-fixed dark:bg-amber-950/60 dark:text-amber-300'
                                                        }`}
                                                >
                                                    {isMgrComplaint ? 'Manager vs Worker' : 'Worker vs Manager'}
                                                </span>

                                                <span className="font-mono text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                                    #{item.complaint_id}
                                                </span>

                                                <span className="text-on-surface-variant dark:text-dark-on-surface-variant text-[11px] flex items-center gap-1 ml-1">
                                                    <Calendar className="w-3 h-3 opacity-60" />
                                                    {new Date(item.created_at).toLocaleDateString(undefined, {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-0.5 rounded text-xs font-semibold capitalize ${getStatusChipClass(item.status)}`}>
                                                    {item.status.replace('_', ' ')}
                                                </span>

                                                <Can permission={[
                                                    'maintenance.all_complaint_view',
                                                    'maintenance.can_view_all_complaint',
                                                    'maintenance.can_view_manager_complaint'
                                                ]}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setStatusUpdatingComplaint(item);
                                                            setNewStatus(item.status);
                                                            setResolutionNotes(item.resolution_notes || '');
                                                        }}
                                                        className="border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                                                    >
                                                        <ShieldAlert className="w-3.5 h-3.5 text-primary" />
                                                        <span>Update Status</span>
                                                    </button>
                                                </Can>
                                            </div>
                                        </div>

                                        {/* Main Content Grid */}
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                            {/* Left Column: Parties Involved */}
                                            <div className="bg-surface-container-low dark:bg-dark-surface-container-low p-3.5 rounded border border-outline-variant dark:border-dark-outline-variant flex flex-col justify-between gap-3">
                                                {/* Complainant Profile */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant uppercase tracking-wider">
                                                            Complainant (Filed By)
                                                        </span>
                                                        {item.complainant?.employee_no && (
                                                            <span className="text-[10px] font-mono px-1 rounded bg-surface-container dark:bg-dark-surface-container text-on-surface-variant">
                                                                #{item.complainant.employee_no}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2.5">
                                                        <AvatarCircle user={item.complainant} size="md" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-xs text-on-surface dark:text-dark-on-surface truncate">
                                                                {item.complainant?.full_name || (item.complainant as any)?.username}
                                                            </p>
                                                            <p className="text-[11px] font-medium text-primary truncate">
                                                                {item.complainant?.role?.role_name || 'Staff'}
                                                            </p>
                                                            {complainantPhone && (
                                                                <a
                                                                    href={`tel:${String(complainantPhone).replace(/\D/g, '')}`}
                                                                    className="flex items-center gap-1 text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant hover:text-primary mt-0.5"
                                                                >
                                                                    <Phone className="w-3 h-3 text-secondary shrink-0" />
                                                                    <span>{complainantPhone}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Directional Relation Divider */}
                                                <div className="relative my-0.5">
                                                    <div className="border-t border-outline-variant dark:border-dark-outline-variant" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className="bg-surface-container-low dark:bg-dark-surface-container-low px-2 text-[10px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant flex items-center gap-1">
                                                            <ArrowDown className="w-3 h-3 text-outline" />
                                                            <span>Filed against</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Target / Against Profile */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant uppercase tracking-wider">
                                                            Target (Reported)
                                                        </span>
                                                        {item.against_user?.employee_no && (
                                                            <span className="text-[10px] font-mono px-1 rounded bg-surface-container dark:bg-dark-surface-container text-on-surface-variant">
                                                                #{item.against_user.employee_no}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2.5">
                                                        <AvatarCircle user={item.against_user} size="md" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-xs text-on-surface dark:text-dark-on-surface truncate">
                                                                {item.against_user?.full_name || (item.against_user as any)?.username}
                                                            </p>
                                                            <p className="text-[11px] font-medium text-tertiary truncate">
                                                                {item.against_user?.role?.role_name || 'Worker'}
                                                            </p>
                                                            {againstPhone && (
                                                                <a
                                                                    href={`tel:${String(againstPhone).replace(/\D/g, '')}`}
                                                                    className="flex items-center gap-1 text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant hover:text-primary mt-0.5"
                                                                >
                                                                    <Phone className="w-3 h-3 text-secondary shrink-0" />
                                                                    <span>{againstPhone}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Middle & Right Columns: Issue Details & Evidence */}
                                            <div className="lg:col-span-2 flex flex-col justify-between gap-3">
                                                <div className="space-y-3">
                                                    {/* Issue Reason & Ticket Reference Banner */}
                                                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-surface-container-low dark:bg-dark-surface-container-low border border-outline-variant dark:border-dark-outline-variant">
                                                        <div className="flex items-center gap-2">
                                                            <AlertCircle className="w-4 h-4 text-error shrink-0" />
                                                            <span className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant">
                                                                Issue: <strong className="font-semibold text-on-surface dark:text-dark-on-surface">{item.issue_display}</strong>
                                                            </span>
                                                        </div>

                                                        {item.ticket && (
                                                            <button
                                                                type="button"
                                                                disabled={isTicketLoading}
                                                                onClick={() => handleOpenTicket(item.ticket.ticket_id)}
                                                                className="border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium px-2.5 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                                                            >
                                                                {isTicketLoading ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                                                                ) : (
                                                                    <TicketIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                                                                )}
                                                                <span className="font-mono">{item.ticket.work_order_no}</span>
                                                                {item.ticket.store_name && (
                                                                    <span className="text-on-surface-variant dark:text-dark-on-surface-variant font-normal">
                                                                        • {item.ticket.store_name}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Description */}
                                                    <div className="p-3.5 rounded bg-surface-container-lowest dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant space-y-1">
                                                        <span className="text-[11px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant block uppercase tracking-wider">
                                                            Complaint Explanation
                                                        </span>
                                                        <p className="text-xs text-on-surface dark:text-dark-on-surface whitespace-pre-wrap leading-relaxed">
                                                            {item.description}
                                                        </p>
                                                    </div>

                                                    {/* Attached Evidence Files */}
                                                    {item.media_files && item.media_files.length > 0 && (
                                                        <div className="space-y-1.5">
                                                            <span className="text-[11px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant block uppercase tracking-wider">
                                                                Attached Evidence ({item.media_files.length})
                                                            </span>
                                                            <div className="flex flex-wrap gap-2">
                                                                {item.media_files.map(m => {
                                                                    const fullUrl = getMediaUrl(m.file_url);
                                                                    const isImg = isImage(m.file_name);
                                                                    const isVid = isVideo(m.file_name);
                                                                    return (
                                                                        <div
                                                                            key={m.media_id}
                                                                            className="relative w-20 h-20 rounded overflow-hidden border border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low group cursor-pointer"
                                                                            onClick={() => isImg && setPreviewImage(fullUrl)}
                                                                        >
                                                                            {isImg ? (
                                                                                <img
                                                                                    src={fullUrl}
                                                                                    alt={m.file_name}
                                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                                />
                                                                            ) : isVid ? (
                                                                                <a
                                                                                    href={fullUrl}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="w-full h-full flex flex-col items-center justify-center p-1.5 text-primary text-xs text-center hover:bg-surface-container-high"
                                                                                >
                                                                                    <Video className="w-4 h-4 mb-1 shrink-0" />
                                                                                    <span className="truncate w-full text-[10px]">{m.file_name}</span>
                                                                                </a>
                                                                            ) : (
                                                                                <a
                                                                                    href={fullUrl}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="w-full h-full flex flex-col items-center justify-center p-1.5 text-primary text-xs text-center hover:bg-surface-container-high"
                                                                                >
                                                                                    <FileText className="w-4 h-4 mb-1 shrink-0" />
                                                                                    <span className="truncate w-full text-[10px]">{m.file_name}</span>
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Resolution Notes (if any) */}
                                                    {item.resolution_notes && (
                                                        <div className="p-3 rounded bg-secondary-container/40 dark:bg-emerald-950/20 text-on-surface dark:text-dark-on-surface border border-secondary/30 text-xs space-y-1">
                                                            <div className="flex items-center gap-1.5 font-semibold text-secondary dark:text-emerald-400">
                                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                                <span>Resolution Notes &amp; Actions:</span>
                                                            </div>
                                                            <p className="whitespace-pre-wrap pl-5 text-xs text-on-surface-variant dark:text-dark-on-surface-variant">
                                                                {item.resolution_notes}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Timestamp Footer */}
                                                <div className="flex items-center justify-end pt-1">
                                                    <span className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant">
                                                        Filed on {new Date(item.created_at).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        /* ================== COMPACT TABLE VIEW ================== */
                        <div className="border border-outline-variant dark:border-dark-outline-variant rounded overflow-hidden bg-surface-container dark:bg-dark-surface-container">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-surface-container-low dark:bg-dark-surface-container-low border-b border-outline-variant dark:border-dark-outline-variant text-[11px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant uppercase tracking-wider">
                                            <th className="py-2.5 px-3 w-16 text-center">#ID</th>
                                            <th className="py-2.5 px-3 w-32">Type</th>
                                            <th className="py-2.5 px-3 w-28">Date</th>
                                            <th className="py-2.5 px-3">Complainant</th>
                                            <th className="py-2.5 px-3">Target / Against</th>
                                            <th className="py-2.5 px-3">Ticket / Store</th>
                                            <th className="py-2.5 px-3">Issue Reason</th>
                                            <th className="py-2.5 px-3 w-28 text-center">Status</th>
                                            <th className="py-2.5 px-3 w-28 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant/50 dark:divide-dark-outline-variant/50">
                                        {paginatedComplaints.map(item => {
                                            const isMgr = item.complaint_type === 'manager_against_worker';
                                            const isTicketLoading = loadingTicketId === item.ticket?.ticket_id;

                                            return (
                                                <tr
                                                    key={item.complaint_id}
                                                    className="hover:bg-surface-container-high/50 dark:hover:bg-dark-surface-container-high/50 transition-colors"
                                                >
                                                    <td className="py-2 px-3 text-center font-mono font-bold text-on-surface dark:text-dark-on-surface">
                                                        #{item.complaint_id}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${isMgr
                                                            ? 'bg-primary-fixed text-on-primary-fixed dark:bg-blue-950/60 dark:text-blue-300'
                                                            : 'bg-tertiary-fixed text-on-tertiary-fixed dark:bg-amber-950/60 dark:text-amber-300'
                                                            }`}>
                                                            {isMgr ? 'Mgr vs Wkr' : 'Wkr vs Mgr'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-on-surface-variant dark:text-dark-on-surface-variant text-[11px] whitespace-nowrap">
                                                        {new Date(item.created_at).toLocaleDateString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <div className="flex items-center gap-2">
                                                            <AvatarCircle user={item.complainant} size="sm" />
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-on-surface dark:text-dark-on-surface truncate max-w-[140px]">
                                                                    {item.complainant?.full_name || (item.complainant as any)?.username}
                                                                </p>
                                                                <p className="text-[10px] text-primary truncate">
                                                                    {item.complainant?.role?.role_name || 'Staff'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <div className="flex items-center gap-2">
                                                            <AvatarCircle user={item.against_user} size="sm" />
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-on-surface dark:text-dark-on-surface truncate max-w-[140px]">
                                                                    {item.against_user?.full_name || (item.against_user as any)?.username}
                                                                </p>
                                                                <p className="text-[10px] text-tertiary truncate">
                                                                    {item.against_user?.role?.role_name || 'Worker'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        {item.ticket ? (
                                                            <button
                                                                type="button"
                                                                disabled={isTicketLoading}
                                                                onClick={() => handleOpenTicket(item.ticket.ticket_id)}
                                                                className="text-left group cursor-pointer"
                                                            >
                                                                <p className="font-mono font-medium text-primary group-hover:underline flex items-center gap-1">
                                                                    <span>{item.ticket.work_order_no}</span>
                                                                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                                                </p>
                                                                <p className="text-[10px] text-on-surface-variant dark:text-dark-on-surface-variant truncate max-w-[120px]">
                                                                    {item.ticket.store_name}
                                                                </p>
                                                            </button>
                                                        ) : (
                                                            <span className="text-outline text-[11px]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <p className="font-medium text-on-surface dark:text-dark-on-surface truncate max-w-[180px]">
                                                            {item.issue_display}
                                                        </p>
                                                        <p className="text-[10px] text-on-surface-variant dark:text-dark-on-surface-variant truncate max-w-[180px]">
                                                            {item.description}
                                                        </p>
                                                    </td>
                                                    <td className="py-2 px-3 text-center">
                                                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold capitalize whitespace-nowrap ${getStatusChipClass(item.status)}`}>
                                                            {item.status.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-right">
                                                        <Can permission={[
                                                            'maintenance.all_complaint_view',
                                                            'maintenance.can_view_all_complaint',
                                                            'maintenance.can_view_manager_complaint'
                                                        ]}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setStatusUpdatingComplaint(item);
                                                                    setNewStatus(item.status);
                                                                    setResolutionNotes(item.resolution_notes || '');
                                                                }}
                                                                className="border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-xs px-2.5 py-1 rounded transition-colors cursor-pointer"
                                                            >
                                                                Update
                                                            </button>
                                                        </Can>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ================== PROFESSIONAL PAGINATION CONTROL ================== */}
                    {totalItems > 0 && (
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-on-surface-variant dark:text-dark-on-surface-variant px-3 py-2.5 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container">
                            {/* Left Side: Summary Info & Page Size Selector */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <div>
                                    Showing <strong className="font-semibold text-on-surface dark:text-dark-on-surface">{startIndex}</strong> to{' '}
                                    <strong className="font-semibold text-on-surface dark:text-dark-on-surface">{endIndex}</strong> of{' '}
                                    <strong className="font-semibold text-on-surface dark:text-dark-on-surface">{totalItems}</strong> entries
                                </div>

                                <div className="flex items-center gap-1.5 border-l border-outline-variant dark:border-dark-outline-variant pl-3">
                                    <span className="text-[11px]">Per page:</span>
                                    <select
                                        value={itemsPerPage}
                                        onChange={e => {
                                            setItemsPerPage(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="bg-surface-container dark:bg-dark-surface-container border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded px-2 py-0.5 focus:outline-none focus:border-primary cursor-pointer font-medium"
                                    >
                                        {itemsPerPageOptions.map(opt => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Right Side: Page Navigation Controls */}
                            <div className="flex items-center gap-1">
                                {/* First Page */}
                                <button
                                    type="button"
                                    disabled={validCurrentPage === 1}
                                    onClick={() => handlePageChange(1)}
                                    title="First page"
                                    className="p-1.5 rounded border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                >
                                    <ChevronsLeft className="w-3.5 h-3.5" />
                                </button>

                                {/* Previous Page */}
                                <button
                                    type="button"
                                    disabled={validCurrentPage === 1}
                                    onClick={() => handlePageChange(validCurrentPage - 1)}
                                    title="Previous page"
                                    className="px-2.5 py-1.5 rounded border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Prev</span>
                                </button>

                                {/* Page Numbers with Ellipsis */}
                                <div className="flex items-center gap-1">
                                    {pageNumbers.map((pg, idx) =>
                                        pg === 'ellipsis' ? (
                                            <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-outline">
                                                …
                                            </span>
                                        ) : (
                                            <button
                                                key={pg}
                                                type="button"
                                                onClick={() => handlePageChange(pg)}
                                                className={`min-w-[28px] h-7 px-2 rounded text-xs font-medium border cursor-pointer transition-colors flex items-center justify-center ${validCurrentPage === pg
                                                    ? 'border-primary bg-primary text-on-primary shadow-xs'
                                                    : 'border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface'
                                                    }`}
                                            >
                                                {pg}
                                            </button>
                                        )
                                    )}
                                </div>

                                {/* Next Page */}
                                <button
                                    type="button"
                                    disabled={validCurrentPage >= totalPages}
                                    onClick={() => handlePageChange(validCurrentPage + 1)}
                                    title="Next page"
                                    className="px-2.5 py-1.5 rounded border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                >
                                    <span className="hidden sm:inline">Next</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>

                                {/* Last Page */}
                                <button
                                    type="button"
                                    disabled={validCurrentPage >= totalPages}
                                    onClick={() => handlePageChange(totalPages)}
                                    title="Last page"
                                    className="p-1.5 rounded border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                >
                                    <ChevronsRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Status Update Modal */}
            <AnimatePresence>
                {statusUpdatingComplaint && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-xs">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant rounded p-5 w-full max-w-md space-y-4 shadow-xl"
                        >
                            <div className="flex items-center justify-between border-b border-outline-variant dark:border-dark-outline-variant pb-3">
                                <div className="flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4 text-primary" />
                                    <h3 className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                        Update Status #{statusUpdatingComplaint.complaint_id}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStatusUpdatingComplaint(null)}
                                    className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveStatusUpdate} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant mb-1.5">
                                        Complaint Status
                                    </label>
                                    <select
                                        value={newStatus}
                                        onChange={e => setNewStatus(e.target.value)}
                                        className="w-full bg-surface-container dark:bg-dark-surface-container border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary font-medium cursor-pointer"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="under_review">Under Review</option>
                                        <option value="resolved">Resolved</option>
                                        <option value="dismissed">Dismissed</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant mb-1.5">
                                        Resolution Notes &amp; Actions Taken
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={resolutionNotes}
                                        onChange={e => setResolutionNotes(e.target.value)}
                                        placeholder="Add resolution explanation, corrective measures, or action outcome..."
                                        className="w-full bg-surface-container dark:bg-dark-surface-container border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded p-2.5 focus:outline-none focus:border-primary resize-y"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant dark:border-dark-outline-variant">
                                    <button
                                        type="button"
                                        onClick={() => setStatusUpdatingComplaint(null)}
                                        disabled={savingStatus}
                                        className="border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium px-3 py-2 rounded flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                    >
                                        <span>Cancel</span>
                                    </button>
                                    <button
                                        ref={saveStatusBtnRef}
                                        type="submit"
                                        disabled={savingStatus}
                                        style={savingStatus && saveBtnSize.width ? { width: `${saveBtnSize.width}px`, height: `${saveBtnSize.height}px` } : undefined}
                                        className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-4 py-2 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                                    >
                                        {savingStatus && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                                        <span>Save Update</span>
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Ticket Detail Modal */}
            {selectedTicketForModal && (
                <TicketDetailModal
                    selectedTicket={selectedTicketForModal}
                    token={token}
                    user={user}
                    onClose={() => setSelectedTicketForModal(null)}
                    onRefreshList={fetchComplaints}
                />
            )}

            {/* Zoomable Image Preview */}
            {previewImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-xs">
                    <div className="relative max-w-4xl w-full max-h-[90vh] bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant rounded overflow-hidden flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-3 right-3 z-10 p-2 rounded bg-inverse-surface text-inverse-on-surface hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <ZoomableImage
                            src={previewImage}
                            alt="Complaint evidence preview"
                            containerClassName="w-full h-[80vh]"
                            className="max-w-full max-h-[80vh] object-contain"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
