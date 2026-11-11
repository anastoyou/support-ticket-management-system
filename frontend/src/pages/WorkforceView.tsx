import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, X, Loader2, AlertCircle,
  User, DollarSign, Award, Calendar, Building2, Wrench,
  UserCheck, UserX, CheckCircle2, UserLock, ChevronLeft, ChevronRight,
  Link as LinkIcon, Copy, Check, RefreshCw, FileText, Filter, Users,
  LayoutList, LayoutGrid, Menu, Printer
} from 'lucide-react';
import { TimeSheetModal } from '../components/timesheet/TimeSheetModal';
import { TimesheetPrintModal } from '../components/timesheet/TimesheetPrintModal';
import type { RootState } from '../store';
import { usePermission } from '../hooks/usePermission';
import Can from '@/hooks/Can';

import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── AG Grid v36 Theming API ─────────────────────────────────────────────────
const appTheme = themeQuartz.withParams({
  fontFamily: 'Inter, sans-serif',
  fontSize: 13,
  rowHeight: 52,
  headerHeight: 44,
  cellHorizontalPaddingScale: 1.4,
  backgroundColor: '#ffffff',
  foregroundColor: '#191c1d',
  headerBackgroundColor: '#f3f4f5',
  headerTextColor: '#414754',
  rowHoverColor: '#e7e8e9',
  borderColor: '#E0E2E6',
  accentColor: '#1A73E8',
  spacing: 6,
  wrapperBorderRadius: 0,
});

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ─── Skeleton loader ─────────────────────────────────────────────────────────
const SkeletonGrid: React.FC = () => (
  <div className="border border-outline-variant rounded overflow-hidden">
    <div className="h-11 bg-surface-container-low border-b border-outline-variant flex items-center px-4 gap-6 animate-pulse">
      {[160, 140, 200, 130, 140, 140, 110].map((w, i) => (
        <div key={i} className="h-3 bg-outline-variant rounded" style={{ width: w }} />
      ))}
    </div>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-[52px] border-b border-outline-variant flex items-center px-4 gap-6 bg-surface-container">
        {[80, 120, 180, 70, 80, 90, 60].map((w, j) => (
          <div
            key={j}
            className="h-3 bg-surface-container-high rounded animate-pulse"
            style={{ width: w, animationDelay: `${i * 60 + j * 20}ms` }}
          />
        ))}
      </div>
    ))}
  </div>
);

// ─── Empty state ─────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ onClear: () => void }> = ({ onClear }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 border border-outline-variant rounded bg-surface-container">
    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
      <FileText className="w-6 h-6 text-on-surface-variant" />
    </div>
    <div className="text-sm font-semibold text-on-surface">No Workforce Records Found</div>
    <p className="text-xs text-on-surface-variant max-w-xs text-center">
      Try adjusting your search criteria or clear filters to start over.
    </p>
    <button onClick={onClear} className="mt-1 text-xs font-semibold text-primary hover:underline cursor-pointer">
      Clear all filters
    </button>
  </div>
);

export const WorkforceView: React.FC = () => {
  const { subpage } = useParams<{ subpage: string }>();
  const { token, user } = useSelector((state: RootState) => state.auth);
  const { hasPermission } = usePermission();

  // Get parent department IDs for logged-in user
  const getLoggedInUserDepartmentIds = () => {
    const roleName = (user?.role as any)?.role_name?.toLowerCase() || (user?.role as string)?.toLowerCase();
    if (roleName === 'admin' || roleName === 'administrator') {
      return null;
    }
    if (!user?.sub_departments || user.sub_departments.length === 0) {
      return null;
    }
    const deptIds = new Set<number>();
    user.sub_departments.forEach((sd: any) => {
      let deptId: number | null = null;
      if (typeof sd === 'object' && sd !== null) {
        const d = sd.department?.department_id ?? sd.department;
        if (d && !isNaN(Number(d))) {
          deptId = Number(d);
        }
      }
      if (!deptId && subDepartments.length > 0) {
        const targetId = typeof sd === 'object' ? (sd.sub_department_id ?? sd.id) : sd;
        if (targetId !== undefined && targetId !== null && !isNaN(Number(targetId))) {
          const found = subDepartments.find((s) => Number(s.sub_department_id) === Number(targetId));
          if (found) {
            deptId = Number(found.department?.department_id ?? found.department);
          }
        }
        if (!deptId && typeof sd === 'string' && isNaN(Number(sd))) {
          const matches = subDepartments.filter((s) => s.sub_department_name?.toLowerCase() === sd.toLowerCase());
          if (matches.length > 0) {
            deptId = Number(matches[0].department?.department_id ?? matches[0].department);
          }
        }
      }
      if (deptId && !isNaN(deptId)) {
        deptIds.add(deptId);
      }
    });
    return deptIds.size > 0 ? deptIds : null;
  };

  // States
  const [data, setData] = useState<any[]>([]);
  const [extraWorkers, setExtraWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [employeeTab, setEmployeeTab] = useState<'approved' | 'unapproved'>('approved');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [gridApi, setGridApi] = useState<any>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

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

  // Metadata states for dropdowns
  const [roles, setRoles] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [subDepartments, setSubDepartments] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);

  const canCreateAllDepts = hasPermission('create_ticket_all_departments');

  const handleActivateEmployee = async (userId: number | string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounts/customuser/${userId}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: true })
      });
      if (res.ok) {
        fetchData();
      }
    } catch {
      setErrorMsg('Failed to activate employee account.');
    } finally {
      setActionLoading(false);
    }
  };

  const userDepartmentIds = useMemo(() => {
    if (canCreateAllDepts) return null;
    if (!user?.sub_departments || user.sub_departments.length === 0) return null;
    const deptIds = new Set<number>();
    user.sub_departments.forEach((sd: any) => {
      let sdObj = sd;
      if (typeof sd === 'string' || typeof sd === 'number') {
        sdObj = subDepartments.find(item =>
          item.sub_department_id === Number(sd) ||
          item.sub_department_name.toLowerCase() === String(sd).toLowerCase()
        );
      }
      if (sdObj) {
        const parentDeptId = Number(sdObj.department?.department_id ?? sdObj.department);
        if (parentDeptId) {
          deptIds.add(parentDeptId);
        }
      }
    });
    return deptIds.size > 0 ? deptIds : null;
  }, [user, canCreateAllDepts, subDepartments]);

  const availableDepartments = useMemo(() => {
    if (canCreateAllDepts || (user as any)?.is_superuser) return departments;
    if (!userDepartmentIds) return [];
    return departments.filter(d => userDepartmentIds.has(Number(d.department_id)));
  }, [departments, userDepartmentIds, canCreateAllDepts, user]);

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  // Timesheet Calendar & Print Modals
  const [selectedTimesheetEmployee, setSelectedTimesheetEmployee] = useState<any | null>(null);
  const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);
  const [selectedPrintEmployee, setSelectedPrintEmployee] = useState<any | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const handleOpenTimesheet = (employee: any) => {
    setSelectedTimesheetEmployee(employee);
    setIsTimesheetModalOpen(true);
  };

  const handleOpenPrintTimesheet = (employee: any) => {
    setSelectedPrintEmployee(employee);
    setIsPrintModalOpen(true);
  };

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editEmployeeItem, setEditEmployeeItem] = useState<any | null>(null);
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Forms segmented tab state
  const [activeFormTab, setActiveFormTab] = useState<'basic' | 'access' | 'skills' | 'payroll'>('basic');

  // Interactive search filters
  const [workerSearch, setWorkerSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');

  // Link Generator Modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [genRole, setGenRole] = useState('');
  const [genStore, setGenStore] = useState('');
  const [genDepartment, setGenDepartment] = useState('');
  const [genSubDepartment, setGenSubDepartment] = useState('');
  const [genNaturesList, setGenNaturesList] = useState<string[]>([]);
  const [copiedToast, setCopiedToast] = useState(false);

  const genRoleObj = roles.find(r => String(r.role_id) === String(genRole));
  const genRoleName = (genRoleObj?.role_name || '').toLowerCase();

  const isGenStoreManager = genRoleName.includes('store manager');
  const isGenTechnician = genRoleName.includes('technician');
  const isGenOfficeAdmin = genRoleName.includes('office admin') || genRoleName.includes('office administrator');

  const unmanagedStores = useMemo(() => {
    return stores.filter(s => !s.manager);
  }, [stores]);

  const availableSubDepartments = useMemo(() => {
    if (canCreateAllDepts || !userDepartmentIds) return subDepartments;
    return subDepartments.filter(sd => {
      const deptId = sd.department?.department_id ?? sd.department;
      return userDepartmentIds.has(Number(deptId));
    });
  }, [subDepartments, userDepartmentIds, canCreateAllDepts]);

  useEffect(() => {
    if (showLinkModal && isGenTechnician && !canCreateAllDepts && availableSubDepartments.length > 0) {
      const defaultSubDeptId = String(availableSubDepartments[0].sub_department_id);
      if (genSubDepartment !== defaultSubDeptId) {
        setGenSubDepartment(defaultSubDeptId);
      }
    }
  }, [showLinkModal, isGenTechnician, canCreateAllDepts, availableSubDepartments]);

  useEffect(() => {
    const isSuper = (user as any)?.is_superuser;
    if (showLinkModal && isGenOfficeAdmin && (!canCreateAllDepts && !isSuper) && availableDepartments.length > 0) {
      const defaultDeptId = String(availableDepartments[0].department_id);
      if (genDepartment !== defaultDeptId) {
        setGenDepartment(defaultDeptId);
      }
    }
  }, [showLinkModal, isGenOfficeAdmin, canCreateAllDepts, user, availableDepartments]);

  const getGeneratedLink = () => {
    const baseUrl = `${window.location.origin}/signup`;
    const params = new URLSearchParams();
    if (genRole) params.set('role', genRole);
    if (genStore && isGenStoreManager) params.set('store', genStore);
    if (genDepartment && isGenOfficeAdmin) params.set('department', genDepartment);
    if (genSubDepartment && isGenTechnician) {
      const subDeptObj = subDepartments.find(sd => String(sd.sub_department_id) === String(genSubDepartment));
      const parentDeptId = subDeptObj?.department?.department_id ?? subDeptObj?.department;
      if (parentDeptId) {
        params.set('department', String(parentDeptId));
      }
    }
    if (genNaturesList.length > 0 && isGenTechnician) params.set('nature', genNaturesList.join(','));
    const str = params.toString();
    return str ? `${baseUrl}?${str}` : baseUrl;
  };

  const filteredSkills = useMemo(() => {
    if (!genSubDepartment) return [];
    const subDeptId = Number(genSubDepartment);
    return skills.filter(s => {
      const sSubDeptId = Number(s.sub_department?.sub_department_id ?? s.sub_department);
      return sSubDeptId === subDeptId;
    });
  }, [genSubDepartment, skills]);

  const groupedDepartments = useMemo(() => {
    const userDeptIds = getLoggedInUserDepartmentIds();
    const filteredSubDepts = userDeptIds
      ? subDepartments.filter(sd => {
        const deptId = sd.department?.department_id ?? sd.department;
        return userDeptIds.has(Number(deptId));
      })
      : subDepartments;

    const groups: Record<string, typeof subDepartments> = {};
    filteredSubDepts.forEach(sd => {
      const deptName = sd.department?.department_name || 'General';
      if (!groups[deptName]) {
        groups[deptName] = [];
      }
      groups[deptName].push(sd);
    });
    return groups;
  }, [subDepartments, user]);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (subpage === 'employees' || !subpage) {
      const defs: ColDef[] = [
        {
          headerName: 'Employee ID',
          field: 'employee_no',
          width: 120,
          cellClass: ' text-xs font-medium text-primary',
        },
        {
          headerName: 'Full Name',
          field: 'full_name',
          flex: 2,
          minWidth: 200,
          cellRenderer: (params: any) => {
            const item = params.data;
            if (!item) return null;
            return (
              <div className="flex items-center gap-3">
                {item.profile_image ? (
                  <img src={item.profile_image} alt="" className="w-8 h-8 rounded-full object-cover border border-outline-variant shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                    {item.full_name ? item.full_name.charAt(0).toUpperCase() : (item.username?.charAt(0).toUpperCase() || '?')}
                  </div>
                )}
                <div className="min-w-0 leading-tight">
                  <div className="font-semibold text-on-surface truncate">{item.full_name}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{item.email}</div>
                  {item.phone && (
                    <div className="text-[10px] text-on-surface-variant/85 truncate">
                      P: {item.phone} {item.whatsapp_number && `| WA: ${item.whatsapp_number}`}
                    </div>
                  )}
                </div>
              </div>
            );
          }
        },
        {
          headerName: 'Role',
          field: 'role.role_name',
          width: 140,
          valueGetter: params => params.data?.role?.role_name || params.data?.role || 'No Role',
          cellRenderer: (params: any) => (
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">
              {params.value}
            </span>
          )
        },
        {
          headerName: 'Sub Department',
          valueGetter: params => params.data?.sub_departments?.map((sd: any) => sd.sub_department_name).join(', ') || '-',
          flex: 1.5,
          minWidth: 160,
          cellClass: 'text-on-surface-variant'
        },
        {
          headerName: 'Skills',
          flex: 1.5,
          minWidth: 160,
          valueGetter: params => params.data?.skills?.map((sk: any) => sk.nature_name).join(', ') || '-',
          cellClass: 'text-on-surface-variant'
        },
        {
          headerName: 'Hourly Rate',
          field: 'hourly_rate',
          width: 120,
          cellClass: 'font-bold text-emerald-600 dark:text-emerald-400 ',
          valueFormatter: params => params.value ? `${params.value} KWD/hr` : '-'
        },
        {
          headerName: 'Actions',
          field: 'actions',
          width: 145,
          pinned: 'right',
          sortable: false,
          filter: false,
          cellClass: 'justify-end flex items-center',
          cellRenderer: (params: any) => {
            const item = params.data;
            if (!item) return null;
            return (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => handleOpenTimesheet(item)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-amber-300 dark:border-amber-600/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 flex items-center gap-1 cursor-pointer transition shadow-2xs"
                  title="Timesheet Calendar & Work Logs"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Calendar</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenPrintTimesheet(item)}
                  className="p-1.5 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface hover:text-primary flex items-center justify-center cursor-pointer transition shadow-2xs"
                  title="Print Timesheet (A4)"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }
        }
      ];

      return defs;
    } else if (subpage === 'rates') {
      return [
        {
          headerName: 'Worker',
          field: 'worker.full_name',
          valueGetter: params => params.data?.worker?.full_name || params.data?.worker || '',
          flex: 1.5,
          minWidth: 160,
          cellClass: 'font-semibold text-on-surface'
        },
        {
          headerName: 'Employee ID',
          field: 'worker.employee_no',
          valueGetter: params => params.data?.worker?.employee_no || '',
          width: 130,
          cellClass: ' text-xs text-primary'
        },
        {
          headerName: 'Hourly Rate',
          field: 'hourly_rate',
          width: 140,
          cellClass: 'font-bold text-emerald-600 dark:text-emerald-400 ',
          valueFormatter: params => `${params.value} KWD/hr`
        },
        {
          headerName: 'Effective From',
          field: 'effective_from',
          width: 140,
          cellClass: 'text-on-surface-variant '
        },
        {
          headerName: 'Effective To',
          field: 'effective_to',
          width: 140,
          cellClass: 'text-on-surface-variant ',
          valueFormatter: params => params.value || 'Ongoing'
        },
        {
          headerName: 'Actions',
          field: 'actions',
          width: 80,
          pinned: 'right',
          cellClass: 'justify-end flex items-center',
          cellRenderer: (params: any) => {
            const item = params.data;
            if (!item) return null;
            return (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.rate_id);
                  }}
                  className="p-1.5 border border-error/30 bg-error-container/40 text-on-error-container hover:bg-error-container rounded cursor-pointer transition-colors inline-flex"
                  title="Delete Rate"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          }
        }
      ];
    } else {
      // skills subpage
      return [
        {
          headerName: 'Technician Name',
          field: 'worker.full_name',
          valueGetter: params => params.data?.worker?.full_name || '',
          flex: 1.5,
          minWidth: 160,
          cellClass: 'font-semibold text-on-surface'
        },
        {
          headerName: 'Employee ID',
          field: 'worker.employee_no',
          valueGetter: params => params.data?.worker?.employee_no || '',
          width: 140,
          cellClass: ' text-xs text-primary'
        },
        {
          headerName: 'Maintenance Nature Skill',
          field: 'nature.nature_name',
          valueGetter: params => params.data?.nature?.nature_name || '',
          flex: 1.5,
          minWidth: 180,
          cellClass: 'font-semibold text-primary'
        },
        {
          headerName: 'Assigned Department',
          field: 'nature.sub_department.sub_department_name',
          valueGetter: params => params.data?.nature?.sub_department?.sub_department_name || '',
          flex: 1.5,
          minWidth: 180,
          cellClass: 'text-on-surface-variant'
        }
      ];
    }
  }, [subpage, hasPermission]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: true,
    filter: true,
    suppressSizeToFit: false,
    wrapText: false,
    autoHeight: false,
    cellStyle: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
    }
  }), []);

  const onGridReady = (params: any) => {
    setGridApi(params.api);
    params.api.sizeColumnsToFit();
  };

  // Forms state
  const [rateForm, setRateForm] = useState({
    worker: '',
    hourly_rate: '',
    effective_from: '',
    effective_to: ''
  });

  const [employeeForm, setEmployeeForm] = useState({
    employee_no: '',
    username: '',
    full_name: '',
    email: '',
    phone: '',
    whatsapp_number: '',
    password: '',
    role: '',
    accessible_stores: [] as string[],
    sub_departments: [] as number[],
    skills: [] as number[],
    hourly_rate: '',
    effective_from: '',
    effective_to: '',
    rates: [] as any[],
    active: true
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const formRoleObj = roles.find(r =>
    String(r.role_id) === String(employeeForm.role) ||
    String(r.role_name).toLowerCase() === String(employeeForm.role).toLowerCase()
  );
  const selectedRolePermissions = (formRoleObj?.permissions || []) as string[];
  const isFormTechnician = selectedRolePermissions.includes('complete_ticket') ||
    (formRoleObj?.role_name || '').toLowerCase() === 'technician' ||
    String(employeeForm.role).toLowerCase() === 'technician';
  const isFormStoreManager = !isFormTechnician && (
    (selectedRolePermissions.includes('create_ticket') && !selectedRolePermissions.includes('create_ticket_all_departments') && !selectedRolePermissions.includes('complete_ticket')) ||
    (formRoleObj?.role_name || '').toLowerCase() === 'store manager' ||
    String(employeeForm.role).toLowerCase() === 'store manager'
  );
  const isFormAreaManager = !isFormTechnician && (
    (selectedRolePermissions.includes('create_ticket_all_departments') && !selectedRolePermissions.includes('approve_ticket')) ||
    (formRoleObj?.role_name || '').toLowerCase() === 'area manager' ||
    String(employeeForm.role).toLowerCase() === 'area manager'
  );
  const isFormOfficeAdmin = (formRoleObj && (
    (formRoleObj.role_name || '').toLowerCase().includes('office admin') ||
    (formRoleObj.role_name || '').toLowerCase().includes('office administrator')
  )) || (
      String(employeeForm.role).toLowerCase().includes('office admin') ||
      String(employeeForm.role).toLowerCase().includes('office administrator')
    );
  const isFormManagement = (formRoleObj && (
    (formRoleObj.role_name || '').toLowerCase().includes('management')
  )) || (
      String(employeeForm.role).toLowerCase().includes('management')
    );
  const isFormGlobalRole = isFormOfficeAdmin || isFormManagement || (formRoleObj && (
    (formRoleObj.role_name || '').toLowerCase().includes('admin') ||
    (formRoleObj.role_name || '').toLowerCase().includes('administrator')
  )) || (
      String(employeeForm.role).toLowerCase().includes('admin') ||
      String(employeeForm.role).toLowerCase().includes('administrator')
    );
  const needsWorkingDepartments = (!isFormStoreManager && !isFormAreaManager) || !!isFormOfficeAdmin;

  const selectedSubDepts = subDepartments.filter(sd =>
    employeeForm.sub_departments.map(Number).includes(Number(sd.sub_department_id))
  );
  const hasTechnicalSubDept = selectedSubDepts.some(sd =>
    sd.sub_department_name.trim().toLowerCase() !== 'office'
  );
  const isTechnicianForForm = isFormTechnician || hasTechnicalSubDept;

  useEffect(() => {
    if (!(isTechnicianForForm || isFormOfficeAdmin) && activeFormTab === 'payroll') {
      setActiveFormTab('basic');
    }
    if (!needsWorkingDepartments && activeFormTab === 'skills') {
      setActiveFormTab('access');
    }
  }, [isTechnicianForForm, isFormOfficeAdmin, needsWorkingDepartments, activeFormTab]);

  useEffect(() => {
    fetchData();
  }, [subpage, token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, subpage, employeeTab]);

  useEffect(() => {
    if (!profileImage) {
      setImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(profileImage);
    setImagePreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [profileImage]);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const headers = { Authorization: `Token ${token}` };

      if (subpage === 'employees' || !subpage) {
        const [resUsers, resRoles, resStores, resSubDepts, resSkills, resAreas, resDepts] = await Promise.all([
          fetch(`${API_URL}/accounts/customuser/`, { headers }),
          fetch(`${API_URL}/accounts/role/`, { headers }),
          fetch(`${API_URL}/stores/store/?all=true`, { headers }),
          fetch(`${API_URL}/stores/subdepartment/`, { headers }),
          fetch(`${API_URL}/maintenance/worknature/`, { headers }),
          fetch(`${API_URL}/stores/area/`, { headers }),
          fetch(`${API_URL}/stores/department/`, { headers })
        ]);
        if (resUsers.ok) setData(await resUsers.json());
        if (resRoles.ok) setRoles(await resRoles.json());
        if (resStores.ok) setStores(await resStores.json());
        if (resSubDepts.ok) setSubDepartments(await resSubDepts.json());
        if (resSkills.ok) setSkills(await resSkills.json());
        if (resAreas && resAreas.ok) setAreas(await resAreas.json());
        if (resDepts && resDepts.ok) setDepartments(await resDepts.json());
      } else if (subpage === 'rates') {
        const [resRates, resWorkers] = await Promise.all([
          fetch(`${API_URL}/finance/employeerate/`, { headers }),
          fetch(`${API_URL}/accounts/customuser/`, { headers })
        ]);
        if (resRates.ok) setData(await resRates.json());
        if (resWorkers.ok) {
          const uList = await resWorkers.json();
          setExtraWorkers(uList.filter((u: any) => {
            const roleName = (u.role as any)?.role_name?.toLowerCase() || (u.role as string)?.toLowerCase();
            return roleName === 'technician' || roleName === 'worker';
          }));
        }
      } else if (subpage === 'skills') {
        const res = await fetch(`${API_URL}/maintenance/natureworker/`, { headers });
        if (res.ok) setData(await res.json());
      }
    } catch (err) {
      setErrorMsg('Failed to load workforce configurations.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setErrorMsg('');
    setEditItem(null);
    setWorkerSearch('');
    setRateForm({ worker: '', hourly_rate: '', effective_from: '', effective_to: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (item: any) => {
    setErrorMsg('');
    setEditItem(item);
    setWorkerSearch('');
    if (subpage === 'rates') {
      setRateForm({
        worker: item.worker?.user_id || item.worker || '',
        hourly_rate: item.hourly_rate,
        effective_from: item.effective_from || '',
        effective_to: item.effective_to || ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');

    let endpoint = '';
    let method = editItem ? 'PATCH' : 'POST';
    let bodyData: any = {};

    if (subpage === 'rates') {
      endpoint = editItem ? `${API_URL}/finance/employeerate/${editItem.rate_id}/` : `${API_URL}/finance/employeerate/`;
      bodyData = { ...rateForm };
      if (!bodyData.effective_to) delete bodyData.effective_to;
    }

    try {
      const response = await fetch(endpoint, {
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
        setErrorMsg(Object.values(errorRes).flat().join(', ') || 'Failed to save rate.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this hourly rate?')) return;
    setErrorMsg('');
    const endpoint = `${API_URL}/finance/employeerate/${id}/`;

    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` }
      });
      if (response.ok) {
        fetchData();
      } else {
        setErrorMsg('Failed to delete hourly rate.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    }
  };

  const handleOpenCreateEmployee = () => {
    setErrorMsg('');
    setEditEmployeeItem(null);
    setActiveFormTab('basic');
    setStoreFilter('');
    setAreaFilter('');
    setDeptFilter('');
    setSkillFilter('');
    setEmployeeForm({
      employee_no: '',
      full_name: '',
      username: '',
      email: '',
      phone: '',
      whatsapp_number: '',
      password: '',
      role: '',
      accessible_stores: [],
      sub_departments: [],
      skills: [],
      hourly_rate: '',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: '',
      rates: [],
      active: true
    });
    setProfileImage(null);
    setShowEmployeeModal(true);
  };

  const handleOpenEditEmployee = (item: any) => {
    setErrorMsg('');
    setEditEmployeeItem(item);
    setActiveFormTab('basic');
    setStoreFilter('');
    setAreaFilter('');
    setDeptFilter('');
    setSkillFilter('');
    setEmployeeForm({
      employee_no: item.employee_no || '',
      full_name: item.full_name || '',
      email: item.email || '',
      phone: item.phone || '',
      username: item.username || '',
      whatsapp_number: item.whatsapp_number || '',
      password: '',
      role: item.role?.role_id || item.role || '',
      accessible_stores: item.accessible_stores?.map((s: any) => s.store_id || s) || [],
      sub_departments: item.sub_departments?.map((d: any) => d.sub_department_id || d) || [],
      skills: item.skills?.map((sk: any) => sk.nature_id) || [],
      hourly_rate: item.hourly_rate || '',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: '',
      rates: item.rates || [],
      active: item.active === false ? false : (item.active ?? true)
    });
    setProfileImage(null);
    setShowEmployeeModal(true);
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');

    if (!/^\d{8}$/.test(employeeForm.phone)) {
      setErrorMsg("Phone number must be exactly 8 digits.");
      setActionLoading(false);
      return;
    }
    if (!/^\d{8}$|^\d{10}$/.test(employeeForm.whatsapp_number)) {
      setErrorMsg("WhatsApp number must be either 8 or 10 digits.");
      setActionLoading(false);
      return;
    }

    if (employeeForm.active) {
      // 1. Role is required
      if (!employeeForm.role) {
        setErrorMsg("Role is required to approve this employee.");
        setActionLoading(false);
        return;
      }

      // 2. Accessible store is required (except for Management and global administrative roles)
      if (employeeForm.accessible_stores.length === 0 && !isFormGlobalRole) {
        setErrorMsg("To approve this employee, you must assign at least one store allocation under the 'Store Access & Skills' tab.");
        setActionLoading(false);
        return;
      }

      // 3. Technical validation if user acts as a technician
      if (isTechnicianForForm && !isFormOfficeAdmin) {
        if (employeeForm.skills.length === 0) {
          setErrorMsg("To approve this employee, you must assign at least one technical skill under the 'Departments & Skills' tab.");
          setActionLoading(false);
          return;
        }

        const isOfficeSelected = selectedSubDepts.some(sd => sd.sub_department_name.trim().toLowerCase() === 'office');
        if (!isOfficeSelected && (!employeeForm.hourly_rate || parseFloat(employeeForm.hourly_rate) <= 0)) {
          setErrorMsg("Hourly wage rate is required to approve this employee under the 'Salary & Rate' tab.");
          setActionLoading(false);
          return;
        }
      }
    }

    const method = editEmployeeItem ? 'PATCH' : 'POST';
    const endpoint = editEmployeeItem
      ? `${API_URL}/accounts/customuser/${editEmployeeItem.user_id}/`
      : `${API_URL}/accounts/customuser/`;

    const formData = new FormData();
    formData.append('employee_no', employeeForm.employee_no);
    formData.append('username', employeeForm.username);
    formData.append('full_name', employeeForm.full_name);
    formData.append('email', employeeForm.email);
    formData.append('phone', employeeForm.phone);
    formData.append('whatsapp_number', employeeForm.whatsapp_number);
    if (employeeForm.password) {
      formData.append('password', employeeForm.password);
    } else if (!editEmployeeItem) {
      setErrorMsg('Password is required for new employees.');
      setActionLoading(false);
      return;
    }

    if (employeeForm.role) formData.append('role', employeeForm.role.toString());
    formData.append('active', employeeForm.active ? 'true' : 'false');
    if (profileImage) formData.append('profile_image', profileImage);

    employeeForm.accessible_stores.forEach(storeId => {
      formData.append('accessible_stores', storeId);
    });
    employeeForm.sub_departments.forEach(deptId => {
      formData.append('sub_departments', deptId.toString());
    });
    employeeForm.skills.forEach(skillId => {
      formData.append('skills', skillId.toString());
    });
    formData.append('hourly_rate', employeeForm.hourly_rate);
    formData.append('effective_from', employeeForm.effective_from || '');
    formData.append('effective_to', employeeForm.effective_to || '');

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Token ${token}`
        },
        body: formData
      });
      if (response.ok) {
        setShowEmployeeModal(false);
        if (employeeForm.active) {
          setEmployeeTab('approved');
        }
        fetchData();
      } else {
        const errorRes = await response.json().catch(() => null);
        if (typeof errorRes === 'object' && errorRes !== null) {
          if (errorRes.detail) {
            setErrorMsg(String(errorRes.detail));
          } else {
            const formatted = Object.entries(errorRes)
              .map(([key, val]) => {
                const fieldName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const msg = Array.isArray(val) ? val.join(' ') : String(val);
                return `${fieldName}: ${msg}`;
              })
              .join(' | ');
            setErrorMsg(formatted || 'Failed to save employee.');
          }
        } else {
          setErrorMsg('Failed to save employee.');
        }
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const roleName = ((user?.role as any)?.role_name || (user?.role as string) || '').toLowerCase();
  const isOfficeStaffOrAdmin = roleName.includes('admin') || roleName.includes('office') || hasPermission('accounts.change_customuser');

  const unapprovedCount = data.filter(
    item => (subpage === 'employees' || !subpage) && item.active === false
  ).length;

  const approvedCount = data.filter(
    item => (subpage === 'employees' || !subpage) && item.active !== false
  ).length;

  const filteredData = data.filter(item => {
    const text = (item.full_name || item.username || item.employee_no || item.worker?.full_name || item.nature?.nature_name || '').toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());

    if (subpage === 'employees' || !subpage) {
      if (isOfficeStaffOrAdmin && employeeTab === 'unapproved') {
        return matchesSearch && item.active === false;
      }
      return matchesSearch && item.active !== false;
    }
    return matchesSearch;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toast Alert Notice */}
      <AnimatePresence>
        {errorMsg && !showModal && !showEmployeeModal && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3 bg-error-container border border-error/20 text-on-error-container rounded flex items-center gap-3 text-xs font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container Card */}
      <div className="flex flex-col border border-outline-variant rounded overflow-hidden bg-surface-container">

        {/* Top Header & Toolbar Bar */}
        <div className="bg-surface-container-low border-b border-outline-variant p-2 sm:py-3 flex flex-col">

          {/* Row 1: Search, Sub-tabs & Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">

            {/* Left: Search input */}
            <div className="flex items-center gap-2 flex-1 max-w-md w-full">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-on-surface-variant pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search staff, ID, skills, rates..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    if (gridApi) {
                      gridApi.setGridOption('quickFilterText', e.target.value);
                    }
                  }}
                  className="w-full text-xs bg-surface-container border border-outline-variant rounded pl-8 pr-8 py-2 text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/60"
                />
                {search && (
                  <button
                    onClick={() => {
                      setSearch('');
                      if (gridApi) {
                        gridApi.setGridOption('quickFilterText', '');
                      }
                    }}
                    className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={fetchData}
                disabled={loading}
                className="border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium p-2 sm:px-3 sm:py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                title="Refresh workforce list"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Right: Primary Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {subpage === 'rates' && (
                <button
                  onClick={handleOpenCreate}
                  className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-2 rounded flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Hourly Rate</span>
                </button>
              )}

              {(subpage === 'employees' || !subpage) && (
                <Can permission="accounts.add_customuser">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setGenRole('');
                        setGenStore('');
                        setGenSubDepartment('');
                        setGenNaturesList([]);
                        setCopiedToast(false);
                        setShowLinkModal(true);
                      }}
                      className="border-outline-none bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-2 rounded hidden sm:flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LinkIcon className="w-4 h-4 text-primary" />
                      <span className="hidden sm:inline">Registration Link</span>
                    </button>
                    <button
                      onClick={handleOpenCreateEmployee}
                      className="bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-2 rounded hidden sm:flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Employee</span>
                    </button>
                  </div>
                </Can>
              )}
            </div>
          </div>

          {/* Row 2: Sub-tabs for Office Staff/Admin (Approved vs Unapproved) */}
          {(subpage === 'employees' || !subpage) && isOfficeStaffOrAdmin && (
            <div className="flex items-center gap-2 .py-2 border-t border-outline-variant/60">
              <button
                type="button"
                onClick={() => setEmployeeTab('approved')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${employeeTab === 'approved'
                  ? 'bg-primary text-on-primary font-semibold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Approved</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${employeeTab === 'approved' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                  {approvedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setEmployeeTab('unapproved')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${employeeTab === 'unapproved'
                  ? 'bg-tertiary-container text-on-tertiary-container font-semibold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
              >
                <UserLock className="w-3.5 h-3.5" />
                <span>Unapproved</span>
                {unapprovedCount > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-error text-on-error animate-pulse">
                    {unapprovedCount}
                  </span>
                ) : (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${employeeTab === 'unapproved' ? 'bg-on-tertiary-container/20 text-on-tertiary-container' : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                    0
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Table / Skeleton / Empty state */}
        {loading ? (
          <SkeletonGrid />
        ) : filteredData.length === 0 ? (
          <EmptyState onClear={() => setSearch('')} />
        ) : (subpage === 'employees' || !subpage) ? (
          <>
            {/* Mobile View: Stacked Card Rows */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3">
              {(() => {
                const totalItems = filteredData.length;
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
                const paginatedData = filteredData.slice(startIndex, endIndex);

                return paginatedData.map(item => {
                  const canChangeUser = hasPermission('accounts.change_customuser');
                  return (
                    <div
                      key={item.user_id}
                      className="w-full flex flex-col p-3.5 rounded-xl border transition-all shadow-xs bg-surface border-outline-variant"
                    >
                      <div
                        onClick={canChangeUser ? () => handleOpenEditEmployee(item) : undefined}
                        className={`w-full text-left flex items-center gap-3 ${canChangeUser ? 'cursor-pointer active:scale-[0.98]' : ''}`}
                      >
                        {/* Avatar */}
                        {item.profile_image ? (
                          <img src={item.profile_image} alt="" className="w-12 h-12 rounded-full object-cover border border-outline-variant shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base border border-primary/20 shrink-0">
                            {item.full_name ? item.full_name.charAt(0).toUpperCase() : (item.username?.charAt(0).toUpperCase() || '?')}
                          </div>
                        )}

                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-on-surface text-sm truncate">{item.full_name}</h4>
                            <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10 uppercase tracking-wide shrink-0">
                              {item.role?.role_name || item.role || 'No Role'}
                            </span>
                          </div>

                          <p className="text-xs text-on-surface-variant truncate">{item.email}</p>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-outline pt-0.5">
                            {item.phone && <span className="">📞 {item.phone}</span>}
                            {item.employee_no && <span>· ID: {item.employee_no}</span>}
                            {item.hourly_rate && <span className="font-semibold text-emerald-600 dark:text-emerald-400">· {item.hourly_rate} KWD/hr</span>}
                          </div>

                          {item.sub_departments && item.sub_departments.length > 0 && (
                            <div className="text-[10px] text-outline truncate pt-0.5">
                              🏢 {item.sub_departments.map((sd: any) => sd.sub_department_name).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Bar: Calendar & Print */}
                      <div className="flex items-center gap-2 pt-2.5 border-t border-outline-variant/60 mt-2.5">
                        <button
                          type="button"
                          onClick={() => handleOpenTimesheet(item)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Timesheet Calendar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPrintTimesheet(item)}
                          className="py-1.5 px-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          title="Print Timesheet (A4)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print A4</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden sm:block">
              <div className="ag-theme-app w-full h-[calc(100vh-220px)] min-h-[500px]">
                <AgGridReact
                  theme={appTheme}
                  rowData={filteredData}
                  quickFilterText={search}
                  columnDefs={columnDefs}
                  defaultColDef={defaultColDef}
                  pagination={true}
                  paginationPageSize={itemsPerPage}
                  suppressPaginationPanel={true}
                  onGridReady={onGridReady}
                  onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                  rowHeight={52}
                  headerHeight={44}
                  rowClass="cursor-pointer"
                  onRowClicked={(event) => {
                    const canChangeUser = hasPermission('accounts.change_customuser');
                    if (event.data) {
                      if (canChangeUser) handleOpenEditEmployee(event.data);
                    }
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="ag-theme-app w-full h-[calc(100vh-220px)] min-h-[500px]">
            <AgGridReact
              theme={appTheme}
              rowData={filteredData}
              quickFilterText={search}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={itemsPerPage}
              suppressPaginationPanel={true}
              onGridReady={onGridReady}
              onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
              rowHeight={52}
              headerHeight={44}
              rowClass="cursor-pointer"
              onRowClicked={(event) => {
                if (event.data && subpage === 'rates') {
                  handleOpenEdit(event.data);
                }
              }}
            />
          </div>
        )}

        {/* Custom Pagination Footer */}
        {!loading && filteredData.length > 0 && (() => {
          const totalItems = filteredData.length;
          const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
          const startIndex = (currentPage - 1) * itemsPerPage;
          const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

          return (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-outline-variant bg-surface-container-low">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-outline">
                  {startIndex + 1}–{endIndex} of {totalItems.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-outline">
                  <span>Per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={e => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-surface border border-outline-variant rounded px-1.5 py-0.5 text-[11px] text-on-surface focus:outline-none focus:border-primary cursor-pointer"
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
                  className="w-7 h-7 flex items-center justify-center rounded border border-outline-variant text-on-surface disabled:opacity-35 hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-on-surface font-medium px-2">{currentPage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="w-7 h-7 flex items-center justify-center rounded border border-outline-variant text-on-surface disabled:opacity-35 hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ─── Assign / Edit Hourly Rate Modal ─── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container border border-outline-variant w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low shrink-0">
                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  {editItem ? 'Edit Hourly Rate' : 'Assign Worker Hourly Rate'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {errorMsg && (
                <div className="px-6 pt-4 shrink-0">
                  <div className="p-3 bg-error-container text-on-error-container rounded flex items-center gap-2 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Select Technician / Worker</label>
                  {!editItem && (
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-on-surface-variant pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search worker by name or ID..."
                        value={workerSearch}
                        onChange={e => setWorkerSearch(e.target.value)}
                        className="w-full text-xs bg-surface-container border border-outline-variant rounded pl-8 pr-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}
                  <select
                    required
                    disabled={!!editItem}
                    value={rateForm.worker}
                    onChange={e => setRateForm({ ...rateForm, worker: e.target.value })}
                    className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">Select Technician</option>
                    {extraWorkers
                      .filter(w => {
                        const keyword = workerSearch.toLowerCase();
                        return w.full_name.toLowerCase().includes(keyword) || (w.employee_no || '').toLowerCase().includes(keyword);
                      })
                      .map(w => (
                        <option key={w.user_id} value={w.user_id}>
                          {w.full_name} ({w.employee_no})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Hourly Rate (KWD)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder="e.g. 15.00"
                    value={rateForm.hourly_rate}
                    onChange={e => setRateForm({ ...rateForm, hourly_rate: e.target.value })}
                    className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Effective From</label>
                    <input
                      required
                      type="date"
                      value={rateForm.effective_from}
                      onChange={e => setRateForm({ ...rateForm, effective_from: e.target.value })}
                      className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Effective To</label>
                    <input
                      type="date"
                      value={rateForm.effective_to}
                      onChange={e => setRateForm({ ...rateForm, effective_to: e.target.value })}
                      className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <button type="submit" className="hidden" id="rate-submit-btn" />
              </form>

              <div className="flex justify-end gap-2 px-6 py-4 border-t border-outline-variant bg-surface-container-low shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-2 border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => document.getElementById('rate-submit-btn')?.click()}
                  className="px-3.5 py-2 bg-primary hover:bg-primary-container text-on-primary text-xs font-medium rounded flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-70 shadow-xs"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Add / Edit Employee Modal ─── */}
      <AnimatePresence>
        {showEmployeeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container border border-outline-variant w-full max-w-2xl rounded-xl shadow-2xl flex flex-col h-[650px] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low shrink-0">
                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  {editEmployeeItem ? 'Edit Employee Profile' : 'Add New Employee'}
                </h3>
                <button
                  onClick={() => setShowEmployeeModal(false)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="px-6 pt-2 border-b border-outline-variant bg-surface-container-low shrink-0 flex gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveFormTab('basic')}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-1.5 cursor-pointer ${activeFormTab === 'basic'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Personal Profile
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('access')}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-1.5 cursor-pointer ${activeFormTab === 'access'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Store Access
                </button>
                {needsWorkingDepartments && (
                  <button
                    type="button"
                    onClick={() => setActiveFormTab('skills')}
                    className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-1.5 cursor-pointer ${activeFormTab === 'skills'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                      }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Departments & Skills {isFormOfficeAdmin && '(Optional)'}
                  </button>
                )}
                {(isTechnicianForForm || isFormOfficeAdmin) && (
                  <button
                    type="button"
                    onClick={() => setActiveFormTab('payroll')}
                    className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-1.5 cursor-pointer ${activeFormTab === 'payroll'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                      }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Salary & Rate
                  </button>
                )}
              </div>

              {/* Unapproved Account Notice */}
              {editEmployeeItem && editEmployeeItem.active === false && (
                <div className="mx-6 mt-4 p-3 bg-tertiary-container/60 border border-tertiary-container text-on-tertiary-container rounded text-xs flex items-center gap-2.5 shrink-0">
                  <UserLock className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Unapproved Account:</strong> Assigning role, store, or department details and clicking <strong>Save Employee</strong> will activate this employee account.
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="px-6 pt-4 shrink-0">
                  <div className="p-3 bg-error-container text-on-error-container rounded flex items-center gap-2 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                </div>
              )}

              {/* Form Body */}
              <form onSubmit={handleEmployeeSubmit} id="employee-full-form" className="flex-1 overflow-y-auto p-6 space-y-4">

                {/* TAB 1: Personal Profile */}
                {activeFormTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded border border-outline-variant">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden border border-outline bg-surface-container flex items-center justify-center shrink-0">
                        {imagePreview ? (
                          <img src={imagePreview} alt="Selected preview" className="w-full h-full object-cover" />
                        ) : editEmployeeItem?.profile_image ? (
                          <img src={editEmployeeItem.profile_image} alt="Current" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-on-surface-variant" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs font-semibold text-on-surface mb-1">Employee Profile Photo</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => setProfileImage(e.target.files ? e.target.files[0] : null)}
                          className="text-xs text-on-surface-variant file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                        />
                        {errorMsg && (errorMsg.toLowerCase().includes('face') || errorMsg.toLowerCase().includes('portrait') || errorMsg.toLowerCase().includes('person')) && (
                          <div className="text-xs text-red-500 font-bold mt-1">
                            {errorMsg}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Employee ID</label>
                        <input
                          // required
                          type="text"
                          placeholder="e.g. 10402"
                          value={employeeForm.employee_no}
                          onChange={e => setEmployeeForm({ ...employeeForm, employee_no: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Username(Login)*</label>
                        <input
                          required
                          type="text"
                          placeholder="EMP-ME"
                          value={employeeForm.username}
                          onChange={e => setEmployeeForm({ ...employeeForm, username: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Full Name *</label>
                        <input
                          required
                          type="text"
                          placeholder="e.g. John Doe"
                          value={employeeForm.full_name}
                          onChange={e => setEmployeeForm({ ...employeeForm, full_name: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Email Address *</label>
                        <input
                          required
                          type="email"
                          placeholder="e.g. john@example.com"
                          value={employeeForm.email}
                          onChange={e => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                          Password {editEmployeeItem ? '(Leave blank to keep current)' : '*'}
                        </label>
                        <input
                          required={!editEmployeeItem}
                          type="password"
                          placeholder="Enter account password"
                          value={employeeForm.password}
                          onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Phone Number (8 digits) *</label>
                        <input
                          required
                          type="text"
                          maxLength={8}
                          placeholder="e.g. 12345678"
                          value={employeeForm.phone}
                          onChange={e => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">WhatsApp Number (8 or 10 digits) *</label>
                        <input
                          required
                          type="text"
                          maxLength={10}
                          placeholder="e.g. 98765432"
                          value={employeeForm.whatsapp_number}
                          onChange={e => setEmployeeForm({ ...employeeForm, whatsapp_number: e.target.value })}
                          className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${employeeForm.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                          {employeeForm.active ? <CheckCircle2 className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-on-surface">
                            Account Status: {employeeForm.active ? 'Active & Approved' : 'Pending Approval'}
                          </div>
                          <div className="text-[11px] text-on-surface-variant">
                            {employeeForm.active ? 'User can sign in and perform assigned duties' : 'User account sign-in access is suspended'}
                          </div>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          checked={employeeForm.active}
                          onChange={e => setEmployeeForm({ ...employeeForm, active: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>
                  </div>
                )}

                {/* TAB 2: Access Permits */}
                {activeFormTab === 'access' && (
                  <div className="space-y-4 flex flex-col h-full min-h-0">
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Primary Role</label>
                      <select
                        value={employeeForm.role}
                        onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                        className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="">Select Role</option>
                        {roles.map(r => (
                          <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col flex-1 min-h-0 pt-3 border-t border-outline-variant/60">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2 flex items-center justify-between gap-1.5 shrink-0">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-4 h-4" />
                          Accessible Stores ({employeeForm.accessible_stores.length})
                        </span>
                        {isFormGlobalRole && (
                          <span className="text-[10px] normal-case font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                            Global Access Role ({formRoleObj?.role_name || 'Management'}) — All Stores Included
                          </span>
                        )}
                      </h4>

                      <div className="grid grid-cols-2 gap-2 mb-2 shrink-0">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Filter stores..."
                            value={storeFilter}
                            onChange={e => setStoreFilter(e.target.value)}
                            className="w-full text-xs bg-surface-container border border-outline-variant rounded pl-8 pr-2 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                          />
                        </div>
                        <select
                          value={areaFilter}
                          onChange={e => setAreaFilter(e.target.value)}
                          className="w-full text-xs bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                        >
                          <option value="">All Areas</option>
                          <option value="NO_AREA">Unassigned Area</option>
                          {areas.map(a => (
                            <option key={a.area_id} value={a.area_id}>{a.area_name}</option>
                          ))}
                        </select>
                      </div>

                      {(() => {
                        const filteredStores = stores.filter(s => {
                          const matchesSearch = s.store_name.toLowerCase().includes(storeFilter.toLowerCase());
                          if (!matchesSearch) return false;
                          if (!areaFilter) return true;
                          if (areaFilter === 'NO_AREA') return !s.area;
                          const storeAreaId = s.area?.area_id ?? s.area;
                          return String(storeAreaId) === String(areaFilter);
                        });

                        return (
                          <div className="flex flex-col flex-1 min-h-0">
                            <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0 text-[11px] text-on-surface-variant">
                              <span>{filteredStores.length} store(s)</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const filteredIds = filteredStores.map(s => String(s.store_id));
                                    const union = Array.from(new Set([...employeeForm.accessible_stores.map(String), ...filteredIds]));
                                    setEmployeeForm({ ...employeeForm, accessible_stores: union });
                                  }}
                                  className="text-primary hover:underline font-semibold cursor-pointer"
                                >
                                  + Select All
                                </button>
                                <span>|</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const filteredIdsSet = new Set(filteredStores.map(s => String(s.store_id)));
                                    const remaining = employeeForm.accessible_stores.filter(id => !filteredIdsSet.has(String(id)));
                                    setEmployeeForm({ ...employeeForm, accessible_stores: remaining });
                                  }}
                                  className="text-error hover:underline font-semibold cursor-pointer"
                                >
                                  - Deselect
                                </button>
                              </div>
                            </div>

                            <div className="flex-1 overflow-y-auto border border-outline-variant rounded p-2.5 space-y-1.5 bg-surface-container-low min-h-[220px] max-h-[300px]">
                              {filteredStores.map(s => {
                                const checked = employeeForm.accessible_stores.some(id => String(id) === String(s.store_id));
                                const areaName = s.area?.area_name;
                                return (
                                  <label key={s.store_id} className="flex items-center justify-between gap-2 text-xs text-on-surface cursor-pointer hover:text-primary py-0.5 select-none">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => {
                                          const sid = String(s.store_id);
                                          const newList = e.target.checked
                                            ? [...employeeForm.accessible_stores.filter(id => String(id) !== sid), sid]
                                            : employeeForm.accessible_stores.filter(id => String(id) !== sid);
                                          setEmployeeForm({ ...employeeForm, accessible_stores: newList });
                                        }}
                                        className="w-3.5 h-3.5 text-primary border-outline-variant rounded focus:ring-primary shrink-0 cursor-pointer"
                                      />
                                      <span className="truncate">{s.store_name}</span>
                                    </div>
                                    {areaName && (
                                      <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded shrink-0">
                                        {areaName}
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                              {filteredStores.length === 0 && (
                                <div className="text-center py-6 text-xs text-on-surface-variant">No stores match filter criteria</div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* TAB 3: Departments & Skills */}
                {activeFormTab === 'skills' && needsWorkingDepartments && (
                  <div className="flex flex-col h-[480px] min-h-0 border border-outline-variant rounded bg-surface-container-low overflow-hidden">
                    {/* Header with combined search */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-outline-variant p-3 bg-surface-container shrink-0 gap-2">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <Wrench className="w-4 h-4" />
                        Departments & Skills Setup ({employeeForm.sub_departments.length} Depts, {employeeForm.skills.length} Skills)
                      </h4>
                      <div className="relative w-48 sm:w-64">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search departments or skills..."
                          value={deptFilter}
                          onChange={e => setDeptFilter(e.target.value)}
                          className="w-full text-xs bg-surface border border-outline-variant rounded pl-8 pr-3 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Scrollable Tree List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[440px]">
                      {(() => {
                        const deptKeys = Object.keys(groupedDepartments).sort();
                        if (deptKeys.length === 0) {
                          return <p className="text-xs text-outline italic text-center py-4">No departments found.</p>;
                        }

                        let renderedCount = 0;

                        const content = deptKeys.map(deptName => {
                          const subDepts = groupedDepartments[deptName];

                          // Filter sub-departments and skills matching the search text
                          const matchedSubDepts = subDepts.filter(sd => {
                            const subDeptMatches = sd.sub_department_name.toLowerCase().includes(deptFilter.toLowerCase());
                            const hasMatchingSkills = isTechnicianForForm && skills.some(sk => {
                              const skSubDeptId = Number(sk.sub_department?.sub_department_id ?? sk.sub_department);
                              return skSubDeptId === sd.sub_department_id && sk.nature_name.toLowerCase().includes(deptFilter.toLowerCase());
                            });
                            return subDeptMatches || hasMatchingSkills;
                          });

                          if (matchedSubDepts.length === 0) return null;
                          renderedCount += 1;

                          return (
                            <div key={deptName} className="space-y-2 pb-2 border-b border-outline-variant/30 last:border-b-0">
                              <h5 className="text-[10px] font-bold text-outline uppercase tracking-wider">{deptName}</h5>

                              <div className="space-y-3 pl-2">
                                {matchedSubDepts.map(sd => {
                                  // Get technical skills for this sub-department
                                  const subDeptSkills = skills.filter(sk => {
                                    const skSubDeptId = Number(sk.sub_department?.sub_department_id ?? sk.sub_department);
                                    return skSubDeptId === sd.sub_department_id;
                                  });

                                  // Only show sub-department if it has at least one skill/work nature in the system
                                  if (subDeptSkills.length === 0) return null;

                                  const filteredSubDeptSkills = subDeptSkills.filter(sk =>
                                    sk.nature_name.toLowerCase().includes(deptFilter.toLowerCase())
                                  );

                                  if (filteredSubDeptSkills.length === 0) return null;

                                  return (
                                    <div key={sd.sub_department_id} className="space-y-1.5 pb-1">
                                      {/* Sub-department Header (No Checkbox) */}
                                      <div className="text-xs font-semibold text-on-surface py-0.5 select-none">
                                        {sd.sub_department_name}
                                      </div>

                                      {/* Indented Technical Skills List (Vertical stack / Down to Down) */}
                                      {(isTechnicianForForm || isFormOfficeAdmin) && (
                                        <div className="pl-4 flex flex-col gap-1.5 border-l border-outline-variant/40 ml-1.5 py-0.5">
                                          {filteredSubDeptSkills.map(sk => {
                                            const isSkillChecked = employeeForm.skills.includes(sk.nature_id);
                                            return (
                                              <label key={sk.nature_id} className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer hover:text-primary select-none py-0.5 w-fit">
                                                <input
                                                  type="checkbox"
                                                  checked={isSkillChecked}
                                                  onChange={e => {
                                                    let newSkills = e.target.checked
                                                      ? [...employeeForm.skills, sk.nature_id]
                                                      : employeeForm.skills.filter(id => id !== sk.nature_id);

                                                    let newSubDepts = [...employeeForm.sub_departments];
                                                    if (e.target.checked) {
                                                      // Auto-check parent sub-department if not checked
                                                      if (!newSubDepts.includes(sd.sub_department_id)) {
                                                        newSubDepts.push(sd.sub_department_id);
                                                      }
                                                    } else {
                                                      // If unchecking, see if any other skills of this sub-department are still checked
                                                      const otherCheckedSkills = newSkills.filter(id =>
                                                        subDeptSkills.some(s => s.nature_id === id)
                                                      );
                                                      if (otherCheckedSkills.length === 0) {
                                                        // No more skills checked for this sub-department -> remove the sub-department association
                                                        newSubDepts = newSubDepts.filter(id => id !== sd.sub_department_id);
                                                      }
                                                    }

                                                    setEmployeeForm({
                                                      ...employeeForm,
                                                      sub_departments: newSubDepts,
                                                      skills: newSkills
                                                    });
                                                  }}
                                                  className="w-3.5 h-3.5 text-primary border-outline-variant rounded focus:ring-primary cursor-pointer"
                                                />
                                                <span>{sk.nature_name}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });

                        return renderedCount === 0
                          ? <p className="text-xs text-outline italic text-center py-4">No matching departments or skills found.</p>
                          : content;
                      })()}
                    </div>
                  </div>
                )}

                {/* TAB 3: Salary & Rate Config */}
                {activeFormTab === 'payroll' && (
                  <div className="space-y-5">
                    <div className="bg-surface-container-low p-4 rounded border border-outline-variant space-y-4">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Salary Wage Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Hourly Wage Rate (KWD) {isFormOfficeAdmin && '(Optional)'}</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="e.g. 5.00"
                            value={employeeForm.hourly_rate}
                            onChange={e => setEmployeeForm({ ...employeeForm, hourly_rate: e.target.value })}
                            className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                          />
                        </div>

                        {employeeForm.hourly_rate && (
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-outline-variant/60">
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Rate Effective From</label>
                              <input
                                type="date"
                                value={employeeForm.effective_from}
                                onChange={e => setEmployeeForm({ ...employeeForm, effective_from: e.target.value })}
                                className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Rate Effective To</label>
                              <input
                                type="date"
                                value={employeeForm.effective_to}
                                onChange={e => setEmployeeForm({ ...employeeForm, effective_to: e.target.value })}
                                className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {editEmployeeItem && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          Wage History Records
                        </h4>
                        <div className="border border-outline-variant rounded overflow-hidden bg-surface-container">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-surface-container-low border-b border-outline-variant text-[10px] uppercase font-bold text-on-surface-variant">
                                <th className="px-4 py-2.5">Hourly Rate</th>
                                <th className="px-4 py-2.5">Effective From</th>
                                <th className="px-4 py-2.5">Effective To</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/60 text-on-surface">
                              {employeeForm.rates && employeeForm.rates.length > 0 ? (
                                employeeForm.rates.map((r: any) => (
                                  <tr key={r.rate_id} className="hover:bg-surface-container-high transition-colors">
                                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 ">{r.hourly_rate} KWD/hr</td>
                                    <td className="px-4 py-3  text-on-surface-variant">{r.effective_from}</td>
                                    <td className="px-4 py-3  text-on-surface-variant">{r.effective_to || 'Present'}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={3} className="px-4 py-4 text-center text-on-surface-variant italic">No wage history recorded.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {/* Modal Footer */}
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-outline-variant bg-surface-container-low shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEmployeeModal(false)}
                  className="px-3.5 py-2 border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="employee-full-form"
                  disabled={actionLoading}
                  className="px-3.5 py-2 bg-primary hover:bg-primary-container text-on-primary text-xs font-medium rounded flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-70 shadow-xs"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Employee</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ─── Registration Link Generator Modal ─── */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container border border-outline-variant w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-on-surface">Generate Registration Link</h3>
                    <p className="text-xs text-on-surface-variant">Create dynamic signup links with pre-filled roles</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Target Role</label>
                  <select
                    value={genRole}
                    onChange={e => {
                      setGenRole(e.target.value);
                      setGenStore('');
                      setGenSubDepartment('');
                      setGenNaturesList([]);
                    }}
                    className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">Select Role (Optional)</option>
                    {roles.map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                    ))}
                  </select>
                </div>

                {isGenOfficeAdmin && (
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Target Department (Required)</label>
                    <select
                      value={genDepartment}
                      disabled={(!canCreateAllDepts && !(user as any)?.is_superuser) && availableDepartments.length <= 1}
                      onChange={e => setGenDepartment(e.target.value)}
                      className="w-full text-xs bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant p-2.5 rounded text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary disabled:opacity-60 cursor-pointer"
                    >
                      {(canCreateAllDepts || (user as any)?.is_superuser) && <option value="">Select Department (Required)</option>}
                      {availableDepartments.map((d: any) => (
                        <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {isGenStoreManager && (
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Target Store (Required - Unmanaged Locations)</label>
                    <select
                      value={genStore}
                      onChange={e => setGenStore(e.target.value)}
                      className="w-full text-xs bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant p-2.5 rounded text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="">Select Store (Required)</option>
                      {unmanagedStores.map(s => (
                        <option key={s.store_id} value={s.store_id}>{s.store_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {isGenTechnician && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Target Sub-department</label>
                      <select
                        value={genSubDepartment}
                        disabled={!canCreateAllDepts && availableSubDepartments.length <= 1}
                        onChange={e => {
                          setGenSubDepartment(e.target.value);
                          setGenNaturesList([]); // Reset selected natures when sub-department changes
                        }}
                        className="w-full text-xs bg-surface-container border border-outline-variant p-2.5 rounded text-on-surface focus:outline-none focus:border-primary disabled:opacity-60 cursor-pointer"
                      >
                        <Can permission="maintenance.create_ticket_all_departments">
                          <option value="">Select Sub-department (Optional)</option>
                        </Can>
                        {availableSubDepartments.map(sd => (
                          <option key={sd.sub_department_id} value={sd.sub_department_id}>{sd.sub_department_name}</option>
                        ))}
                      </select>
                    </div>

                    {genSubDepartment && (
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Target Work Natures (Multiple)</label>
                        {filteredSkills.length === 0 ? (
                          <p className="text-xs text-outline italic">No work natures found for this sub-department.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-outline-variant rounded p-3 bg-surface-container-low">
                            {filteredSkills.map(s => {
                              const checked = genNaturesList.includes(String(s.nature_id));
                              return (
                                <label key={s.nature_id} className="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      if (checked) {
                                        setGenNaturesList(prev => prev.filter(id => id !== String(s.nature_id)));
                                      } else {
                                        setGenNaturesList(prev => [...prev, String(s.nature_id)]);
                                      }
                                    }}
                                    className="rounded border-outline-variant text-primary focus:ring-primary w-3.5 h-3.5"
                                  />
                                  <span>{s.nature_name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Generated Dynamic Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getGeneratedLink()}
                      className="w-full text-xs  bg-surface-container border border-outline-variant p-2.5 rounded text-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(getGeneratedLink());
                        setCopiedToast(true);
                        setTimeout(() => setCopiedToast(false), 2000);
                      }}
                      className="px-3.5 py-2.5 bg-primary hover:bg-primary-container text-on-primary text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors shadow-xs"
                    >
                      {copiedToast ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedToast ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end px-6 py-4 border-t border-outline-variant bg-surface-container-low">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-3.5 py-2 border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Floating Action Button (FAB) for Mobile Add Employee / Registration Link Speed-Dial */}
      {(subpage === 'employees' || !subpage) && (
        <Can permission="accounts.add_customuser">
          <div className="sm:hidden fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
            {/* Speed-dial options */}
            <AnimatePresence>
              {isFabOpen && (
                <div className="flex flex-col items-end gap-2 mb-1 w-44">
                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    onClick={() => {
                      setGenRole('');
                      setGenStore('');
                      setGenSubDepartment('');
                      setGenNaturesList([]);
                      setCopiedToast(false);
                      setShowLinkModal(true);
                      setIsFabOpen(false);
                    }}
                    className="w-full flex items-center justify-start gap-2 px-3.5 py-2.5 bg-surface-container border border-outline-variant rounded-full text-xs font-semibold shadow-md text-on-surface cursor-pointer active:scale-95 transition-transform"
                  >
                    <LinkIcon className="w-4 h-4 text-primary shrink-0" />
                    <span>Registration Link</span>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    onClick={() => {
                      handleOpenCreateEmployee();
                      setIsFabOpen(false);
                    }}
                    className="w-full flex items-center justify-start gap-2 px-3.5 py-2.5 bg-primary text-white rounded-full text-xs font-semibold shadow-md cursor-pointer active:scale-95 transition-transform"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Add Employee</span>
                  </motion.button>
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
        </Can>
      )}

      {/* FAB backdrop (close on outside click) */}
      {isFabOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/20"
          onClick={() => setIsFabOpen(false)}
        />
      )}

      {/* Employee Timesheet Calendar Modal */}
      {selectedTimesheetEmployee && isTimesheetModalOpen && (
        <TimeSheetModal
          isOpen={isTimesheetModalOpen}
          workerId={selectedTimesheetEmployee.user_id}
          workerName={selectedTimesheetEmployee.full_name}
          employeeNo={selectedTimesheetEmployee.employee_no}
          workerRole={selectedTimesheetEmployee.role?.role_name || selectedTimesheetEmployee.role}
          workerRate={selectedTimesheetEmployee.hourly_rate}
          subDepartments={selectedTimesheetEmployee.sub_departments?.map((sd: any) => sd.sub_department_name).join(', ')}
          initialCalendarOpen={true}
          onClose={() => {
            setIsTimesheetModalOpen(false);
            setSelectedTimesheetEmployee(null);
          }}
        />
      )}

      {/* Standalone Timesheet Print & View Modal */}
      {selectedPrintEmployee && isPrintModalOpen && (
        <TimesheetPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => {
            setIsPrintModalOpen(false);
            setSelectedPrintEmployee(null);
          }}
          workerId={selectedPrintEmployee.user_id}
          workerName={selectedPrintEmployee.full_name}
          employeeNo={selectedPrintEmployee.employee_no}
          workerRole={selectedPrintEmployee.role?.role_name || selectedPrintEmployee.role}
          workerRate={selectedPrintEmployee.hourly_rate}
          subDepartments={selectedPrintEmployee.sub_departments?.map((sd: any) => sd.sub_department_name).join(', ')}
        />
      )}
    </div>
  );
};