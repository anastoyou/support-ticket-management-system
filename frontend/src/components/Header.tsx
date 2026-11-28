import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, User, LogOut, Sun, Moon, ChevronDown,
  Mail, Phone, Shield, MessageSquare, Bell, Maximize, Minimize
} from 'lucide-react';
import type { RootState } from '../store';
import { clearCredentials } from '../store/authSlice';
import {
  enablePushNotifications,
  disablePushNotifications,
  isPushEnabled
} from '@/services/pushNotifications';
import { GlobalApiProgressBar } from './GlobalApiProgressBar';

interface HeaderProps {
  onToggleSidebar: () => void;
  pageTitle: string;
  isSidebarOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, pageTitle, isSidebarOpen }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFsChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (!isFS) {
        // Store exit timestamp for 1 week opt-out before auto going back to fullscreen
        localStorage.setItem('fullscreen_exited_at', Date.now().toString());
      } else {
        localStorage.removeItem('fullscreen_exited_at');
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      localStorage.removeItem('fullscreen_exited_at');
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      localStorage.setItem('fullscreen_exited_at', Date.now().toString());
      document.exitFullscreen().catch(() => { });
    }
  };

  const { user, token } = useSelector((state: RootState) => state.auth);

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/common/notification/`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const results = (data.results || data || []).sort(
          (a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        );
        setNotifications(results);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const handleNotificationReceived = () => {
      fetchNotifications();
    };
    window.addEventListener('notification-received', handleNotificationReceived);
    return () => {
      window.removeEventListener('notification-received', handleNotificationReceived);
    };
  }, [token]);

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    try {
      await Promise.all(
        unread.map(n =>
          fetch(`${API_URL}/common/notification/${n.notification_id}/`, {
            method: 'PATCH',
            headers: {
              Authorization: `Token ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_read: true }),
          })
        )
      );
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (notif: any) => {
    setShowNotificationsDropdown(false);
    if (!notif.is_read) {
      try {
        await fetch(`${API_URL}/common/notification/${notif.notification_id}/`, {
          method: 'PATCH',
          headers: {
            Authorization: `Token ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_read: true }),
        });
        fetchNotifications();
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }

    if (notif.ticket) {
      const ticketId = notif.ticket.ticket_id || notif.ticket;
      navigate(`/tickets/all?ticket_id=${ticketId}`);
    } else {
      navigate('/tickets/all');
    }
  };

  useEffect(() => {
    const handleClickOutsideNotif = (event: MouseEvent) => {
      if (
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowNotificationsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideNotif);
    return () => document.removeEventListener('mousedown', handleClickOutsideNotif);
  }, []);

  useEffect(() => {
    const checkNotificationStatus = async () => {
      try {
        const enabled = await isPushEnabled();
        setNotificationsEnabled(enabled);
      } catch (err) {
        console.error('Failed to check notification status:', err);
      }
    };
    if (user) {
      checkNotificationStatus();
    }

    window.addEventListener('push-subscription-changed', checkNotificationStatus);
    return () => {
      window.removeEventListener('push-subscription-changed', checkNotificationStatus);
    };
  }, [user]);

  const handleToggleNotifications = async () => {
    try {
      setNotificationsLoading(true);
      if (notificationsEnabled) {
        await disablePushNotifications();
        setNotificationsEnabled(false);
        localStorage.setItem('push_notifications_enabled', 'false');
      } else {
        await enablePushNotifications();
        setNotificationsEnabled(true);
        localStorage.setItem('push_notifications_enabled', 'true');
      }
    } catch (err) {
      console.error('Failed to toggle notifications:', err);
      alert(err instanceof Error ? err.message : 'Failed to toggle notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    const isDarkTheme = document.documentElement.classList.contains('dark');
    setIsDark(isDarkTheme);
  }, []);

  // Handle outside clicks to close the user dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleTheme = () => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
      setIsDark(false);
    } else {
      root.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
      setIsDark(true);
    }
  };

  const handleLogout = async () => {
    try {
      await disablePushNotifications();
    } catch (err) {
      console.warn('Failed to unsubscribe push notifications on logout:', err);
    }
    sessionStorage.clear();
    dispatch(clearCredentials());
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 relative flex items-center justify-between px-2 py-1.5 bg-surface-container dark:bg-dark-surface-container border-b border-outline-variant dark:border-dark-outline-variant shadow-sm transition-colors duration-200">
      {/* Top Glowing API Progress Bar (Single Line) */}
      <GlobalApiProgressBar />

      {/* Left section: Hamburger & Breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {!isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg text-on-surface-variant dark:text-dark-on-surface-variant hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high cursor-pointer transition-colors shrink-0"
            aria-label="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className={`min-w-0 flex-1 ${isSidebarOpen ? "pl-1" : ""}`}>
          <h2 className="text-sm sm:text-base lg:text-lg text-on-surface dark:text-dark-on-surface tracking-tight leading-tight truncate">
            {pageTitle}
          </h2>
        </div>
      </div>

      {/* Right section: Action controls & Profile */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Latest Notifications Dropdown Button */}
        <div className="relative" ref={notificationDropdownRef}>
          <button
            onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
            className="p-1 mt-1 rounded-lg text-on-surface-variant dark:text-dark-on-surface-variant hover:bg-surface-container-low dark:hover:bg-dark-surface-container-low cursor-pointer transition-colors relative"
            aria-label="View notifications"
          >
            <Bell className="w-5 h-5" />
            {notifications.filter(n => !n.is_read).length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </button>

          {/* Notifications Dropdown Card */}
          <AnimatePresence>
            {showNotificationsDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-x-4 top-[56px] sm:absolute sm:right-0 sm:inset-auto sm:mt-2.5 sm:w-96 bg-surface-container-high dark:bg-dark-surface-container-high rounded-xl shadow-xl border border-outline-variant dark:border-dark-outline-variant overflow-hidden z-30"
              >
                <div className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-dark-surface-container-low border-b border-outline-variant dark:border-dark-outline-variant">
                  <h3 className="font-bold text-sm text-on-surface dark:text-dark-on-surface flex items-center gap-2">
                    <span>Notifications</span>
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                        {notifications.filter(n => !n.is_read).length} new
                      </span>
                    )}
                  </h3>
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-xs text-primary hover:underline font-semibold cursor-pointer border-none bg-transparent p-0"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="max-h-[360px] overflow-y-auto divide-y divide-outline-variant/30 dark:divide-dark-outline-variant/30">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-xs text-outline">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.slice(0, 8).map(notif => (
                      <div
                        key={notif.notification_id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`flex gap-3 p-4 hover:bg-surface-container-low dark:hover:bg-dark-surface-container-low transition-colors cursor-pointer text-left relative ${!notif.is_read ? 'bg-primary/5 dark:bg-primary/10' : ''
                          }`}
                      >
                        {/* Status Dot */}
                        {!notif.is_read && (
                          <div className="absolute top-4 left-2 w-1.5 h-1.5 bg-primary rounded-full" />
                        )}

                        <div className="flex-1 min-w-0 pl-1">
                          <p className="text-xs font-bold text-on-surface dark:text-dark-on-surface truncate">
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant mt-0.5 line-clamp-2 leading-relaxed">
                            {notif.message}
                          </p>
                          <span className="text-[9px] text-outline mt-1.5 block">
                            {new Date(notif.created_date).toLocaleString()}
                          </span>
                        </div>

                        {notif.image && (
                          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-outline-variant/30 dark:border-dark-outline-variant/30 bg-surface-container">
                            <img
                              src={notif.image.startsWith('/') ? `${API_URL.replace('/api', '')}${notif.image}` : notif.image}
                              alt="Notification media"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 bg-surface-container-low dark:bg-dark-surface-container-low border-t border-outline-variant dark:border-dark-outline-variant text-center">
                  <button
                    onClick={() => {
                      setShowNotificationsDropdown(false);
                      navigate('/tickets/all');
                    }}
                    className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant hover:text-primary transition-colors font-semibold cursor-pointer border-none bg-transparent"
                  >
                    View all tickets
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          className="p-1 rounded-lg text-on-surface-variant dark:text-dark-on-surface-variant hover:bg-surface-container-low dark:hover:bg-dark-surface-container-low cursor-pointer transition-colors"
          aria-label="Toggle Fullscreen"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
        >
          {isFullscreen ? <Minimize className="w-5 h-5 text-primary" /> : <Maximize className="w-5 h-5 text-on-surface-variant" />}
        </button>

        {/* Inline Theme Switcher */}
        <button
          onClick={handleToggleTheme}
          className="p-1 rounded-lg text-on-surface-variant dark:text-dark-on-surface-variant hover:bg-surface-container-low dark:hover:bg-dark-surface-container-low cursor-pointer transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
        </button>

        {/* Vertical divider */}
        <div className="w-px h-6 bg-outline-variant dark:bg-dark-outline-variant" />

        {/* User Dropdown Ref */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-surface-container-low dark:hover:bg-dark-surface-container-low transition-colors cursor-pointer text-left focus:outline-none"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant dark:border-dark-outline-variant bg-surface flex items-center justify-center">
              {user?.profile_image ? (
                <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-outline" />
              )}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-on-surface dark:text-dark-on-surface max-w-[120px] truncate leading-tight">
                {user?.full_name || 'Guest User'}
              </p>
              <p className="text-[10px] text-on-surface-variant dark:text-dark-on-surface-variant capitalize">
                {(user?.role as any)?.role_name || user?.role || 'User'}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-outline hidden sm:block" />
          </button>

          {/* User Profile Overlay menu */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2.5 w-72 max-w-[calc(100vw-1rem)] bg-surface-container-high dark:bg-dark-surface-container-high rounded-xl shadow-xl border border-outline-variant dark:border-dark-outline-variant overflow-hidden"
              >
                {/* Header User Card */}
                <div className="p-5 bg-surface-container-low dark:bg-dark-surface-container-low border-b border-outline-variant dark:border-dark-outline-variant text-center">
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary mx-auto mb-3 bg-surface flex items-center justify-center shadow-sm">
                    {user?.profile_image ? (
                      <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-outline" />
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-on-surface dark:text-dark-on-surface leading-tight">
                    {user?.full_name}
                  </h4>
                  <span className="inline-block mt-1 py-0.5 px-2.5 bg-primary/10 dark:bg-primary/20 text-primary text-[10px] font-bold uppercase rounded-full">
                    {(user?.role as any)?.role_name || user?.role || 'Unassigned'}
                  </span>
                </div>

                {/* Details Section */}
                <div className="p-4 space-y-3 border-b border-outline-variant dark:border-dark-outline-variant text-xs text-on-surface-variant dark:text-dark-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-outline" />
                    <span>ID: <span className="font-semibold text-on-surface dark:text-dark-on-surface">{user?.employee_no}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-outline" />
                    <span className="truncate">{user?.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-outline" />
                    <span>{user?.phone}</span>
                  </div>
                  {user?.whatsapp_number && (
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-outline" />
                      <span>{user?.whatsapp_number}</span>
                    </div>
                  )}
                  {/* Push Notifications Toggle */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 dark:border-dark-outline-variant/30">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-outline" />
                      <span>Push Notifications</span>
                    </div>
                    {notificationsEnabled ? (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">Active</span>
                    ) : (
                      <button
                        onClick={handleToggleNotifications}
                        disabled={notificationsLoading}
                        type="button"
                        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-outline-variant/50"
                        aria-label="Enable notifications"
                      >
                        <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out translate-x-0" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Edit Profile Trigger */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    window.dispatchEvent(new Event('open-profile-edit'));
                  }}
                  className="w-full flex items-center gap-2 px-5 py-3 bg-transparent hover:bg-surface-container-highest dark:hover:bg-dark-surface-container-highest text-on-surface dark:text-dark-on-surface font-semibold text-xs transition-colors cursor-pointer text-left border-none border-b border-outline-variant/30 dark:border-dark-outline-variant/30"
                >
                  <User className="w-4 h-4 text-primary" />
                  <span>Edit Profile Details</span>
                </button>

                {/* Logout Trigger */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-5 py-3.5 hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold text-xs transition-colors cursor-pointer text-left border-none"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out Session</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};
