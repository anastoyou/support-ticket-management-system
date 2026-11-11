import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { DateFilterToolbar } from './dashboard/components/DateFilterToolbar';
import { AdminDashboard } from './dashboard/components/AdminDashboard';
import { ManagementDashboard } from './dashboard/components/ManagementDashboard';
import { OfficeAdminDashboard } from './dashboard/components/OfficeAdminDashboard';
import { StoreManagerDashboard } from './dashboard/components/StoreManagerDashboard';
import { TechnicianDashboard } from './dashboard/components/TechnicianDashboard';
import { AreaManagerDashboard } from './dashboard/components/AreaManagerDashboard';
import { TimeSheetModal } from '../components/timesheet/TimeSheetModal';
import DashboardUpdates from '@/components/DashboardUpdates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const DashboardView: React.FC = () => {
    const { token, user } = useSelector((state: RootState) => state.auth);
    const location = useLocation();

    // Compute initial month range
    const getCurrentMonthRange = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const firstDay = `${year}-${month}-01`;
        const lastDayObj = new Date(year, now.getMonth() + 1, 0);
        const lastDay = `${year}-${month}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
        return { fromDate: firstDay, toDate: lastDay };
    };

    const [fromDate, setFromDate] = useState<string>(() => {
        const savedFrom = localStorage.getItem('ticket-filter-from-date');
        if (savedFrom !== null) return savedFrom;
        return getCurrentMonthRange().fromDate;
    });

    const [toDate, setToDate] = useState<string>(() => {
        const savedTo = localStorage.getItem('ticket-filter-to-date');
        if (savedTo !== null) return savedTo;
        return getCurrentMonthRange().toDate;
    });

    const [dateType, setDateType] = useState<string>(() => {
        const savedType = localStorage.getItem('ticket-filter-date-type');
        return savedType || 'created';
    });

    const [selectedStore, setSelectedStore] = useState<string>('');
    const [selectedDept, setSelectedDept] = useState<string>('');
    const [stores, setStores] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const handleDateChange = (from: string, to: string, type?: string) => {
        setFromDate(from);
        setToDate(to);
        if (type) {
            setDateType(type);
            localStorage.setItem('ticket-filter-date-type', type);
        } else {
            setDateType('created');
            localStorage.setItem('ticket-filter-date-type', 'created');
        }
        if (from) localStorage.setItem('ticket-filter-from-date', from);
        else localStorage.removeItem('ticket-filter-from-date');

        if (to) localStorage.setItem('ticket-filter-to-date', to);
        else localStorage.removeItem('ticket-filter-to-date');
    };

    const fetchMetadata = async () => {
        if (!token) return;
        try {
            const headers = { Authorization: `Token ${token}` };
            const [resStores, resDepts] = await Promise.all([
                fetch(`${API_URL}/stores/store/`, { headers }),
                fetch(`${API_URL}/stores/department/`, { headers })
            ]);
            if (resStores.ok) {
                const sData = await resStores.json();
                setStores(Array.isArray(sData) ? sData.filter((s: any) => s.active !== false) : []);
            }
            if (resDepts.ok) {
                setDepartments(await resDepts.json());
            }
        } catch (err) {
            console.error('Failed to load metadata for dashboard:', err);
        }
    };

    const fetchMetrics = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (fromDate) query.set('from_date', fromDate);
            if (toDate) query.set('to_date', toDate);
            if (dateType && dateType !== 'created') query.set('date_type', dateType);
            if (selectedStore) query.set('store', selectedStore);
            if (selectedDept) query.set('department', selectedDept);

            const response = await fetch(`${API_URL}/reports/dashboard-metrics/?${query.toString()}`, {
                headers: { Authorization: `Token ${token}` }
            });

            if (response.ok) {
                const resData = await response.json();
                setData(resData);
            }
        } catch (err) {
            console.error('Failed to fetch dashboard metrics:', err);
        } finally {
            setLoading(false);
        }
    }, [token, fromDate, toDate, dateType, selectedStore, selectedDept]);

    useEffect(() => {
        fetchMetadata();
    }, [token]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    if (!user) return null;

    // Normalize role string
    const roleStr = (typeof user.role === 'object' && user.role
        ? (user.role as any).role_name
        : user.role) || '';
    const roleLower = String(roleStr).toLowerCase().trim();
    const isTechRole = roleLower.includes('technician') || roleLower.includes('worker');

    const [dashLogId, setDashLogId] = useState<number | undefined>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const l = urlParams.get('log');
        return l ? Number(l) : undefined;
    });
    const [dashDate, setDashDate] = useState<string | undefined>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('date') || undefined;
    });
    const [isDashTimeSheetOpen, setIsDashTimeSheetOpen] = useState(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return Boolean(!isTechRole && (urlParams.get('log') || urlParams.get('timesheet')));
    });

    useEffect(() => {
        if (isTechRole) return;
        const urlParams = new URLSearchParams(location.search);
        const l = urlParams.get('log');
        const ts = urlParams.get('timesheet');
        if (l || ts) {
            if (l) setDashLogId(Number(l));
            if (urlParams.get('date')) setDashDate(urlParams.get('date') || undefined);
            setIsDashTimeSheetOpen(true);
        }
    }, [isTechRole, location.search]);


    // Select dashboard component based on role
    const renderRoleDashboard = () => {
        if (roleLower.includes('office admin')) {
            return <OfficeAdminDashboard data={data} loading={loading} token={token} />;
        }
        if (roleLower.includes('store manager') || roleLower.includes('store_manager')) {
            return <StoreManagerDashboard data={data} loading={loading} />;
        }
        if (roleLower.includes('technician') || roleLower.includes('worker')) {
            return <TechnicianDashboard data={data} loading={loading} />;
        }
        if (roleLower.includes('area manager') || roleLower.includes('area_manager')) {
            return <AreaManagerDashboard data={data} loading={loading} />;
        }
        if (roleLower.includes('management') || roleLower.includes('executive')) {
            return <ManagementDashboard data={data} loading={loading} />;
        }
        // Admin / Superuser / Fallback
        return <AdminDashboard data={data} loading={loading} token={token} />;
    };

    return (
        <div className="space-y-6">
            {/* Top Date & Store Filter Bar */}


            <DashboardUpdates
            />

            <DateFilterToolbar
                fromDate={fromDate}
                toDate={toDate}
                dateType={dateType}
                onDateChange={handleDateChange}
                stores={stores}
                selectedStore={selectedStore}
                onStoreChange={setSelectedStore}
                departments={departments}
                selectedDept={selectedDept}
                onDeptChange={setSelectedDept}
                loading={loading}
                onRefresh={fetchMetrics}
            />

            {/* Dynamic Role Dashboard View */}
            {renderRoleDashboard()}

            {!isTechRole && isDashTimeSheetOpen && (
                <TimeSheetModal
                    isOpen={isDashTimeSheetOpen}
                    initialEditingWorklogId={dashLogId}
                    initialDate={dashDate}
                    onClose={() => {
                        setIsDashTimeSheetOpen(false);
                        setDashLogId(undefined);
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.has('log') || urlParams.has('timesheet') || urlParams.has('date')) {
                            urlParams.delete('log');
                            urlParams.delete('timesheet');
                            urlParams.delete('date');
                            const nextQuery = urlParams.toString();
                            const newUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
                            window.history.replaceState(null, '', newUrl);
                        }
                    }}
                />
            )}
        </div>
    );
};
