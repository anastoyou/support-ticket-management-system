import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, AlertTriangle, CheckCircle2,
    FileText, Video, Trash2, Loader2, Upload,
    User, Building2, Search, Check, AlertCircle,
    ChevronDown, Phone, PhoneCall
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

    // Zoom image state
    const [previewImage, setPreviewImage] = useState<string | null>(null);

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
                } else {
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

        // 2. Extract candidate workers from ticket allocations (for manager complaint against worker)
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
        // - Current assigned Store Manager of this store
        // - Ticket creator ONLY if they are a Store Manager (do not list if created by other roles)
        // - Store Managers who have access to the current store
        const fetchStoreManagers = async () => {
            const managersMap = new Map<number, UserStub>();

            // a) Current assigned Store Manager of this store
            if (ticket.store?.manager && isUserStoreManager(ticket.store.manager)) {
                managersMap.set(ticket.store.manager.user_id, ticket.store.manager);
            }

            // b) Ticket creator ONLY if they are a Store Manager
            if (ticket.created_by && isUserStoreManager(ticket.created_by)) {
                managersMap.set(ticket.created_by.user_id, ticket.created_by);
            }

            // c) Store managers who have access to the current store
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

            // Media files
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

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/70 backdrop-blur-xs"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    className="relative bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden z-10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-bold text-on-surface dark:text-dark-on-surface flex items-center gap-2">
                                    <span>Ticket Complaint</span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-surface-container-high text-outline font-semibold">
                                        {ticket.work_order_no}
                                    </span>
                                </h3>
                                <p className="text-[11px] text-outline truncate">{ticket.title}</p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-1.5 text-outline hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 px-4 pt-2.5 border-b border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface shrink-0">
                        <Can permission="maintenance.can_create_complaint">
                            <button
                                type="button"
                                onClick={() => setActiveTab('create')}
                                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'create'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-outline hover:text-on-surface'
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
                                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'list'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-outline hover:text-on-surface'
                                }`}
                            >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{canViewAllComplaints ? 'Existing Complaints' : 'My Filed Complaints'}</span>
                                {complaintsList.length > 0 && (
                                    <span className="px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[10px] font-extrabold">
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
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                                        <span>Complaint registered successfully!</span>
                                    </div>
                                )}

                                {errorMsg && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-semibold">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        <span>{errorMsg}</span>
                                    </div>
                                )}

                                {/* Complaint Type Card: ONE USER ONLY SEES ONE OPTION */}
                                <div>
                                    <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1.5">
                                        Complaint Type
                                    </label>
                                    {complaintType === 'manager_against_worker' ? (
                                        <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-on-surface dark:text-dark-on-surface">
                                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                                                <span>Manager against Worker</span>
                                            </p>
                                            <p className="text-[11px] text-outline mt-0.5">
                                                Complaint filed regarding worker performance
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-on-surface dark:text-dark-on-surface">
                                            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                                <span>Worker against Manager</span>
                                            </p>
                                            <p className="text-[11px] text-outline mt-0.5">
                                                Complaint filed regarding store manager/admin
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Against Whom Selection */}
                                <div>
                                    <label className="block text-xs font-bold text-on-surface dark:text-dark-on-surface mb-1">
                                        {complaintType === 'manager_against_worker'
                                            ? 'Worker (Against Whom):'
                                            : 'Store Manager (Against Whom):'}
                                        <span className="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <select
                                        value={againstUserId}
                                        onChange={e => setAgainstUserId(Number(e.target.value) || '')}
                                        className="w-full text-xs p-2.5 rounded-lg bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary font-semibold"
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
                                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                            No assigned store manager with access found for this location.
                                        </p>
                                    )}
                                </div>

                                {/* Issue Reason: DROPDOWN with role-tailored options and 'Other' */}
                                <div>
                                    <label className="block text-xs font-bold text-on-surface dark:text-dark-on-surface mb-1">
                                        Issue Reason <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={selectedIssueValue}
                                        onChange={e => {
                                            setSelectedIssueValue(e.target.value);
                                            if (e.target.value !== 'other') {
                                                setCustomIssue('');
                                            }
                                        }}
                                        className="w-full text-xs p-2.5 rounded-lg bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary font-semibold"
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
                                                className="w-full text-xs p-2.5 rounded-lg bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary"
                                                required
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Detailed Description */}
                                <div>
                                    <label className="block text-xs font-bold text-on-surface dark:text-dark-on-surface mb-1">
                                        Detailed Description <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Describe what occurred, impact, and any specific incidents..."
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        className="w-full text-xs p-3 rounded-lg bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary resize-y"
                                        required
                                    />
                                </div>

                                {/* Media Attachments */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                            Relevant Media (Images, Videos, Voice, Documents)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-2 py-1 text-xs font-bold text-primary bg-primary/10 rounded hover:bg-primary/20 transition-all flex items-center gap-1 cursor-pointer"
                                        >
                                            <Upload className="w-3 h-3" />
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
                                                    className="relative group border border-outline-variant dark:border-dark-outline-variant rounded-lg overflow-hidden bg-surface-container aspect-video flex items-center justify-center"
                                                >
                                                    {item.isImg ? (
                                                        <img src={item.url} alt="upload" className="w-full h-full object-cover" />
                                                    ) : item.isVid ? (
                                                        <div className="flex flex-col items-center justify-center p-2 text-outline">
                                                            <Video className="w-6 h-6 text-primary mb-1" />
                                                            <span className="text-[10px] truncate max-w-[80px]">{item.file.name}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center p-2 text-outline">
                                                            <FileText className="w-6 h-6 text-primary mb-1" />
                                                            <span className="text-[10px] truncate max-w-[80px]">{item.file.name}</span>
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFile(idx)}
                                                        className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
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
                                            className="border-2 border-dashed border-outline-variant dark:border-dark-outline-variant rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                                        >
                                            <Upload className="w-6 h-6 mx-auto text-outline mb-1" />
                                            <p className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                                Click to upload photos, videos, or documents
                                            </p>
                                            <p className="text-[11px] text-outline">Attach evidence supporting your complaint</p>
                                        </div>
                                    )}
                                </div>

                                {/* Form Action Buttons */}
                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant dark:border-dark-outline-variant">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={submitting}
                                        className="px-4 py-2 text-xs font-bold text-outline hover:text-on-surface rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <Can permission="maintenance.can_create_complaint">
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="px-5 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg hover:bg-primary-hover active:scale-95 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                                        >
                                            {submitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span>Registering...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <AlertTriangle className="w-4 h-4" />
                                                    <span>Submit Complaint</span>
                                                </>
                                            )}
                                        </button>
                                    </Can>
                                </div>
                            </form>
                        ) : (
                            <div className="p-8 text-center border border-dashed border-outline-variant rounded-xl bg-surface-container/20">
                                <AlertCircle className="w-10 h-10 text-outline mx-auto mb-2" />
                                <p className="text-xs font-bold text-on-surface">Permission Required</p>
                                <p className="text-[11px] text-outline mt-1">You do not have permission to register complaints.</p>
                            </div>
                        ))}

                        {/* Tab 2: Existing Complaints List */}
                        {activeTab === 'list' && (
                            <div className="space-y-3">
                                {loadingComplaints ? (
                                    <div className="p-8 text-center text-outline">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                                        <p className="text-xs">Loading complaints...</p>
                                    </div>
                                ) : complaintsList.length === 0 ? (
                                    <div className="p-8 text-center border border-dashed border-outline-variant rounded-xl">
                                        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                                        <p className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                            No complaints registered for this ticket
                                        </p>
                                        <p className="text-[11px] text-outline mt-1">
                                            Work is proceeding normally without registered disputes.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('create')}
                                            className="mt-3 px-3 py-1.5 text-xs font-bold bg-primary text-on-primary rounded-lg hover:bg-primary-hover inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            <span>Register First Complaint</span>
                                        </button>
                                    </div>
                                ) : (
                                    complaintsList.map(item => (
                                        <div
                                            key={item.complaint_id}
                                            className="p-3.5 rounded-xl border border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container space-y-3"
                                        >
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <span
                                                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider mb-1 ${
                                                            item.complaint_type === 'manager_against_worker'
                                                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                                        }`}
                                                    >
                                                        {item.complaint_type === 'manager_against_worker'
                                                            ? 'Manager against Worker'
                                                            : 'Worker against Manager'}
                                                    </span>
                                                    <h4 className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                                        {item.issue_display}
                                                    </h4>
                                                </div>

                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
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
                                            </div>

                                            {/* Profiles Involved */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-surface dark:bg-dark-surface border border-outline-variant/60 text-xs">
                                                <div className="flex items-center gap-2">
                                                    <AvatarCircle user={item.complainant} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-semibold text-outline">Complainant:</p>
                                                        <p className="font-bold text-on-surface dark:text-dark-on-surface truncate">
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
                                                        <p className="text-[10px] font-semibold text-outline">Against:</p>
                                                        <p className="font-bold text-on-surface dark:text-dark-on-surface truncate">
                                                            {item.against_user?.full_name || (item.against_user as any)?.username}
                                                        </p>
                                                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                                            {item.against_user?.role?.role_name || 'Worker'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <p className="text-xs text-on-surface dark:text-dark-on-surface whitespace-pre-wrap bg-surface-container-high/40 p-2.5 rounded-lg border border-outline-variant/40 leading-relaxed">
                                                {item.description}
                                            </p>

                                            {/* Media Files */}
                                            {item.media_files && item.media_files.length > 0 && (
                                                <div>
                                                    <p className="text-[11px] font-bold text-outline mb-1.5">Attached Media:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.media_files.map(m => {
                                                            const fullUrl = getMediaUrl(m.file_url);
                                                            const isImg = isImage(m.file_name);
                                                            return (
                                                                <div
                                                                    key={m.media_id}
                                                                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-outline-variant bg-surface group cursor-pointer"
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
                                                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                                                    <span className="font-bold">Resolution Note: </span>
                                                    <span>{item.resolution_notes}</span>
                                                </div>
                                            )}

                                            {/* Footer Timestamp */}
                                            <div className="flex items-center justify-between text-[10px] text-outline pt-1">
                                                <span>Filed on {new Date(item.created_at).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Zoomable Image Modal */}
                {previewImage && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
                        <div className="relative max-w-4xl w-full max-h-[90vh] bg-black/40 rounded-xl overflow-hidden flex flex-col items-center">
                            <button
                                onClick={() => setPreviewImage(null)}
                                className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
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
        </AnimatePresence>
    );
};
