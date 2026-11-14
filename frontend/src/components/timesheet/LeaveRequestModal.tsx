import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Calendar as CalendarIcon, CheckCircle2, AlertCircle,
    Loader2, Palmtree, Clock, Ban, CalendarDays, Plus,
    Sun, Sunrise, Sunset, ShieldAlert, ArrowRight,
    ChevronLeft, ChevronRight, ListFilter
} from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface WorkerLeaveItem {
    leave_id: number;
    worker: number;
    worker_name?: string;
    worker_employee_no?: string;
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

interface LeaveRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialDate?: string;
    onLeaveUpdated?: () => void;
}

export type SlotType = 'full_day' | 'first_half' | 'second_half';

export interface LeaveTypeConfig {
    value: 'annual' | 'sick' | 'casual' | 'unpaid';
    label: string;
    description: string;
    badge: string;
    rangeAllowed: boolean;   // true for annual
    hasSlots: boolean;       // true for sick and casual
    disabled?: boolean;      // true for unpaid
}

const LEAVE_TYPES: LeaveTypeConfig[] = [
    {
        value: 'sick',
        label: 'Sick Leave',
        description: 'Medical care, health recovery, or clinical checkups',
        badge: 'Full Day or Half Day',
        rangeAllowed: false,
        hasSlots: true,
        disabled: false,
    },
    {
        value: 'casual',
        label: 'Casual Leave',
        description: 'Personal matters, family errands',
        badge: 'Full Day or Half Day',
        rangeAllowed: false,
        hasSlots: true,
        disabled: false,
    },
    {
        value: 'annual',
        label: 'Annual Leave',
        description: 'Scheduled vacation & planned multi-day time off',
        badge: 'Date Range (Full Days)',
        rangeAllowed: true,
        hasSlots: false,
        disabled: false,
    },
    {
        value: 'unpaid',
        label: 'Unpaid Leave',
        description: 'Authorized unpaid leave (Requires HR approval)',
        badge: 'Disabled by Default',
        rangeAllowed: false,
        hasSlots: false,
        disabled: true,
    },
];

const SLOT_OPTIONS: { value: SlotType; label: string; hours: string; time: string; icon: any }[] = [
    {
        value: 'full_day',
        label: 'Full Day',
        hours: '10 Hours',
        time: 'Full working day absence',
        icon: Sun,
    },
    {
        value: 'first_half',
        label: 'First Half',
        hours: '5 Hours',
        time: '08:00 AM – 01:00 PM',
        icon: Sunrise,
    },
    {
        value: 'second_half',
        label: 'Second Half',
        hours: '5 Hours',
        time: '01:00 PM – 06:00 PM',
        icon: Sunset,
    },
];

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
    isOpen,
    onClose,
    initialDate,
    onLeaveUpdated,
}) => {
    const { token, user } = useSelector((state: RootState) => state.auth);

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
    const defaultDate = initialDate || todayStr;

    // View state: 'request' or 'history'
    const [activeTab, setActiveTab] = useState<'request' | 'history'>('request');

    // Form states
    const [leaveType, setLeaveType] = useState<'annual' | 'sick' | 'casual' | 'unpaid'>('annual');
    const [halfDaySlot, setHalfDaySlot] = useState<SlotType>('full_day');
    const [startDate, setStartDate] = useState<string>(defaultDate);
    const [endDate, setEndDate] = useState<string>(defaultDate);
    const [reason, setReason] = useState<string>('');

    // Submission states
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [successMsg, setSuccessMsg] = useState<string>('');

    // History state
    const [leaves, setLeaves] = useState<WorkerLeaveItem[]>([]);
    const [loadingLeaves, setLoadingLeaves] = useState<boolean>(false);
    const [cancellingId, setCancellingId] = useState<number | null>(null);

    // Calendar Navigation & Interactive Details State for Leave History
    const [calYear, setCalYear] = useState<number>(() => {
        if (initialDate) {
            const d = new Date(initialDate);
            if (!isNaN(d.getTime())) return d.getFullYear();
        }
        return new Date().getFullYear();
    });

    const [calMonth, setCalMonth] = useState<number>(() => {
        if (initialDate) {
            const d = new Date(initialDate);
            if (!isNaN(d.getTime())) return d.getMonth();
        }
        return new Date().getMonth();
    });

    const [selectedDate, setSelectedDate] = useState<string>(() => initialDate || todayStr);
    const [historyViewMode, setHistoryViewMode] = useState<'calendar' | 'list'>('calendar');

    // Dimension lock ref for submit button
    const submitBtnRef = useRef<HTMLButtonElement>(null);
    const [btnSize, setBtnSize] = useState<{ width?: number; height?: number }>({});

    // Reset dates when initialDate changes or modal opens
    useEffect(() => {
        if (isOpen) {
            const init = initialDate || todayStr;
            setStartDate(init);
            setEndDate(init);
            setSelectedDate(init);
            if (initialDate) {
                const d = new Date(initialDate);
                if (!isNaN(d.getTime())) {
                    setCalYear(d.getFullYear());
                    setCalMonth(d.getMonth());
                }
            }
            setErrorMsg('');
            setSuccessMsg('');
            fetchLeaves();
        }
    }, [isOpen, initialDate, todayStr]);

    const handlePrevMonth = () => {
        setCalMonth(prev => {
            if (prev === 0) {
                setCalYear(y => y - 1);
                return 11;
            }
            return prev - 1;
        });
    };

    const handleNextMonth = () => {
        setCalMonth(prev => {
            if (prev === 11) {
                setCalYear(y => y + 1);
                return 0;
            }
            return prev + 1;
        });
    };

    const handleGoToday = () => {
        const now = new Date();
        setCalYear(now.getFullYear());
        setCalMonth(now.getMonth());
        setSelectedDate(todayStr);
    };

    const handleApplyForDate = (targetDate: string) => {
        setStartDate(targetDate);
        setEndDate(targetDate);
        setActiveTab('request');
    };

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    const formatDateTimeDisplay = (dtStr: string) => {
        if (!dtStr) return '';
        try {
            const dt = new Date(dtStr);
            return dt.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return dtStr;
        }
    };

    const getLeaveStyle = (type: string) => {
        switch (type) {
            case 'annual':
                return {
                    label: 'Annual',
                    border: 'border-sky-300 dark:border-sky-800',
                    cellBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200',
                    badgeBg: 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-sky-700',
                    dot: 'bg-sky-500',
                    icon: Palmtree,
                };
            case 'sick':
                return {
                    label: 'Sick',
                    border: 'border-rose-300 dark:border-rose-800',
                    cellBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200',
                    badgeBg: 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700',
                    dot: 'bg-rose-500',
                    icon: AlertCircle,
                };
            case 'casual':
                return {
                    label: 'Casual',
                    border: 'border-amber-300 dark:border-amber-800',
                    cellBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200',
                    badgeBg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700',
                    dot: 'bg-amber-500',
                    icon: Sun,
                };
            case 'unpaid':
            default:
                return {
                    label: 'Unpaid',
                    border: 'border-slate-300 dark:border-slate-700',
                    cellBg: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
                    badgeBg: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600',
                    dot: 'bg-slate-400',
                    icon: Ban,
                };
        }
    };

    const leavesByDate = useMemo(() => {
        const map: Record<string, WorkerLeaveItem[]> = {};
        leaves.forEach(lv => {
            if (!lv.start_date) return;
            // Exclude cancelled and rejected leaves from calendar view
            if (lv.status === 'cancelled' || lv.status === 'rejected') return;

            const sParts = lv.start_date.split('-').map(Number);
            const eParts = (lv.end_date || lv.start_date).split('-').map(Number);
            const start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
            const end = new Date(eParts[0], eParts[1] - 1, eParts[2]);

            const curr = new Date(start);
            while (curr <= end) {
                const y = curr.getFullYear();
                const m = String(curr.getMonth() + 1).padStart(2, '0');
                const d = String(curr.getDate()).padStart(2, '0');
                const key = `${y}-${m}-${d}`;
                if (!map[key]) map[key] = [];
                map[key].push(lv);
                curr.setDate(curr.getDate() + 1);
            }
        });
        return map;
    }, [leaves]);

    const selectedDateLeaves = useMemo(() => {
        return leavesByDate[selectedDate] || [];
    }, [leavesByDate, selectedDate]);

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthLabel = `${monthNames[calMonth]} ${calYear}`;

    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(calYear, calMonth, 1);
    const startWeekday = firstDayOfMonth.getDay();

    const calendarGridDays = useMemo(() => {
        const days: { dayNum: number; dateStr: string; isCurrentMonth: boolean }[] = [];

        // Previous month fill
        const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
        for (let i = startWeekday - 1; i >= 0; i--) {
            const d = prevMonthDays - i;
            const prevMonth = calMonth === 0 ? 11 : calMonth - 1;
            const prevYear = calMonth === 0 ? calYear - 1 : calYear;
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({ dayNum: d, dateStr, isCurrentMonth: false });
        }

        // Current month
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({ dayNum: d, dateStr, isCurrentMonth: true });
        }

        // Next month fill
        const remaining = (7 - (days.length % 7)) % 7;
        for (let d = 1; d <= remaining; d++) {
            const nextMonth = calMonth === 11 ? 0 : calMonth + 1;
            const nextYear = calMonth === 11 ? calYear + 1 : calYear;
            const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({ dayNum: d, dateStr, isCurrentMonth: false });
        }

        return days;
    }, [calYear, calMonth, daysInMonth, startWeekday]);

    const currentConfig = useMemo(() => {
        return LEAVE_TYPES.find(t => t.value === leaveType) || LEAVE_TYPES[0];
    }, [leaveType]);

    // Handle selecting a leave type
    const handleSelectLeaveType = (typeVal: 'annual' | 'sick' | 'casual' | 'unpaid') => {
        const config = LEAVE_TYPES.find(t => t.value === typeVal);
        if (config?.disabled) return;
        setLeaveType(typeVal);
        if (!config?.hasSlots) {
            setHalfDaySlot('full_day');
        }
        if (!config?.rangeAllowed) {
            setEndDate(startDate);
        }
    };

    // Ensure endDate >= startDate for range
    const handleStartDateChange = (val: string) => {
        setStartDate(val);
        if (currentConfig.rangeAllowed && endDate < val) {
            setEndDate(val);
        } else if (!currentConfig.rangeAllowed) {
            setEndDate(val);
        }
    };

    // Calculate total days
    const calculatedDays = useMemo(() => {
        if (currentConfig.hasSlots) {
            return (halfDaySlot === 'first_half' || halfDaySlot === 'second_half') ? 0.5 : 1;
        }
        if (!startDate || !endDate) return 1;
        const d1 = new Date(startDate).getTime();
        const d2 = new Date(endDate).getTime();
        if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
        const diffMs = d2 - d1;
        return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    }, [startDate, endDate, halfDaySlot, currentConfig]);

    // Calculate total hours
    const calculatedHours = useMemo(() => {
        if (currentConfig.hasSlots) {
            return (halfDaySlot === 'first_half' || halfDaySlot === 'second_half') ? 5.0 : 10.0;
        }
        return calculatedDays * 10.0;
    }, [calculatedDays, halfDaySlot, currentConfig]);

    // Fetch leaves history
    const fetchLeaves = async () => {
        if (!token) return;
        setLoadingLeaves(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/leaves/?mine=true`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.results || []);
                setLeaves(list);
            }
        } catch (err) {
            console.error('Failed to fetch worker leaves:', err);
        } finally {
            setLoadingLeaves(false);
        }
    };

    // Find any overlapping pending or approved leave for the selected range/slot
    const overlappingLeave = useMemo(() => {
        if (!startDate) return null;
        const finalEndDate = currentConfig.rangeAllowed ? (endDate || startDate) : startDate;
        const isHalf = currentConfig.hasSlots && (halfDaySlot === 'first_half' || halfDaySlot === 'second_half');
        const slot = isHalf ? halfDaySlot : '';

        return leaves.find(lv => {
            // Only active leaves (pending or approved) block new requests
            if (lv.status !== 'pending' && lv.status !== 'approved') return false;

            const lvStart = lv.start_date;
            const lvEnd = lv.end_date || lv.start_date;

            // Date overlap condition: lvStart <= finalEndDate && lvEnd >= startDate
            const datesOverlap = lvStart <= finalEndDate && lvEnd >= startDate;
            if (!datesOverlap) return false;

            // If either is full-day (or multi-day), conflict exists
            if (!isHalf || !lv.is_half_day) return true;

            // Both are half-day: conflict if slots match or if either slot is unspecified
            if (!slot || !lv.half_day_slot || slot === lv.half_day_slot) {
                return true;
            }

            return false;
        });
    }, [leaves, startDate, endDate, halfDaySlot, currentConfig]);

    // Handle submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (currentConfig.disabled) {
            setErrorMsg('Unpaid Leave is disabled by default. Please contact HR.');
            return;
        }

        if (!startDate) {
            setErrorMsg('Please select a leave date.');
            return;
        }

        if (currentConfig.rangeAllowed) {
            if (!endDate) {
                setErrorMsg('Please select an end date.');
                return;
            }
            if (endDate < startDate) {
                setErrorMsg('End date cannot be earlier than start date.');
                return;
            }
        }

        if (overlappingLeave) {
            const slotTxt = overlappingLeave.is_half_day ? ` (${overlappingLeave.half_day_slot_display || 'Half Day'})` : '';
            const rangeTxt = overlappingLeave.start_date === overlappingLeave.end_date
                ? overlappingLeave.start_date
                : `${overlappingLeave.start_date} to ${overlappingLeave.end_date}`;
            setErrorMsg(
                `You already have an existing ${overlappingLeave.leave_type_display} request${slotTxt} for this period (${rangeTxt}) with status '${overlappingLeave.status_display}'. You cannot apply for another leave for the same period.`
            );
            return;
        }

        if (submitBtnRef.current) {
            const rect = submitBtnRef.current.getBoundingClientRect();
            setBtnSize({ width: rect.width, height: rect.height });
        }

        setSubmitting(true);
        try {
            const isRange = currentConfig.rangeAllowed;
            const finalEndDate = isRange ? endDate : startDate;
            const isHalf = currentConfig.hasSlots && (halfDaySlot === 'first_half' || halfDaySlot === 'second_half');
            const slotVal = (currentConfig.hasSlots && isHalf) ? halfDaySlot : '';
            const hoursVal = calculatedHours;

            const postBody = {
                leave_type: leaveType,
                start_date: startDate,
                end_date: finalEndDate,
                is_half_day: isHalf,
                half_day_slot: slotVal,
                hours: hoursVal,
                reason: reason.trim(),
            };

            const res = await fetch(`${API_URL}/maintenance/leaves/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(postBody),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const errStr = typeof errData === 'object'
                    ? Object.values(errData).flat().join(' ')
                    : 'Failed to submit leave request.';
                throw new Error(errStr || 'Failed to submit leave request.');
            }

            setSuccessMsg('Leave request submitted successfully!');
            setReason('');
            fetchLeaves();
            if (onLeaveUpdated) onLeaveUpdated();

            setTimeout(() => {
                setSuccessMsg('');
                setActiveTab('history');
            }, 1000);
        } catch (err: any) {
            setErrorMsg(err.message || 'Error occurred while saving leave request.');
        } finally {
            setSubmitting(false);
        }
    };

    // Handle cancel leave
    const handleCancelLeave = async (leaveId: number) => {
        if (!confirm('Are you sure you want to cancel this leave request?')) return;
        setCancellingId(leaveId);
        try {
            const res = await fetch(`${API_URL}/maintenance/leaves/${leaveId}/cancel/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                fetchLeaves();
                if (onLeaveUpdated) onLeaveUpdated();
            }
        } catch (err) {
            console.error('Failed to cancel leave:', err);
        } finally {
            setCancellingId(null);
        }
    };

    const getStatusChip = (status: WorkerLeaveItem['status']) => {
        switch (status) {
            case 'approved':
                return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
            case 'pending':
                return 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
            case 'rejected':
                return 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 border border-red-300 dark:border-red-800';
            case 'cancelled':
            default:
                return 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    className="relative bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant w-full max-w-2xl max-h-[92vh] flex flex-col rounded shadow-2xl overflow-hidden z-10 text-on-surface dark:text-dark-on-surface"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                                <Palmtree className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold tracking-tight text-on-surface dark:text-dark-on-surface">
                                    Leave Management Portal
                                </h3>
                                <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant">
                                    Apply, track, and manage your annual, sick, and casual leaves
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
                    <div className="flex items-center gap-3 px-5 pt-3 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container shrink-0">
                        <button
                            type="button"
                            onClick={() => setActiveTab('request')}
                            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'request'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-on-surface-variant hover:text-on-surface'
                                }`}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Apply for Leave</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('history')}
                            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'history'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-on-surface-variant hover:text-on-surface'
                                }`}
                        >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span>My Leaves &amp; History</span>
                            {leaves.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.2 bg-primary text-on-primary rounded-full text-[10px] font-bold">
                                    {leaves.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Modal Body */}
                    <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
                        {/* Tab 1: Apply Leave Form */}
                        {activeTab === 'request' && (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {successMsg && (
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
                                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        <span>{successMsg}</span>
                                    </div>
                                )}

                                {errorMsg && (
                                    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded flex items-center gap-2 text-red-800 dark:text-red-200 text-xs font-medium">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                                        <span>{errorMsg}</span>
                                    </div>
                                )}

                                {/* Step 1: Select Leave Type */}
                                <div>
                                    <label className="block text-xs font-bold text-on-surface dark:text-dark-on-surface mb-2">
                                        1. Select Leave Type <span className="text-error">*</span>
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {LEAVE_TYPES.map(t => {
                                            const isSelected = leaveType === t.value;
                                            const isDisabled = Boolean(t.disabled);

                                            return (
                                                <button
                                                    key={t.value}
                                                    type="button"
                                                    disabled={isDisabled}
                                                    onClick={() => handleSelectLeaveType(t.value)}
                                                    className={`p-3 rounded border text-left transition-all ${isDisabled
                                                        ? 'opacity-40 cursor-not-allowed border-dashed border-outline-variant bg-surface-container-low/40 text-on-surface-variant'
                                                        : isSelected
                                                            ? 'border-primary bg-primary/5 dark:bg-primary/10 text-primary ring-2 ring-primary/30 shadow-xs cursor-pointer font-semibold'
                                                            : 'border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low text-on-surface hover:bg-surface-container-high cursor-pointer'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold">{t.label}</span>
                                                        {isSelected ? (
                                                            <div className="w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                            </div>
                                                        ) : isDisabled ? (
                                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-outline-variant/40 text-on-surface-variant shrink-0">
                                                                Disabled
                                                            </span>
                                                        ) : (
                                                            <span className="text-[9px] font-semibold text-on-surface-variant/70 shrink-0">
                                                                {t.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] font-normal text-on-surface-variant dark:text-dark-on-surface-variant mt-1 leading-tight">
                                                        {t.description}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Step 2: Date Selection & Duration */}
                                <div className="p-3.5 rounded bg-surface-container-low dark:bg-dark-surface-container-low border border-outline-variant dark:border-dark-outline-variant space-y-3.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                            2. Leave Date &amp; Duration <span className="text-error">*</span>
                                        </label>
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                                            {currentConfig.label}
                                        </span>
                                    </div>

                                    {/* Annual Leave: From & To Range Only */}
                                    {currentConfig.rangeAllowed ? (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                                                        From Date <span className="text-error">*</span>
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            type="date"
                                                            value={startDate}
                                                            onChange={e => handleStartDateChange(e.target.value)}
                                                            className="w-full bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded p-2.5 focus:outline-none focus:border-primary font-medium"
                                                            required
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                                                        To Date <span className="text-error">*</span>
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            type="date"
                                                            value={endDate}
                                                            min={startDate}
                                                            onChange={e => setEndDate(e.target.value)}
                                                            className="w-full bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded p-2.5 focus:outline-none focus:border-primary font-medium"
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-on-surface-variant italic">
                                                * Annual leave is calculated in full working days (10 hours per day).
                                            </p>
                                        </div>
                                    ) : (
                                        /* Sick & Casual Leave: Single Date + Duration Options (Full Day, 1st Half, 2nd Half) */
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                                                    Select Leave Date <span className="text-error">*</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={e => {
                                                        setStartDate(e.target.value);
                                                        setEndDate(e.target.value);
                                                    }}
                                                    className="w-full bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded p-2.5 focus:outline-none focus:border-primary font-medium"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5">
                                                    Choose Duration Option <span className="text-error">*</span>
                                                </label>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    {SLOT_OPTIONS.map(opt => {
                                                        const isSlotSelected = halfDaySlot === opt.value;
                                                        const IconComp = opt.icon;
                                                        return (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                onClick={() => setHalfDaySlot(opt.value)}
                                                                className={`p-2.5 rounded border text-left transition-all cursor-pointer ${isSlotSelected
                                                                    ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500 font-semibold shadow-xs'
                                                                    : 'border-outline-variant bg-surface dark:bg-dark-surface text-on-surface hover:bg-surface-container-high'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <IconComp className={`w-3.5 h-3.5 ${isSlotSelected ? 'text-amber-600 dark:text-amber-400' : 'text-on-surface-variant'}`} />
                                                                        <span className="text-xs font-bold">{opt.label}</span>
                                                                    </div>
                                                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant">
                                                                        {opt.hours}
                                                                    </span>
                                                                </div>
                                                                <p className="text-[10px] font-normal text-on-surface-variant mt-1 leading-tight">
                                                                    {opt.time}
                                                                </p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Step 3: Reason & Notes */}
                                <div>
                                    <label className="block text-xs font-bold text-on-surface dark:text-dark-on-surface mb-1">
                                        3. Reason / Notes
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={reason}
                                        onChange={e => setReason(e.target.value)}
                                        placeholder="Optional details, clinic note, or handover information..."
                                        className="w-full bg-surface dark:bg-dark-surface border border-outline/40 dark:border-dark-outline-variant text-on-surface dark:text-dark-on-surface text-xs rounded p-2.5 focus:outline-none focus:border-primary resize-y"
                                    />
                                </div>

                                {/* Summary Box */}
                                <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Palmtree className="w-4 h-4 text-amber-600 shrink-0" />
                                        <div className="min-w-0">
                                            <span className="font-bold text-amber-950 dark:text-amber-200">
                                                {currentConfig.label}
                                            </span>
                                            <span className="text-[11px] text-amber-800 dark:text-amber-300 ml-1.5">
                                                {currentConfig.rangeAllowed
                                                    ? `${calculatedDays} Days (${calculatedHours} hrs)`
                                                    : halfDaySlot === 'first_half'
                                                        ? '1st Half: Morning to Afternoon (5 hrs)'
                                                        : halfDaySlot === 'second_half'
                                                            ? '2nd Half: Afternoon to Evening (5 hrs)'
                                                            : 'Full Day (10 hrs)'}
                                            </span>
                                            <div className="text-[10px] text-amber-900/80 dark:text-amber-300/80 font-mono mt-0.5">
                                                {currentConfig.rangeAllowed
                                                    ? `${startDate} → ${endDate}`
                                                    : startDate}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="text-base font-extrabold text-amber-900 dark:text-amber-200">
                                            {calculatedHours}h
                                        </span>
                                        <span className="block text-[9px] text-amber-800/80 dark:text-amber-300/80 font-medium">
                                            Deduction
                                        </span>
                                    </div>
                                </div>

                                {/* Overlap Warning Banner */}
                                {overlappingLeave && (
                                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded flex items-start gap-2.5 text-red-900 dark:text-red-200 text-xs animate-in fade-in duration-200">
                                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-red-950 dark:text-red-100 flex items-center justify-between">
                                                <span>Overlapping Leave Period Detected</span>
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-200/80 dark:bg-red-900/60 text-red-900 dark:text-red-200">
                                                    {overlappingLeave.status_display}
                                                </span>
                                            </div>
                                            <p className="mt-1 leading-snug">
                                                You already have an active{' '}
                                                <strong>
                                                    {overlappingLeave.leave_type_display}
                                                    {overlappingLeave.is_half_day ? ` (${overlappingLeave.half_day_slot_display || 'Half Day'})` : ' (Full Day)'}
                                                </strong>{' '}
                                                for <span className="font-mono font-semibold">{overlappingLeave.start_date === overlappingLeave.end_date ? overlappingLeave.start_date : `${overlappingLeave.start_date} to ${overlappingLeave.end_date}`}</span>.
                                            </p>
                                            <p className="text-[11px] text-red-800/80 dark:text-red-300/80 mt-1">
                                                You cannot apply for another leave for the same period. Please select different dates or manage your existing request in the History tab.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-outline-variant dark:border-dark-outline-variant">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={submitting}
                                        className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-4 py-2 rounded transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        ref={submitBtnRef}
                                        type="submit"
                                        disabled={submitting || Boolean(overlappingLeave)}
                                        title={overlappingLeave ? "Cannot submit: Overlapping leave already exists for this period" : undefined}
                                        style={{
                                            width: btnSize.width ? `${btnSize.width}px` : undefined,
                                            height: btnSize.height ? `${btnSize.height}px` : undefined,
                                        }}
                                        className={`text-xs font-semibold px-4 py-2 rounded flex items-center justify-center gap-1.5 transition-colors shadow-xs ${overlappingLeave
                                            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70'
                                            : 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer disabled:opacity-50'
                                            }`}
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Submitting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Palmtree className="w-3.5 h-3.5" />
                                                <span>{overlappingLeave ? 'Period Already Booked' : 'Submit Leave Request'}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Tab 2: My Leaves & Status History */}
                        {activeTab === 'history' && (
                            <div className="space-y-4">
                                {loadingLeaves ? (
                                    <div className="p-8 text-center text-on-surface-variant">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                                        <p>Loading leave records...</p>
                                    </div>
                                ) : leaves.length === 0 ? (
                                    <div className="p-8 text-center border border-dashed border-outline-variant dark:border-dark-outline-variant rounded bg-surface-container-low/40">
                                        <Palmtree className="w-8 h-8 mx-auto text-on-surface-variant mb-2 opacity-50" />
                                        <p className="font-semibold text-on-surface dark:text-dark-on-surface">No leave records registered</p>
                                        <p className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant mt-0.5">
                                            You haven't requested any leaves or scheduled days off yet.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('request')}
                                            className="mt-3 px-3.5 py-1.5 text-xs font-medium bg-primary text-on-primary hover:bg-primary-container rounded inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Apply for First Leave</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3.5">
                                        {/* Top Bar: Stats Summary & View Switcher */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-outline-variant/60">
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-on-surface-variant font-medium">
                                                    Total: <strong className="text-on-surface dark:text-dark-on-surface">{leaves.length}</strong>
                                                </span>
                                                <span className="text-outline-variant">•</span>
                                                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                                    Approved: <strong>{leaves.filter(l => l.status === 'approved').length}</strong>
                                                </span>
                                                <span className="text-outline-variant">•</span>
                                                <span className="text-amber-700 dark:text-amber-400 font-medium">
                                                    Pending: <strong>{leaves.filter(l => l.status === 'pending').length}</strong>
                                                </span>
                                            </div>

                                            {/* View Mode Toggle */}
                                            <div className="inline-flex rounded border border-outline-variant dark:border-dark-outline-variant p-0.5 bg-surface-container-low dark:bg-dark-surface-container-low">
                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryViewMode('calendar')}
                                                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${historyViewMode === 'calendar'
                                                        ? 'bg-primary text-on-primary shadow-2xs'
                                                        : 'text-on-surface-variant hover:text-on-surface'
                                                        }`}
                                                >
                                                    <CalendarIcon className="w-3.5 h-3.5" />
                                                    <span>Calendar View</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryViewMode('list')}
                                                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${historyViewMode === 'list'
                                                        ? 'bg-primary text-on-primary shadow-2xs'
                                                        : 'text-on-surface-variant hover:text-on-surface'
                                                        }`}
                                                >
                                                    <ListFilter className="w-3.5 h-3.5" />
                                                    <span>List View</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* View 1: Calendar View with interactive date click */}
                                        {historyViewMode === 'calendar' && (
                                            <div className="space-y-3.5">
                                                {/* Calendar Header: Month Navigation & Legend */}
                                                <div className="p-3 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low space-y-2.5">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={handlePrevMonth}
                                                                className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                                                                title="Previous Month"
                                                            >
                                                                <ChevronLeft className="w-4 h-4" />
                                                            </button>

                                                            <h4 className="text-xs font-bold text-on-surface dark:text-dark-on-surface min-w-[130px] text-center">
                                                                {currentMonthLabel}
                                                            </h4>

                                                            <button
                                                                type="button"
                                                                onClick={handleNextMonth}
                                                                className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                                                                title="Next Month"
                                                            >
                                                                <ChevronRight className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={handleGoToday}
                                                                className="px-2 py-0.5 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface hover:bg-surface-container-high text-on-surface text-[10px] font-bold transition-colors cursor-pointer"
                                                            >
                                                                Today
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Legend */}
                                                    <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-outline-variant/50 text-[10px] text-on-surface-variant">
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-sky-500" />
                                                            <span>Annual</span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                                                            <span>Sick</span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                            <span>Casual</span>
                                                        </span>
                                                        <span className="text-outline-variant">•</span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                            <span>Approved</span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                            <span>Pending</span>
                                                        </span>
                                                        <span className="flex items-center gap-1 font-semibold text-primary">
                                                            <span>½ = Half-Day</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Calendar Grid Container */}
                                                <div className="p-2 sm:p-3 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface">
                                                    {/* Weekday Row */}
                                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">
                                                        <div>Sun</div>
                                                        <div>Mon</div>
                                                        <div>Tue</div>
                                                        <div>Wed</div>
                                                        <div>Thu</div>
                                                        <div>Fri</div>
                                                        <div>Sat</div>
                                                    </div>

                                                    {/* Days 7-column Grid */}
                                                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                                                        {calendarGridDays.map(({ dayNum, dateStr, isCurrentMonth }) => {
                                                            const dayLeaves = leavesByDate[dateStr] || [];
                                                            const hasLeaves = dayLeaves.length > 0;
                                                            const isToday = dateStr === todayStr;
                                                            const isSelected = dateStr === selectedDate;
                                                            const primaryLeave = hasLeaves ? dayLeaves[0] : null;
                                                            const style = primaryLeave ? getLeaveStyle(primaryLeave.leave_type) : null;

                                                            return (
                                                                <button
                                                                    key={dateStr}
                                                                    type="button"
                                                                    onClick={() => setSelectedDate(dateStr)}
                                                                    className={`min-h-[58px] sm:min-h-[64px] p-1.5 rounded border text-left flex flex-col justify-between transition-all cursor-pointer relative ${!isCurrentMonth
                                                                        ? 'opacity-30 bg-surface-container-low/20 border-outline-variant/30 text-on-surface-variant'
                                                                        : isSelected
                                                                            ? 'ring-2 ring-primary border-primary bg-primary/10 dark:bg-primary/20 shadow-xs z-1'
                                                                            : hasLeaves && style
                                                                                ? `${style.cellBg} ${style.border} hover:opacity-90`
                                                                                : 'bg-surface dark:bg-dark-surface border-outline-variant/60 dark:border-dark-outline-variant/60 hover:bg-surface-container-high'
                                                                        }`}
                                                                >
                                                                    {/* Day Top: Number + Status Dot */}
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <span
                                                                            className={`text-[11px] font-bold ${isToday
                                                                                ? 'w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center -ml-0.5 -mt-0.5 shadow-2xs'
                                                                                : isSelected
                                                                                    ? 'text-primary'
                                                                                    : 'text-on-surface dark:text-dark-on-surface'
                                                                                }`}
                                                                        >
                                                                            {dayNum}
                                                                        </span>

                                                                        {hasLeaves && (
                                                                            <div className="flex items-center gap-1">
                                                                                {dayLeaves.some(l => l.status === 'approved') ? (
                                                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Approved" />
                                                                                ) : dayLeaves.some(l => l.status === 'pending') ? (
                                                                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" title="Pending Approval" />
                                                                                ) : (
                                                                                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" title={dayLeaves[0].status} />
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Day Bottom: Leave Markers */}
                                                                    <div className="w-full space-y-0.5 mt-1">
                                                                        {hasLeaves &&
                                                                            dayLeaves.map(lv => {
                                                                                const lvStyle = getLeaveStyle(lv.leave_type);
                                                                                const isHalf = lv.is_half_day;
                                                                                return (
                                                                                    <div
                                                                                        key={lv.leave_id}
                                                                                        className={`px-1 py-0.5 rounded text-[9px] font-bold truncate flex items-center gap-0.5 border ${lvStyle.badgeBg}`}
                                                                                        title={`${lv.leave_type_display} - ${lv.status_display || lv.status}`}
                                                                                    >
                                                                                        {isHalf ? (
                                                                                            <>
                                                                                                <span className="text-[8px] font-black uppercase text-primary">
                                                                                                    ½{lv.half_day_slot === 'first_half' ? 'AM' : 'PM'}
                                                                                                </span>
                                                                                                <span className="truncate">{lvStyle.label}</span>
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <Palmtree className="w-2.5 h-2.5 shrink-0" />
                                                                                                <span className="truncate">{lvStyle.label}</span>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Selected Date Details Panel (Click to Show Details) */}
                                                <div className="p-3.5 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low space-y-3">
                                                    <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <CalendarIcon className="w-4 h-4 text-primary" />
                                                            <h4 className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                                                {formatDateDisplay(selectedDate)}
                                                            </h4>
                                                            {selectedDateLeaves.length > 0 ? (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                                                    {selectedDateLeaves.length} {selectedDateLeaves.length === 1 ? 'Leave Booked' : 'Leaves Booked'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                                                                    No Leave Scheduled
                                                                </span>
                                                            )}
                                                        </div>

                                                        {selectedDateLeaves.length === 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApplyForDate(selectedDate)}
                                                                className="px-2.5 py-1 text-xs font-semibold bg-primary text-on-primary hover:bg-primary-container rounded flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                <span>Apply for Leave</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {selectedDateLeaves.length > 0 ? (
                                                        <div className="space-y-3">
                                                            {selectedDateLeaves.map(lv => {
                                                                const lvStyle = getLeaveStyle(lv.leave_type);
                                                                const IconComp = lvStyle.icon;
                                                                const isCancelling = cancellingId === lv.leave_id;
                                                                const isFutureOrToday = lv.end_date >= todayStr;
                                                                const canCancel = isFutureOrToday && lv.status !== 'cancelled' && lv.status !== 'rejected';

                                                                return (
                                                                    <div
                                                                        key={lv.leave_id}
                                                                        className="p-3 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface space-y-2.5 shadow-2xs"
                                                                    >
                                                                        {/* Top: Leave type, status chip, cancel action */}
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className={`w-7 h-7 rounded flex items-center justify-center ${lvStyle.badgeBg}`}>
                                                                                    <IconComp className="w-4 h-4" />
                                                                                </div>
                                                                                <div>
                                                                                    <span className="text-xs font-bold text-on-surface dark:text-dark-on-surface">
                                                                                        {lv.leave_type_display}
                                                                                    </span>
                                                                                    <div className="text-[10px] text-on-surface-variant font-medium">
                                                                                        {lv.is_half_day ? (
                                                                                            lv.half_day_slot === 'first_half'
                                                                                                ? 'First Half (08:00 AM – 01:00 PM)'
                                                                                                : 'Second Half (01:00 PM – 06:00 PM)'
                                                                                        ) : (
                                                                                            'Full Working Day (10 Hours)'
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${getStatusChip(lv.status)}`}>
                                                                                    {lv.status_display || lv.status}
                                                                                </span>

                                                                                {canCancel && (
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={isCancelling}
                                                                                        onClick={() => handleCancelLeave(lv.leave_id)}
                                                                                        title="Cancel this leave request"
                                                                                        className="px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                                                                    >
                                                                                        {isCancelling ? (
                                                                                            <>
                                                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                                                <span>Cancelling...</span>
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <Ban className="w-3 h-3" />
                                                                                                <span>Cancel</span>
                                                                                            </>
                                                                                        )}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Details Grid */}
                                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded bg-surface-container-low dark:bg-dark-surface-container-low text-[11px]">
                                                                            <div>
                                                                                <span className="text-on-surface-variant text-[10px] block">Period Range</span>
                                                                                <span className="font-mono font-bold text-on-surface dark:text-dark-on-surface">
                                                                                    {lv.start_date === lv.end_date ? lv.start_date : `${lv.start_date} → ${lv.end_date}`}
                                                                                </span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-on-surface-variant text-[10px] block">Duration</span>
                                                                                <span className="font-bold text-on-surface dark:text-dark-on-surface">
                                                                                    {lv.is_half_day ? '0.5 Day' : `${lv.duration_days} Day(s)`}
                                                                                </span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-on-surface-variant text-[10px] block">Logged Hours</span>
                                                                                <span className="font-bold text-amber-700 dark:text-amber-400">
                                                                                    {lv.hours} hrs deduction
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {/* Reason / Notes */}
                                                                        {lv.reason && (
                                                                            <div className="text-[11px] text-on-surface-variant">
                                                                                <span className="font-semibold text-on-surface dark:text-dark-on-surface">Reason: </span>
                                                                                <span className="italic">"{lv.reason}"</span>
                                                                            </div>
                                                                        )}

                                                                        {/* Admin approval / notes */}
                                                                        {(lv.approved_by_name || lv.admin_notes) && (
                                                                            <div className="p-2 rounded bg-surface-container-high/60 text-[11px] space-y-0.5 border border-outline-variant/40">
                                                                                {lv.approved_by_name && (
                                                                                    <div className="text-on-surface-variant">
                                                                                        <span className="font-semibold text-on-surface">Reviewed by: </span>
                                                                                        <span>{lv.approved_by_name}</span>
                                                                                    </div>
                                                                                )}
                                                                                {lv.admin_notes && (
                                                                                    <div className="text-on-surface-variant">
                                                                                        <span className="font-semibold text-on-surface">Supervisor Note: </span>
                                                                                        <span className="italic">"{lv.admin_notes}"</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {/* Applied timestamp */}
                                                                        {lv.created_at && (
                                                                            <div className="text-[10px] text-on-surface-variant/70 text-right">
                                                                                Applied on {formatDateTimeDisplay(lv.created_at)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-4 text-on-surface-variant">
                                                            <Palmtree className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-on-surface-variant" />
                                                            <p className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                                                                No leave marked on this date
                                                            </p>
                                                            <p className="text-[11px] text-on-surface-variant mt-0.5">
                                                                Click any highlighted date above to inspect details, or apply for leave on {selectedDate}.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* View 2: List View */}
                                        {historyViewMode === 'list' && (
                                            <div className="space-y-2.5">
                                                {leaves.map(item => {
                                                    const isCancelling = cancellingId === item.leave_id;
                                                    const isFutureOrToday = item.end_date >= todayStr;
                                                    const canCancel = isFutureOrToday && item.status !== 'cancelled' && item.status !== 'rejected';
                                                    const lvStyle = getLeaveStyle(item.leave_type);
                                                    const IconComp = lvStyle.icon;

                                                    return (
                                                        <div
                                                            key={item.leave_id}
                                                            className="p-3.5 rounded border border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface space-y-2.5 shadow-2xs"
                                                        >
                                                            <div className="flex items-center justify-between gap-2 border-b border-outline-variant/60 pb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-7 h-7 rounded flex items-center justify-center ${lvStyle.badgeBg}`}>
                                                                        <IconComp className="w-3.5 h-3.5" />
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-bold text-xs text-on-surface dark:text-dark-on-surface">
                                                                            {item.leave_type_display}
                                                                        </span>
                                                                        <span className="text-[10px] ml-2 px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                                                                            {item.is_half_day
                                                                                ? (item.half_day_slot === 'first_half'
                                                                                    ? '1st Half: Morning (5h)'
                                                                                    : '2nd Half: Afternoon (5h)')
                                                                                : `${item.duration_days} ${item.duration_days === 1 ? 'day' : 'days'} (${item.hours}h)`}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${getStatusChip(item.status)}`}>
                                                                        {item.status_display || item.status}
                                                                    </span>

                                                                    {canCancel && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isCancelling}
                                                                            onClick={() => handleCancelLeave(item.leave_id)}
                                                                            title="Cancel this leave request"
                                                                            className="px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                                                        >
                                                                            {isCancelling ? 'Cancelling...' : 'Cancel'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-on-surface-variant">
                                                                <span className="flex items-center gap-1.5 font-mono">
                                                                    <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                                                                    <span>
                                                                        {item.start_date === item.end_date
                                                                            ? item.start_date
                                                                            : `${item.start_date} → ${item.end_date}`}
                                                                    </span>
                                                                </span>

                                                                {item.reason && (
                                                                    <span className="truncate max-w-[260px] italic">
                                                                        "{item.reason}"
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
