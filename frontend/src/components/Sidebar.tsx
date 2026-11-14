import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import {
  Home, Ticket, Store, Wrench, Users, FileBarChart2,
  ChevronDown, X, User, Shield, Building2, Receipt, AlertTriangle
} from 'lucide-react';
import type { RootState } from '../store';
import { usePermission } from '../hooks/usePermission';
import type { PermissionKey } from '@/hooks/Can';
import Can from '@/hooks/Can';

export interface SubItem {
  title: string;
  path: string;
  permission?: PermissionKey | (string & {});
}

export interface MenuItem {
  title: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: SubItem[];
  permission?: PermissionKey | (string & {});
}

export interface FlatMenuItem {
  title: string;
  path: string;
  permission?: PermissionKey | (string & {});
}

// Define sidebar menu structure
export const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    icon: <Home className="w-4 h-4" />,
    path: '/',
    permission: "maintenance.can_view_dashboard"
  },
  {
    title: 'Tickets',
    icon: <Ticket className="w-4 h-4" />,
    path: '/tickets/all',
    permission: "maintenance.can_view_tickets"
  },
  {
    title: 'Locations',
    icon: <Store className="w-4 h-4" />,
    subItems: [
      { title: 'Stores', path: '/stores/all', permission: 'stores.view_store' },
      { title: 'Managers', path: '/stores/managers', permission: 'stores.view_store' },
    ],
  },
  {
    title: 'Department',
    icon: <Wrench className="w-4 h-4" />,
    subItems: [
      { title: 'Sub Departments', path: '/maintenance/sub-departments', permission: 'stores.view_subdepartment' },
      { title: 'Sub Departments Nature', path: '/maintenance/natures', permission: 'maintenance.view_worknature' },
      { title: 'Skilled Workers', path: '/maintenance/worker-assignments', permission: 'maintenance.view_natureworker' },
    ],
  },
  {
    title: 'Workforce',
    icon: <Users className="w-4 h-4" />,
    subItems: [
      { title: 'Employees', path: '/workforce/employees', permission: 'accounts.view_customuser' },
      { title: 'Leave Approvals', path: '/workforce/employees/leave', permission: 'accounts.view_customuser' },
      { title: 'Employee Rates', path: '/workforce/rates', permission: 'finance.view_employeerate' },
    ],
  },
  {
    title: 'Finance System',
    icon: <Receipt className="w-4 h-4" />,
    subItems: [
      { title: 'Expenses', path: '/finance/expenses', permission: 'finance.can_view_expenses' },
      { title: 'Worker Bundles', path: '/finance/bundles', permission: 'finance.can_view_bundles' },
      { title: 'Ledger Batches', path: '/finance/ledgers', permission: 'finance.can_view_ledger' },
      { title: 'Disbursements & Audit', path: '/finance/payments', permission: 'finance.can_view_audit' },
    ],
  },
  {
    title: 'Reports',
    icon: <FileBarChart2 className="w-4 h-4" />,
    subItems: [
      { title: 'All Reports', path: '/reports/all', permission: 'reports.can_generate_report' },
      // { title: 'Audit Logs', path: '/reports/history', permission: 'reports.can_generate_report' },
    ],
  },
  {
    title: 'Complaints',
    icon: <AlertTriangle className="w-4 h-4" />,
    subItems: [
      { title: 'Complaints', path: '/complaints/manager', permission: 'maintenance.can_view_manager_complaint' },
      { title: 'Complaints', path: '/complaints/worker', permission: 'maintenance.can_view_worker_complaint' },
    ],
  }
];

export const getFlatMenuItems = (items: MenuItem[] = menuItems): FlatMenuItem[] => {
  const flat: FlatMenuItem[] = [];
  for (const item of items) {
    if (item.subItems && item.subItems.length > 0) {
      for (const sub of item.subItems) {
        flat.push({
          title: sub.title,
          path: sub.path,
          permission: sub.permission,
        });
      }
    } else if (item.path) {
      flat.push({
        title: item.title,
        path: item.path,
        permission: item.permission,
      });
    }
  }
  return flat;
};

/**
 * Returns the next accessible menu path if the current path requires a permission
 * that the user does not possess.
 */
export const getNextPermittedPath = (
  currentPath: string,
  hasPermission: (perm?: string) => boolean
): string | null => {
  const flatItems = getFlatMenuItems();
  const allowedItems = flatItems.filter((item) => hasPermission(item.permission as string));

  // If no items are allowed at all, avoid redirection loops
  if (allowedItems.length === 0) {
    return null;
  }

  const normalize = (p: string) => p.replace(/\/+$/, '') || '/';
  const normalizedCurrent = normalize(currentPath);

  // 1. Exact match check
  let matchedIndex = flatItems.findIndex((item) => normalize(item.path) === normalizedCurrent);

  // 2. Section prefix match check (e.g. /stores/... or /finance/...)
  if (matchedIndex === -1 && normalizedCurrent !== '/') {
    const segments = normalizedCurrent.split('/').filter(Boolean);
    const sectionPrefix = segments.length > 0 ? `/${segments[0]}` : '';

    if (sectionPrefix) {
      const sectionItems = flatItems.filter((item) => item.path.startsWith(sectionPrefix));
      // If there are menu items in this section and NONE are permitted, mark section as forbidden
      if (sectionItems.length > 0) {
        const anyPermitted = sectionItems.some((item) => hasPermission(item.permission as string));
        if (!anyPermitted) {
          // Use the last item of the forbidden section as reference index
          matchedIndex = flatItems.indexOf(sectionItems[sectionItems.length - 1]);
        }
      }
    }
  }

  // If the path corresponds to a menu item or restricted section
  if (matchedIndex !== -1) {
    const matchedItem = flatItems[matchedIndex];
    const isAllowed = hasPermission(matchedItem.permission as string);

    // If not allowed, redirect to next permitted item in sequence
    if (!isAllowed) {
      const nextAllowed = flatItems
        .slice(matchedIndex + 1)
        .find((item) => hasPermission(item.permission as string));

      if (nextAllowed) {
        return nextAllowed.path;
      }
      // Wrap around to first allowed item
      return allowedItems[0].path;
    }
  }

  return null;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [profileExpanded, setProfileExpanded] = useState(false);

  const { user, accessibleStores } = useSelector((state: RootState) => state.auth);
  const { hasPermission } = usePermission();

  const toggleExpand = (title: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Check if a path or any subitem path matches the current location
  const isPathActive = (path?: string, subItems?: SubItem[]) => {
    if (subItems && subItems.length > 0) {
      return subItems.some((subItem) => location.pathname === subItem.path || (subItem.path.startsWith('/complaints') && location.pathname.startsWith('/complaints')));
    }
    return Boolean(path && location.pathname === path);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-surface-container border-r border-outline-variant w-60 select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="shrink-0 flex items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}icon-192x192.png`} alt="App Logo" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <span className="font-semibold text-sm text-on-surface tracking-tight block leading-none">
              Ticket Manager
            </span>
            {/* <span className="text-[10px] text-on-surface-variant font-medium mt-0.5 block leading-none">
              v1
            </span> */}
          </div>
        </div>

        {/* Close / Collapse Button */}
        <button
          onClick={onClose}
          className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          aria-label="Collapse Sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Menu List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70 px-3 pb-1">
          Navigation
        </div>

        {menuItems
          .map(item => {
            const filteredSubItems = item.subItems?.filter(sub => hasPermission(sub.permission));
            return { ...item, subItems: filteredSubItems };
          })
          .filter(item => {
            if (item.subItems) {
              return item.subItems.length > 0;
            }
            return hasPermission(item.permission);
          })
          .map((item, idx) => {
            const hasMultipleSubItems = item.subItems && item.subItems.length > 1;
            const singleSubItem = item.subItems && item.subItems.length === 1 ? item.subItems[0] : null;

            // Target path, title & permission for 1-level single items
            const targetPath = singleSubItem ? singleSubItem.path : item.path;
            const targetTitle = singleSubItem ? singleSubItem.title : item.title;
            const targetPermission = singleSubItem ? singleSubItem.permission : item.permission;

            const active = isPathActive(targetPath, item.subItems);
            const expanded = expandedMenus[item.title] ?? active;

            return (
              <div key={idx} className="space-y-0.5">
                {/* 2-LEVEL ACCORDION MENU (Sub-items > 1) */}
                {hasMultipleSubItems ? (
                  <div>
                    <button
                      onClick={() => toggleExpand(item.title)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${active
                        ? 'text-primary bg-primary/10 font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={active ? 'text-primary' : 'text-on-surface-variant'}>
                          {item.icon}
                        </span>
                        <span>{item.title}</span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200 ${expanded ? 'transform rotate-180' : ''
                          }`}
                      />
                    </button>

                    {/* Submenu Accordion Container */}
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15, ease: 'easeInOut' }}
                          className="overflow-hidden ml-4 pl-3 border-l border-outline-variant space-y-0.5 my-1"
                        >
                          {item.subItems?.map((sub, subIdx) => {
                            const subActive = location.pathname === sub.path;
                            return (
                              <Link
                                key={subIdx}
                                to={sub.path}
                                onClick={() => {
                                  if (window.innerWidth < 768) onClose();
                                }}
                                className={`block px-2.5 py-1.5 rounded text-xs transition-colors ${subActive
                                  ? 'text-primary bg-primary/10 font-semibold'
                                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                  }`}
                              >
                                {sub.permission ? (
                                  <Can permission={sub.permission}>
                                    {sub.title}
                                  </Can>
                                ) : (
                                  sub.title
                                )}
                              </Link>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  // SINGLE LEVEL ITEM (Direct link with <Can> wrapper)
                  <Link
                    to={targetPath || '#'}
                    onClick={() => {
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors ${location.pathname === targetPath
                      ? 'text-primary bg-primary/10 font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                      }`}
                  >
                    <span className={location.pathname === targetPath ? 'text-primary' : 'text-on-surface-variant'}>
                      {item.icon}
                    </span>
                    {targetPermission ? (
                      <Can permission={targetPermission}>
                        <span>{targetTitle}</span>
                      </Can>
                    ) : (
                      <span>{targetTitle}</span>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
      </div>

      {/* Footer / User Profile Card */}
      {user && (
        <div className="p-3 border-t border-outline-variant bg-surface-container-low shrink-0">
          <button
            onClick={() => setProfileExpanded(!profileExpanded)}
            className="w-full flex items-center justify-between text-left focus:outline-none hover:bg-surface-container-high p-1.5 rounded transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center shrink-0">
                {user.profile_image ? (
                  <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-on-surface-variant" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface truncate leading-tight">
                  {user.full_name}
                </p>
                <p className="text-[10px] text-on-surface-variant truncate font-medium uppercase tracking-wider leading-tight mt-0.5">
                  {user.role || 'User'}
                </p>
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200 ${profileExpanded ? 'transform rotate-180' : ''}`} />
          </button>

          <AnimatePresence initial={false}>
            {profileExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
                className="overflow-hidden space-y-2 pt-2 mt-2 border-t border-outline-variant text-xs text-on-surface-variant"
              >
                <div className="flex items-center gap-2  text-[10px]">
                  <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Emp ID: <span className="font-semibold text-on-surface">{user.employee_no}</span></span>
                </div>

                {user.sub_departments && user.sub_departments.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Wrench className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-on-surface-variant/70 block leading-none">Assigned Departments</span>
                      <span className="font-medium text-on-surface block mt-0.5 text-[11px]">
                        {user.sub_departments.join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {user.natures && user.natures.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Wrench className="w-3.5 h-3.5 text-tertiary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-on-surface-variant/70 block leading-none">Work Skills</span>
                      <span className="font-medium text-on-surface block mt-0.5 text-[11px]">
                        {user.natures.join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {accessibleStores && accessibleStores.length > 0 && (
                  <div className="pt-2.5 border-t border-outline-variant space-y-1.5">
                    <span className="text-[9px] text-on-surface-variant/80 block uppercase tracking-wider font-semibold">
                      Accessible Stores ({accessibleStores.length})
                    </span>
                    <ul className="max-h-32 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                      {accessibleStores.map((s, idx) => (
                        <li
                          key={s.store_id || idx}
                          className="flex items-center gap-1.5 px-2 py-1 bg-surface-container/60 rounded text-[11px] font-medium text-on-surface border border-outline-variant/40"
                        >
                          <Building2 className="w-3 h-3 text-primary shrink-0" />
                          <span className="truncate">{s.store_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Permanent toggleable) */}
      <div className={`hidden md:flex shrink-0 h-screen sticky top-0 z-30 transition-all duration-300 ${isOpen ? 'w-60' : 'w-0 overflow-hidden border-r-0'}`}>
        {sidebarContent}
      </div>

      {/* Mobile Sidebar (Drawer Overlay) */}
      <AnimatePresence>
        {isOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative z-50 flex h-full shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;