import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import { StatCard } from './StatCard';
import { Wrench, Clock, Receipt, CheckCircle2, Award, PlusCircle, AlertTriangle, Palmtree } from 'lucide-react';
import { getCompletionBadgeClasses, TimeSheetModal } from '../../../components/timesheet/TimeSheetModal';
import { LeaveRequestModal } from '../../../components/timesheet/LeaveRequestModal';
import Can from '@/hooks/Can';

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
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);

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
            <div className="bg-surface-container border border-outline-variant rounded p-4 flex flex-wrap items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-container/10 text-primary flex items-center justify-center font-bold text-xs">
                        <Wrench className="w-4 h-4" />
                    </div>
                    <h2 className="text-xs font-semibold text-on-surface">Technician Portal</h2>

                </div>
                <a
                    href="/tickets/all"
                    className="
            ml-auto
            bg-primary hover:bg-primary-container
            text-on-primary text-xs font-medium
            px-3 py-1.5 rounded
            inline-flex items-center gap-1.5
            transition-colors
        "
                >
                    <Wrench className="w-3.5 h-3.5" />
                    My Assigned Jobs
                </a>

                <div className="hidden sm:flex items-center justify-end gap-2 flex-wrap w-full pt-3">
                    {/* Dedicated Apply Leave Button */}
                    <button
                        type="button"
                        onClick={() => setIsLeaveModalOpen(true)}
                        className="
                            bg-amber-500 hover:bg-amber-600
                            text-white text-xs font-semibold
                            px-3.5 py-1.5 rounded
                            inline-flex items-center gap-1.5
                            shadow-xs transition-colors cursor-pointer
                        "
                        title="Apply for Leave or view leave history"
                    >
                        <Palmtree className="w-3.5 h-3.5" />
                        <span>Apply Leave</span>
                    </button>

                    <Can permission={['can_change_my_log_time']}>
                        {/* Pure Dedicated Time Sheet Button */}
                        <button
                            type="button"
                            onClick={() => setIsTimeSheetOpen(true)}
                            className="
                                relative overflow-hidden
                                bg-surface-container hover:bg-surface-container-high
                                border border-outline/60
                                text-on-surface text-xs font-medium
                                px-3 py-1.5 rounded
                                inline-flex items-center gap-1.5
                                transition-colors cursor-pointer
                                group
                            "
                            title="Open Time Sheet to log hours and sessions"
                        >
                            {/* Fill bar for logged work % */}
                            <span
                                className={`absolute inset-y-0 left-0 overflow-hidden transition-all duration-1000 ease-out ${getCompletionBadgeClasses(todayPct)}`}
                                style={{
                                    width: `${Math.min(100, Math.max(0, todayPct))}%`
                                }}
                            >
                                <span className="
                                    absolute inset-y-0 -left-1/2 w-1/2
                                    bg-gradient-to-r from-transparent via-white/40 to-transparent
                                    animate-[shimmer_2s_ease-in-out_infinite]
                                " />
                            </span>

                            <span className="relative z-10 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-primary" />
                                <span>Time Sheet</span>
                                <span className="font-semibold tabular-nums">
                                    {todayHours}h / 10h
                                </span>
                                <span className="text-[10px] opacity-80">
                                    ({todayPct}%)
                                </span>
                            </span>
                        </button>
                    </Can>
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

            {/* Mobile Device Floating Action Buttons (FAB Cluster) */}
            <div className="sm:hidden fixed bottom-6 right-4 z-40 flex flex-col items-end gap-2 select-none">
                {/* Apply Leave Button */}
                <button
                    type="button"
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="
                        bg-amber-500 hover:bg-amber-600 active:bg-amber-700
                        text-white text-xs font-semibold
                        h-9 px-3.5 rounded-full
                        inline-flex items-center gap-1.5
                        shadow-md shadow-amber-500/25
                        transition-transform duration-150 active:scale-95 cursor-pointer
                    "
                    title="Apply for Leave or view leave history"
                >
                    <Palmtree className="w-3.5 h-3.5" />
                    <span>Apply Leave</span>
                </button>

                {/* Time Sheet Button */}
                <Can permission={['can_change_my_log_time']}>
                    <button
                        type="button"
                        onClick={() => {
                            setInitialLogId(undefined);
                            setInitialDate(undefined);
                            setIsTimeSheetOpen(true);
                        }}
                        className="
                            relative overflow-hidden
                            bg-surface-container hover:bg-surface-container-high
                            border border-outline-variant
                            text-on-surface text-xs font-medium
                            h-10 px-3.5 rounded-full
                            inline-flex items-center gap-2
                            shadow-lg shadow-black/20
                            transition-transform duration-150 active:scale-95 cursor-pointer
                        "
                        aria-label={`Open time sheet. ${todayHours} hours logged, ${todayPct}% complete.`}
                        title="Time Sheet"
                    >
                        {/* Progress fill bar */}
                        <span
                            className={`absolute inset-y-0 left-0 overflow-hidden transition-all duration-700 ease-out opacity-25 ${getCompletionBadgeClasses(todayPct)}`}
                            style={{
                                width: `${Math.min(100, Math.max(0, todayPct))}%`
                            }}
                        />

                        <Clock className="w-3.5 h-3.5 text-primary shrink-0 relative z-10" />
                        <span className="relative z-10 font-bold">Time Sheet</span>

                        <span className="relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-on-primary tabular-nums">
                            {todayPct}%
                        </span>
                    </button>
                </Can>
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

            <LeaveRequestModal
                isOpen={isLeaveModalOpen}
                onClose={() => setIsLeaveModalOpen(false)}
                onLeaveUpdated={fetchTodayTimesheet}
            />
        </div>
    );
};
