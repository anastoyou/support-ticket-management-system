import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, AlertTriangle, CheckCircle2,
    FileText, Video, Trash2, Loader2, Upload,
    User, Building2, Search, Check, AlertCircle,
    ChevronDown, Phone, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight, ShieldAlert
} from 'lucide-react';
import { API_URL, type Ticket, type UserStub, getMediaUrl, isImage, isVideo, AvatarCircle } from './TicketsTypesAndComponents';
import { usePermission } from '@/hooks/usePermission';
import Can from '@/hooks/Can';
import { ZoomableImage } from '@/components/ZoomableImage';

export interface ComplaintIssueType {
    issue_type_id: number;
    name: string;
    role_type?: string;
    is_active: boolean;
    created_at?: string;
}

export interface ComplaintMedia {
    media_id: number;
    file_name: string;
    file_url: string;
    rotation?: number;
    uploaded_date?: string;
}

export interface Complaint {
    complaint_id: number;
    complaint_type: 'manager_against_worker' | 'worker_against_manager';
    ticket: {
        ticket_id: number;
        work_order_no: string;
        title: string;
        store_name?: string;
        department_name?: string;
        status_name?: string;
    };
    complainant: UserStub;
    against_user: UserStub;
    issue_type?: ComplaintIssueType | null;
    custom_issue?: string | null;
    issue_display: string;
    description: string;
    status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
    resolution_notes?: string | null;
    media_files: ComplaintMedia[];
    created_at: string;
    updated_at: string;
}

interface ComplaintModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: Ticket;
    currentUser: any;
    token: string | null;
    onComplaintCreated?: () => void;
}

// Helper to check if a user is strictly a Store Manager
const isUserStoreManager = (u: any): boolean => {
    if (!u) return false;
    const rName = (
        typeof u.role === 'object' ? u.role?.role_name : u.role
    ) || '';
    return /store\s*manager/i.test(String(rName).trim());
};

const ITEMS_PER_PAGE = 3;

export const ComplaintModal: React.FC<ComplaintModalProps> = ({
    isOpen,
    onClose,
    ticket,
    currentUser,
    token,
    onComplaintCreated,
}) => {
    const { hasPermission } = usePermission();

    // Check user roles
    const userRoleName = (
        ((currentUser as any)?.role?.role_name || (currentUser as any)?.role) || ''
    ).toLowerCase();

    const isWorker = Boolean(
        userRoleName.includes('technician') ||
        userRoleName.includes('worker') ||
        ticket.allocations?.some(a => Number(a.worker?.user_id) === Number(currentUser?.user_id))
    );

    // Strictly one option per user role
    const complaintType: 'manager_against_worker' | 'worker_against_manager' = isWorker
        ? 'worker_against_manager'
        : 'manager_against_worker';

    const isAdmin = Boolean(
        currentUser?.is_superuser ||
        userRoleName.includes('admin') ||
        userRoleName.includes('management')
    );

    // Permission checks to view existing complaints
    const canViewManagerComplaints = hasPermission('maintenance.can_view_manager_complaint') || isAdmin;
    const canViewWorkerComplaints = hasPermission('maintenance.can_view_worker_complaint') || isAdmin;
    const canViewAllComplaints = Boolean(
        isAdmin ||
        hasPermission('maintenance.all_complaint_view') ||
        hasPermission('maintenance.can_view_all_complaint')
    );
    const canCreateComplaint = Boolean(
        isAdmin ||
        hasPermission('maintenance.can_create_complaint') ||
        hasPermission('can_create_complaint')
    );
    const canViewAnyComplaints = canViewAllComplaints || canViewManagerComplaints || canViewWorkerComplaints;

    // View state
    const [activeTab, setActiveTab] = useState<'create' | 'list'>(() => (canCreateComplaint ? 'create' : 'list'));

    useEffect(() => {
        if (!canCreateComplaint && activeTab === 'create') {
            setActiveTab('list');
        }
    }, [canCreateComplaint, activeTab]);

    const [complaintsList, setComplaintsList] = useState<Complaint[]>([]);
    const [loadingComplaints, setLoadingComplaints] = useState(false);

    // Form state
    const [againstUserId, setAgainstUserId] = useState<number | ''>('');
    const [selectedIssueValue, setSelectedIssueValue] = useState<string>(''); // issue_type_id or 'other'
    const [customIssue, setCustomIssue] = useState('');
    const [description, setDescription] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [filePreviews, setFilePreviews] = useState<{ file: File; url: string; isImg: boolean; isVid: boolean }[]>([]);

    // Predefined issues & Candidate Users
    const [predefinedIssues, setPredefinedIssues] = useState<ComplaintIssueType[]>([]);
    const [availableWorkers, setAvailableWorkers] = useState<UserStub[]>([]);
    const [availableManagers, setAvailableManagers] = useState<UserStub[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Pagination for modal list
    const [listPage, setListPage] = useState(1);

    // Zoom image state
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Ref for submit button reflow lock
    const submitBtnRef = useRef<HTMLButtonElement>(null);
    const [submitBtnSize, setSubmitBtnSize] = useState<{ width?: number; height?: number }>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch existing complaints for this ticket
    const fetchComplaints = async () => {
        if (!token || !ticket.ticket_id) return;
        setLoadingComplaints(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/complaint/?ticket_id=${ticket.ticket_id}`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.results || []);
                setComplaintsList(list);
                if (list.length > 0 && canViewAnyComplaints) {
                    setActiveTab('list');
                } else if (canCreateComplaint) {
                    setActiveTab('create');
                }
            }
        } catch (err) {
            console.error('Failed to fetch ticket complaints:', err);
        } finally {
            setLoadingComplaints(false);
        }
    };

    // Load form dependencies
    useEffect(() => {
        if (!isOpen) return;
        fetchComplaints();

        // 1. Fetch role-specific predefined issues from backend
        const fetchIssues = async () => {
            try {
                const res = await fetch(`${API_URL}/maintenance/complaint-issues/?role_type=${complaintType}`, {
                    headers: token ? { Authorization: `Token ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data.results || []);
                    setPredefinedIssues(list);
                }
            } catch (err) {
                console.error('Failed to load complaint issues:', err);
            }
        };

        // 2. Extract candidate workers from ticket allocations
        const ticketWorkers: UserStub[] = [];
        if (ticket.allocations && ticket.allocations.length > 0) {
            ticket.allocations.forEach(a => {
                if (a.worker && !ticketWorkers.some(w => w.user_id === a.worker.user_id)) {
                    ticketWorkers.push(a.worker);
                }
            });
        }
        setAvailableWorkers(ticketWorkers);

        // 3. Extract candidate managers strictly:
        const fetchStoreManagers = async () => {
            const managersMap = new Map<number, UserStub>();

            if (ticket.store?.manager && isUserStoreManager(ticket.store.manager)) {
                managersMap.set(ticket.store.manager.user_id, ticket.store.manager);
            }

            if (ticket.created_by && isUserStoreManager(ticket.created_by)) {
                managersMap.set(ticket.created_by.user_id, ticket.created_by);
            }

            const storeId = ticket.store?.store_id;
            if (storeId) {
                try {
                    const res = await fetch(`${API_URL}/stores/managers/?store=${encodeURIComponent(storeId)}`, {
                        headers: token ? { Authorization: `Token ${token}` } : {},
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const list = Array.isArray(data) ? data : (data.results || []);
                        list.forEach((m: any) => {
                            if (isUserStoreManager(m)) {
                                managersMap.set(m.user_id, m);
                            }
                        });
                    }
                } catch (err) {
                    console.error('Failed to load store managers:', err);
                }
            }

            setAvailableManagers(Array.from(managersMap.values()));
        };

        fetchIssues();
        fetchStoreManagers();
    }, [isOpen, ticket.ticket_id, ticket.store?.store_id, token, complaintType]);

    // Automatically set default target user
    useEffect(() => {
        if (complaintType === 'manager_against_worker') {
            if (availableWorkers.length > 0 && !againstUserId) {
                setAgainstUserId(availableWorkers[0].user_id);
            }
        } else {
            if (availableManagers.length > 0 && !againstUserId) {
                setAgainstUserId(availableManagers[0].user_id);
            }
        }
    }, [complaintType, availableWorkers, availableManagers]);

    // Handle file selection and preview generation
    const handleFilesSelected = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const newFiles = Array.from(files);
        setSelectedFiles(prev => [...prev, ...newFiles]);

        const newPreviews = newFiles.map(file => ({
            file,
            url: URL.createObjectURL(file),
            isImg: isImage(file.name),
            isVid: isVideo(file.name),
        }));
        setFilePreviews(prev => [...prev, ...newPreviews]);
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
        setFilePreviews(prev => {
            const item = prev[index];
            if (item?.url) URL.revokeObjectURL(item.url);
            return prev.filter((_, i) => i !== index);
        });
    };

    // Form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');

        if (!canCreateComplaint) {
            setErrorMsg('You do not have permission to register complaints.');
            return;
        }

        if (!againstUserId) {
            setErrorMsg(
                complaintType === 'worker_against_manager'
                    ? 'Please select the store manager against whom you are filing this complaint.'
                    : 'Please select against whom you are filing this complaint.'
            );
            return;
        }
        if (!selectedIssueValue) {
            setErrorMsg('Please select an issue reason from the dropdown.');
            return;
        }
        if (selectedIssueValue === 'other' && !customIssue.trim()) {
            setErrorMsg('Please specify the custom issue reason in the field below.');
            return;
        }
        if (!description.trim()) {
            setErrorMsg('Please provide a detailed description of the complaint.');
            return;
        }

        if (submitBtnRef.current) {
            const rect = submitBtnRef.current.getBoundingClientRect();
            setSubmitBtnSize({ width: rect.width, height: rect.height });
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('ticket_id', String(ticket.ticket_id));
            formData.append('complaint_type', complaintType);
            formData.append('against_user_id', String(againstUserId));

            if (selectedIssueValue === 'other') {
                formData.append('custom_issue', customIssue.trim());
            } else {
                formData.append('issue_type_id', String(selectedIssueValue));
            }

            formData.append('description', description.trim());

            selectedFiles.forEach(file => {
                formData.append('files', file);
            });

            const res = await fetch(`${API_URL}/maintenance/complaint/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                },
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const errStr = typeof errData === 'object' ? Object.values(errData).flat().join(' ') : 'Failed to register complaint.';
                throw new Error(errStr || 'Failed to submit complaint.');
            }

            setSubmitSuccess(true);
            setTimeout(() => {
                setSubmitSuccess(false);
                setDescription('');
                setCustomIssue('');
                setSelectedIssueValue('');
                setSelectedFiles([]);
                setFilePreviews([]);
                fetchComplaints();
                setActiveTab('list');
                if (onComplaintCreated) onComplaintCreated();
            }, 1200);
        } catch (err: any) {
            setErrorMsg(err.message || 'Error occurred while saving complaint.');
        } finally {
            setSubmitting(false);
        }
    };

    // Modal List Pagination
    const totalListPages = Math.max(1, Math.ceil(complaintsList.length / ITEMS_PER_PAGE));
    const validListPage = Math.min(Math.max(1, listPage), totalListPages);
    const paginatedList = useMemo(() => {
        const start = (validListPage - 1) * ITEMS_PER_PAGE;
        return complaintsList.slice(start, start + ITEMS_PER_PAGE);
    }, [complaintsList, validListPage]);

    // Status Chip Helper
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

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                {/* Backdrop with M3 blur */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-xs"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    className="relative bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant w-full max-w-2xl max-h-[90vh] flex flex-col rounded shadow-2xl overflow-hidden z-10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-1.5 rounded bg-error/10 text-error dark:text-red-400">
                                <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold tracking-tight text-on-surface dark:text-dark-on-surface flex items-center gap-2">
                                    <span>Ticket Complaint</span>
                                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container-high dark:bg-dark-surface-container-high text-on-surface-variant dark:text-dark-on-surface-variant font-semibold">
                                        {ticket.work_order_no}
                                    </span>
                                </h3>
                                <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant truncate">
                                    {ticket.title} {ticket.store?.store_name ? `• ${ticket.store.store_name}` : ''}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high rounded transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 px-4 pt-2.5 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container shrink-0">
                        <Can permission="maintenance.can_create_complaint">
                            <button
                                type="button"
                                onClick={() => setActiveTab('create')}
                                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'create'
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-on-surface-variant dark:text-dark-on-surface-variant hover:text-on-surface'
                                    }`}
                            >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Register Complaint</span>
                            </button>
                        </Can>

                        <Can permission={[
                            'maintenance.can_view_manager_complaint',
                            'maintenance.can_view_worker_complaint',
                            'maintenance.all_complaint_view',
                            'maintenance.can_view_all_complaint'
                        ]}>
                            <button
                                type="button"
                                onClick={() => setActiveTab('list')}
                                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'list'
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-on-surface-variant dark:text-dark-on-surface-variant hover:text-on-surface'
                                    }`}
                            >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{canViewAllComplaints ? 'Existing Complaints' : 'My Filed Complaints'}</span>
                                {complaintsList.length > 0 && (
                                    <span className="px-1.5 py-0.2 bg-primary text-on-primary rounded-full text-[10px] font-bold">
                                        {complaintsList.length}
                                    </span>
                                )}
                            </button>
                        </Can>
                    </div>

                    {/* Body Content */}
                    <div className="p-4 overflow-y-auto space-y-4 flex-1">
                        {/* Tab 1: Register Complaint Form */}
                        {activeTab === 'create' && (canCreateComplaint ? (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {submitSuccess && (
                                    <div className="p-3 bg-secondary-container/40 border border-secondary/30 rounded flex items-center gap-2 text-on-secondary-container text-xs font-medium">
                                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        <span>Complaint registered successfully!</span>
                                    </div>
                                )}

                                {errorMsg && (
                                    <div className="p-3 bg-error-container/40 border border-error/30 rounded flex items-center gap-2 text-on-error-container text-xs font-medium">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-error" />
                                        <span>{errorMsg}</span>
                                    </div>
                                )}

                                {/* Against Whom Selection */}
                                <div>
                                    <label className="block text-xs font-semibold text-on-surface dark:text-dark-on-surface mb-1.5">
                                        {complaintType === 'manager_against_worker'
                                            ? 'Worker (Against Whom):'
                                            : 'Store Manager (Against Whom):'}
                                        <span className="text-error ml-0.5">*</span>
                                    </label>
                                    <select
                                        value={againstUserId}
                                        onChange={e => setAgainstUserId(Number(e.target.value) || '')}
                                        className="w-full text-xs p-2.5 rounded bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary font-medium cursor-pointer"
                                        required
                                    >
                                        <option value="">-- Select Person --</option>
                                        {complaintType === 'manager_against_worker' ? (
                                            availableWorkers.length > 0 ? (
                                                availableWorkers.map(w => (
                                                    <option key={w.user_id} value={w.user_id}>
                                                        {w.full_name || (w as any).username} (Allocated Worker)
                                                    </option>
                                                ))
                                            ) : (
                                                <option disabled value="">No workers currently allocated to this ticket</option>
                                            )
                                        ) : (
                                            availableManagers.length > 0 ? (
                                                availableManagers.map(m => (
                                                    <option key={m.user_id} value={m.user_id}>
                                                        {m.full_name || (m as any).username} (Store Manager - {ticket.store?.store_name || 'Store'})
                                                    </option>
                                                ))
                                            ) : (
                                                <option disabled value="">No store manager found with access to this store</option>
                                            )
                                        )}
                                    </select>
                                    {complaintType === 'worker_against_manager' && availableManagers.length === 0 && (
                                        <p className="text-[11px] text-tertiary dark:text-amber-400 mt-1">
                                            No assigned store manager with access found for this location.
                                        </p>
                                    )}
                                </div>

                                {/* Issue Reason: DROPDOWN with predefined options and 'Other' */}
                                <div>
                                    <label className="block text-xs font-semibold text-on-surface dark:text-dark-on-surface mb-1.5">
                                        Issue Reason <span className="text-error ml-0.5">*</span>
                                    </label>
                                    <select
                                        value={selectedIssueValue}
                                        onChange={e => {
                                            setSelectedIssueValue(e.target.value);
                                            if (e.target.value !== 'other') {
                                                setCustomIssue('');
                                            }
                                        }}
                                        className="w-full text-xs p-2.5 rounded bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary font-medium cursor-pointer"
                                        required
                                    >
                                        <option value="">-- Select Issue Reason --</option>
                                        {predefinedIssues.map(issue => (
                                            <option key={issue.issue_type_id} value={issue.issue_type_id}>
                                                {issue.name}
                                            </option>
                                        ))}
                                        <option value="other">Other (Custom Issue)</option>
                                    </select>

                                    {/* Custom issue field when 'other' is selected */}
                                    {selectedIssueValue === 'other' && (
                                        <div className="mt-2">
                                            <input
                                                type="text"
                                                placeholder="Enter specific custom issue reason..."
                                                value={customIssue}
                                                onChange={e => setCustomIssue(e.target.value)}
                                                className="w-full text-xs p-2.5 rounded bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary"
                                                required
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Detailed Description */}
                                <div>
                                    <label className="block text-xs font-semibold text-on-surface dark:text-dark-on-surface mb-1.5">
                                        Detailed Description <span className="text-error ml-0.5">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Describe what occurred, impact, and any specific incidents..."
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        className="w-full text-xs p-3 rounded bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary resize-y"
                                        required
                                    />
                                </div>

                                {/* Media Attachments */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                            Relevant Media (Images, Videos, Voice, Documents)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded transition-colors flex items-center gap-1 cursor-pointer"
                                        >
                                            <Upload className="w-3.5 h-3.5" />
                                            <span>Add Media</span>
                                        </button>
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept="image/*,video/*,audio/*,.pdf"
                                        className="hidden"
                                        onChange={e => handleFilesSelected(e.target.files)}
                                    />

                                    {filePreviews.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {filePreviews.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    className="relative group border border-outline-variant dark:border-dark-outline-variant rounded overflow-hidden bg-surface-container-low dark:bg-dark-surface-container-low aspect-video flex items-center justify-center"
                                                >
                                                    {item.isImg ? (
                                                        <img src={item.url} alt="upload" className="w-full h-full object-cover" />
                                                    ) : item.isVid ? (
                                                        <div className="flex flex-col items-center justify-center p-2 text-on-surface-variant">
                                                            <Video className="w-6 h-6 text-primary mb-1" />
                                                            <span className="text-[10px] truncate max-w-[80px]">{item.file.name}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center p-2 text-on-surface-variant">
                                                            <FileText className="w-6 h-6 text-primary mb-1" />
                                                            <span className="text-[10px] truncate max-w-[80px]">{item.file.name}</span>
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFile(idx)}
                                                        className="absolute top-1 right-1 p-1 rounded bg-error text-on-error opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                                                        title="Remove File"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="border border-dashed border-outline-variant dark:border-dark-outline-variant rounded p-4 text-center cursor-pointer hover:border-primary transition-colors bg-surface-container-low/50 dark:bg-dark-surface-container-low/50"
                                        >
                                            <Upload className="w-6 h-6 mx-auto text-on-surface-variant dark:text-dark-on-surface-variant mb-1 opacity-70" />
                                            <p className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                                Click to upload photos, videos, or documents
                                            </p>
                                            <p className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant mt-0.5">
                                                Attach evidence supporting your complaint
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Form Action Buttons */}
                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant dark:border-dark-outline-variant">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={submitting}
                                        className="border border-outline/30 dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium px-3.5 py-2 rounded transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <Can permission="maintenance.can_create_complaint">
                                        <button
                                            ref={submitBtnRef}
                                            type="submit"
                                            disabled={submitting}
                                            style={submitting && submitBtnSize.width ? { width: `${submitBtnSize.width}px`, height: `${submitBtnSize.height}px` } : undefined}
                                            className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-4 py-2 rounded flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                                        >
                                            {submitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                                    <span>Registering...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                                    <span>Submit Complaint</span>
                                                </>
                                            )}
                                        </button>
                                    </Can>
                                </div>
                            </form>
                        ) : (
                            <div className="p-8 text-center border border-dashed border-outline-variant dark:border-dark-outline-variant rounded bg-surface-container-low/40">
                                <AlertCircle className="w-8 h-8 text-on-surface-variant mx-auto mb-2 opacity-60" />
                                <p className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">Permission Required</p>
                                <p className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant mt-1">
                                    You do not have permission to register complaints.
                                </p>
                            </div>
                        ))}

                        {/* Tab 2: Existing Complaints List */}
                        {activeTab === 'list' && (
                            <div className="space-y-3">
                                {loadingComplaints ? (
                                    <div className="p-8 text-center text-on-surface-variant dark:text-dark-on-surface-variant">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                                        <p className="text-xs">Loading complaints...</p>
                                    </div>
                                ) : complaintsList.length === 0 ? (
                                    <div className="p-8 text-center border border-dashed border-outline-variant dark:border-dark-outline-variant rounded bg-surface-container-low/40">
                                        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                                        <p className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                            No complaints registered for this ticket
                                        </p>
                                        <p className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant mt-0.5">
                                            Work is proceeding normally without registered disputes.
                                        </p>

                                        {canCreateComplaint && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('create')}
                                                className="mt-3 px-3 py-1.5 text-xs font-medium bg-primary text-on-primary hover:bg-primary-container rounded inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                            >
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                <span>Register Complaint</span>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        {paginatedList.map(item => (
                                            <div
                                                key={item.complaint_id}
                                                className="p-3.5 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface space-y-3"
                                            >
                                                {/* Header */}
                                                <div className="flex items-start justify-between gap-2 border-b border-outline-variant dark:border-dark-outline-variant pb-2.5">
                                                    <div>
                                                        <span
                                                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider mb-1 ${item.complaint_type === 'manager_against_worker'
                                                                ? 'bg-primary-fixed text-on-primary-fixed dark:bg-blue-950/60 dark:text-blue-300'
                                                                : 'bg-tertiary-fixed text-on-tertiary-fixed dark:bg-amber-950/60 dark:text-amber-300'
                                                                }`}
                                                        >
                                                            {item.complaint_type === 'manager_against_worker'
                                                                ? 'Manager vs Worker'
                                                                : 'Worker vs Manager'}
                                                        </span>
                                                        <h4 className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                                            {item.issue_display}
                                                        </h4>
                                                    </div>

                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${getStatusChipClass(item.status)}`}>
                                                        {item.status.replace('_', ' ')}
                                                    </span>
                                                </div>

                                                {/* Profiles Involved */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded bg-surface-container-low dark:bg-dark-surface-container-low border border-outline-variant/60 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <AvatarCircle user={item.complainant} size="sm" />
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Complainant:</p>
                                                            <p className="font-semibold text-on-surface dark:text-dark-on-surface truncate">
                                                                {item.complainant?.full_name || (item.complainant as any)?.username}
                                                            </p>
                                                            <p className="text-[10px] text-primary">
                                                                {item.complainant?.role?.role_name || 'Staff'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-outline-variant/60 sm:pl-2">
                                                        <AvatarCircle user={item.against_user} size="sm" />
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Against:</p>
                                                            <p className="font-semibold text-on-surface dark:text-dark-on-surface truncate">
                                                                {item.against_user?.full_name || (item.against_user as any)?.username}
                                                            </p>
                                                            <p className="text-[10px] text-tertiary">
                                                                {item.against_user?.role?.role_name || 'Worker'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Description */}
                                                <p className="text-xs text-on-surface dark:text-dark-on-surface whitespace-pre-wrap bg-surface-container-lowest dark:bg-dark-surface-container-lowest p-2.5 rounded border border-outline-variant/50 leading-relaxed">
                                                    {item.description}
                                                </p>

                                                {/* Media Files */}
                                                {item.media_files && item.media_files.length > 0 && (
                                                    <div>
                                                        <p className="text-[11px] font-semibold text-on-surface-variant dark:text-dark-on-surface-variant mb-1.5">
                                                            Attached Media ({item.media_files.length}):
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {item.media_files.map(m => {
                                                                const fullUrl = getMediaUrl(m.file_url);
                                                                const isImg = isImage(m.file_name);
                                                                return (
                                                                    <div
                                                                        key={m.media_id}
                                                                        className="relative w-16 h-16 rounded overflow-hidden border border-outline-variant bg-surface-container group cursor-pointer"
                                                                        onClick={() => isImg && setPreviewImage(fullUrl)}
                                                                    >
                                                                        {isImg ? (
                                                                            <img src={fullUrl} alt={m.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                        ) : (
                                                                            <a
                                                                                href={fullUrl}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="w-full h-full flex flex-col items-center justify-center p-1 text-primary text-[10px] text-center"
                                                                            >
                                                                                <FileText className="w-4 h-4 mb-0.5" />
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
                                                    <div className="p-2.5 rounded bg-secondary-container/30 border border-secondary/30 text-xs text-on-surface dark:text-dark-on-surface">
                                                        <span className="font-semibold text-secondary dark:text-emerald-400">Resolution Note: </span>
                                                        <span>{item.resolution_notes}</span>
                                                    </div>
                                                )}

                                                {/* Footer Timestamp */}
                                                <div className="flex items-center justify-between text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant pt-1">
                                                    <span>Filed on {new Date(item.created_at).toLocaleString()}</span>
                                                    <span className="font-mono text-[10px]">#{item.complaint_id}</span>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Modal Mini-Pagination */}
                                        {totalListPages > 1 && (
                                            <div className="flex items-center justify-between pt-2 border-t border-outline-variant dark:border-dark-outline-variant text-xs text-on-surface-variant dark:text-dark-on-surface-variant">
                                                <span>Page {validListPage} of {totalListPages}</span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={validListPage === 1}
                                                        onClick={() => setListPage(p => Math.max(1, p - 1))}
                                                        className="p-1 rounded border border-outline/30 dark:border-dark-outline-variant disabled:opacity-40 cursor-pointer"
                                                    >
                                                        <ChevronLeft className="w-3.5 h-3.5" />
                                                    </button>
                                                    <span className="px-2 font-semibold text-on-surface dark:text-dark-on-surface">
                                                        {validListPage}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        disabled={validListPage >= totalListPages}
                                                        onClick={() => setListPage(p => Math.min(totalListPages, p + 1))}
                                                        className="p-1 rounded border border-outline/30 dark:border-dark-outline-variant disabled:opacity-40 cursor-pointer"
                                                    >
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Zoomable Image Modal */}
                {previewImage && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-xs">
                        <div className="relative max-w-4xl w-full max-h-[90vh] bg-surface-container dark:bg-dark-surface-container border border-outline-variant rounded overflow-hidden flex flex-col items-center">
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
        </AnimatePresence>
    );
};
