import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, ShieldAlert, CheckCircle2, Clock, Filter,
    Search, User, Building2, Ticket as TicketIcon, FileText,
    Image as ImageIcon, Video, ChevronRight, X, Phone, PhoneCall,
    Check, AlertCircle, RefreshCw, Eye, MessageCircle, MessageSquare
} from 'lucide-react';
import type { RootState } from '@/store';
import { usePermission } from '@/hooks/usePermission';
import Can from '@/hooks/Can';
import { API_URL, getMediaUrl, isImage, isVideo, AvatarCircle } from './ticket/TicketsTypesAndComponents';
import type { Complaint, ComplaintMedia } from './ticket/ComplaintModal';
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

    // Data state
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_review' | 'resolved' | 'dismissed'>('all');

    // Selected ticket for modal
    const [selectedTicketForModal, setSelectedTicketForModal] = useState<any | null>(null);
    const [loadingTicketDetail, setLoadingTicketDetail] = useState(false);

    // Zoomable Image
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Status update modal state
    const [statusUpdatingComplaint, setStatusUpdatingComplaint] = useState<Complaint | null>(null);
    const [newStatus, setNewStatus] = useState<string>('resolved');
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [savingStatus, setSavingStatus] = useState(false);

    // Fetch complaints
    const fetchComplaints = useCallback(async () => {
        if (!token) return;
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

            if (searchQuery.trim()) {
                params.push(`search=${encodeURIComponent(searchQuery.trim())}`);
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
    }, [token, selectedTab, statusFilter, searchQuery]);

    useEffect(() => {
        fetchComplaints();
    }, [fetchComplaints]);

    // Open Ticket Detail Modal by Ticket ID
    const handleOpenTicket = async (ticketId: number) => {
        if (!token || !ticketId) return;
        setLoadingTicketDetail(true);
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
            setLoadingTicketDetail(false);
        }
    };

    // Handle status update submission
    const handleSaveStatusUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!statusUpdatingComplaint || !token) return;
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

    // Calculate metrics
    const stats = useMemo(() => {
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === 'pending').length;
        const inReview = complaints.filter(c => c.status === 'under_review').length;
        const resolved = complaints.filter(c => c.status === 'resolved').length;
        const managerComplaintsCount = complaints.filter(c => c.complaint_type === 'manager_against_worker').length;
        const workerComplaintsCount = complaints.filter(c => c.complaint_type === 'worker_against_manager').length;
        return { total, pending, inReview, resolved, managerComplaintsCount, workerComplaintsCount };
    }, [complaints]);

    return (
        <div className="min-h-screen bg-surface dark:bg-dark-surface p-3 sm:p-6 space-y-5">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-on-surface dark:text-dark-on-surface flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                        <span>{canViewAllComplaints ? 'Registered Complaints' : 'My Registered Complaints'}</span>
                    </h1>
                    <p className="text-xs text-outline mt-0.5">
                        {canViewAllComplaints
                            ? 'Track, review, and resolve quality, completion, and conduct complaints between managers and workers.'
                            : 'View and track the status of complaints filed from your account.'}
                    </p>
                </div>

                <button
                    onClick={fetchComplaints}
                    disabled={loading}
                    className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-container text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 sm:p-4 rounded-xl bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant">
                    <p className="text-xs font-bold text-outline">Total Complaints</p>
                    <p className="text-2xl font-black text-on-surface dark:text-dark-on-surface mt-1">{stats.total}</p>
                    <div className="flex items-center gap-2 text-[11px] text-outline mt-1 font-semibold">
                        <span>{stats.managerComplaintsCount} Mgr</span>
                        <span>•</span>
                        <span>{stats.workerComplaintsCount} Wkr</span>
                    </div>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">Pending Review</p>
                    <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{stats.pending}</p>
                    <p className="text-[11px] text-red-500 font-semibold mt-1">Requires immediate attention</p>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
                    <p className="text-xs font-bold text-sky-600 dark:text-sky-400">Under Review</p>
                    <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">{stats.inReview}</p>
                    <p className="text-[11px] text-sky-500 font-semibold mt-1">Investigation ongoing</p>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Resolved</p>
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.resolved}</p>
                    <p className="text-[11px] text-emerald-500 font-semibold mt-1">Action concluded</p>
                </div>
            </div>

            {/* Filter Navigation Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant dark:border-dark-outline-variant pb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {canViewAllComplaints ? (
                        <>
                            <Can permission={['maintenance.can_view_manager_complaint', 'maintenance.can_view_worker_complaint']}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTab('all');
                                        navigate('/complaints/all');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        selectedTab === 'all'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-outline hover:text-on-surface hover:bg-surface-container'
                                    }`}
                                >
                                    All Complaints
                                </button>
                            </Can>

                            <Can permission="maintenance.can_view_manager_complaint">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTab('manager');
                                        navigate('/complaints/manager');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        selectedTab === 'manager'
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'text-outline hover:text-on-surface hover:bg-surface-container'
                                    }`}
                                >
                                    <span>Manager Complaints</span>
                                    <span className="text-[10px] opacity-80">(vs Workers)</span>
                                </button>
                            </Can>

                            <Can permission="maintenance.can_view_worker_complaint">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTab('worker');
                                        navigate('/complaints/worker');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        selectedTab === 'worker'
                                            ? 'bg-amber-600 text-white shadow-xs'
                                            : 'text-outline hover:text-on-surface hover:bg-surface-container'
                                    }`}
                                >
                                    <span>Worker Complaints</span>
                                    <span className="text-[10px] opacity-80">(vs Managers)</span>
                                </button>
                            </Can>
                        </>
                    ) : (
                        <div className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary">
                            My Filed Complaints
                        </div>
                    )}
                </div>

                {/* Search & Status Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1 sm:flex-none">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                        <input
                            type="text"
                            placeholder="Search ticket, worker, manager..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface-container dark:bg-dark-surface-container border border-outline-variant text-on-surface focus:outline-none focus:border-primary"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                        className="text-xs py-1.5 px-3 rounded-lg bg-surface-container dark:bg-dark-surface-container border border-outline-variant text-on-surface focus:outline-none focus:border-primary font-semibold"
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="under_review">Under Review</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                    </select>
                </div>
            </div>

            {/* Complaints List Cards */}
            {loading ? (
                <div className="p-12 text-center text-outline">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                    <p className="text-xs font-semibold">Loading complaints records...</p>
                </div>
            ) : complaints.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-outline-variant dark:border-dark-outline-variant rounded-2xl bg-surface-container/30">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                    <h3 className="text-sm font-bold text-on-surface dark:text-dark-on-surface">No complaints found</h3>
                    <p className="text-xs text-outline mt-1 max-w-sm mx-auto">
                        No registered complaints match your current filter criteria.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {complaints.map(item => {
                        const isMgrComplaint = item.complaint_type === 'manager_against_worker';
                        const complainantPhone = item.complainant?.phone || item.complainant?.whatsapp_number;
                        const againstPhone = item.against_user?.phone || item.against_user?.whatsapp_number;

                        return (
                            <motion.div
                                key={item.complaint_id}
                                layout
                                className="p-4 sm:p-5 rounded-2xl border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-xs space-y-4"
                            >
                                {/* Top Banner: Type, Status, & Actions */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 pb-3">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider ${
                                                isMgrComplaint
                                                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                            }`}
                                        >
                                            {isMgrComplaint ? 'Manager against Worker' : 'Worker against Manager'}
                                        </span>

                                        <span className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                            #{item.complaint_id}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                                                item.status === 'resolved'
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                    : item.status === 'under_review'
                                                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                                    : item.status === 'dismissed'
                                                    ? 'bg-slate-500/15 text-slate-600'
                                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                            }`}
                                        >
                                            {item.status.replace('_', ' ')}
                                        </span>

                                        {/* Status Update Trigger (Admin or Store Manager) */}
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
                                                className="px-2.5 py-1 text-xs font-semibold rounded bg-surface hover:bg-surface-container-high border border-outline-variant text-primary transition-all cursor-pointer"
                                            >
                                                Update Status
                                            </button>
                                        </Can>
                                    </div>
                                </div>

                                {/* Main Content Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Left: Profiles (Complainant vs Against) */}
                                    <div className="space-y-3 bg-surface dark:bg-dark-surface p-3.5 rounded-xl border border-outline-variant/60">
                                        {/* Complainant Profile */}
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                                                Complainant (Filed By)
                                            </span>
                                            <div className="flex items-center gap-2.5">
                                                <AvatarCircle user={item.complainant} size="md" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-xs sm:text-sm text-on-surface dark:text-dark-on-surface truncate">
                                                        {item.complainant?.full_name || (item.complainant as any)?.username}
                                                    </p>
                                                    <span className="inline-block text-[11px] font-semibold text-primary">
                                                        {item.complainant?.role?.role_name || 'Staff'}
                                                    </span>
                                                    {complainantPhone && (
                                                        <a
                                                            href={`tel:${String(complainantPhone).replace(/\D/g, '')}`}
                                                            className="flex items-center gap-1 text-[11px] text-outline hover:text-primary mt-0.5"
                                                        >
                                                            <Phone className="w-3 h-3 text-emerald-500" />
                                                            <span>{complainantPhone}</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-outline-variant/40" />

                                        {/* Against Profile */}
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                                                Target (Against Whom)
                                            </span>
                                            <div className="flex items-center gap-2.5">
                                                <AvatarCircle user={item.against_user} size="md" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-xs sm:text-sm text-on-surface dark:text-dark-on-surface truncate">
                                                        {item.against_user?.full_name || (item.against_user as any)?.username}
                                                    </p>
                                                    <span className="inline-block text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                                        {item.against_user?.role?.role_name || 'Worker'}
                                                    </span>
                                                    {againstPhone && (
                                                        <a
                                                            href={`tel:${String(againstPhone).replace(/\D/g, '')}`}
                                                            className="flex items-center gap-1 text-[11px] text-outline hover:text-primary mt-0.5"
                                                        >
                                                            <Phone className="w-3 h-3 text-emerald-500" />
                                                            <span>{againstPhone}</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle & Right: Issue Details & Ticket Information */}
                                    <div className="lg:col-span-2 space-y-3">
                                        {/* Issue Reason Banner */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface dark:bg-dark-surface border border-outline-variant/60">
                                            <div className="flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                                <span className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                                    Issue Reason: <span className="text-red-600 dark:text-red-400">{item.issue_display}</span>
                                                </span>
                                            </div>

                                            {/* Primary Ticket Link */}
                                            {item.ticket && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenTicket(item.ticket.ticket_id)}
                                                    className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                                >
                                                    <TicketIcon className="w-3.5 h-3.5" />
                                                    <span>{item.ticket.work_order_no}</span>
                                                    <span className="text-[10px] opacity-75 font-normal">({item.ticket.store_name})</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Description */}
                                        <div className="p-3.5 rounded-xl bg-surface dark:bg-dark-surface border border-outline-variant/60 space-y-1.5">
                                            <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                                                Complaint Explanation
                                            </span>
                                            <p className="text-xs text-on-surface dark:text-dark-on-surface whitespace-pre-wrap leading-relaxed">
                                                {item.description}
                                            </p>
                                        </div>

                                        {/* Attached Media Files */}
                                        {item.media_files && item.media_files.length > 0 && (
                                            <div className="space-y-1.5">
                                                <span className="text-[10px] font-bold text-outline uppercase tracking-wider block">
                                                    Attached Evidence ({item.media_files.length})
                                                </span>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {item.media_files.map(m => {
                                                        const fullUrl = getMediaUrl(m.file_url);
                                                        const isImg = isImage(m.file_name);
                                                        const isVid = isVideo(m.file_name);
                                                        return (
                                                            <div
                                                                key={m.media_id}
                                                                className="relative w-20 h-20 rounded-xl overflow-hidden border border-outline-variant dark:border-dark-outline-variant bg-surface group cursor-pointer shadow-2xs"
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
                                                                        className="w-full h-full flex flex-col items-center justify-center p-1 text-primary text-[10px] text-center"
                                                                    >
                                                                        <Video className="w-5 h-5 mb-1" />
                                                                        <span className="truncate w-full">{m.file_name}</span>
                                                                    </a>
                                                                ) : (
                                                                    <a
                                                                        href={fullUrl}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="w-full h-full flex flex-col items-center justify-center p-1 text-primary text-[10px] text-center"
                                                                    >
                                                                        <FileText className="w-5 h-5 mb-1" />
                                                                        <span className="truncate w-full">{m.file_name}</span>
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
                                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                                                <span className="font-bold block">Resolution Notes:</span>
                                                <p className="whitespace-pre-wrap">{item.resolution_notes}</p>
                                            </div>
                                        )}

                                        {/* Timestamp */}
                                        <p className="text-[10px] text-outline text-right pt-1">
                                            Filed on {new Date(item.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Status Update Modal */}
            {statusUpdatingComplaint && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="bg-surface dark:bg-dark-surface border border-outline-variant rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-outline-variant pb-2.5">
                            <h3 className="text-sm font-bold text-on-surface">
                                Update Complaint Status #{statusUpdatingComplaint.complaint_id}
                            </h3>
                            <button
                                onClick={() => setStatusUpdatingComplaint(null)}
                                className="text-outline hover:text-on-surface p-1"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveStatusUpdate} className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-bold text-on-surface mb-1">
                                    Status
                                </label>
                                <select
                                    value={newStatus}
                                    onChange={e => setNewStatus(e.target.value)}
                                    className="w-full text-xs p-2.5 rounded-lg bg-surface border border-outline-variant text-on-surface focus:outline-none focus:border-primary font-semibold"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="under_review">Under Review</option>
                                    <option value="resolved">Resolved</option>
                                    <option value="dismissed">Dismissed</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-on-surface mb-1">
                                    Resolution Notes / Actions Taken
                                </label>
                                <textarea
                                    rows={3}
                                    value={resolutionNotes}
                                    onChange={e => setResolutionNotes(e.target.value)}
                                    placeholder="Add resolution explanation or action outcome..."
                                    className="w-full text-xs p-2.5 rounded-lg bg-surface border border-outline-variant text-on-surface focus:outline-none focus:border-primary resize-y"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant">
                                <button
                                    type="button"
                                    onClick={() => setStatusUpdatingComplaint(null)}
                                    disabled={savingStatus}
                                    className="px-3 py-1.5 text-xs font-bold text-outline hover:text-on-surface rounded-lg hover:bg-surface-container"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingStatus}
                                    className="px-4 py-1.5 text-xs font-bold bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors"
                                >
                                    {savingStatus ? 'Saving...' : 'Save Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
                    <div className="relative max-w-4xl w-full max-h-[90vh] bg-black/40 rounded-xl overflow-hidden flex flex-col items-center">
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                            <X className="w-5 h-5" />
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
