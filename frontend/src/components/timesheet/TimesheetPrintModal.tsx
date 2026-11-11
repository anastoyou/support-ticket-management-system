import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import {
    Printer, Calendar, X, Clock, MapPin, Wrench, DollarSign,
    RefreshCw, CheckCircle2, ChevronRight, FileText
} from 'lucide-react';
import {
    type EmployeeWorkLogItem,
    printEmployeeTimesheetReport
} from './employeeTimesheetPrintReport';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface TimesheetPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    workerId: number;
    workerName: string;
    employeeNo?: string;
    workerRole?: string;
    workerRate?: number | string;
    subDepartments?: string;
    initialFromDate?: string;
    initialToDate?: string;
}

function toIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export const TimesheetPrintModal: React.FC<TimesheetPrintModalProps> = ({
    isOpen,
    onClose,
    workerId,
    workerName,
    employeeNo,
    workerRole,
    workerRate,
    subDepartments,
    initialFromDate,
    initialToDate,
}) => {
    const { token } = useSelector((state: RootState) => state.auth);

    // Initial default: 1st day of current month to today
    const [fromDate, setFromDate] = useState<string>(() => {
        if (initialFromDate) return initialFromDate;
        const now = new Date();
        return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    });

    const [toDate, setToDate] = useState<string>(() => {
        if (initialToDate) return initialToDate;
        return toIsoDate(new Date());
    });

    const [logs, setLogs] = useState<EmployeeWorkLogItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [isPrinting, setIsPrinting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch work logs when workerId or date range changes
    const fetchLogs = useCallback(async () => {
        if (!isOpen || !token || !workerId) return;
        setLoading(true);
        setError(null);
        try {
            const url = `${API_URL}/maintenance/worklog/?worker=${workerId}&from_date=${fromDate}&to_date=${toDate}`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Token ${token}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                const list: EmployeeWorkLogItem[] = Array.isArray(data)
                    ? data
                    : (data.results || []);
                setLogs(list);
            } else {
                setError('Failed to load work logs for the selected date range.');
            }
        } catch (err) {
            console.error('Error fetching employee timesheet logs:', err);
            setError('An error occurred while loading timesheet data.');
        } finally {
            setLoading(false);
        }
    }, [isOpen, token, workerId, fromDate, toDate]);

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen, fetchLogs]);

    // Quick range presets
    const handleSetPreset = (preset: 'thisMonth' | 'lastMonth' | 'last30' | 'thisWeek') => {
        const now = new Date();
        if (preset === 'thisMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            setFromDate(toIsoDate(firstDay));
            setToDate(toIsoDate(now));
        } else if (preset === 'lastMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            setFromDate(toIsoDate(firstDay));
            setToDate(toIsoDate(lastDay));
        } else if (preset === 'last30') {
            const prior = new Date();
            prior.setDate(prior.getDate() - 30);
            setFromDate(toIsoDate(prior));
            setToDate(toIsoDate(now));
        } else if (preset === 'thisWeek') {
            const curr = new Date();
            const day = curr.getDay();
            const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // Monday
            const monday = new Date(curr.setDate(diff));
            setFromDate(toIsoDate(monday));
            setToDate(toIsoDate(new Date()));
        }
    };

    // Summaries
    const summary = useMemo(() => {
        const totalHours = logs.reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
        const uniqueDates = Array.from(new Set(logs.map((l) => l.work_date))).filter(Boolean);
        const daysWorked = uniqueDates.length;
        const avgHours = daysWorked > 0 ? totalHours / daysWorked : 0;
        const ticketCount = Array.from(
            new Set(logs.filter((l) => l.ticket?.ticket_id).map((l) => l.ticket!.ticket_id))
        ).length;
        const rateNum = Number(workerRate) || 0;
        const totalLabourAmount = rateNum > 0 ? totalHours * rateNum : 0;

        return {
            totalHours,
            daysWorked,
            avgHours,
            ticketCount,
            totalLabourAmount,
            rateNum,
        };
    }, [logs, workerRate]);

    const handleTriggerPrint = async () => {
        try {
            setIsPrinting(true);
            await printEmployeeTimesheetReport({
                workerId,
                workerName,
                employeeNo,
                role: workerRole,
                subDepartments,
                hourlyRate: workerRate,
                fromDate,
                toDate,
                logs,
            });
        } catch (err) {
            console.error('Print trigger failed:', err);
        } finally {
            setIsPrinting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
            <div
                className="bg-surface dark:bg-surface-container border border-outline-variant rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-3.5 bg-surface-container-high border-b border-outline-variant flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">
                            {workerName ? workerName.charAt(0).toUpperCase() : 'W'}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-extrabold text-on-surface truncate">
                                    {workerName}
                                </h2>
                                {employeeNo && (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                                        ID: {employeeNo}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-on-surface-variant truncate">
                                {workerRole || 'Employee'} &bull; {subDepartments || 'Workforce'}
                                {summary.rateNum > 0 && ` &bull; Rate: ${summary.rateNum} KWD/hr`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={handleTriggerPrint}
                            disabled={loading || isPrinting || logs.length === 0}
                            className="h-9 px-3.5 rounded-xl font-bold text-xs bg-primary text-on-primary hover:bg-primary/90 flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Print Timesheet Report formatted for A4"
                        >
                            <Printer className="w-4 h-4" />
                            <span>{isPrinting ? 'Preparing A4...' : 'Print A4'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition"
                            title="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Date Controls & Presets */}
                <div className="p-4 bg-surface border-b border-outline-variant shrink-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Quick Presets */}
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                            <span className="text-xs font-semibold text-on-surface-variant mr-1">Range:</span>
                            <button
                                type="button"
                                onClick={() => handleSetPreset('thisMonth')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface transition"
                            >
                                This Month
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetPreset('lastMonth')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface transition"
                            >
                                Last Month
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetPreset('last30')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface transition"
                            >
                                Last 30 Days
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetPreset('thisWeek')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface transition"
                            >
                                This Week
                            </button>
                        </div>

                        {/* From - To inputs */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant px-2.5 py-1 rounded-lg">
                                <span className="text-[11px] font-bold text-on-surface-variant uppercase">From:</span>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="bg-transparent text-xs font-semibold text-on-surface outline-none cursor-pointer"
                                />
                            </div>

                            <span className="text-on-surface-variant text-xs">&ndash;</span>

                            <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant px-2.5 py-1 rounded-lg">
                                <span className="text-[11px] font-bold text-on-surface-variant uppercase">To:</span>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="bg-transparent text-xs font-semibold text-on-surface outline-none cursor-pointer"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={fetchLogs}
                                disabled={loading}
                                className="p-1.5 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface transition cursor-pointer"
                                title="Refresh Logs"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                        <div className="p-2.5 rounded-xl border border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/20 text-center">
                            <div className="text-lg font-black text-sky-700 dark:text-sky-300">
                                {summary.totalHours.toFixed(2)} hrs
                            </div>
                            <div className="text-[10px] font-bold text-sky-800/80 dark:text-sky-400 uppercase tracking-wide">
                                Total Logged
                            </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-outline-variant bg-surface-container-low text-center">
                            <div className="text-lg font-black text-on-surface">
                                {summary.daysWorked}
                            </div>
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">
                                Working Days
                            </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-outline-variant bg-surface-container-low text-center">
                            <div className="text-lg font-black text-on-surface">
                                {summary.avgHours.toFixed(1)} hrs
                            </div>
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">
                                Avg / Day
                            </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-outline-variant bg-surface-container-low text-center">
                            <div className="text-lg font-black text-on-surface">
                                {summary.ticketCount}
                            </div>
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">
                                Tickets Handled
                            </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 text-center col-span-2 sm:col-span-1">
                            <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                                {summary.rateNum > 0
                                    ? `${summary.totalLabourAmount.toFixed(3)} KWD`
                                    : `${logs.length} logs`}
                            </div>
                            <div className="text-[10px] font-bold text-emerald-800/80 dark:text-emerald-400 uppercase tracking-wide">
                                {summary.rateNum > 0 ? 'Est. Labour Cost' : 'Total Entries'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Body Preview */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center text-on-surface-variant gap-2">
                            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                            <span className="text-xs font-semibold">Loading timesheet entries...</span>
                        </div>
                    ) : error ? (
                        <div className="py-12 text-center text-xs font-semibold text-error">
                            {error}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-16 text-center text-on-surface-variant space-y-2">
                            <Clock className="w-10 h-10 mx-auto opacity-30" />
                            <p className="text-sm font-bold text-on-surface">No Timesheet Logs Found</p>
                            <p className="text-xs">There are no work logs recorded for this worker between {fromDate} and {toDate}.</p>
                        </div>
                    ) : (
                        <div className="border border-outline-variant rounded-xl overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-surface-container border-b border-outline-variant text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                                        <th className="py-2.5 px-3">Date</th>
                                        <th className="py-2.5 px-2">Time</th>
                                        <th className="py-2.5 px-3 text-right">Hours</th>
                                        <th className="py-2.5 px-3">Type / Ticket</th>
                                        <th className="py-2.5 px-3">Location</th>
                                        <th className="py-2.5 px-3">Work Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/60">
                                    {logs.map((log) => {
                                        const isTicket = Boolean(log.ticket);
                                        const cleanFrom = (log.from_time || '').slice(0, 5);
                                        const cleanTo = (log.to_time || '').slice(0, 5);
                                        const timeText = cleanFrom && cleanTo ? `${cleanFrom} - ${cleanTo}` : 'Unscheduled';

                                        let locationName = '-';
                                        if (log.ticket?.store) {
                                            locationName = log.ticket.store.short_code
                                                ? `${log.ticket.store.short_code} (${log.ticket.store.store_name})`
                                                : log.ticket.store.store_name || '-';
                                        } else if (log.stores && log.stores.length > 0) {
                                            locationName = log.stores.map((s) => s.short_code || s.store_name).join(', ');
                                        }

                                        return (
                                            <tr key={log.worklog_id} className="hover:bg-surface-container-low/50 transition">
                                                <td className="py-2 px-3 font-semibold text-on-surface whitespace-nowrap">
                                                    {log.work_date}
                                                </td>
                                                <td className="py-2 px-2 text-on-surface-variant whitespace-nowrap font-mono text-[11px]">
                                                    {timeText}
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-on-surface whitespace-nowrap">
                                                    {Number(log.hours || 0).toFixed(2)} hrs
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider mr-1.5 ${isTicket
                                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                        }`}>
                                                        {isTicket ? 'Ticket' : 'Manual'}
                                                    </span>
                                                    <span className="font-semibold text-on-surface">
                                                        {log.ticket
                                                            ? (log.ticket.work_order_no || `#${log.ticket.ticket_id}`)
                                                            : 'Timesheet'}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-on-surface-variant truncate max-w-[150px]">
                                                    {locationName}
                                                </td>
                                                <td className="py-2 px-3 text-on-surface-variant text-[11px] truncate max-w-[220px]" title={log.work_done}>
                                                    {log.work_done || '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-5 py-3 bg-surface-container-low border-t border-outline-variant flex items-center justify-between shrink-0">
                    <div className="text-xs text-on-surface-variant">
                        Showing <strong className="text-on-surface">{logs.length}</strong> log(s) for {workerName}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition cursor-pointer"
                        >
                            Close
                        </button>

                        <button
                            type="button"
                            onClick={handleTriggerPrint}
                            disabled={loading || isPrinting || logs.length === 0}
                            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Printer className="w-4 h-4" />
                            <span>{isPrinting ? 'Generating A4...' : 'Print A4 Report'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

