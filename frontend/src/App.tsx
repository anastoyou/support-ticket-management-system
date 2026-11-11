import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  FileText, Store, Wrench, User, Receipt, BarChart3, Settings
} from 'lucide-react';
import { DashboardLayout } from './components/DashboardLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ThemeToggleOverlay } from './components/ThemeToggleOverlay';
import { PlaceholderView } from './components/PlaceholderView';
import type { RootState } from './store';
import { setCredentials, clearCredentials } from './store/authSlice';
import { enablePushNotifications } from './services/pushNotifications';

import { LogoLoader } from './components/LogoLoader';

// Page Views
import { LoginView } from './pages/LoginView';
import { SignupView } from './pages/SignupView';
import { ForgotPasswordView } from './pages/ForgotPasswordView';
import { ApprovalPendingView } from './pages/ApprovalPendingView';
import { DashboardView } from './pages/DashboardView';
// import { TicketsView } from './pages/TicketsView';
import { StoresView } from './pages/StoresView';
import { MaintenanceView } from './pages/MaintenanceView';
import { WorkforceView } from './pages/WorkforceView';
import { ReportsView } from './pages/ReportsView';
import { FinanceView } from './pages/FinanceView';
import { ComplaintsView } from './pages/ComplaintsView';
import Test from './Test';
import PageTitle from './PageTitle';
import { TicketsView } from './pages/ticket/TicketsView';
import { TicketHistoryView } from './pages/ticket/TicketHistoryView';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';

import { WebSocketListener } from './components/WebSocketListener';
import { PushNotificationPrompt } from './components/PushNotificationPrompt';
import { ProfileCompletionModal } from './components/ProfileCompletionModal';
import { StoreCompletionModal } from './components/StoreCompletionModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';


// Theme helper functions
const getInitialTheme = (): boolean => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedPrefs = window.localStorage.getItem('color-theme');
    if (typeof storedPrefs === 'string') {
      return storedPrefs === 'dark';
    }
    const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
    if (userMedia.matches) {
      return true;
    }
  }
  return false;
};

const App: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(getInitialTheme());
  const dispatch = useDispatch();
  const token = useSelector((state: RootState) => state.auth.token);
  const [refetching, setRefetching] = useState<boolean>(!!token);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    if (!token) {
      setRefetching(false);
      return;
    }

    const refetchProfile = async () => {
      try {
        const response = await fetch(`${API_URL}/accounts/profile/`, {
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          dispatch(setCredentials({
            token,
            user: data.user,
            permissions: data.permissions,
            accessibleStores: data.accessible_stores
          }));
        } else {
          dispatch(clearCredentials());
        }
      } catch (err) {
        console.error('Failed to refetch user profile:', err);
      } finally {
        setRefetching(false);
      }
    };

    refetchProfile();
  }, [token, dispatch]);

  // Auto-subscribe to push notifications on successful login if browser permission is already granted
  useEffect(() => {
    if (token && 'Notification' in window && Notification.permission === 'granted') {
      enablePushNotifications().catch(err => {
        console.warn('Failed to auto-subscribe push notifications on login:', err);
      });
    }
  }, [token]);

  if (refetching) {
    return <LogoLoader fullScreen label="Loading profile..." />;
  }

  return (
    <div className="min-h-screen bg-surface dark:bg-dark-surface text-on-surface dark:text-dark-on-surface transition-colors duration-200">
      <Router>
        <PageTitle />
        <WebSocketListener />
        <PushNotificationPrompt />
        <ProfileCompletionModal />
        <StoreCompletionModal />
        <ThemeToggleOverlay isDark={isDark} setIsDark={setIsDark} />
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/signup" element={<SignupView />} />
          <Route path="/forgot-password" element={<ForgotPasswordView />} />
          <Route path="/approval-pending" element={<ApprovalPendingView />} />

          {/* Dashboard and Subpage Routes wrapped with DashboardLayout */}
          <Route path="/" element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/tickets/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <TicketsView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/ticket/:ticketId/history" element={
            <ProtectedRoute>
              <DashboardLayout>
                <TicketHistoryView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/stores/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <StoresView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/maintenance/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <MaintenanceView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/workforce/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <WorkforceView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/reports/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <ReportsView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/finance/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <FinanceView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/complaints/:subpage" element={
            <ProtectedRoute>
              <DashboardLayout>
                <ComplaintsView />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/complaints" element={
            <ProtectedRoute>
              <DashboardLayout>
                <ComplaintsView />
              </DashboardLayout>
            </ProtectedRoute>
          } />



          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="test" element={<Test />} />
        </Routes>
        <PwaInstallPrompt />
      </Router>
    </div>
  );
};

export default App;
