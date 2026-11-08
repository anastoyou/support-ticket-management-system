import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import {
    Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
    X, MapPin, Edit2, Search, Lock, AlertCircle, Trash2,
    ExternalLink, Sun, Moon
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const HOUR = 60;
const DAY = 1440;
const WINDOW_HOURS = 12;
const WINDOW_MINUTES = WINDOW_HOURS * HOUR;
const DAY_WINDOW_START = 8 * 60; // 08:00 AM (08:00 AM – 08:00 PM)
const NIGHT_WINDOW_START = 20 * 60; // 08:00 PM (08:00 PM – 08:00 AM)
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
    start: number;
    end: number;
    is_ticket: boolean;
    ticket_id?: number | null;
    ticket_work_order_no?: string | null;
    ticket_title?: string | null;
    remarks?: string;
    work_done?: string;
}

interface TimeSheetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSessionsUpdated?: () => void;
    initialDate?: string;
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

function getCompletionBadgeClasses(percent: number) {
    if (percent <= 0) return 'bg-slate-100 text-slate-600 border-slate-200';
    if (percent < 40) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (percent < 85) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
}

export const TimeSheetModal: React.FC<TimeSheetModalProps> = ({
    isOpen,
    onClose,
    onSessionsUpdated,
    initialDate
}) => {
    const { token } = useSelector((state: RootState) => state.auth);

    const todayKey = useMemo(() => toDateKey(new Date()), []);
    const [selectedDateKey, setSelectedDateKey] = useState<string>(initialDate || todayKey);

    // Month picker calendar popup state
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarViewYear, setCalendarViewYear] = useState<number>(new Date().getFullYear());
    const [calendarViewMonth, setCalendarViewMonth] = useState<number>(new Date().getMonth());
    const [monthDaysStats, setMonthDaysStats] = useState<Record<string, { total_hours: number; completion_percentage: number }>>({});

    // Available Stores (by default 0 selected)
    const [stores, setStores] = useState<StoreItem[]>([]);
    const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
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

    // Interactive Slots Grid & Window
    const [windowStart, setWindowStart] = useState<number>(DAY_WINDOW_START); // 8:00 AM (Day) or 8:00 PM (Night)
    const isNight = windowStart >= NIGHT_WINDOW_START;
    const [remarks, setRemarks] = useState('');
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

    // Edit Mode
    const [editingSessionId, setEditingSessionId] = useState<number | null>(null);

    // Mobile Virtual Keyboard Height Tracking (visualViewport)
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
    const remarksInputRef = useRef<HTMLInputElement>(null);

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
                    // By default do not select any locations
                }
            } catch (err) {
                console.error('Failed to fetch stores:', err);
            }
        };
        fetchStores();
    }, [isOpen, token]);

    // Fetch Timesheet for selectedDateKey
    const fetchDayTimesheet = useCallback(async () => {
        if (!isOpen || !token) return;
        setLoadingDay(true);
        try {
            const res = await fetch(`${API_URL}/maintenance/worklog/timesheet/?date=${selectedDateKey}`, {
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
    }, [isOpen, token, selectedDateKey]);

    useEffect(() => {
        fetchDayTimesheet();
    }, [fetchDayTimesheet]);

    // Fetch Month Calendar completion stats
    const fetchMonthStats = useCallback(async (year: number, month: number) => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/maintenance/worklog/timesheet_calendar/?year=${year}&month=${month + 1}`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setMonthDaysStats(data.days || {});
            }
        } catch (err) {
            console.error('Failed to fetch month timesheet stats:', err);
        }
    }, [token]);

    useEffect(() => {
        if (isCalendarOpen) {
            fetchMonthStats(calendarViewYear, calendarViewMonth);
        }
    }, [isCalendarOpen, calendarViewYear, calendarViewMonth, fetchMonthStats]);

    // Effective Locked Intervals for current date (with rich ticket details & remarks)
    const effectiveLockedIntervals = useMemo<LockedConflictInfo[]>(() => {
        const intervals: LockedConflictInfo[] = [];
        sessions.forEach((s) => {
            if (s.id === editingSessionId) return;
            if (s.start !== null && s.end !== null) {
                intervals.push({
                    start: s.start,
                    end: s.end,
                    is_ticket: s.is_ticket,
                    ticket_id: s.ticket_id,
                    ticket_work_order_no: s.ticket_work_order_no,
                    ticket_title: s.ticket_title,
                    remarks: s.remarks,
                    work_done: s.work_done,
                });
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
        if (!selectedStoreIds.length) {
            setMessage({ text: 'Please select a store first.', error: true });
            return;
        }

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

        if (!selectedStoreIds.length) {
            setMessage({ text: 'Please select a store first.', error: true });
            return;
        }

        const segStart = slotStart + pIndex * STEP;
        const segEnd = segStart + STEP;

        // If locked -> surface the ticket number, remark & clickable link!
        const conflict = getLockedConflict(segStart, segEnd);
        if (conflict) {
            setActiveConflict(conflict);
            setMessage({
                text: `This time slot is already booked: Ticket #${conflict.ticket_id || 'N/A'} — ${conflict.remarks || conflict.work_done || conflict.ticket_title || 'Work log recorded'}`,
                error: true
            });
            return;
        }

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
        if (!selectedStoreIds.length) {
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
            setMessage({ text: 'Selection overlaps an existing booked session.', error: true });
            return;
        }

        const durationMinutes = end - start;
        const hoursToSend = (durationMinutes / 60).toFixed(2);
        const fromTimeStr = minutesToTimeString(start);
        const toTimeStr = minutesToTimeString(end);

        setSaving(true);
        try {
            if (editingSessionId !== null) {
                const res = await fetch(`${API_URL}/maintenance/worklog/${editingSessionId}/`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Token ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        work_date: selectedDateKey,
                        from_time: fromTimeStr,
                        to_time: toTimeStr,
                        hours: hoursToSend,
                        stores: selectedStoreIds,
                        work_done: remarks,
                    }),
                });
                if (res.ok) {
                    setMessage({ text: 'Session updated.' });
                    setEditingSessionId(null);
                    setSelection(null);
                    setActiveConflict(null);
                    setRemarks('');
                    await fetchDayTimesheet();
                    if (onSessionsUpdated) onSessionsUpdated();
                } else {
                    const errData = await res.json();
                    setMessage({ text: errData.detail || 'Failed to update.', error: true });
                }
            } else {
                const res = await fetch(`${API_URL}/maintenance/worklog/`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Token ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        work_date: selectedDateKey,
                        from_time: fromTimeStr,
                        to_time: toTimeStr,
                        hours: hoursToSend,
                        stores: selectedStoreIds,
                        work_done: remarks || 'Timesheet Log',
                        log_type: 'timesheet',
                    }),
                });
                if (res.ok) {
                    setMessage({ text: 'Session booked successfully.' });
                    setSelection(null);
                    setActiveConflict(null);
                    setRemarks('');
                    await fetchDayTimesheet();
                    if (onSessionsUpdated) onSessionsUpdated();
                } else {
                    const errData = await res.json();
                    setMessage({ text: errData.detail || errData.hours || 'Failed to save.', error: true });
                }
            }
        } catch (err) {
            console.error('Error saving session:', err);
            setMessage({ text: 'Server communication error.', error: true });
        } finally {
            setSaving(false);
        }
    };

    const handleStartEdit = (session: BookedSession) => {
        if (session.is_locked || session.is_ticket) return;
        setEditingSessionId(session.id);
        setRemarks(session.work_done || '');
        if (session.locationIds.length > 0) {
            setSelectedStoreIds(session.locationIds);
        }

        if (session.start !== null && session.end !== null) {
            const isNightSession = session.start >= NIGHT_WINDOW_START;
            setWindowStart(isNightSession ? NIGHT_WINDOW_START : DAY_WINDOW_START);

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
        }
    };

    const handleCancelEdit = () => {
        setEditingSessionId(null);
        setSelection(null);
        setActiveConflict(null);
        setRemarks('');
        setMessage({ text: 'Edit cancelled.' });
    };

    const handleDeleteSession = async (worklogId: number) => {
        if (!confirm('Delete this booked timesheet session?')) return;
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
                    setActiveConflict(null);
                }
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
            className={`fixed inset-0 z-50 flex justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto transition-all duration-150 ${keyboardHeight > 0 ? 'items-end' : 'items-center'
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

                        {/* Close button */}
                        <button
                            type="button"
                            onClick={onClose}
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

                    {/* Store Selector - Compact One-Line Bar */}
                    <div className="px-3 py-2 bg-slate-50 dark:bg-surface-container-low border-b border-slate-100 dark:border-outline-variant flex items-center justify-between gap-2 text-xs min-h-[44px]">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                            <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                            {selectedStoreIds.length === 0 ? (
                                <span className="text-slate-400 font-medium truncate">
                                    No location selected
                                </span>
                            ) : (
                                <>

                                    {/* One-line horizontal list of short codes in brackets */}
                                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                                        {selectedStoreIds.map((id) => {
                                            const s = stores.find((st) => st.store_id === id);
                                            if (!s) return null;
                                            const code = s.short_code || s.store_id;
                                            return (
                                                <span
                                                    key={id}
                                                    title={s.store_name}
                                                    className="h-7 inline-flex items-center gap-1.5 px-2.5 text-xs font-bold bg-white dark:bg-surface-container text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 rounded-lg shrink-0 shadow-xs"
                                                >
                                                    <span>{code}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedStoreIds(selectedStoreIds.filter((sid) => sid !== id));
                                                        }}
                                                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 leading-none text-xs"
                                                        title={`Remove ${s.store_name}`}
                                                    >
                                                        &times;
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Action button in the same line */}
                        <button
                            type="button"
                            onClick={() => setIsStoreDropdownOpen(true)}
                            className="h-7 inline-flex items-center gap-1 px-3 text-xs font-bold text-amber-800 dark:text-amber-300 bg-white hover:bg-amber-50 dark:bg-surface-container border border-slate-200 dark:border-outline-variant rounded-lg transition shadow-xs shrink-0"
                            title={selectedStoreIds.length === 0 ? 'Select locations' : 'Edit locations'}
                        >
                            {selectedStoreIds.length === 0 ? (
                                <>
                                    <span>+ Select</span>
                                </>
                            ) : (
                                <>
                                    <Edit2 className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                                    <span>Edit</span>
                                </>
                            )}
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
                                        className={`h-8 px-3.5 inline-flex items-center justify-center rounded-xl text-xs font-bold transition-all shrink-0 ${selectedTypeFilter === 'ALL'
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
                                                className={`h-8 px-3.5 inline-flex items-center justify-center rounded-xl text-xs font-bold transition-all shrink-0 ${isSelected
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
                                                    className="flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-surface-container-high cursor-pointer transition text-xs"
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
                                                                [{storeCode}]
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
                                {/* <div className="px-4 py-2.5 border-t border-slate-100 dark:border-outline-variant flex items-center justify-between bg-slate-50 dark:bg-surface-container-low">
                                    <span className="text-xs text-slate-500 font-medium">
                                        {selectedStoreIds.length === 0 ? 'No locations selected' : `${selectedStoreIds.length} location(s) selected`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsStoreDropdownOpen(false)}
                                        className="px-4 py-1.5 bg-[#17191C] hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition shadow-xs"
                                    >
                                        Done
                                    </button>
                                </div> */}
                            </div>
                        </div>
                    )}

                    {selectedStoreIds.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 px-6 text-center bg-white dark:bg-surface-container">
                            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3 shadow-xs">
                                <MapPin className="w-8 h-8" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-on-surface mb-1">
                                No Location Selected
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-on-surface-variant max-w-xs mb-4">
                                Please select at least one location to view time slots and log your timesheet.
                            </p>
                            <button
                                type="button"
                                onClick={() => setIsStoreDropdownOpen(true)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#17191C] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <MapPin className="w-4 h-4 text-amber-400" />
                                <span>Select Location</span>
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Window Navigation Toolbar with Single-Direction Toggle */}
                            <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 dark:bg-surface-container-low border-slate-100 dark:border-outline-variant text-xs text-slate-800 dark:text-on-surface">
                                {/* Left: Previous (<) button ONLY shown if currently in Night mode */}
                                <div className="w-28 flex justify-start">
                                    {isNight ? (
                                        <button
                                            type="button"
                                            onClick={() => setWindowStart(DAY_WINDOW_START)}
                                            title="Switch to Day Window (08:00 AM – 08:00 PM)"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container hover:bg-slate-100 text-slate-700 dark:text-on-surface font-semibold text-xs transition shadow-xs"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                                            <span>Day</span>
                                        </button>
                                    ) : (
                                        <></>
                                    )}
                                </div>

                                {/* Center: Clean Range label (strictly 08:00 AM – 08:00 PM or 08:00 PM – 08:00 AM) */}
                                <div className="text-center flex items-center justify-center">
                                    <span className="text-xs font-bold px-1 text-slate-800 dark:text-on-surface">
                                        {formatTime(windowStart)} – {formatTime(windowStart + WINDOW_MINUTES)}
                                    </span>
                                </div>

                                {/* Right: Next (>) button ONLY shown if currently in Day mode */}
                                <div className="w-28 flex justify-end">
                                    {!isNight ? (
                                        <button
                                            type="button"
                                            onClick={() => setWindowStart(NIGHT_WINDOW_START)}
                                            title="Switch to Night Window (08:00 PM – 08:00 AM)"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container hover:bg-slate-100 text-slate-700 dark:text-on-surface font-semibold text-xs transition shadow-xs"
                                        >
                                            <span>Night</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                        </button>
                                    ) : (
                                        <></>
                                    )}
                                </div>
                            </div>

                            {/* Slots Grid: rounded-xl slots with clean light styling (subtle warm amber for 6 AM–6 PM, subtle cool indigo for 6 PM–6 AM) */}
                            <div className="p-3 transition-colors duration-200 bg-white dark:bg-surface-container">
                                <div className="grid grid-cols-2 gap-2.5">
                                    {Array.from({ length: WINDOW_HOURS }).map((_, index) => {
                                        const start = windowStart + index * HOUR;
                                        const end = start + HOUR;

                                        const normalizedStartHour = Math.floor((((start % DAY) + DAY) % DAY) / 60);
                                        const isDaySlot = normalizedStartHour >= 6 && normalizedStartHour < 18;

                                        const segments: { segStart: number; segEnd: number; locked: boolean; selected: boolean }[] = [];
                                        let lockedCount = 0;
                                        let selectedCount = 0;

                                        for (let p = 0; p < PARTS_COUNT; p++) {
                                            const segStart = start + p * STEP;
                                            const segEnd = segStart + STEP;
                                            const locked = isPeriodLocked(segStart, segEnd);
                                            const selected = selection
                                                ? intervalOverlap(segStart, segEnd, selection.start, selection.end)
                                                : false;

                                            if (locked) lockedCount++;
                                            if (selected) selectedCount++;
                                            segments.push({ segStart, segEnd, locked, selected });
                                        }

                                        const fullHourSelected = selectedCount === PARTS_COUNT;
                                        const partialSelected = selectedCount > 0 && !fullHourSelected;
                                        const allLocked = lockedCount === PARTS_COUNT;
                                        const slotConflict = getLockedConflict(start, end);

                                        // Colors and classes strictly matching light color scheme with subtle Day vs Night tone
                                        let borderClass = isDaySlot
                                            ? 'border-amber-200/80 bg-amber-50/20 text-slate-700 hover:border-amber-400 dark:border-amber-900/30 dark:text-on-surface'
                                            : 'border-indigo-200/80 bg-indigo-50/25 text-slate-700 hover:border-indigo-400 dark:border-indigo-900/30 dark:text-on-surface';
                                        let statusText = 'Available';
                                        let badgeColor = isDaySlot ? 'text-amber-800/70' : 'text-indigo-800/70';
                                        let circleClass = isDaySlot
                                            ? 'border-amber-200 bg-white/90 text-transparent'
                                            : 'border-indigo-200 bg-white/90 text-transparent';
                                        let circleIcon = '';

                                        if (allLocked) {
                                            borderClass = 'border-slate-300 text-slate-500 cursor-not-allowed opacity-85 dark:border-outline-variant bg-slate-50/60';
                                            statusText = slotConflict?.is_ticket && slotConflict?.ticket_id
                                                ? `Ticket #${slotConflict.ticket_id}`
                                                : 'Locked / Booked';
                                            badgeColor = 'text-slate-600 font-semibold';
                                            circleClass = 'bg-slate-300 border-slate-300 text-slate-600';
                                            circleIcon = '✕';
                                        } else if (fullHourSelected) {
                                            borderClass = 'border-yellow-400 text-yellow-950 font-semibold shadow-sm bg-yellow-50/40';
                                            statusText = 'Selected (1h)';
                                            badgeColor = 'text-yellow-900 font-bold';
                                            circleClass = 'bg-yellow-950 border-yellow-950 text-white';
                                            circleIcon = '✓';
                                        } else if (partialSelected) {
                                            borderClass = 'border-amber-400 text-amber-950 font-medium shadow-sm hover:border-amber-500 bg-amber-50/40';
                                            statusText = 'Selected (30m)';
                                            badgeColor = 'text-amber-800 font-semibold';
                                            circleClass = 'bg-amber-500 border-amber-500 text-white';
                                            circleIcon = '✓';
                                        }

                                        return (
                                            <button
                                                key={index}
                                                type="button"
                                                disabled={allLocked}
                                                onClick={() => handleSlotClick(index)}
                                                className={`group relative overflow-hidden h-16 p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 ${borderClass}`}
                                            >
                                                {/* Background Fill Segments matching xxdemo.html (yellow-300 / amber-200 / slate-200) */}
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {segments.map((seg, idx) => {
                                                        const bg = seg.locked
                                                            ? 'bg-slate-200 dark:bg-slate-700'
                                                            : seg.selected
                                                                ? fullHourSelected ? 'bg-yellow-300 dark:bg-yellow-400' : 'bg-amber-200 dark:bg-amber-400/80'
                                                                : isDaySlot ? 'bg-white dark:bg-surface-container' : 'bg-indigo-50/20 dark:bg-surface-container';
                                                        const divider = idx > 0 ? (isDaySlot ? 'border-l border-amber-200/40' : 'border-l border-indigo-200/40') : '';
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`flex-1 h-full transition-colors duration-150 ${divider} ${bg}`}
                                                            />
                                                        );
                                                    })}
                                                </div>

                                                {/* Foreground Info */}
                                                <div className="relative z-10 flex items-center justify-between text-xs font-semibold tracking-tight text-slate-800 dark:text-on-surface">
                                                    <span>{formatTime(start)} – {formatTime(end)}</span>
                                                    {isDaySlot ? (
                                                        <Sun className="w-3 h-3 text-amber-500/70 shrink-0" />
                                                    ) : (
                                                        <Moon className="w-3 h-3 text-indigo-500/70 shrink-0" />
                                                    )}
                                                </div>

                                                <div className="relative z-30 flex justify-between items-center gap-1.5">
                                                    <div className="min-w-0 flex-1 flex items-center">
                                                        {allLocked && slotConflict?.is_ticket && slotConflict?.ticket_id ? (
                                                            <div className="min-w-0 flex items-center gap-1 truncate">
                                                                <a
                                                                    href={`/tickets/all?search=${slotConflict.ticket_id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="inline-flex items-center gap-0.5 font-bold hover:underline text-[10px] shrink-0 text-amber-900 hover:text-amber-950 dark:text-amber-300"
                                                                    title={`Open Ticket #${slotConflict.ticket_id} in new tab`}
                                                                >
                                                                    Ticket #{slotConflict.ticket_id}
                                                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 ml-0.5" />
                                                                </a>
                                                                {(slotConflict.remarks || slotConflict.work_done || slotConflict.ticket_title) && (
                                                                    <span
                                                                        className="text-[9px] truncate font-normal text-slate-500 dark:text-on-surface-variant"
                                                                        title={(slotConflict.remarks || slotConflict.work_done || slotConflict.ticket_title) || undefined}
                                                                    >
                                                                        · {slotConflict.remarks || slotConflict.work_done || slotConflict.ticket_title}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className={`text-[10px] leading-tight truncate ${badgeColor}`}>
                                                                {statusText}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${circleClass}`}>
                                                        {circleIcon}
                                                    </div>
                                                </div>

                                                {/* 2-column hit targets: left half (:00–:30), right half (:30–:60) */}
                                                <div className="absolute inset-0 grid grid-cols-2 z-20">
                                                    {segments.map((seg, pIdx) => {
                                                        const segConflict = getLockedConflict(seg.segStart, seg.segEnd);
                                                        return (
                                                            <div
                                                                key={pIdx}
                                                                onClick={(e) => handleSegmentClick(start, pIdx, e)}
                                                                title={seg.locked
                                                                    ? (segConflict?.is_ticket && segConflict?.ticket_id
                                                                        ? `Booked: Ticket #${segConflict.ticket_id}${segConflict.ticket_work_order_no ? ` (${segConflict.ticket_work_order_no})` : ''} — Remarks: ${segConflict.remarks || segConflict.work_done || 'None'}`
                                                                        : 'Booked')
                                                                    : `${pIdx === 0 ? ':00 – :30' : ':30 – :00'} (${formatTime(seg.segStart)} – ${formatTime(seg.segEnd)})`}
                                                                className={`h-full transition-colors ${seg.locked ? 'cursor-pointer hover:bg-slate-400/20' : 'hover:bg-amber-400/20 cursor-pointer'}`}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Interactive dynamic message & Clickable Ticket Conflict Banner (hidden during selection to prevent duplicate display) */}
                                {(activeConflict || message.error || (!selection && message.text)) && (
                                    <div className={`mt-3 p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 transition-all ${activeConflict
                                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/40 text-amber-950 dark:text-amber-200'
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
                                            <div className="min-w-0 flex-1">
                                                {activeConflict ? (
                                                    <div>
                                                        <span className="font-bold text-amber-900 dark:text-amber-300">
                                                            This time slot is already booked:
                                                        </span>{' '}
                                                        {activeConflict.is_ticket && activeConflict.ticket_id ? (
                                                            <a
                                                                href={`/tickets/all?search=${activeConflict.ticket_id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 font-extrabold hover:underline ml-1 text-amber-800 dark:text-amber-300 hover:text-amber-950"
                                                            >
                                                                Ticket #{activeConflict.ticket_id}
                                                                {activeConflict.ticket_work_order_no ? ` (${activeConflict.ticket_work_order_no})` : ''}
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        ) : (
                                                            <span className="font-semibold ml-1 text-slate-700 dark:text-on-surface">
                                                                Manual Timesheet Booking
                                                            </span>
                                                        )}
                                                        <p className="text-[11px] mt-0.5 text-slate-600 dark:text-on-surface-variant">
                                                            <span className="font-semibold">Remarks:</span>{' '}
                                                            {activeConflict.remarks || activeConflict.work_done || activeConflict.ticket_title || 'Work log recorded on ticket.'}
                                                            <span className="ml-1 text-slate-500">
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
                                                className="text-amber-800 hover:text-amber-950 text-xs font-bold px-1"
                                                title="Dismiss"
                                            >
                                                &times;
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Booked Sessions List */}
                    <div className="p-3 bg-white dark:bg-surface-container">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold text-slate-800 dark:text-on-surface flex items-center gap-1.5">
                                Booked Sessions ({sessions.length})
                            </h3>
                            {sessions.some((s) => !s.is_ticket && !s.is_claimed) && (
                                <button
                                    type="button"
                                    onClick={handleResetAllManualSessions}
                                    className="text-[10px] font-semibold text-rose-600 hover:bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 transition"
                                >
                                    Reset Manual
                                </button>
                            )}
                        </div>

                        {loadingDay ? (
                            <div className="py-3 text-center text-xs text-slate-400 animate-pulse">
                                Loading...
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-outline-variant rounded-xl">
                                No sessions booked for this date.
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {sessions.map((sess) => {
                                    const isEditingThis = sess.id === editingSessionId;
                                    const locNames = sess.locations.map((l) => `${l.name}${l.short_code ? ` [${l.short_code}]` : ''}`).join(', ');

                                    return (
                                        <div
                                            key={sess.id}
                                            className={`border rounded-xl p-2.5 flex justify-between items-center gap-2 transition text-xs ${isEditingThis
                                                ? 'border-yellow-400 bg-yellow-50/50'
                                                : sess.is_ticket
                                                    ? 'border-slate-200 dark:border-outline-variant bg-slate-50 dark:bg-surface-container-low'
                                                    : 'border-slate-200 dark:border-outline-variant bg-white dark:bg-surface-container'
                                                }`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-slate-800 dark:text-on-surface">
                                                        {sess.start !== null && sess.end !== null
                                                            ? `${formatTime(sess.start)} – ${formatTime(sess.end)}`
                                                            : `${sess.hours}h`}
                                                    </span>

                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-on-surface-variant bg-slate-100 dark:bg-surface-container-high px-1.5 py-0.2 rounded">
                                                        {sess.hours}h
                                                    </span>

                                                    {sess.is_ticket ? (
                                                        sess.ticket_id ? (
                                                            <a
                                                                href={`/tickets/all?search=${sess.ticket_id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-1.5 py-0.2 rounded flex items-center gap-1 hover:underline transition-colors"
                                                                title="Open Ticket in new tab"
                                                            >
                                                                <Lock className="w-2.5 h-2.5" />
                                                                Ticket #{sess.ticket_id}
                                                                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                                                            </a>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                                                <Lock className="w-2.5 h-2.5" />
                                                                Ticket
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.2 rounded">
                                                            Manual
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-[11px] text-slate-500 dark:text-on-surface-variant truncate mt-0.5">
                                                    {locNames || 'Store'} {sess.remarks ? `· ${sess.remarks}` : ''}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {!sess.is_ticket && !sess.is_claimed && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleStartEdit(sess)}
                                                            className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs transition"
                                                            title="Edit"
                                                        >
                                                            <Edit2 className="w-3 h-3" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteSession(sess.worklog_id)}
                                                            title="Delete"
                                                            className="p-1 rounded-lg border border-slate-200 hover:border-rose-300 text-rose-600 text-xs transition"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </>
                                                )}

                                                {sess.is_ticket && (
                                                    <span className="text-slate-400 p-1" title="Logged from Ticket">
                                                        <Lock className="w-3 h-3" />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Docked Full-Width Bottom Bar Tied with Modal UI */}
                {selection && selectedStoreIds.length > 0 && (
                    <div className="w-full shrink-0 border-t border-slate-800 bg-[#17191C] text-white p-3 space-y-2.5 animate-in slide-in-from-bottom-2 duration-150">
                        {/* Current Selection Period, Duration, & X Button */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 leading-none">
                                        Current Selection
                                    </span>
                                    <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                        {formatDuration(selection.end - selection.start)}
                                    </span>
                                </div>
                                <span className="font-extrabold text-sm text-white mt-1 block truncate">
                                    {formatTime(selection.start)} – {formatTime(selection.end)}
                                </span>
                            </div>

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
                                title="Clear selection"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

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
                                className="flex-1 bg-white/10 border border-white/20 focus:border-amber-400 focus:bg-white/15 text-white placeholder:text-slate-400 text-xs rounded-xl px-3 py-2 outline-none transition"
                            />
                            {editingSessionId !== null && (
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl transition shrink-0"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={saving || !remarks.trim()}
                                onClick={handleSaveSession}
                                className={`font-black text-xs px-4 py-2 rounded-xl transition shadow-xs flex items-center gap-1 shrink-0 ${!remarks.trim() || saving
                                    ? 'bg-amber-400/40 text-slate-900/50 cursor-not-allowed'
                                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950 active:scale-95'
                                    }`}
                                title={!remarks.trim() ? 'Remarks are required to save session' : undefined}
                            >
                                {saving ? 'Saving...' : editingSessionId !== null ? '✓ Update & Lock' : '+ Add Session'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Calendar Date Picker Popup Modal */}
                {isCalendarOpen && (
                    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-surface-container border border-slate-200 dark:border-outline-variant rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                            <div className="bg-[#17191C] text-white px-4 py-3 flex justify-between items-center">
                                <h3 className="font-bold text-xs text-white">Select Date</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsCalendarOpen(false)}
                                    className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="px-3 py-2 bg-slate-50 dark:bg-surface-container border-b border-slate-100 dark:border-outline-variant flex justify-between items-center text-xs">
                                <button
                                    type="button"
                                    onClick={() => {
                                        let newMonth = calendarViewMonth - 1;
                                        let newYear = calendarViewYear;
                                        if (newMonth < 0) {
                                            newMonth = 11;
                                            newYear--;
                                        }
                                        setCalendarViewMonth(newMonth);
                                        setCalendarViewYear(newYear);
                                    }}
                                    className="border border-slate-200 bg-white hover:bg-slate-100 rounded-lg p-1 text-slate-700 font-bold"
                                >
                                    &lt;
                                </button>
                                <span className="font-bold text-slate-800 dark:text-on-surface">
                                    {firstDayOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        let newMonth = calendarViewMonth + 1;
                                        let newYear = calendarViewYear;
                                        if (newMonth > 11) {
                                            newMonth = 0;
                                            newYear++;
                                        }
                                        setCalendarViewMonth(newMonth);
                                        setCalendarViewYear(newYear);
                                    }}
                                    className="border border-slate-200 bg-white hover:bg-slate-100 rounded-lg p-1 text-slate-700 font-bold"
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
                                                setSelection(null);
                                                setActiveConflict(null);
                                                setEditingSessionId(null);
                                                setWindowStart(DAY_WINDOW_START);
                                                setIsCalendarOpen(false);
                                            }}
                                            className={`h-11 rounded-xl border p-1 flex flex-col justify-between items-center transition bg-white ${isSelected
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
                                        setSelectedDateKey(todayKey);
                                        setCalendarViewYear(new Date().getFullYear());
                                        setCalendarViewMonth(new Date().getMonth());
                                        setSelection(null);
                                        setActiveConflict(null);
                                        setEditingSessionId(null);
                                        setWindowStart(DAY_WINDOW_START);
                                        setIsCalendarOpen(false);
                                    }}
                                    className="font-bold text-amber-700 hover:underline text-[11px]"
                                >
                                    Jump to Today
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCalendarOpen(false)}
                                    className="bg-[#17191C] text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl shadow-xs"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
