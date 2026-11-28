import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, MapPin, Store,
  Building, Building2, ChevronRight, ChevronLeft, X, Loader2, AlertCircle,
  Link as LinkIcon, Copy, Check, RefreshCw, UserCheck, CheckCircle, CheckCircle2, UserX
} from 'lucide-react';
import type { RootState } from '../store';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';
import Can from '@/hooks/Can';
import { usePermission } from '@/hooks/usePermission';
import { SearchableSelect } from '@/components/SearchableSelect';

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

export const StoresView: React.FC = () => {
  const { subpage } = useParams<{ subpage: string }>();
  const { token } = useSelector((state: RootState) => state.auth);
  const { hasPermission } = usePermission();

  // States
  const [data, setData] = useState<any[]>([]);
  const [extraData, setExtraData] = useState<any[]>([]); // Areas choices
  const [users, setUsers] = useState<any[]>([]); // Managers choices
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isMobile, setIsMobile] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
  const [managerTab, setManagerTab] = useState<'all' | 'approved' | 'unapproved'>('all');

  const handleActivateManager = async (userId: number | string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/stores/managers/${userId}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: true })
      });
      if (res.ok) {
        fetchData();
      } else {
        await fetch(`${API_URL}/accounts/customuser/${userId}/`, {
          method: 'PATCH',
          headers: {
            Authorization: `Token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ active: true })
        });
        fetchData();
      }
    } catch {
      setErrorMsg('Failed to activate manager account.');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Manager Registration Link Modal State
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [genStore, setGenStore] = useState('');
  const [copiedToast, setCopiedToast] = useState(false);

  const unmanagedStores = useMemo(() => {
    const storeList = subpage === 'managers' ? extraData : [];
    return storeList.filter((s: any) => !s.manager);
  }, [subpage, extraData]);

  const getGeneratedLink = () => {
    const baseUrl = `${window.location.origin}/signup`;
    const params = new URLSearchParams();
    const storeManagerRole = roles.find((r: any) => (r.role_name || '').toLowerCase() === 'store manager');
    if (storeManagerRole) {
      params.set('role', String(storeManagerRole.role_id));
    }
    if (genStore) {
      params.set('store', genStore);
    }
    const str = params.toString();
    return str ? `${baseUrl}?${str}` : baseUrl;
  };

  // Swap / Conflict handling states
  const [conflictAction, setConflictAction] = useState<'swap' | 'unassign' | 'reassign'>('swap');
  const [conflictReassignStoreId, setConflictReassignStoreId] = useState('');

  // Dedicated Swap Modal state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapManagerA, setSwapManagerA] = useState<string>('');
  const [swapManagerB, setSwapManagerB] = useState<string>('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapErrorMsg, setSwapErrorMsg] = useState('');

  const handleOpenSwapModal = (manager?: any) => {
    if (manager) {
      setSwapManagerA(String(manager.user_id));
      const other = data.find((m: any) => String(m.user_id) !== String(manager.user_id));
      setSwapManagerB(other ? String(other.user_id) : '');
    } else {
      setSwapManagerA(data[0] ? String(data[0].user_id) : '');
      setSwapManagerB(data[1] ? String(data[1].user_id) : '');
    }
    setSwapErrorMsg('');
    setShowSwapModal(true);
  };

  const handleExecuteSwap = async () => {
    if (!swapManagerA || !swapManagerB) {
      setSwapErrorMsg('Please select two managers to swap.');
      return;
    }
    if (swapManagerA === swapManagerB) {
      setSwapErrorMsg('Please select two different managers.');
      return;
    }

    setSwapLoading(true);
    setSwapErrorMsg('');

    try {
      const mA = data.find((m: any) => String(m.user_id) === String(swapManagerA));
      const mB = data.find((m: any) => String(m.user_id) === String(swapManagerB));

      const storeAId = mA?.store?.store_id || null;
      const storeBId = mB?.store?.store_id || null;

      const headers = {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json'
      };

      // 1. Assign Manager B to Manager A's store
      await fetch(`${API_URL}/stores/managers/${swapManagerB}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ store_id: storeAId })
      });

      // 2. Assign Manager A to Manager B's store
      const res = await fetch(`${API_URL}/stores/managers/${swapManagerA}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ store_id: storeBId })
      });

      if (res.ok) {
        setShowSwapModal(false);
        fetchData();
      } else {
        const errJson = await res.json();
        setSwapErrorMsg(Object.values(errJson).flat().join(', ') || 'Failed to execute store swap.');
      }
    } catch (err) {
      setSwapErrorMsg('Network error while swapping stores.');
    } finally {
      setSwapLoading(false);
    }
  };

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

  useEffect(() => {
    if (gridApi) {
      gridApi.setGridOption('quickFilterText', search);
    }
  }, [search, gridApi]);

  const [showModal, setShowModal] = useState(false);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<number | string | null>(null);
  const [locating, setLocating] = useState(false);

  // Strip backend-appended type suffix e.g. "Jahra (HM)" → "Jahra"
  const stripStoreName = (name: string) => (name || '').replace(/\s*\([A-Z]+\)\s*$/, '').trim();

  const columnDefs = useMemo<ColDef[]>(() => {
    const deletePermission =
      subpage === 'areas' ? 'stores.delete_area' :
        subpage === 'departments' ? 'stores.delete_department' :
          'stores.delete_store';

    const canDeleteSubpage = hasPermission(deletePermission);

    const editActionCellRenderer = (params: any) => {
      const item = params.data;
      if (!item) return null;
      return (
        <div className="flex items-center gap-1.5 h-full">
          <Can permission={deletePermission} className='flex gap-1'>

            {subpage === 'managers' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  handleOpenSwapModal(item);
                }}
                className="p-1.5 .border .border-primary/30 .bg-primary/10 text-primary hover:bg-primary/20 rounded cursor-pointer transition-colors inline-flex"
                title="Swap Manager Location"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.nativeEvent?.stopImmediatePropagation?.();
                handleDelete(item.store_id || item.area_id || item.department_id || item.user_id);
              }}
              className="p-1.5 .border .border-error/30 .bg-error-container/40 text-on-error-container hover:bg-error-container rounded cursor-pointer transition-colors inline-flex"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Can>
        </div>
      );
    };

    if (subpage === 'all' || !subpage) {
      const cols: ColDef[] = [
        { headerName: 'Store Code/ID', field: 'store_id', width: 130, minWidth: 105, cellClass: ' text-xs font-semibold' },
        { headerName: 'Short Code', field: 'short_code', width: 110, minWidth: 95, cellClass: ' text-xs font-bold text-primary', valueGetter: (p: any) => p.data?.short_code || '—' },
        { headerName: 'Name', field: 'store_name', flex: 2, minWidth: 180, cellClass: 'font-medium text-on-surface' },
        { headerName: 'Type', field: 'type', width: 140, minWidth: 115, valueGetter: (p: any) => { const map: Record<string, string> = { SUPER_MARKET: 'Super Market', HYPER_MARKET: 'Hyper Market', WAREHOUSE: 'Warehouse', FRESH: 'Fresh', COSTO: 'Costo', CAMP: 'Camp' }; return map[p.data?.type] || p.data?.type || 'N/A'; } },
        { headerName: 'Area', field: 'area.area_name', flex: 1, minWidth: 130, valueGetter: (p: any) => p.data?.area?.area_name || 'N/A' },
        { headerName: 'Manager', field: 'manager.full_name', flex: 1.2, minWidth: 150, valueGetter: (p: any) => p.data?.manager?.full_name || 'N/A' },
        { headerName: 'GPS Coord', field: 'latitude', flex: 1.2, minWidth: 160, cellClass: ' text-xs text-outline', valueGetter: (p: any) => p.data?.latitude && p.data?.longitude ? `${p.data.latitude}, ${p.data.longitude}` : 'No Coordinates' },
        {
          headerName: 'Status',
          field: 'active',
          width: 110,
          minWidth: 95,
          cellRenderer: (params: any) => (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium tracking-wide h-4 ${params.value ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600'
              }`}>
              {params.value ? 'Active' : 'Inactive'}
            </span>
          )
        }
      ];
      if (canDeleteSubpage && !isMobile) {
        cols.push({ headerName: 'Actions', width: 110, cellRenderer: editActionCellRenderer as any, sortable: false, filter: false });
      }
      return cols;
    } else if (subpage === 'areas') {
      const cols: ColDef[] = [
        { headerName: 'Area ID', field: 'area_id', width: 120, cellClass: ' text-xs font-semibold' },
        { headerName: 'Area Name', field: 'area_name', flex: 2, minWidth: 200, cellClass: 'font-medium text-on-surface' }
      ];
      if (canDeleteSubpage && !isMobile) {
        cols.push({ headerName: 'Actions', width: 110, cellRenderer: editActionCellRenderer as any, sortable: false, filter: false });
      }
      return cols;
    } else if (subpage === 'managers') {
      const cols: ColDef[] = [
        {
          headerName: 'Manager',
          field: 'full_name',
          flex: 1.8,
          minWidth: 190,
          cellRenderer: (params: any) => {
            const user = params.data;
            if (!user) return null;
            const initials = (user.full_name || user.username || 'M')
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            return (
              <div className="flex items-center gap-2.5 h-full">
                {user.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt={user.full_name || ''}
                    className="w-8 h-8 rounded-full object-cover border border-outline-variant shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/20 shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-xs text-on-surface truncate leading-tight">
                    {user.full_name || user.username}
                  </span>
                  <span className="text-[10px] text-outline  leading-tight">
                    {user.employee_no ? `${user.employee_no}` : user.username}
                  </span>
                </div>
              </div>
            );
          }
        },
        { headerName: 'Username', field: 'username', width: 120, minWidth: 105 },
        { headerName: 'Email', field: 'email', flex: 1.2, minWidth: 150 },
        { headerName: 'Phone', field: 'phone', width: 110, minWidth: 105 },
        { headerName: 'WhatsApp', field: 'whatsapp_number', width: 110, minWidth: 105 },
        { headerName: 'Assigned Store', field: 'store.store_name', flex: 1.4, minWidth: 150, valueGetter: (p: any) => p.data?.store?.store_name || 'No Store Assigned' },
        {
          headerName: 'Accessible Stores',
          field: 'accessible_stores',
          flex: 1.3,
          minWidth: 140,
          cellRenderer: (params: any) => {
            const storeList = params.data?.accessible_stores || [];
            const count = Array.isArray(storeList) ? storeList.length : 0;
            return (
              <div className="flex items-center gap-1.5 h-full">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] text-blue-800 font-medium tracking-wide h-4 ">
                  {count} {count === 1 ? 'Store' : 'Stores'}
                </span>
              </div>
            );
          }
        },
        {
          headerName: 'Status',
          field: 'active',
          width: 110,
          minWidth: 100,
          cellRenderer: (params: any) => (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium tracking-wide h-4 ${params.value ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
              }`}>
              {params.value ? 'Approved' : 'Unapproved'}
            </span>
          )
        }
      ];
      if (canDeleteSubpage && !isMobile) {
        cols.push({ headerName: 'Actions', width: 160, minWidth: 135, cellRenderer: editActionCellRenderer as any, sortable: false, filter: false });
      }
      return cols;
    } else {
      // departments
      const cols: ColDef[] = [
        { headerName: 'Department ID', field: 'department_id', width: 140, cellClass: ' text-xs font-semibold' },
        { headerName: 'Department Name', field: 'department_name', flex: 2, minWidth: 200, cellClass: 'font-medium text-on-surface' }
      ];
      if (canDeleteSubpage && !isMobile) {
        cols.push({ headerName: 'Actions', width: 110, cellRenderer: editActionCellRenderer as any, sortable: false, filter: false });
      }
      return cols;
    }
  }, [subpage, hasPermission, isMobile]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  // Form fields
  const STORE_TYPES = [
    { value: 'SUPER_MARKET', label: 'Super Market' },
    { value: 'HYPER_MARKET', label: 'Hyper Market' },
    { value: 'WAREHOUSE', label: 'Warehouse' },
    { value: 'FRESH', label: 'Fresh' },
    { value: 'COSTO', label: 'Costo' },
    { value: 'CAMP', label: 'Camp' },
    { value: 'KITCHEN', label: 'Kitchen' },
    { value: 'ROASTERY', label: 'Roastery' },
    { value: 'FINE DINE', label: 'Fine Dine' },
  ];

  const [storeForm, setStoreForm] = useState({
    store_id: '',
    store_name: '',
    short_code: '',
    type: '',
    area: '',
    address: '',
    phone: '',
    whatsapp_number: '',
    longitude: '',
    latitude: '',
    manager: '',
    active: true
  });
  const [managerForm, setManagerForm] = useState({
    employee_no: '',
    username: '',
    password: '',
    email: '',
    full_name: '',
    phone: '',
    whatsapp_number: '',
    store_id: '',
    accessible_stores: [] as string[],
    active: false
  });
  const [mgrStoreFilter, setMgrStoreFilter] = useState('');
  const [mgrAreaFilter, setMgrAreaFilter] = useState('');
  const [mgrAreas, setMgrAreas] = useState<any[]>([]);
  const [areaForm, setAreaForm] = useState({ area_name: '' });
  const [deptForm, setDeptForm] = useState({ department_name: '' });

  useEffect(() => {
    fetchData();
  }, [subpage, token]);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const headers = { Authorization: `Token ${token}` };
      if (subpage === 'all' || !subpage) {
        // Fetch Stores, Areas, Managers
        const [resStore, resArea, resUsers] = await Promise.all([
          fetch(`${API_URL}/stores/store/`, { headers }),
          fetch(`${API_URL}/stores/area/`, { headers }),
          fetch(`${API_URL}/stores/managers/`, { headers })
        ]);
        if (resStore.ok) setData(await resStore.json());
        if (resArea.ok) setExtraData(await resArea.json());
        if (resUsers.ok) setUsers(await resUsers.json());
      } else if (subpage === 'areas') {
        const res = await fetch(`${API_URL}/stores/area/`, { headers });
        if (res.ok) setData(await res.json());
      } else if (subpage === 'departments') {
        const res = await fetch(`${API_URL}/stores/department/`, { headers });
        if (res.ok) setData(await res.json());
      } else if (subpage === 'managers') {
        const [resManagers, resStores, resRoles, resAreas] = await Promise.all([
          fetch(`${API_URL}/stores/managers/`, { headers }),
          fetch(`${API_URL}/stores/store/`, { headers }),
          fetch(`${API_URL}/accounts/role/`, { headers }),
          fetch(`${API_URL}/stores/area/`, { headers })
        ]);
        if (resManagers.ok) setData(await resManagers.json());
        if (resStores.ok) setExtraData(await resStores.json());
        if (resRoles.ok) setRoles(await resRoles.json());
        if (resAreas.ok) setMgrAreas(await resAreas.json());
      }
    } catch (err) {
      setErrorMsg('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditItem(null);
    setStoreForm({
      store_id: '',
      store_name: '',
      short_code: '',
      type: '',
      area: '',
      address: '',
      phone: '',
      whatsapp_number: '',
      longitude: '',
      latitude: '',
      manager: '',
      active: true
    });
    setManagerForm({
      employee_no: '',
      username: '',
      password: '',
      email: '',
      full_name: '',
      phone: '',
      whatsapp_number: '',
      store_id: '',
      accessible_stores: [],
      active: false
    });
    setMgrStoreFilter('');
    setMgrAreaFilter('');
    setAreaForm({ area_name: '' });
    setDeptForm({ department_name: '' });
    setErrorMsg('');
    setShowModal(true);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    setErrorMsg('');

    // Helper to perform Nominatim reverse geocoding
    const fetchAddressFromCoords = async (lat: number, lon: number) => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'MaintenanceTrackerApp/1.0'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.display_name) {
            setStoreForm(prev => ({ ...prev, address: data.display_name }));
          }
        }
      } catch (err) {
        console.warn('Reverse geocoding failed:', err);
      }
    };

    // Helper to fall back to IP location trying multiple APIs in sequence
    const fallbackToIpLocation = async (originalErrorMsg: string) => {
      const apis = [
        {
          url: 'https://freeipapi.com/api/json',
          parse: (data: any) => ({
            lat: Number(data.latitude),
            lon: Number(data.longitude),
            address: [data.cityName, data.regionName, data.countryName].filter(Boolean).join(', ')
          })
        },
        {
          url: 'https://ipwho.is/',
          parse: (data: any) => ({
            lat: Number(data.latitude),
            lon: Number(data.longitude),
            address: [data.city, data.region, data.country].filter(Boolean).join(', ')
          })
        },
        {
          url: 'https://ipapi.co/json/',
          parse: (data: any) => ({
            lat: Number(data.latitude),
            lon: Number(data.longitude),
            address: [data.city, data.region, data.country_name].filter(Boolean).join(', ')
          })
        }
      ];

      for (const api of apis) {
        try {
          const res = await fetch(api.url);
          if (res.ok) {
            const data = await res.json();
            const parsed = api.parse(data);
            if (parsed.lat && parsed.lon) {
              setStoreForm(prev => ({
                ...prev,
                latitude: String(parsed.lat.toFixed(6)),
                longitude: String(parsed.lon.toFixed(6)),
                address: parsed.address || 'IP-based location'
              }));
              await fetchAddressFromCoords(parsed.lat, parsed.lon);
              return;
            }
          }
        } catch (e) {
          console.warn(`IP Geolocation from ${api.url} failed, trying next fallback...`, e);
        }
      }

      setErrorMsg(originalErrorMsg);
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        setStoreForm(prev => ({
          ...prev,
          latitude: String(lat.toFixed(6)),
          longitude: String(lon.toFixed(6))
        }));

        await fetchAddressFromCoords(lat, lon);
        setLocating(false);
      },
      async (error) => {
        console.warn('Geolocation failed, trying IP fallback:', error.message);
        await fallbackToIpLocation(`Failed to retrieve location: ${error.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  };

  const handleOpenAreaModal = () => {
    setAreaForm({ area_name: '' });
    setEditingAreaId(null);
    setErrorMsg('');
    setShowAreaModal(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditItem(item);
    if (subpage === 'all' || !subpage) {
      setStoreForm({
        store_id: item.store_id,
        store_name: stripStoreName(item.store_name),
        short_code: item.short_code || '',
        type: item.type || '',
        area: item.area?.area_id || '',
        address: item.address || '',
        phone: item.phone || '',
        whatsapp_number: item.whatsapp_number || '',
        longitude: item.longitude || '',
        latitude: item.latitude || '',
        manager: item.manager?.user_id || item.manager || '',
        active: item.active
      });
    } else if (subpage === 'areas') {
      setAreaForm({ area_name: item.area_name });
    } else if (subpage === 'departments') {
      setDeptForm({ department_name: item.department_name });
    } else if (subpage === 'managers') {
      const accStores = Array.isArray(item.accessible_stores)
        ? item.accessible_stores.map((s: any) => String(s.store_id || s))
        : [];
      setManagerForm({
        employee_no: item.employee_no || '',
        username: item.username || '',
        password: '',
        email: item.email || '',
        full_name: item.full_name || '',
        phone: item.phone || '',
        whatsapp_number: item.whatsapp_number || '',
        store_id: item.store?.store_id || '',
        accessible_stores: accStores,
        active: item.active ?? false
      });
      setMgrStoreFilter('');
      setMgrAreaFilter('');
    }
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');

    let endpoint = '';
    let method = editItem ? 'PATCH' : 'POST';
    let bodyData: any = {};

    if (subpage === 'all' || !subpage) {
      endpoint = editItem ? `${API_URL}/stores/store/${editItem.store_id}/` : `${API_URL}/stores/store/`;
      bodyData = { ...storeForm };
      if (!bodyData.manager) delete bodyData.manager;
      if (!bodyData.area) delete bodyData.area;
    } else if (subpage === 'areas') {
      endpoint = editItem ? `${API_URL}/stores/area/${editItem.area_id}/` : `${API_URL}/stores/area/`;
      bodyData = areaForm;
    } else if (subpage === 'departments') {
      endpoint = editItem ? `${API_URL}/stores/department/${editItem.department_id}/` : `${API_URL}/stores/department/`;
      bodyData = deptForm;
    } else if (subpage === 'managers') {
      endpoint = editItem ? `${API_URL}/stores/managers/${editItem.user_id}/` : `${API_URL}/stores/managers/`;
      bodyData = { ...managerForm };
      if (!bodyData.store_id) {
        bodyData.store_id = null;
      }
      if (editItem && !bodyData.password) {
        delete bodyData.password;
      }

      // Check if target selected store is currently assigned to another manager
      const selectedStoreObj = extraData.find((s: any) => String(s.store_id) === String(managerForm.store_id));
      const existingManager = selectedStoreObj?.manager;
      const isTargetConflict = existingManager && String(existingManager.user_id) !== String(editItem?.user_id);

      if (isTargetConflict && editItem) {
        const headers = {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json'
        };

        if (conflictAction === 'swap') {
          // Reassign existing manager of target store to editItem's previous store
          const prevStoreId = editItem.store?.store_id || null;
          await fetch(`${API_URL}/stores/managers/${existingManager.user_id}/`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ store_id: prevStoreId })
          });
        } else if (conflictAction === 'reassign' && conflictReassignStoreId) {
          // Reassign existing manager to selected store
          await fetch(`${API_URL}/stores/managers/${existingManager.user_id}/`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ store_id: conflictReassignStoreId })
          });
        }
      }
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
            setErrorMsg(formatted || 'Failed to save changes.');
          }
        } else {
          setErrorMsg('Failed to save changes.');
        }
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAreaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg('');

    let endpoint = `${API_URL}/stores/area/`;
    let method = 'POST';

    if (editingAreaId) {
      endpoint = `${API_URL}/stores/area/${editingAreaId}/`;
      method = 'PATCH';
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(areaForm)
      });
      if (response.ok) {
        const savedArea = await response.json();
        setAreaForm({ area_name: '' });
        setEditingAreaId(null);
        // If creating/updating area while store form is open, set it as selected
        if (showModal) {
          setStoreForm(prev => ({ ...prev, area: savedArea.area_id }));
        }
        fetchData();
      } else {
        const errorRes = await response.json();
        setErrorMsg(Object.values(errorRes).flat().join(', ') || 'Failed to save area.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteArea = async (areaId: number | string) => {
    if (!window.confirm('Are you sure you want to delete this area?')) return;
    setErrorMsg('');
    try {
      const response = await fetch(`${API_URL}/stores/area/${areaId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` }
      });
      if (response.ok) {
        fetchData();
      } else {
        const errorRes = await response.json().catch(() => null);
        let errorText = 'Failed to delete area.';
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
    } catch (err) {
      setErrorMsg('Network error.');
    }
  };

  const handleDelete = async (id: number | string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    setErrorMsg('');
    let endpoint = '';
    if (subpage === 'all' || !subpage) endpoint = `${API_URL}/stores/store/${id}/`;
    else if (subpage === 'areas') endpoint = `${API_URL}/stores/area/${id}/`;
    else if (subpage === 'departments') endpoint = `${API_URL}/stores/department/${id}/`;
    else if (subpage === 'managers') endpoint = `${API_URL}/stores/managers/${id}/`;

    try {
      const response = await fetch(endpoint, {
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
    } catch (err) {
      setErrorMsg('Network error.');
    }
  };

  const filteredData = data.filter(item => {
    if (subpage === 'managers') {
      if (managerTab === 'approved' && !item.active) return false;
      if (managerTab === 'unapproved' && item.active) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const fieldsToSearch = [
      item.employee_no,
      item.full_name,
      item.username,
      item.email,
      item.phone,
      item.whatsapp_number,
      item.store_id,
      item.store_name,
      item.store?.store_name,
      item.store?.store_id,
      item.area_id,
      item.area_name,
      item.area?.area_name,
      item.department_id,
      item.department_name,
      item.manager?.full_name,
      item.role?.role_name || item.role,
      item.active ? 'approved active' : 'unapproved pending'
    ];
    return fieldsToSearch.some(val => val && String(val).toLowerCase().includes(q));
  });

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // Fallback for Area List inside Area Modal
  const areaList = extraData.length > 0 ? extraData : (subpage === 'areas' ? data : []);

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-lg w-full">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input
              type="text"
              placeholder="Search here..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant rounded pl-10 pr-4 py-2.5 outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
            />
          </div>

          {subpage === 'managers' && (
            <Can permission="accounts.can_edit_full_manager_details">

              <div className="flex items-center gap-1 p-1 bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant rounded shrink-0">
                <button
                  type="button"
                  onClick={() => setManagerTab('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${managerTab === 'all'
                    ? 'bg-primary text-white'
                    : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setManagerTab('approved')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${managerTab === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  Approved
                </button>
                <button
                  type="button"
                  onClick={() => setManagerTab('unapproved')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${managerTab === 'unapproved'
                    ? 'bg-amber-600 text-white'
                    : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  Unapproved
                </button>
              </div>
            </Can>
          )}
        </div>

        <div className="hidden sm:flex flex-wrap items-center gap-2">
          {/* Quick Create/Manage Areas Button */}
          {(subpage === 'all' || !subpage) && <>
            <Can permission='stores.add_area'>
              <button
                onClick={handleOpenAreaModal}
                className="border-outline-none bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-2 rounded hidden sm:flex items-center gap-2 transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-primary" />
                Manage Areas
              </button>
            </Can>
          </>
          }

          {subpage === 'managers' && (
            <>
              <Can permission='stores.add_area'>

                <button
                  onClick={() => handleOpenSwapModal()}
                  className="border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium px-3 py-2 rounded hidden sm:flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Swap Managers
                </button>
              </Can>
              <Can permission='stores.add_area'>
                <button
                  onClick={() => setShowLinkModal(true)}
                  className="border border-outline dark:border-dark-outline bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium px-3 py-2 rounded hidden sm:flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LinkIcon className="w-4 h-4 text-primary" />
                  Generate Manager Link
                </button>
              </Can>
            </>
          )}

          <Can permission={subpage === 'managers' ? 'accounts.add_customuser' : 'stores.add_store'}>
            <button
              onClick={handleOpenCreate}
              className='hidden sm:flex bg-primary hover:bg-primary-container text-on-primary text-xs font-medium px-3 py-2 rounded items-center gap-2 transition-colors flex-shrink-0'
            >
              <Plus className="w-4 h-4" />
              Add New {subpage === 'areas' ? 'Area' : subpage === 'departments' ? 'Department' : subpage === 'managers' ? 'Manager' : 'Store'}
            </button>
          </Can>
        </div>
      </div>

      {/* Content Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 w-full bg-surface-container-high dark:bg-dark-surface-container-low animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile View: Stacked Card Rows */}
          <div className="sm:hidden divide-y divide-outline-variant/30 flex flex-col gap-2  border-outline-variant/30 bg-surface">
            {paginatedData.map(item => {
              const itemId = item.store_id || item.area_id || item.department_id || item.user_id;
              return (
                <button
                  key={itemId}
                  type="button"
                  onClick={() => handleOpenEdit(item)}
                  // className="w-full text-left px-4 py-3.5 flex  items-start gap-3 border border-amber-500 rounded bg-surface active:bg-surface-container-high transition-colors cursor-pointer"
                  className="w-full text-sm bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant rounded p-2.5 outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {subpage === 'all' || !subpage ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-on-surface text-sm truncate">{item.store_name}</h4>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                            }`}>
                            {item.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-outline">
                          <span className=" text-[10px] font-semibold">Code: {item.store_id}</span>
                          <span>·</span>
                          <span>📍 {item.area?.area_name || 'No Area'}</span>
                          {item.manager && (
                            <>
                              <span>·</span>
                              <span>👤 {item.manager.full_name}</span>
                            </>
                          )}
                        </div>
                      </>
                    ) : subpage === 'areas' ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-on-surface text-sm truncate">{item.area_name}</span>
                        <span className=" text-[10px] text-outline">ID: {item.area_id}</span>
                      </div>
                    ) : subpage === 'managers' ? (
                      <div className="flex items-center gap-3">
                        {item.profile_image ? (
                          <img
                            src={item.profile_image}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border border-outline-variant shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/20 shrink-0">
                            {(item.full_name || item.username || 'M').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-on-surface text-xs truncate text-start">{item.full_name || item.username}</h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                              {item.accessible_stores?.length || 0} Stores
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-outline pt-0.5 text-start flex-wrap">
                            <span>📧 {item.email || 'N/A'}</span>
                            <span>·</span>
                            <span>🏪 {item.store?.store_name || 'No Store Assigned'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-on-surface text-sm truncate">{item.department_name}</span>
                        <span className=" text-[10px] text-outline">ID: {item.department_id}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop View: Table */}
          <div className="hidden sm:block">
            <div className="ag-theme-app w-full h-[clamp(340px,calc(100dvh-235px),780px)]">
              <AgGridReact
                theme={appTheme}
                rowData={filteredData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                quickFilterText={search}
                pagination={true}
                paginationPageSize={itemsPerPage}
                suppressPaginationPanel={true}
                onGridReady={onGridReady}
                onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                rowHeight={52}
                headerHeight={44}
                rowClass="cursor-pointer"
                onRowClicked={(event: any) => {
                  const colId = event.column?.getColId();
                  const targetEl = event.event?.target as HTMLElement | undefined;
                  if (colId === 'actions' || targetEl?.closest('button')) {
                    return;
                  }
                  if (event.data) {
                    handleOpenEdit(event.data);
                  }
                }}
              />
            </div>
          </div>

          {/* Custom Pagination Footer */}
          {!loading && filteredData.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border border-t-0 border-outline-variant rounded-b-2xl bg-surface-container-low">
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
          )}
        </>
      )}

      {/* Main Creation/Edit Form Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant w-full max-w-3xl overflow-y-auto max-h-[90vh] rounded shadow-2xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant dark:border-dark-outline-variant">
                <h3 className="text-base font-bold text-on-surface dark:text-dark-on-surface">
                  {editItem ? 'Edit Details' : `Create New ${subpage === 'areas' ? 'Area' : subpage === 'departments' ? 'Department' : subpage === 'managers' ? 'Manager' : 'Store'}`}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded text-outline hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Inline Error Banner */}
              {errorMsg && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {subpage === 'all' || !subpage ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Location Code</label>
                        <input
                          required
                          // disabled={!!editItem}
                          type="text"
                          placeholder="e.g. 803"
                          value={storeForm.store_id}
                          onChange={e => setStoreForm({ ...storeForm, store_id: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Location Name</label>
                        <input
                          required
                          type="text"
                          placeholder="e.g. Salmiya Market"
                          value={storeForm.store_name}
                          onChange={e => setStoreForm({ ...storeForm, store_name: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Short Code (Ticket Prefix) <span className="text-error">*</span></label>
                        <input
                          required
                          maxLength={3}
                          type="text"
                          placeholder="e.g. SLM"
                          value={storeForm.short_code}
                          onChange={e => setStoreForm({ ...storeForm, short_code: e.target.value.toUpperCase().slice(0, 3) })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface  uppercase font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-outline mb-1">Location Type</label>
                      <SearchableSelect
                        required
                        disabled={!hasPermission('add_area')}
                        value={storeForm.type}
                        onChange={val => setStoreForm({ ...storeForm, type: val })}
                        placeholder="Select Location Type"
                        options={STORE_TYPES.map(t => ({ value: t.value, label: t.label }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-outline">Area Location</label>
                          <Can permission='stores.add_area' >
                            <button
                              type="button"
                              onClick={handleOpenAreaModal}
                              className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> New Area
                            </button>
                          </Can>
                        </div>

                        <SearchableSelect
                          disabled={!hasPermission('add_area')}
                          required
                          value={storeForm.area}
                          onChange={val => setStoreForm({ ...storeForm, area: val })}
                          placeholder="Select Area"
                          options={areaList.map(a => ({ value: a.area_id, label: a.area_name }))}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Store Manager</label>
                        <select
                          disabled
                          value={storeForm.manager}
                          onChange={e => setStoreForm({ ...storeForm, manager: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        >
                          <option value="">No Manager Assigned</option>
                          {users
                            .filter(u => {
                              if (!u.store) return true;
                              const currentManagerId = Number(storeForm.manager);
                              const currentStoreId = Number(editItem?.store_id ?? storeForm.store_id);
                              const managerStoreId = Number(u.store?.store_id ?? u.store);
                              return Number(u.user_id) === currentManagerId || (currentStoreId && managerStoreId === currentStoreId);
                            })
                            .map(u => (
                              <option key={u.user_id} value={u.user_id}>
                                {u.full_name}{u.store ? ` (${u.store.store_name || u.store})` : ''}
                              </option>
                            ))
                          }
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Location Contact No</label>
                        <input
                          // required
                          type="text"
                          placeholder="8 digits"
                          value={storeForm.phone}
                          onChange={e => setStoreForm({ ...storeForm, phone: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Location WhatsApp No</label>
                        <input
                          // required
                          type="text"
                          placeholder="8 or 10 digits"
                          value={storeForm.whatsapp_number}
                          onChange={e => setStoreForm({ ...storeForm, whatsapp_number: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                    </div>

                    {/* Locate Me Section */}
                    {(!storeForm.latitude || !storeForm.longitude) && (
                      <div className="flex items-center justify-between gap-2 p-2 border border-dashed border-primary/40 rounded bg-primary/5">
                        <span className="text-[11px] text-primary font-medium pl-1">Autofill coords & address</span>
                        <button
                          type="button"
                          onClick={handleUseCurrentLocation}
                          disabled={locating}
                          className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary text-[10px] font-bold px-3 py-1.5 rounded transition-colors cursor-pointer disabled:opacity-70"
                        >
                          {locating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <MapPin className="w-3.5 h-3.5" />
                          )}
                          Use Location
                        </button>
                      </div>
                    )}

                    {/* Coordinates & Address */}
                    {storeForm.latitude && storeForm.longitude && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-outline mb-1">Longitude</label>
                            <input
                              type="number"
                              step="0.000001"
                              disabled
                              placeholder="e.g. 47.9784"
                              value={storeForm.longitude}
                              onChange={e => setStoreForm({ ...storeForm, longitude: e.target.value })}
                              className="w-full text-xs bg-surface-container-low border border-outline-variant p-2.5 rounded outline-none text-on-surface dark:text-dark-on-surface opacity-75"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-outline mb-1">Latitude</label>
                            <input
                              type="number"
                              step="0.000001"
                              disabled
                              placeholder="e.g. 29.3759"
                              value={storeForm.latitude}
                              onChange={e => setStoreForm({ ...storeForm, latitude: e.target.value })}
                              className="w-full text-xs bg-surface-container-low border border-outline-variant p-2.5 rounded outline-none text-on-surface dark:text-dark-on-surface opacity-75"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-outline mb-1">Street Address</label>
                          <textarea
                            disabled
                            rows={2}
                            placeholder="Detailed address location..."
                            value={storeForm.address}
                            onChange={e => setStoreForm({ ...storeForm, address: e.target.value })}
                            className="w-full text-xs bg-surface-container-low border border-outline-variant p-2.5 rounded outline-none text-on-surface dark:text-dark-on-surface opacity-75 resize-none"
                          />
                        </div>
                      </>
                    )}
                    <Can permission='stores.change_store'>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={storeForm.active}
                          id="store-active-checkbox"
                          onChange={e => setStoreForm({ ...storeForm, active: e.target.checked })}
                        />
                        <label htmlFor="store-active-checkbox" className="text-xs font-semibold text-outline">
                          Mark store as active
                        </label>
                      </div>
                    </Can>
                  </>
                ) : subpage === 'areas' ? (
                  <div>
                    <label className="block text-xs font-semibold text-outline mb-1.5">Area Location Name</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Farwaniya Area"
                      value={areaForm.area_name}
                      onChange={e => setAreaForm({ area_name: e.target.value })}
                      className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                    />
                  </div>
                ) : subpage === 'managers' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Full Name *</label>
                        <input
                          required
                          type="text"
                          placeholder="e.g. John Doe"
                          value={managerForm.full_name}
                          onChange={e => setManagerForm({ ...managerForm, full_name: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                      <Can permission="accounts.can_edit_full_manager_details">
                        <div>
                          <label className="block text-xs font-semibold text-outline mb-1">Employee ID (Login)</label>
                          <input
                            type="text"
                            placeholder="e.g. EMP-101"
                            value={managerForm.employee_no}
                            onChange={e => setManagerForm({ ...managerForm, employee_no: e.target.value })}
                            className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                          />
                        </div>
                      </Can>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Can permission="accounts.can_edit_full_manager_details">
                        <div>
                          <label className="block text-xs font-semibold text-outline mb-1">Blog ID (Login) *</label>
                          <input
                            required
                            type="text"
                            placeholder="e.g. john_manager"
                            value={managerForm.username}
                            onChange={e => setManagerForm({ ...managerForm, username: e.target.value })}
                            className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                          />
                        </div>
                      </Can>
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Email</label>
                        <input
                          type="email"
                          placeholder="e.g. john@example.com"
                          value={managerForm.email}
                          onChange={e => setManagerForm({ ...managerForm, email: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                    </div>

                    <Can permission="accounts.can_edit_full_manager_details">
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">
                          Password {editItem ? '(Leave blank to keep current)' : '*'}
                        </label>
                        <input
                          type="password"
                          required={!editItem}
                          placeholder={editItem ? '•••••••• (Leave blank to keep current)' : 'Set password'}
                          value={managerForm.password}
                          onChange={e => setManagerForm({ ...managerForm, password: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                    </Can>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">Contact No</label>
                        <input
                          required
                          type="text"
                          placeholder="8 digits"
                          value={managerForm.phone}
                          onChange={e => setManagerForm({ ...managerForm, phone: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">WhatsApp No</label>
                        <input
                          required
                          type="text"
                          placeholder="8 or 10 digits"
                          value={managerForm.whatsapp_number}
                          onChange={e => setManagerForm({ ...managerForm, whatsapp_number: e.target.value })}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        />
                      </div>
                    </div>

                    <Can permission="accounts.can_edit_full_manager_details">
                      <div className="p-3.5 rounded border border-outline-variant bg-surface-container-low flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded ${managerForm.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                            {managerForm.active ? <CheckCircle2 className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-on-surface">
                              Account Status: {managerForm.active ? 'Active & Approved' : 'Pending Approval'}
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              {managerForm.active ? 'User can sign in and perform assigned duties' : 'User account sign-in access is suspended'}
                            </div>
                          </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={managerForm.active}
                            onChange={e => setManagerForm({ ...managerForm, active: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                          {/* <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div> */}
                        </label>
                      </div>
                    </Can>

                    {editItem && (
                      <div className="p-3 bg-surface-container-low dark:bg-dark-surface-container-low border border-outline-variant dark:border-dark-outline-variant rounded flex items-center justify-between">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant dark:text-dark-on-surface-variant">
                            Previous / Current Store
                          </span>
                          <span className="text-xs font-semibold text-on-surface dark:text-dark-on-surface">
                            {editItem?.store?.store_name || 'No Store Assigned'}
                          </span>
                        </div>
                        {editItem?.store && (
                          <span className="text-[10px]  px-2 py-0.5 rounded bg-primary/10 text-primary">
                            ID #{editItem.store.store_id}
                          </span>
                        )}
                      </div>
                    )}
                    <Can permission="accounts.can_edit_full_manager_details">

                      <div>
                        <label className="block text-xs font-semibold text-outline mb-1">New Store / Location</label>
                        <select
                          value={managerForm.store_id}
                          onChange={e => {
                            setManagerForm({ ...managerForm, store_id: e.target.value });
                            setConflictAction('swap');
                            setConflictReassignStoreId('');
                          }}
                          className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                        >
                          <option value="">No Store Assigned (Unassigned)</option>
                          {extraData.map((s: any) => {
                            const mgrName = s.manager?.full_name ? ` (Managed by ${s.manager.full_name})` : ' (Unmanaged)';
                            return (
                              <option key={s.store_id} value={s.store_id}>
                                {s.store_id} -{s.store_name}{mgrName}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </Can>
                    <div>


                      <Can permission="accounts.can_edit_full_manager_details">
                        {(() => {
                          const selectedStoreObj = extraData.find((s: any) => String(s.store_id) === String(managerForm.store_id));
                          const targetManager = selectedStoreObj?.manager;
                          if (!targetManager || String(targetManager.user_id) === String(editItem?.user_id)) return null;

                          const prevStoreName = editItem?.store?.store_name;

                          return (
                            <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/40 rounded space-y-3">
                              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-xs">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>Store Conflict — Reassign {targetManager.full_name}</span>
                              </div>
                              <p className="text-xs text-on-surface dark:text-dark-on-surface">
                                <strong>{selectedStoreObj.store_id} - {selectedStoreObj.store_name}</strong> is currently assigned to <strong>{targetManager.full_name}</strong>.
                              </p>
                              <div className="text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant">
                                What should happen to <strong>{targetManager.full_name}</strong>?
                              </div>

                              <div className="space-y-2">
                                <label className="flex items-center gap-2.5 text-xs text-on-surface dark:text-dark-on-surface cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name="conflictAction"
                                    value="swap"
                                    checked={conflictAction === 'swap'}
                                    onChange={() => setConflictAction('swap')}
                                    className="text-primary focus:ring-primary"
                                  />
                                  <span>
                                    <strong>Swap Stores:</strong> Move {targetManager.full_name} to {prevStoreName ? `"${prevStoreName}"` : 'No Store (Unassigned)'}
                                  </span>
                                </label>

                                <label className="flex items-center gap-2.5 text-xs text-on-surface dark:text-dark-on-surface cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name="conflictAction"
                                    value="unassign"
                                    checked={conflictAction === 'unassign'}
                                    onChange={() => setConflictAction('unassign')}
                                    className="text-primary focus:ring-primary"
                                  />
                                  <span>
                                    <strong>Unassign:</strong> Leave {targetManager.full_name} unassigned (No Store)
                                  </span>
                                </label>

                                <label className="flex items-center gap-2.5 text-xs text-on-surface dark:text-dark-on-surface cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name="conflictAction"
                                    value="reassign"
                                    checked={conflictAction === 'reassign'}
                                    onChange={() => setConflictAction('reassign')}
                                    className="text-primary focus:ring-primary"
                                  />
                                  <span>
                                    <strong>Reassign to another store:</strong>
                                  </span>
                                </label>

                                {conflictAction === 'reassign' && (
                                  <select
                                    value={conflictReassignStoreId}
                                    onChange={e => setConflictReassignStoreId(e.target.value)}
                                    className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2 rounded text-on-surface dark:text-dark-on-surface"
                                  >
                                    <option value="">Select New Store for {targetManager.full_name}</option>
                                    {extraData
                                      .filter((s: any) => {
                                        if (String(s.store_id) === String(managerForm.store_id)) return false;
                                        if (!s.manager) return true;
                                        return editItem?.store?.store_id && String(s.store_id) === String(editItem.store.store_id);
                                      })
                                      .map((s: any) => (
                                        <option key={s.store_id} value={s.store_id}>
                                          {s.store_id} - {s.store_name}{s.manager ? ` (Manager: ${s.manager.full_name})` : ' (Unmanaged)'}
                                        </option>
                                      ))
                                    }
                                  </select>
                                )}
                              </div>

                              {/* Live Reassignment Outcome Summary */}
                              <div className="pt-2 border-t border-amber-500/30 text-xs space-y-1 text-on-surface dark:text-dark-on-surface">
                                <div className="font-semibold text-amber-700 dark:text-amber-300 text-[11px] uppercase tracking-wider">Result Summary:</div>
                                <div>• <strong>{editItem?.full_name || 'Manager'}</strong> ➔ <span className="text-primary font-medium">{selectedStoreObj.store_id} - {selectedStoreObj.store_name}</span></div>
                                {conflictAction === 'swap' && (
                                  <div>• <strong>{targetManager.full_name}</strong> ➔ <span className="text-primary font-medium">{editItem?.store ? `${editItem.store.store_id} - ${editItem.store.store_name}` : 'No Store (Unassigned)'}</span></div>
                                )}
                                {conflictAction === 'unassign' && (
                                  <>
                                    <div>• <strong>{targetManager.full_name}</strong> ➔ <span className="text-amber-600 dark:text-amber-400 font-medium">No Store (Unassigned)</span></div>
                                    {editItem?.store && (
                                      <div className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant italic">Note: Store "{editItem.store.store_name}" will have no manager assigned (empty).</div>
                                    )}
                                  </>
                                )}
                                {conflictAction === 'reassign' && (
                                  <>
                                    {(() => {
                                      const reassignedStoreObj = extraData.find((s: any) => String(s.store_id) === String(conflictReassignStoreId));
                                      return (
                                        <div>• <strong>{targetManager.full_name}</strong> ➔ <span className="text-primary font-medium">{reassignedStoreObj ? `${reassignedStoreObj.store_id} - ${reassignedStoreObj.store_name}` : 'Select a store above'}</span></div>
                                      );
                                    })()}
                                    {editItem?.store && String(editItem.store.store_id) !== String(conflictReassignStoreId) && (
                                      <div className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant italic">Note: Store "{editItem.store.store_name}" will have no manager assigned (empty).</div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Accessible Stores section */}



                        <div className="flex flex-col flex-1 min-h-0 pt-3 border-t border-outline-variant/60 mt-2 space-y-2">
                          <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                            <Building2 className="w-4 h-4" />
                            Accessible Stores ({managerForm.accessible_stores.length})
                          </h4>

                          <div className="grid grid-cols-2 gap-2 shrink-0">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Filter stores..."
                                value={mgrStoreFilter}
                                onChange={e => setMgrStoreFilter(e.target.value)}
                                className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant rounded pl-8 pr-2 py-1.5 text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary"
                              />
                            </div>
                            <select
                              value={mgrAreaFilter}
                              onChange={e => setMgrAreaFilter(e.target.value)}
                              className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant rounded px-2 py-1.5 text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary cursor-pointer"
                            >
                              <option value="">All Areas</option>
                              <option value="NO_AREA">Unassigned Area</option>
                              {mgrAreas.map((a: any) => (
                                <option key={a.area_id} value={a.area_id}>{a.area_name}</option>
                              ))}
                            </select>
                          </div>

                          {(() => {
                            const storeList: any[] = extraData || [];
                            const filteredStores = storeList.filter((s: any) => {
                              const matchesSearch = (s.store_name || '').toLowerCase().includes(mgrStoreFilter.toLowerCase());
                              if (!matchesSearch) return false;
                              if (!mgrAreaFilter) return true;
                              if (mgrAreaFilter === 'NO_AREA') return !s.area;
                              const storeAreaId = s.area?.area_id ?? s.area;
                              return String(storeAreaId) === String(mgrAreaFilter);
                            });

                            return (
                              <div className="flex flex-col flex-1 min-h-0">
                                <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0 text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant">
                                  <span>{filteredStores.length} store(s)</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const filteredIds = filteredStores.map((s: any) => String(s.store_id));
                                        const union = Array.from(new Set([...managerForm.accessible_stores.map(String), ...filteredIds]));
                                        setManagerForm({ ...managerForm, accessible_stores: union });
                                      }}
                                      className="text-primary hover:underline font-semibold cursor-pointer border-none bg-transparent"
                                    >
                                      + Select All
                                    </button>
                                    <span>|</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const filteredIdsSet = new Set(filteredStores.map((s: any) => String(s.store_id)));
                                        const remaining = managerForm.accessible_stores.filter(id => !filteredIdsSet.has(String(id)));
                                        setManagerForm({ ...managerForm, accessible_stores: remaining });
                                      }}
                                      className="text-error hover:underline font-semibold cursor-pointer border-none bg-transparent"
                                    >
                                      - Deselect
                                    </button>
                                  </div>
                                </div>

                                <div className="flex-1 overflow-y-auto border border-outline-variant rounded p-2.5 space-y-1.5 bg-surface-container-low dark:bg-dark-surface-container-low min-h-[160px] max-h-[240px]">
                                  {filteredStores.map((s: any) => {
                                    const checked = managerForm.accessible_stores.some(id => String(id) === String(s.store_id));
                                    const areaName = s.area?.area_name;
                                    return (
                                      <label key={s.store_id} className="flex items-center justify-between gap-2 text-xs text-on-surface dark:text-dark-on-surface cursor-pointer hover:text-primary py-0.5 select-none">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={e => {
                                              const sid = String(s.store_id);
                                              const newList = e.target.checked
                                                ? [...managerForm.accessible_stores.filter(id => String(id) !== sid), sid]
                                                : managerForm.accessible_stores.filter(id => String(id) !== sid);
                                              setManagerForm({ ...managerForm, accessible_stores: newList });
                                            }}
                                            className="w-3.5 h-3.5 text-primary border-outline-variant rounded focus:ring-primary shrink-0 cursor-pointer"
                                          />
                                          <span className="truncate">{s.store_id} - {s.store_name}</span>
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
                      </Can>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-outline mb-1.5">Department Name</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. HVAC Maintenance"
                      value={deptForm.department_name}
                      onChange={e => setDeptForm({ department_name: e.target.value })}
                      className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-outline-variant dark:border-dark-outline-variant">
                  {editItem ? (
                    <div>
                      <Can permission={
                        subpage === 'areas' ? 'stores.delete_area' :
                          subpage === 'departments' ? 'stores.delete_department' :
                            subpage === 'managers' ? 'accounts.delete_customuser' :
                              'stores.delete_store'
                      }>
                        <button
                          type="button"
                          onClick={() => {
                            handleDelete(editItem.store_id || editItem.area_id || editItem.department_id || editItem.user_id);
                            setShowModal(false);
                          }}
                          className="px-3.5 py-2 bg-red-500 border border-error/30 text-white font-semibold hover:bg-red-600 text-xs  rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </Can>
                    </div>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-3.5 py-2 border border-outline bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium rounded transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-3.5 py-2 bg-primary hover:bg-primary-container text-on-primary text-xs font-medium rounded flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-70 shadow-xs"
                    >
                      {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )
        }
      </AnimatePresence >

      {/* Standalone Area Management Modal Popup (Creation + Display List) */}
      <AnimatePresence>
        {
          showAreaModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAreaModal(false)}
                className="absolute inset-0 bg-black"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-surface-container dark:bg-dark-surface-container border border-outline-variant/40 dark:border-dark-outline-variant/40 w-full max-w-md rounded shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col"
              >
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40 dark:border-dark-outline-variant/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <h3 className="text-base font-bold text-on-surface dark:text-dark-on-surface">
                      Manage Areas
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowAreaModal(false)}
                    className="p-1 rounded text-outline hover:bg-surface-container-high cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Input section to add new area */}
                <form onSubmit={handleAreaSubmit} className="space-y-3 shrink-0">
                  <div>
                    <label className="block text-xs font-semibold text-outline mb-1.5">
                      {editingAreaId ? 'Edit Area Name' : 'Create New Area'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        required
                        type="text"
                        placeholder="e.g. Hawally Area"
                        value={areaForm.area_name}
                        onChange={e => setAreaForm({ area_name: e.target.value })}
                        className="flex-1 text-xs bg-surface dark:bg-dark-surface border border-outline-variant/40 dark:border-dark-outline-variant/40 p-2.5 rounded outline-none focus:border-primary text-on-surface dark:text-dark-on-surface"
                      />
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-4 py-2.5 bg-primary text-white text-xs font-semibold rounded hover:bg-primary/95 flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingAreaId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        {editingAreaId ? 'Save' : 'Add'}
                      </button>
                      {editingAreaId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAreaId(null);
                            setAreaForm({ area_name: '' });
                          }}
                          className="px-3 py-2.5 border border-outline-variant/40 dark:border-dark-outline-variant/40 text-xs font-semibold rounded hover:bg-surface-container-high cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                {/* Display existing areas */}
                <div className="flex-1 overflow-y-auto space-y-2 pt-2 border-t border-outline-variant/40 dark:border-dark-outline-variant/40 min-h-[140px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
                      Existing Areas ({areaList.length})
                    </span>
                  </div>

                  {areaList.length === 0 ? (
                    <p className="text-xs text-outline italic text-center py-6">No areas created yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {areaList.map((area: any) => (
                        <div
                          key={area.area_id}
                          className="flex items-center justify-between p-2.5 bg-surface dark:bg-dark-surface border border-outline-variant/40 dark:border-dark-outline-variant/40 rounded hover:border-outline transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-on-surface dark:text-dark-on-surface">{area.area_name}</span>
                            <span className=" text-[10px] text-outline">({area.store_count} locations)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAreaId(area.area_id);
                                setAreaForm({ area_name: area.area_name });
                              }}
                              className="p-1 text-primary hover:bg-primary/10 rounded transition-colors cursor-pointer"
                              title="Edit Area"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteArea(area.area_id)}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                              title="Delete Area"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-outline-variant/40 dark:border-dark-outline-variant/40 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAreaModal(false)}
                    className="px-4 py-2 border border-outline-variant/40 dark:border-dark-outline-variant/40 rounded text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )
        }
      </AnimatePresence >

      {/* ─── Manager Registration Link Generator Modal ─── */}
      <AnimatePresence>
        {
          showLinkModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowLinkModal(false)}
                className="absolute inset-0 bg-black"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant w-full max-w-lg rounded shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded bg-primary/10 text-primary">
                      <LinkIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-on-surface dark:text-dark-on-surface">Generate Manager Registration Link</h3>
                      <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant">Create signup links for Store Managers</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowLinkModal(false)}
                    className="p-1 rounded text-on-surface-variant dark:text-dark-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant mb-1.5">Target Store (Required - Unmanaged Locations)</label>
                    <select
                      required
                      value={genStore}
                      onChange={e => setGenStore(e.target.value)}
                      className="w-full text-xs bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant p-2.5 rounded text-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="">Select Store (Required)</option>
                      {unmanagedStores.map((s: any) => (
                        <option key={s.store_id} value={s.store_id}>{s.store_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-medium text-on-surface-variant dark:text-dark-on-surface-variant mb-1.5">Generated Dynamic Link</label>
                    <div className="flex items-center gap-2">
                      <input

                        type="text"
                        readOnly
                        value={getGeneratedLink()}
                        className="w-full text-xs  bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant p-2.5 rounded text-primary focus:outline-none"
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

                <div className="flex justify-end px-6 py-4 border-t border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low">
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(false)}
                    className="px-3.5 py-2 border border-outline dark:border-dark-outline bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium rounded transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )
        }
      </AnimatePresence >

      {/* ─── Swap Store Managers Modal ─── */}
      <AnimatePresence>
        {
          showSwapModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSwapModal(false)}
                className="absolute inset-0 bg-black"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-surface-container dark:bg-dark-surface-container border border-outline-variant dark:border-dark-outline-variant w-full max-w-lg rounded shadow-2xl overflow-hidden p-4 space-y-5"
              >
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant dark:border-dark-outline-variant">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded bg-primary/10 text-primary">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-on-surface dark:text-dark-on-surface">Swap Store Managers</h3>
                      <p className="text-xs text-on-surface-variant dark:text-dark-on-surface-variant">Reassign store locations between two managers</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSwapModal(false)}
                    className="p-1 rounded text-on-surface-variant dark:text-dark-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {swapErrorMsg && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs rounded flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{swapErrorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Manager A */}
                  <div className="p-2.5 bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant rounded space-y-2">
                    <label className="block text-xs font-bold text-primary uppercase tracking-wider">Manager A</label>
                    <select
                      value={swapManagerA}
                      onChange={e => setSwapManagerA(e.target.value)}
                      className="w-full text-xs bg-surface-container dark:bg-dark-surface-container border border-outline-variant p-2 rounded text-on-surface dark:text-dark-on-surface"
                    >
                      <option value="">Select Manager A</option>
                      {data.map((m: any) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name} ({m.store?.store_name || 'No Store'})
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const mA = data.find((m: any) => String(m.user_id) === String(swapManagerA));
                      return (
                        <div className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant pt-1">
                          Current Store: <strong className="text-on-surface dark:text-dark-on-surface">{mA?.store?.store_name || 'Unassigned'}</strong>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Manager B */}
                  <div className="p-2.5 bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant rounded space-y-2">
                    <label className="block text-xs font-bold text-primary uppercase tracking-wider">Manager B</label>
                    <select
                      value={swapManagerB}
                      onChange={e => setSwapManagerB(e.target.value)}
                      className="w-full text-xs bg-surface-container dark:bg-dark-surface-container border border-outline-variant p-2 rounded text-on-surface dark:text-dark-on-surface"
                    >
                      <option value="">Select Manager B</option>
                      {data
                        .filter((m: any) => String(m.user_id) !== String(swapManagerA))
                        .map((m: any) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name} ({m.store?.store_name || 'No Store'})
                          </option>
                        ))}
                    </select>
                    {(() => {
                      const mB = data.find((m: any) => String(m.user_id) === String(swapManagerB));
                      return (
                        <div className="text-[11px] text-on-surface-variant dark:text-dark-on-surface-variant pt-1">
                          Current Store: <strong className="text-on-surface dark:text-dark-on-surface">{mB?.store?.store_name || 'Unassigned'}</strong>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Swap Result Preview */}
                {swapManagerA && swapManagerB && (
                  <div className="p-3.5 bg-primary/10 border border-primary/30 rounded ">
                    <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Swap Outcome Preview</span>
                    </div>
                    {(() => {
                      const mA = data.find((m: any) => String(m.user_id) === String(swapManagerA));
                      const mB = data.find((m: any) => String(m.user_id) === String(swapManagerB));
                      return (
                        <div className="text-xs space-y-1 text-on-surface dark:text-dark-on-surface">
                          <div>• <strong>{mA?.full_name}</strong> ➔ <span className="text-primary font-semibold">{mB?.store?.store_name || 'No Store (Unassigned)'}</span></div>
                          <div>• <strong>{mB?.full_name}</strong> ➔ <span className="text-primary font-semibold">{mA?.store?.store_name || 'No Store (Unassigned)'}</span></div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="flex justify-end gap-2  .border-t border-outline-variant dark:border-dark-outline-variant">
                  <button
                    type="button"
                    onClick={() => setShowSwapModal(false)}
                    className="px-3.5 py-2 border border-outline dark:border-dark-outline bg-surface-container dark:bg-dark-surface-container hover:bg-surface-container-high text-on-surface dark:text-dark-on-surface text-xs font-medium rounded transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={swapLoading || !swapManagerA || !swapManagerB}
                    onClick={handleExecuteSwap}
                    className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary text-xs font-medium rounded flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {swapLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm Store Swap</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )
        }
      </AnimatePresence >


      {/* Floating Action Buttons (FAB) for Mobile */}
      < div className="sm:hidden fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3" >
        {(subpage === 'all' || !subpage) && (
          <Can permission='stores.add_area'>
            <button
              onClick={handleOpenAreaModal}
              className="border-outline-none bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium px-3 py-2 rounded hidden sm:flex items-center gap-2 transition-colors cursor-pointer"
              title="Manage Areas"
            >
              <MapPin className="w-5 h-5 text-primary" />
            </button>
          </Can>
        )}
        <Can permission='stores.add_store'>

          <button
            onClick={handleOpenCreate}
            className="bg-primary hover:bg-primary-hover active:scale-95 text-on-primary shadow-lg p-4 rounded-full flex items-center justify-center transition-all cursor-pointer"
            title={`Add New ${subpage === 'areas' ? 'Area' : subpage === 'departments' ? 'Department' : 'Store'}`}
          >
            <Plus className="w-6 h-6" />
          </button>
        </Can>
      </div >
    </div >
  );
};