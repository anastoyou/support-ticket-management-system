import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, Printer, Download, RefreshCw, Calendar, Building2,
  TrendingUp, TrendingDown, ArrowRight, Filter, Search,
  FileText, CheckCircle2, AlertCircle, Loader2, BarChart2,
  Layers, DollarSign, ArrowUpDown, ChevronDown, ChevronRight, Store
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { usePermission } from '@/hooks/usePermission';
import Can from '@/hooks/Can';
import { DateRangePickerCard } from '@/pages/ticket/DateRangePickerCard';

interface StoreTypeSummaryItem {
  store_type: string;
  store_type_label: string;
  stores_count: number;
  total_amount: number;
  voucher_amount?: number;
  labour_amount?: number;
  expense_count: number;
  allocated_hours?: number;
  actual_hours?: number;
}

interface LedgerBatchSummaryItem {
  batch_name: string;
  total_amount: number;
  voucher_amount?: number;
  labour_amount?: number;
  locations_count: number;
  expense_count: number;
  allocated_hours?: number;
  actual_hours?: number;
  categories: Record<string, number>;
  locations: {
    store_id: string;
    location_name: string;
    store_type?: string;
    categories: Record<string, number>;
    total_amount: number;
    voucher_amount?: number;
    labour_amount?: number;
    expense_count: number;
    allocated_hours?: number;
    actual_hours?: number;
  }[];
}

interface LocationReportData {
  department_name?: string;
  from_date?: string;
  to_date?: string;
  month_label?: string;
  locations: {
    store_id: string;
    location_name: string;
    store_type?: string;
    categories: Record<string, number>;
    total_amount: number;
    voucher_amount?: number;
    labour_amount?: number;
    expense_count: number;
    allocated_hours?: number;
    actual_hours?: number;
  }[];
  store_types_summary?: StoreTypeSummaryItem[];
  ledger_batches_summary?: LedgerBatchSummaryItem[];
  available_batches?: { batch_id: number; batch_name: string }[];
  categories: string[];
  category_totals: Record<string, number>;
  voucher_grand_total?: number;
  labour_grand_total?: number;
  grand_total: number;
  total_allocated_hours?: number;
  total_actual_hours?: number;
  total_locations_count: number;
  total_expenses_count: number;
}

interface ComparisonCategoryItem {
  category_name: string;
  period1_amount: number;
  period2_amount: number;
  variance: number;
  percent_change: number;
}

interface ComparisonLocationItem {
  store_id: string;
  location_name: string;
  store_type?: string;
  period1_amount: number;
  period2_amount: number;
  variance: number;
  percent_change: number;
  period1_allocated_hours?: number;
  period2_allocated_hours?: number;
  hours_variance?: number;
  period1_labour_amount?: number;
  period2_labour_amount?: number;
  labour_variance?: number;
  period1_voucher_amount?: number;
  period2_voucher_amount?: number;
  categories: ComparisonCategoryItem[];
}

interface ComparisonLedgerBatchItem {
  batch_name: string;
  period1_amount: number;
  period2_amount: number;
  variance: number;
  percent_change: number;
  period1_locations_count: number;
  period2_locations_count: number;
  period1_allocated_hours?: number;
  period2_allocated_hours?: number;
  hours_variance?: number;
  period1_labour_amount?: number;
  period2_labour_amount?: number;
  labour_variance?: number;
  locations: ComparisonLocationItem[];
}

interface ComparisonReportData {
  is_comparison: true;
  department_name?: string;
  available_batches?: { batch_id: number; batch_name: string }[];
  period1: {
    from_date: string;
    to_date: string;
    month_label: string;
    grand_total: number;
    store_types_summary?: StoreTypeSummaryItem[];
    ledger_batches_summary?: LedgerBatchSummaryItem[];
  };
  period2: {
    from_date: string;
    to_date: string;
    month_label: string;
    grand_total: number;
    store_types_summary?: StoreTypeSummaryItem[];
    ledger_batches_summary?: LedgerBatchSummaryItem[];
  };
  summary: {
    period1_grand_total: number;
    period2_grand_total: number;
    variance: number;
    percent_change: number;
    period1_total_allocated_hours?: number;
    period2_total_allocated_hours?: number;
    hours_variance?: number;
    period1_total_labour_amount?: number;
    period2_total_labour_amount?: number;
    labour_variance?: number;
    period1_total_voucher_amount?: number;
    period2_total_voucher_amount?: number;
  };
  store_types_summary?: any[];
  ledger_batches_summary?: ComparisonLedgerBatchItem[];
  categories: string[];
  category_totals: {
    period1: Record<string, number>;
    period2: Record<string, number>;
  };
  locations: ComparisonLocationItem[];
}

const STORE_TYPE_OPTIONS = [
  { value: 'all', label: 'All Store Types' },
  { value: 'SUPER_MARKET', label: 'Super Market' },
  { value: 'HYPER_MARKET', label: 'Hyper Market' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'FRESH', label: 'Fresh Market' },
  { value: 'COSTO', label: 'Costo' },
  { value: 'CAMP', label: 'Camp' },
  { value: 'KITCHEN', label: 'Central Kitchen' },
  { value: 'ROASTERY', label: 'Roastery' },
  { value: 'FINE DINE', label: 'Fine Dine' },
];

const STORE_TYPE_LABELS: Record<string, string> = {
  SUPER_MARKET: 'Super Market',
  HYPER_MARKET: 'Hyper Market',
  WAREHOUSE: 'Warehouse',
  FRESH: 'Fresh Market',
  COSTO: 'Costo',
  CAMP: 'Camp',
  KITCHEN: 'Central Kitchen',
  ROASTERY: 'Roastery',
  'FINE DINE': 'Fine Dine',
};

/**
 * Formats allocated work hours into decimal format:
 * - Whole hours: "9", "51", "29", "0"
 * - Half / fractional hours: "8.5", "28.5", "62.5"
 * - Snaps fractional values to nearest half-hour decimal (e.g. 62.5 instead of 62:30)
 */
export function formatWorkHours(val?: number | string | null): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num) || num === 0) return '0';

  const isNeg = num < 0;
  const abs = Math.abs(num);

  // Round to nearest 0.5 (half hour)
  const rounded = Math.round(abs * 2) / 2;
  const isDecimal = (rounded % 1) !== 0;

  const res = isDecimal ? rounded.toFixed(1) : `${rounded}`;
  return isNeg ? `-${res}` : res;
}

interface MonthlyLocationReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string;
  API_URL?: string;
  currentUser?: any;
}

export const MonthlyLocationReportModal: React.FC<MonthlyLocationReportModalProps> = ({
  isOpen,
  onClose,
  token,
  API_URL = '/api',
  currentUser,
}) => {
  const { hasPermission } = usePermission();

  // Mode: Single Month Location Report vs Comparison Report
  const [reportMode, setReportMode] = useState<'single' | 'comparison'>('single');
  // Orientation: Vertical (Portrait) default as requested vs Horizontal (Landscape)
  const [isVerticalOrientation, setIsVerticalOrientation] = useState(true);

  // Helpers to get full month date ranges (1st to 28/29/30/31 based on the month) in local timezone
  const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getMonthRange = (year: number, monthIndex: number) => {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0); // Day 0 of next month is the exact last day (28, 29, 30, or 31)
    return {
      from: formatLocalDate(start),
      to: formatLocalDate(end),
    };
  };

  // Single Period Date State: Defaults to current full month (1st to 30/31)
  const [singleFromDate, setSingleFromDate] = useState<string>(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth()).from;
  });
  const [singleToDate, setSingleToDate] = useState<string>(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth()).to;
  });

  // Comparison Dates State: Period 1 = Full Previous Month, Period 2 = Full Current Month
  const [period1From, setPeriod1From] = useState<string>(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth() - 1).from;
  });
  const [period1To, setPeriod1To] = useState<string>(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth() - 1).to;
  });
  const [period2From, setPeriod2From] = useState<string>(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth()).from;
  });
  const [period2To, setPeriod2To] = useState<string>(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth()).to;
  });

  // Filters & Grouping Options
  const [statusFilter, setStatusFilter] = useState<'approved' | 'all' | 'paid'>('approved');
  const [selectedStoreType, setSelectedStoreType] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [groupingMode, setGroupingMode] = useState<'location' | 'batch' | 'store_type'>('location');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailedCategoriesInComparison, setShowDetailedCategoriesInComparison] = useState(false);
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({});

  // Loading & Data States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [singleData, setSingleData] = useState<LocationReportData | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonReportData | null>(null);

  // Fetch Report Data from Backend API
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let url = `${API_URL}/finance/expense/location-report/?status=${statusFilter}`;

      if (reportMode === 'single') {
        url += `&from_date=${singleFromDate}&to_date=${singleToDate}`;
      } else {
        url += `&period1_from=${period1From}&period1_to=${period1To}&period2_from=${period2From}&period2_to=${period2To}`;
      }

      if (selectedStoreType !== 'all') {
        url += `&store_type=${encodeURIComponent(selectedStoreType)}`;
      }

      if (selectedBatch !== 'all') {
        url += `&batch=${encodeURIComponent(selectedBatch)}`;
      }

      const res = await fetch(url, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Failed to fetch report (Status: ${res.status})`);
      }

      const data = await res.json();
      if (reportMode === 'single') {
        setSingleData(data);
        setComparisonData(null);
      } else {
        setComparisonData(data);
        setSingleData(null);
      }
    } catch (err: any) {
      console.error('Error fetching location expense report:', err);
      setErrorMsg(err.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, [API_URL, token, statusFilter, selectedStoreType, selectedBatch, reportMode, singleFromDate, singleToDate, period1From, period1To, period2From, period2To]);

  // Initial and reactive trigger on filter / date changes
  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, fetchReport]);

  // Quick Preset Handlers (Always full month 1st to 28/29/30/31 based on calendar month)
  const handleSetCurrentMonth = () => {
    const now = new Date();
    const range = getMonthRange(now.getFullYear(), now.getMonth());
    setSingleFromDate(range.from);
    setSingleToDate(range.to);
  };

  const handleSetLastMonth = () => {
    const now = new Date();
    const range = getMonthRange(now.getFullYear(), now.getMonth() - 1);
    setSingleFromDate(range.from);
    setSingleToDate(range.to);
  };

  const handleSetComparisonLastMonthVsCurrent = () => {
    const now = new Date();
    const p1 = getMonthRange(now.getFullYear(), now.getMonth() - 1);
    const p2 = getMonthRange(now.getFullYear(), now.getMonth());
    setPeriod1From(p1.from);
    setPeriod1To(p1.to);
    setPeriod2From(p2.from);
    setPeriod2To(p2.to);
  };

  // Filtered Locations based on Search
  const filteredSingleLocations = useMemo(() => {
    if (!singleData?.locations) return [];
    if (!searchTerm.trim()) return singleData.locations;
    const term = searchTerm.toLowerCase().trim();
    return singleData.locations.filter(
      l => l.location_name.toLowerCase().includes(term) || l.store_id.toLowerCase().includes(term)
    );
  }, [singleData, searchTerm]);

  const filteredComparisonLocations = useMemo(() => {
    if (!comparisonData?.locations) return [];
    if (!searchTerm.trim()) return comparisonData.locations;
    const term = searchTerm.toLowerCase().trim();
    return comparisonData.locations.filter(
      l => l.location_name.toLowerCase().includes(term) || l.store_id.toLowerCase().includes(term)
    );
  }, [comparisonData, searchTerm]);

  // Group single locations by store_type
  const singleLocationsByStoreType = useMemo(() => {
    const groups: Record<string, typeof filteredSingleLocations> = {};
    for (const loc of filteredSingleLocations) {
      const type = loc.store_type || 'OTHER';
      const typeLabel = STORE_TYPE_LABELS[type] || type.replace(/_/g, ' ');
      if (!groups[typeLabel]) groups[typeLabel] = [];
      groups[typeLabel].push(loc);
    }
    return Object.entries(groups).map(([typeLabel, locs]) => {
      const subtotal = locs.reduce((sum, l) => sum + (l.total_amount || 0), 0);
      const totalLabour = locs.reduce((sum, l) => sum + (l.labour_amount || 0), 0);
      const totalHours = locs.reduce((sum, l) => sum + (l.allocated_hours || 0), 0);
      const categorySubtotals: Record<string, number> = {};
      for (const l of locs) {
        for (const [cat, amt] of Object.entries(l.categories || {})) {
          categorySubtotals[cat] = (categorySubtotals[cat] || 0) + amt;
        }
      }
      return {
        typeLabel,
        locations: locs,
        subtotal,
        totalLabour,
        totalHours,
        categorySubtotals,
      };
    }).sort((a, b) => b.subtotal - a.subtotal);
  }, [filteredSingleLocations]);

  // Group comparison locations by store_type
  const comparisonLocationsByStoreType = useMemo(() => {
    const groups: Record<string, typeof filteredComparisonLocations> = {};
    for (const loc of filteredComparisonLocations) {
      const type = loc.store_type || 'OTHER';
      const typeLabel = STORE_TYPE_LABELS[type] || type.replace(/_/g, ' ');
      if (!groups[typeLabel]) groups[typeLabel] = [];
      groups[typeLabel].push(loc);
    }
    return Object.entries(groups).map(([typeLabel, locs]) => {
      const p1Subtotal = locs.reduce((sum, l) => sum + (l.period1_amount || 0), 0);
      const p2Subtotal = locs.reduce((sum, l) => sum + (l.period2_amount || 0), 0);
      const p1TotalLabour = locs.reduce((sum, l) => sum + (l.period1_labour_amount || 0), 0);
      const p2TotalLabour = locs.reduce((sum, l) => sum + (l.period2_labour_amount || 0), 0);
      const p1TotalHours = locs.reduce((sum, l) => sum + (l.period1_allocated_hours || 0), 0);
      const p2TotalHours = locs.reduce((sum, l) => sum + (l.period2_allocated_hours || 0), 0);
      const variance = p2Subtotal - p1Subtotal;
      const pctChange = p1Subtotal > 0 ? (variance / p1Subtotal) * 100 : (p2Subtotal > 0 ? 100 : 0);
      return {
        typeLabel,
        locations: locs,
        p1Subtotal,
        p2Subtotal,
        p1TotalLabour,
        p2TotalLabour,
        labourVariance: p2TotalLabour - p1TotalLabour,
        p1TotalHours,
        p2TotalHours,
        hoursVariance: p2TotalHours - p1TotalHours,
        variance,
        pctChange,
      };
    }).sort((a, b) => b.p2Subtotal - a.p2Subtotal);
  }, [filteredComparisonLocations]);

  // Available Ledger Batches from response
  const batchOptions = useMemo(() => {
    const list: { batch_id?: number; batch_name: string }[] = [];
    const fromData = singleData?.available_batches || comparisonData?.available_batches;
    if (fromData && fromData.length > 0) {
      return fromData;
    }
    const fromSummary = singleData?.ledger_batches_summary || comparisonData?.ledger_batches_summary;
    if (fromSummary) {
      fromSummary.forEach(b => {
        if (!list.some(x => x.batch_name === b.batch_name)) {
          list.push({ batch_name: b.batch_name });
        }
      });
    }
    return list;
  }, [singleData, comparisonData]);

  // Grouped single locations by Ledger Batch with search filter
  const filteredSingleBatches = useMemo(() => {
    if (!singleData?.ledger_batches_summary) return [];
    const term = searchTerm.toLowerCase().trim();

    return singleData.ledger_batches_summary.map(batch => {
      let locs = batch.locations || [];
      if (term) {
        locs = locs.filter(l => l.location_name.toLowerCase().includes(term) || l.store_id.toLowerCase().includes(term));
      }
      const subtotal = locs.reduce((sum, l) => sum + (l.total_amount || 0), 0);
      const totalLabour = locs.reduce((sum, l) => sum + (l.labour_amount || 0), 0);
      const totalHours = locs.reduce((sum, l) => sum + (l.allocated_hours || 0), 0);
      const categorySubtotals: Record<string, number> = {};
      for (const l of locs) {
        for (const [c, amt] of Object.entries(l.categories || {})) {
          categorySubtotals[c] = (categorySubtotals[c] || 0) + amt;
        }
      }
      return {
        ...batch,
        locations: locs,
        subtotal,
        totalLabour,
        totalHours,
        categorySubtotals,
      };
    }).filter(batch => batch.locations.length > 0);
  }, [singleData, searchTerm]);

  // Grouped comparison locations by Ledger Batch with search filter
  const filteredComparisonBatches = useMemo(() => {
    if (!comparisonData?.ledger_batches_summary) return [];
    const term = searchTerm.toLowerCase().trim();

    return comparisonData.ledger_batches_summary.map(batch => {
      let locs = batch.locations || [];
      if (term) {
        locs = locs.filter(l => l.location_name.toLowerCase().includes(term) || l.store_id.toLowerCase().includes(term));
      }
      const p1Subtotal = locs.reduce((sum, l) => sum + (l.period1_amount || 0), 0);
      const p2Subtotal = locs.reduce((sum, l) => sum + (l.period2_amount || 0), 0);
      const p1TotalLabour = locs.reduce((sum, l) => sum + (l.period1_labour_amount || 0), 0);
      const p2TotalLabour = locs.reduce((sum, l) => sum + (l.period2_labour_amount || 0), 0);
      const p1TotalHours = locs.reduce((sum, l) => sum + (l.period1_allocated_hours || 0), 0);
      const p2TotalHours = locs.reduce((sum, l) => sum + (l.period2_allocated_hours || 0), 0);
      const variance = p2Subtotal - p1Subtotal;
      const pctChange = p1Subtotal > 0 ? (variance / p1Subtotal) * 100 : (p2Subtotal > 0 ? 100 : 0);

      return {
        ...batch,
        locations: locs,
        p1Subtotal,
        p2Subtotal,
        p1TotalLabour,
        p2TotalLabour,
        labourVariance: p2TotalLabour - p1TotalLabour,
        p1TotalHours,
        p2TotalHours,
        hoursVariance: p2TotalHours - p1TotalHours,
        variance,
        pctChange,
      };
    }).filter(batch => batch.locations.length > 0);
  }, [comparisonData, searchTerm]);

  // Toggle Location accordion
  const toggleLocationExpand = (storeId: string) => {
    setExpandedLocations(prev => ({
      ...prev,
      [storeId]: !prev[storeId]
    }));
  };

  // 7-Tier Signatures Block Definition
  const signaturesList = [
    { title: 'Prepared By', name: currentUser?.full_name || currentUser?.username || 'Site Accountant', role: 'Site Accountant' },
    { title: 'Verify By MEngg', name: 'Maintenance Engineer', role: 'Maintenance Engineer' },
    { title: 'Verify By Engg', name: 'Project / Site Engineer', role: 'Project Engineer' },
    { title: 'Accountant', name: 'Accounts Dept', role: 'Accounts Dept' },
    { title: 'Audit', name: 'Internal Audit', role: 'Internal Audit' },
    { title: 'Finance', name: 'Finance Manager', role: 'Finance Manager' },
    { title: 'CEO / CCOO / Director', name: 'Executive Management', role: 'Executive Approval' }
  ];

  // PRINT / PDF GENERATOR (Prints directly on current page via hidden isolated iframe - NO new tab)
  const handlePrint = () => {
    const isComp = reportMode === 'comparison' && comparisonData;
    const title = isComp ? 'LOCATION EXPENSE COMPARISON REPORT' : 'MONTHLY LOCATION EXPENSE REPORT';
    const subtitle = isComp
      ? `Period 1: ${comparisonData.period1.month_label} (${comparisonData.period1.from_date} to ${comparisonData.period1.to_date}) vs Period 2: ${comparisonData.period2.month_label} (${comparisonData.period2.from_date} to ${comparisonData.period2.to_date})`
      : `Period: ${singleData?.month_label || `${singleFromDate} to ${singleToDate}`}`;

    const slColWidth = isVerticalOrientation ? '26px' : '36px';
    const locColMin = isVerticalOrientation ? '120px' : '160px';
    const hoursColWidth = isVerticalOrientation ? '55px' : '75px';
    const totalColWidth = isVerticalOrientation ? '65px' : '90px';
    const shareColWidth = isVerticalOrientation ? '45px' : '65px';

    let tableHeadersHtml = '';
    let tableBodyHtml = '';
    let tableFootHtml = '';

    if (!isComp && singleData) {
      tableHeadersHtml = `
        <tr>
          <th style="width: ${slColWidth}; text-align: center;">#</th>
          <th style="text-align: left; min-width: ${locColMin};">Location / Store</th>
          <th style="text-align: right; width: ${hoursColWidth}; color: #0284c7;">Working Hours</th>
          <th style="text-align: right; width: ${totalColWidth}; color: #059669;">Labour (KWD)</th>
          ${singleData.categories.map(c => `<th style="text-align: right;">${c}</th>`).join('')}
          <th style="text-align: right; width: ${totalColWidth};">Total (KWD)</th>
          <th style="text-align: right; width: ${shareColWidth};">% Share</th>
        </tr>
      `;

      if (groupingMode === 'batch') {
        tableBodyHtml = filteredSingleBatches.map(batch => `
          <tr style="background: #eef2ff; font-weight: 700; color: #3730a3;">
            <td colspan="${singleData.categories.length + 6}" style="padding: 6px 10px; font-size: ${isVerticalOrientation ? '9px' : '10px'};">
              🔹 LEDGER BATCH: ${batch.batch_name} — ${batch.locations.length} Stores | ${formatWorkHours(batch.totalHours)} hrs | Labour: ${batch.totalLabour.toFixed(3)} KWD | Subtotal: ${batch.subtotal.toFixed(3)} KWD
            </td>
          </tr>
          ${batch.locations.map((loc, idx) => {
            const share = singleData.grand_total > 0
              ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
              : '0.0';
            return `
              <tr>
                <td style="text-align: center; color: #6b7280;">${idx + 1}</td>
                <td style="font-weight: 600; color: #111827;">${loc.location_name}</td>
                <td style="text-align: right; font-weight: 600; color: #0284c7;">${formatWorkHours(loc.allocated_hours)}</td>
                <td style="text-align: right; font-weight: 600; color: #059669;">${Number(loc.labour_amount || 0).toFixed(3)}</td>
                ${singleData.categories.map(c => `<td style="text-align: right;">${loc.categories[c] ? Number(loc.categories[c]).toFixed(3) : '-'}</td>`).join('')}
                <td style="text-align: right; font-weight: 700; color: #111827;">${Number(loc.total_amount).toFixed(3)}</td>
                <td style="text-align: right; color: #4b5563;">${share}%</td>
              </tr>
            `;
          }).join('')}
          <tr style="background: #f9fafb; font-weight: 700; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
            <td colspan="2" style="text-align: right; padding: 4px 6px; font-size: ${isVerticalOrientation ? '8px' : '9.5px'}; color: #374151;">Subtotal (${batch.batch_name}):</td>
            <td style="text-align: right; font-weight: 700; color: #0284c7; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${formatWorkHours(batch.totalHours)}</td>
            <td style="text-align: right; font-weight: 700; color: #059669; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.totalLabour.toFixed(3)}</td>
            ${singleData.categories.map(c => `<td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.categorySubtotals[c] ? batch.categorySubtotals[c].toFixed(3) : '-'}</td>`).join('')}
            <td style="text-align: right; font-weight: 700; color: #4f46e5; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.subtotal.toFixed(3)}</td>
            <td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${singleData.grand_total > 0 ? ((batch.subtotal / singleData.grand_total) * 100).toFixed(1) : '0.0'}%</td>
          </tr>
        `).join('');
      } else if (groupingMode === 'store_type') {
        tableBodyHtml = singleLocationsByStoreType.map(typeGroup => `
          <tr style="background: #eef2ff; font-weight: 700; color: #3730a3;">
            <td colspan="${singleData.categories.length + 6}" style="padding: 6px 10px; font-size: ${isVerticalOrientation ? '9px' : '10px'};">
              🔹 STORE TYPE: ${typeGroup.typeLabel} — ${typeGroup.locations.length} Stores | ${formatWorkHours(typeGroup.totalHours)} hrs | Labour: ${typeGroup.totalLabour.toFixed(3)} KWD | Subtotal: ${typeGroup.subtotal.toFixed(3)} KWD
            </td>
          </tr>
          ${typeGroup.locations.map((loc, idx) => {
            const share = singleData.grand_total > 0
              ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
              : '0.0';
            return `
              <tr>
                <td style="text-align: center; color: #6b7280;">${idx + 1}</td>
                <td style="font-weight: 600; color: #111827;">${loc.location_name}</td>
                <td style="text-align: right; font-weight: 600; color: #0284c7;">${formatWorkHours(loc.allocated_hours)}</td>
                <td style="text-align: right; font-weight: 600; color: #059669;">${Number(loc.labour_amount || 0).toFixed(3)}</td>
                ${singleData.categories.map(c => `<td style="text-align: right;">${loc.categories[c] ? Number(loc.categories[c]).toFixed(3) : '-'}</td>`).join('')}
                <td style="text-align: right; font-weight: 700; color: #111827;">${Number(loc.total_amount).toFixed(3)}</td>
                <td style="text-align: right; color: #4b5563;">${share}%</td>
              </tr>
            `;
          }).join('')}
          <tr style="background: #f9fafb; font-weight: 700; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
            <td colspan="2" style="text-align: right; padding: 4px 6px; font-size: ${isVerticalOrientation ? '8px' : '9.5px'}; color: #374151;">Subtotal (${typeGroup.typeLabel}):</td>
            <td style="text-align: right; font-weight: 700; color: #0284c7; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${formatWorkHours(typeGroup.totalHours)}</td>
            <td style="text-align: right; font-weight: 700; color: #059669; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.totalLabour.toFixed(3)}</td>
            ${singleData.categories.map(c => `<td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.categorySubtotals[c] ? typeGroup.categorySubtotals[c].toFixed(3) : '-'}</td>`).join('')}
            <td style="text-align: right; font-weight: 700; color: #4f46e5; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.subtotal.toFixed(3)}</td>
            <td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${singleData.grand_total > 0 ? ((typeGroup.subtotal / singleData.grand_total) * 100).toFixed(1) : '0.0'}%</td>
          </tr>
        `).join('');
      } else {
        tableBodyHtml = filteredSingleLocations.map((loc, idx) => {
          const share = singleData.grand_total > 0
            ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
            : '0.0';
          return `
            <tr>
              <td style="text-align: center; color: #6b7280;">${idx + 1}</td>
              <td style="font-weight: 600; color: #111827;">${loc.location_name}</td>
              <td style="text-align: right; font-weight: 600; color: #0284c7;">${formatWorkHours(loc.allocated_hours)}</td>
              <td style="text-align: right; font-weight: 600; color: #059669;">${Number(loc.labour_amount || 0).toFixed(3)}</td>
              ${singleData.categories.map(c => `<td style="text-align: right;">${loc.categories[c] ? Number(loc.categories[c]).toFixed(3) : '-'}</td>`).join('')}
              <td style="text-align: right; font-weight: 700; color: #111827;">${Number(loc.total_amount).toFixed(3)}</td>
              <td style="text-align: right; color: #4b5563;">${share}%</td>
            </tr>
          `;
        }).join('');
      }

      tableFootHtml = `
        <tr style="background: #f3f4f6; font-weight: 800;">
          <td colspan="2" style="text-align: left; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'};">GRAND TOTAL</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'}; font-weight: 800; color: #0284c7;">${formatWorkHours(singleData.total_allocated_hours)}</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'}; font-weight: 800; color: #059669;">${Number(singleData.labour_grand_total || 0).toFixed(3)}</td>
          ${singleData.categories.map(c => `<td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'};">${Number(singleData.category_totals[c] || 0).toFixed(3)}</td>`).join('')}
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'}; color: #005bbf;">${Number(singleData.grand_total).toFixed(3)}</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'};">100.0%</td>
        </tr>
      `;
    } else if (isComp && comparisonData) {
      tableHeadersHtml = `
        <tr>
          <th style="width: ${slColWidth}; text-align: center;">#</th>
          <th style="text-align: left; min-width: ${locColMin};">Location</th>
          <th style="text-align: right;">Period 1 (${comparisonData.period1.month_label})</th>
          <th style="text-align: right;">Period 2 (${comparisonData.period2.month_label})</th>
          <th style="text-align: right; width: ${totalColWidth};">Variance (KWD)</th>
          <th style="text-align: right; width: ${shareColWidth};">% Change</th>
        </tr>
      `;

      if (groupingMode === 'batch') {
        tableBodyHtml = filteredComparisonBatches.map(batch => `
          <tr style="background: #eef2ff; font-weight: 700; color: #3730a3;">
            <td colspan="6" style="padding: 6px 10px; font-size: ${isVerticalOrientation ? '9px' : '10px'};">
              🔹 LEDGER BATCH: ${batch.batch_name} — ${batch.locations.length} Stores | P1: ${batch.p1Subtotal.toFixed(3)} | P2: ${batch.p2Subtotal.toFixed(3)} | Var: ${batch.variance >= 0 ? '+' : ''}${batch.variance.toFixed(3)}
            </td>
          </tr>
          ${batch.locations.map((loc, idx) => {
            const isUp = loc.variance > 0;
            const varColor = isUp ? '#dc2626' : (loc.variance < 0 ? '#16a34a' : '#4b5563');
            return `
              <tr>
                <td style="text-align: center; color: #6b7280;">${idx + 1}</td>
                <td style="font-weight: 600; color: #111827;">${loc.location_name}</td>
                <td style="text-align: right;">${Number(loc.period1_amount).toFixed(3)}</td>
                <td style="text-align: right; font-weight: 600;">${Number(loc.period2_amount).toFixed(3)}</td>
                <td style="text-align: right; font-weight: 700; color: ${varColor};">
                  ${isUp ? '+' : ''}${Number(loc.variance).toFixed(3)}
                </td>
                <td style="text-align: right; font-weight: 700; color: ${varColor};">
                  ${isUp ? '+' : ''}${loc.percent_change.toFixed(2)}%
                </td>
              </tr>
            `;
          }).join('')}
          <tr style="background: #f9fafb; font-weight: 700; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
            <td colspan="2" style="text-align: right; padding: 4px 6px; font-size: ${isVerticalOrientation ? '8px' : '9.5px'}; color: #374151;">Subtotal (${batch.batch_name}):</td>
            <td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.p1Subtotal.toFixed(3)}</td>
            <td style="text-align: right; font-weight: 700; color: #4f46e5; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.p2Subtotal.toFixed(3)}</td>
            <td style="text-align: right; font-weight: 700; color: ${batch.variance > 0 ? '#dc2626' : '#16a34a'}; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.variance >= 0 ? '+' : ''}${batch.variance.toFixed(3)}</td>
            <td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${batch.variance >= 0 ? '+' : ''}${batch.pctChange.toFixed(1)}%</td>
          </tr>
        `).join('');
      } else if (groupingMode === 'store_type') {
        tableBodyHtml = comparisonLocationsByStoreType.map(typeGroup => `
          <tr style="background: #eef2ff; font-weight: 700; color: #3730a3;">
            <td colspan="6" style="padding: 6px 10px; font-size: ${isVerticalOrientation ? '9px' : '10px'};">
              🔹 STORE TYPE: ${typeGroup.typeLabel} — ${typeGroup.locations.length} Stores | P1: ${typeGroup.p1Subtotal.toFixed(3)} | P2: ${typeGroup.p2Subtotal.toFixed(3)} | Var: ${typeGroup.variance >= 0 ? '+' : ''}${typeGroup.variance.toFixed(3)}
            </td>
          </tr>
          ${typeGroup.locations.map((loc, idx) => {
            const isUp = loc.variance > 0;
            const varColor = isUp ? '#dc2626' : (loc.variance < 0 ? '#16a34a' : '#4b5563');
            return `
              <tr>
                <td style="text-align: center; color: #6b7280;">${idx + 1}</td>
                <td style="font-weight: 600; color: #111827;">${loc.location_name}</td>
                <td style="text-align: right;">${Number(loc.period1_amount).toFixed(3)}</td>
                <td style="text-align: right; font-weight: 600;">${Number(loc.period2_amount).toFixed(3)}</td>
                <td style="text-align: right; font-weight: 700; color: ${varColor};">
                  ${isUp ? '+' : ''}${Number(loc.variance).toFixed(3)}
                </td>
                <td style="text-align: right; font-weight: 700; color: ${varColor};">
                  ${isUp ? '+' : ''}${loc.percent_change.toFixed(2)}%
                </td>
              </tr>
            `;
          }).join('')}
          <tr style="background: #f9fafb; font-weight: 700; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
            <td colspan="2" style="text-align: right; padding: 4px 6px; font-size: ${isVerticalOrientation ? '8px' : '9.5px'}; color: #374151;">Subtotal (${typeGroup.typeLabel}):</td>
            <td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.p1Subtotal.toFixed(3)}</td>
            <td style="text-align: right; font-weight: 700; color: #4f46e5; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.p2Subtotal.toFixed(3)}</td>
            <td style="text-align: right; font-weight: 700; color: ${typeGroup.variance > 0 ? '#dc2626' : '#16a34a'}; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.variance >= 0 ? '+' : ''}${typeGroup.variance.toFixed(3)}</td>
            <td style="text-align: right; font-size: ${isVerticalOrientation ? '8px' : '9.5px'};">${typeGroup.variance >= 0 ? '+' : ''}${typeGroup.pctChange.toFixed(1)}%</td>
          </tr>
        `).join('');
      } else {
        tableBodyHtml = filteredComparisonLocations.map((loc, idx) => {
          const isUp = loc.variance > 0;
          const varColor = isUp ? '#dc2626' : (loc.variance < 0 ? '#16a34a' : '#4b5563');
          const mainRow = `
            <tr>
              <td style="text-align: center; color: #6b7280;">${idx + 1}</td>
              <td style="font-weight: 600; color: #111827;">${loc.location_name}</td>
              <td style="text-align: right;">${Number(loc.period1_amount).toFixed(3)}</td>
              <td style="text-align: right; font-weight: 600;">${Number(loc.period2_amount).toFixed(3)}</td>
              <td style="text-align: right; font-weight: 700; color: ${varColor};">
                ${isUp ? '+' : ''}${Number(loc.variance).toFixed(3)}
              </td>
              <td style="text-align: right; font-weight: 700; color: ${varColor};">
                ${isUp ? '+' : ''}${loc.percent_change.toFixed(2)}%
              </td>
            </tr>
          `;

          const catRows = (showDetailedCategoriesInComparison && loc.categories)
            ? loc.categories.map(cat => {
              const cUp = cat.variance > 0;
              const cColor = cUp ? '#dc2626' : (cat.variance < 0 ? '#16a34a' : '#6b7280');
              return `
                  <tr style="background: #fafafa; font-size: ${isVerticalOrientation ? '7.5px' : '9px'}; color: #4b5563;">
                    <td></td>
                    <td style="padding-left: 14px;">└ ${cat.category_name}</td>
                    <td style="text-align: right;">${Number(cat.period1_amount).toFixed(3)}</td>
                    <td style="text-align: right;">${Number(cat.period2_amount).toFixed(3)}</td>
                    <td style="text-align: right; color: ${cColor};">${cUp ? '+' : ''}${Number(cat.variance).toFixed(3)}</td>
                    <td style="text-align: right; color: ${cColor};">${cUp ? '+' : ''}${cat.percent_change.toFixed(1)}%</td>
                  </tr>
                `;
            }).join('')
            : '';

          return mainRow + catRows;
        }).join('');
      }

      const s = comparisonData.summary;
      const isUp = s.variance > 0;
      const varColor = isUp ? '#dc2626' : (s.variance < 0 ? '#16a34a' : '#4b5563');
      tableFootHtml = `
        <tr style="background: #f3f4f6; font-weight: 800;">
          <td colspan="2" style="text-align: left; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'};">GRAND TOTAL</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'};">${Number(s.period1_grand_total).toFixed(3)}</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'}; color: #005bbf;">${Number(s.period2_grand_total).toFixed(3)}</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'}; color: ${varColor};">${isUp ? '+' : ''}${Number(s.variance).toFixed(3)}</td>
          <td style="text-align: right; padding: ${isVerticalOrientation ? '5px 6px' : '8px 10px'}; color: ${varColor};">${isUp ? '+' : ''}${s.percent_change.toFixed(2)}%</td>
        </tr>
      `;
    }

    const signaturesHtml = `
      <div class="signatures">
        ${signaturesList.map(sig => `
          <div class="sign-box">
            <strong>${sig.title}</strong>
            <span>${sig.name}</span>
          </div>
        `).join('')}
      </div>
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <base href="${window.location.origin}/" />
          <style>
            @page {
              size: ${isVerticalOrientation ? 'portrait' : 'landscape'};
              margin: ${isVerticalOrientation ? '8mm 6mm 8mm 6mm' : '10mm 8mm 10mm 8mm'};
            }
            *, *:before, *:after {
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              color: #111827;
              background: #ffffff;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              font-size: ${isVerticalOrientation ? '9px' : '10.5px'};
            }
            .print-page {
              box-sizing: border-box;
              width: 100%;
            }
            .print-page-intermediate {
              page-break-after: always !important;
              break-after: page !important;
              box-sizing: border-box !important;
            }
            .print-page-last {
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              min-height: ${isVerticalOrientation ? '274mm' : '184mm'} !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
              box-sizing: border-box !important;
            }
            .page-top-content {
              width: 100%;
              box-sizing: border-box;
            }
            .page-bottom-signatures {
              margin-top: auto !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              width: 100% !important;
              padding-top: 12px;
              box-sizing: border-box;
            }
            .header-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2.5px solid #005bbf;
              padding-bottom: 6px;
              margin-bottom: 8px;
              min-height: 72px;
            }
            .logo-area {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .logo-area img {
              height: ${isVerticalOrientation ? '68px' : '75px'};
              width: ${isVerticalOrientation ? '68px' : '75px'};
              object-fit: contain;
              display: block;
            }
            .title-area {
              text-align: right;
            }
            .title-area h1 {
              font-size: ${isVerticalOrientation ? '15px' : '17px'};
              color: #005bbf;
              margin: 0;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: -0.2px;
            }
            .title-area p {
              font-size: ${isVerticalOrientation ? '9.5px' : '11px'};
              color: #4b5563;
              margin: 3px 0 0 0;
              font-weight: 600;
            }
            .meta-bar {
              display: flex;
              justify-content: space-between;
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 4px;
              padding: ${isVerticalOrientation ? '5px 8px' : '6px 10px'};
              margin-bottom: 8px;
              font-size: ${isVerticalOrientation ? '8.5px' : '9.5px'};
              color: #4b5563;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: ${isVerticalOrientation ? '8.5px' : '9.5px'};
              margin-bottom: 6px;
              table-layout: auto;
            }
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-row-group !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: ${isVerticalOrientation ? '3.5px 4.5px' : '5px 7px'};
              overflow-wrap: break-word;
              word-wrap: break-word;
            }
            th {
              background: #f3f4f6 !important;
              color: #111827;
              font-weight: 700;
              text-transform: uppercase;
              font-size: ${isVerticalOrientation ? '8px' : '9px'};
            }
            tr:nth-child(even) {
              background: #fafafa !important;
            }
            .signatures {
              display: grid;
              grid-template-columns: repeat(7, 1fr);
              gap: ${isVerticalOrientation ? '4px' : '8px'};
              width: 100%;
              box-sizing: border-box;
            }
            .sign-box {
              text-align: center;
              border-top: 1.5px solid #111827;
              padding-top: 4px;
              font-size: ${isVerticalOrientation ? '7.5px' : '8.5px'};
              color: #374151;
            }
            .sign-box strong {
              display: block;
              font-size: ${isVerticalOrientation ? '8px' : '9px'};
              color: #111827;
              font-weight: 700;
              margin-bottom: 2px;
              text-transform: uppercase;
              line-height: 1.1;
            }
            .sign-box span {
              display: block;
              font-size: ${isVerticalOrientation ? '7px' : '8px'};
              color: #6b7280;
              line-height: 1.1;
            }
          </style>
        </head>
        <body>
          <!-- Printable Page Ruler matching exact A4 printable height at 1:1 scale -->
          <div id="print-ruler" style="height: ${isVerticalOrientation ? '274mm' : '184mm'}; width: 10px; position: absolute; left: -9999px; visibility: hidden;"></div>

          <!-- Raw Source Content for measurement -->
          <div id="report-source" style="position: absolute; left: -9999px; top: -9999px; width: ${isVerticalOrientation ? '778px' : '1100px'};">
            <div class="report-header-block">
              <div class="header-bar">
                <div class="logo-area">
                  <img src="/document_logo.png" onerror="this.style.display='none'" alt="Grand Hyper" />
                </div>
                <div class="title-area">
                  <h1>${title}</h1>
                  <p>${(isComp ? comparisonData?.department_name : singleData?.department_name) ? `${(isComp ? comparisonData?.department_name : singleData?.department_name)} — ` : ''}${subtitle}</p>
                </div>
              </div>

              <div class="meta-bar">
                <span><strong>Generated Date:</strong> ${new Date().toLocaleString()}</span>
                <span><strong>Status Filter:</strong> ${statusFilter.toUpperCase()}</span>
                <span><strong>Prepared By:</strong> ${currentUser?.full_name || currentUser?.username || 'Finance Department'}</span>
              </div>
            </div>

            <table>
              <thead>${tableHeadersHtml}</thead>
              <tbody>${tableBodyHtml}</tbody>
              <tfoot>${tableFootHtml}</tfoot>
            </table>

            <div class="page-bottom-signatures">
              ${signaturesHtml}
            </div>
          </div>

          <script>
            (function() {
              function paginateReport() {
                if (window.__PAGINATED__) return;
                var ruler = document.getElementById('print-ruler');
                var reportSource = document.getElementById('report-source');
                if (!ruler || !reportSource) return;

                var pageBudget = ruler.offsetHeight - 8;

                var headerEl = reportSource.querySelector('.report-header-block');
                var theadEl = reportSource.querySelector('table thead');
                var tbodyRows = Array.prototype.slice.call(reportSource.querySelectorAll('table tbody tr'));
                var tfootRow = reportSource.querySelector('table tfoot tr');
                var signaturesEl = reportSource.querySelector('.page-bottom-signatures');

                var theadHtml = theadEl ? theadEl.outerHTML : '';
                var theadH = theadEl ? theadEl.offsetHeight : 28;

                var headerHtml = headerEl ? headerEl.innerHTML : '';
                var headerH = headerEl ? (headerEl.offsetHeight + 10) : 110;

                var signaturesHtml = signaturesEl ? signaturesEl.innerHTML : '';
                var signaturesH = signaturesEl ? (signaturesEl.offsetHeight + 16) : 65;

                var items = [];
                tbodyRows.forEach(function(r) {
                  items.push({
                    type: 'row',
                    html: r.outerHTML,
                    height: r.offsetHeight || 22
                  });
                });

                if (tfootRow) {
                  items.push({
                    type: 'total',
                    html: tfootRow.outerHTML,
                    height: tfootRow.offsetHeight || 28
                  });
                }

                // Paginate items into pages
                var pages = [];
                var itemIdx = 0;
                var isFirstPage = true;

                while (itemIdx < items.length) {
                  var pageItems = [];
                  var pageUsedH = 0;

                  var topH = isFirstPage ? (headerH + theadH) : (theadH + 28);
                  var availH = pageBudget - topH;

                  var totalRemH = 0;
                  for (var k = itemIdx; k < items.length; k++) {
                    totalRemH += items[k].height;
                  }

                  // Check if ALL remaining items AND the signatures fit on this page!
                  if (totalRemH + signaturesH <= availH) {
                    pages.push({
                      isFirst: isFirstPage,
                      isLast: true,
                      items: items.slice(itemIdx)
                    });
                    break;
                  }

                  // Fill this page up to availH
                  while (itemIdx < items.length) {
                    var item = items[itemIdx];
                    if (pageUsedH + item.height > availH) {
                      break;
                    }
                    pageItems.push(item);
                    pageUsedH += item.height;
                    itemIdx++;
                  }

                  if (pageItems.length === 0 && itemIdx < items.length) {
                    pageItems.push(items[itemIdx]);
                    itemIdx++;
                  }

                  if (itemIdx === items.length) {
                    // Items filled page, move last 2 or 3 items to next page with signatures
                    var trailingItems = [];
                    while (pageItems.length > 2 && trailingItems.length < 3) {
                      trailingItems.unshift(pageItems.pop());
                    }
                    pages.push({
                      isFirst: isFirstPage,
                      isLast: false,
                      items: pageItems
                    });
                    pages.push({
                      isFirst: false,
                      isLast: true,
                      items: trailingItems
                    });
                    break;
                  } else {
                    pages.push({
                      isFirst: isFirstPage,
                      isLast: false,
                      items: pageItems
                    });
                    isFirstPage = false;
                  }
                }

                function renderPagesToDom() {
                  document.body.innerHTML = pages.map(function(pg, pIdx) {
                    var isLast = (pIdx === pages.length - 1);
                    pg.isFirst = (pIdx === 0);
                    pg.isLast = isLast;

                    var topContentHtml = '';

                    if (pg.isFirst) {
                      topContentHtml += '<div class="report-header-block">' + headerHtml + '</div>';
                    } else {
                      topContentHtml += '<div style="border-bottom: 2px solid #005bbf; padding-bottom: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; font-weight: 700; color: #005bbf;">' +
                        '<span>${title} (Continued)</span>' +
                        '<span style="color: #6b7280; font-size: 8.5px;">${subtitle}</span>' +
                        '</div>';
                    }

                    var rowsHtml = pg.items.filter(function(it) { return it.type === 'row'; }).map(function(it) { return it.html; }).join('');
                    var totalHtml = pg.items.filter(function(it) { return it.type === 'total'; }).map(function(it) { return it.html; }).join('');

                    topContentHtml += '<table>' +
                      theadHtml +
                      '<tbody>' + rowsHtml + '</tbody>' +
                      (totalHtml ? ('<tfoot>' + totalHtml + '</tfoot>') : '') +
                      '</table>';

                    if (isLast) {
                      return '<div class="print-page print-page-last">' +
                        '<div class="page-top-content">' + topContentHtml + '</div>' +
                        '<div class="page-bottom-signatures">' + signaturesHtml + '</div>' +
                        '</div>';
                    } else {
                      return '<div class="print-page print-page-intermediate">' +
                        '<div class="page-top-content">' + topContentHtml + '</div>' +
                        '</div>';
                    }
                  }).join('');
                }

                renderPagesToDom();

                // Post-render height verification pass
                for (var pass = 0; pass < 5; pass++) {
                  var changed = false;
                  var pageEls = Array.prototype.slice.call(document.querySelectorAll('.print-page'));

                  for (var pIdx = 0; pIdx < pageEls.length; pIdx++) {
                    var pageEl = pageEls[pIdx];
                    var topEl = pageEl.querySelector('.page-top-content');
                    var sigEl = pageEl.querySelector('.page-bottom-signatures');
                    var topH = topEl ? topEl.offsetHeight : 0;
                    var sigH = sigEl ? sigEl.offsetHeight : 0;
                    var isLast = (pIdx === pageEls.length - 1);

                    if (!isLast && topH > pageBudget && pages[pIdx].items.length > 1) {
                      var moved = pages[pIdx].items.pop();
                      pages[pIdx + 1].items.unshift(moved);
                      changed = true;
                      break;
                    } else if (isLast && (topH + sigH + 8 > pageBudget) && pages[pIdx].items.length > 1) {
                      var trailing = [];
                      while (pages[pIdx].items.length > 1 && trailing.length < 2) {
                        trailing.unshift(pages[pIdx].items.pop());
                      }
                      pages.push({
                        isFirst: false,
                        isLast: true,
                        items: trailing
                      });
                      changed = true;
                      break;
                    }
                  }

                  if (!changed) break;
                  renderPagesToDom();
                }

                // Anchor signatures to the exact bottom of the final page
                var lastPageEl = document.querySelector('.print-page-last');
                if (lastPageEl) {
                  var topContentEl = lastPageEl.querySelector('.page-top-content');
                  var bottomSigEl = lastPageEl.querySelector('.page-bottom-signatures');
                  if (topContentEl && bottomSigEl) {
                    var topH = topContentEl.offsetHeight;
                    var sigH = bottomSigEl.offsetHeight;
                    var remainingSpace = Math.max(16, Math.floor(pageBudget - topH - sigH));
                    bottomSigEl.style.setProperty('margin-top', remainingSpace + 'px', 'important');
                  }
                }

                window.__PAGINATED__ = true;
              }

              window.addEventListener('load', function() {
                paginateReport();
              });
              setTimeout(paginateReport, 100);
            })();
          </script>
        </body>
      </html>
    `;

    // Clean up any previously attached print iframe
    const existingIframe = document.getElementById('monthly-location-print-iframe');
    if (existingIframe && existingIframe.parentNode) {
      existingIframe.parentNode.removeChild(existingIframe);
    }

    try {
      const iframe = document.createElement('iframe');
      iframe.id = 'monthly-location-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.left = '-10000px';
      iframe.style.top = '0';
      iframe.style.width = isVerticalOrientation ? '794px' : '1123px';
      iframe.style.height = isVerticalOrientation ? '1123px' : '794px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const win = iframe.contentWindow;
      if (win) {
        win.document.open();
        win.document.write(htmlContent);
        win.document.close();

        let isPrinted = false;
        const triggerPrint = () => {
          if (isPrinted) return;
          isPrinted = true;
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.error('Error invoking print dialog on hidden iframe:', e);
          } finally {
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 3000);
          }
        };

        const checkPaginationAndPrint = () => {
          try {
            if ((win as any).__PAGINATED__) {
              setTimeout(triggerPrint, 100);
            } else {
              setTimeout(checkPaginationAndPrint, 50);
            }
          } catch (e) {
            setTimeout(triggerPrint, 300);
          }
        };

        setTimeout(checkPaginationAndPrint, 150);
        setTimeout(triggerPrint, 1000);
      }
    } catch (err) {
      console.error('Failed to trigger print on current page:', err);
    }
  };

  // EXCEL EXPORT
  const handleExportExcel = () => {
    const isComp = reportMode === 'comparison' && comparisonData;
    const title = isComp ? 'Location Expense Comparison Report' : 'Monthly Location Expense Report';
    const wb = XLSX.utils.book_new();

    const rows: any[][] = [
      ['GRAND HYPERMARKET - MAINTENANCE & FINANCE MANAGEMENT'],
      [title.toUpperCase()],
      [
        isComp
          ? `Period 1: ${comparisonData.period1.month_label} vs Period 2: ${comparisonData.period2.month_label}`
          : `Period: ${singleData?.month_label || `${singleFromDate} to ${singleToDate}`}`
      ],
      [`Generated On: ${new Date().toLocaleString()} | Filter: ${statusFilter.toUpperCase()}`],
      [], // Empty row
    ];

    if (!isComp && singleData) {
      const headerRow = ['#', 'Location / Store', 'Working Hours', 'Labour Cost (KWD)', ...singleData.categories, 'Total (KWD)', '% Share'];
      rows.push(headerRow);

      if (groupingMode === 'batch') {
        filteredSingleBatches.forEach(batch => {
          rows.push([`LEDGER BATCH: ${batch.batch_name} (${batch.locations.length} Stores)`]);
          batch.locations.forEach((loc, idx) => {
            const share = singleData.grand_total > 0
              ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
              : '0.0';
            rows.push([
              idx + 1,
              loc.location_name,
              formatWorkHours(loc.allocated_hours),
              loc.labour_amount || 0,
              ...singleData.categories.map(c => loc.categories[c] || 0),
              loc.total_amount,
              `${share}%`
            ]);
          });
          rows.push([
            '',
            `Subtotal (${batch.batch_name})`,
            formatWorkHours(batch.totalHours),
            batch.totalLabour || 0,
            ...singleData.categories.map(c => batch.categorySubtotals[c] || 0),
            batch.subtotal,
            `${singleData.grand_total > 0 ? ((batch.subtotal / singleData.grand_total) * 100).toFixed(1) : '0.0'}%`
          ]);
          rows.push([]);
        });
      } else if (groupingMode === 'store_type') {
        singleLocationsByStoreType.forEach(typeGroup => {
          rows.push([`STORE TYPE: ${typeGroup.typeLabel} (${typeGroup.locations.length} Stores)`]);
          typeGroup.locations.forEach((loc, idx) => {
            const share = singleData.grand_total > 0
              ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
              : '0.0';
            rows.push([
              idx + 1,
              loc.location_name,
              formatWorkHours(loc.allocated_hours),
              loc.labour_amount || 0,
              ...singleData.categories.map(c => loc.categories[c] || 0),
              loc.total_amount,
              `${share}%`
            ]);
          });
          rows.push([
            '',
            `Subtotal (${typeGroup.typeLabel})`,
            formatWorkHours(typeGroup.totalHours),
            typeGroup.totalLabour || 0,
            ...singleData.categories.map(c => typeGroup.categorySubtotals[c] || 0),
            typeGroup.subtotal,
            `${singleData.grand_total > 0 ? ((typeGroup.subtotal / singleData.grand_total) * 100).toFixed(1) : '0.0'}%`
          ]);
          rows.push([]);
        });
      } else {
        filteredSingleLocations.forEach((loc, idx) => {
          const share = singleData.grand_total > 0
            ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
            : '0.0';
          rows.push([
            idx + 1,
            loc.location_name,
            formatWorkHours(loc.allocated_hours),
            loc.labour_amount || 0,
            ...singleData.categories.map(c => loc.categories[c] || 0),
            loc.total_amount,
            `${share}%`
          ]);
        });
      }

      // Total Row
      rows.push([
        '',
        'GRAND TOTAL',
        formatWorkHours(singleData.total_allocated_hours),
        singleData.labour_grand_total || 0,
        ...singleData.categories.map(c => singleData.category_totals[c] || 0),
        singleData.grand_total,
        '100.0%'
      ]);
    } else if (isComp && comparisonData) {
      const headerRow = [
        '#',
        'Location / Store',
        `Period 1 (${comparisonData.period1.month_label})`,
        `Period 2 (${comparisonData.period2.month_label})`,
        'Variance (KWD)',
        '% Change'
      ];
      rows.push(headerRow);

      if (groupingMode === 'batch') {
        filteredComparisonBatches.forEach(batch => {
          rows.push([`LEDGER BATCH: ${batch.batch_name} (${batch.locations.length} Stores)`]);
          batch.locations.forEach((loc, idx) => {
            rows.push([
              idx + 1,
              loc.location_name,
              loc.period1_amount,
              loc.period2_amount,
              loc.variance,
              `${loc.percent_change.toFixed(2)}%`
            ]);

            if (showDetailedCategoriesInComparison && loc.categories) {
              loc.categories.forEach(cat => {
                rows.push([
                  '',
                  `  - ${cat.category_name}`,
                  cat.period1_amount,
                  cat.period2_amount,
                  cat.variance,
                  `${cat.percent_change.toFixed(2)}%`
                ]);
              });
            }
          });
          rows.push([
            '',
            `Subtotal (${batch.batch_name})`,
            batch.p1Subtotal,
            batch.p2Subtotal,
            batch.variance,
            `${batch.pctChange.toFixed(2)}%`
          ]);
          rows.push([]);
        });
      } else if (groupingMode === 'store_type') {
        comparisonLocationsByStoreType.forEach(typeGroup => {
          rows.push([`STORE TYPE: ${typeGroup.typeLabel} (${typeGroup.locations.length} Stores)`]);
          typeGroup.locations.forEach((loc, idx) => {
            rows.push([
              idx + 1,
              loc.location_name,
              loc.period1_amount,
              loc.period2_amount,
              loc.variance,
              `${loc.percent_change.toFixed(2)}%`
            ]);

            if (showDetailedCategoriesInComparison && loc.categories) {
              loc.categories.forEach(cat => {
                rows.push([
                  '',
                  `  - ${cat.category_name}`,
                  cat.period1_amount,
                  cat.period2_amount,
                  cat.variance,
                  `${cat.percent_change.toFixed(2)}%`
                ]);
              });
            }
          });
          rows.push([
            '',
            `Subtotal (${typeGroup.typeLabel})`,
            typeGroup.p1Subtotal,
            typeGroup.p2Subtotal,
            typeGroup.variance,
            `${typeGroup.pctChange.toFixed(2)}%`
          ]);
          rows.push([]);
        });
      } else {
        filteredComparisonLocations.forEach((loc, idx) => {
          rows.push([
            idx + 1,
            loc.location_name,
            loc.period1_amount,
            loc.period2_amount,
            loc.variance,
            `${loc.percent_change.toFixed(2)}%`
          ]);

          if (showDetailedCategoriesInComparison && loc.categories) {
            loc.categories.forEach(cat => {
              rows.push([
                '',
                `  - ${cat.category_name}`,
                cat.period1_amount,
                cat.period2_amount,
                cat.variance,
                `${cat.percent_change.toFixed(2)}%`
              ]);
            });
          }
        });
      }

      const s = comparisonData.summary;
      rows.push([
        '',
        'GRAND TOTAL',
        s.period1_grand_total,
        s.period2_grand_total,
        s.variance,
        `${s.percent_change.toFixed(2)}%`
      ]);
    }

    // Signatures rows in Excel
    rows.push([]);
    rows.push(['SIGNATURES & VERIFICATIONS:']);
    rows.push(signaturesList.map(s => s.title));
    rows.push(signaturesList.map(s => s.name));

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Location Expense Report');

    const fileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative bg-surface dark:bg-dark-surface border border-outline-variant dark:border-dark-outline-variant w-full max-w-6xl max-h-[92vh] flex flex-col rounded-xl shadow-2xl overflow-hidden z-10">

        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-on-surface dark:text-dark-on-surface flex items-center gap-2">
                <span>Location Expense Statement</span>
              </h2>

            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsVerticalOrientation(!isVerticalOrientation)}
              className="h-8 px-2.5 rounded-md border border-outline-variant bg-surface dark:bg-dark-surface hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer select-none shadow-2xs"
              title="Toggle portrait (vertical) or landscape (horizontal) orientation"
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">{isVerticalOrientation ? 'Vertical' : 'Horizontal'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || (!singleData && !comparisonData)}
              className="h-8 px-2.5 rounded-md border border-outline-variant bg-surface dark:bg-dark-surface hover:bg-surface-container-high text-on-surface text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Print formatted statement with signatures"
            >
              <Printer className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || (!singleData && !comparisonData)}
              className="h-8 px-2.5 rounded-md border border-outline-variant bg-surface dark:bg-dark-surface hover:bg-surface-container-high text-on-surface text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Export report table to Excel"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <div className="h-4 w-px bg-outline-variant mx-0.5" />

            <button
              onClick={onClose}
              className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CONTROLS TOOLBAR: TABS, FILTERS & DATE RANGE PICKER */}
        <div className="px-4 py-2.5 border-b border-outline-variant dark:border-dark-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low shrink-0 space-y-2">

          {/* Row 1: Mode Switcher + Grouping Switcher + Filters + Search + Refresh */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Segmented Mode Switcher */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container dark:bg-dark-surface-container border border-outline-variant text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setReportMode('single')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${reportMode === 'single'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Monthly Statement</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportMode('comparison')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${reportMode === 'comparison'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>Comparison</span>
                </button>
              </div>

              {/* Segmented Grouping Switcher */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container dark:bg-dark-surface-container border border-outline-variant text-xs shadow-2xs">
                <span className="text-[10px] font-bold text-on-surface-variant px-1.5 uppercase tracking-wider">Group:</span>
                <button
                  type="button"
                  onClick={() => setGroupingMode('location')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${groupingMode === 'location'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  title="View flat location statement"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>By Location</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGroupingMode('batch')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${groupingMode === 'batch'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  title="Group locations by Ledger Batch"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>By Ledger Batch</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGroupingMode('store_type')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${groupingMode === 'store_type'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  title="Group locations by Store Type"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>By Store Type</span>
                </button>
              </div>
            </div>

            {/* Right: Batch Filter, Store Type Filter, Status Filter, Search, and Manual Refresh */}
            <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end flex-wrap">
              {/* Batch Filter */}
              <select
                value={selectedBatch}
                onChange={e => setSelectedBatch(e.target.value)}
                className="h-8 text-xs py-1 px-2.5 rounded-md bg-surface dark:bg-dark-surface border border-outline-variant text-on-surface focus:outline-none focus:border-primary font-medium"
                title="Filter by Ledger Batch"
              >
                <option value="all">All Batches</option>
                {batchOptions.map(b => (
                  <option key={b.batch_name} value={b.batch_name}>{b.batch_name}</option>
                ))}
              </select>

              {/* Store Type Filter */}
              <select
                value={selectedStoreType}
                onChange={e => setSelectedStoreType(e.target.value)}
                className="h-8 text-xs py-1 px-2.5 rounded-md bg-surface dark:bg-dark-surface border border-outline-variant text-on-surface focus:outline-none focus:border-primary font-medium"
                title="Filter by Store Type"
              >
                {STORE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="h-8 text-xs py-1 px-2.5 rounded-md bg-surface dark:bg-dark-surface border border-outline-variant text-on-surface focus:outline-none focus:border-primary font-medium"
              >
                <option value="approved">Approved</option>
                <option value="paid">Settled / Paid</option>
                <option value="all">All Expenses</option>
              </select>

              {/* Search Box */}
              <div className="relative w-36 sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-on-surface-variant pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter store..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full h-8 bg-surface dark:bg-dark-surface border border-outline-variant text-on-surface text-xs rounded-md pl-8 pr-7 focus:outline-none focus:border-primary placeholder:text-outline"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-2 text-outline hover:text-on-surface"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Refresh Action */}
              <button
                type="button"
                onClick={fetchReport}
                disabled={loading}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-outline-variant bg-surface dark:bg-dark-surface hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh report"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : 'text-on-surface-variant'}`} />
              </button>
            </div>
          </div>

          {/* Row 2: Date Selection via DateRangePickerCard + Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1.5 border-t border-outline-variant/50">
            {reportMode === 'single' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Date Range:
                </span>
                <DateRangePickerCard
                  fromDate={singleFromDate}
                  toDate={singleToDate}
                  onDateRangeChange={(from, to) => {
                    setSingleFromDate(from);
                    setSingleToDate(to);
                  }}
                  onReset={handleSetCurrentMonth}
                  hideDateType={true}
                />

                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={handleSetCurrentMonth}
                    className="h-8 px-2.5 text-[11px] rounded-md bg-surface dark:bg-dark-surface hover:bg-surface-container border border-outline-variant text-on-surface font-medium transition-colors cursor-pointer"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={handleSetLastMonth}
                    className="h-8 px-2.5 text-[11px] rounded-md bg-surface dark:bg-dark-surface hover:bg-surface-container border border-outline-variant text-on-surface font-medium transition-colors cursor-pointer"
                  >
                    Last Month
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Period 1 Picker */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">
                    P1
                  </span>
                  <DateRangePickerCard
                    fromDate={period1From}
                    toDate={period1To}
                    onDateRangeChange={(from, to) => {
                      setPeriod1From(from);
                      setPeriod1To(to);
                    }}
                    onReset={() => {
                      const now = new Date();
                      const range = getMonthRange(now.getFullYear(), now.getMonth() - 1);
                      setPeriod1From(range.from);
                      setPeriod1To(range.to);
                    }}
                    hideDateType={true}
                  />
                </div>

                <span className="text-xs text-outline font-semibold">vs</span>

                {/* Period 2 Picker */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase">
                    P2
                  </span>
                  <DateRangePickerCard
                    fromDate={period2From}
                    toDate={period2To}
                    onDateRangeChange={(from, to) => {
                      setPeriod2From(from);
                      setPeriod2To(to);
                    }}
                    onReset={() => {
                      const now = new Date();
                      const range = getMonthRange(now.getFullYear(), now.getMonth());
                      setPeriod2From(range.from);
                      setPeriod2To(range.to);
                    }}
                    hideDateType={true}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSetComparisonLastMonthVsCurrent}
                  className="h-8 px-2.5 text-[11px] rounded-md bg-surface dark:bg-dark-surface hover:bg-surface-container border border-outline-variant text-on-surface font-medium transition-colors cursor-pointer"
                >
                  Last vs Current
                </button>
              </div>
            )}

            {/* Active Period Indicator */}
            <div className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5 ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                {reportMode === 'single'
                  ? (singleData?.month_label || `${singleFromDate} to ${singleToDate}`)
                  : `${comparisonData?.period1.month_label || period1From} vs ${comparisonData?.period2.month_label || period2From}`}
              </span>
            </div>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE REPORT CONTAINER) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {loading ? (
            <div className="p-16 text-center text-on-surface-variant flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-semibold">Compiling financial data for locations...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-8 text-center border border-dashed border-red-300 dark:border-red-900/50 rounded-xl bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-xs font-bold">{errorMsg}</p>
            </div>
          ) : reportMode === 'single' ? (
            /* ================= SINGLE PERIOD REPORT VIEW ================= */
            singleData && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Stores</span>
                    <span className="text-lg sm:text-xl font-bold text-on-surface mt-0.5 block">
                      {singleData.total_locations_count}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Working Hours</span>
                    <span className="text-lg sm:text-xl font-bold text-sky-600 dark:text-sky-400 mt-0.5 block">
                      {formatWorkHours(singleData.total_allocated_hours)} <span className="text-xs font-normal text-on-surface-variant">hrs</span>
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block truncate" title="Labour Cost = Allocated Hours × Employee Rate">
                      Labour: {Number(singleData.labour_grand_total || 0).toFixed(3)} KWD
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Total Expense</span>
                    <span className="text-lg sm:text-xl font-bold text-primary mt-0.5 block">
                      {Number(singleData.grand_total).toFixed(3)} <span className="text-xs font-normal text-on-surface-variant">KWD</span>
                    </span>
                    <span className="text-[10px] text-on-surface-variant block truncate" title="Voucher direct expenses">
                      Vouchers: {Number(singleData.voucher_grand_total || 0).toFixed(3)} KWD
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Store Average</span>
                    <span className="text-lg sm:text-xl font-bold text-on-surface mt-0.5 block">
                      {singleData.total_locations_count > 0
                        ? (singleData.grand_total / singleData.total_locations_count).toFixed(3)
                        : '0.000'} <span className="text-xs font-normal text-on-surface-variant">KWD</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Period</span>
                    <span className="text-sm font-bold text-on-surface mt-0.5 block truncate">
                      {singleData.month_label}
                    </span>
                    <span className="text-[10px] text-on-surface-variant block truncate">
                      {singleData.from_date} — {singleData.to_date}
                    </span>
                  </div>
                </div>

                {/* Batches Quick Selector Strip */}
                {singleData.ledger_batches_summary && singleData.ledger_batches_summary.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low shadow-2xs">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-primary" /> Batches:
                    </span>
                    {singleData.ledger_batches_summary.map(b => {
                      const isSelected = selectedBatch === b.batch_name;
                      return (
                        <button
                          key={b.batch_name}
                          type="button"
                          onClick={() => {
                            setSelectedBatch(isSelected ? 'all' : b.batch_name);
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-primary text-on-primary border-primary shadow-xs'
                              : 'bg-surface dark:bg-dark-surface border-outline-variant text-on-surface hover:border-primary/50'
                          }`}
                          title={`Filter statement by ${b.batch_name}`}
                        >
                          <span>{b.batch_name}</span>
                          <span className="font-mono text-[11px] opacity-90">{b.total_amount.toFixed(3)} KWD</span>
                          <span className="text-[10px] px-1 rounded bg-black/10 dark:bg-white/10 font-bold">{b.locations_count} stores</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Printable Document Sheet Wrapper */}
                <div className={`border border-outline-variant rounded-lg bg-surface dark:bg-dark-surface p-4 sm:p-6 shadow-sm transition-all flex flex-col justify-between ${isVerticalOrientation ? 'max-w-4xl mx-auto min-h-[920px] ring-1 ring-outline-variant/40' : 'w-full min-h-[650px]'
                  }`}>
                  <div className="space-y-5">
                    {/* Document Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-primary pb-4">
                      <div className="flex items-center gap-3.5">
                        <img
                          src="/document_logo.png"
                          alt="Grand Hyper Logo"
                          className="h-16 w-16 sm:h-20 sm:w-20 object-contain shrink-0"
                          onError={(e: any) => { e.target.style.display = 'none'; }}
                        />
                        <div>
                          <h3 className="text-base sm:text-lg font-black text-primary uppercase tracking-tight">
                            Monthly Location Expense Report
                          </h3>
                          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">
                            Grand Hypermarket — {singleData?.department_name ? `${singleData.department_name} Operations` : 'Maintenance & Facilities Operations'}
                          </p>
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-xs font-bold text-on-surface block">
                          Period: {singleData.month_label}
                        </span>
                        <span className="text-[11px] text-outline block">
                          {singleData.from_date} to {singleData.to_date}
                        </span>
                      </div>
                    </div>

                    {/* Main Table */}
                    <div className="overflow-x-auto border border-outline-variant rounded">
                      <table className={`w-full text-left border-collapse ${isVerticalOrientation ? 'text-[11px]' : 'text-xs'}`}>
                        <thead>
                          <tr className="bg-surface-container-low border-b border-outline-variant text-[10.5px] font-semibold text-on-surface-variant uppercase">
                            <th className={`py-2 px-2.5 ${isVerticalOrientation ? 'w-8' : 'w-10'} text-center`}>#</th>
                            <th className={`py-2 px-2.5 ${isVerticalOrientation ? 'min-w-[140px]' : 'min-w-[180px]'}`}>Location / Store</th>
                            <th className={`py-2 px-2.5 text-right font-bold text-sky-600 dark:text-sky-400 ${isVerticalOrientation ? 'w-20' : 'w-24'}`}>Working Hours</th>
                            <th className={`py-2 px-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 ${isVerticalOrientation ? 'w-24' : 'w-28'}`}>Labour (KWD)</th>
                            {singleData.categories.map(cat => (
                              <th key={cat} className="py-2 px-2 text-right whitespace-nowrap">
                                {cat}
                              </th>
                            ))}
                            <th className={`py-2 px-2.5 text-right font-bold ${isVerticalOrientation ? 'w-24' : 'w-28'}`}>Total (KWD)</th>
                            <th className={`py-2 px-2.5 text-right ${isVerticalOrientation ? 'w-16' : 'w-20'}`}>% Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {groupingMode === 'batch' ? (
                            filteredSingleBatches.length === 0 ? (
                              <tr>
                                <td colSpan={singleData.categories.length + 6} className="py-8 text-center text-outline">
                                  No expenses found for the selected criteria.
                                </td>
                              </tr>
                            ) : (
                              filteredSingleBatches.map(batch => (
                                <React.Fragment key={batch.batch_name}>
                                  {/* LEDGER BATCH HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary">
                                    <td colSpan={singleData.categories.length + 6} className="py-2 px-3 text-xs tracking-wide">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Layers className="w-4 h-4 text-primary" />
                                          <span className="font-bold">LEDGER BATCH: {batch.batch_name}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {batch.locations.length} Stores ({batch.expense_count} expenses) | {formatWorkHours(batch.totalHours)} hrs | Labour: {Number(batch.totalLabour || 0).toFixed(3)} KWD
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-primary font-mono">
                                          Subtotal: {Number(batch.subtotal).toFixed(3)} KWD
                                        </span>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* BATCH LOCATION ROWS */}
                                  {batch.locations.map((loc, idx) => {
                                    const share = singleData.grand_total > 0
                                      ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
                                      : '0.0';
                                    return (
                                      <tr key={loc.store_id || idx} className="hover:bg-surface-container-high/50 transition-colors">
                                        <td className="py-1.5 px-2.5 text-center text-outline">{idx + 1}</td>
                                        <td className="py-1.5 px-2.5 font-semibold text-on-surface">
                                          {loc.location_name}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right font-semibold text-sky-600 dark:text-sky-400 font-mono">
                                          {formatWorkHours(loc.allocated_hours)}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                          {Number(loc.labour_amount || 0).toFixed(3)}
                                        </td>
                                        {singleData.categories.map(cat => {
                                          const val = loc.categories[cat];
                                          return (
                                            <td key={cat} className="py-1.5 px-2 text-right text-on-surface">
                                              {val ? Number(val).toFixed(3) : '-'}
                                            </td>
                                          );
                                        })}
                                        <td className="py-1.5 px-2.5 text-right font-bold text-on-surface">
                                          {Number(loc.total_amount).toFixed(3)}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right text-on-surface-variant font-medium">
                                          {share}%
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {/* BATCH SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={2} className="py-1.5 px-2.5 text-right text-on-surface uppercase font-bold">
                                      Subtotal ({batch.batch_name}):
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-sky-600 dark:text-sky-400 font-bold font-mono">
                                      {formatWorkHours(batch.totalHours)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                                      {Number(batch.totalLabour || 0).toFixed(3)}
                                    </td>
                                    {singleData.categories.map(cat => {
                                      const sum = batch.categorySubtotals[cat] || 0;
                                      return (
                                        <td key={cat} className="py-1.5 px-2 text-right text-on-surface font-mono">
                                          {sum > 0 ? sum.toFixed(3) : '-'}
                                        </td>
                                      );
                                    })}
                                    <td className="py-1.5 px-2.5 text-right text-primary font-bold font-mono">
                                      {Number(batch.subtotal).toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-on-surface-variant font-semibold">
                                      {singleData.grand_total > 0 ? ((batch.subtotal / singleData.grand_total) * 100).toFixed(1) : '0.0'}%
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          ) : groupingMode === 'store_type' ? (
                            singleLocationsByStoreType.length === 0 ? (
                              <tr>
                                <td colSpan={singleData.categories.length + 6} className="py-8 text-center text-outline">
                                  No expenses found for the selected criteria.
                                </td>
                              </tr>
                            ) : (
                              singleLocationsByStoreType.map(typeGroup => (
                                <React.Fragment key={typeGroup.typeLabel}>
                                  {/* STORE TYPE HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary">
                                    <td colSpan={singleData.categories.length + 6} className="py-2 px-3 text-xs tracking-wide">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Store className="w-4 h-4 text-primary" />
                                          <span className="font-bold">STORE TYPE: {typeGroup.typeLabel}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {typeGroup.locations.length} Stores | {formatWorkHours(typeGroup.totalHours)} hrs | Labour: {Number(typeGroup.totalLabour || 0).toFixed(3)} KWD
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-primary font-mono">
                                          Subtotal: {Number(typeGroup.subtotal).toFixed(3)} KWD
                                        </span>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* STORE TYPE LOCATION ROWS */}
                                  {typeGroup.locations.map((loc, idx) => {
                                    const share = singleData.grand_total > 0
                                      ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
                                      : '0.0';
                                    return (
                                      <tr key={loc.store_id || idx} className="hover:bg-surface-container-high/50 transition-colors">
                                        <td className="py-1.5 px-2.5 text-center text-outline">{idx + 1}</td>
                                        <td className="py-1.5 px-2.5 font-semibold text-on-surface">
                                          {loc.location_name}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right font-semibold text-sky-600 dark:text-sky-400 font-mono">
                                          {formatWorkHours(loc.allocated_hours)}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                          {Number(loc.labour_amount || 0).toFixed(3)}
                                        </td>
                                        {singleData.categories.map(cat => {
                                          const val = loc.categories[cat];
                                          return (
                                            <td key={cat} className="py-1.5 px-2 text-right text-on-surface">
                                              {val ? Number(val).toFixed(3) : '-'}
                                            </td>
                                          );
                                        })}
                                        <td className="py-1.5 px-2.5 text-right font-bold text-on-surface">
                                          {Number(loc.total_amount).toFixed(3)}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right text-on-surface-variant font-medium">
                                          {share}%
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {/* STORE TYPE SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={2} className="py-1.5 px-2.5 text-right text-on-surface uppercase font-bold">
                                      Subtotal ({typeGroup.typeLabel}):
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-sky-600 dark:text-sky-400 font-bold font-mono">
                                      {formatWorkHours(typeGroup.totalHours)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                                      {Number(typeGroup.totalLabour || 0).toFixed(3)}
                                    </td>
                                    {singleData.categories.map(cat => {
                                      const sum = typeGroup.categorySubtotals[cat] || 0;
                                      return (
                                        <td key={cat} className="py-1.5 px-2 text-right text-on-surface font-mono">
                                          {sum > 0 ? sum.toFixed(3) : '-'}
                                        </td>
                                      );
                                    })}
                                    <td className="py-1.5 px-2.5 text-right text-primary font-bold font-mono">
                                      {Number(typeGroup.subtotal).toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-on-surface-variant font-semibold">
                                      {singleData.grand_total > 0 ? ((typeGroup.subtotal / singleData.grand_total) * 100).toFixed(1) : '0.0'}%
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          ) : (
                            filteredSingleLocations.length === 0 ? (
                              <tr>
                                <td colSpan={singleData.categories.length + 6} className="py-8 text-center text-outline">
                                  No expenses found for the selected period.
                                </td>
                              </tr>
                            ) : (
                              filteredSingleLocations.map((loc, idx) => {
                                const share = singleData.grand_total > 0
                                  ? ((loc.total_amount / singleData.grand_total) * 100).toFixed(1)
                                  : '0.0';
                                return (
                                  <tr key={loc.store_id || idx} className="hover:bg-surface-container-high/50 transition-colors">
                                    <td className="py-1.5 px-2.5 text-center text-outline">{idx + 1}</td>
                                    <td className="py-1.5 px-2.5 font-semibold text-on-surface">
                                      {loc.location_name}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-semibold text-sky-600 dark:text-sky-400 font-mono">
                                      {formatWorkHours(loc.allocated_hours)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                      {Number(loc.labour_amount || 0).toFixed(3)}
                                    </td>
                                    {singleData.categories.map(cat => {
                                      const val = loc.categories[cat];
                                      return (
                                        <td key={cat} className="py-1.5 px-2 text-right text-on-surface">
                                          {val ? Number(val).toFixed(3) : '-'}
                                        </td>
                                      );
                                    })}
                                    <td className="py-1.5 px-2.5 text-right font-bold text-on-surface">
                                      {Number(loc.total_amount).toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-on-surface-variant font-medium">
                                      {share}%
                                    </td>
                                  </tr>
                                );
                              })
                            )
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-surface-container-high/80 font-bold border-t-2 border-outline-variant text-xs">
                            <td colSpan={2} className="py-2 px-2.5 text-on-surface uppercase">Grand Total</td>
                            <td className="py-2 px-2.5 text-right text-sky-600 dark:text-sky-400 text-sm font-black font-mono">
                              {formatWorkHours(singleData.total_allocated_hours)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-emerald-600 dark:text-emerald-400 text-sm font-black font-mono">
                              {Number(singleData.labour_grand_total || 0).toFixed(3)}
                            </td>
                            {singleData.categories.map(cat => (
                              <td key={cat} className="py-2 px-2 text-right text-on-surface">
                                {Number(singleData.category_totals[cat] || 0).toFixed(3)}
                              </td>
                            ))}
                            <td className="py-2 px-2.5 text-right text-primary text-sm font-black">
                              {Number(singleData.grand_total).toFixed(3)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-on-surface font-semibold">100.0%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* 7-Tier Signatures Block Pinned to Bottom */}
                  <div className="pt-6 border-t border-outline-variant/60 mt-auto">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-3">
                      Approvals & Verifications Workflow:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                      {signaturesList.map((sig, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-2.5 rounded border border-outline-variant bg-surface-container dark:bg-dark-surface-container text-center flex flex-col justify-between min-h-[75px]"
                        >
                          <span className="text-[10px] font-bold text-on-surface block uppercase">
                            {sig.title}
                          </span>
                          <div className="border-t border-dashed border-outline-variant my-1" />
                          <span className="text-[10px] text-outline font-medium block truncate" title={sig.name}>
                            {sig.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* ================= PERIOD COMPARISON REPORT VIEW ================= */
            comparisonData && (
              <div className="space-y-6">
                {/* Comparison KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-primary uppercase tracking-wider block truncate">
                      P1 ({comparisonData.period1.month_label})
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-on-surface mt-0.5 block">
                      {Number(comparisonData.summary.period1_grand_total).toFixed(3)} <span className="text-xs font-normal text-on-surface-variant">KWD</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block truncate">
                      P2 ({comparisonData.period2.month_label})
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-primary mt-0.5 block">
                      {Number(comparisonData.summary.period2_grand_total).toFixed(3)} <span className="text-xs font-normal text-on-surface-variant">KWD</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Net Variance</span>
                    <span className={`text-lg sm:text-xl font-bold mt-0.5 block ${comparisonData.summary.variance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {comparisonData.summary.variance > 0 ? '+' : ''}{Number(comparisonData.summary.variance).toFixed(3)} <span className="text-xs font-normal text-on-surface-variant">KWD</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-outline-variant bg-surface-container dark:bg-dark-surface-container shadow-2xs">
                    <span className="text-[10.5px] font-semibold text-on-surface-variant uppercase tracking-wider block">Change</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {comparisonData.summary.variance > 0 ? (
                        <TrendingUp className="w-4 h-4 text-red-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-emerald-500" />
                      )}
                      <span className={`text-lg sm:text-xl font-black ${comparisonData.summary.variance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {comparisonData.summary.variance > 0 ? '+' : ''}{comparisonData.summary.percent_change.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Batches Quick Selector Strip for Comparison */}
                {comparisonData.ledger_batches_summary && comparisonData.ledger_batches_summary.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-outline-variant bg-surface-container-low dark:bg-dark-surface-container-low shadow-2xs">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-primary" /> Batches:
                    </span>
                    {comparisonData.ledger_batches_summary.map(b => {
                      const isSelected = selectedBatch === b.batch_name;
                      return (
                        <button
                          key={b.batch_name}
                          type="button"
                          onClick={() => {
                            setSelectedBatch(isSelected ? 'all' : b.batch_name);
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-primary text-on-primary border-primary shadow-xs'
                              : 'bg-surface dark:bg-dark-surface border-outline-variant text-on-surface hover:border-primary/50'
                          }`}
                          title={`Filter comparison by ${b.batch_name}`}
                        >
                          <span>{b.batch_name}</span>
                          <span className="font-mono text-[11px] opacity-90">P2: {b.period2_amount.toFixed(3)} KWD</span>
                          <span className={`text-[10px] font-bold ${b.variance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {b.variance >= 0 ? '+' : ''}{b.variance.toFixed(3)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Minimal Comparison Sheet Wrapper */}
                <div className={`border border-outline-variant rounded-lg bg-surface dark:bg-dark-surface p-4 sm:p-6 shadow-sm transition-all flex flex-col justify-between ${isVerticalOrientation ? 'max-w-4xl mx-auto min-h-[920px] ring-1 ring-outline-variant/40' : 'w-full min-h-[650px]'
                  }`}>
                  <div className="space-y-5">
                    {/* Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-primary pb-4">
                      <div className="flex items-center gap-3.5">
                        <img
                          src="/document_logo.png"
                          alt="Grand Hyper Logo"
                          className="h-16 w-16 sm:h-20 sm:w-20 object-contain shrink-0"
                          onError={(e: any) => { e.target.style.display = 'none'; }}
                        />
                        <div>
                          <h3 className="text-base sm:text-lg font-black text-primary uppercase tracking-tight">
                            Location Expense Comparison Statement
                          </h3>
                          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">
                            {comparisonData?.department_name ? `${comparisonData.department_name} — ` : ''}{comparisonData.period1.month_label} vs {comparisonData.period2.month_label}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDetailedCategoriesInComparison(prev => !prev)}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer ${showDetailedCategoriesInComparison
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'bg-surface-container border-outline text-on-surface-variant hover:text-on-surface'
                            }`}
                        >
                          {showDetailedCategoriesInComparison ? 'Hide Categories' : 'Show Categories'}
                        </button>
                      </div>
                    </div>

                    {/* Comparison Table */}
                    <div className="overflow-x-auto border border-outline-variant rounded">
                      <table className={`w-full text-left border-collapse ${isVerticalOrientation ? 'text-[11px]' : 'text-xs'}`}>
                        <thead>
                          <tr className="bg-surface-container-low border-b border-outline-variant text-[10.5px] font-semibold text-on-surface-variant uppercase">
                            <th className={`py-2 px-2.5 ${isVerticalOrientation ? 'w-8' : 'w-10'} text-center`}>#</th>
                            <th className={`py-2 px-2.5 ${isVerticalOrientation ? 'min-w-[150px]' : 'min-w-[200px]'}`}>Location / Store</th>
                            <th className="py-2 px-2.5 text-right font-semibold">
                              Period 1 ({comparisonData.period1.month_label})
                            </th>
                            <th className="py-2 px-2.5 text-right font-semibold">
                              Period 2 ({comparisonData.period2.month_label})
                            </th>
                            <th className={`py-2 px-2.5 text-right font-bold ${isVerticalOrientation ? 'w-28' : 'w-32'}`}>Variance (KWD)</th>
                            <th className={`py-2 px-2.5 text-right font-bold ${isVerticalOrientation ? 'w-20' : 'w-24'}`}>% Change</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {groupingMode === 'batch' ? (
                            filteredComparisonBatches.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-outline">
                                  No comparative data found.
                                </td>
                              </tr>
                            ) : (
                              filteredComparisonBatches.map(batch => (
                                <React.Fragment key={batch.batch_name}>
                                  {/* LEDGER BATCH HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary">
                                    <td colSpan={6} className="py-2 px-3 text-xs tracking-wide">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Layers className="w-4 h-4 text-primary" />
                                          <span className="font-bold">LEDGER BATCH: {batch.batch_name}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {batch.locations.length} Stores
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-mono">
                                          <span>P1: {batch.p1Subtotal.toFixed(3)}</span>
                                          <span>P2: {batch.p2Subtotal.toFixed(3)}</span>
                                          <span className={batch.variance > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                                            Var: {batch.variance >= 0 ? '+' : ''}{batch.variance.toFixed(3)}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* BATCH LOCATION ROWS */}
                                  {batch.locations.map((loc, idx) => {
                                    const isUp = loc.variance > 0;
                                    const isExpanded = expandedLocations[`${batch.batch_name}_${loc.store_id}`] || showDetailedCategoriesInComparison;

                                    return (
                                      <React.Fragment key={loc.store_id || idx}>
                                        <tr
                                          className="hover:bg-surface-container-high/50 transition-colors cursor-pointer"
                                          onClick={() => toggleLocationExpand(`${batch.batch_name}_${loc.store_id}`)}
                                        >
                                          <td className="py-1.5 px-2.5 text-center text-outline">{idx + 1}</td>
                                          <td className="py-1.5 px-2.5 font-bold text-on-surface flex items-center gap-2">
                                            <span className="text-outline">
                                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                            </span>
                                            <span>{loc.location_name}</span>
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right text-on-surface">
                                            {Number(loc.period1_amount).toFixed(3)}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right font-semibold text-on-surface">
                                            {Number(loc.period2_amount).toFixed(3)}
                                          </td>
                                          <td className={`py-1.5 px-2.5 text-right font-bold ${isUp ? 'text-red-500' : (loc.variance < 0 ? 'text-emerald-500' : 'text-on-surface')}`}>
                                            {isUp ? '+' : ''}{Number(loc.variance).toFixed(3)}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right">
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] font-extrabold ${isUp ? 'bg-red-500/10 text-red-600' : (loc.variance < 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-outline')}`}>
                                              {isUp ? '+' : ''}{loc.percent_change.toFixed(2)}%
                                            </span>
                                          </td>
                                        </tr>

                                        {/* Expanded Category Rows for this Location in Batch */}
                                        {isExpanded && loc.categories && (
                                          loc.categories.map((cat, cIdx) => {
                                            const cUp = cat.variance > 0;
                                            return (
                                              <tr key={cIdx} className="bg-surface-container-low/40 text-[10.5px]">
                                                <td className="py-1 px-2.5 text-center text-outline"></td>
                                                <td className="py-1 px-2.5 pl-8 text-on-surface-variant font-medium">
                                                  └ {cat.category_name}
                                                </td>
                                                <td className="py-1 px-2.5 text-right text-outline">
                                                  {Number(cat.period1_amount).toFixed(3)}
                                                </td>
                                                <td className="py-1 px-2.5 text-right text-on-surface-variant">
                                                  {Number(cat.period2_amount).toFixed(3)}
                                                </td>
                                                <td className={`py-1 px-2.5 text-right font-medium ${cUp ? 'text-red-500' : (cat.variance < 0 ? 'text-emerald-500' : 'text-outline')}`}>
                                                  {cUp ? '+' : ''}{Number(cat.variance).toFixed(3)}
                                                </td>
                                                <td className="py-1 px-2.5 text-right text-outline">
                                                  {cUp ? '+' : ''}{cat.percent_change.toFixed(1)}%
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </React.Fragment>
                                    );
                                  })}

                                  {/* BATCH SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={2} className="py-1.5 px-2.5 text-right text-on-surface uppercase font-bold">
                                      Subtotal ({batch.batch_name}):
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-mono text-on-surface">
                                      {batch.p1Subtotal.toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-mono text-primary font-bold">
                                      {batch.p2Subtotal.toFixed(3)}
                                    </td>
                                    <td className={`py-1.5 px-2.5 text-right font-mono font-bold ${batch.variance > 0 ? 'text-red-500' : (batch.variance < 0 ? 'text-emerald-500' : 'text-on-surface')}`}>
                                      {batch.variance >= 0 ? '+' : ''}{batch.variance.toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] font-bold ${batch.variance > 0 ? 'bg-red-500/10 text-red-600' : (batch.variance < 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-outline')}`}>
                                        {batch.variance >= 0 ? '+' : ''}{batch.pctChange.toFixed(1)}%
                                      </span>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          ) : groupingMode === 'store_type' ? (
                            comparisonLocationsByStoreType.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-outline">
                                  No comparative data found.
                                </td>
                              </tr>
                            ) : (
                              comparisonLocationsByStoreType.map(typeGroup => (
                                <React.Fragment key={typeGroup.typeLabel}>
                                  {/* STORE TYPE HEADER ROW */}
                                  <tr className="bg-primary/10 border-y border-primary/25 font-bold text-primary">
                                    <td colSpan={6} className="py-2 px-3 text-xs tracking-wide">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Store className="w-4 h-4 text-primary" />
                                          <span className="font-bold">STORE TYPE: {typeGroup.typeLabel}</span>
                                          <span className="text-[11px] font-normal text-on-surface-variant">
                                            — {typeGroup.locations.length} Stores
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs font-mono">
                                          <span>P1: {typeGroup.p1Subtotal.toFixed(3)}</span>
                                          <span>P2: {typeGroup.p2Subtotal.toFixed(3)}</span>
                                          <span className={typeGroup.variance > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                                            Var: {typeGroup.variance >= 0 ? '+' : ''}{typeGroup.variance.toFixed(3)}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* STORE TYPE LOCATION ROWS */}
                                  {typeGroup.locations.map((loc, idx) => {
                                    const isUp = loc.variance > 0;
                                    const isExpanded = expandedLocations[loc.store_id] || showDetailedCategoriesInComparison;

                                    return (
                                      <React.Fragment key={loc.store_id || idx}>
                                        <tr
                                          className="hover:bg-surface-container-high/50 transition-colors cursor-pointer"
                                          onClick={() => toggleLocationExpand(loc.store_id)}
                                        >
                                          <td className="py-1.5 px-2.5 text-center text-outline">{idx + 1}</td>
                                          <td className="py-1.5 px-2.5 font-bold text-on-surface flex items-center gap-2">
                                            <span className="text-outline">
                                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                            </span>
                                            <span>{loc.location_name}</span>
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right text-on-surface">
                                            {Number(loc.period1_amount).toFixed(3)}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right font-semibold text-on-surface">
                                            {Number(loc.period2_amount).toFixed(3)}
                                          </td>
                                          <td className={`py-1.5 px-2.5 text-right font-bold ${isUp ? 'text-red-500' : (loc.variance < 0 ? 'text-emerald-500' : 'text-on-surface')}`}>
                                            {isUp ? '+' : ''}{Number(loc.variance).toFixed(3)}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right">
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] font-extrabold ${isUp ? 'bg-red-500/10 text-red-600' : (loc.variance < 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-outline')
                                              }`}>
                                              {isUp ? '+' : ''}{loc.percent_change.toFixed(2)}%
                                            </span>
                                          </td>
                                        </tr>

                                        {/* Expanded Category Rows for this Location */}
                                        {isExpanded && loc.categories && (
                                          loc.categories.map((cat, cIdx) => {
                                            const cUp = cat.variance > 0;
                                            return (
                                              <tr key={cIdx} className="bg-surface-container-low/40 text-[10.5px]">
                                                <td className="py-1 px-2.5 text-center text-outline"></td>
                                                <td className="py-1 px-2.5 pl-8 text-on-surface-variant font-medium">
                                                  └ {cat.category_name}
                                                </td>
                                                <td className="py-1 px-2.5 text-right text-outline">
                                                  {Number(cat.period1_amount).toFixed(3)}
                                                </td>
                                                <td className="py-1 px-2.5 text-right text-on-surface-variant">
                                                  {Number(cat.period2_amount).toFixed(3)}
                                                </td>
                                                <td className={`py-1 px-2.5 text-right font-medium ${cUp ? 'text-red-500' : (cat.variance < 0 ? 'text-emerald-500' : 'text-outline')}`}>
                                                  {cUp ? '+' : ''}{Number(cat.variance).toFixed(3)}
                                                </td>
                                                <td className="py-1 px-2.5 text-right text-outline">
                                                  {cUp ? '+' : ''}{cat.percent_change.toFixed(1)}%
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </React.Fragment>
                                    );
                                  })}

                                  {/* STORE TYPE SUBTOTAL ROW */}
                                  <tr className="bg-surface-container-high/60 font-bold border-t border-b border-outline-variant text-[11px]">
                                    <td colSpan={2} className="py-1.5 px-2.5 text-right text-on-surface uppercase font-bold">
                                      Subtotal ({typeGroup.typeLabel}):
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-mono text-on-surface">
                                      {typeGroup.p1Subtotal.toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-mono text-primary font-bold">
                                      {typeGroup.p2Subtotal.toFixed(3)}
                                    </td>
                                    <td className={`py-1.5 px-2.5 text-right font-mono font-bold ${typeGroup.variance > 0 ? 'text-red-500' : (typeGroup.variance < 0 ? 'text-emerald-500' : 'text-on-surface')}`}>
                                      {typeGroup.variance >= 0 ? '+' : ''}{typeGroup.variance.toFixed(3)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] font-bold ${typeGroup.variance > 0 ? 'bg-red-500/10 text-red-600' : (typeGroup.variance < 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-outline')}`}>
                                        {typeGroup.variance >= 0 ? '+' : ''}{typeGroup.pctChange.toFixed(1)}%
                                      </span>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))
                            )
                          ) : (
                            filteredComparisonLocations.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-outline">
                                  No comparative data found.
                                </td>
                              </tr>
                            ) : (
                              filteredComparisonLocations.map((loc, idx) => {
                                const isUp = loc.variance > 0;
                                const isExpanded = expandedLocations[loc.store_id] || showDetailedCategoriesInComparison;

                                return (
                                  <React.Fragment key={loc.store_id || idx}>
                                    <tr
                                      className="hover:bg-surface-container-high/50 transition-colors cursor-pointer"
                                      onClick={() => toggleLocationExpand(loc.store_id)}
                                    >
                                      <td className="py-1.5 px-2.5 text-center text-outline">{idx + 1}</td>
                                      <td className="py-1.5 px-2.5 font-bold text-on-surface flex items-center gap-2">
                                        <span className="text-outline">
                                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        </span>
                                        <span>{loc.location_name}</span>
                                      </td>
                                      <td className="py-1.5 px-2.5 text-right text-on-surface">
                                        {Number(loc.period1_amount).toFixed(3)}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-right font-semibold text-on-surface">
                                        {Number(loc.period2_amount).toFixed(3)}
                                      </td>
                                      <td className={`py-1.5 px-2.5 text-right font-bold ${isUp ? 'text-red-500' : (loc.variance < 0 ? 'text-emerald-500' : 'text-on-surface')}`}>
                                        {isUp ? '+' : ''}{Number(loc.variance).toFixed(3)}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-right">
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] font-extrabold ${isUp ? 'bg-red-500/10 text-red-600' : (loc.variance < 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-outline')
                                          }`}>
                                          {isUp ? '+' : ''}{loc.percent_change.toFixed(2)}%
                                        </span>
                                      </td>
                                    </tr>

                                    {/* Expanded Category Rows for this Location */}
                                    {isExpanded && loc.categories && (
                                      loc.categories.map((cat, cIdx) => {
                                        const cUp = cat.variance > 0;
                                        return (
                                          <tr key={cIdx} className="bg-surface-container-low/40 text-[10.5px]">
                                            <td className="py-1 px-2.5 text-center text-outline"></td>
                                            <td className="py-1 px-2.5 pl-8 text-on-surface-variant font-medium">
                                              └ {cat.category_name}
                                            </td>
                                            <td className="py-1 px-2.5 text-right text-outline">
                                              {Number(cat.period1_amount).toFixed(3)}
                                            </td>
                                            <td className="py-1 px-2.5 text-right text-on-surface-variant">
                                              {Number(cat.period2_amount).toFixed(3)}
                                            </td>
                                            <td className={`py-1 px-2.5 text-right font-medium ${cUp ? 'text-red-500' : (cat.variance < 0 ? 'text-emerald-500' : 'text-outline')}`}>
                                              {cUp ? '+' : ''}{Number(cat.variance).toFixed(3)}
                                            </td>
                                            <td className="py-1 px-2.5 text-right text-outline">
                                              {cUp ? '+' : ''}{cat.percent_change.toFixed(1)}%
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </React.Fragment>
                                );
                              })
                            )
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-surface-container-high/80 font-bold border-t-2 border-outline-variant text-xs">
                            <td colSpan={2} className="py-2 px-2.5 text-on-surface uppercase">Grand Total</td>
                            <td className="py-2 px-2.5 text-right text-on-surface">
                              {Number(comparisonData.summary.period1_grand_total).toFixed(3)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-primary text-sm font-black">
                              {Number(comparisonData.summary.period2_grand_total).toFixed(3)}
                            </td>
                            <td className={`py-2 px-2.5 text-right font-black ${comparisonData.summary.variance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {comparisonData.summary.variance > 0 ? '+' : ''}{Number(comparisonData.summary.variance).toFixed(3)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-extrabold">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] ${comparisonData.summary.variance > 0 ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'
                                }`}>
                                {comparisonData.summary.variance > 0 ? '+' : ''}{comparisonData.summary.percent_change.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* 7-Tier Signatures Block Pinned to Bottom */}
                  <div className="pt-6 border-t border-outline-variant/60 mt-auto">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-3">
                      Approvals & Verifications Workflow:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                      {signaturesList.map((sig, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-2.5 rounded border border-outline-variant bg-surface-container dark:bg-dark-surface-container text-center flex flex-col justify-between min-h-[75px]"
                        >
                          <span className="text-[10px] font-bold text-on-surface block uppercase">
                            {sig.title}
                          </span>
                          <div className="border-t border-dashed border-outline-variant my-1" />
                          <span className="text-[10px] text-outline font-medium block truncate" title={sig.name}>
                            {sig.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-4 py-2.5 border-t border-outline-variant dark:border-dark-outline-variant bg-surface-container dark:bg-dark-surface-container flex items-center justify-between shrink-0">
          <div className="text-xs text-on-surface-variant font-medium">
            {reportMode === 'single'
              ? `${filteredSingleLocations.length} store${filteredSingleLocations.length === 1 ? '' : 's'} displayed`
              : `${filteredComparisonLocations.length} store${filteredComparisonLocations.length === 1 ? '' : 's'} displayed`}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

