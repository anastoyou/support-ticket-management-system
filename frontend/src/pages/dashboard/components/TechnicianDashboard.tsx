import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import { StatCard } from './StatCard';
import { Wrench, Clock, Receipt, CheckCircle2, Award, PlusCircle, AlertTriangle } from 'lucide-react';
import { TimeSheetModal } from '../../../components/timesheet/TimeSheetModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface TechnicianDashboardProps {
    data: any;
    loading: boolean;
}

export const TechnicianDashboard: React.FC<TechnicianDashboardProps> = ({ data, loading }) => {
    const { token } = useSelector((state: RootState) => state.auth);
    const location = useLocation();

    const summary = data?.summary || {};
    const financials = data?.financials || {};
    const worklogSummary = data?.worklog_summary || {};
    const myPerfList = data?.worker_performance || [];
    const myPerf = myPerfList.length > 0 ? myPerfList[0] : null;

    // Time Sheet modal and today's summary state
    const [initialLogId, setInitialLogId] = useState<number | undefined>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const logId = urlParams.get('log');
        return logId ? Number(logId) : undefined;
    });
    const [initialDate, setInitialDate] = useState<string | undefined>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('date') || undefined;
    });
    const [isTimeSheetOpen, setIsTimeSheetOpen] = useState(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return Boolean(urlParams.get('log') || urlParams.get('timesheet'));
    });

    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const logId = urlParams.get('log');
        const timesheet = urlParams.get('timesheet');
        if (logId || timesheet) {
            if (logId) setInitialLogId(Number(logId));
            if (urlParams.get('date')) setInitialDate(urlParams.get('date') || undefined);
            setIsTimeSheetOpen(true);
        }
    }, [location.search]);

    const [todayHours, setTodayHours] = useState<number>(0);
    const [todayPct, setTodayPct] = useState<number>(0);

    const fetchTodayTimesheet = useCallback(async () => {
        if (!token) return;
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const res = await fetch(`${API_URL}/maintenance/worklog/timesheet/?date=${todayStr}`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (res.ok) {
                const resData = await res.json();
                setTodayHours(resData.total_booked_hours || 0);
                setTodayPct(resData.completion_percentage || 0);
            }
        } catch (err) {
            console.error('Failed to fetch today timesheet summary:', err);
        }
    }, [token]);

    useEffect(() => {
        fetchTodayTimesheet();
    }, [fetchTodayTimesheet]);

    return (
        <div className="space-y-6">
            {/* Quick Action Mobile Header */}
            <div className="bg-surface-container border border-outline-variant rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-container/10 text-primary flex items-center justify-center font-bold text-xs">
                        <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-xs font-semibold text-on-surface">Technician Work Portal</h2>
                        <p className="text-[11px] text-on-surface-variant">Track your active assignments, log work hours & claims.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Time Sheet Button with current day time log */}
                    {/* <button
                        type="button"
                        onClick={() => setIsTimeSheetOpen(true)}
                        className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-1.5 rounded flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                        title="Open interactive Time Sheet to log hours & sessions"
                    >
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span>Time Sheet</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                            {todayHours}h / 10h ({todayPct}% complete)
                        </span>
                    </button> */}

                    <a
                        href="/tickets/all"
                        className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                    >
                        <Wrench className="w-3.5 h-3.5" />
                        My Assigned Jobs
                    </a>
                </div>
            </div>

            {/* Personal KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="My Active Jobs"
                    value={summary.in_progress || 0}
                    subtext={`${summary.open || 0} Open Assigned`}
                    icon={<Wrench className="w-4 h-4" />}
                    badgeColor={summary.in_progress > 0 ? 'warning' : 'success'}
                    loading={loading}
                />
                <StatCard
                    title="Logged Work Hours"
                    value={`${worklogSummary.total_logged_hours || 0} hrs`}
                    subtext={`Planned: ${worklogSummary.total_planned_hours || 0} hrs`}
                    icon={<Clock className="w-4 h-4" />}
                    badgeColor="primary"
                    loading={loading}
                />
                <StatCard
                    title="Efficiency Rating"
                    value={`${myPerf?.efficiency_pct || 100}%`}
                    subtext={myPerf?.efficiency_pct >= 95 ? 'Ahead of Schedule' : 'On Track'}
                    icon={<Award className="w-4 h-4" />}
                    badgeColor={myPerf?.efficiency_pct >= 95 ? 'success' : 'primary'}
                    loading={loading}
                />
                <StatCard
                    title="Completed Tickets"
                    value={summary.completed || 0}
                    subtext={`${myPerf?.on_time_pct || 100}% On-Time`}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    badgeColor="success"
                    loading={loading}
                />
            </div>

            {/* Performance Summary Banner */}
            {myPerf && (
                <div className="border border-outline-variant rounded bg-surface-container p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-emerald-500" /> My Performance Summary (This Period)
                        </span>
                        <span className="text-xs font-semibold text-emerald-600">
                            {myPerf.on_time_pct}% On-Time Delivery
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                            <div className="text-[10px] text-on-surface-variant">Allocated Hours</div>
                            <div className="text-sm font-semibold text-on-surface mt-0.5">{myPerf.planned_hours} hrs</div>
                        </div>
                        <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                            <div className="text-[10px] text-on-surface-variant">Actual Logged</div>
                            <div className="text-sm font-semibold text-on-surface mt-0.5">{myPerf.logged_hours} hrs</div>
                        </div>
                        <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                            <div className="text-[10px] text-on-surface-variant">Jobs Resolved</div>
                            <div className="text-sm font-semibold text-emerald-600 mt-0.5">{myPerf.completed_jobs} Jobs</div>
                        </div>
                        <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant">
                            <div className="text-[10px] text-on-surface-variant">Efficiency Index</div>
                            <div className="text-sm font-semibold text-primary mt-0.5">{myPerf.efficiency_pct}%</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Device Floating Action Button (FAB) with Bottom-to-Top Fill (DESIGN.md tokens) */}

            <div className="sm:hidden fixed bottom-7 right-6 z-40 flex flex-col items-center gap-2 select-none">
                <button
                    type="button"
                    onClick={() => {
                        setInitialLogId(undefined);
                        setInitialDate(undefined);
                        setIsTimeSheetOpen(true);
                    }}
                    className="
            group relative w-[76px] h-[76px]
            rounded-full overflow-visible
            bg-surface-container
            border border-outline-variant
            shadow-xl shadow-black/20
            flex items-center justify-center
            transition-all duration-300 ease-out
            hover:shadow-2xl hover:-translate-y-1
            active:scale-90
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-primary
            focus-visible:ring-offset-2
            animate-[bounce_2s_ease-in-out_3]
        "
                    aria-label={`Open time sheet. ${todayHours} hours logged, ${todayPct}% complete.`}
                    title="Time Sheet"
                >
                    {/* Circular progress track */}
                    <svg
                        className="absolute inset-0 w-full h-full -rotate-90"
                        viewBox="0 0 76 76"
                        fill="none"
                    >
                        <circle
                            cx="38"
                            cy="38"
                            r="34"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-outline-variant/40"
                        />

                        {/* Progress indicator */}
                        <circle
                            cx="38"
                            cy="38"
                            r="34"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 34}
                            strokeDashoffset={
                                2 * Math.PI * 34 *
                                (1 - Math.min(100, Math.max(0, todayPct)) / 100)
                            }
                            className="text-primary transition-all duration-700 ease-out"
                        />
                    </svg>

                    {/* Background progress fill */}
                    <div
                        className="
                absolute inset-1 rounded-full
                pointer-events-none
                transition-all duration-500
            "
                        style={{
                            background: `linear-gradient(
                    to top,
                    color-mix(in srgb, var(--color-primary) 16%, transparent)
                    ${Math.min(100, Math.max(0, todayPct))}%,
                    transparent
                    ${Math.min(100, Math.max(0, todayPct))}%
                )`
                        }}
                    />

                    {/* Main content */}
                    <div className="relative z-10 flex flex-col items-center justify-center gap-1 pointer-events-none">
                        <Clock className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />

                        <span className="text-sm font-bold text-on-surface leading-none tabular-nums">
                            {todayHours}h
                        </span>
                    </div>

                    {/* Percentage badge */}
                    <span
                        className="
                absolute -top-1.5 -right-2
                min-w-[36px] h-[23px]
                px-2 rounded-full
                flex items-center justify-center
                bg-primary text-on-primary
                border-2 border-surface-container
                text-[10px] font-bold
                shadow-md tabular-nums
                z-20
                transition-transform duration-300
                group-hover:scale-110
            "
                    >
                        {todayPct >= 100 ? '100%' : `${todayPct}%`}
                    </span>
                </button>
            </div>

            <TimeSheetModal
                isOpen={isTimeSheetOpen}
                initialEditingWorklogId={initialLogId}
                initialDate={initialDate}
                initialCalendarOpen={!initialLogId}
                onClose={() => {
                    setIsTimeSheetOpen(false);
                    setInitialLogId(undefined);
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.has('log') || urlParams.has('timesheet') || urlParams.has('date')) {
                        urlParams.delete('log');
                        urlParams.delete('timesheet');
                        urlParams.delete('date');
                        const nextQuery = urlParams.toString();
                        const newUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
                        window.history.replaceState(null, '', newUrl);
                    }
                    fetchTodayTimesheet();
                }}
                onSessionsUpdated={fetchTodayTimesheet}
            />
        </div>
    );
};
