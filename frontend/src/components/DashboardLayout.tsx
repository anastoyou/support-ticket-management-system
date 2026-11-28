import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { Sidebar, getNextPermittedPath } from './Sidebar';
import { Header } from './Header';
import { usePermission } from '../hooks/usePermission';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return typeof window !== 'undefined' && window.innerWidth >= 1024;
  });
  const wasDesktopRef = useRef(typeof window !== 'undefined' && window.innerWidth >= 1024);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop !== wasDesktopRef.current) {
        wasDesktopRef.current = isDesktop;
        setSidebarOpen(isDesktop);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const location = useLocation();
  const { hasPermission } = usePermission();

  // Auto-request fullscreen mode on initial load / user interaction (unless opted out within 1 week)
  useEffect(() => {
    const isFullscreenOptedOut = (): boolean => {
      const exitedAt = localStorage.getItem('fullscreen_exited_at');
      if (!exitedAt) return false;
      const exitedTime = parseInt(exitedAt, 10);
      if (isNaN(exitedTime)) return false;
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - exitedTime > SEVEN_DAYS_MS) {
        localStorage.removeItem('fullscreen_exited_at');
        return false;
      }
      return true;
    };

    const triggerFullscreen = () => {
      if (isFullscreenOptedOut()) return;
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => { });
      }
    };
    triggerFullscreen();
    window.addEventListener('click', triggerFullscreen, { once: true });
    window.addEventListener('pointerdown', triggerFullscreen, { once: true });
    return () => {
      window.removeEventListener('click', triggerFullscreen);
      window.removeEventListener('pointerdown', triggerFullscreen);
    };
  }, []);

  // If user lacks permission for the current path, redirect to next permitted menu item
  const nextPermittedPath = getNextPermittedPath(location.pathname, hasPermission);
  if (nextPermittedPath && nextPermittedPath !== location.pathname) {
    return <Navigate to={nextPermittedPath} replace />;
  }

  // Map pathnames to human readable page titles
  const getPageTitle = (path: string): string => {
    if (path === '/') return 'Dashboard Overview';

    // Split and capitalize path segments
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return 'Dashboard';

    // Capitalize each word and replace hyphens with spaces
    const formatSegment = (s: string) => {
      return s
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };

    if (segments[0] === 'tickets') {
      if (segments[1] === 'create') return 'Create Support Ticket';
      return `${formatSegment(segments[1] || 'all')} Tickets`;
    }
    if (segments[0] === 'stores') {
      if (segments[1] === 'all') return 'Manage Locations';
      return formatSegment(segments[1] || 'stores');
    }
    if (segments[0] === 'maintenance') {
      return `${formatSegment(segments[1] || 'Natures')}`;
    }
    if (segments[0] === 'workforce') {
      return `${formatSegment(segments[1] || 'Employees')}`;
    }
    if (segments[0] === 'expenses' || segments[0] === 'finance') {
      return `Finance — ${formatSegment(segments[1] || 'Claims')}`;
    }
    if (segments[0] === 'reports') {
      return ` ${formatSegment(segments[1] || 'Overview')}`;
    }
    if (segments[0] === 'admin') {
      return ` ${formatSegment(segments[1] || 'Settings')}`;
    }

    return formatSegment(segments[segments.length - 1]);
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface dark:bg-dark-surface transition-colors duration-200">
      {/* Navigation Sidebar Drawer */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Container */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 h-full overflow-hidden">
        {/* Top Header */}
        <Header
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          pageTitle={getPageTitle(location.pathname)}
          isSidebarOpen={sidebarOpen}
        />

        {/* Scrollable Work Area */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-auto p-2.5 sm:p-3 lg:p-4 w-full">
          {children}
        </main>
      </div>
    </div>
  );
};
