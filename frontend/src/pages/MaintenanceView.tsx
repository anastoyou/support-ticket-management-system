import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import Can from '@/hooks/Can';
import { usePermission } from '@/hooks/usePermission';
import { SearchableSelect } from '@/components/SearchableSelect';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, X, Loader2, AlertCircle, Menu,
  ChevronLeft, ChevronRight, AlertTriangle,
  LayoutList, GitFork, Building2, FolderTree, Wrench, User,
  ShieldAlert, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import type { RootState } from '../store';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── AG Grid Token Theme ─────────────────────────────────────────────────────
const appTheme = themeQuartz.withParams({
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  rowHeight: 48,
  headerHeight: 40,
  cellHorizontalPaddingScale: 1.2,
  backgroundColor: '#ffffff',
  foregroundColor: '#191c1d',
  headerBackgroundColor: '#f3f4f5',
  headerTextColor: '#414754',
  rowHoverColor: '#e7e8e9',
  borderColor: '#E0E2E6',
  accentColor: '#005bbf',
  spacing: 6,
  wrapperBorderRadius: 4,
});

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface LineConnection {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const MaintenanceView: React.FC = () => {
  const { subpage } = useParams<{ subpage: string }>();
  const { token, user } = useSelector((state: RootState) => state.auth);

  // View Mode: 'table' | 'flowchart'
  const [viewMode, setViewMode] = useState<'table' | 'flowchart'>('flowchart');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const [flowZoom, setFlowZoom] = useState<number>(1);
  const [resetDragKey, setResetDragKey] = useState<number>(0);
  const [isMobile, setIsMobile] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const getActionLabel = (isEdit = false) => {
    const prefix = isEdit ? 'Edit ' : 'Add ';
    if (subpage === 'natures') return prefix + 'Nature';
    if (subpage === 'worker-assignments') return prefix + 'Assignment';
    return prefix + 'Sub Department';
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // States
  const [data, setData] = useState<any[]>([]);
  const [extraDepts, setExtraDepts] = useState<any[]>([]);
  const [extraSubs, setExtraSubs] = useState<any[]>([]);
  const [extraPriorities, setExtraPriorities] = useState<any[]>([]);
  const [extraNatures, setExtraNatures] = useState<any[]>([]);
  const [workerAssignments, setWorkerAssignments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // SVG Line Connections State & Ref
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<LineConnection[]>([]);

  // Priority Modal States
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [priorityActionLoading, setPriorityActionLoading] = useState(false);
  const [priorityErrorMsg, setPriorityErrorMsg] = useState('');
  const [priorityForm, setPriorityForm] = useState({
    department: '',
    priority_name: '',
    level: 1
  });

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [gridApi, setGridApi] = useState<any>(null);

  const onGridReady = (params: any) => {
    setGridApi(params.api);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, subpage]);

  useEffect(() => {
    if (gridApi) {
      gridApi.paginationGoToPage(currentPage - 1);
    }
  }, [currentPage, gridApi]);

  useEffect(() => {
    if (gridApi) {
      gridApi.setGridOption('paginationPageSize', itemsPerPage);
    }
  }, [itemsPerPage, gridApi]);

  // Modal target type state
  const [activeModalType, setActiveModalType] = useState<'natures' | 'sub-departments' | 'worker-assignments'>('natures');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  // Forms state
  const [natureForm, setNatureForm] = useState({
    nature_name: '',
    sub_department: '',
    default_priority: '',
    active: true
  });
  const [workerAssignmentForm, setWorkerAssignmentForm] = useState({
    nature: '',
    worker: ''
  });
  const [subDeptForm, setSubDeptForm] = useState({
    department: '',
    sub_department_name: ''
  });

  // Safe fetch helper
  const safeFetch = async (endpoint: string) => {
    if (!token) return null;
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Token ${token}` }
      });
      if (res.ok) return await res.json();
      return null;
    } catch {
      return null;
    }
  };

  const fetchPriorities = async () => {
    const resPri = await safeFetch('/maintenance/priority/');
    if (Array.isArray(resPri)) {
      setExtraPriorities(resPri);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const [depts, subs, natures, workers, priorities, customUsers] = await Promise.all([
        safeFetch('/stores/department/'),
        safeFetch('/stores/subdepartment/'),
        safeFetch('/maintenance/worknature/'),
        safeFetch('/maintenance/natureworker/'),
        safeFetch('/maintenance/priority/'),
        safeFetch('/accounts/customuser/')
      ]);

      const filteredSubs = Array.isArray(subs) ? subs : [];
      const filteredNatures = Array.isArray(natures) ? natures : [];
      const filteredWorkers = Array.isArray(workers) ? workers : [];

      if (Array.isArray(depts)) setExtraDepts(depts);
      setExtraSubs(filteredSubs);
      setExtraNatures(filteredNatures);
      setWorkerAssignments(filteredWorkers);
      if (Array.isArray(priorities)) setExtraPriorities(priorities);

      if (Array.isArray(customUsers)) {
        setUsers(customUsers.filter((u: any) => {
          const roleName = (u.role as any)?.role_name?.toLowerCase() || (u.role as string)?.toLowerCase();
          return roleName === 'technician' || roleName === 'worker';
        }));
      }

      if (subpage === 'natures') {
        setData(filteredNatures);
      } else if (subpage === 'worker-assignments') {
        setData(filteredWorkers);
      } else if (subpage === 'sub-departments') {
        setData(filteredSubs);
      }
    } catch {
      setErrorMsg('Failed to load maintenance configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [subpage, token]);

  const columnDefs = useMemo<ColDef[]>(() => {
    const editActionCellRenderer = (params: any) => {
      const item = params.data;
      if (!item) return null;
      return (
        <div className="flex items-center gap-1 h-full">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(item);
            }}
            className="p-1.5 .border .border-primary/30 .bg-primary/10 text-primary hover:bg-primary/20 rounded cursor-pointer transition-colors inline-flex"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <Can permission={
            subpage === 'natures' ? 'maintenance.delete_worknature' :
              subpage === 'worker-assignments' ? 'maintenance.delete_natureworker' :
                'stores.delete_subdepartment'
          }>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item.nature_id || item.nature_worker_id || item.sub_department_id);
              }}
              className="p-1.5 .border .border-error/30 .bg-error-container/40 text-on-error-container hover:bg-error-container rounded cursor-pointer transition-colors inline-flex"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Can>
        </div>
      );
    };

    if (subpage === 'natures') {
      const cols: ColDef[] = [
        { headerName: 'Nature ID', field: 'nature_id', width: 110, cellClass: ' text-xs' },
        { headerName: 'Sub Department', field: 'sub_department.sub_department_name', flex: 1, minWidth: 150, valueGetter: p => p.data?.sub_department?.sub_department_name || 'N/A' },
        { headerName: 'Nature Name', flex: 2, minWidth: 180, cellClass: 'font-medium text-on-surface', field: 'nature_name' },
        {
          headerName: 'Default Priority',
          field: 'default_priority.priority_name',
          flex: 1,
          minWidth: 140,
          cellRenderer: (params: any) => {
            const val = params.data?.default_priority?.priority_name;
            if (!val) return <span className="text-on-surface-variant italic">None</span>;
            return (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-tertiary-container/20 text-tertiary">
                {val}
              </span>
            );
          }
        },
        {
          headerName: 'Status',
          field: 'active',
          width: 100,
          cellRenderer: (params: any) => (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${params.value
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-error-container text-on-error-container'
                }`}
            >
              {params.value ? 'Active' : 'Inactive'}
            </span>
          )
        }
      ];
      if (!isMobile) {
        cols.push({ headerName: 'Actions', width: 90, cellRenderer: editActionCellRenderer, sortable: false, filter: false });
      }
      return cols;
    } else if (subpage === 'worker-assignments') {
      const cols: ColDef[] = [
        { headerName: 'ID', field: 'nature_worker_id', width: 90, cellClass: ' text-xs' },
        { headerName: 'Nature of Work', field: 'nature.nature_name', flex: 2, minWidth: 200, cellClass: 'font-medium text-on-surface', valueGetter: p => p.data?.nature?.nature_name || 'N/A' },
        { headerName: 'Assigned Technician', field: 'worker.full_name', flex: 1.5, minWidth: 180, valueGetter: p => p.data?.worker?.full_name || 'N/A' }
      ];
      if (!isMobile) {
        cols.push({ headerName: 'Actions', width: 90, cellRenderer: editActionCellRenderer, sortable: false, filter: false });
      }
      return cols;
    } else if (subpage === 'sub-departments') {
      const cols: ColDef[] = [
        { headerName: 'ID', field: 'sub_department_id', width: 90, cellClass: ' text-xs' },
        { headerName: 'Parent Department', field: 'department.department_name', flex: 1.5, minWidth: 180, valueGetter: p => p.data?.department?.department_name || 'N/A' },
        { headerName: 'Sub Department Name', field: 'sub_department_name', flex: 2, minWidth: 200, cellClass: 'font-medium text-on-surface' }
      ];
      if (!isMobile) {
        cols.push({ headerName: 'Actions', width: 90, cellRenderer: editActionCellRenderer, sortable: false, filter: false });
      }
      return cols;
    }
    return [];
  }, [subpage, isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  const handleOpenCreate = () => {
    setEditItem(null);
    const target = (subpage as 'natures' | 'sub-departments' | 'worker-assignments') || 'natures';
    setActiveModalType(target);
    setNatureForm({ nature_name: '', sub_department: '', default_priority: '', active: true });
    setWorkerAssignmentForm({ nature: '', worker: '' });
    setSubDeptForm({ department: allowedDepts.length === 1 ? String(allowedDepts[0].department_id) : '', sub_department_name: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (item: any, typeOverride?: 'natures' | 'sub-departments' | 'worker-assignments') => {
    setEditItem(item);
    const targetType = typeOverride || (subpage as 'natures' | 'sub-departments' | 'worker-assignments') || 'natures';
    setActiveModalType(targetType);

    if (targetType === 'natures') {
      setNatureForm({
        nature_name: item.nature_name || '',
        sub_department: String(item.sub_department?.sub_department_id ?? item.sub_department ?? ''),
        default_priority: String(item.default_priority?.priority_id ?? item.default_priority ?? ''),
        active: item.active ?? true
      });
    } else if (targetType === 'worker-assignments') {
      setWorkerAssignmentForm({
        nature: String(item.nature?.nature_id ?? item.nature ?? ''),
        worker: String(item.worker?.user_id ?? item.worker ?? '')
      });
    } else if (targetType === 'sub-departments') {
      setSubDeptForm({
        department: String(item.department?.department_id ?? item.department ?? ''),
        sub_department_name: item.sub_department_name || ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');

    let endpoint = '';
    const method = editItem ? 'PATCH' : 'POST';
    let bodyData: any = {};

    if (activeModalType === 'natures') {
      endpoint = editItem ? `/maintenance/worknature/${editItem.nature_id}/` : `/maintenance/worknature/`;
      bodyData = {
        nature_name: natureForm.nature_name,
        sub_department: natureForm.sub_department,
        default_priority: natureForm.default_priority || null,
        active: natureForm.active
      };
    } else if (activeModalType === 'worker-assignments') {
      endpoint = editItem ? `/maintenance/natureworker/${editItem.nature_worker_id}/` : `/maintenance/natureworker/`;
      bodyData = workerAssignmentForm;
    } else if (activeModalType === 'sub-departments') {
      endpoint = editItem ? `/stores/subdepartment/${editItem.sub_department_id}/` : `/stores/subdepartment/`;
      bodyData = subDeptForm;
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData)
      });

      if (response.ok) {
        setShowModal(false);
        fetchData();
      } else {
        const errorRes = await response.json();
        setErrorMsg(Object.values(errorRes).flat().join(', ') || 'Failed to save changes.');
      }
    } catch {
      setErrorMsg('Network error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: number, typeOverride?: 'natures' | 'sub-departments' | 'worker-assignments') => {
    if (!window.confirm('Are you sure you want to delete this configuration?')) return;
    setErrorMsg('');
    const targetType = typeOverride || (subpage as 'natures' | 'sub-departments' | 'worker-assignments') || 'natures';
    let endpoint = '';
    if (targetType === 'natures') endpoint = `/maintenance/worknature/${id}/`;
    else if (targetType === 'worker-assignments') endpoint = `/maintenance/natureworker/${id}/`;
    else if (targetType === 'sub-departments') endpoint = `/stores/subdepartment/${id}/`;

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` }
      });
      if (response.ok) {
        fetchData();
      } else {
        const errorRes = await response.json().catch(() => null);
        let errorText = 'Failed to delete item.';
        if (errorRes) {
          if (typeof errorRes === 'string') errorText = errorRes;
          else if (errorRes.detail) errorText = String(errorRes.detail);
          else if (errorRes.non_field_errors) errorText = Array.isArray(errorRes.non_field_errors) ? errorRes.non_field_errors.join(', ') : String(errorRes.non_field_errors);
          else if (typeof errorRes === 'object') {
            const messages = Object.values(errorRes).flat();
            if (messages.length > 0) errorText = messages.map(m => String(m)).join(', ');
          }
        }
        setErrorMsg(errorText);
      }
    } catch {
      setErrorMsg('Network error.');
    }
  };

  const handleCreatePriority = async (e: React.FormEvent) => {
    e.preventDefault();
    setPriorityActionLoading(true);
    setPriorityErrorMsg('');
    try {
      const response = await fetch(`${API_URL}/maintenance/priority/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(priorityForm)
      });
      if (response.ok) {
        const created = await response.json();
        setPriorityForm({ department: '', priority_name: '', level: 1 });
        await fetchPriorities();
        if (created?.priority_id) {
          setNatureForm(prev => ({ ...prev, default_priority: String(created.priority_id) }));
        }
      } else {
        const errorRes = await response.json();
        setPriorityErrorMsg(Object.values(errorRes).flat().join(', ') || 'Failed to add priority.');
      }
    } catch {
      setPriorityErrorMsg('Network error.');
    } finally {
      setPriorityActionLoading(false);
    }
  };

  const handleDeletePriority = async (id: number) => {
    if (!window.confirm('Delete this priority level?')) return;
    setPriorityErrorMsg('');
    try {
      const response = await fetch(`${API_URL}/maintenance/priority/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` }
      });
      if (response.ok) {
        await fetchPriorities();
      } else {
        const errorRes = await response.json().catch(() => null);
        let errorText = 'Failed to delete priority.';
        if (errorRes) {
          if (typeof errorRes === 'string') errorText = errorRes;
          else if (errorRes.detail) errorText = String(errorRes.detail);
          else if (errorRes.non_field_errors) errorText = Array.isArray(errorRes.non_field_errors) ? errorRes.non_field_errors.join(', ') : String(errorRes.non_field_errors);
          else if (typeof errorRes === 'object') {
            const messages = Object.values(errorRes).flat();
            if (messages.length > 0) errorText = messages.map(m => String(m)).join(', ');
          }
        }
        setPriorityErrorMsg(errorText);
      }
    } catch {
      setPriorityErrorMsg('Network error.');
    }
  };

  const { hasPermission } = usePermission();

  const canViewAllDepartmentTrees = useMemo(() => {
    const roleName = (user?.role as any)?.role_name?.toLowerCase() || (user?.role as string)?.toLowerCase();
    const isAdminRole = roleName === 'admin' || roleName === 'administrator' || roleName === 'main_admin' || roleName === 'main administrator';
    return (
      user?.is_superuser ||
      isAdminRole ||
      hasPermission('maintenance.view_all_department_tickets') ||
      hasPermission('maintenance.create_ticket_all_departments')
    );
  }, [user, hasPermission]);

  const getLoggedInUserDepartmentIds = (): Set<number> | null => {
    if (canViewAllDepartmentTrees) return null;
    if (!user?.sub_departments || user.sub_departments.length === 0) return new Set<number>();
    const deptIds = new Set<number>();
    user.sub_departments.forEach((sd: any) => {
      let sdObj = sd;
      if (typeof sd === 'string' || typeof sd === 'number') {
        sdObj = extraSubs.find(item =>
          item.sub_department_id === Number(sd) ||
          item.sub_department_name?.toLowerCase() === String(sd).toLowerCase()
        );
      }
      if (sdObj) {
        const parentDeptId = Number(sdObj.department?.department_id ?? sdObj.department);
        if (parentDeptId) {
          deptIds.add(parentDeptId);
        }
      } else if (sd && typeof sd === 'object') {
        const parentDeptId = Number(sd.department?.department_id ?? sd.department);
        if (parentDeptId) {
          deptIds.add(parentDeptId);
        }
      }
    });
    return deptIds;
  };

  const userDeptIds = getLoggedInUserDepartmentIds();
  const allowedDepts = userDeptIds
    ? extraDepts.filter(d => userDeptIds.has(Number(d.department_id)))
    : extraDepts;

  const allowedSubs = userDeptIds
    ? extraSubs.filter(s => {
      const sDeptId = Number(s.department?.department_id ?? s.department);
      return userDeptIds.has(sDeptId);
    })
    : extraSubs;

  const allowedPriorities = userDeptIds
    ? extraPriorities.filter(p => userDeptIds.has(Number(p.department?.department_id ?? p.department)))
    : extraPriorities;

  const allowedNatures = userDeptIds
    ? extraNatures.filter(n => {
      const sdId = n.sub_department?.sub_department_id ?? n.sub_department;
      const sd = extraSubs.find(s => s.sub_department_id === Number(sdId));
      const deptId = Number(sd?.department?.department_id ?? sd?.department);
      return userDeptIds.has(deptId);
    })
    : extraNatures;

  // Department of the selected sub-department in Nature Form
  const selectedSubDeptObj = extraSubs.find(s => String(s.sub_department_id) === String(natureForm.sub_department));
  const selectedSubDeptDeptId = selectedSubDeptObj ? Number(selectedSubDeptObj.department?.department_id ?? selectedSubDeptObj.department) : null;

  const natureFormPriorities = selectedSubDeptDeptId
    ? extraPriorities.filter(p => Number(p.department?.department_id ?? p.department) === selectedSubDeptDeptId)
    : extraPriorities;

  // Filter technicians for worker-assignment form
  const filteredUsers = useMemo(() => {
    if (!workerAssignmentForm.nature) return users;

    const selectedNature = allowedNatures.find(n => String(n.nature_id) === String(workerAssignmentForm.nature));
    if (!selectedNature) return users;

    const natureSubDeptId = selectedNature.sub_department?.sub_department_id ?? selectedNature.sub_department;
    const natureSubDept = extraSubs.find(s => String(s.sub_department_id) === String(natureSubDeptId));
    const natureDeptId = natureSubDept?.department?.department_id ?? natureSubDept?.department;

    if (!natureDeptId) return users;

    return users.filter(u => {
      if (!u.sub_departments || u.sub_departments.length === 0) return false;
      return u.sub_departments.some((userSd: any) => {
        const userSdId = typeof userSd === 'object' ? userSd.sub_department_id : userSd;
        const uSubDept = extraSubs.find(s => String(s.sub_department_id) === String(userSdId));
        const uDeptId = uSubDept?.department?.department_id ?? uSubDept?.department;
        return String(uDeptId) === String(natureDeptId);
      });
    });
  }, [workerAssignmentForm.nature, allowedNatures, extraSubs, users]);

  // Hierarchical flowchart data model
  const treeData = useMemo(() => {
    const sTerm = search.toLowerCase().trim();

    return allowedDepts.map(dept => {
      const subs = allowedSubs.filter(s => {
        const dId = s.department?.department_id ?? s.department;
        return Number(dId) === Number(dept.department_id);
      });

      const subsWithNatures = subs.map(sub => {
        const natures = allowedNatures.filter(n => {
          const sdId = n.sub_department?.sub_department_id ?? n.sub_department;
          return Number(sdId) === Number(sub.sub_department_id);
        }).map(nat => {
          const assignedWorkers = workerAssignments.filter(w => {
            const nId = w.nature?.nature_id ?? w.nature;
            return Number(nId) === Number(nat.nature_id);
          });
          return { ...nat, assignedWorkers };
        });

        const filteredNatures = sTerm
          ? natures.filter(n =>
            n.nature_name?.toLowerCase().includes(sTerm) ||
            n.assignedWorkers.some((w: any) => w.worker?.full_name?.toLowerCase().includes(sTerm))
          )
          : natures;

        return {
          ...sub,
          natures: filteredNatures,
          totalNaturesCount: natures.length
        };
      });

      const filteredSubs = sTerm
        ? subsWithNatures.filter(s =>
          s.sub_department_name?.toLowerCase().includes(sTerm) ||
          s.natures.length > 0
        )
        : subsWithNatures;

      return {
        ...dept,
        subDepartments: filteredSubs,
        totalSubsCount: subs.length
      };
    }).filter(dept => {
      if (allowedDepts.length > 1 && selectedDeptFilter !== 'all' && String(dept.department_id) !== String(selectedDeptFilter)) {
        return false;
      }
      if (!sTerm) return true;
      return dept.department_name?.toLowerCase().includes(sTerm) || dept.subDepartments.length > 0;
    });
  }, [allowedDepts, allowedSubs, allowedNatures, workerAssignments, search, selectedDeptFilter]);

  // Dynamic SVG Line calculation between Flowchart Tiers
  const recalculateLines = () => {
    if (!treeContainerRef.current) return;
    const containerRect = treeContainerRef.current.getBoundingClientRect();
    const childNodes = treeContainerRef.current.querySelectorAll<HTMLElement>('[data-parent-id]');
    const newConnections: LineConnection[] = [];

    childNodes.forEach(child => {
      const parentId = child.getAttribute('data-parent-id');
      if (!parentId) return;
      const parent = treeContainerRef.current?.querySelector<HTMLElement>(`[data-node-id="${parentId}"]`);
      if (!parent) return;

      const pRect = parent.getBoundingClientRect();
      const cRect = child.getBoundingClientRect();

      const fromX = (pRect.left + pRect.width / 2 - containerRect.left) / flowZoom;
      const fromY = (pRect.bottom - containerRect.top) / flowZoom;
      const toX = (cRect.left + cRect.width / 2 - containerRect.left) / flowZoom;
      const toY = (cRect.top - containerRect.top) / flowZoom;

      newConnections.push({
        id: `${parentId}->${child.getAttribute('data-node-id')}`,
        fromX,
        fromY,
        toX,
        toY
      });
    });

    setConnections(newConnections);
  };

  useLayoutEffect(() => {
    if (viewMode !== 'flowchart' || !treeContainerRef.current) return;

    const timeout = setTimeout(recalculateLines, 100);
    window.addEventListener('resize', recalculateLines);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', recalculateLines);
    };
  }, [treeData, viewMode, flowZoom, selectedDeptFilter, resetDragKey]);

  const filteredData = data.filter(item => {
    const text = (item.nature_name || item.sub_department_name || item.worker?.full_name || '').toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col gap-2">
      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3 rounded bg-error-container text-on-error-container text-xs flex items-center gap-2 border border-error/30">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Main Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative shrink-0 w-full sm:w-[220px] md:w-[260px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder={viewMode === 'flowchart' ? 'Search hierarchy...' : 'Search table...'}
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              if (viewMode === 'table' && gridApi) {
                gridApi.setGridOption('quickFilterText', e.target.value);
              }
            }}
            className="w-full bg-surface-container border border-outline text-on-surface text-xs rounded pl-8 pr-8 py-2 focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/60"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                if (viewMode === 'table' && gridApi) {
                  gridApi.setGridOption('quickFilterText', '');
                }
              }}
              className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-end justify-end gap-2 flex-wrap">
          {/* Table / Flowchart View Switcher (Desktop Only) */}
          <div className="hidden sm:flex items-center bg-surface-container-low border border-outline-variant rounded p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${viewMode === 'table'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
                }`}
              title="Table View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              onClick={() => setViewMode('flowchart')}
              className={`p-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${viewMode === 'flowchart'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
                }`}
              title="Flowchart Tree Diagram"
            >
              <GitFork className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Flowchart</span>
            </button>
          </div>

          {/* Manage Priorities (visible in 'natures' subpage) */}
          {subpage === 'natures' && (
            <Can permission={['maintenance.add_priority', 'maintenance.change_priority']}>
              <button
                type="button"
                onClick={() => {
                  setPriorityErrorMsg('');
                  setShowPriorityModal(true);
                }}
                className="hidden sm:flex border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-2 rounded items-center gap-2 cursor-pointer transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-tertiary" />
                <span>Manage Priorities</span>
              </button>
            </Can>
          )}

          {/* Add Configuration Button */}
          <Can permission={
            subpage === 'natures' ? 'maintenance.add_worknature' :
              subpage === 'worker-assignments' ? 'maintenance.add_natureworker' :
                'stores.add_subdepartment'
          }>
            <button
              onClick={handleOpenCreate}
              className="hidden sm:flex bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-2 rounded items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{getActionLabel(false)}</span>
            </button>
          </Can>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 w-full bg-surface-container-high animate-pulse rounded" />
          ))}
        </div>
      ) : viewMode === 'flowchart' ? (
        /* ══════════════════════════════════════════════════════════════════════
           TOP-DOWN FLOWCHART TREE DIAGRAM
           ══════════════════════════════════════════════════════════════════════ */
        <div className="border border-outline-variant bg-surface rounded overflow-hidden flex flex-col">
          {/* Top Bar for Flowchart */}
          <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between gap-3 flex-wrap">
            {/* Show department filter ONLY when multiple departments exist */}
            {allowedDepts.length > 1 && (
              <div className="flex items-center gap-2 min-w-[180px]">
                <span className="text-xs font-medium text-on-surface-variant shrink-0">Filter Dept:</span>
                <SearchableSelect
                  value={selectedDeptFilter}
                  onChange={val => setSelectedDeptFilter(val)}
                  placeholder={`All Departments (${allowedDepts.length})`}
                  options={[
                    { value: 'all', label: `All Departments (${allowedDepts.length})` },
                    ...allowedDepts.map(d => ({ value: d.department_id, label: d.department_name }))
                  ]}
                />
              </div>
            )}

            {/* Zoom / Scale Controls */}
            <div className="flex items-center gap-1 bg-surface-container border border-outline-variant rounded p-1 ml-auto">
              <button
                type="button"
                onClick={() => setFlowZoom(prev => Math.max(0.5, prev - 0.1))}
                className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs  px-1.5 text-on-surface font-medium">
                {Math.round(flowZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setFlowZoom(prev => Math.min(1.4, prev + 0.1))}
                className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlowZoom(1);
                  setResetDragKey(prev => prev + 1);
                  setTimeout(recalculateLines, 50);
                }}
                className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded cursor-pointer ml-1 border-l border-outline-variant pl-1.5"
                title="Reset Diagram Layout & Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Diagram Canvas Container */}
          <div
            onWheel={(e) => {
              // Smooth scroll wheel zoom
              const delta = e.deltaY < 0 ? 0.08 : -0.08;
              setFlowZoom(prev => Math.min(2.0, Math.max(0.4, Number((prev + delta).toFixed(2)))));
            }}
            className="relative overflow-hidden p-6 h-[clamp(340px,calc(100dvh-235px),780px)] bg-surface-container-lowest flex items-center justify-center select-none"
          >

            {/* Tree Flow Graph Canvas - Instant Draggable Entire UI */}
            <motion.div
              key={`tree-canvas-${resetDragKey}`}
              ref={treeContainerRef}
              drag
              dragMomentum={false}
              dragElastic={0}
              onDrag={recalculateLines}
              style={{ scale: flowZoom, transformOrigin: 'center center' }}
              className="relative z-10 flex flex-col items-center justify-center gap-16 min-w-max pb-12 mx-auto cursor-grab active:cursor-grabbing touch-none select-none"
            >
              {/* Solid Continuous SVG Connector Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
                <defs>
                  <marker
                    id="flow-arrow"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#005bbf" />
                  </marker>
                </defs>
                {connections.map(c => (
                  <path
                    key={c.id}
                    d={`M ${c.fromX} ${c.fromY} C ${c.fromX} ${c.fromY + 28}, ${c.toX} ${c.toY - 28}, ${c.toX} ${c.toY}`}
                    fill="none"
                    stroke="#005bbf"
                    strokeWidth="2"
                    markerEnd="url(#flow-arrow)"
                  />
                ))}
              </svg>

              {treeData.length === 0 ? (
                <div className="p-12 text-center text-on-surface-variant text-xs bg-surface-container border border-outline-variant rounded">
                  No hierarchy records found.
                </div>
              ) : (
                treeData.map(dept => (
                  <div key={dept.department_id} className="flex flex-col items-center justify-center gap-14 w-full">

                    {/* ── LEVEL 1: ROOT DEPARTMENT CARD ── */}
                    <div
                      data-node-id={`dept-${dept.department_id}`}
                      className="relative z-10 flex flex-col items-center justify-center min-w-[240px] max-w-[280px] p-3.5 bg-surface-container border-2 border-primary rounded shadow-xs text-center"
                    >
                      <div className="flex items-center justify-center gap-1.5 text-primary font-semibold text-xs mb-0.5">
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span className="font-bold">{dept.department_name}</span>
                      </div>
                      <span className=" text-[10px] text-on-surface-variant">
                        Dept ID #{dept.department_id}
                      </span>
                      <div className="mt-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-primary text-on-primary">
                          {dept.subDepartments.length} Sub-Departments
                        </span>
                      </div>
                    </div>

                    {/* ── LEVEL 2 & 3 & 4 TIERS ── */}
                    {dept.subDepartments.length > 0 && (
                      <div className="flex items-start justify-center gap-12 pt-2">
                        {dept.subDepartments.map((sub: any) => (
                          <div key={sub.sub_department_id} className="flex flex-col items-center gap-14">

                            {/* LEVEL 2: SUB-DEPARTMENT CARD */}
                            <div
                              data-node-id={`sub-${sub.sub_department_id}`}
                              data-parent-id={`dept-${dept.department_id}`}
                              className="relative z-10 flex flex-col items-center min-w-[210px] max-w-[240px] p-3 bg-surface-container border-2 border-secondary rounded shadow-xs"
                            >
                              <div className="flex items-center justify-between w-full pb-1.5 border-b border-outline-variant">
                                <div className="flex items-center gap-1.5 text-secondary font-semibold text-xs truncate">
                                  <FolderTree className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{sub.sub_department_name}</span>
                                </div>
                                <Can permission="stores.delete_subdepartment">
                                  <div className="flex items-center gap-1">

                                    <button
                                      type="button"
                                      onClick={() => handleOpenEdit(sub, 'sub-departments')}
                                      className="p-1 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded cursor-pointer"
                                      title="Edit Sub Dept"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(sub.sub_department_id, 'sub-departments')}
                                      className="p-1 hover:bg-error-container text-on-surface-variant hover:text-on-error-container rounded cursor-pointer"
                                      title="Delete Sub Dept"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </Can>
                              </div>

                              <div className="w-full flex items-center justify-between pt-1.5 text-[10px]">
                                <span className=" text-on-surface-variant">ID #{sub.sub_department_id}</span>
                                <span className="font-medium px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container">
                                  {sub.natures.length} Natures
                                </span>
                              </div>
                            </div>

                            {/* LEVEL 3: WORK NATURE CARDS */}
                            {sub.natures.length > 0 && (
                              <div className="flex items-start justify-center gap-6">
                                {sub.natures.map((nat: any) => (
                                  <div key={nat.nature_id} className="flex flex-col items-center gap-14">

                                    {/* Work Nature Box */}
                                    <div
                                      data-node-id={`nat-${nat.nature_id}`}
                                      data-parent-id={`sub-${sub.sub_department_id}`}
                                      className="relative z-10 flex flex-col items-center min-w-[180px] max-w-[200px] p-2.5 bg-surface-container border-2 border-outline rounded shadow-xs"
                                    >
                                      <div className="flex items-center justify-between w-full pb-1 border-b border-outline-variant">
                                        <div className="flex items-center gap-1 text-on-surface font-semibold text-xs truncate">
                                          <Wrench className="w-3 h-3 text-primary shrink-0" />
                                          <span className="truncate">{nat.nature_name}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEdit(nat, 'natures')}
                                            className="p-0.5 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded cursor-pointer"
                                            title="Edit Nature"
                                          >
                                            <Edit2 className="w-2.5 h-2.5" />
                                          </button>
                                          <Can permission="maintenance.delete_worknature">
                                            <button
                                              type="button"
                                              onClick={() => handleDelete(nat.nature_id, 'natures')}
                                              className="p-0.5 hover:bg-error-container text-on-surface-variant hover:text-on-error-container rounded cursor-pointer"
                                              title="Delete Nature"
                                            >
                                              <Trash2 className="w-2.5 h-2.5" />
                                            </button>
                                          </Can>
                                        </div>
                                      </div>

                                      {/* Nature Details */}
                                      <div className="w-full pt-1.5 space-y-1">
                                        <div className="flex items-center justify-between text-[10px]">
                                          <span className="font-medium text-tertiary flex items-center gap-0.5">
                                            <ShieldAlert className="w-2.5 h-2.5" />
                                            {nat.default_priority?.priority_name || 'No Priority'}
                                          </span>
                                          {nat.default_priority?.level && (
                                            <span className=" bg-surface-container-low px-1 rounded text-on-surface-variant">
                                              L{nat.default_priority.level}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-between text-[10px]">
                                          <span className=" text-on-surface-variant">#{nat.nature_id}</span>
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium ${nat.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-error-container text-on-error-container'
                                            }`}>
                                            {nat.active ? 'Active' : 'Inactive'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* LEVEL 4: ASSIGNED TECHNICIANS CARD */}
                                    <div
                                      data-node-id={`tech-${nat.nature_id}`}
                                      data-parent-id={`nat-${nat.nature_id}`}
                                      className="relative z-10 flex flex-col items-center min-w-[160px] max-w-[180px] p-2 bg-surface-container-low border border-outline-variant rounded text-center shadow-3xs"
                                    >
                                      <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-on-surface-variant pb-1 border-b border-outline-variant w-full">
                                        <User className="w-3 h-3 text-secondary" />
                                        <span>Assigned Workers</span>
                                      </div>
                                      <div className="mt-1.5 w-full space-y-1">
                                        {nat.assignedWorkers && nat.assignedWorkers.length > 0 ? (
                                          nat.assignedWorkers.map((w: any) => (
                                            <div
                                              key={w.nature_worker_id}
                                              className="text-[10px] font-medium bg-surface text-on-surface px-1.5 py-0.5 rounded border border-outline-variant truncate"
                                            >
                                              {w.worker?.full_name || 'Worker'}
                                              <span className="opacity-60 ml-1  text-[9px]">
                                                ({w.worker?.employee_no || w.worker?.user_id})
                                              </span>
                                            </div>
                                          ))
                                        ) : (
                                          <span className="text-[10px] italic text-on-surface-variant block py-0.5">
                                            None Assigned
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                ))}
                              </div>
                            )}

                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                ))
              )}
            </motion.div>

          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           AG GRID TABLE VIEW
           ══════════════════════════════════════════════════════════════════════ */
        <div className="border border-outline-variant dark:border-dark-outline-variant bg-surface dark:bg-dark-surface rounded overflow-hidden flex flex-col">
          <div className="ag-theme-app w-full h-[clamp(340px,calc(100dvh-235px),780px)]">
            <AgGridReact
              theme={appTheme}
              rowData={data}
              quickFilterText={search}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={itemsPerPage}
              suppressPaginationPanel={true}
              onGridReady={onGridReady}
              onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
              rowHeight={48}
              headerHeight={40}
              onRowClicked={(event) => {
                if (event.data) {
                  handleOpenEdit(event.data);
                }
              }}
            />
          </div>

          {/* Standardized Pagination Footer */}
          {!loading && filteredData.length > 0 && (
            <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-on-surface-variant dark:text-dark-on-surface-variant px-3 py-2 border-t border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low">
              <div className="flex items-center gap-3">
                <span>
                  Showing {startIndex + 1}–{endIndex} of {totalItems.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span>Per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={e => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-surface dark:bg-dark-surface border border-outline dark:border-dark-outline text-on-surface dark:text-dark-on-surface text-xs rounded px-1.5 py-0.5 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-2 py-1 rounded border border-outline dark:border-dark-outline bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 py-1 border border-primary bg-primary text-on-primary rounded font-medium">
                  {currentPage}
                </span>
                <span className="text-on-surface-variant dark:text-dark-on-surface-variant px-1">/ {totalPages}</span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-2 py-1 rounded border border-outline dark:border-dark-outline bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Configuration Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-surface-container border border-outline-variant w-full max-w-md rounded shadow-lg p-5 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                <h3 className="text-base font-semibold text-on-surface">
                  {getActionLabel(Boolean(editItem))}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {activeModalType === 'natures' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Maintenance Nature Name</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Broken Glass Door"
                        value={natureForm.nature_name}
                        onChange={e => setNatureForm({ ...natureForm, nature_name: e.target.value })}
                        className="w-full bg-surface-container border border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Assigned Sub Department</label>
                      <SearchableSelect
                        required
                        value={natureForm.sub_department}
                        onChange={val => setNatureForm({ ...natureForm, sub_department: val })}
                        placeholder="Select Sub Department"
                        options={allowedSubs.map(s => ({ value: s.sub_department_id, label: s.sub_department_name }))}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-on-surface-variant">Default Priority Level</label>
                        <button
                          type="button"
                          onClick={() => {
                            setPriorityErrorMsg('');
                            setShowPriorityModal(true);
                          }}
                          className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add Priority
                        </button>
                      </div>
                      <SearchableSelect
                        required
                        value={natureForm.default_priority}
                        onChange={val => setNatureForm({ ...natureForm, default_priority: val })}
                        placeholder="Select Default Priority"
                        options={natureFormPriorities.map(p => ({ value: p.priority_id, label: `${p.priority_name} (Lvl ${p.level})` }))}
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        checked={natureForm.active}
                        id="nature-active-checkbox"
                        onChange={e => setNatureForm({ ...natureForm, active: e.target.checked })}
                        className="cursor-pointer"
                      />
                      <label htmlFor="nature-active-checkbox" className="text-xs text-on-surface cursor-pointer select-none">
                        Mark work nature as active
                      </label>
                    </div>
                  </>
                ) : activeModalType === 'worker-assignments' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Select Nature of Work</label>
                      <SearchableSelect
                        required
                        value={workerAssignmentForm.nature}
                        onChange={val => setWorkerAssignmentForm({ ...workerAssignmentForm, nature: val })}
                        placeholder="Select Nature"
                        options={allowedNatures.map(n => ({ value: n.nature_id, label: n.nature_name }))}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Technician / Worker</label>
                      <SearchableSelect
                        required
                        value={workerAssignmentForm.worker}
                        onChange={val => setWorkerAssignmentForm({ ...workerAssignmentForm, worker: val })}
                        placeholder="Select Technician"
                        options={filteredUsers.map(u => ({ value: u.user_id, label: `${u.full_name} (${u.employee_no || u.username})` }))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Parent Department</label>
                      <SearchableSelect
                        required
                        value={subDeptForm.department}
                        onChange={val => setSubDeptForm({ ...subDeptForm, department: val })}
                        placeholder="Select Parent Department"
                        options={allowedDepts.map(d => ({ value: d.department_id, label: d.department_name }))}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Sub Department Name</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Electrical Panels"
                        value={subDeptForm.sub_department_name}
                        onChange={e => setSubDeptForm({ ...subDeptForm, sub_department_name: e.target.value })}
                        className="w-full bg-surface-container border border-outline text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-outline-variant">
                  {editItem ? (
                    <Can permission={
                      activeModalType === 'natures' ? 'maintenance.delete_worknature' :
                        activeModalType === 'worker-assignments' ? 'maintenance.delete_natureworker' :
                          'stores.delete_subdepartment'
                    }>
                      <button
                        type="button"
                        onClick={() => {
                          const id = editItem.nature_id || editItem.nature_worker_id || editItem.sub_department_id;
                          handleDelete(id, activeModalType);
                          setShowModal(false);
                        }}
                        className="bg-error-container/40 border border-error/30 text-on-error-container hover:bg-error-container text-xs font-medium px-3 py-2 rounded flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </Can>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-2 rounded transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Priority Management Modal */}
      <AnimatePresence>
        {showPriorityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPriorityModal(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-surface-container border border-outline-variant w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded shadow-lg p-5 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-tertiary" />
                  <h3 className="text-base font-semibold text-on-surface">Manage Priorities</h3>
                </div>
                <button
                  onClick={() => setShowPriorityModal(false)}
                  className="p-1 rounded text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {priorityErrorMsg && (
                <div className="p-3 rounded bg-error-container text-on-error-container text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{priorityErrorMsg}</span>
                </div>
              )}

              {/* Add Priority Form */}
              <form onSubmit={handleCreatePriority} className="p-3.5 bg-surface-container-low border border-outline-variant rounded space-y-3">
                <h4 className="text-xs font-semibold text-on-surface">Add New Priority Level</h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">Department</label>
                    <SearchableSelect
                      required
                      value={priorityForm.department}
                      onChange={val => setPriorityForm({ ...priorityForm, department: val })}
                      placeholder="Select Dept"
                      options={allowedDepts.map(d => ({ value: d.department_id, label: d.department_name }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">Priority Label</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Critical"
                      value={priorityForm.priority_name}
                      onChange={e => setPriorityForm({ ...priorityForm, priority_name: e.target.value })}
                      className="w-full bg-surface border border-outline text-on-surface text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">Level (1-5)</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max="5"
                      value={priorityForm.level}
                      onChange={e => setPriorityForm({ ...priorityForm, level: Number(e.target.value) })}
                      className="w-full bg-surface border border-outline text-on-surface text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={priorityActionLoading}
                    className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {priorityActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Add Priority</span>
                  </button>
                </div>
              </form>

              {/* Priorities List */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-on-surface">Configured Priorities</h4>
                {allowedPriorities.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic py-2 text-center">No priorities created yet.</p>
                ) : (
                  <div className="divide-y divide-outline-variant max-h-48 overflow-y-auto border border-outline-variant rounded bg-surface">
                    {allowedPriorities.map(p => (
                      <div key={p.priority_id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-on-surface-variant ">[{p.department_detail?.department_name || 'Dept'}]</span>
                          <span className="font-medium text-on-surface">{p.priority_name}</span>
                          <span className=" text-[10px] px-1.5 py-0.2 bg-surface-container border border-outline-variant rounded text-on-surface-variant">
                            Level {p.level}
                          </span>
                        </div>
                        <Can permission="maintenance.delete_priority">
                          <button
                            type="button"
                            onClick={() => handleDeletePriority(p.priority_id)}
                            className="p-1 hover:bg-error-container text-on-surface-variant hover:text-on-error-container rounded transition-colors cursor-pointer"
                            title="Delete Priority"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Can>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowPriorityModal(false)}
                  className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-2 rounded transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (FAB) Speed-Dial for Mobile Device */}
      <div className="sm:hidden fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Speed-dial options */}
        <AnimatePresence>
          {isFabOpen && (
            <div className="flex flex-col items-end gap-2 mb-1 w-48">
              {/* View Switcher option */}
              <motion.button
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                onClick={() => {
                  setViewMode(prev => prev === 'table' ? 'flowchart' : 'table');
                  setIsFabOpen(false);
                }}
                className="w-full flex items-center justify-start gap-2 px-3.5 py-2.5 bg-surface-container border border-outline-variant rounded-full text-xs font-semibold shadow-md text-on-surface cursor-pointer active:scale-95 transition-transform"
              >
                {viewMode === 'table' ? (
                  <>
                    <GitFork className="w-4 h-4 text-primary shrink-0" />
                    <span>Flowchart View</span>
                  </>
                ) : (
                  <>
                    <LayoutList className="w-4 h-4 text-primary shrink-0" />
                    <span>Table View</span>
                  </>
                )}
              </motion.button>

              {subpage === 'natures' && (
                <Can permission={['maintenance.add_priority', 'maintenance.change_priority']}>
                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    onClick={() => {
                      setPriorityErrorMsg('');
                      setShowPriorityModal(true);
                      setIsFabOpen(false);
                    }}
                    className="w-full flex items-center justify-start gap-2 px-3.5 py-2.5 bg-surface-container border border-outline-variant rounded-full text-xs font-semibold shadow-md text-on-surface cursor-pointer active:scale-95 transition-transform"
                  >
                    <AlertTriangle className="w-4 h-4 text-tertiary shrink-0" />
                    <span>Manage Priorities</span>
                  </motion.button>
                </Can>
              )}

              <Can permission={
                subpage === 'natures' ? 'maintenance.add_worknature' :
                  subpage === 'worker-assignments' ? 'maintenance.add_natureworker' :
                    'stores.add_subdepartment'
              }>
                <motion.button
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  onClick={() => {
                    handleOpenCreate();
                    setIsFabOpen(false);
                  }}
                  className="w-full flex items-center justify-start gap-2 px-3.5 py-2.5 bg-primary text-white rounded-full text-xs font-semibold shadow-md cursor-pointer active:scale-95 transition-transform"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>{getActionLabel(false)}</span>
                </motion.button>
              </Can>
            </div>
          )}
        </AnimatePresence>

        {/* Main FAB toggle button */}
        <motion.button
          onClick={() => setIsFabOpen(prev => !prev)}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center cursor-pointer hover:bg-primary-hover active:scale-95"
          aria-label={isFabOpen ? 'Close actions' : 'Open actions'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isFabOpen ? (
              <motion.span key="close" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.15 }}>
                <X className="w-6 h-6" />
              </motion.span>
            ) : (
              <motion.span key="menu" initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -90 }} transition={{ duration: 0.15 }}>
                <Menu className="w-6 h-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* FAB backdrop (close on outside click) */}
      {isFabOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/20"
          onClick={() => setIsFabOpen(false)}
        />
      )}
    </div>
  );
};