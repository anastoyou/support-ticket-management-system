import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DateRange, type RangeKeyDict } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { Calendar as CalendarIcon, Filter, RotateCcw, X } from 'lucide-react';

export interface DateTypeOption {
    value: string;
    label: string;
}

export const DATE_TYPE_OPTIONS: DateTypeOption[] = [
    { value: 'created', label: 'Created Date' },
    { value: 'open', label: 'Open Date' },
    { value: 'in_progress', label: 'In Progress Date' },
    { value: 'blocked', label: 'Blocked Date' },
    { value: 'location_approval', label: 'Location Approval Date' },
    { value: 'rejected', label: 'Rejected Date' },
    { value: 'closed', label: 'Closed / Completed Date' },
];

interface DateRangePickerCardProps {
    fromDate: string; // YYYY-MM-DD
    toDate: string; // YYYY-MM-DD
    dateType?: string;
    onDateRangeChange: (from: string, to: string, dateType: string) => void;
    onReset: () => void;
    allowEmptyDateType?: boolean;
    emptyDateTypeLabel?: string;
    hideDateType?: boolean;
}

const formatDateStr = (d: Date | null | undefined): string => {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseDateStr = (str: string): Date => {
    if (!str) return new Date();
    const parts = str.split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return new Date(str);
};

const PANEL_WIDTH = 400;

export const DateRangePickerCard: React.FC<DateRangePickerCardProps> = ({
    fromDate,
    toDate,
    dateType,
    onDateRangeChange,
    onReset,
    allowEmptyDateType = false,
    emptyDateTypeLabel = 'Select Option',
    hideDateType = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const getResolvedDateType = useCallback((val?: string) => {
        if (val !== undefined && val !== null) return val;
        return allowEmptyDateType ? '' : 'created';
    }, [allowEmptyDateType]);

    // Local draft — only committed to parent on "Apply"
    const [draft, setDraft] = useState([{
        startDate: parseDateStr(fromDate),
        endDate: parseDateStr(toDate),
        key: 'selection',
    }]);

    const [draftDateType, setDraftDateType] = useState<string>(() => getResolvedDateType(dateType));

    // Re-sync draft when parent resets externally
    useEffect(() => {
        setDraft([{
            startDate: parseDateStr(fromDate),
            endDate: parseDateStr(toDate),
            key: 'selection',
        }]);
        setDraftDateType(getResolvedDateType(dateType));
    }, [fromDate, toDate, dateType, getResolvedDateType]);

    const triggerRef = useRef<HTMLButtonElement>(null);

    const computePanelPos = useCallback(() => {
        if (!triggerRef.current || typeof window === 'undefined') return null;
        const rect = triggerRef.current.getBoundingClientRect();
        const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
        const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
        const estimatedHeight = 430;
        let top = rect.bottom + 6;
        if (top + estimatedHeight > window.innerHeight - 8) {
            const aboveTop = rect.top - estimatedHeight - 6;
            top = aboveTop >= 8 ? aboveTop : Math.max(8, window.innerHeight - estimatedHeight - 8);
        }
        return { top, left, width };
    }, []);

    const openPanel = () => {
        if (isMobile) {
            setPanelPos(null); // mobile uses full-screen fixed
        } else {
            const pos = computePanelPos();
            if (pos) setPanelPos(pos);
        }
        setIsOpen(true);
    };

    // Recompute position on scroll/resize while open
    const recomputePos = useCallback(() => {
        if (!isOpen) return;
        if (isMobile) {
            setPanelPos(null);
            return;
        }
        const pos = computePanelPos();
        if (pos) setPanelPos(pos);
    }, [isOpen, isMobile, computePanelPos]);

    useEffect(() => {
        window.addEventListener('scroll', recomputePos, true);
        window.addEventListener('resize', recomputePos);
        return () => {
            window.removeEventListener('scroll', recomputePos, true);
            window.removeEventListener('resize', recomputePos);
        };
    }, [recomputePos]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            // ignore clicks inside the trigger or the portal panel
            if (triggerRef.current?.contains(target)) return;
            const panel = document.getElementById('date-range-panel');
            if (panel?.contains(target)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const handleSelect = (ranges: RangeKeyDict) => {
        const s = ranges.selection;
        if (s.startDate && s.endDate) {
            setDraft([{ startDate: s.startDate, endDate: s.endDate, key: 'selection' }]);
        }
    };

    const handleApply = () => {
        onDateRangeChange(formatDateStr(draft[0].startDate), formatDateStr(draft[0].endDate), draftDateType);
        setIsOpen(false);
    };

    const handleReset = () => {
        setDraft([{ startDate: new Date(), endDate: new Date(), key: 'selection' }]);
        setDraftDateType(allowEmptyDateType ? '' : 'created');
        onReset();
        setIsOpen(false);
    };

    const activeLabel = React.useMemo(() => {
        const selectedOpt = DATE_TYPE_OPTIONS.find(o => o.value === dateType);
        const shouldShowPrefix = selectedOpt && dateType && (allowEmptyDateType || dateType !== 'created');
        const prefix = shouldShowPrefix
            ? `${selectedOpt.label.replace(' Date', '')}: `
            : '';

        if (fromDate && toDate) {
            if (fromDate === toDate) return `${prefix}${fromDate}`;
            return `${prefix}${fromDate} → ${toDate}`;
        }
        if (fromDate) return `${prefix}From: ${fromDate}`;
        if (toDate) return `${prefix}To: ${toDate}`;
        return selectedOpt
            ? selectedOpt.label
            : 'Date Range';
    }, [fromDate, toDate, dateType, allowEmptyDateType]);

    const hasActive = Boolean(
        fromDate ||
        toDate ||
        (dateType && (allowEmptyDateType ? true : dateType !== 'created'))
    );

    const panel = isOpen ? (
        <>
            {/* Backdrop — always rendered (dimmed on mobile, transparent on desktop) */}
            <div
                className={`fixed inset-0 z-[999] ${isMobile ? 'bg-black/40' : ''}`}
                onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <div
                id="date-range-panel"
                style={panelPos ? {
                    position: 'fixed',
                    top: panelPos.top,
                    left: panelPos.left,
                    width: panelPos.width,
                } : {
                    // Mobile: bottom sheet
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderRadius: '1rem 1rem 0 0',
                }}
                className="z-[1000] bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant shadow-2xl overflow-hidden max-h-[90dvh] overflow-y-auto rounded"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-outline-variant dark:border-dark-outline-variant">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-primary" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface dark:text-dark-on-surface">
                            Filter By Date
                        </h4>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 rounded text-outline hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Date Type Selector Dropdown */}
                {!hideDateType && (
                    <div className="px-4 py-2.5 bg-surface-container-low dark:bg-dark-surface-container-low border-b border-outline-variant dark:border-dark-outline-variant flex items-center justify-between gap-2">
                        <label htmlFor="date-type-select" className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant shrink-0">
                            Filter Date By:
                        </label>
                        <select
                            id="date-type-select"
                            value={draftDateType}
                            onChange={(e) => setDraftDateType(e.target.value)}
                            className="w-full text-xs font-semibold bg-surface dark:bg-dark-surface text-on-surface dark:text-dark-on-surface border border-outline-variant dark:border-dark-outline-variant rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                        >
                            {allowEmptyDateType && (
                                <option value="">
                                    {emptyDateTypeLabel || 'Select Option'}
                                </option>
                            )}
                            {DATE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Calendar — only updates draft, not parent */}
                <div className="p-4 flex justify-center date-range-inner">
                    <DateRange
                        editableDateInputs={true}
                        onChange={handleSelect}
                        moveRangeOnFirstSelection={false}
                        ranges={draft}
                        months={1}
                        direction="horizontal"

                    />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 pb-4 pt-3 border-t border-outline-variant dark:border-dark-outline-variant gap-3">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-1.5 text-xs text-red-500 font-semibold hover:text-red-600 transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        className="px-5 py-2 rounded bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition-colors"
                    >
                        Apply Filter
                    </button>
                </div>
            </div>
        </>
    ) : null;

    return (
        <>
            {/* Trigger button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={openPanel}
                className={`flex items-center justify-center gap-1.5 text-xs font-semibold p-2 sm:px-3 sm:py-2 rounded border transition-all min-h-[36px] w-full sm:w-auto ${hasActive
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'bg-surface-container dark:bg-dark-surface-container border-outline-variant dark:border-dark-outline-variant text-on-surface-variant dark:text-dark-on-surface-variant hover:border-primary/50'
                    }`}
            >
                <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="inline sm:inline">{activeLabel}</span>
            </button>

            {/* Render panel in a portal so it escapes any overflow:hidden ancestors */}
            {typeof document !== 'undefined' && createPortal(panel, document.body)}
        </>
    );
};
