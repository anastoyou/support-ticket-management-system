import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
    X, MapPin, Edit2, Search, Lock, AlertCircle, Trash2,
    ExternalLink, Sun, Moon, Printer
} from 'lucide-react';
import { TimesheetPrintModal } from './TimesheetPrintModal';
import Can from '@/hooks/Can';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const HOUR = 60;
const DAY = 1440;
const WINDOW_HOURS = 8;
const WINDOW_MINUTES = WINDOW_HOURS * HOUR;
const EARLY_MORNING_WINDOW_START = 0 * 60; // 12:00 AM (12:00 AM – 08:00 AM: Early Morning)
const DAYTIME_WINDOW_START = 8 * 60; // 08:00 AM (08:00 AM – 04:00 PM: Daytime - Default)
const NIGHT_WINDOW_START = 16 * 60; // 04:00 PM (04:00 PM – 12:00 AM: Night)
const DAY_WINDOW_START = DAYTIME_WINDOW_START;
const STEP = 30; // Standard 30-minute interval
const PARTS_COUNT = 2; // 2 half-hour segments per slot

interface StoreItem {
    store_id: string;
    store_name: string;
    short_code?: string;
    type?: string;
}

const STORE_TYPE_SHORT_CODES: Record<string, string> = {
    HYPER_MARKET: 'HYPER',
    SUPER_MARKET: 'SUPER',
    WAREHOUSE: 'WH',
    FRESH: 'FRESH',
    COSTO: 'COSTO',
    CAMP: 'CAMP',
    KITCHEN: 'KTN',
    ROASTERY: 'ROAST',
    'FINE DINE': 'FDINE',
};

interface SessionLocation {
    id: string;
    name: string;
    short_code?: string;
}

export interface BookedSession {
    id: number;
    worklog_id: number;
    log_type: string;
    is_ticket: boolean;
    ticket_id?: number | null;
    ticket_work_order_no?: string | null;
    ticket_title?: string | null;
    dateKey: string;
    work_date: string;
    from_time?: string | null;
    to_time?: string | null;
    start: number | null;
    end: number | null;
    hours: number;
    work_done: string;
    remarks: string;
    locations: SessionLocation[];
    locationIds: string[];
    is_claimed: boolean;
    is_locked: boolean;
}

interface LockedConflictInfo {
    id?: number;
    start: number;
    end: number;
    is_ticket: boolean;
    ticket_id?: number | null;
    ticket_work_order_no?: string | null;
    ticket_title?: string | null;
    remarks?: string;
    work_done?: string;
    is_claimed?: boolean;
    is_locked?: boolean;
}

interface PastelColor {
    bg: string;
    border: string;
    text: string;
    subtext: string;
    linkText: string;
    badgeBg: string;
    dotBg: string;
    cardBg: string;
    cardBorder: string;
    bannerBg: string;
}


const TICKET_PERMANENT_COLOR: PastelColor = {
    bg: 'bg-slate-300 dark:bg-slate-700',
    border: 'border-slate-500 dark:border-slate-400',
    text: 'text-slate-950 dark:text-white',
    subtext: 'text-slate-800 dark:text-slate-200',
    linkText: 'text-blue-800 dark:text-blue-300 hover:text-blue-950 dark:hover:text-blue-100',
    badgeBg: 'bg-slate-400/80 dark:bg-slate-600 text-slate-950 dark:text-white border-slate-500',
    dotBg: 'bg-slate-700 dark:bg-slate-200',
    cardBg: 'bg-slate-200/90 dark:bg-slate-800',
    cardBorder: 'border-slate-400 dark:border-slate-500',
    bannerBg: 'bg-slate-200 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-slate-950 dark:text-white',
};

// 16 Saturated, distinct pastel session palettes (used in strict order without repeating until all are used)
const PASTEL_SESSION_COLORS: PastelColor[] = [
    // 0: Golden Amber
    {
        bg: 'bg-indigo-200 dark:bg-indigo-900/60',
        border: 'border-indigo-400 dark:border-indigo-600',
        text: 'text-indigo-950 dark:text-indigo-50',
        subtext: 'text-indigo-900 dark:text-indigo-200',
        linkText: 'text-indigo-900 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-indigo-100',
        badgeBg: 'bg-indigo-300 dark:bg-indigo-800 text-indigo-950 dark:text-indigo-100 border-indigo-500',
        dotBg: 'bg-indigo-500 dark:bg-indigo-400',
        cardBg: 'bg-indigo-100 dark:bg-indigo-950/40',
        cardBorder: 'border-indigo-300 dark:border-indigo-700',
        bannerBg: 'bg-indigo-200 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-700 text-indigo-950 dark:text-indigo-100',
    },
    // 1: Vibrant Sky Blue
    {
        bg: 'bg-sky-200 dark:bg-sky-900/60',
        border: 'border-sky-400 dark:border-sky-600',
        text: 'text-sky-950 dark:text-sky-50',
        subtext: 'text-sky-900 dark:text-sky-200',
        linkText: 'text-sky-900 dark:text-sky-300 hover:text-sky-950 dark:hover:text-sky-100',
        badgeBg: 'bg-sky-300 dark:bg-sky-800 text-sky-950 dark:text-sky-100 border-sky-500',
        dotBg: 'bg-sky-500 dark:bg-sky-400',
        cardBg: 'bg-sky-100 dark:bg-sky-950/40',
        cardBorder: 'border-sky-300 dark:border-sky-700',
        bannerBg: 'bg-sky-200 dark:bg-sky-950/60 border-sky-400 dark:border-sky-700 text-sky-950 dark:text-sky-100',
    },
    // 2: Vibrant Emerald Green
    {
        bg: 'bg-emerald-200 dark:bg-emerald-900/60',
        border: 'border-emerald-400 dark:border-emerald-600',
        text: 'text-emerald-950 dark:text-emerald-50',
        subtext: 'text-emerald-900 dark:text-emerald-200',
        linkText: 'text-emerald-900 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100',
        badgeBg: 'bg-emerald-300 dark:bg-emerald-800 text-emerald-950 dark:text-emerald-100 border-emerald-500',
        dotBg: 'bg-emerald-500 dark:bg-emerald-400',
        cardBg: 'bg-emerald-100 dark:bg-emerald-950/40',
        cardBorder: 'border-emerald-300 dark:border-emerald-700',
        bannerBg: 'bg-emerald-200 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100',
    },
    // 3: Rich Lavender / Purple
    {
        bg: 'bg-purple-200 dark:bg-purple-900/60',
        border: 'border-purple-400 dark:border-purple-600',
        text: 'text-purple-950 dark:text-purple-50',
        subtext: 'text-purple-900 dark:text-purple-200',
        linkText: 'text-purple-900 dark:text-purple-300 hover:text-purple-950 dark:hover:text-purple-100',
        badgeBg: 'bg-purple-300 dark:bg-purple-800 text-purple-950 dark:text-purple-100 border-purple-500',
        dotBg: 'bg-purple-500 dark:bg-purple-400',
        cardBg: 'bg-purple-100 dark:bg-purple-950/40',
        cardBorder: 'border-purple-300 dark:border-purple-700',
        bannerBg: 'bg-purple-200 dark:bg-purple-950/60 border-purple-400 dark:border-purple-700 text-purple-950 dark:text-purple-100',
    },
    // 4: Vibrant Rose
    {
        bg: 'bg-rose-200 dark:bg-rose-900/60',
        border: 'border-rose-400 dark:border-rose-600',
        text: 'text-rose-950 dark:text-rose-50',
        subtext: 'text-rose-900 dark:text-rose-200',
        linkText: 'text-rose-900 dark:text-rose-300 hover:text-rose-950 dark:hover:text-rose-100',
        badgeBg: 'bg-rose-300 dark:bg-rose-800 text-rose-950 dark:text-rose-100 border-rose-500',
        dotBg: 'bg-rose-500 dark:bg-rose-400',
        cardBg: 'bg-rose-100 dark:bg-rose-950/40',
        cardBorder: 'border-rose-300 dark:border-rose-700',
        bannerBg: 'bg-rose-200 dark:bg-rose-950/60 border-rose-400 dark:border-rose-700 text-rose-950 dark:text-rose-100',
    },
    // 5: Cool Teal
    {
        bg: 'bg-teal-200 dark:bg-teal-900/60',
        border: 'border-teal-400 dark:border-teal-600',
        text: 'text-teal-950 dark:text-teal-50',
        subtext: 'text-teal-900 dark:text-teal-200',
        linkText: 'text-teal-900 dark:text-teal-300 hover:text-teal-950 dark:hover:text-teal-100',
        badgeBg: 'bg-teal-300 dark:bg-teal-800 text-teal-950 dark:text-teal-100 border-teal-500',
        dotBg: 'bg-teal-500 dark:bg-teal-400',
        cardBg: 'bg-teal-100 dark:bg-teal-950/40',
        cardBorder: 'border-teal-300 dark:border-teal-700',
        bannerBg: 'bg-teal-200 dark:bg-teal-950/60 border-teal-400 dark:border-teal-700 text-teal-950 dark:text-teal-100',
    },
    // 6: Warm Orange
    {
        bg: 'bg-orange-200 dark:bg-orange-900/60',
        border: 'border-orange-400 dark:border-orange-600',
        text: 'text-orange-950 dark:text-orange-50',
        subtext: 'text-orange-900 dark:text-orange-200',
        linkText: 'text-orange-900 dark:text-orange-300 hover:text-orange-950 dark:hover:text-orange-100',
        badgeBg: 'bg-orange-300 dark:bg-orange-800 text-orange-950 dark:text-orange-100 border-orange-500',
        dotBg: 'bg-orange-500 dark:bg-orange-400',
        cardBg: 'bg-orange-100 dark:bg-orange-950/40',
        cardBorder: 'border-orange-300 dark:border-orange-700',
        bannerBg: 'bg-orange-200 dark:bg-orange-950/60 border-orange-400 dark:border-orange-700 text-orange-950 dark:text-orange-100',
    },
    // 7: Deep Indigo
    {
        bg: 'bg-indigo-200 dark:bg-indigo-900/60',
        border: 'border-indigo-400 dark:border-indigo-600',
        text: 'text-indigo-950 dark:text-indigo-50',
        subtext: 'text-indigo-900 dark:text-indigo-200',
        linkText: 'text-indigo-900 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-indigo-100',
        badgeBg: 'bg-indigo-300 dark:bg-indigo-800 text-indigo-950 dark:text-indigo-100 border-indigo-500',
        dotBg: 'bg-indigo-500 dark:bg-indigo-400',
        cardBg: 'bg-indigo-100 dark:bg-indigo-950/40',
        cardBorder: 'border-indigo-300 dark:border-indigo-700',
        bannerBg: 'bg-indigo-200 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-700 text-indigo-950 dark:text-indigo-100',
    },
    // 8: Fresh Lime
    {
        bg: 'bg-lime-200 dark:bg-lime-900/60',
        border: 'border-lime-400 dark:border-lime-600',
        text: 'text-lime-950 dark:text-lime-50',
        subtext: 'text-lime-900 dark:text-lime-200',
        linkText: 'text-lime-900 dark:text-lime-300 hover:text-lime-950 dark:hover:text-lime-100',
        badgeBg: 'bg-lime-300 dark:bg-lime-800 text-lime-950 dark:text-lime-100 border-lime-500',
        dotBg: 'bg-lime-500 dark:bg-lime-400',
        cardBg: 'bg-lime-100 dark:bg-lime-950/40',
        cardBorder: 'border-lime-300 dark:border-lime-700',
        bannerBg: 'bg-lime-200 dark:bg-lime-950/60 border-lime-400 dark:border-lime-700 text-lime-950 dark:text-lime-100',
    },
    // 9: Bright Fuchsia
    {
        bg: 'bg-fuchsia-200 dark:bg-fuchsia-900/60',
        border: 'border-fuchsia-400 dark:border-fuchsia-600',
        text: 'text-fuchsia-950 dark:text-fuchsia-50',
        subtext: 'text-fuchsia-900 dark:text-fuchsia-200',
        linkText: 'text-fuchsia-900 dark:text-fuchsia-300 hover:text-fuchsia-950 dark:hover:text-fuchsia-100',
        badgeBg: 'bg-fuchsia-300 dark:bg-fuchsia-800 text-fuchsia-950 dark:text-fuchsia-100 border-fuchsia-500',
        dotBg: 'bg-fuchsia-500 dark:bg-fuchsia-400',
        cardBg: 'bg-fuchsia-100 dark:bg-fuchsia-950/40',
        cardBorder: 'border-fuchsia-300 dark:border-fuchsia-700',
        bannerBg: 'bg-fuchsia-200 dark:bg-fuchsia-950/60 border-fuchsia-400 dark:border-fuchsia-700 text-fuchsia-950 dark:text-fuchsia-100',
    },
    // 10: Bright Cyan
    {
        bg: 'bg-cyan-200 dark:bg-cyan-900/60',
        border: 'border-cyan-400 dark:border-cyan-600',
        text: 'text-cyan-950 dark:text-cyan-50',
        subtext: 'text-cyan-900 dark:text-cyan-200',
        linkText: 'text-cyan-900 dark:text-cyan-300 hover:text-cyan-950 dark:hover:text-cyan-100',
        badgeBg: 'bg-cyan-300 dark:bg-cyan-800 text-cyan-950 dark:text-cyan-100 border-cyan-500',
        dotBg: 'bg-cyan-500 dark:bg-cyan-400',
        cardBg: 'bg-cyan-100 dark:bg-cyan-950/40',
        cardBorder: 'border-cyan-300 dark:border-cyan-700',
        bannerBg: 'bg-cyan-200 dark:bg-cyan-950/60 border-cyan-400 dark:border-cyan-700 text-cyan-950 dark:text-cyan-100',
    },
    // 11: Vibrant Violet
    {
        bg: 'bg-violet-200 dark:bg-violet-900/60',
        border: 'border-violet-400 dark:border-violet-600',
        text: 'text-violet-950 dark:text-violet-50',
        subtext: 'text-violet-900 dark:text-violet-200',
        linkText: 'text-violet-900 dark:text-violet-300 hover:text-violet-950 dark:hover:text-violet-100',
        badgeBg: 'bg-violet-300 dark:bg-violet-800 text-violet-950 dark:text-violet-100 border-violet-500',
        dotBg: 'bg-violet-500 dark:bg-violet-400',
        cardBg: 'bg-violet-100 dark:bg-violet-950/40',
        cardBorder: 'border-violet-300 dark:border-violet-700',
        bannerBg: 'bg-violet-200 dark:bg-violet-950/60 border-violet-400 dark:border-violet-700 text-violet-950 dark:text-violet-100',
    },
    // 12: Sunny Yellow
    {
        bg: 'bg-stone-200 dark:bg-stone-900/60',
        border: 'border-stone-400 dark:border-stone-600',
        text: 'text-stone-950 dark:text-stone-50',
        subtext: 'text-stone-900 dark:text-stone-200',
        linkText: 'text-stone-900 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-100',
        badgeBg: 'bg-stone-300 dark:bg-stone-800 text-stone-950 dark:text-stone-100 border-stone-500',
        dotBg: 'bg-stone-500 dark:bg-stone-400',
        cardBg: 'bg-stone-100 dark:bg-stone-950/40',
        cardBorder: 'border-stone-300 dark:border-stone-700',
        bannerBg: 'bg-stone-200 dark:bg-stone-950/60 border-stone-400 dark:border-stone-700 text-stone-950 dark:text-stone-100',
    },
    // 13: Royal Blue
    {
        bg: 'bg-blue-200 dark:bg-blue-900/60',
        border: 'border-blue-400 dark:border-blue-600',
        text: 'text-blue-950 dark:text-blue-50',
        subtext: 'text-blue-900 dark:text-blue-200',
        linkText: 'text-blue-900 dark:text-blue-300 hover:text-blue-950 dark:hover:text-blue-100',
        badgeBg: 'bg-blue-300 dark:bg-blue-800 text-blue-950 dark:text-blue-100 border-blue-500',
        dotBg: 'bg-blue-500 dark:bg-blue-400',
        cardBg: 'bg-blue-100 dark:bg-blue-950/40',
        cardBorder: 'border-blue-300 dark:border-blue-700',
        bannerBg: 'bg-blue-200 dark:bg-blue-950/60 border-blue-400 dark:border-blue-700 text-blue-950 dark:text-blue-100',
    },
    // 14: Soft Pink
    {
        bg: 'bg-pink-200 dark:bg-pink-900/60',
        border: 'border-pink-400 dark:border-pink-600',
        text: 'text-pink-950 dark:text-pink-50',
        subtext: 'text-pink-900 dark:text-pink-200',
        linkText: 'text-pink-900 dark:text-pink-300 hover:text-pink-950 dark:hover:text-pink-100',
        badgeBg: 'bg-pink-300 dark:bg-pink-800 text-pink-950 dark:text-pink-100 border-pink-500',
        dotBg: 'bg-pink-500 dark:bg-pink-400',
        cardBg: 'bg-pink-100 dark:bg-pink-950/40',
        cardBorder: 'border-pink-300 dark:border-pink-700',
        bannerBg: 'bg-pink-200 dark:bg-pink-950/60 border-pink-400 dark:border-pink-700 text-pink-950 dark:text-pink-100',
    },
    // 15: Coral Red
    {
        bg: 'bg-red-200 dark:bg-red-900/60',
        border: 'border-red-400 dark:border-red-600',
        text: 'text-red-950 dark:text-red-50',
        subtext: 'text-red-900 dark:text-red-200',
        linkText: 'text-red-900 dark:text-red-300 hover:text-red-950 dark:hover:text-red-100',
        badgeBg: 'bg-red-300 dark:bg-red-800 text-red-950 dark:text-red-100 border-red-500',
        dotBg: 'bg-red-500 dark:bg-red-400',
        cardBg: 'bg-red-100 dark:bg-red-950/40',
        cardBorder: 'border-red-300 dark:border-red-700',
        bannerBg: 'bg-red-200 dark:bg-red-950/60 border-red-400 dark:border-red-700 text-red-950 dark:text-red-100',
    },
];


interface TimeSheetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSessionsUpdated?: () => void;
    initialDate?: string;
    initialEditingWorklogId?: number;
    ticketId?: number;
    workerId?: number;
    fixedLocationId?: string;
    fixedLocationName?: string;
    lockLocation?: boolean;
    minDateKey?: string;
    initialCalendarOpen?: boolean;
    workerName?: string;
    employeeNo?: string;
    workerRole?: string;
    workerRate?: number | string;
    subDepartments?: string;
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toDateKey(dateObj: Date): string {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey: string): Date {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatClock(minutes: number): string {
    const time = ((minutes % DAY) + DAY) % DAY;
    const hours = Math.floor(time / 60);
    const mins = time % 60;
    const displayHour = (hours % 12) || 12;
    const suffix = hours < 12 ? 'AM' : 'PM';

    return mins === 0
        ? `${displayHour} ${suffix}`
        : `${displayHour}:${pad(mins)} ${suffix}`;
}

function formatTime(minutes: number): string {
    return formatClock(minutes);
}

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours && !mins) return '0 min';
    let result = '';
    if (hours) result += `${hours}h`;
    if (mins) result += `${hours ? ' ' : ''}${mins}m`;
    return result;
}

function minutesToTimeString(minutes: number): string {
    const normalized = ((minutes % DAY) + DAY) % DAY;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${pad(h)}:${pad(m)}:00`;
}

function intervalOverlap(a: number, b: number, c: number, d: number): boolean {
    return a < d && b > c;
}

function normalizeRange(a: number, b: number) {
    return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function getCompletionBadgeClasses(percent: number) {
    if (percent <= 0) return 'bg-slate-100 text-slate-600 border-slate-200';
    if (percent < 40) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (percent < 85) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
}

export const TimeSheetModal: React.FC<TimeSheetModalProps> = ({
    isOpen,
    onClose,
    onSessionsUpdated,
    initialDate,
    initialEditingWorklogId,
    ticketId,
    workerId,
    fixedLocationId,
    fixedLocationName,
    lockLocation = false,
    minDateKey,
    initialCalendarOpen,
    workerName,
    employeeNo,
    workerRole,
    workerRate,
    subDepartments,
}) => {
    const { token } = useSelector((state: RootState) => state.auth);

    const todayKey = useMemo(() => toDateKey(new Date()), []);
    const [selectedDateKey, setSelectedDateKey] = useState<string>(initialDate || todayKey);

    // Month picker calendar popup state
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [hasSelectedDay, setHasSelectedDay] = useState(!initialCalendarOpen);

    useEffect(() => {
        if (isOpen) {
            setHasSelectedDay(!initialCalendarOpen);
        }
    }, [isOpen, initialCalendarOpen]);

    const handleCloseCalendarPopup = () => {
        if (hasSelectedDay) {
            setIsCalendarOpen(false);
        } else {
            setIsCalendarOpen(false);
            handleCloseModal();
        }
    };
    const [calendarViewYear, setCalendarViewYear] = useState<number>(new Date().getFullYear());
    const [calendarViewMonth, setCalendarViewMonth] = useState<number>(new Date().getMonth());
    const [monthDaysStats, setMonthDaysStats] = useState<Record<string, { total_hours: number; completion_percentage: number }>>({});

    // Available Stores (by default 0 selected unless fixedLocationId provided)
    const [stores, setStores] = useState<StoreItem[]>([]);
    const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(fixedLocationId ? [fixedLocationId] : []);
    const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);
    const [storeSearch, setStoreSearch] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
    const storeDropdownRef = useRef<HTMLDivElement>(null);

    // Auto-close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (storeDropdownRef.current && !storeDropdownRef.current.contains(event.target as Node)) {
                setIsStoreDropdownOpen(false);
            }
        }
        if (isStoreDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isStoreDropdownOpen]);

    const availableStoreTypes = useMemo(() => {
        const typesSet = new Set<string>();
        stores.forEach((s) => {
            if (s.type) typesSet.add(s.type);
        });
        return Array.from(typesSet);
    }, [stores]);

    const filteredStores = useMemo(() => {
        const q = storeSearch.trim().toLowerCase();
        return stores.filter((s) => {
            if (selectedTypeFilter !== 'ALL' && s.type !== selectedTypeFilter) {
                return false;
            }
            if (!q) return true;
            const matchesName = s.store_name.toLowerCase().includes(q);
            const matchesCode = s.short_code && s.short_code.toLowerCase().includes(q);
            const matchesId = s.store_id && s.store_id.toLowerCase().includes(q);
            const matchesType = s.type && s.type.toLowerCase().includes(q);
            return matchesName || matchesCode || matchesId || matchesType;
        });
    }, [stores, selectedTypeFilter, storeSearch]);

    // Sessions & Day Stats
    const [sessions, setSessions] = useState<BookedSession[]>([]);
    const [totalBookedHours, setTotalBookedHours] = useState<number>(0);
    const [completionPercentage, setCompletionPercentage] = useState<number>(0);
    const [loadingDay, setLoadingDay] = useState(false);
    const [saving, setSaving] = useState(false);

    // Dynamic Guidance Message matching xxdemo.html
    const [message, setMessage] = useState<{ text: string; error?: boolean }>({
        text: 'Select an available slot to begin.'
    });

    // Active Booked Details Conflict (shows ticket link & remark)
    const [activeConflict, setActiveConflict] = useState<LockedConflictInfo | null>(null);

    // Interactive Slots Grid & Window (3 Shifts: Early Morning 12 AM – 8 AM, Daytime 8 AM – 4 PM [default], Night 4 PM – 12 AM)
    const [windowStart, setWindowStartState] = useState<number>(DAYTIME_WINDOW_START);
    const [slideDirection, setSlideDirection] = useState<number>(0);

    const setWindowStart = useCallback((newWindow: number | ((prev: number) => number)) => {
        setWindowStartState((prev) => {
            const nextVal = typeof newWindow === 'function' ? newWindow(prev) : newWindow;
            if (nextVal > prev) setSlideDirection(1);
            else if (nextVal < prev) setSlideDirection(-1);
            return nextVal;
        });
    }, []);

    const isEarlyMorning = windowStart === EARLY_MORNING_WINDOW_START;
    const isDaytime = windowStart === DAYTIME_WINDOW_START;
    const isNight = windowStart === NIGHT_WINDOW_START;
    const [remarks, setRemarks] = useState('');
    const [showManualSessions, setShowManualSessions] = useState(false);
    const [selection, setSelection] = useState<{
        anchorSlot: number;
        anchorStart: number;
        anchorEnd: number;
        anchorStateIdx: number;
        endpointSlot: number | null;
        endpointPhase: number;
        start: number;
        end: number;
    } | null>(null);

    // Edit Mode & Clicked Session Details Mode
    const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
    const [selectedSessionForView, setSelectedSessionForView] = useState<BookedSession | null>(null);

    // Mobile Virtual Keyboard Height Tracking (visualViewport)
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
    const remarksInputRef = useRef<HTMLInputElement>(null);

    // Every time modal closes and opens, reset to Daytime view (8 AM – 4 PM) and clear active selections
    useEffect(() => {
        if (isOpen) {
            setWindowStart(DAYTIME_WINDOW_START);
            const defaultDate = initialDate || todayKey;
            let targetDate = defaultDate;
            if (minDateKey && defaultDate < minDateKey) {
                targetDate = minDateKey;
            } else if (defaultDate > todayKey) {
                targetDate = todayKey;
            }
            setSelectedDateKey(targetDate);
            const dateObj = parseDateKey(targetDate);
            setCalendarViewYear(dateObj.getFullYear());
            setCalendarViewMonth(dateObj.getMonth());
            setSelection(null);
            setSelectedSessionForView(null);
            setEditingSessionId(null);
            setActiveConflict(null);
            setRemarks('');
            setSelectedStoreIds(fixedLocationId ? [fixedLocationId] : []);

            const shouldOpenCalendar = initialCalendarOpen !== undefined
                ? initialCalendarOpen
                : (!initialEditingWorklogId);
            setIsCalendarOpen(shouldOpenCalendar);
        } else {
            setIsCalendarOpen(false);
        }
    }, [isOpen, initialDate, todayKey, minDateKey, fixedLocationId, initialCalendarOpen, initialEditingWorklogId]);

    const handleCloseModal = () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('log')) {
            urlParams.delete('log');
            const nextQuery = urlParams.toString();
            const newUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
            window.history.replaceState(null, '', newUrl);
        }
        setWindowStart(DAYTIME_WINDOW_START);
        setSelection(null);
        setSelectedSessionForView(null);
        setEditingSessionId(null);
        setActiveConflict(null);
        setIsCalendarOpen(false);
        onClose();
    };

    useEffect(() => {
        if (!isOpen || typeof window === 'undefined' || !window.visualViewport) return;

        const handleViewportResize = () => {
            const vv = window.visualViewport;
            if (!vv) return;
            const offset = window.innerHeight - vv.height - (vv.offsetTop || 0);
            setKeyboardHeight(offset > 80 ? Math.round(offset) : 0);
        };

        const vv = window.visualViewport;
        vv.addEventListener('resize', handleViewportResize);
        vv.addEventListener('scroll', handleViewportResize);

        return () => {
            vv.removeEventListener('resize', handleViewportResize);
            vv.removeEventListener('scroll', handleViewportResize);
        };
    }, [isOpen]);

    // Fetch Stores on open
    useEffect(() => {
        if (!isOpen || !token) return;
        const fetchStores = async () => {
            try {
                const res = await fetch(`${API_URL}/stores/store/?all=true`, {
                    headers: { Authorization: `Token ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    const list: StoreItem[] = Array.isArray(data) ? data : (data.results || []);
                    setStores(list);
                    if (fixedLocationId) {
                        setSelectedStoreIds([fixedLocationId]);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch stores:', err);
            }
        };
        fetchStores();
    }, [isOpen, token, fixedLocationId]);

    // Fetch Timesheet for selectedDateKey
    const fetchDayTimesheet = useCallback(async () => {
        if (!isOpen || !token) return;
        setLoadingDay(true);
        try {
            const workerParam = workerId ? `&worker=${workerId}` : '';
            const res = await fetch(`${API_URL}/maintenance/worklog/timesheet/?date=${selectedDateKey}${workerParam}`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data.sessions || []);
                setTotalBookedHours(data.total_booked_hours || 0);
                setCompletionPercentage(data.completion_percentage || 0);
            }
        } catch (err) {
            console.error('Failed to fetch timesheet:', err);
        } finally {
            setLoadingDay(false);
        }
    }, [isOpen, token, selectedDateKey, workerId]);

    useEffect(() => {
        fetchDayTimesheet();
    }, [fetchDayTimesheet]);

    // Fetch Month Calendar completion stats
    const fetchMonthStats = useCallback(async (year: number, month: number) => {
        if (!token) return;
        try {
            const workerParam = workerId ? `&worker=${workerId}` : '';
            const res = await fetch(`${API_URL}/maintenance/worklog/timesheet_calendar/?year=${year}&month=${month + 1}${workerParam}`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setMonthDaysStats(data.days || {});
            }
        } catch (err) {
            console.error('Failed to fetch month timesheet stats:', err);
        }
    }, [token, workerId]);

    useEffect(() => {
        if (isCalendarOpen) {
            fetchMonthStats(calendarViewYear, calendarViewMonth);
        }
    }, [isCalendarOpen, calendarViewYear, calendarViewMonth, fetchMonthStats]);

    // Unslotted sessions (sessions recorded with hours but no specific time slot)
    const unslottedSessions = useMemo(() => {
        return sessions.filter((s) => s.start === null || s.end === null);
    }, [sessions]);

    // Effective Locked Intervals for current date (with rich ticket details & remarks)
    const effectiveLockedIntervals = useMemo<LockedConflictInfo[]>(() => {
        const intervals: LockedConflictInfo[] = [];
        sessions.forEach((s) => {
            if (s.id === editingSessionId) return;
            if (s.start !== null && s.end !== null) {
                intervals.push({
                    id: s.id,
                    start: s.start,
                    end: s.end,
                    is_ticket: s.is_ticket,
                    ticket_id: s.ticket_id,
                    ticket_work_order_no: s.ticket_work_order_no,
                    ticket_title: s.ticket_title,
                    remarks: s.remarks,
                    work_done: s.work_done,
                    is_claimed: s.is_claimed,
                    is_locked: s.is_locked,
                });
                // Wrap-around support for Part 2 night shift (12 AM - 1 AM is 1440 - 1500)
                if (s.start < 180) {
                    intervals.push({
                        id: s.id,
                        start: s.start + 1440,
                        end: s.end + 1440,
                        is_ticket: s.is_ticket,
                        ticket_id: s.ticket_id,
                        ticket_work_order_no: s.ticket_work_order_no,
                        ticket_title: s.ticket_title,
                        remarks: s.remarks,
                        work_done: s.work_done,
                        is_claimed: s.is_claimed,
                        is_locked: s.is_locked,
                    });
                }
                if (s.start >= 1440) {
                    intervals.push({
                        id: s.id,
                        start: s.start - 1440,
                        end: s.end - 1440,
                        is_ticket: s.is_ticket,
                        ticket_id: s.ticket_id,
                        ticket_work_order_no: s.ticket_work_order_no,
                        ticket_title: s.ticket_title,
                        remarks: s.remarks,
                        work_done: s.work_done,
                        is_claimed: s.is_claimed,
                        is_locked: s.is_locked,
                    });
                }
            }
        });
        return intervals;
    }, [sessions, editingSessionId]);

    const isPeriodLocked = useCallback((start: number, end: number) => {
        return effectiveLockedIntervals.some((iv) => intervalOverlap(start, end, iv.start, iv.end));
    }, [effectiveLockedIntervals]);

    const getLockedConflict = useCallback((start: number, end: number): LockedConflictInfo | null => {
        return effectiveLockedIntervals.find((iv) => intervalOverlap(start, end, iv.start, iv.end)) || null;
    }, [effectiveLockedIntervals]);

    // Persistent color cache:
    // 1) Assigns pastel colors strictly from order (0, 1, 2, 3...)
    // 2) Never repeats a color until all 16 colors in PASTEL_SESSION_COLORS have been used
    // 3) Existing sessions permanently retain their assigned color when new sessions are added
    const sessionColorCache = useRef<Map<number, number>>(new Map());

    useEffect(() => {
        sessionColorCache.current.clear();
    }, [selectedDateKey]);

    const sessionColorMap = useMemo(() => {
        const cache = sessionColorCache.current;
        const currentManualSessions = sessions.filter((s) => !s.is_ticket && s.id !== undefined && s.id !== null);
        const currentManualIds = new Set(currentManualSessions.map((s) => s.id));

        // Purge deleted session IDs
        for (const id of Array.from(cache.keys())) {
            if (!currentManualIds.has(id)) {
                cache.delete(id);
            }
        }

        // Sort manual sessions by permanent ID ascending (creation order)
        const sortedSessions = currentManualSessions.slice().sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

        // Assign colors in strict order (0, 1, 2...) without repeating until all colors are used
        sortedSessions.forEach((s) => {
            if (!cache.has(s.id)) {
                const usedIndices = new Set(cache.values());
                let nextIdx = -1;
                for (let i = 0; i < PASTEL_SESSION_COLORS.length; i++) {
                    if (!usedIndices.has(i)) {
                        nextIdx = i;
                        break;
                    }
                }
                // If all 16 colors in the palette are in use, wrap around based on count
                if (nextIdx === -1) {
                    nextIdx = cache.size % PASTEL_SESSION_COLORS.length;
                }
                cache.set(s.id, nextIdx);
            }
        });

        return new Map(cache);
    }, [sessions]);

    // Retrieve session color:
    // 1) All tickets use a common permanent non-pastel color (TICKET_PERMANENT_COLOR)
    // 2) Manual sessions use a stable pastel color assigned in strict order without repeating
    const getSessionColor = useCallback((isTicket: boolean, sessionId?: number, ticketId?: number | null, startMinutes?: number): PastelColor => {
        if (isTicket) {
            return TICKET_PERMANENT_COLOR;
        }

        if (sessionId !== undefined && sessionId !== null && sessionColorMap.has(sessionId)) {
            const colorIdx = sessionColorMap.get(sessionId)!;
            return PASTEL_SESSION_COLORS[colorIdx];
        }

        if (sessionId !== undefined && sessionId !== null) {
            const colorIdx = Math.abs(sessionId) % PASTEL_SESSION_COLORS.length;
            return PASTEL_SESSION_COLORS[colorIdx];
        }

        const rawKey = ticketId ?? startMinutes ?? 0;
        const colorIdx = Math.abs(typeof rawKey === 'number' ? rawKey : 0) % PASTEL_SESSION_COLORS.length;
        return PASTEL_SESSION_COLORS[colorIdx];
    }, [sessionColorMap]);

    /**
     * Generates all valid anchor states in xxdemo.html order:
     * 1) First half (:00 – :30)
     * 2) Full 1 hour (:00 – :60)
     * 3) Last half (:30 – :60)
     */
    const getValidAnchorStates = useCallback((slotStart: number) => {
        let firstFree = -1;
        for (let i = 0; i < PARTS_COUNT; i++) {
            if (!isPeriodLocked(slotStart + i * STEP, slotStart + (i + 1) * STEP)) {
                firstFree = i;
                break;
            }
        }
        if (firstFree === -1) return [];

        const states: { start: number; end: number }[] = [];

        // States starting at firstFree, extending step by step
        for (let endIdx = firstFree + 1; endIdx <= PARTS_COUNT; endIdx++) {
            const s = slotStart + firstFree * STEP;
            const e = slotStart + endIdx * STEP;
            if (!isPeriodLocked(s, e)) {
                states.push({ start: s, end: e });
            } else {
                break;
            }
        }

        // States starting after firstFree, ending at slot end (LAST 30 MINUTES!)
        const lastState = states[states.length - 1];
        if (lastState && lastState.end === slotStart + HOUR) {
            for (let startIdx = firstFree + 1; startIdx < PARTS_COUNT; startIdx++) {
                const s = slotStart + startIdx * STEP;
                const e = slotStart + HOUR;
                if (!isPeriodLocked(s, e)) {
                    states.push({ start: s, end: e });
                }
            }
        }

        return states;
    }, [isPeriodLocked]);

    /**
     * Starts a new selection with clean instructions matching xxdemo.html.
     */
    const startNewSelection = (slotStart: number, initialStart?: number, initialEnd?: number) => {
        setSelectedSessionForView(null);
        const states = getValidAnchorStates(slotStart);
        if (!states.length) {
            const conflict = getLockedConflict(slotStart, slotStart + HOUR);
            if (conflict) {
                setActiveConflict(conflict);
            }
            setMessage({ text: 'This entire hour is already booked.', error: true });
            return false;
        }

        let initial = states[0];
        let stateIdx = 0;

        if (initialStart !== undefined && initialEnd !== undefined) {
            const foundIdx = states.findIndex((st) => st.start === initialStart && st.end === initialEnd);
            if (foundIdx !== -1) {
                initial = states[foundIdx];
                stateIdx = foundIdx;
            } else {
                initial = { start: initialStart, end: initialEnd };
            }
        }

        setActiveConflict(null);
        setSelection({
            anchorSlot: slotStart,
            anchorStart: initial.start,
            anchorEnd: initial.end,
            anchorStateIdx: stateIdx,
            endpointSlot: null,
            endpointPhase: 0,
            start: initial.start,
            end: initial.end,
        });

        setActiveConflict(null);
        setMessage({ text: '' });
        return true;
    };

    /**
     * Cycles anchor duration or cancels on last click like xxdemo.html.
     */


    const navigate = useNavigate();

    const clickAnchor = () => {
        if (!selection) return;
        const slot = selection.anchorSlot;
        const states = getValidAnchorStates(slot);
        const nextIdx = selection.anchorStateIdx + 1;

        // Click again past last state -> CANCEL / CLEAR SELECTION!
        if (nextIdx >= states.length) {
            setSelection(null);
            setActiveConflict(null);
            setMessage({ text: 'Selection cleared.' });
            return;
        }

        const nextState = states[nextIdx];
        if (isPeriodLocked(nextState.start, nextState.end)) {
            setSelection(null);
            setActiveConflict(null);
            setMessage({ text: 'Selection cleared.' });
            return;
        }

        setActiveConflict(null);
        setSelection({
            anchorSlot: slot,
            anchorStart: nextState.start,
            anchorEnd: nextState.end,
            anchorStateIdx: nextIdx,
            endpointSlot: null,
            endpointPhase: 0,
            start: nextState.start,
            end: nextState.end,
        });

        setMessage({ text: '' });
    };

    /**
     * Extends endpoint slot or removes extension on click again.
     */
    const selectEndpoint = (slotStart: number, phase = 1) => {
        if (!selection) return false;
        const anchorSlot = selection.anchorSlot;
        let candidateStart: number;
        let candidateEnd: number;

        if (slotStart > anchorSlot) {
            candidateStart = selection.anchorStart;
            candidateEnd = slotStart + phase * STEP;
        } else {
            candidateStart = slotStart + HOUR - phase * STEP;
            candidateEnd = selection.anchorEnd;
        }

        const norm = normalizeRange(candidateStart, candidateEnd);
        if (isPeriodLocked(norm.start, norm.end)) {
            const conflict = getLockedConflict(norm.start, norm.end);
            if (conflict) {
                setActiveConflict(conflict);
            }
            setMessage({ text: 'This range overlaps an existing booked session.', error: true });
            return false;
        }

        setActiveConflict(null);
        setSelection({
            ...selection,
            endpointSlot: slotStart,
            endpointPhase: phase,
            start: norm.start,
            end: norm.end,
        });

        setMessage({ text: '' });
        return true;
    };

    /**
     * Parent slot click handler strictly matching xxdemo.html.
     */
    const handleSlotClick = (index: number) => {
        const slotStart = windowStart + index * HOUR;

        if (!selection) {
            startNewSelection(slotStart);
            return;
        }

        // Clicking anchor slot again:
        if (slotStart === selection.anchorSlot) {
            if (selection.endpointSlot !== null) {
                // If extended across slots, clicking anchor clears selection!
                setSelection(null);
                setActiveConflict(null);
                setMessage({ text: 'Selection cleared.' });
            } else {
                // Cycle duration, or cancel / clear on last state!
                clickAnchor();
            }
            return;
        }

        // Clicking endpoint slot again:
        if (slotStart === selection.endpointSlot) {
            if (selection.endpointPhase < PARTS_COUNT) {
                const expanded = selectEndpoint(slotStart, selection.endpointPhase + 1);
                if (!expanded) {
                    setSelection({
                        ...selection,
                        endpointSlot: null,
                        endpointPhase: 0,
                        start: selection.anchorStart,
                        end: selection.anchorEnd,
                    });
                    setActiveConflict(null);
                    setMessage({ text: '' });
                }
            } else {
                // Clicked endpoint again when full -> removes extension!
                setSelection({
                    ...selection,
                    endpointSlot: null,
                    endpointPhase: 0,
                    start: selection.anchorStart,
                    end: selection.anchorEnd,
                });
                setActiveConflict(null);
                setMessage({ text: '' });
            }
            return;
        }

        // Extend to this slot
        selectEndpoint(slotStart, 1);
    };

    /**
     * Direct click on an individual 30m segment (:00–:30 or :30–:60).
     * If already locked, displays the ticket details, remark and clickable link!
     */
    const handleSegmentClick = (slotStart: number, pIndex: number, e: React.MouseEvent) => {
        e.stopPropagation();

        const segStart = slotStart + pIndex * STEP;
        const segEnd = segStart + STEP;

        // If locked -> surface the session in the bottom bar with an Edit button & hide the time sheet!
        const conflict = getLockedConflict(segStart, segEnd);
        if (conflict) {
            const foundSess = sessions.find((s) => Number(s.id) === Number(conflict.id) || (s.worklog_id && Number(s.worklog_id) === Number(conflict.id))) || null;
            if (foundSess) {
                setSelectedSessionForView(foundSess);
                setActiveConflict(conflict);
                setSelection(null);
                setEditingSessionId(null);
                setMessage({ text: '' });
                return;
            }
            setActiveConflict(conflict);
            setMessage({
                text: `This time slot is already booked: Ticket #${conflict.ticket_id || 'N/A'} — ${conflict.remarks || conflict.work_done || conflict.ticket_title || 'Work log recorded'}`,
                error: true
            });
            return;
        }

        // Available slot clicked -> clear viewed session
        setSelectedSessionForView(null);
        setActiveConflict(null);

        // Case 1: No active selection -> start new selection at clicked segment
        if (!selection) {
            startNewSelection(slotStart, segStart, segEnd);
            return;
        }

        // Case 2: Clicked on anchor slot's segment -> cycle or cancel
        if (slotStart === selection.anchorSlot && selection.endpointSlot === null) {
            clickAnchor();
            return;
        }

        // Case 3: Clicked on a segment already inside the active selection -> CANCEL / CLEAR!
        if (intervalOverlap(segStart, segEnd, selection.start, selection.end)) {
            setSelection(null);
            setActiveConflict(null);
            setMessage({ text: 'Selection cleared.' });
            return;
        }

        // Case 4: Extend selection to this segment
        const candidateStart = Math.min(selection.start, segStart);
        const candidateEnd = Math.max(selection.end, segEnd);

        const extConflict = getLockedConflict(candidateStart, candidateEnd);
        if (extConflict) {
            setActiveConflict(extConflict);
            // Overlaps locked interval -> restart at this segment
            startNewSelection(slotStart, segStart, segEnd);
            return;
        }

        setActiveConflict(null);
        setSelection({
            ...selection,
            endpointSlot: slotStart !== selection.anchorSlot ? slotStart : null,
            endpointPhase: pIndex + 1,
            start: candidateStart,
            end: candidateEnd,
        });

        setMessage({ text: '' });
    };

    // Save or Update Session
    const handleSaveSession = async () => {
        if (!selection) return;
        const effectiveStoreIds = selectedStoreIds.length > 0
            ? selectedStoreIds
            : (fixedLocationId ? [fixedLocationId] : []);
        if (!effectiveStoreIds.length) {
            setMessage({ text: 'Please select a store.', error: true });
            return;
        }

        if (!remarks.trim()) {
            setMessage({ text: 'Remarks are required to save session.', error: true });
            return;
        }

        const start = selection.start;
        const end = selection.end;
        if (isPeriodLocked(start, end)) {
            const conflict = getLockedConflict(start, end);
            if (conflict) setActiveConflict(conflict);
            setMessage({ text: 'Selection overlaps an existing booked time sheet.', error: true });
            return;
        }

        const durationMinutes = end - start;
        const hoursToSend = (durationMinutes / 60).toFixed(2);
        const fromTimeStr = minutesToTimeString(start);
        const toTimeStr = minutesToTimeString(end);

        setSaving(true);
        try {
            if (editingSessionId !== null) {
                const updateBody: any = {
                    work_date: selectedDateKey,
                    from_time: fromTimeStr,
                    to_time: toTimeStr,
                    hours: hoursToSend,
                    stores: effectiveStoreIds,
                    work_done: remarks,
                };
                if (ticketId) {
                    updateBody.ticket = ticketId;
                    if (workerId) updateBody.worker = workerId;
                }
                const res = await fetch(`${API_URL}/maintenance/worklog/${editingSessionId}/`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Token ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updateBody),
                });
                if (res.ok) {
                    setMessage({ text: 'Session updated.' });
                    setEditingSessionId(null);
                    setSelection(null);
                    setSelectedSessionForView(null);
                    setActiveConflict(null);
                    setRemarks('');
                    await fetchDayTimesheet();
                    if (onSessionsUpdated) onSessionsUpdated();
                } else {
                    const errData = await res.json();
                    let errMsg = 'Failed to update.';
                    if (errData) {
                        if (typeof errData === 'string') errMsg = errData;
                        else if (errData.detail) errMsg = errData.detail;
                        else if (errData.hours) errMsg = Array.isArray(errData.hours) ? errData.hours[0] : String(errData.hours);
                        else if (typeof errData === 'object') {
                            const vals = Object.values(errData).flat();
                            if (vals.length > 0) errMsg = String(vals[0]);
                        }
                    }
                    setMessage({ text: errMsg, error: true });
                }
            } else {
                const postBody: any = {
                    work_date: selectedDateKey,
                    from_time: fromTimeStr,
                    to_time: toTimeStr,
                    hours: hoursToSend,
                    stores: effectiveStoreIds,
                    work_done: remarks || (ticketId ? 'Ticket Work Log' : 'Timesheet Log'),
                };
                if (ticketId) {
                    postBody.ticket = ticketId;
                    if (workerId) {
                        postBody.worker = workerId;
                    }
                } else {
                    postBody.log_type = 'timesheet';
                }
                const res = await fetch(`${API_URL}/maintenance/worklog/`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Token ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(postBody),
                });
                if (res.ok) {
                    setMessage({ text: 'Time logged successfully.' });
                    setSelection(null);
                    setSelectedSessionForView(null);
                    setActiveConflict(null);
                    setRemarks('');
                    await fetchDayTimesheet();
                    if (onSessionsUpdated) onSessionsUpdated();
                } else {
                    const errData = await res.json();
                    let errMsg = 'Failed to save.';
                    if (errData) {
                        if (typeof errData === 'string') errMsg = errData;
                        else if (errData.detail) errMsg = errData.detail;
                        else if (errData.hours) errMsg = Array.isArray(errData.hours) ? errData.hours[0] : String(errData.hours);
                        else if (typeof errData === 'object') {
                            const vals = Object.values(errData).flat();
                            if (vals.length > 0) errMsg = String(vals[0]);
                        }
                    }
                    setMessage({ text: errMsg, error: true });
                }
            }
        } catch (err) {
            console.error('Error saving session:', err);
            setMessage({ text: 'Server communication error.', error: true });
        } finally {
            setSaving(false);
        }
    };

    const canEditSession = useCallback((sess: BookedSession): boolean => {
        if (sess.is_claimed) return false;
        if (ticketId) {
            // In ticket context, sessions belonging to this ticket can be edited from this ticket
            return Boolean(sess.is_ticket && sess.ticket_id && Number(sess.ticket_id) === Number(ticketId));
        } else {
            // Booked Session only allowed to edit from dashboard
            return !sess.is_ticket && !sess.is_locked;
        }
    }, [ticketId]);

    const isConflictEditable = useCallback((conflict: LockedConflictInfo | null): boolean => {
        if (!conflict) return false;
        if (conflict.is_claimed) return false;
        if (ticketId) {
            return Boolean(conflict.is_ticket && conflict.ticket_id && Number(conflict.ticket_id) === Number(ticketId));
        } else {
            return !conflict.is_ticket && !conflict.is_locked;
        }
    }, [ticketId]);

    // Keep URL &log=ID in sync when viewing or editing a log for this ticket
    useEffect(() => {
        if (!isOpen || !ticketId) return;

        const currentActive = editingSessionId !== null
            ? sessions.find((s) => s.id === editingSessionId)
            : (selectedSessionForView && selectedSessionForView.is_ticket && Number(selectedSessionForView.ticket_id) === Number(ticketId))
                ? selectedSessionForView
                : null;

        const urlParams = new URLSearchParams(window.location.search);
        const queryLog = urlParams.get('log');

        if (currentActive && currentActive.worklog_id) {
            const logStr = String(currentActive.worklog_id);
            if (queryLog !== logStr) {
                urlParams.set('log', logStr);
                const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                window.history.replaceState(null, '', newUrl);
            }
        }
    }, [isOpen, ticketId, editingSessionId, selectedSessionForView, sessions]);

    const handleStartEdit = useCallback((session: BookedSession) => {
        if (!canEditSession(session)) return;
        setSelectedSessionForView(null);
        setEditingSessionId(session.id);
        setRemarks(session.remarks || session.work_done || '');
        if (session.locationIds.length > 0) {
            setSelectedStoreIds(session.locationIds);
        } else if (fixedLocationId) {
            setSelectedStoreIds([fixedLocationId]);
        }

        if (session.start !== null && session.end !== null) {
            let targetWindow = DAYTIME_WINDOW_START;
            if (session.start < DAYTIME_WINDOW_START) {
                targetWindow = EARLY_MORNING_WINDOW_START;
            } else if (session.start >= NIGHT_WINDOW_START) {
                targetWindow = NIGHT_WINDOW_START;
            }
            setWindowStart(targetWindow);

            const anchorSlot = Math.floor(session.start / HOUR) * HOUR;
            setSelection({
                anchorSlot,
                anchorStart: session.start,
                anchorEnd: Math.min(anchorSlot + HOUR, session.end),
                anchorStateIdx: 0,
                endpointSlot: session.end > anchorSlot + HOUR ? Math.floor((session.end - 1) / HOUR) * HOUR : null,
                endpointPhase: Math.ceil(((session.end % HOUR) || HOUR) / STEP),
                start: session.start,
                end: session.end,
            });
            setMessage({ text: 'Editing session.' });
        } else {
            setWindowStart(DAYTIME_WINDOW_START);
            setMessage({ text: 'Please select a time slot on the grid.' });
        }
    }, [canEditSession, fixedLocationId]);

    const initialWorklogHandledRef = useRef<number | null>(null);

    // Auto-enter edit mode when opened for a specific work log
    useEffect(() => {
        if (!isOpen) {
            initialWorklogHandledRef.current = null;
            return;
        }
        if (initialEditingWorklogId && sessions.length > 0 && initialWorklogHandledRef.current !== initialEditingWorklogId) {
            const target = sessions.find((s) => Number(s.worklog_id) === Number(initialEditingWorklogId) || Number(s.id) === Number(initialEditingWorklogId));
            if (target) {
                initialWorklogHandledRef.current = initialEditingWorklogId;
                if (canEditSession(target)) {
                    handleStartEdit(target);
                } else {
                    setSelectedSessionForView(target);
                    if (target.start !== null && target.end !== null) {
                        let targetWindow = DAYTIME_WINDOW_START;
                        if (target.start < DAYTIME_WINDOW_START) {
                            targetWindow = EARLY_MORNING_WINDOW_START;
                        } else if (target.start >= NIGHT_WINDOW_START) {
                            targetWindow = NIGHT_WINDOW_START;
                        }
                        setWindowStart(targetWindow);
                    }
                }
            }
        }
    }, [isOpen, initialEditingWorklogId, sessions, canEditSession, handleStartEdit]);

    const handleCancelEdit = () => {
        setEditingSessionId(null);
        setSelection(null);
        setSelectedSessionForView(null);
        setActiveConflict(null);
        setRemarks('');
        setMessage({ text: 'Edit cancelled.' });
    };

    const handleDeleteSession = async (worklogId: number) => {
        const targetSession = sessions.find((s) => s.worklog_id === worklogId || s.id === worklogId);
        if (targetSession && !canEditSession(targetSession)) return;
        if (!confirm('Delete this logged session?')) return;
        try {
            const res = await fetch(`${API_URL}/maintenance/worklog/${worklogId}/`, {
                method: 'DELETE',
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                setMessage({ text: 'Session removed.' });
                if (editingSessionId === worklogId) {
                    setEditingSessionId(null);
                    setSelection(null);
                }
                if (selectedSessionForView?.worklog_id === worklogId) {
                    setSelectedSessionForView(null);
                }
                setActiveConflict(null);
                await fetchDayTimesheet();
                if (onSessionsUpdated) onSessionsUpdated();
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        }
    };

    const handleResetAllManualSessions = async () => {
        if (!confirm('Reset all manual timesheet sessions for this date? (Ticket logs are kept safe).')) return;
        try {
            const res = await fetch(`${API_URL}/maintenance/worklog/timesheet_reset/`, {
                method: 'POST',
                headers: {
                    Authorization: `Token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: selectedDateKey,
                    location_ids: selectedStoreIds,
                }),
            });
            if (res.ok) {
                setMessage({ text: 'Manual sessions cleared.' });
                setSelection(null);
                setActiveConflict(null);
                setEditingSessionId(null);
                await fetchDayTimesheet();
                if (onSessionsUpdated) onSessionsUpdated();
            }
        } catch (err) {
            console.error('Failed to reset timesheet:', err);
        }
    };

    const selectedDateObj = useMemo(() => parseDateKey(selectedDateKey), [selectedDateKey]);
    const monthShort = selectedDateObj.toLocaleDateString('en-US', { month: 'short' });
    const dayNumber = pad(selectedDateObj.getDate());
    const fullDateText = selectedDateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    const firstDayOfMonth = new Date(calendarViewYear, calendarViewMonth, 1);
    const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
    const startWeekday = firstDayOfMonth.getDay();

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 z-[65] flex justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto transition-all duration-150 ${keyboardHeight > 0 ? 'items-end' : 'items-center'
                }`}
            style={{
                paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 8}px` : undefined,
            }}
        >
            {/* Modal Dialog Container - rounded-2xl like xxdemo.html */}
            <div
                className={`w-full max-w-lg bg-white dark:bg-surface-container rounded-2xl shadow-2xl border border-slate-200 dark:border-outline-variant overflow-hidden flex flex-col relative transition-all duration-150 ${keyboardHeight > 0 ? 'my-0' : 'my-auto'
                    }`}
                style={{
                    maxHeight: keyboardHeight > 0
                        ? `calc(100dvh - ${keyboardHeight + 24}px)`
                        : '94vh',
                }}
            >


                {/* Employee Info Header Banner */}
                {workerName && (
                    <div className="px-4 py-2 bg-slate-50 dark:bg-surface-container-low border-b border-slate-100 dark:border-outline-variant flex items-center justify-between text-xs shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-800 dark:text-on-surface truncate">{workerName}</span>
                            {employeeNo && (
                                <span className="text-[10px] text-slate-500 dark:text-on-surface-variant font-mono shrink-0">
                                    (ID: {employeeNo})
                                </span>
                            )}
                            {workerRole && (
                                <span className="text-[10px] font-semibold text-primary uppercase shrink-0">
                                    &bull; {workerRole}
                                </span>
                            )}
                        </div>

                    </div>
                )}

                {/* Main Body */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-outline-variant">

                    <div className="flex items-center gap-2 p-3 pr-2 bg-white dark:bg-surface-container">
                        {/* Date selector */}
                        <button
                            type="button"
                            onClick={() => {
                                setCalendarViewYear(selectedDateObj.getFullYear());
                                setCalendarViewMonth(selectedDateObj.getMonth());
                                setIsCalendarOpen(true);
                            }}
                            className="group flex-1 min-w-0 flex items-center justify-between gap-3
        rounded-xl border border-slate-200/80 dark:border-outline-variant
        bg-slate-50 hover:bg-slate-100
        dark:bg-surface-container-low dark:hover:bg-surface-container-high
        p-2.5 text-left shadow-sm
        transition-all duration-200
        hover:shadow-md active:scale-[0.99]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {/* Date icon */}
                                <div className="w-10 h-10 rounded-xl bg-[#17191C] text-white
                flex flex-col items-center justify-center flex-shrink-0
                shadow-sm ring-1 ring-black/5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider
                    text-amber-400 leading-none">
                                        {monthShort}
                                    </span>
                                    <span className="text-sm font-black leading-none mt-1">
                                        {dayNumber}
                                    </span>
                                </div>

                                {/* Date information */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[13px] font-bold text-slate-800
                        dark:text-on-surface truncate">
                                            {fullDateText}
                                        </span>
                                        {/* 
                                        {selectedDateKey === todayKey && (
                                            <span className="flex-shrink-0 text-[9px] font-bold
                            uppercase tracking-wide
                            bg-amber-100 text-amber-800
                            dark:bg-amber-400/15 dark:text-amber-400
                            px-2 py-0.5 rounded-full">
                                                Today
                                            </span>
                                        )} */}
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className="text-[10px] text-slate-500
                        dark:text-on-surface-variant font-medium">
                                            {totalBookedHours} / 10 hrs booked
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Completion + calendar */}
                            <div className="flex items-center gap-2.5 flex-shrink-0">
                                <span className={`text-[11px] font-extrabold tabular-nums
                px-2.5 py-1 rounded-full border
                transition-colors duration-200
                ${getCompletionBadgeClasses(completionPercentage)}`}>
                                    {completionPercentage}%
                                </span>

                                <CalendarIcon className="w-4 h-4 text-slate-400
                group-hover:text-slate-700
                dark:group-hover:text-on-surface
                transition-colors" />
                            </div>
                        </button>

                        {/* Print button */}
                        <Can permission={'accounts.view_customuser'} >

                            <button
                                type="button"
                                onClick={() => setIsPrintModalOpen(true)}
                                aria-label="Print timesheet"
                                title="Print Timesheet Report (A4)"
                                className="w-8 h-8 flex-shrink-0 rounded-full
                            flex items-center justify-center
                            text-slate-400 hover:text-slate-700
                            hover:bg-slate-100
                            dark:hover:text-on-surface
                            dark:hover:bg-surface-container-high
                            transition-all duration-200
                            active:scale-90
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-slate-400"
                            >
                                <Printer className="w-4 h-4" />
                            </button>
                        </Can>

                        {/* Close button */}
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            aria-label="Close calendar"
                            className="w-8 h-8 flex-shrink-0 rounded-full
                                            flex items-center justify-center
                                            text-slate-400 hover:text-slate-700
                                            hover:bg-slate-100
                                            dark:hover:text-on-surface
                                            dark:hover:bg-surface-container-high
                                            transition-all duration-200
                                            active:scale-90
                                            focus-visible:outline-none focus-visible:ring-2
                                            focus-visible:ring-slate-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Location Selection Popup Modal */}
                    {isStoreDropdownOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4 animate-in fade-in duration-150">
                            <div
                                ref={storeDropdownRef}
                                className="w-full max-w-md h-[520px] max-h-[90vh] bg-white dark:bg-surface-container border border-slate-200 dark:border-outline-variant rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
                            >
                                {/* Modal Header */}
                                <div className="px-4 py-3 border-b border-slate-100 dark:border-outline-variant flex items-center justify-between bg-slate-50 dark:bg-surface-container-low shrink-0">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-amber-600" />
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-on-surface">
                                            Select Locations
                                        </h3>
                                        {selectedStoreIds.length > 0 && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                {selectedStoreIds.length} selected
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsStoreDropdownOpen(false)}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-surface-container-high transition"
                                        title="Close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Search Input Bar + Clear All */}
                                <div className="p-3 border-b border-slate-100 dark:border-outline-variant flex items-center gap-2 bg-white dark:bg-surface-container shrink-0">
                                    <Search className="w-4 h-4 text-slate-400 ml-0.5 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Search locations"
                                        value={storeSearch}
                                        onChange={(e) => setStoreSearch(e.target.value)}
                                        className="w-full text-xs bg-transparent outline-none text-slate-800 dark:text-on-surface placeholder:text-slate-400"
                                    />
                                    {storeSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setStoreSearch('')}
                                            className="text-slate-400 hover:text-slate-600 text-xs px-1"
                                            title="Clear search"
                                        >
                                            &times;
                                        </button>
                                    )}
                                    {selectedStoreIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedStoreIds([]);
                                                setSelection(null);
                                                setActiveConflict(null);
                                            }}
                                            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline shrink-0 px-1 ml-1"
                                            title="Deselect all locations"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                {/* Horizontal Quick Filter Pills with Store Type Short Code */}
                                <div className="flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-none border-b border-slate-100 dark:border-outline-variant bg-slate-50/50 dark:bg-surface-container-low shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTypeFilter('ALL')}
                                        className={`h-8 px-3.5 inline-flex items-center justify-center rounded text-xs font-bold transition-all shrink-0 ${selectedTypeFilter === 'ALL'
                                            ? 'bg-[#17191C] text-white dark:bg-amber-400 dark:text-slate-950 shadow-xs'
                                            : 'bg-slate-200/80 dark:bg-surface-container-high text-slate-600 dark:text-on-surface-variant hover:bg-slate-300'
                                            }`}
                                    >
                                        ALL
                                    </button>
                                    {availableStoreTypes.map((typeKey) => {
                                        const shortCode = STORE_TYPE_SHORT_CODES[typeKey] || typeKey;
                                        const isSelected = selectedTypeFilter === typeKey;
                                        return (
                                            <button
                                                key={typeKey}
                                                type="button"
                                                onClick={() => setSelectedTypeFilter(isSelected ? 'ALL' : typeKey)}
                                                title={typeKey.replace('_', ' ')}
                                                className={`h-8 px-3.5 inline-flex items-center justify-center rounded text-xs font-bold transition-all shrink-0 ${isSelected
                                                    ? 'bg-amber-500 text-white shadow-xs'
                                                    : 'bg-slate-200/80 dark:bg-surface-container-high text-slate-600 dark:text-on-surface-variant hover:bg-slate-300'
                                                    }`}
                                            >
                                                {shortCode}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* List with fixed container flex-1 */}
                                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-outline-variant p-2">
                                    {filteredStores.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-slate-400">
                                            No locations found matching search.
                                        </div>
                                    ) : (
                                        filteredStores.map((store) => {
                                            const isChecked = selectedStoreIds.includes(store.store_id);
                                            const storeCode = store.short_code || store.store_id;
                                            return (
                                                <label
                                                    key={store.store_id}
                                                    className="flex items-center justify-between px-2.5 py-2 rounded hover:bg-slate-50 dark:hover:bg-surface-container-high cursor-pointer transition text-xs"
                                                >
                                                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                if (isChecked) {
                                                                    setSelectedStoreIds(selectedStoreIds.filter((id) => id !== store.store_id));
                                                                } else {
                                                                    setSelectedStoreIds([...selectedStoreIds, store.store_id]);
                                                                }
                                                            }}
                                                            className="w-3.5 h-3.5 accent-[#17191C] rounded cursor-pointer shrink-0"
                                                        />
                                                        <span className="text-slate-800 dark:text-on-surface font-medium truncate">
                                                            {store.store_name}{' '}
                                                            <span className="font-bold text-amber-700 dark:text-amber-400">
                                                                {storeCode}
                                                            </span>
                                                        </span>
                                                    </div>
                                                    {store.type && (
                                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-surface-container-high text-slate-500 shrink-0 ml-2">
                                                            {STORE_TYPE_SHORT_CODES[store.type] || store.type}
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Modal Footer with Done Button */}
                                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-outline-variant flex items-center justify-between bg-slate-50 dark:bg-surface-container-low">
                                    <span className="text-xs text-slate-500 font-medium">
                                        {selectedStoreIds.length === 0 ? 'No locations selected' : `${selectedStoreIds.length} location(s) selected`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsStoreDropdownOpen(false)}
                                        className="px-5 py-3 bg-[#17191C] hover:bg-slate-800 text-white font-bold text-xs rounded transition shadow-xs"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Window Navigation Toolbar with 3 Shifts: Early Morning (12 AM – 8 AM), Daytime (8 AM – 4 PM, default), Night (4 PM – 12 AM) */}
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 dark:bg-surface-container-low border-slate-100 dark:border-outline-variant text-xs text-slate-800 dark:text-on-surface">
                        {/* Left: Previous (<) button: Early Morning when in Daytime, Daytime when in Night */}
                        <div className="w-36 flex justify-start">
                            {isDaytime && (
                                <button
                                    type="button"
                                    onClick={() => setWindowStart(EARLY_MORNING_WINDOW_START)}
                                    title="Switch to Early Morning (12 AM – 8 AM)"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container hover:bg-slate-100 text-slate-700 dark:text-on-surface font-semibold text-xs transition shadow-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Morning</span>
                                </button>
                            )}
                            {isNight && (
                                <button
                                    type="button"
                                    onClick={() => setWindowStart(DAYTIME_WINDOW_START)}
                                    title="Switch to Daytime (8 AM – 4 PM)"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container hover:bg-slate-100 text-slate-700 dark:text-on-surface font-semibold text-xs transition shadow-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Daytime</span>
                                </button>
                            )}
                        </div>

                        {/* Center: Shift Context & Active Range */}
                        <div className="text-center flex flex-col items-center justify-center whitespace-nowrap overflow-hidden min-h-[22px]">
                            <div className="text-center flex items-center justify-center whitespace-nowrap overflow-hidden min-h-[20px] w-48 relative">
                                <motion.div
                                    className="flex w-full"
                                    animate={{ x: `-${(windowStart === EARLY_MORNING_WINDOW_START ? 0 : windowStart === NIGHT_WINDOW_START ? 2 : 1) * 100}%` }}
                                    transition={{
                                        type: 'spring',
                                        stiffness: 280,
                                        damping: 30,
                                        mass: 0.9,
                                    }}
                                >
                                    <div className="w-full shrink-0 text-center text-xs font-bold px-1 text-slate-800 dark:text-on-surface whitespace-nowrap">
                                        Morning (12 AM – 8 AM)
                                    </div>
                                    <div className="w-full shrink-0 text-center text-xs font-bold px-1 text-slate-800 dark:text-on-surface whitespace-nowrap">
                                        Daytime (8 AM – 4 PM)
                                    </div>
                                    <div className="w-full shrink-0 text-center text-xs font-bold px-1 text-slate-800 dark:text-on-surface whitespace-nowrap">
                                        Night (4 PM – 12 AM)
                                    </div>
                                </motion.div>
                            </div>
                            {/* 3 mini shift indicator dots */}
                            <div className="flex items-center gap-1.5 mt-0.5">
                                {[
                                    { idx: 0, val: EARLY_MORNING_WINDOW_START, label: 'Morning' },
                                    { idx: 1, val: DAYTIME_WINDOW_START, label: 'Daytime' },
                                    { idx: 2, val: NIGHT_WINDOW_START, label: 'Night' },
                                ].map((s) => {
                                    const currentIdx = windowStart === EARLY_MORNING_WINDOW_START ? 0 : windowStart === NIGHT_WINDOW_START ? 2 : 1;
                                    return (
                                        <button
                                            key={s.idx}
                                            type="button"
                                            onClick={() => setWindowStart(s.val)}
                                            className={`h-1.5 rounded-full transition-all duration-200 ${currentIdx === s.idx ? 'w-4 bg-primary' : 'w-1.5 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400'}`}
                                            aria-label={`Jump to ${s.label}`}
                                            title={`Jump to ${s.label}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right: Next (>) button: Daytime when in Early Morning, Night when in Daytime */}
                        <div className="w-36 flex justify-end">
                            {isEarlyMorning && (
                                <button
                                    type="button"
                                    onClick={() => setWindowStart(DAYTIME_WINDOW_START)}
                                    title="Switch to Daytime (8 AM – 4 PM)"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container hover:bg-slate-100 text-slate-700 dark:text-on-surface font-semibold text-xs transition shadow-xs"
                                >
                                    <span>Daytime</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                </button>
                            )}
                            {isDaytime && (
                                <button
                                    type="button"
                                    onClick={() => setWindowStart(NIGHT_WINDOW_START)}
                                    title="Switch to Night (4 PM – 12 AM)"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container hover:bg-slate-100 text-slate-700 dark:text-on-surface font-semibold text-xs transition shadow-xs"
                                >
                                    <span>Night</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Slots Grid: Row-wise 2-column layout with continuous 3-shift horizontal strip (Morning, Daytime, Night) */}
                    <div className="p-3 transition-colors duration-200 bg-white dark:bg-surface-container overflow-hidden">
                        {(() => {
                            const SHIFT_PANELS = [
                                {
                                    key: 'early-morning',
                                    windowStart: EARLY_MORNING_WINDOW_START,
                                    col1: { name: 'Midnight', range: '12 AM – 4 AM', isDay: false },
                                    col2: { name: 'Early Morning', range: '4 AM – 8 AM', isDay: true },
                                },
                                {
                                    key: 'daytime',
                                    windowStart: DAYTIME_WINDOW_START,
                                    col1: { name: 'Morning', range: '8 AM – 12 PM', isDay: true },
                                    col2: { name: 'Afternoon', range: '12 PM – 4 PM', isDay: true },
                                },
                                {
                                    key: 'night',
                                    windowStart: NIGHT_WINDOW_START,
                                    col1: { name: 'Evening', range: '4 PM – 8 PM', isDay: false },
                                    col2: { name: 'Night', range: '8 PM – 12 AM', isDay: false },
                                },
                            ];

                            const shiftIndex = windowStart === EARLY_MORNING_WINDOW_START ? 0 : windowStart === NIGHT_WINDOW_START ? 2 : 1;

                            // Helper to retrieve status & group identifier for any 30m block
                            const getCellInfo = (panelStart: number, colGroup: number, r: number, c: number) => {
                                const hourIndex = colGroup === 0 ? r : r + 4;
                                const cellStart = panelStart + hourIndex * HOUR + c * STEP;
                                const cellEnd = cellStart + STEP;

                                const normalizedHour = Math.floor((((cellStart % DAY) + DAY) % DAY) / 60);
                                const isDaySlot = normalizedHour >= 6 && normalizedHour < 18;

                                const isSelected = selection ? intervalOverlap(cellStart, cellEnd, selection.start, selection.end) : false;
                                const isLocked = isPeriodLocked(cellStart, cellEnd);
                                const conflict = getLockedConflict(cellStart, cellEnd);

                                let groupId = `free-${cellStart}`;
                                let groupType: 'selection' | 'locked' | 'available' = 'available';

                                if (isSelected) {
                                    groupId = 'active-selection';
                                    groupType = 'selection';
                                } else if (isLocked && conflict) {
                                    groupId = `sess-${conflict.id ?? `${conflict.start}-${conflict.end}`}`;
                                    groupType = 'locked';
                                }

                                return {
                                    cellStart,
                                    cellEnd,
                                    hourIndex,
                                    isDaySlot,
                                    isSelected,
                                    isLocked,
                                    conflict,
                                    groupId,
                                    groupType,
                                };
                            };

                            // Render a single 30m block with contour-aware borders & corner radiuses
                            const render30mCell = (panelStart: number, colGroup: number, r: number, c: number) => {
                                const curr = getCellInfo(panelStart, colGroup, r, c);
                                const color = curr.groupType === 'locked'
                                    ? getSessionColor(Boolean(curr.conflict?.is_ticket), curr.conflict?.id, curr.conflict?.ticket_id, curr.cellStart)
                                    : null;

                                let connectTop = false;
                                let connectBottom = false;
                                let connectLeft = false;
                                let connectRight = false;

                                if (curr.groupType !== 'available') {
                                    // Top neighbor
                                    if (r > 0) {
                                        const top = getCellInfo(panelStart, colGroup, r - 1, c);
                                        if (top.groupId === curr.groupId) connectTop = true;
                                    }
                                    // Bottom neighbor (4 rows: 0, 1, 2, 3)
                                    if (r < 3) {
                                        const bot = getCellInfo(panelStart, colGroup, r + 1, c);
                                        if (bot.groupId === curr.groupId) connectBottom = true;
                                    }
                                    // Left neighbor
                                    if (c === 1) {
                                        const left = getCellInfo(panelStart, colGroup, r, 0);
                                        if (left.groupId === curr.groupId) connectLeft = true;
                                    }
                                    // Right neighbor
                                    if (c === 0) {
                                        const right = getCellInfo(panelStart, colGroup, r, 1);
                                        if (right.groupId === curr.groupId) connectRight = true;
                                    }
                                }

                                // Borders only on outer contours of the shape
                                const borderTop = connectTop ? 'border-t-0' : 'border-t';
                                const borderBottom = connectBottom ? 'border-b-0' : 'border-b';
                                const borderLeft = connectLeft ? 'border-l-0' : 'border-l';
                                const borderRight = connectRight ? 'border-r-0' : 'border-r';

                                // Corner radiuses only on exterior corners
                                const roundedTL = (!connectTop && !connectLeft) ? 'rounded-tl-md' : 'rounded-tl-none';
                                const roundedTR = (!connectTop && !connectRight) ? 'rounded-tr-md' : 'rounded-tr-none';
                                const roundedBL = (!connectBottom && !connectLeft) ? 'rounded-bl-md' : 'rounded-bl-none';
                                const roundedBR = (!connectBottom && !connectRight) ? 'rounded-br-md' : 'rounded-br-none';

                                const collapseClass = `${r > 0 ? '-mt-px' : ''} ${c > 0 ? '-ml-px' : ''}`;

                                let colorClass = '';
                                if (curr.groupType === 'selection') {
                                    colorClass = 'bg-yellow-300 dark:bg-yellow-400 border-yellow-500 text-yellow-950 font-semibold shadow-xs z-10';
                                } else if (curr.groupType === 'locked' && color) {
                                    const isThisViewed = Boolean(
                                        selectedSessionForView &&
                                        curr.conflict &&
                                        (Number(curr.conflict.id) === Number(selectedSessionForView.id) ||
                                            (selectedSessionForView.worklog_id && Number(curr.conflict.id) === Number(selectedSessionForView.worklog_id)))
                                    );
                                    const ringHighlight = isThisViewed ? 'ring-2 ring-amber-400 ring-offset-1 z-20 brightness-95 shadow-sm' : '';
                                    colorClass = `${color.bg} ${color.border} ${color.text} opacity-95 cursor-pointer hover:brightness-95 transition-all ${ringHighlight}`;
                                } else {
                                    colorClass = curr.isDaySlot
                                        ? 'bg-white hover:bg-amber-50/60 dark:bg-surface-container border-slate-200 dark:border-outline-variant text-slate-700 dark:text-on-surface'
                                        : 'bg-white hover:bg-indigo-50/60 dark:bg-surface-container border-slate-200 dark:border-outline-variant text-slate-700 dark:text-on-surface';
                                }

                                const getCelestialState = (cellStart: number) => {
                                    const hour = Math.floor(cellStart / 60);

                                    if (hour < 4) return "hard-moon";
                                    if (hour < 8) return "moon";
                                    if (hour < 11) return "sun";
                                    if (hour < 14) return "hard-sun";
                                    if (hour < 16) return "sun";
                                    if (hour < 20) return "moon";
                                    return "hard-moon";
                                };
                                const celestialState = getCelestialState(curr.cellStart);
                                return (
                                    <button
                                        key={`${panelStart}-${colGroup}-${r}-${c}`}
                                        type="button"
                                        onClick={(e) =>
                                            handleSegmentClick(panelStart + curr.hourIndex * HOUR, c, e)
                                        }
                                        className={`
                                            relative overflow-hidden
                                            h-14 sm:h-16
                                            min-w-0 w-full
                                            p-1.5 sm:p-2
                                            text-left
                                            flex flex-col justify-between
                                            transition-all duration-150
                                            ${borderTop} ${borderBottom}
                                            ${borderLeft} ${borderRight}
                                            ${roundedTL} ${roundedTR}
                                            ${roundedBL} ${roundedBR}
                                            ${collapseClass} ${colorClass}
                                        `}
                                    >
                                        {/* Background Sun / Moon Icon */}
                                        {curr.isDaySlot ? (
                                            <>
                                                {celestialState.includes("sun") && (
                                                    <Sun
                                                        className="absolute left-2 top-1/2 -translate-y-1/2
                                               w-4 h-4 sm:w-5 sm:h-5 text-amber-500
                                               pointer-events-none z-0"
                                                        fill={celestialState === "hard-sun" ? "currentColor" : "none"}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {celestialState.includes("moon") && (
                                                    <Moon
                                                        className="absolute left-2 top-1/2 -translate-y-1/2
                                min-w-0
                                w-4 h-4 sm:w-5 sm:h-5 text-indigo-500
                                pointer-events-none z-0"
                                                        fill={celestialState === "hard-moon" ? "currentColor" : "none"}
                                                    />
                                                )}
                                            </>
                                        )}

                                        {/* Top Header Line: Full Start & End Time */}
                                        <div className="
                                                    relative z-10
                                                    flex items-center justify-between
                                                    gap-1
                                                    w-full
                                                    whitespace-nowrap
                                                    text-[10px] sm:text-[11px]
                                                    font-bold tracking-tight
                                                ">
                                            <span className="shrink-0">
                                                {formatTime(curr.cellStart)}
                                            </span>

                                            <span className="shrink-0">
                                                {formatTime(curr.cellEnd)}
                                            </span>
                                        </div>

                                        {/* Bottom Status / Ticket Info Line */}
                                        <div className="
                                                relative z-10
                                                flex items-center justify-between
                                                gap-1
                                                min-w-0 w-full
                                                text-[9px] sm:text-[10px]
                                            ">
                                            {curr.groupType === 'locked' && color ? (
                                                <>
                                                    <div className="min-w-0 flex-1 truncate">
                                                        {curr.conflict?.is_ticket && curr.conflict?.ticket_id ? (
                                                            ticketId &&
                                                                Number(curr.conflict.ticket_id) === Number(ticketId) ? (
                                                                <span
                                                                    className={`font-black ${color.text} truncate inline-flex items-center gap-0.5`}
                                                                    title={`Ticket #${curr.conflict.ticket_id}${!isConflictEditable(curr.conflict) ? ' (Locked)' : ''}`}
                                                                >
                                                                    {!isConflictEditable(curr.conflict) && (
                                                                        <Lock className="w-2.5 h-2.5 shrink-0" />
                                                                    )}
                                                                    {curr.conflict.ticket_id}
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className={`font-black ${color.linkText} inline-flex items-center gap-0.5 truncate`}
                                                                    title={`Ticket #${curr.conflict.ticket_id} (Locked)`}
                                                                >
                                                                    <Lock className="w-2.5 h-2.5 shrink-0" />
                                                                    {curr.conflict.ticket_id}
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className={`font-semibold ${color.subtext} truncate inline-flex items-center gap-0.5`}>
                                                                {!isConflictEditable(curr.conflict) && (
                                                                    <Lock className="w-2.5 h-2.5 shrink-0" />
                                                                )}
                                                                {curr.conflict?.work_done || 'Booked'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {!isConflictEditable(curr.conflict) && (
                                                        <span
                                                            title="Locked (Unable to edit)"
                                                            className="shrink-0 flex items-center"
                                                        >
                                                            <Lock className="w-3 h-3 text-slate-400 animate-bounce" />
                                                        </span>
                                                    )}
                                                </>
                                            ) : curr.groupType === 'selection' ? (
                                                <span className="font-black text-yellow-950 truncate">
                                                    Selected
                                                </span>
                                            ) : (
                                                <span className="text-[9px] text-slate-400 font-medium truncate">
                                                    {c === 0 ? ':00–:30' : ':30–:00'}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            };

                            return (
                                <div className="overflow-hidden w-full">
                                    <motion.div
                                        className="flex w-full"
                                        animate={{ x: `-${shiftIndex * 100}%` }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 280,
                                            damping: 30,
                                            mass: 0.9,
                                        }}
                                    >
                                        {SHIFT_PANELS.map((panel) => (
                                            <div key={panel.key} className="min-w-full w-full shrink-0">
                                                <div className="grid grid-cols-2 gap-3 items-start">
                                                    {/* Column 1 */}
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center justify-between px-1 mb-1.5 text-[11px] font-bold text-slate-700 dark:text-on-surface">
                                                            <span className="flex items-center gap-1 min-w-0">
                                                                {panel.col1.isDay ? (
                                                                    <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                                                                ) : (
                                                                    <Moon className="w-3 h-3 text-indigo-500 shrink-0" />
                                                                )}
                                                                <span className="truncate">{panel.col1.name}</span>
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-slate-500 dark:text-on-surface-variant bg-slate-100 dark:bg-surface-container-high px-1.5 py-0.5 rounded shrink-0">
                                                                {panel.col1.range}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2">
                                                            {[0, 1, 2, 3].map((r) => (
                                                                <React.Fragment key={r}>
                                                                    {render30mCell(panel.windowStart, 0, r, 0)}
                                                                    {render30mCell(panel.windowStart, 0, r, 1)}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Column 2 */}
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center justify-between px-1 mb-1.5 text-[11px] font-bold text-slate-700 dark:text-on-surface">
                                                            <span className="flex items-center gap-1 min-w-0">
                                                                {panel.col2.isDay ? (
                                                                    <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                                                                ) : (
                                                                    <Moon className="w-3 h-3 text-indigo-500 shrink-0" />
                                                                )}
                                                                <span className="truncate">{panel.col2.name}</span>
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-slate-500 dark:text-on-surface-variant bg-slate-100 dark:bg-surface-container-high px-1.5 py-0.5 rounded shrink-0">
                                                                {panel.col2.range}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2">
                                                            {[0, 1, 2, 3].map((r) => (
                                                                <React.Fragment key={r}>
                                                                    {render30mCell(panel.windowStart, 1, r, 0)}
                                                                    {render30mCell(panel.windowStart, 1, r, 1)}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </motion.div>
                                </div>
                            );
                        })()}

                        {/* Interactive dynamic message & Clickable Ticket Conflict Banner (hidden during selection or when session is viewed or edited) */}
                        {!selectedSessionForView && editingSessionId === null && (activeConflict || message.error || (!selection && message.text)) && (() => {
                            const activeColor = activeConflict ? getSessionColor(Boolean(activeConflict.is_ticket), activeConflict.id, activeConflict.ticket_id, activeConflict.start) : null;
                            return (
                                <div className={`mt-3 p-2.5 rounded border text-xs flex items-start justify-between gap-2 transition-all ${activeColor
                                    ? activeColor.bannerBg
                                    : message.error
                                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                                        : 'bg-slate-50 dark:bg-surface-container-low border-slate-200 dark:border-outline-variant text-slate-600 dark:text-on-surface-variant'
                                    }`}>
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                        {!activeConflict && (message.error ? (
                                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                        ) : (
                                            <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                        ))}
                                        {activeConflict && activeColor && (
                                            <span className={`w-2.5 h-2.5 rounded-full ${activeColor.dotBg} shrink-0 mt-1 shadow-xs`} />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            {activeConflict ? (
                                                <div>
                                                    <span className="font-bold">
                                                        This time slot is already booked:
                                                    </span>{' '}
                                                    {activeConflict.is_ticket && activeConflict.ticket_id ? (
                                                        ticketId && Number(activeConflict.ticket_id) === Number(ticketId) ? (
                                                            <span className={`inline-flex items-center gap-1 font-extrabold ml-1 ${activeColor ? activeColor.text : 'text-slate-900 dark:text-white'}`}>
                                                                {!isConflictEditable(activeConflict) && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                                                                Ticket #{activeConflict.ticket_id}
                                                                {activeConflict.ticket_work_order_no ? ` (${activeConflict.ticket_work_order_no})` : ''}
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center gap-1 font-extrabold ml-1 ${activeColor ? activeColor.linkText : 'text-blue-700'}`}>
                                                                <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                                                                Ticket #{activeConflict.ticket_id}
                                                                {activeConflict.ticket_work_order_no ? ` (${activeConflict.ticket_work_order_no})` : ''}
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="font-semibold ml-1 inline-flex items-center gap-1">
                                                            {!isConflictEditable(activeConflict) && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                                                            Manual Timesheet Booking
                                                        </span>
                                                    )}
                                                    <p className={`text-[11px] mt-0.5 ${activeColor ? activeColor.subtext : 'text-slate-600 dark:text-on-surface-variant'}`}>
                                                        <span className="font-semibold">Remarks:</span>{' '}
                                                        {activeConflict.remarks || activeConflict.work_done || activeConflict.ticket_title || 'Work log recorded on ticket.'}
                                                        <span className="ml-1 opacity-75">
                                                            ({formatTime(activeConflict.start)} – {formatTime(activeConflict.end)})
                                                        </span>
                                                    </p>
                                                </div>
                                            ) : (
                                                <span>{message.text}</span>
                                            )}
                                        </div>
                                    </div>

                                    {activeConflict && (
                                        <button
                                            type="button"
                                            onClick={() => setActiveConflict(null)}
                                            className={`hover:opacity-75 text-xs font-bold px-1 ${activeColor ? activeColor.subtext : 'text-slate-600'}`}
                                            title="Dismiss"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Unscheduled / Legacy Work Logs (work logs with hours but no specific time slot) */}
                    {!selectedSessionForView && editingSessionId === null && !selection && unslottedSessions.length > 0 && (
                        <div className="mx-3 my-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>Unscheduled Logs ({unslottedSessions.length})</span>
                                    <span className="text-[10px] bg-amber-200/80 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded font-extrabold">
                                        {unslottedSessions.reduce((acc, s) => acc + (s.hours || 0), 0)}h total
                                    </span>
                                </div>
                                <span className="text-[10px] text-amber-700/80 dark:text-amber-400 font-medium">
                                    No time slot recorded
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {unslottedSessions.map((sess) => {
                                    const color = getSessionColor(sess.is_ticket, sess.id, sess.ticket_id);
                                    const locNames = (sess.locations || []).map((l) => l.short_code || l.name).join(', ');
                                    return (
                                        <div
                                            key={sess.id}
                                            onClick={() => setSelectedSessionForView(sess)}
                                            className={`border rounded p-2 flex justify-between items-center gap-2 cursor-pointer hover:brightness-95 transition text-xs ${color.cardBorder} ${color.cardBg}`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`w-2 h-2 rounded-full ${color.dotBg} shrink-0`} />
                                                    <span className="font-bold text-slate-800 dark:text-on-surface">
                                                        {sess.hours}h
                                                    </span>
                                                    {sess.is_ticket && sess.ticket_id ? (
                                                        <span className={`text-[10px] font-bold ${color.badgeBg} border px-1.5 py-0.5 rounded flex items-center gap-1`}>
                                                            Ticket #{sess.ticket_id} {sess.ticket_work_order_no ? `(${sess.ticket_work_order_no})` : ''}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                            Manual Log
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-600 dark:text-on-surface-variant truncate mt-0.5">
                                                    {sess.work_done || sess.remarks || 'No remarks recorded'} {locNames ? `· ${locNames}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">
                                                    View Details
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Booked Sessions List (hidden when a session is selected from slot or being edited) */}
                    {!selectedSessionForView && editingSessionId === null && !selection && (
                        <div className="p-3 bg-white dark:bg-surface-container border-t border-slate-200 dark:border-outline-variant">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-slate-800 dark:text-on-surface flex items-center gap-1.5">
                                    <span>Time Sheet ({sessions.length})</span>
                                    {totalBookedHours > 0 && (
                                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-surface-container-high px-1.5 py-0.5 rounded">
                                            {totalBookedHours}h total
                                        </span>
                                    )}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowManualSessions(prev => !prev)}
                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 px-2.5 py-1 rounded-md border border-gray-200 dark:border-outline-variant hover:bg-slate-50 dark:hover:bg-surface-container-high transition"
                                >
                                    {showManualSessions ? "Hide List" : "Show All"}
                                </button>
                            </div>

                            {showManualSessions && (
                                <div className="mt-2.5">
                                    {loadingDay ? (
                                        <div className="py-3 text-center text-xs text-slate-400 animate-pulse">
                                            Loading...
                                        </div>
                                    ) : sessions.length === 0 ? (
                                        <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-outline-variant rounded">
                                            No sessions booked for this date.
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {sessions.map((sess) => {
                                                const isEditingThis = sess.id === editingSessionId;
                                                const locNames = (sess.locations || [])
                                                    .map((l) => `${l.short_code || l.name}`)
                                                    .join(', ');
                                                const color = getSessionColor(sess.is_ticket, sess.id, sess.ticket_id, sess.start ?? undefined);

                                                return (
                                                    <div
                                                        key={sess.id}
                                                        onClick={() => setSelectedSessionForView(sess)}
                                                        className={`border rounded p-2.5 flex justify-between items-center gap-2 transition text-xs cursor-pointer hover:brightness-95 ${isEditingThis
                                                            ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20 shadow-xs'
                                                            : `${color.cardBorder} ${color.cardBg}`
                                                            }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`w-2.5 h-2.5 rounded-full ${color.dotBg} shrink-0 shadow-xs`} />

                                                                <span className="font-bold text-slate-800 dark:text-on-surface">
                                                                    {sess.start !== null && sess.end !== null
                                                                        ? `${formatTime(sess.start)} – ${formatTime(sess.end)}`
                                                                        : `${sess.hours}h (Unscheduled)`}
                                                                </span>

                                                                <span className="text-[10px] font-bold text-slate-600 dark:text-on-surface-variant bg-slate-100 dark:bg-surface-container-high px-1.5 py-0.2 rounded">
                                                                    {sess.hours}h
                                                                </span>

                                                                {sess.is_ticket ? (
                                                                    sess.ticket_id ? (
                                                                        ticketId && Number(sess.ticket_id) === Number(ticketId) ? (
                                                                            <span className={`text-[10px] font-bold ${color.badgeBg} border px-1.5 py-0.2 rounded flex items-center gap-1`}>
                                                                                {!canEditSession(sess) && <Lock className="w-2.5 h-2.5" />}
                                                                                Ticket {sess.ticket_id}
                                                                            </span>
                                                                        ) : (
                                                                            <span
                                                                                className={`text-[10px] font-bold ${color.badgeBg} border px-1.5 py-0.2 rounded flex items-center gap-1`}
                                                                                title="Ticket Session (editable only from ticket)"
                                                                            >
                                                                                <Lock className="w-2.5 h-2.5" />
                                                                                Ticket {sess.ticket_id}
                                                                            </span>
                                                                        )
                                                                    ) : (
                                                                        <span className={`text-[10px] font-bold ${color.badgeBg} border px-1.5 py-0.2 rounded flex items-center gap-0.5`}>
                                                                            {!canEditSession(sess) && <Lock className="w-2.5 h-2.5" />}
                                                                            Ticket
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    !canEditSession(sess) ? (
                                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-surface-container border border-slate-300 dark:border-outline-variant px-1.5 py-0.2 rounded flex items-center gap-1">
                                                                            <Lock className="w-2.5 h-2.5" />
                                                                            Booked
                                                                        </span>
                                                                    ) : (
                                                                        <></>
                                                                    )
                                                                )}
                                                            </div>

                                                            <p className="text-[11px] text-slate-500 dark:text-on-surface-variant truncate mt-0.5">
                                                                {locNames || 'Store'} {sess.remarks || sess.work_done ? `· ${sess.remarks || sess.work_done}` : ''}
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                            {canEditSession(sess) ? (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleStartEdit(sess)}
                                                                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs transition"
                                                                        title="Edit"
                                                                    >
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteSession(sess.worklog_id)}
                                                                        title="Delete"
                                                                        className="p-2 rounded-lg border border-slate-200 hover:border-rose-300 text-rose-600 text-xs transition"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span
                                                                    className="p-2 text-slate-400 flex items-center justify-center"
                                                                    title={
                                                                        sess.is_claimed
                                                                            ? 'Claimed work log (cannot be modified)'
                                                                            : sess.is_ticket
                                                                                ? (ticketId && Number(sess.ticket_id) === Number(ticketId)
                                                                                    ? `Ticket #${sess.ticket_id} (locked)`
                                                                                    : `Ticket #${sess.ticket_id} (editable only from ticket)`)
                                                                                : 'Booked Session (editable only from dashboard)'
                                                                    }
                                                                >
                                                                    <Lock className="w-4 h-4 text-slate-400" />
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

                {/* Docked Full-Width Bottom Bar Tied with Modal UI */}
                {(selection || selectedSessionForView) && (
                    <div className="w-full shrink-0 border-t border-slate-800 bg-[#17191C] text-white p-3 space-y-2.5 animate-in slide-in-from-bottom-2 duration-150">
                        {selectedSessionForView ? (
                            <>
                                {/* Created Session Header: Time range, Duration, Ticket link (if any), & Close (X) button */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 leading-none">
                                                {selectedSessionForView.is_ticket ? 'Ticket Session' : 'Booked Session'}
                                            </span>
                                            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                                {selectedSessionForView.start !== null && selectedSessionForView.end !== null
                                                    ? formatDuration(selectedSessionForView.end - selectedSessionForView.start)
                                                    : `${selectedSessionForView.hours}h`}
                                            </span>
                                            {selectedSessionForView.is_ticket && selectedSessionForView.ticket_id ? (
                                                ticketId && Number(selectedSessionForView.ticket_id) === Number(ticketId) ? (
                                                    <span className="text-[10px] font-bold bg-white/10 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                                        {!canEditSession(selectedSessionForView) && <Lock className="w-2.5 h-2.5" />}
                                                        Ticket #{selectedSessionForView.ticket_id}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold bg-white/10 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                                        <Lock className="w-2.5 h-2.5" />
                                                        Ticket #{selectedSessionForView.ticket_id}
                                                    </span>
                                                )
                                            ) : (
                                                !canEditSession(selectedSessionForView) && (
                                                    <span className="text-[10px] font-bold bg-white/10 text-slate-300 border border-white/20 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                                        <Lock className="w-2.5 h-2.5" />
                                                        Locked
                                                    </span>
                                                )
                                            )}
                                        </div>
                                        <span className="font-extrabold text-sm text-white mt-1 block truncate">
                                            {selectedSessionForView.start !== null && selectedSessionForView.end !== null
                                                ? `${formatTime(selectedSessionForView.start)} – ${formatTime(selectedSessionForView.end)}`
                                                : `${selectedSessionForView.hours}h`}
                                        </span>
                                    </div>

                                    {/* X button for clear */}
                                    {/* {canEditSession(selectedSessionForView)
                                        &&

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const sess = selectedSessionForView;
                                                setSelectedSessionForView(null);
                                                await handleDeleteSession(sess.worklog_id);
                                            }}
                                            className="h-9 w-9 flex items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-rose-500/20 text-rose-400 transition shrink-0"
                                            title="Delete Session"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    } */}


                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedSessionForView(null);
                                            setActiveConflict(null);
                                        }}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition"
                                        title="Close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Location Details */}
                                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-white/5 border border-white/10 text-xs">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
                                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        {(() => {
                                            const locs = (selectedSessionForView.locations && selectedSessionForView.locations.length > 0)
                                                ? selectedSessionForView.locations
                                                : (selectedSessionForView.locationIds || []).map((id) => {
                                                    const s = stores.find((st) => st.store_id === id);
                                                    return {
                                                        id,
                                                        name: s?.store_name || id,
                                                        short_code: s?.short_code || id,
                                                    };
                                                });
                                            if (locs.length === 0) {
                                                return (
                                                    <span className="text-[11px] font-medium text-slate-400 truncate">
                                                        No locations specified
                                                    </span>
                                                );
                                            }
                                            return locs.map((loc) => (
                                                <span
                                                    key={loc.id}
                                                    title={loc.name}
                                                    className="h-6 inline-flex items-center gap-1 px-2 text-[11px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 rounded-md shrink-0 shadow-xs"
                                                >
                                                    <span>{loc.short_code || loc.name}</span>
                                                </span>
                                            ));
                                        })()}
                                    </div>
                                </div>

                                {/* Remarks & Action (Edit) button */}
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0 bg-white/10 border border-white/20 text-white text-xs rounded px-3 py-2">
                                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                                            Remarks
                                        </span>
                                        <span className="font-semibold text-xs text-white block truncate mt-0.5">
                                            {selectedSessionForView.remarks || selectedSessionForView.work_done || selectedSessionForView.ticket_title || 'No remarks recorded'}
                                        </span>
                                    </div>

                                    {canEditSession(selectedSessionForView) ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const sess = selectedSessionForView;
                                                    setSelectedSessionForView(null);
                                                    handleStartEdit(sess);
                                                }}
                                                className="h-9 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded transition shadow-xs flex items-center gap-1.5 active:scale-95 shrink-0"
                                                title="Edit Session"
                                            >
                                                <Edit2 className="w-3.5 h-3.5 text-slate-950 shrink-0" />
                                                <span>Edit</span>
                                            </button>

                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => {
                                                if (selectedSessionForView.is_claimed) return;
                                                const logId = selectedSessionForView.worklog_id || selectedSessionForView.id;
                                                const dateKey = selectedSessionForView.dateKey || selectedSessionForView.work_date || selectedDateKey;
                                                if (selectedSessionForView.ticket_id) {
                                                    if (ticketId && Number(selectedSessionForView.ticket_id) === Number(ticketId)) {
                                                        return;
                                                    }
                                                    onClose();
                                                    navigate(`/tickets/all?ticket_id=${selectedSessionForView.ticket_id}&log=${logId}`);
                                                } else {
                                                    onClose();
                                                    navigate(`/dashboard?log=${logId}&date=${dateKey}&timesheet=true`);
                                                }
                                            }}
                                            className={`h-9 px-3 bg-white/10 border border-white/20 text-slate-300 font-semibold text-xs rounded flex items-center gap-1.5 shrink-0 ${!selectedSessionForView.is_claimed ? 'hover:bg-white/20 cursor-pointer' : ''}`}
                                        >
                                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                                            <span>
                                                {selectedSessionForView.is_claimed
                                                    ? 'Claimed (Locked)'
                                                    : selectedSessionForView.is_ticket
                                                        ? (ticketId && Number(selectedSessionForView.ticket_id) === Number(ticketId)
                                                            ? `Ticket #${selectedSessionForView.ticket_id} (Locked)`
                                                            : `Edit From Ticket`)
                                                        : 'Edit from dashboard'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : selection ? (
                            <>
                                {/* Current Selection Period, Duration, & X Button */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 leading-none">
                                                {editingSessionId !== null ? 'Editing Session' : 'Current Selection'}
                                            </span>
                                            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                                {formatDuration(selection.end - selection.start)}
                                            </span>
                                        </div>
                                        <span className="font-extrabold text-sm text-white mt-1 block truncate">
                                            {formatTime(selection.start)} – {formatTime(selection.end)}
                                        </span>
                                    </div>
                                    {editingSessionId !== null && (
                                        <>
                                            {(() => {
                                                const sess = sessions.find((s) => s.id === editingSessionId);
                                                if (sess && canEditSession(sess)) {
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                await handleDeleteSession(sess.worklog_id);
                                                            }}
                                                            className="h-9 w-9 flex items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-rose-500/20 text-rose-400 transition shrink-0"
                                                            title="Delete Session"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    );
                                                }
                                                return null;
                                            })()}

                                        </>
                                    )}

                                    {/* X button for clear */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (editingSessionId !== null) {
                                                handleCancelEdit();
                                            } else {
                                                setSelection(null);
                                                setActiveConflict(null);
                                                setMessage({ text: 'Selection cleared.' });
                                            }
                                        }}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition"
                                        title={editingSessionId !== null ? 'Cancel edit' : 'Clear selection'}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Location Selector Option (Hidden or Locked to Ticket Location) */}
                                {lockLocation ? (
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-xs">
                                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            {/* <span className="text-[10px] text-slate-400 font-medium">Location:</span> */}
                                            <span className="h-6 inline-flex items-center gap-1 px-2 text-[11px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 rounded-md shrink-0 shadow-xs">
                                                {(() => {
                                                    const s = stores.find((st) => st.store_id === fixedLocationId);
                                                    return s?.short_code || s?.store_name || fixedLocationName || fixedLocationId || 'Ticket Location';
                                                })()}
                                            </span>
                                        </div>
                                        <span title="Locked to ticket location">
                                            <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-white/5 border border-white/10 text-xs">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
                                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                            {selectedStoreIds.length === 0 ? (
                                                <span className="text-[11px] font-medium text-slate-400 truncate">
                                                    No location selected
                                                </span>
                                            ) : (
                                                selectedStoreIds.map((id) => {
                                                    const s = stores.find((st) => st.store_id === id);
                                                    if (!s) return null;
                                                    const code = s.short_code || s.store_id;
                                                    return (
                                                        <span
                                                            key={id}
                                                            title={s.store_name}
                                                            className="h-6 inline-flex items-center gap-1 px-2 text-[11px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 rounded-md shrink-0 shadow-xs"
                                                        >
                                                            <span>{code}</span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedStoreIds(selectedStoreIds.filter((sid) => sid !== id));
                                                                }}
                                                                className="text-slate-400 hover:text-rose-400 font-bold ml-0.5 leading-none text-xs"
                                                                title={`Remove ${s.store_name}`}
                                                            >
                                                                &times;
                                                            </button>
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setIsStoreDropdownOpen(true)}
                                            className={`h-7 inline-flex items-center gap-1 px-3 text-xs font-bold rounded-lg transition active:scale-95 shrink-0 ${selectedStoreIds.length === 0
                                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-xs'
                                                : 'text-amber-300 bg-white/10 hover:bg-white/15 border border-amber-400/40'
                                                }`}
                                            title={selectedStoreIds.length === 0 ? 'Select locations' : 'Edit locations'}
                                        >
                                            {selectedStoreIds.length === 0 ? (
                                                <>
                                                    <MapPin className="w-3 h-3 text-slate-950 shrink-0" />
                                                    <span>Select Location</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Edit2 className="w-3 h-3 text-amber-400 shrink-0" />
                                                    <span>Edit</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Remarks input (required) + Add/Update Session button */}
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={remarksInputRef}
                                        type="text"
                                        required
                                        placeholder="Remarks (required)..."
                                        value={remarks}
                                        onChange={(e) => setRemarks(e.target.value)}
                                        onFocus={() => {
                                            setTimeout(() => {
                                                remarksInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                            }, 250);
                                        }}
                                        onClick={() => {
                                            setTimeout(() => {
                                                remarksInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                            }, 250);
                                        }}
                                        className="flex-1 bg-white/10 border border-white/20 focus:border-amber-400 focus:bg-white/15 text-white placeholder:text-slate-400 text-xs rounded px-3 py-2 outline-none transition"
                                    />

                                    <button
                                        type="button"
                                        disabled={saving || !remarks.trim() || (selectedStoreIds.length === 0 && !fixedLocationId)}
                                        onClick={handleSaveSession}
                                        className={`font-black text-xs px-4 py-2 rounded transition shadow-xs flex items-center gap-1 shrink-0 ${!remarks.trim() || (selectedStoreIds.length === 0 && !fixedLocationId) || saving
                                            ? 'bg-amber-400/40 text-slate-900/50 cursor-not-allowed'
                                            : 'bg-amber-400 hover:bg-amber-300 text-slate-950 active:scale-95'
                                            }`}
                                        title={
                                            selectedStoreIds.length === 0 && !fixedLocationId
                                                ? 'Location is required to save session'
                                                : !remarks.trim()
                                                    ? 'Remarks are required to save session'
                                                    : undefined
                                        }
                                    >
                                        {saving ? 'Saving...' : editingSessionId !== null ? 'Update' : '+ Add Log'}
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                )}

                {/* Calendar Date Picker Popup Modal */}
                {isCalendarOpen && (
                    <div
                        onClick={handleCloseCalendarPopup}
                        className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-surface-container border border-slate-200 dark:border-outline-variant rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                        >
                            <div className="bg-[#17191C] text-white px-4 py-3 flex justify-between items-center">
                                <div className="flex items-center gap-2 min-w-0">
                                    <CalendarIcon className="w-4 h-4 text-amber-400 shrink-0" />
                                    <h3 className="font-bold text-xs text-white truncate">
                                        {workerName ? `${workerName}'s Timesheet` : 'Select Date'}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">

                                    <button
                                        type="button"
                                        onClick={handleCloseCalendarPopup}
                                        className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm cursor-pointer"
                                    >
                                        &times;
                                    </button>
                                </div>
                            </div>

                            <div className="px-3 py-2 bg-slate-50 dark:bg-surface-container border-b border-slate-100 dark:border-outline-variant flex justify-between items-center text-xs">
                                <button
                                    type="button"
                                    disabled={(() => {
                                        if (!minDateKey) return false;
                                        const [minY, minM] = minDateKey.split('-').map(Number);
                                        return calendarViewYear < minY || (calendarViewYear === minY && calendarViewMonth <= minM - 1);
                                    })()}
                                    onClick={() => {
                                        if (minDateKey) {
                                            const [minY, minM] = minDateKey.split('-').map(Number);
                                            const isBeforeOrEqualMin = calendarViewYear < minY || (calendarViewYear === minY && calendarViewMonth <= minM - 1);
                                            if (isBeforeOrEqualMin) return;
                                        }
                                        let newMonth = calendarViewMonth - 1;
                                        let newYear = calendarViewYear;
                                        if (newMonth < 0) {
                                            newMonth = 11;
                                            newYear--;
                                        }
                                        setCalendarViewMonth(newMonth);
                                        setCalendarViewYear(newYear);
                                    }}
                                    className={`border border-slate-200 bg-white rounded-lg p-1 font-bold ${(() => {
                                        if (!minDateKey) return 'hover:bg-slate-100 text-slate-700';
                                        const [minY, minM] = minDateKey.split('-').map(Number);
                                        const isBeforeOrEqualMin = calendarViewYear < minY || (calendarViewYear === minY && calendarViewMonth <= minM - 1);
                                        return isBeforeOrEqualMin ? 'opacity-30 cursor-not-allowed text-slate-300' : 'hover:bg-slate-100 text-slate-700';
                                    })()}`}
                                >
                                    &lt;
                                </button>
                                <span className="font-bold text-slate-800 dark:text-on-surface">
                                    {firstDayOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                    type="button"
                                    disabled={(() => {
                                        const now = new Date();
                                        return calendarViewYear > now.getFullYear() || (calendarViewYear === now.getFullYear() && calendarViewMonth >= now.getMonth());
                                    })()}
                                    onClick={() => {
                                        const now = new Date();
                                        const isCurrentOrFuture = calendarViewYear > now.getFullYear() || (calendarViewYear === now.getFullYear() && calendarViewMonth >= now.getMonth());
                                        if (isCurrentOrFuture) return;
                                        let newMonth = calendarViewMonth + 1;
                                        let newYear = calendarViewYear;
                                        if (newMonth > 11) {
                                            newMonth = 0;
                                            newYear++;
                                        }
                                        setCalendarViewMonth(newMonth);
                                        setCalendarViewYear(newYear);
                                    }}
                                    className={`border border-slate-200 bg-white rounded-lg p-1 font-bold ${(() => {
                                        const now = new Date();
                                        const isCurrentOrFuture = calendarViewYear > now.getFullYear() || (calendarViewYear === now.getFullYear() && calendarViewMonth >= now.getMonth());
                                        return isCurrentOrFuture ? 'opacity-30 cursor-not-allowed text-slate-300' : 'hover:bg-slate-100 text-slate-700';
                                    })()}`}
                                >
                                    &gt;
                                </button>
                            </div>

                            <div className="grid grid-cols-7 gap-1 px-3 pt-2 text-center text-[9px] font-bold text-slate-400 uppercase">
                                <div>Sun</div>
                                <div>Mon</div>
                                <div>Tue</div>
                                <div>Wed</div>
                                <div>Thu</div>
                                <div>Fri</div>
                                <div>Sat</div>
                            </div>

                            <div className="grid grid-cols-7 gap-1 p-3">
                                {Array.from({ length: startWeekday }).map((_, i) => (
                                    <div key={`empty-${i}`} className="h-10" />
                                ))}

                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const cellDate = new Date(calendarViewYear, calendarViewMonth, day);
                                    const cellKey = toDateKey(cellDate);
                                    const isFuture = cellKey > todayKey;
                                    const isBeforeMin = minDateKey ? cellKey < minDateKey : false;

                                    // Hide day selection of tomorrow and future days, as well as days before ticket approval
                                    if (isFuture || isBeforeMin) {
                                        return <div key={cellKey} className="h-11" />;
                                    }

                                    const isSelected = cellKey === selectedDateKey;
                                    const isToday = cellKey === todayKey;
                                    const dayStat = monthDaysStats[cellKey];
                                    const pct = dayStat ? dayStat.completion_percentage : 0;
                                    const badgeClass = getCompletionBadgeClasses(pct);

                                    return (
                                        <button
                                            key={cellKey}
                                            type="button"
                                            onClick={() => {
                                                setSelectedDateKey(cellKey);
                                                setHasSelectedDay(true);
                                                setSelection(null);
                                                setActiveConflict(null);
                                                setSelectedSessionForView(null);
                                                setEditingSessionId(null);
                                                setWindowStart(DAY_WINDOW_START);
                                                setIsCalendarOpen(false);
                                            }}
                                            className={`h-11 rounded border p-1 flex flex-col justify-between items-center transition bg-white ${isSelected
                                                ? 'ring-2 ring-[#17191C] font-extrabold shadow-sm'
                                                : 'border-slate-200 hover:opacity-90'
                                                }`}
                                        >
                                            <div className="w-full flex justify-between items-center px-0.5">
                                                <span className="text-[11px] font-bold text-slate-800">
                                                    {day}
                                                </span>
                                                {isToday && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Today" />
                                                )}
                                            </div>
                                            <span className={`text-[8px] font-extrabold px-1 rounded-md w-full text-center border ${badgeClass}`}>
                                                {pct}%
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="px-3 py-2 bg-slate-50 dark:bg-surface-container-low border-t border-slate-100 flex justify-between items-center text-xs">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const target = (minDateKey && todayKey < minDateKey) ? minDateKey : todayKey;
                                        setSelectedDateKey(target);
                                        setCalendarViewYear(new Date().getFullYear());
                                        setCalendarViewMonth(new Date().getMonth());
                                        setSelection(null);
                                        setActiveConflict(null);
                                        setSelectedSessionForView(null);
                                        setEditingSessionId(null);
                                        setWindowStart(DAY_WINDOW_START);
                                        setIsCalendarOpen(false);
                                    }}
                                    className="font-bold text-amber-700 hover:underline text-[11px]"
                                >
                                    Select Today
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCalendarOpen(false)}
                                    className="bg-[#17191C] text-white text-[11px] font-semibold px-3 py-1.5 rounded shadow-xs"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Timesheet Print & View Modal */}
                {isPrintModalOpen && (
                    <TimesheetPrintModal
                        isOpen={isPrintModalOpen}
                        onClose={() => setIsPrintModalOpen(false)}
                        workerId={workerId || 0}
                        workerName={workerName || 'Employee'}
                        employeeNo={employeeNo}
                        workerRole={workerRole}
                        workerRate={workerRate}
                        subDepartments={subDepartments}
                        initialFromDate={(() => {
                            const dt = parseDateKey(selectedDateKey);
                            const y = dt.getFullYear();
                            const m = String(dt.getMonth() + 1).padStart(2, '0');
                            return `${y}-${m}-01`;
                        })()}
                        initialToDate={selectedDateKey}
                    />
                )}
            </div>
        </div>
    );
};
